const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

async function testFigmaAccess() {
  let browser = null;
  
  try {
    console.log('🚀 Testing Figma access...');
    
    // Load cookies
    const cookiesPath = path.join(__dirname, 'cookies.json');
    const cookiesString = await fs.readFile(cookiesPath, 'utf8');
    const cookies = JSON.parse(cookiesString);
    
    console.log('📄 Loaded', cookies.length, 'cookies');
    
    // Launch browser
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-features=VizDisplayCompositor',
        '--disable-web-security',
        '--disable-features=site-per-process'
      ]
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Set cookies
    console.log('🍪 Setting cookies...');
    for (const cookie of cookies) {
      try {
        await page.setCookie(cookie);
        console.log('✅ Set cookie:', cookie.name);
      } catch (e) {
        console.log('❌ Failed to set cookie:', cookie.name, e.message);
      }
    }
    
    // Try to access Figma
    console.log('🌐 Navigating to Figma...');
    const figmaUrl = `https://www.figma.com/file/${process.env.FIGMA_FILE_KEY}`;
    console.log('URL:', figmaUrl);
    
    await page.goto(figmaUrl, { 
      waitUntil: 'networkidle0', 
      timeout: 60000 
    });
    
    console.log('📍 Page loaded, checking for login...');
    
    // Check if we're logged in
    const title = await page.title();
    console.log('📄 Page title:', title);
    
    // Check for login indicators
    const isLoggedIn = await page.evaluate(() => {
      // Look for common login/error indicators
      const body = document.body.innerHTML;
      if (body.includes('Sign in') || body.includes('Log in')) {
        return { loggedIn: false, reason: 'Login page detected' };
      }
      if (body.includes('Access denied') || body.includes('not found')) {
        return { loggedIn: false, reason: 'Access denied or file not found' };
      }
      if (typeof figma !== 'undefined') {
        return { loggedIn: true, reason: 'Figma API available' };
      }
      return { loggedIn: 'unknown', reason: 'Could not determine status' };
    });
    
    console.log('🔍 Login status:', isLoggedIn);
    
    // Take a screenshot for debugging
    await page.screenshot({ path: '/tmp/figma_test.png', fullPage: false });
    console.log('📸 Screenshot saved');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return { success: false, error: error.message };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
  
  return { success: true };
}

// Run the test
testFigmaAccess()
  .then(result => {
    console.log('🎯 Test result:', result);
    process.exit(result.success ? 0 : 1);
  })
  .catch(error => {
    console.error('💥 Test crashed:', error);
    process.exit(1);
  });
