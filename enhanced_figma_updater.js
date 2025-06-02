const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

const FIGMA_FILE_KEY = process.env.FIGMA_FILE_KEY || 'your-figma-file-key-here';
const BASE_COMPONENT_NAME = 'BaseCard';
const HEADER_LAYER_NAME = 'Header';
const PROMO_LAYER_NAME = 'PromoText';
const OFFSET_X = 400;

const UPLOAD_SERVICE = process.env.UPLOAD_SERVICE || 'cloudinary';
const CLOUDINARY_URL = process.env.CLOUDINARY_URL;

async function loadCookies() {
  try {
    const cookiesPath = path.join(__dirname, 'cookies.json');
    const cookiesString = await fs.readFile(cookiesPath, 'utf8');
    return JSON.parse(cookiesString);
  } catch (error) {
    console.error('❌ Could not load cookies.json:', error.message);
    throw error;
  }
}

async function loadUpdates() {
  try {
    const updatesPath = path.join(__dirname, 'updates.json');
    const updatesString = await fs.readFile(updatesPath, 'utf8');
    return JSON.parse(updatesString);
  } catch (error) {
    console.error('❌ Could not load updates.json:', error.message);
    throw error;
  }
}

async function waitForFigmaLoad(page) {
  console.log('⏳ Waiting for Figma to fully load...');
  
  await page.waitForSelector('canvas', { timeout: 30000 });
  await page.waitForFunction(() => {
    return typeof figma !== 'undefined' && figma.currentPage;
  }, { timeout: 30000 });
  
  await page.waitForTimeout(3000);
  console.log('✅ Figma loaded successfully');
}

async function findBaseComponent(page) {
  console.log(`🔍 Looking for base component: ${BASE_COMPONENT_NAME}`);
  
  const baseComponent = await page.evaluate((componentName) => {
    const allNodes = figma.currentPage.findAll();
    const component = allNodes.find(node => 
      node.name === componentName && 
      node.type === 'COMPONENT'
    );
    
    if (component) {
      return {
        id: component.id,
        name: component.name,
        x: component.x,
        y: component.y,
        width: component.width,
        height: component.height
      };
    }
    return null;
  }, BASE_COMPONENT_NAME);
  
  if (!baseComponent) {
    throw new Error(`Component "${BASE_COMPONENT_NAME}" not found`);
  }
  
  console.log('✅ Found base component:', baseComponent);
  return baseComponent;
}

async function duplicateAndUpdateComponent(page, baseComponent, updateData, index) {
  console.log(`🔄 Processing item ${index + 1}: "${updateData.header}"`);
  
  const result = await page.evaluate(async (componentId, data, idx, headerLayerName, promoLayerName, offsetX) => {
    try {
      const originalComponent = figma.currentPage.findOne(node => node.id === componentId);
      if (!originalComponent) {
        throw new Error('Original component not found');
      }
      
      const instance = originalComponent.createInstance();
      instance.x = originalComponent.x + (offsetX * idx);
      instance.y = originalComponent.y;
      
      const fonts = new Set();
      const textNodes = instance.findAll(node => node.type === 'TEXT');
      textNodes.forEach(node => {
        if (node.fontName && node.fontName.family) {
          fonts.add(`${node.fontName.family}-${node.fontName.style}`);
        }
      });
      
      for (let fontKey of fonts) {
        const [family, style] = fontKey.split('-');
        try {
          await figma.loadFontAsync({ family, style });
        } catch (e) {
          console.warn(`Could not load font ${family} ${style}`);
        }
      }
      
      const allNodes = instance.findAll();
      
      const headerNode = allNodes.find(node => 
        node.name === headerLayerName && node.type === 'TEXT'
      );
      if (headerNode) {
        headerNode.characters = data.header;
      }
      
      const promoNode = allNodes.find(node => 
        node.name === promoLayerName && node.type === 'TEXT'
      );
      if (promoNode) {
        promoNode.characters = data.promo;
      }
      
      return {
        success: true,
        instanceId: instance.id,
        position: { x: instance.x, y: instance.y },
        bounds: {
          x: instance.x,
          y: instance.y,
          width: instance.width,
          height: instance.height
        }
      };
      
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }, baseComponent.id, updateData, index, HEADER_LAYER_NAME, PROMO_LAYER_NAME, OFFSET_X);
  
  if (!result.success) {
    throw new Error(`Failed to duplicate component: ${result.error}`);
  }
  
  console.log(`✅ Created instance at position (${result.position.x}, ${result.position.y})`);
  return result;
}

async function exportComponentAsImage(page, componentData, updateData, index) {
  console.log(`📸 Exporting component ${index + 1} as image...`);
  
  try {
    const imageData = await page.evaluate(async (bounds) => {
      const node = figma.currentPage.findOne(n => 
        n.x === bounds.x && n.y === bounds.y
      );
      
      if (!node) {
        throw new Error('Could not find component to export');
      }
      
      const exportSettings = {
        format: 'PNG',
        constraint: { type: 'SCALE', value: 2 }
      };
      
      const imageBytes = await node.exportAsync(exportSettings);
      
      const uint8Array = new Uint8Array(imageBytes);
      let binary = '';
      for (let i = 0; i < uint8Array.byteLength; i++) {
        binary += String.fromCharCode(uint8Array[i]);
      }
      
      return btoa(binary);
    }, componentData.bounds);
    
    const fileName = `figma_export_${index + 1}_${Date.now()}.png`;
    const localPath = path.join(__dirname, 'temp', fileName);
    
    await fs.mkdir(path.join(__dirname, 'temp'), { recursive: true });
    
    const imageBuffer = Buffer.from(imageData, 'base64');
    await fs.writeFile(localPath, imageBuffer);
    
    console.log(`💾 Saved image locally: ${fileName}`);
    
    const imageUrl = await uploadImage(localPath, fileName, updateData);
    
    await fs.unlink(localPath);
    
    return {
      success: true,
      imageUrl,
      fileName
    };
    
  } catch (error) {
    console.error(`❌ Failed to export image for item ${index + 1}:`, error);
    return {
      success: false,
      error: error.message
    };
  }
}

async function uploadImage(filePath, fileName, updateData) {
  console.log(`☁️ Uploading image: ${fileName}`);
  
  try {
    if (UPLOAD_SERVICE === 'cloudinary') {
      return await uploadToCloudinary(filePath, fileName, updateData);
    } else {
      throw new Error(`Unsupported upload service: ${UPLOAD_SERVICE}`);
    }
  } catch (error) {
    console.error('❌ Image upload failed:', error);
    throw error;
  }
}

async function uploadToCloudinary(filePath, fileName, updateData) {
  if (!CLOUDINARY_URL) {
    throw new Error('CLOUDINARY_URL not configured');
  }
  
  const formData = new FormData();
  formData.append('file', await fs.readFile(filePath));
  formData.append('upload_preset', 'figma_automation');
  formData.append('public_id', `figma/${fileName.replace('.png', '')}`);
  formData.append('tags', `figma,automation,${updateData.header.toLowerCase().replace(/\s+/g, '-')}`);
  
  const cloudName = CLOUDINARY_URL.split('@')[1];
  const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;
  
  const response = await axios.post(uploadUrl, formData, {
    headers: formData.getHeaders()
  });
  
  console.log('✅ Uploaded to Cloudinary:', response.data.secure_url);
  return response.data.secure_url;
}

async function updateGoogleSheet(results) {
  console.log('📋 Preparing to update Google Sheet with image links...');
  
  const resultsPath = path.join(__dirname, 'image_results.json');
  const resultsData = results.map((result, index) => ({
    row: index + 1,
    header: result.originalData.header,
    promo: result.originalData.promo,
    imageUrl: result.export?.imageUrl || '',
    status: result.export?.success ? 'success' : 'failed',
    error: result.export?.error || null,
    timestamp: new Date().toISOString()
  }));
  
  await fs.writeFile(resultsPath, JSON.stringify(resultsData, null, 2));
  console.log('💾 Saved image results for Google Sheets update');
  
  return resultsData;
}

async function runEnhancedFigmaAutomation() {
  let browser = null;
  
  try {
    console.log('🚀 Starting Enhanced Figma Automation with Image Export...');
    
    const cookies = await loadCookies();
    const updates = await loadUpdates();
    
    console.log(`📊 Processing ${updates.length} updates with image export`);
    
    browser = await puppeteer.launch({
      headless: process.env.NODE_ENV === 'production' ? 'new' : false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setCookie(...cookies);
    
    const figmaUrl = `https://www.figma.com/file/${FIGMA_FILE_KEY}`;
    console.log('📂 Opening Figma file...');
    await page.goto(figmaUrl, { waitUntil: 'networkidle0', timeout: 60000 });
    
    await waitForFigmaLoad(page);
    const baseComponent = await findBaseComponent(page);
    
    const results = [];
    for (let i = 0; i < updates.length; i++) {
      console.log(`\n🔄 Processing item ${i + 1}/${updates.length}`);
      
      try {
        const componentResult = await duplicateAndUpdateComponent(page, baseComponent, updates[i], i);
        
        await page.waitForTimeout(1000);
        
        const exportResult = await exportComponentAsImage(page, componentResult, updates[i], i);
        
        results.push({
          index: i,
          success: true,
          originalData: updates[i],
          component: componentResult,
          export: exportResult
        });
        
        console.log(`✅ Item ${i + 1} completed - Image URL: ${exportResult.imageUrl || 'Failed'}`);
        
      } catch (error) {
        console.error(`❌ Failed to process item ${i + 1}:`, error.message);
        results.push({
          index: i,
          success: false,
          originalData: updates[i],
          error: error.message
        });
      }
    }
    
    const sheetResults = await updateGoogleSheet(results);
    
    const successful = results.filter(r => r.success && r.export?.success).length;
    const componentsFailed = results.filter(r => !r.success).length;
    const exportsFailed = results.filter(r => r.success && !r.export?.success).length;
    
    console.log('\n📊 Enhanced Automation Summary:');
    console.log(`✅ Components + Images: ${successful}`);
    console.log(`❌ Component failures: ${componentsFailed}`);
    console.log(`📸 Export failures: ${exportsFailed}`);
    console.log(`📈 Total processed: ${results.length}`);
    
    return {
      results,
      sheetResults,
      summary: {
        total: results.length,
        successful,
        componentsFailed,
        exportsFailed
      }
    };
    
  } catch (error) {
    console.error('❌ Enhanced automation failed:', error);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
      console.log('🔒 Browser closed');
    }
  }
}

if (require.main === module) {
  runEnhancedFigmaAutomation()
    .then((results) => {
      console.log('🎉 Enhanced automation completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Enhanced automation failed:', error);
      process.exit(1);
    });
}

module.exports = { runEnhancedFigmaAutomation };