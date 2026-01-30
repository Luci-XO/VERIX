/**
 * --- REFERENCE DATABASE (FDA/WHO Guidelines) ---
 * Configurable limits and lists of flagged ingredients.
 */
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
        { name: "Yellow 5", penalty: 10, category: "Artificial Color" },
        { name: "Yellow 6", penalty: 10, category: "Artificial Color" },
        { name: "Sodium Benzoate", penalty: 10, category: "Preservative" },
        { name: "Potassium Sorbate", penalty: 10, category: "Preservative" },
        { name: "Aspartame", penalty: 10, category: "Artificial Sweetener" },
        { name: "Hydrogenated Oil", penalty: 30, category: "Trans Fat Source" }, // severe penalty
        { name: "Monosodium Glutamate", penalty: 5, category: "Flavor Enhancer" }
    ],
    beneficialNutrients: [
        { name: "Fiber", min: 3, unit: 'g', bonus: 5, benefit: "Good Source of Fiber" },
        { name: "Protein", min: 5, unit: 'g', bonus: 5, benefit: "High Protein" },
        { name: "Whole Grain", keyword: "whole grain", bonus: 5, benefit: "Contains Whole Grains" }
    ]
};

/**
 * --- MAIN ALGORITHM ---
 * Calculates risk score based on ingredients and nutritional values.
 * * @param {Object} productData - { ingredients: string[], nutrition: { sugar: number, sodium: number, ... } }
 * @returns {Object} JSON Result
 */
function calculateHealthRisk(productData) {
    let score = 0;
    let warnings = [];
    let benefits = [];
    
    const { nutrition, ingredients } = productData;
    
    // Normalize Ingredients: Convert array to lower-case string for easy searching
    const ingredientString = Array.isArray(ingredients) 
        ? ingredients.join(", ").toLowerCase() 
        : (ingredients || "").toLowerCase();

    // 1. NUTRIENT CHECKS (Quantitative)
    // Sugar
    if (nutrition.sugar > NUTRITION_DATABASE.limits.sugar.threshold) {
        score += NUTRITION_DATABASE.limits.sugar.penalty;
        warnings.push(`${NUTRITION_DATABASE.limits.sugar.warning} (${nutrition.sugar}g)`);
    }

    // Sodium
    if (nutrition.sodium > NUTRITION_DATABASE.limits.sodium.threshold) {
        score += NUTRITION_DATABASE.limits.sodium.penalty;
        warnings.push(`${NUTRITION_DATABASE.limits.sodium.warning} (${nutrition.sodium}mg)`);
    }

    // Trans Fats (Check nutrition value AND keyword search)
    if (nutrition.transFat > 0 || ingredientString.includes("partially hydrogenated")) {
        score += NUTRITION_DATABASE.limits.transFat.penalty;
        warnings.push(NUTRITION_DATABASE.limits.transFat.warning);
    }

    // 2. INGREDIENT SCANNING (Qualitative)
    NUTRITION_DATABASE.harmfulAdditives.forEach(additive => {
        if (ingredientString.includes(additive.name.toLowerCase())) {
            score += additive.penalty;
            warnings.push(`Contains ${additive.name} (${additive.category})`);
        }
    });

    // 3. BENEFIT CHECKS (Bonus Points)
    // Fiber
    if (nutrition.fiber >= NUTRITION_DATABASE.beneficialNutrients[0].min) {
        score -= NUTRITION_DATABASE.beneficialNutrients[0].bonus;
        benefits.push(NUTRITION_DATABASE.beneficialNutrients[0].benefit);
    }
    // Protein
    if (nutrition.protein >= NUTRITION_DATABASE.beneficialNutrients[1].min) {
        score -= NUTRITION_DATABASE.beneficialNutrients[1].bonus;
        benefits.push(NUTRITION_DATABASE.beneficialNutrients[1].benefit);
    }

    // Clamp Score (0 to 100)
    if (score < 0) score = 0;
    if (score > 100) score = 100;

    // 4. CLASSIFICATION
    let riskLevel = "Low";
    let recommendation = "Safe to Eat";
    let colorCode = "#22c55e"; // Green

    if (score >= 30 && score < 60) {
        riskLevel = "Medium";
        recommendation = "Limit Consumption";
        colorCode = "#eab308"; // Yellow
    } else if (score >= 60) {
        riskLevel = "High";
        recommendation = "Avoid / Eat Sparingly";
        colorCode = "#ef4444"; // Red
    }

    // 5. OUTPUT
    return {
        productName: productData.productName || "Unknown Product",
        riskScore: score,
        riskLevel: riskLevel,
        colorCode: colorCode,
        recommendation: recommendation,
        warnings: warnings,
        benefits: benefits,
        details: {
            analyzed_sugar: `${nutrition.sugar}g`,
            analyzed_sodium: `${nutrition.sodium}mg`
        }
    };
}

// --- EXAMPLE USAGE ---
const sampleProduct = {
    productName: "Mega Cheez Chips",
    ingredients: ["Potatoes", "Vegetable Oil", "Salt", "Sugar", "Monosodium Glutamate", "Red 40", "Yellow 6"],
    nutrition: {
        sugar: 12,       // 12g (High > 10) -> +20 pts
        sodium: 450,     // 450mg (High > 200) -> +15 pts
        transFat: 0,
        fiber: 1,        // Low -> No bonus
        protein: 2
    }
};

console.log(JSON.stringify(calculateHealthRisk(sampleProduct), null, 2));