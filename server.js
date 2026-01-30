const express = require('express');
const cors = require('cors');
const { analyzeText, analyzeImage, NUTRITION_DATABASE } = require('./analyzer');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS so your Chrome Extension can talk to this server
app.use(cors());
// Increase payload limit for large images
app.use(express.json({ limit: '50mb' })); 

// --- ROUTES ---

// 1. Text Analysis
app.post('/api/analyze-text', async (req, res) => {
    try {
        const { productName } = req.body;
        console.log(`Received text request: ${productName}`);
        const result = await analyzeText(productName);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 2. Image Analysis
app.post('/api/analyze-image', async (req, res) => {
    try {
        const { imageBase64 } = req.body;
        console.log(`Received image request`);
        const result = await analyzeImage(imageBase64);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 3. Database Limits
app.get('/api/ingredient-limits', (req, res) => {
    res.json(NUTRITION_DATABASE);
});

// Start Server
app.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
});