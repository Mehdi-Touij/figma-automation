const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

async function testFigmaAccess() {
  let browser = null;
  
  try {
    console.log('🚀 Testing Figma access with edit mode...');
    
    const cookies = JSON.parse(await fs.readFile(path.join(__dirname, 'cookies.json'), 'utf8'));
    console.log('📄 Loaded', cookies.length, 'cookies');
    
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--disable-web-security',
        '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      ]
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    
    console.log('🍪 Setting cookies...');
    for (const cookie of cookies) {
      try {
        await page.setCookie(cookie);
        console.log('✅ Set cookie:', cookie.name);
      } catch (e) {
        console.log('❌ Failed to set cookie:', cookie.name);
      }
    }
    
    // Try the old /file/ URL format first (more likely to have figma API)
    console.log('🌐 Navigating to Figma (old format)...');
    const figmaUrl = `https://www.figma.com/file/${process.env.FIGMA_FILE_KEY}`;
    console.log('URL:', figmaUrl);
    
    await page.goto(figmaUrl, { 
      waitUntil: 'networkidle0', 
      timeout: 60000 
    });
    
    console.log('⏳ Waiting for page to stabilize...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Check current status
    const initialStatus = await page.evaluate(() => {
      return {
        title: document.title,
        url: window.location.href,
        hasFigma: typeof figma !== 'undefined',
        bodySnippet: document.body?.innerText?.substring(0, 300) || 'No body text'
      };
    });
    
    console.log('📍 Initial status:', initialStatus);
    
    // If figma API not available, try some interactions
    if (!initialStatus.hasFigma) {
      console.log('🖱️ Figma API not ready, trying interactions...');
      
      // Try clicking on the canvas or any edit-related elements
      try {
        // Look for and click edit button, canvas, or similar
        await page.evaluate(() => {
          // Try clicking canvas
          const canvas = document.querySelector('canvas');
          if (canvas) {
            canvas.click();
            console.log('Clicked canvas');
          }
          
          // Try clicking any "edit" or similar buttons
          const editButtons = Array.from(document.querySelectorAll('button, a')).filter(el => 
            el.textContent?.toLowerCase().includes('edit') ||
            el.textContent?.toLowerCase().includes('open') ||
            el.textContent?.toLowerCase().includes('continue')
          );
          
          if (editButtons.length > 0) {
            editButtons[0].click();
            console.log('Clicked edit button:', editButtons[0].textContent);
          }
        });
        
        console.log('⏳ Waiting after interactions...');
        await new Promise(resolve => setTimeout(resolve, 15000));
        
      } catch (interactionError) {
        console.log('❌ Interaction failed:', interactionError.message);
      }
    }
    
    // Final check for Figma API
    console.log('🎯 Final check for Figma API...');
    const finalResult = await page.evaluate(() => {
      try {
        if (typeof figma === 'undefined') {
          return {
            success: false,
            hasFigma: false,
            message: 'figma object not found',
            globalObjects: Object.keys(window).filter(key => key.toLowerCase().includes('fig')),
            url: window.location.href,
            title: document.title
          };
        }
        
        if (!figma.currentPage) {
          return {
            success: false,
            hasFigma: true,
            message: 'figma object exists but currentPage is null',
            figmaProperties: Object.keys(figma),
            url: window.location.href
          };
        }
        
        // Try to find BaseCard component
        const allNodes = figma.currentPage.findAll();
        const baseCard = allNodes.find(node => 
          node.name === 'BaseCard' && node.type === 'COMPONENT'
        );
        
        return {
          success: true,
          hasFigma: true,
          currentPageName: figma.currentPage.name,
          totalNodes: allNodes.length,
          foundBaseCard: !!baseCard,
          baseCardDetails: baseCard ? {
            id: baseCard.id,
            name: baseCard.name,
            type: baseCard.type
          } : null,
          nodeNames: allNodes.slice(0, 10).map(n => n.name) // First 10 node names for debugging
        };
        
      } catch (error) {
        return {
          success: false,
          error: error.message,
          hasFigma: typeof figma !== 'undefined'
        };
      }
    });
    
    console.log('🎨 Final result:', finalResult);
    return finalResult;
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return { success: false, error: error.message };
  } finally {
    if (browser) await browser.close();
  }
}

testFigmaAccess()
  .then(result => {
    console.log('🎯 Complete test result:', result);
    process.exit(result.success ? 0 : 1);
  })
  .catch(error => {
    console.error('💥 Test crashed:', error);
    process.exit(1);
  });
