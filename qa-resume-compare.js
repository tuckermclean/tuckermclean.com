const { chromium } = require('playwright');
const path = require('path');

const OUTPUT_DIR = '/home/noumenon/Documents/gitrepos/tuckermclean.com/public/qa-screenshots';

const SITES = [
  { name: 'localhost', url: 'http://localhost:1313/#/resume' },
  { name: 'production', url: 'https://www.tuckermclean.com/#/resume' },
];

async function captureResume(browser, site) {
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });

  console.log(`\n--- Capturing: ${site.name} (${site.url}) ---`);
  await page.goto(site.url, { waitUntil: 'networkidle', timeout: 30000 });

  // Wait for resume modal/window to appear
  // Try multiple selectors that might indicate the resume is loaded
  try {
    await page.waitForSelector('.resume, #resume, [data-section="resume"], .modal, .window, .resume-window', {
      timeout: 8000,
    });
    console.log(`  Resume container found`);
  } catch (e) {
    console.log(`  No specific resume container found, waiting 3s...`);
    await page.waitForTimeout(3000);
  }

  // Full page screenshot after load
  await page.screenshot({
    path: path.join(OUTPUT_DIR, `${site.name}-resume-full.png`),
    fullPage: true,
  });
  console.log(`  Saved: ${site.name}-resume-full.png`);

  // Viewport screenshot
  await page.screenshot({
    path: path.join(OUTPUT_DIR, `${site.name}-resume-viewport.png`),
  });
  console.log(`  Saved: ${site.name}-resume-viewport.png`);

  // Try to find and scroll to Education section
  const educationFound = await page.evaluate(() => {
    // Look for Education heading by text content
    const allHeadings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6'));
    const eduHeading = allHeadings.find(h =>
      h.textContent.toLowerCase().includes('education') ||
      h.textContent.toLowerCase().includes('certification')
    );
    if (eduHeading) {
      eduHeading.scrollIntoView({ behavior: 'instant', block: 'start' });
      return { found: true, tag: eduHeading.tagName, text: eduHeading.textContent.trim() };
    }
    // Also try section ids or data attributes
    const eduSection = document.querySelector('#education, #certifications, [id*="edu"], [id*="cert"]');
    if (eduSection) {
      eduSection.scrollIntoView({ behavior: 'instant', block: 'start' });
      return { found: true, id: eduSection.id, tag: eduSection.tagName };
    }
    return { found: false };
  });

  console.log(`  Education section: ${JSON.stringify(educationFound)}`);

  await page.waitForTimeout(500);

  // Screenshot at current scroll position (Education area)
  await page.screenshot({
    path: path.join(OUTPUT_DIR, `${site.name}-education-scroll.png`),
  });
  console.log(`  Saved: ${site.name}-education-scroll.png`);

  // Try to get bounding box of the education section area for a close-up crop
  const educationClip = await page.evaluate(() => {
    const allHeadings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6'));
    const eduHeading = allHeadings.find(h =>
      h.textContent.toLowerCase().includes('education') ||
      h.textContent.toLowerCase().includes('certification')
    );
    if (eduHeading) {
      const rect = eduHeading.getBoundingClientRect();
      return {
        x: 0,
        y: Math.max(0, rect.top - 40),
        width: window.innerWidth,
        height: Math.min(600, window.innerHeight - Math.max(0, rect.top - 40)),
      };
    }
    return null;
  });

  if (educationClip && educationClip.height > 50) {
    await page.screenshot({
      path: path.join(OUTPUT_DIR, `${site.name}-education-closeup.png`),
      clip: educationClip,
    });
    console.log(`  Saved: ${site.name}-education-closeup.png (clip: ${JSON.stringify(educationClip)})`);
  }

  // Scroll a bit further to see what follows Education
  await page.evaluate(() => window.scrollBy(0, 300));
  await page.waitForTimeout(300);
  await page.screenshot({
    path: path.join(OUTPUT_DIR, `${site.name}-post-education.png`),
  });
  console.log(`  Saved: ${site.name}-post-education.png`);

  // Dump all heading info for analysis
  const headings = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).map(h => {
      const rect = h.getBoundingClientRect();
      const style = window.getComputedStyle(h);
      return {
        tag: h.tagName,
        text: h.textContent.trim().substring(0, 80),
        float: style.float,
        display: style.display,
        position: style.position,
        width: style.width,
        marginBottom: style.marginBottom,
        clear: style.clear,
        boundingRect: {
          top: Math.round(rect.top + window.scrollY),
          left: Math.round(rect.left),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
      };
    });
  });

  require('fs').writeFileSync(
    path.join(OUTPUT_DIR, `${site.name}-headings.json`),
    JSON.stringify(headings, null, 2)
  );
  console.log(`  Saved: ${site.name}-headings.json (${headings.length} headings)`);

  await page.close();
}

(async () => {
  const browser = await chromium.launch({ headless: true });

  for (const site of SITES) {
    try {
      await captureResume(browser, site);
    } catch (err) {
      console.error(`ERROR capturing ${site.name}:`, err.message);
    }
  }

  await browser.close();
  console.log('\nDone. Screenshots saved to:', OUTPUT_DIR);
})();
