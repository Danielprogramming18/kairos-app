import fs from 'node:fs';
import path from 'node:path';

export interface BundleAuditIssue {
  code:
    | 'MISSING_INDEX_HTML'
    | 'ABSOLUTE_ASSET_PATH'
    | 'EXTERNAL_CDN_URL'
    | 'MISSING_RTL_LANG_ATTR'
    | 'MISSING_WOFF2_FONTS'
    | 'MISSING_JS_BUNDLE'
    | 'MISSING_CSS_BUNDLE';
  message: string;
  file: string;
}

export interface BundleAuditReport {
  ok: boolean;
  checkedAt: string;
  distDir: string;
  assetFiles: string[];
  woff2Count: number;
  jsCount: number;
  cssCount: number;
  issues: BundleAuditIssue[];
}

const EXTERNAL_CDN_PATTERNS = [
  /https?:\/\/fonts\.googleapis\.com/i,
  /https?:\/\/fonts\.gstatic\.com/i,
  /https?:\/\/cdn\.jsdelivr\.net/i,
  /https?:\/\/unpkg\.com/i,
  /https?:\/\/cdnjs\.cloudflare\.com/i,
];

/**
 * Pure audit function for HTML + CSS + asset list so both unit tests and on-disk `dist/`
 * verification can validate Sketchware WebView (`file:///android_asset/www/index.html`)
 * and Windows offline bundle readiness.
 */
export function auditBundleContents(params: {
  distDir: string;
  indexHtml: string | null;
  cssContents: Array<{ file: string; content: string }>;
  assetFiles: string[];
}): BundleAuditReport {
  const issues: BundleAuditIssue[] = [];
  const { distDir, indexHtml, cssContents, assetFiles } = params;

  const woff2Files = assetFiles.filter((f) => f.toLowerCase().endsWith('.woff2'));
  const jsFiles = assetFiles.filter((f) => f.toLowerCase().endsWith('.js'));
  const cssFiles = assetFiles.filter((f) => f.toLowerCase().endsWith('.css'));

  if (!indexHtml) {
    issues.push({
      code: 'MISSING_INDEX_HTML',
      message: 'فایل dist/index.html یافت نشد. ابتدا npm run build را اجرا کنید.',
      file: 'index.html',
    });
  } else {
    // 1. Check relative asset paths (must not have src="/assets/..." or href="/assets/...")
    const absoluteAssetRegex = /\b(?:src|href)=["']\/assets\//i;
    if (absoluteAssetRegex.test(indexHtml)) {
      issues.push({
        code: 'ABSOLUTE_ASSET_PATH',
        message:
          'مسیر مطلق /assets/ در index.html یافت شد که در file:///android_asset/www/index.html شکسته می‌شود؛ باید ./assets/ باشد.',
        file: 'index.html',
      });
    }

    // 2. Check RTL and Persian lang attribute
    const hasLangFa = /<html[^>]*\blang=["']fa["']/i.test(indexHtml);
    const hasDirRtl = /<html[^>]*\bdir=["']rtl["']/i.test(indexHtml);
    if (!hasLangFa || !hasDirRtl) {
      issues.push({
        code: 'MISSING_RTL_LANG_ATTR',
        message: 'تگ <html> در index.html باید دارای lang="fa" و dir="rtl" باشد.',
        file: 'index.html',
      });
    }

    // 3. Check external CDN references in index.html
    for (const pattern of EXTERNAL_CDN_PATTERNS) {
      if (pattern.test(indexHtml)) {
        issues.push({
          code: 'EXTERNAL_CDN_URL',
          message: `ارجاع به CDN خارجی (${pattern.source}) در index.html یافت شد که در حالت آفلاین کار نمی‌کند.`,
          file: 'index.html',
        });
      }
    }
  }

  // 4. Check external CDN references inside CSS files
  for (const css of cssContents) {
    for (const pattern of EXTERNAL_CDN_PATTERNS) {
      if (pattern.test(css.content)) {
        issues.push({
          code: 'EXTERNAL_CDN_URL',
          message: `ارجاع به CDN خارجی (${pattern.source}) در فایل استایل ${css.file} یافت شد.`,
          file: css.file,
        });
      }
    }
  }

  // 5. Check bundled local Vazirmatn .woff2 font files
  if (woff2Files.length === 0) {
    issues.push({
      code: 'MISSING_WOFF2_FONTS',
      message: 'هیچ فایل فونت محلی (.woff2) در dist/assets یافت نشد.',
      file: 'assets/',
    });
  }

  if (jsFiles.length === 0) {
    issues.push({
      code: 'MISSING_JS_BUNDLE',
      message: 'هیچ فایل جاوااسکریپتی (.js) در dist/assets یافت نشد.',
      file: 'assets/',
    });
  }

  if (cssFiles.length === 0) {
    issues.push({
      code: 'MISSING_CSS_BUNDLE',
      message: 'هیچ فایل استایلی (.css) در dist/assets یافت نشد.',
      file: 'assets/',
    });
  }

  return {
    ok: issues.length === 0,
    checkedAt: new Date().toISOString(),
    distDir,
    assetFiles,
    woff2Count: woff2Files.length,
    jsCount: jsFiles.length,
    cssCount: cssFiles.length,
    issues,
  };
}

/**
 * Audits the physical `dist/` directory on disk.
 */
export function verifyOfflineDistDirectory(distDir = path.resolve(process.cwd(), 'dist')): BundleAuditReport {
  const indexPath = path.join(distDir, 'index.html');
  const assetsDir = path.join(distDir, 'assets');

  const indexHtml = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, 'utf-8') : null;
  const assetFiles = fs.existsSync(assetsDir) ? fs.readdirSync(assetsDir) : [];

  const cssContents = assetFiles
    .filter((file) => file.toLowerCase().endsWith('.css'))
    .map((file) => ({
      file: `assets/${file}`,
      content: fs.readFileSync(path.join(assetsDir, file), 'utf-8'),
    }));

  return auditBundleContents({
    distDir,
    indexHtml,
    cssContents,
    assetFiles,
  });
}
