const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

async function testFigmaAccess() {
  let browser = null;
  
  try {
    console.log('🚀 Testing Figma access with stealth mode...');
    
    const cookies = JSON.parse(await fs.readFile(path.join(__dirname, 'cookies.json'), 'utf8'));
    console.log('📄 Loaded', cookies.length, 'cookies');
    
    // Launch with stealth settings
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=VizDisplayCompositor',
        '--disable-web-security',
        '--disable-features=site-per-process',
        '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      ]
    });
    
    const page = await browser.newPage();
    
    // Remove automation indicators
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
    });
    
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Set cookies
    console.log('🍪 Setting cookies...');
    for (const cookie of cookies) {
      try {
        await page.setCookie(cookie);
        console.log('✅ Set cookie:', cookie.name);
      } catch (e) {
        console.log('❌ Failed to set cookie:', cookie.name);
      }
    }
    
    // Try direct Figma access
    console.log('🌐 Navigating to Figma...');
    const figmaUrl = `https://www.figma.com/file/${process.env.FIGMA_FILE_KEY}`;
    
    await page.goto(figmaUrl, { 
      waitUntil: 'domcontentloaded', 
      timeout: 30000 
    });
    
    // Wait a bit for dynamic content
    await page.waitForTimeout(3000);
    
    const title = await page.title();
    console.log('📄 Page title:', title);
    
    // Check what's actually on the page
    const pageContent = await page.evaluate(() => {
      const body = document.body?.innerText || '';
      return {
        hasError: body.includes('ERROR') || body.includes('Access denied'),
        hasLogin: body.includes('Sign in') || body.includes('Log in'),
        hasFigma: typeof figma !== 'undefined',
        bodyStart: body.substring(0, 200)
      };
    });
    
    console.log('🔍 Page content:', pageContent);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return { success: false, error: error.message };
  } finally {
    if (browser) await browser.close();
  }
  
  return { success: true };
}

testFigmaAccess().then(console.log).catch(console.error);
