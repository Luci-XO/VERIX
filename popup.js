document.addEventListener('DOMContentLoaded', () => {
    // --- 1. CONFIGURATION ---
    
    // 🔵 YOUR SPOONACULAR KEY
    const SPOONACULAR_API_KEY = "fbfc5fbcdab74a578fb8426afdb7d544";

    // --- 2. SETUP UI ELEMENTS ---
    const textInput = document.getElementById('product-input');
    const analyzeBtn = document.getElementById('analyze-btn');
    const backBtn = document.getElementById('back-btn');
    const historyBtn = document.getElementById('history-btn');
    const closeHistoryBtn = document.getElementById('close-history');
    const clearHistoryBtn = document.getElementById('clear-history');
    
    const inputSection = document.getElementById('input-section');
    const loadingSection = document.getElementById('loading');
    const resultsSection = document.getElementById('results');
    const historySection = document.getElementById('history-section');

    // --- 3. EVENT LISTENERS ---
    
    analyzeBtn.addEventListener('click', async () => {
        const query = textInput.value.trim();
        if (!query) return alert("Please enter a product name (e.g. 'Oreo').");

        showView('loading');

        try {
            const result = await searchSpoonacular(query);
            saveToDatabase(result);
            renderResults(result);
            showView('results');

        } catch (error) {
            console.error(error);
            alert("Scan Failed: " + error.message);
            showView('input');
        }
    });

    backBtn.addEventListener('click', () => {
        showView('input');
        textInput.value = '';
    });

    if (historyBtn) historyBtn.addEventListener('click', () => { loadDatabase(); showView('history'); });
    if (closeHistoryBtn) closeHistoryBtn.addEventListener('click', () => showView('input'));
    if (clearHistoryBtn) clearHistoryBtn.addEventListener('click', () => chrome.storage.local.set({ history: [] }, loadDatabase));

    // --- 4. CORE LOGIC ---

    async function searchSpoonacular(query) {
        console.log("Searching Spoonacular for:", query);
        const searchUrl = `https://api.spoonacular.com/food/products/search?query=${encodeURIComponent(query)}&number=1&apiKey=${SPOONACULAR_API_KEY}`;
        const searchRes = await fetch(searchUrl);
        
        if (searchRes.status === 402) throw new Error("Daily Quota Reached. Try a new key.");
        if (!searchRes.ok) throw new Error("Connection Error.");
        
        const searchData = await searchRes.json();
        
        if (!searchData.products || searchData.products.length === 0) {
             throw new Error("Product not found. Try a specific brand like 'Oreo'.");
        }

        const productId = searchData.products[0].id;
        
        // Fetch Nutrition Details
        const infoUrl = `https://api.spoonacular.com/food/products/${productId}?apiKey=${SPOONACULAR_API_KEY}`;
        const infoRes = await fetch(infoUrl);
        const data = await infoRes.json();
        
        const n = data.nutrition || {};
        const nutrients = n.nutrients || [];
        
        const getVal = (name) => {
            const item = nutrients.find(x => x.name.toLowerCase().includes(name.toLowerCase()));
            return item ? item.amount : 0;
        };

        return calculateHealth({
            name: searchData.products[0].title,
            ingredients: (data.ingredientList || "Ingredients not listed").split(',').map(i=>i.trim()),
            nutrition: {
                calories: getVal("Calories"), 
                sugar: getVal("Sugar"),
                sodium: getVal("Sodium"),
                transFat: getVal("Trans Fat"),
                fiber: getVal("Fiber"),
                protein: getVal("Protein")
            }
        });
    }

    function calculateHealth(data) {
        let score = 0, warnings = [], benefits = [];
        const n = data.nutrition;

        // Scoring Logic
        if (n.sugar > 10) { score += 20; warnings.push(`High Sugar`); }
        if (n.sodium > 400) { score += 15; warnings.push(`High Sodium`); }
        if (n.transFat > 0) { score += 30; warnings.push("Trans Fat"); }
        if (n.fiber >= 3) { score -= 5; benefits.push(`Good Fiber`); }
        if (n.protein >= 5) { score -= 5; benefits.push(`High Protein`); }
        
        // Optional: High Calorie Warning
        if (n.calories > 400) { warnings.push("High Calorie"); }

        score = Math.max(0, Math.min(100, score));
        return { ...data, score, warnings, benefits };
    }

    // --- 5. DATABASE & UI ---

    function saveToDatabase(data) {
        chrome.storage.local.get(['history'], (result) => {
            let history = result.history || [];
            history.unshift({ name: data.name, score: data.score, date: new Date().toLocaleDateString() });
            if (history.length > 15) history = history.slice(0, 15);
            chrome.storage.local.set({ history: history });
        });
    }

    function loadDatabase() {
        chrome.storage.local.get(['history'], (result) => {
            const list = document.getElementById('history-list');
            if(list) {
                list.innerHTML = '';
                const history = result.history || [];
                if (history.length === 0) { list.innerHTML = '<p class="text-gray-400 text-center text-sm">No scans yet.</p>'; return; }
                history.forEach(item => {
                    let colorClass = item.score >= 60 ? 'text-red-500' : (item.score >= 30 ? 'text-yellow-500' : 'text-green-500');
                    const div = document.createElement('div');
                    div.className = "p-3 bg-gray-50 rounded border border-gray-100 flex justify-between items-center";
                    div.innerHTML = `<div><div class="font-bold text-sm truncate w-40">${item.name}</div><div class="text-xs text-gray-400">${item.date}</div></div><div class="font-bold ${colorClass}">Score: ${item.score}</div>`;
                    list.appendChild(div);
                });
            }
        });
    }

    function showView(viewName) {
        [inputSection, loadingSection, resultsSection, historySection].forEach(el => { if(el) el.classList.add('hidden'); });
        if (viewName === 'input' && inputSection) inputSection.classList.remove('hidden');
        if (viewName === 'loading' && loadingSection) loadingSection.classList.remove('hidden');
        if (viewName === 'results' && resultsSection) resultsSection.classList.remove('hidden');
        if (viewName === 'history' && historySection) historySection.classList.remove('hidden');
    }

    function renderResults(data) {
        document.getElementById('res-name').textContent = data.name;
        document.getElementById('res-ingredients').textContent = Array.isArray(data.ingredients) ? data.ingredients.join(", ") : data.ingredients;
        const badge = document.getElementById('score-badge');
        badge.textContent = data.score;
        badge.className = `w-12 h-12 rounded-full flex items-center justify-center font-bold text-white text-lg shadow-md ${data.score >= 60 ? 'bg-red-500' : (data.score >= 30 ? 'bg-yellow-500' : 'bg-green-500')}`;
        
        const tbody = document.getElementById('comparison-body');
        tbody.innerHTML = '';
        const addRow = (l, v, lim, u) => tbody.innerHTML += `<tr class="border-b border-gray-100"><td class="py-2">${l}</td><td class="font-bold">${v?v.toFixed(1):0} ${u}</td><td class="text-gray-400">${lim} ${u}</td></tr>`;
        
        // Updated Calories Row to show "400" limit
        addRow("Calories", data.nutrition.calories, "400", "kcal");
        addRow("Sugar", data.nutrition.sugar, "10", "g");
        addRow("Sodium", data.nutrition.sodium, "400", "mg");
        addRow("Trans Fat", data.nutrition.transFat, "0", "g");
        addRow("Fiber", data.nutrition.fiber, "3", "g");
        addRow("Protein", data.nutrition.protein, "5", "g");

        const wContainer = document.getElementById('warnings-container');
        const bContainer = document.getElementById('benefits-container');
        wContainer.innerHTML = ''; bContainer.innerHTML = '';
        data.warnings.forEach(w => wContainer.innerHTML += `<span class="pill pill-red" style="background:#fee2e2; color:#991b1b; padding:2px 8px; border-radius:10px; font-size:0.7rem; margin-right:4px;">⚠️ ${w}</span>`);
        data.benefits.forEach(b => bContainer.innerHTML += `<span class="pill pill-green" style="background:#dcfce7; color:#166534; padding:2px 8px; border-radius:10px; font-size:0.7rem; margin-right:4px;">✅ ${b}</span>`);
    }
});