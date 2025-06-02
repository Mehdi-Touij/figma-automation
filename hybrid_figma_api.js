// hybrid_figma_api.js
// Complete updated version with auto-sizing fix

const axios = require('axios');
const sharp = require('sharp');
const FormData = require('form-data');
const fs = require('fs').promises;
const path = require('path');

// Configuration
const FIGMA_TOKEN = process.env.FIGMA_TOKEN;
const FIGMA_FILE_KEY = process.env.FIGMA_FILE_KEY || 'RxhmuaosdbiwMrC4Skf2Hr';
const CLOUDINARY_URL = process.env.CLOUDINARY_URL;

// Template configurations - only need node IDs now!
const TEMPLATE_CONFIG = {
  'default': {
    nodeId: '1:14'  // Your BaseCard component ID
  },
  'sale': {
    nodeId: '1:14'  // Can use same component or create variants
  }
};

class SharpOnlyFigmaAutomation {
  constructor() {
    this.figmaHeaders = {
      'X-Figma-Token': FIGMA_TOKEN
    };
  }

  // Export Figma component as image
  async exportFigmaComponent(nodeId, scale = 2) {
    try {
      console.log(`🖼️ Exporting Figma component ${nodeId}...`);
      
      const response = await axios.get(
        `https://api.figma.com/v1/images/${FIGMA_FILE_KEY}`,
        {
          headers: this.figmaHeaders,
          params: {
            ids: nodeId,
            format: 'png',
            scale: scale
          }
        }
      );

      if (!response.data.images || !response.data.images[nodeId]) {
        throw new Error('No image URL returned from Figma');
      }

      const imageUrl = response.data.images[nodeId];
      console.log('📥 Downloading image...');

      const imageResponse = await axios.get(imageUrl, {
        responseType: 'arraybuffer'
      });

      return Buffer.from(imageResponse.data);
    } catch (error) {
      console.error('❌ Failed to export Figma component:', error.message);
      throw error;
    }
  }

  // Create SVG text overlay with dynamic sizing
  createTextSvg(headerText, promoText, width, height) {
    // Calculate positions based on actual image size
    const headerX = width / 2;
    const headerY = height * 0.3;  // 30% from top
    const promoX = width / 2;
    const promoY = height * 0.6;   // 60% from top
    
    // Escape special characters for XML
    const escapeXml = (text) => {
      return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
    };

    // Calculate font sizes based on image width
    const headerFontSize = Math.round(width * 0.06);  // 6% of width
    const promoFontSize = Math.round(width * 0.04);   // 4% of width

    // Word wrap function for long text
    const wrapText = (text, maxWidth, fontSize) => {
      const words = text.split(' ');
      const lines = [];
      let currentLine = '';
      
      const charWidth = fontSize * 0.6;
      const maxChars = Math.floor(maxWidth / charWidth);
      
      words.forEach(word => {
        if ((currentLine + word).length > maxChars) {
          if (currentLine) lines.push(currentLine.trim());
          currentLine = word + ' ';
        } else {
          currentLine += word + ' ';
        }
      });
      
      if (currentLine) lines.push(currentLine.trim());
      return lines;
    };

    // Wrap promo text if needed
    const promoLines = wrapText(promoText, width * 0.8, promoFontSize);
    const lineHeight = promoFontSize * 1.3;
    
    // Create SVG with text
    const svg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700&amp;display=swap');
            .header { 
              fill: #1a1a1a; 
              font-size: ${headerFontSize}px; 
              font-weight: 700; 
              font-family: 'Inter', Arial, sans-serif;
              text-anchor: middle;
            }
            .promo { 
              fill: #666666; 
              font-size: ${promoFontSize}px; 
              font-weight: 400;
              font-family: 'Inter', Arial, sans-serif;
              text-anchor: middle;
            }
            .shadow {
              fill: rgba(0,0,0,0.3);
              filter: blur(2px);
            }
          </style>
        </defs>
        
        <!-- Header with shadow -->
        <text x="${headerX + 2}" y="${headerY + 2}" class="header shadow">
          ${escapeXml(headerText)}
        </text>
        <text x="${headerX}" y="${headerY}" class="header">
          ${escapeXml(headerText)}
        </text>
        
        <!-- Promo text with multiple lines -->
        ${promoLines.map((line, index) => `
          <text x="${promoX}" y="${promoY + (index * lineHeight)}" class="promo">
            ${escapeXml(line)}
          </text>
        `).join('')}
      </svg>
    `;

    return Buffer.from(svg);
  }

  // Process image with Sharp - now with auto-sizing
  async addTextOverlay(imageBuffer, headerText, promoText, templateType = 'default') {
    try {
      console.log('🎨 Adding text overlay with Sharp...');
      
      // Get actual image dimensions
      const metadata = await sharp(imageBuffer).metadata();
      console.log(`📐 Image dimensions: ${metadata.width}x${metadata.height}`);
      
      // Create SVG with actual dimensions
      const svgBuffer = this.createTextSvg(headerText, promoText, metadata.width, metadata.height);
      
      // Composite SVG text over image
      const processedImage = await sharp(imageBuffer)
        .composite([
          {
            input: svgBuffer,
            top: 0,
            left: 0,
            blend: 'over'
          }
        ])
        .png({
          quality: 95,
          compressionLevel: 8
        })
        .toBuffer();

      return processedImage;
    } catch (error) {
      console.error('❌ Failed to add text overlay:', error.message);
      throw error;
    }
  }

  // Upload to Cloudinary
  async uploadToCloudinary(imageBuffer, filename) {
    try {
      console.log('☁️ Uploading to Cloudinary...');
      
      const urlMatch = CLOUDINARY_URL.match(/cloudinary:\/\/(\d+):([^@]+)@(.+)/);
      if (!urlMatch) {
        throw new Error('Invalid CLOUDINARY_URL format');
      }

      const [, apiKey, apiSecret, cloudName] = urlMatch;
      
      const form = new FormData();
      form.append('file', imageBuffer, {
        filename: `${filename}.png`,
        contentType: 'image/png'
      });
      form.append('upload_preset', 'figma_automation');
      form.append('folder', 'figma-cards');
      form.append('resource_type', 'image');
      
      const response = await axios.post(
        `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
        form,
        {
          headers: {
            ...form.getHeaders()
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity
        }
      );

      console.log('✅ Uploaded successfully');
      return response.data.secure_url;
    } catch (error) {
      console.error('❌ Failed to upload to Cloudinary:', error.message);
      if (error.response) {
        console.error('Response:', error.response.data);
      }
      throw error;
    }
  }

  // Main processing function
  async processCard(headerText, promoText, templateType = 'default') {
    try {
      console.log(`\n🎯 Processing card: "${headerText}"`);
      
      const config = TEMPLATE_CONFIG[templateType] || TEMPLATE_CONFIG.default;
      
      // Step 1: Export base template from Figma
      const baseImageBuffer = await this.exportFigmaComponent(config.nodeId);
      
      // Save base image for debugging
      if (process.env.NODE_ENV === 'development') {
        await fs.writeFile('debug_base.png', baseImageBuffer);
        console.log('💾 Saved base image to debug_base.png');
      }
      
      // Step 2: Add text overlay
      const processedImage = await this.addTextOverlay(
        baseImageBuffer, 
        headerText, 
        promoText,
        templateType
      );
      
      // Save processed image for debugging
      if (process.env.NODE_ENV === 'development') {
        await fs.writeFile('debug_processed.png', processedImage);
        console.log('💾 Saved processed image to debug_processed.png');
      }
      
      // Step 3: Upload to Cloudinary
      const filename = `card_${Date.now()}_${headerText.replace(/\s+/g, '_').substring(0, 20)}`;
      const imageUrl = await this.uploadToCloudinary(processedImage, filename);
      
      return {
        success: true,
        header: headerText,
        promo: promoText,
        template: templateType,
        imageUrl: imageUrl,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error(`❌ Failed to process card "${headerText}":`, error.message);
      return {
        success: false,
        header: headerText,
        promo: promoText,
        template: templateType,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  // Process multiple cards
  async processBatch(cards) {
    console.log(`\n📦 Processing batch of ${cards.length} cards...`);
    
    const results = [];
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      console.log(`\n[${i + 1}/${cards.length}] Processing...`);
      
      const result = await this.processCard(
        card.header || card.Header,
        card.promo || card.PromoText || card.promo_text,
        card.template || 'default'
      );
      results.push(result);
      
      // Add delay to avoid rate limits
      if (i < cards.length - 1) {
        console.log('⏳ Waiting 1 second before next card...');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    // Summary
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    console.log('\n📊 Batch processing complete!');
    console.log(`✅ Successful: ${successful}`);
    console.log(`❌ Failed: ${failed}`);
    
    return results;
  }

  // Get Figma file structure
  async getFigmaFileStructure() {
    try {
      console.log('📋 Fetching Figma file structure...');
      const response = await axios.get(
        `https://api.figma.com/v1/files/${FIGMA_FILE_KEY}`,
        { headers: this.figmaHeaders }
      );

      const components = [];
      const findComponents = (node, path = '') => {
        if (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') {
          components.push({
            id: node.id,
            name: node.name,
            type: node.type,
            path: path
          });
        }
        if (node.children) {
          node.children.forEach(child => 
            findComponents(child, path + '/' + node.name)
          );
        }
      };

      response.data.document.children.forEach(page => {
        findComponents(page, page.name);
      });

      return components;
    } catch (error) {
      console.error('❌ Failed to get Figma structure:', error.message);
      throw error;
    }
  }
}

// Export for use in server
module.exports = SharpOnlyFigmaAutomation;

// Standalone execution for testing
if (require.main === module) {
  const automation = new SharpOnlyFigmaAutomation();
  
  // Check for required environment variables
  if (!process.env.FIGMA_TOKEN) {
    console.error('❌ FIGMA_TOKEN environment variable is required');
    console.log('Get it from: https://www.figma.com/settings');
    process.exit(1);
  }
  
  if (!process.env.CLOUDINARY_URL) {
    console.error('❌ CLOUDINARY_URL environment variable is required');
    process.exit(1);
  }
  
  // Test with sample data
  const testCards = [
    { 
      header: 'Summer Sale', 
      promo: '50% off all items! Limited time offer on selected products.',
      template: 'default'
    },
    { 
      header: 'New Arrivals', 
      promo: 'Check out our latest collection of amazing products',
      template: 'default'
    }
  ];
  
  console.log('🚀 Starting Sharp-only Figma automation test...');
  
  automation.processBatch(testCards)
    .then(async results => {
      console.log('\n✅ Test complete!');
      
      // Save results
      await fs.writeFile(
        path.join(__dirname, 'sharp_test_results.json'),
        JSON.stringify(results, null, 2)
      );
      
      console.log('💾 Results saved to sharp_test_results.json');
      
      // Print successful image URLs
      results
        .filter(r => r.success)
        .forEach(r => {
          console.log(`\n🖼️ ${r.header}: ${r.imageUrl}`);
        });
    })
    .catch(error => {
      console.error('\n💥 Test failed:', error);
      process.exit(1);
    });
}
