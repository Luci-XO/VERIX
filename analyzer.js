const OpenAI = require('openai');
require('dotenv').config();

// --- CONFIGURATION ---
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const NUTRITION_DATABASE = {
    limits: {
        sugar: { threshold: 10, unit: 'g', penalty: 20, warning: "Excessive Sugar" },
        sodium: { threshold: 200, unit: 'mg', penalty: 15, warning: "High Sodium" },
        saturatedFat: { threshold: 5, unit: 'g', penalty: 10, warning: "High Saturated Fat" },
        transFat: { threshold: 0, unit: 'g', penalty: 30, warning: "Contains Trans Fats" }
    },
    harmfulAdditives: [
        { name: "High Fructose Corn Syrup", penalty: 10, category: "Sweetener" },
        { name: "Red 40", penalty: 10, category: "Artificial Color" },
        { name: "Blue 1", penalty: 10, category: "Artificial Color" },
        { name: "Hydrogenated", penalty: 30, category: "Trans Fat Source" },
        { name: "Palm Oil", penalty: 5, category: "Environmental/Health" }
    ],
    beneficialNutrients: [
        { name: "Fiber", min: 3, unit: 'g', bonus: 5, benefit: "Good Source of Fiber" },
        { name: "Protein", min: 5, unit: 'g', bonus: 5, benefit: "High Protein" }
    ]
};

// --- HEALTH ALGORITHM ---
function calculateHealthRisk(data) {
    let score = 0;
    let warnings = [];
    let benefits = [];
    const nutrition = data.nutrition || {};
    
    const ingStr = Array.isArray(data.ingredients) ? data.ingredients.join(", ").toLowerCase() : "";

    // 1. Quantitative Checks
    if (nutrition.sugar > NUTRITION_DATABASE.limits.sugar.threshold) {
        score += NUTRITION_DATABASE.limits.sugar.penalty;
        warnings.push(`${NUTRITION_DATABASE.limits.sugar.warning} (${nutrition.sugar}g)`);
    }
    if (nutrition.sodium > NUTRITION_DATABASE.limits.sodium.threshold) {
        score += NUTRITION_DATABASE.limits.sodium.penalty;
        warnings.push(`${NUTRITION_DATABASE.limits.sodium.warning} (${nutrition.sodium}mg)`);
    }

    // 2. Qualitative Checks
    NUTRITION_DATABASE.harmfulAdditives.forEach(add => {
        if (ingStr.includes(add.name.toLowerCase())) {
            score += add.penalty;
            warnings.push(`Contains ${add.name}`);
        }
    });

    // 3. Benefits
    if (nutrition.fiber >= NUTRITION_DATABASE.beneficialNutrients[0].min) {
        score -= NUTRITION_DATABASE.beneficialNutrients[0].bonus;
        benefits.push(`Good Source of Fiber (${nutrition.fiber}g)`);
    }
    if (nutrition.protein >= NUTRITION_DATABASE.beneficialNutrients[1].min) {
        score -= NUTRITION_DATABASE.beneficialNutrients[1].bonus;
        benefits.push(`High Protein (${nutrition.protein}g)`);
    }

    // 4. Finalize
    score = Math.max(0, Math.min(100, score));
    
    return {
        ...data,
        analysis: {
            score,
            riskLevel: score >= 60 ? "High" : (score >= 30 ? "Medium" : "Low"),
            warnings,
            benefits,
            recommendation: score < 30 ? "Safe to Eat" : "Limit Consumption"
        }
    };
}

// --- TEXT ANALYZER (OFFICIAL API) ---
async function analyzeText(productName) {
    try {
        console.log(`🌐 Searching API for: ${productName}...`);
        
        const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(productName)}&search_simple=1&action=process&json=1`;
        
        const response = await fetch(url);
        const data = await response.json();

        if (!data.products || data.products.length === 0) {
            return { productName: "Product Not Found", ingredients: ["No data found"], nutrition: {} };
        }

        const product = data.products[0];
        const nutriments = product.nutriments || {};

        // Helper to safely find nutrient values
        const getVal = (keys) => {
            for (let key of keys) {
                if (nutriments[key] !== undefined && nutriments[key] !== null) {
                    return parseFloat(nutriments[key]);
                }
            }
            return 0;
        };

        const rawData = {
            productName: product.product_name || productName,
            ingredients: (product.ingredients_text || "Ingredients not listed").split(',').map(i => i.trim()),
            nutrition: {
                sugar: getVal(['sugars_100g', 'sugars_value']),
                sodium: getVal(['salt_100g', 'sodium_100g']) * 400, // Conversion if salt is used
                transFat: getVal(['trans-fat_100g', 'trans_fat_100g', 'trans-fat_value']),
                fiber: getVal(['fiber_100g', 'fiber_value']),
                protein: getVal(['proteins_100g', 'proteins_value'])
            }
        };

        return calculateHealthRisk(rawData);

    } catch (error) {
        console.error("API Error:", error);
        return { error: error.message };
    }
}

// --- IMAGE ANALYZER (OPENAI) ---
async function analyzeImage(base64Image) {
    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: "Extract product name, ingredients, and nutrition (sugar, sodium, transFat, fiber, protein) from this image. Return JSON ONLY: { productName, ingredients: [], nutrition: { sugar, sodium, transFat, fiber, protein } }" },
                        { type: "image_url", image_url: { url: base64Image } }
                    ]
                }
            ],
            response_format: { type: "json_object" }
        });

        const rawData = JSON.parse(response.choices[0].message.content);
        return calculateHealthRisk(rawData);
    } catch (error) {
        console.error("AI Vision Error:", error);
        return { error: "Failed to analyze image" };
    }
}

module.exports = { analyzeText, analyzeImage, NUTRITION_DATABASE };