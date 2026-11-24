const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const url = process.env.KAIROS_QA_URL || 'http://127.0.0.1:4185/kairos-app/';
const executablePath = process.env.KAIROS_CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const seen = 'kairos_onboarding_seen_version';
const slides = ['welcome', 'planning', 'focus', 'habits', 'offline'];

async function finishIntro(page) {
  const iframe = page.frameLocator('iframe[title="معرفی کایروس"]');
  const next = iframe.locator('#kairos-intro-next');
  for (const id of slides) {
    await iframe.locator('#kairos-intro-status').waitFor();
    const frame = page.frames().find(frame => frame.url().includes('/kairos-intro/kairos-intro.html'));
    assert.equal(await frame.evaluate(() => window.KairosIntro.getState().slideId), id);
    if (id === 'welcome') {
      await frame.waitForFunction(() => document.querySelector('.kairos-intro-logo')?.naturalWidth > 0);
    }
    if (id === 'planning') {
      await frame.waitForFunction(() => document.querySelector('.kairos-intro-task-title')?.textContent.length > 0);
    }
    await next.click();
  }
  await page.locator('iframe[title="معرفی کایروس"]').waitFor({state:'detached'});
  await page.locator('main').waitFor();
  assert.equal(await page.evaluate(key => localStorage.getItem(key), seen), '1');
}

(async () => {
  const browser = await chromium.launch({executablePath, headless:true});
  try {
    const context = await browser.newContext({locale:'fa-IR', reducedMotion:'no-preference'});
    const page = await context.newPage();
    page.setDefaultTimeout(6000);
    await page.goto(url);
    if (process.env.KAIROS_EXPECTED_BUILD) {
      assert.equal(await page.locator('meta[name=kairos-build]').getAttribute('content'), process.env.KAIROS_EXPECTED_BUILD);
    }
    await finishIntro(page);
    console.log('PASS first visit: all five slides, logo, animation and entry');
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);

    // Simulate a first launch in a browser where the worker already controls the app.
    await page.evaluate(key => localStorage.removeItem(key), seen);
    await page.reload();
    await finishIntro(page);
    console.log('PASS all slides with an active service worker');

    await page.goto(new URL('?intro=1', url).href);
    await finishIntro(page);
    console.log('PASS explicit replay with the seen flag already stored');

    await page.evaluate(key => localStorage.removeItem(key), seen);
    await context.setOffline(true);
    await page.goto(url);
    await finishIntro(page);
    console.log('PASS cached introduction and entry with the network off');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode=1; });
