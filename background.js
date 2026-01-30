// background.js
const API_BASE_URL = "http://localhost:3000/api";

// Listen for messages from popup.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    
    // 1. Analyze Request
    if (request.action === "ANALYZE_PRODUCT") {
        handleAnalysis(request).then(sendResponse);
        return true; // Keep message channel open for async response
    }

    // 2. History Request
    if (request.action === "GET_HISTORY") {
        getHistory().then(sendResponse);
        return true;
    }
});

async function handleAnalysis(request) {
    const { type, payload } = request;

    try {
        // A. Call Node.js Server
        let endpoint = type === 'image' ? '/analyze-image' : '/analyze-text';
        let body = type === 'image' ? { imageBase64: payload } : { productName: payload };

        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!response.ok) throw new Error("Server analysis failed");
        
        const data = await response.json();

        // B. Save to History (Only runs if analysis succeeds!)
        await addToHistory(data);

        return { success: true, data: data };

    } catch (error) {
        console.error("Background Error:", error);
        return { success: false, error: error.message };
    }
}

// --- HISTORY HELPERS ---
async function addToHistory(data) {
    const { history = [] } = await chrome.storage.local.get("history");
    
    const newEntry = {
        name: data.productName,
        score: data.analysis?.score || 0
    };

    // Add new entry to top, keep only last 10
    const updatedHistory = [newEntry, ...history].slice(0, 10);
    await chrome.storage.local.set({ history: updatedHistory });
}

async function getHistory() {
    const { history = [] } = await chrome.storage.local.get("history");
    return history;
}