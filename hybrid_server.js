// hybrid_server.js
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const HybridFigmaAutomation = require('./hybrid_figma_api');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.set('trust proxy', 1);
app.use(cors());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

app.use(express.json({ limit: '10mb' }));

const AUTH_TOKEN = process.env.AUTH_TOKEN;

function authenticateToken(req, res, next) {
  if (!AUTH_TOKEN) {
    return next();
  }
  
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token !== AUTH_TOKEN) {
    return res.status(401).json({ error: 'Invalid or missing token' });
  }
  
  next();
}

// Initialize automation instance
const automation = new HybridFigmaAutomation();

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    mode: 'hybrid-api',
    features: ['figma-rest-api', 'canvas-text-overlay', 'cloudinary-upload']
  });
});

// Get Figma components structure
app.get('/api/figma-components', authenticateToken, async (req, res) => {
  try {
    const components = await automation.getFigmaFileStructure();
    res.json({
      success: true,
      components,
      message: 'Use these component IDs to update TEMPLATES in hybrid_figma_api.js'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Main processing endpoint
app.post('/api/process', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  
  try {
    console.log('🚀 Starting hybrid processing...');
    console.log('Received data:', JSON.stringify(req.body, null, 2));
    
    // Validate input
    if (!Array.isArray(req.body)) {
      return res.status(400).json({ 
        error: 'Request body must be an array of objects' 
      });
    }

    for (let i = 0; i < req.body.length; i++) {
      const item = req.body[i];
      if (!item.header && !item.Header) {
        return res.status(400).json({ 
          error: `Item at index ${i} is missing 'header' field` 
        });
      }
      if (!item.promo && !item.PromoText && !item.promo_text) {
        return res.status(400).json({ 
          error: `Item at index ${i} is missing 'promo' field` 
        });
      }
    }

    // Check required environment variables
    if (!process.env.FIGMA_TOKEN) {
      return res.status(500).json({
        error: 'FIGMA_TOKEN not configured. Get it from Figma settings.'
      });
    }

    if (!process.env.CLOUDINARY_URL) {
      return res.status(500).json({
        error: 'CLOUDINARY_URL not configured'
      });
    }

    // Process cards
    const results = await automation.processBatch(req.body);
    
    // Save results to file
    await fs.writeFile(
      path.join(__dirname, 'image_results.json'),
      JSON.stringify(results, null, 2)
    );
    
    const duration = Date.now() - startTime;
    
    console.log(`✅ Processing completed in ${duration}ms`);
    
    res.json({
      success: true,
      message: 'Hybrid processing completed successfully',
      itemsProcessed: req.body.length,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString(),
      results: results,
      summary: {
        total: results.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length
      }
    });

  } catch (error) {
    console.error('❌ Processing failed:', error);
    const duration = Date.now() - startTime;
    
    res.status(500).json({
      success: false,
      error: error.message,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString()
    });
  }
});

// Get latest results
app.get('/api/results', authenticateToken, async (req, res) => {
  try {
    const resultsPath = path.join(__dirname, 'image_results.json');
    const resultsData = await fs.readFile(resultsPath, 'utf8');
    const results = JSON.parse(resultsData);
    
    res.json({
      success: true,
      results: results,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    res.status(404).json({
      success: false,
      error: 'No results found',
      message: 'Run /api/process first to generate results'
    });
  }
});

// Test single card processing
app.post('/api/test', authenticateToken, async (req, res) => {
  try {
    const { header = 'Test Header', promo = 'Test Promo Text' } = req.body;
    
    console.log('🧪 Testing single card processing...');
    
    const result = await automation.processCard(header, promo);
    
    res.json({
      success: true,
      message: 'Test completed',
      result
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    availableEndpoints: {
      'GET /health': 'Health check',
      'GET /api/figma-components': 'Get Figma file structure',
      'POST /api/process': 'Process batch of cards',
      'GET /api/results': 'Get latest processing results',
      'POST /api/test': 'Test single card processing'
    }
  });
});

// Error handler
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🌐 Hybrid Figma API Server running on port ${PORT}`);
  console.log(`📡 Health check: http://localhost:${PORT}/health`);
  console.log(`🎯 Mode: REST API + Canvas text overlay`);
  
  if (AUTH_TOKEN) {
    console.log('🔐 Token authentication enabled');
  } else {
    console.log('⚠️  No authentication token set');
  }
  
  if (process.env.FIGMA_TOKEN) {
    console.log('✅ Figma API token configured');
  } else {
    console.log('❌ FIGMA_TOKEN not set - get it from Figma settings');
  }
  
  if (process.env.CLOUDINARY_URL) {
    console.log('☁️  Cloudinary configured');
  } else {
    console.log('❌ CLOUDINARY_URL not set');
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 Received SIGINT, shutting down gracefully...');
  process.exit(0);
});
