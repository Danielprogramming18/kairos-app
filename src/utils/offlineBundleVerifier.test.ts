import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { auditBundleContents, verifyOfflineDistDirectory } from './offlineBundleVerifier.ts';

describe('Offline Bundle Verifier (Android Sketchware WebView & Windows Handoff)', () => {
  it('passes valid offline bundle with relative ./assets/ paths, RTL html attributes, and local .woff2 fonts', () => {
    const report = auditBundleContents({
      distDir: '/mock/dist',
      indexHtml: `<!doctype html>
<html lang="fa" dir="rtl" class="dark">
  <head>
    <meta charset="UTF-8" />
    <script type="module" crossorigin src="./assets/index-abc.js"></script>
    <link rel="stylesheet" crossorigin href="./assets/index-abc.css">
  </head>
  <body><div id="root"></div></body>
</html>`,
      cssContents: [
        {
          file: 'assets/index-abc.css',
          content: '@font-face { font-family: "Vazirmatn Variable"; src: url(./vazirmatn-arabic-wght-normal.woff2) format("woff2-variations"); }',
        },
      ],
      assetFiles: [
        'index-abc.js',
        'index-abc.css',
        'vazirmatn-arabic-wght-normal.woff2',
        'vazirmatn-latin-wght-normal.woff2',
      ],
    });

    assert.equal(report.ok, true);
    assert.equal(report.issues.length, 0);
    assert.equal(report.woff2Count, 2);
    assert.equal(report.jsCount, 1);
    assert.equal(report.cssCount, 1);
  });

  it('rejects absolute /assets/ paths and external Google Fonts CDN links that break offline WebView', () => {
    const report = auditBundleContents({
      distDir: '/mock/dist',
      indexHtml: `<!doctype html>
<html lang="en">
  <head>
    <link href="https://fonts.googleapis.com/css2?family=Vazirmatn" rel="stylesheet">
    <script type="module" src="/assets/index-abc.js"></script>
  </head>
  <body></body>
</html>`,
      cssContents: [],
      assetFiles: ['index-abc.js', 'index-abc.css'],
    });

    assert.equal(report.ok, false);
    const codes = report.issues.map((i) => i.code);
    assert.ok(codes.includes('ABSOLUTE_ASSET_PATH'));
    assert.ok(codes.includes('MISSING_RTL_LANG_ATTR'));
    assert.ok(codes.includes('EXTERNAL_CDN_URL'));
    assert.ok(codes.includes('MISSING_WOFF2_FONTS'));
  });

  it('audits the real built dist/ directory on disk when present', () => {
    const distPath = path.resolve(process.cwd(), 'dist');
    if (!fs.existsSync(path.join(distPath, 'index.html'))) {
      return;
    }
    const report = verifyOfflineDistDirectory(distPath);
    assert.equal(
      report.ok,
      true,
      `Expected dist/ to pass offline WebView audit, but found issues: ${JSON.stringify(report.issues)}`
    );
    assert.ok(report.woff2Count >= 1, 'Expected at least 1 bundled .woff2 font file in dist/assets');
    assert.ok(report.jsCount >= 1, 'Expected at least 1 bundled .js file in dist/assets');
    assert.ok(report.cssCount >= 1, 'Expected at least 1 bundled .css file in dist/assets');
  });
});
