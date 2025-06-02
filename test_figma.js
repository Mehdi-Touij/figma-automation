const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

async function testFigmaAccess() {
  let browser = null;
  
  try {
    console.log('🚀 Testing Figma access with API waiting...');
    
    const cookies = JSON.parse(await fs.readFile(path.join(__dirname, 'cookies.json'), 'utf8'));
    console.log('📄 Loaded', cookies.length, 'cookies');
    
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
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
    
    console.log('🌐 Navigating to Figma...');
    const figmaUrl = `https://www.figma.com/file/${process.env.FIGMA_FILE_KEY}`;
    
    await page.goto(figmaUrl, { 
      waitUntil: 'networkidle0', 
      timeout: 60000 
    });
    
    console.log('⏳ Waiting for initial page load...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Wait specifically for Figma API to become available
    console.log('🎯 Waiting for Figma API to load...');
    try {
      await page.waitForFunction(() => {
        return typeof figma !== 'undefined' && figma.currentPage;
      }, { timeout: 45000 });
      
      console.log('✅ Figma API is now available!');
      
      // Test accessing the component
      const componentTest = await page.evaluate(() => {
        try {
          const allNodes = figma.currentPage.findAll();
          const baseCard = allNodes.find(node => 
            node.name === 'BaseCard' && node.type === 'COMPONENT'
          );
          
          return {
            success: true,
            totalNodes: allNodes.length,
            foundBaseCard: !!baseCard,
            baseCardInfo: baseCard ? {
              id: baseCard.id,
              name: baseCard.name,
              type: baseCard.type,
              x: baseCard.x,
              y: baseCard.y
            } : null,
            currentPageName: figma.currentPage.name
          };
        } catch (error) {
          return {
            success: false,
            error: error.message
          };
        }
      });
      
      console.log('🎨 Component test result:', componentTest);
      
      return { 
        success: true, 
        figmaApiReady: true,
        componentTest 
      };
      
    } catch (apiError) {
      console.log('❌ Figma API failed to load:', apiError.message);
      
      // Get more info about what's on the page
      const pageInfo = await page.evaluate(() => {
        return {
          title: document.title,
          url: window.location.href,
          bodyText: document.body?.innerText?.substring(0, 500) || 'No body text',
          hasCanvas: !!document.querySelector('canvas'),
          scripts: Array.from(document.scripts).map(s => s.src).filter(Boolean).slice(0, 5)
        };
      });
      
      console.log('📄 Page info when API failed:', pageInfo);
      
      return { 
        success: false, 
        figmaApiReady: false,
        error: apiError.message,
        pageInfo 
      };
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return { success: false, error: error.message };
  } finally {
    if (browser) await browser.close();
  }
}

testFigmaAccess()
  .then(result => {
    console.log('🎯 Final result:', result);
    process.exit(result.success ? 0 : 1);
  })
  .catch(error => {
    console.error('💥 Test crashed:', error);
    process.exit(1);
  });
