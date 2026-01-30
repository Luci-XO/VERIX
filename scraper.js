const puppeteer = require('puppeteer');
const cheerio = require('cheerio');

// ==========================================
// PART 1: THE HEALTH ANALYSIS ENGINE
// ==========================================

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
        { name: "Sodium Benzoate", penalty: 10, category: "Preservative" },
        { name: "Aspartame", penalty: 10, category: "Artificial Sweetener" },
        { name: "Hydrogenated", penalty: 30, category: "Trans Fat Source" },
        { name: "Monosodium Glutamate", penalty: 5, category: "Flavor Enhancer" }
    ],
    beneficialNutrients: [
        { name: "Fiber", min: 3, unit: 'g', bonus: 5, benefit: "Good Source of Fiber" },
        { name: "Protein", min: 5, unit: 'g', bonus: 5, benefit: "High Protein" }
    ]
};

function calculateHealthRisk(productData) {
    let score = 0;
    let warnings = [];
    let benefits = [];
    
    // Safety check: ensure nutrition object exists
    const nutrition = {
        sugar: productData.nutrition?.sugar || 0,
        sodium: productData.nutrition?.sodium || 0,
        transFat: productData.nutrition?.transFat || 0,
        fiber: productData.nutrition?.fiber || 0,
        protein: productData.nutrition?.protein || 0
    };

    const ingredientString = (productData.ingredients || []).join(", ").toLowerCase();

    // 1. Check Nutrients (Quantitative)
    if (nutrition.sugar > NUTRITION_DATABASE.limits.sugar.threshold) {
        score += NUTRITION_DATABASE.limits.sugar.penalty;
        warnings.push(`${NUTRITION_DATABASE.limits.sugar.warning} (${nutrition.sugar}g)`);
    }
    if (nutrition.sodium > NUTRITION_DATABASE.limits.sodium.threshold) {
        score += NUTRITION_DATABASE.limits.sodium.penalty;
        warnings.push(`${NUTRITION_DATABASE.limits.sodium.warning} (${nutrition.sodium}mg)`);
    }
    if (nutrition.transFat > 0 || ingredientString.includes("partially hydrogenated")) {
        score += NUTRITION_DATABASE.limits.transFat.penalty;
        warnings.push(NUTRITION_DATABASE.limits.transFat.warning);
    }

    // 2. Check Ingredients (Qualitative)
    NUTRITION_DATABASE.harmfulAdditives.forEach(additive => {
        if (ingredientString.includes(additive.name.toLowerCase())) {
            score += additive.penalty;
            warnings.push(`Contains ${additive.name} (${additive.category})`);
        }
    });

    // 3. Check Benefits
    if (nutrition.fiber >= NUTRITION_DATABASE.beneficialNutrients[0].min) {
        score -= NUTRITION_DATABASE.beneficialNutrients[0].bonus;
        benefits.push(NUTRITION_DATABASE.beneficialNutrients[0].benefit);
    }
    if (nutrition.protein >= NUTRITION_DATABASE.beneficialNutrients[1].min) {
        score -= NUTRITION_DATABASE.beneficialNutrients[1].bonus;
        benefits.push(NUTRITION_DATABASE.beneficialNutrients[1].benefit);
    }

    // 4. Final Score Limits (0-100)
    if (score < 0) score = 0;
    if (score > 100) score = 100;

    // 5. Determine Labels
    let riskLevel = "Low";
    let recommendation = "Safe to Eat";
    
    if (score >= 30) { 
        riskLevel = "Medium"; 
        recommendation = "Limit Consumption"; 
    }
    if (score >= 60) { 
        riskLevel = "High"; 
        recommendation = "Avoid"; 
    }

    return {
        productName: productData.productName,
        ingredients: productData.ingredients,
        nutritionParsed: nutrition,
        analysis: {
            score: score,
            riskLevel: riskLevel,
            recommendation: recommendation,
            warnings: warnings,
            benefits: benefits
        }
    };
}

// ==========================================
// PART 2: THE SCRAPER
// ==========================================

async function scrapeProductData(productName) {
    const browser = await puppeteer.launch({ 
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    });
    
    const page = await browser.newPage();
    
    // Set User Agent to look like a real browser
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36');

    try {
        console.log(`🔍 Searching Google for: ${productName}...`);
        
        // 1. Search Google specifically for OpenFoodFacts
        const query = `${productName} ingredients nutrition facts site:openfoodfacts.org`;
        await page.goto(`https://www.google.com/search?q=${encodeURIComponent(query)}`, { 
            waitUntil: 'domcontentloaded',
            timeout: 30000 // 30 second timeout safety
        });

        // 2. Find the first link
        const link = await page.evaluate(() => {
            const el = document.querySelector('div.g a');
            return el ? el.href : null;
        });

        let rawData = null;

        if (link && link.includes('openfoodfacts.org')) {
            console.log(`✅ Found data source: ${link}`);
            rawData = await scrapeOpenFoodFacts(page, link);
        } else {
            console.log("⚠️ Product not found on OpenFoodFacts.");
            // Return empty structure so app doesn't crash
            rawData = { 
                productName: productName, 
                ingredients: ["Data not found"], 
                nutrition: {} 
            };
        }

        // 3. Run the Health Algorithm on the scraped data
        const finalResult = calculateHealthRisk(rawData);
        return finalResult;

    } catch (error) {
        console.error("❌ Critical Error:", error.message);
        return { error: error.message };
    } finally {
        await browser.close();
    }
}

async function scrapeOpenFoodFacts(page, url) {
    try {
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        const html = await page.content();
        const $ = cheerio.load(html);

        // Extract Ingredients safely
        const ingText = $('#panel_ingredients_content .panel_text').text().trim();
        const ingredients = ingText ? ingText.split(',').map(i => i.trim()) : [];

        // Helper to parse numbers like "12 g" -> 12.0
        const getNutrient = (label) => {
            let val = 0;
            $('#panel_nutrition_facts_table_content tr').each((i, el) => {
                const rowLabel = $(el).find('td:nth-child(1)').text().toLowerCase();
                const rowValue = $(el).find('td:nth-child(2)').text(); 
                
                if (rowLabel.includes(label)) {
                    // Find the first number in the string
                    const match = rowValue.match(/([0-9.]+)/); 
                    if (match) val = parseFloat(match[1]);
                }
            });
            return val;
        };

        return {
            productName: $('h1').text().trim() || "Unknown Product",
            ingredients: ingredients,
            nutrition: {
                sugar: getNutrient('sugars'),
                sodium: getNutrient('salt') * 400, // Roughly convert Salt (g) to Sodium (mg)
                transFat: getNutrient('trans fat'),
                fiber: getNutrient('fiber'),
                protein: getNutrient('proteins')
            }
        };
    } catch (e) {
        console.error("Error reading OpenFoodFacts page:", e.message);
        return { productName: "Error", ingredients: [], nutrition: {} };
    }
}

// ==========================================
// PART 3: EXECUTION
// ==========================================

(async () => {
    // You can change "Nutella" to "Oreo" or "Diet Coke" to test others
    const productToTest = "Nutella Hazelnut Spread";
    
    console.log("------------------------------------------------");
    const result = await scrapeProductData(productToTest);
    console.log(JSON.stringify(result, null, 2));
    console.log("------------------------------------------------");
})();