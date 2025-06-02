const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { spawn } = require('child_process');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.set('trust proxy', 1);
app.use(cors());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/run-with-images', limiter);

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

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    features: ['image-export', 'google-sheets-integration']
  });
});

app.post('/run-with-images', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  
  try {
    console.log('🚀 Starting enhanced Figma automation with images...');
    console.log('Received data:', JSON.stringify(req.body, null, 2));
    
    if (!Array.isArray(req.body)) {
      return res.status(400).json({ 
        error: 'Request body must be an array of objects' 
      });
    }

    for (let i = 0; i < req.body.length; i++) {
      const item = req.body[i];
      if (!item.header || !item.promo) {
        return res.status(400).json({ 
          error: `Item at index ${i} is missing 'header' or 'promo' field` 
        });
      }
    }

    const uploadService = process.env.UPLOAD_SERVICE;
    if (!uploadService || !['cloudinary', 'imgur', 's3'].includes(uploadService)) {
      return res.status(500).json({
        error: 'Image upload service not properly configured. Set UPLOAD_SERVICE to cloudinary, imgur, or s3'
      });
    }

    const updatesPath = path.join(__dirname, 'updates.json');
    await fs.writeFile(updatesPath, JSON.stringify(req.body, null, 2));
    console.log(`📄 Saved ${req.body.length} updates for enhanced processing`);

    const result = await runEnhancedFigmaUpdater();
    const duration = Date.now() - startTime;
    
    console.log(`✅ Enhanced automation completed in ${duration}ms`);
    
    let imageResults = [];
    try {
      const resultsPath = path.join(__dirname, 'image_results.json');
      const resultsData = await fs.readFile(resultsPath, 'utf8');
      imageResults = JSON.parse(resultsData);
    } catch (e) {
      console.warn('Could not load image results');
    }
    
    res.json({
      success: true,
      message: 'Enhanced Figma automation with images completed',
      itemsProcessed: req.body.length,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString(),
      type: 'enhanced',
      imageResults: imageResults,
      summary: {
        total: req.body.length,
        successful: imageResults.filter(r => r.status === 'success').length,
        failed: imageResults.filter(r => r.status === 'failed').length
      }
    });

  } catch (error) {
    console.error('❌ Enhanced automation failed:', error);
    const duration = Date.now() - startTime;
    
    res.status(500).json({
      success: false,
      error: error.message,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString(),
      type: 'enhanced'
    });
  }
});

app.get('/image-results', authenticateToken, async (req, res) => {
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
      error: 'No image results found',
      message: 'Run /run-with-images first to generate results'
    });
  }
});

function runEnhancedFigmaUpdater() {
  return new Promise((resolve, reject) => {
    console.log('🤖 Starting enhanced Puppeteer script with image export...');
    
    const child = spawn('node', ['enhanced_figma_updater.js'], {
      stdio: ['inherit', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      const output = data.toString();
      stdout += output;
      console.log('Enhanced Puppeteer:', output.trim());
    });

    child.stderr.on('data', (data) => {
      const error = data.toString();
      stderr += error;
      console.error('Enhanced Puppeteer Error:', error.trim());
    });

    child.on('close', (code) => {
      if (code === 0) {
        console.log('✅ Enhanced Puppeteer script completed');
        resolve({ stdout, stderr, code });
      } else {
        console.error(`❌ Enhanced Puppeteer script failed with code ${code}`);
        reject(new Error(`Enhanced script failed with exit code ${code}. Error: ${stderr}`));
      }
    });

    child.on('error', (error) => {
      console.error('❌ Failed to spawn enhanced Puppeteer script:', error);
      reject(error);
    });
  });
}

app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    availableEndpoints: ['/health', '/run-with-images', '/image-results']
  });
});

app.listen(PORT, () => {
  console.log(`🌐 Enhanced Server running on port ${PORT}`);
  console.log(`📡 Health check: http://localhost:${PORT}/health`);
  console.log(`🖼️  Enhanced automation: http://localhost:${PORT}/run-with-images`);
  console.log(`📊 Image results: http://localhost:${PORT}/image-results`);
  
  if (AUTH_TOKEN) {
    console.log('🔐 Token authentication enabled');
  } else {
    console.log('⚠️  No authentication token set');
  }
  
  const uploadService = process.env.UPLOAD_SERVICE;
  if (uploadService) {
    console.log(`☁️  Image upload: ${uploadService.toUpperCase()}`);
  } else {
    console.log('⚠️  No image upload service configured');
  }
});

process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 Received SIGINT, shutting down gracefully...');
  process.exit(0);
});
