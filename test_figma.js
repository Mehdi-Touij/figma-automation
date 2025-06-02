const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

async function testFigmaAccess() {
  let browser = null;
  
  try {
    console.log('🚀 Testing modern Figma API access...');
    
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
    
    console.log('🌐 Navigating to Figma...');
    const figmaUrl = `https://www.figma.com/file/${process.env.FIGMA_FILE_KEY}`;
    
    await page.goto(figmaUrl, { 
      waitUntil: 'networkidle0', 
      timeout: 60000 
    });
    
    console.log('⏳ Waiting for modern Figma to load...');
    await new Promise(resolve => setTimeout(resolve, 15000));
    
    // Test multiple possible API access patterns
    const apiTest = await page.evaluate(() => {
      const results = {
        timestamp: new Date().toISOString(),
        url: window.location.href,
        title: document.title
      };
      
      // Test classic figma object
      if (typeof figma !== 'undefined') {
        results.classicFigma = {
          available: true,
          hasCurrentPage: !!figma.currentPage,
          properties: Object.keys(figma)
        };
      } else {
        results.classicFigma = { available: false };
      }
      
      // Test Fig object
      if (typeof Fig !== 'undefined') {
        results.figObject = {
          available: true,
          properties: Object.keys(Fig),
          type: typeof Fig
        };
        
        // Try to access common properties
        try {
          if (Fig.currentPage) {
            results.figObject.currentPage = {
              name: Fig.currentPage.name,
              children: Fig.currentPage.children?.length || 0
            };
          }
        } catch (e) {
          results.figObject.currentPageError = e.message;
        }
      } else {
        results.figObject = { available: false };
      }
      
      // Test for editor state objects
      if (typeof EditorTypeConfig !== 'undefined') {
        results.editorConfig = {
          available: true,
          properties: Object.keys(EditorTypeConfig)
        };
      }
      
      // Look for any objects that might contain page/node data
      const potentialApis = [];
      for (const key of Object.keys(window)) {
        if (key.toLowerCase().includes('fig') && typeof window[key] === 'object' && window[key] !== null) {
          try {
            const obj = window[key];
            if (obj.currentPage || obj.findAll || obj.createComponent) {
              potentialApis.push({
                name: key,
                hasCurrentPage: !!obj.currentPage,
                hasFindAll: typeof obj.findAll === 'function',
                hasCreateComponent: typeof obj.createComponent === 'function',
                properties: Object.keys(obj).slice(0, 10)
              });
            }
          } catch (e) {
            // Skip objects that throw errors when accessed
          }
        }
      }
      results.potentialApis = potentialApis;
      
      // Try to find any components on the page using different methods
      const componentSearch = {
        methods: []
      };
      
      // Method 1: Classic figma API
      if (typeof figma !== 'undefined' && figma.currentPage) {
        try {
          const nodes = figma.currentPage.findAll();
          const baseCard = nodes.find(n => n.name === 'BaseCard');
          componentSearch.methods.push({
            method: 'classic-figma',
            totalNodes: nodes.length,
            foundBaseCard: !!baseCard,
            nodeNames: nodes.slice(0, 5).map(n => n.name)
          });
        } catch (e) {
          componentSearch.methods.push({
            method: 'classic-figma',
            error: e.message
          });
        }
      }
      
      // Method 2: Fig object
      if (typeof Fig !== 'undefined') {
        try {
          if (Fig.currentPage && typeof Fig.currentPage.findAll === 'function') {
            const nodes = Fig.currentPage.findAll();
            const baseCard = nodes.find(n => n.name === 'BaseCard');
            componentSearch.methods.push({
              method: 'Fig-object',
              totalNodes: nodes.length,
              foundBaseCard: !!baseCard,
              nodeNames: nodes.slice(0, 5).map(n => n.name)
            });
          }
        } catch (e) {
          componentSearch.methods.push({
            method: 'Fig-object',
            error: e.message
          });
        }
      }
      
      results.componentSearch = componentSearch;
      
      return results;
    });
    
    console.log('🎨 Modern API test results:', JSON.stringify(apiTest, null, 2));
    
    // Determine if we found a working API
    const hasWorkingApi = apiTest.componentSearch.methods.some(m => m.foundBaseCard);
    
    return {
      success: hasWorkingApi,
      apiTest,
      foundBaseCard: hasWorkingApi
    };
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return { success: false, error: error.message };
  } finally {
    if (browser) await browser.close();
  }
}

testFigmaAccess()
  .then(result => {
    console.log('🎯 Final test result:', result.success ? 'SUCCESS!' : 'FAILED');
    process.exit(result.success ? 0 : 1);
  })
  .catch(error => {
    console.error('💥 Test crashed:', error);
    process.exit(1);
  });
