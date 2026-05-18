import { chromium, firefox, webkit } from 'playwright';
import { existsSync } from 'fs';
import { execFileSync } from 'child_process';
import { createRequire } from 'module';
import { dirname, join } from 'path';
import { wireSync } from './sync.js';

const _require = createRequire(import.meta.url);
const IS_LINUX = process.platform === 'linux';
const ENGINE_MAP = { chromium, firefox, webkit };

export const VIEWPORT_PRESETS = {
  mobile:  { width: 375,  height: 667  },
  tablet:  { width: 768,  height: 1024 },
  desktop: { width: 1280, height: 800  },
  wide:    { width: 1920, height: 1080 },
};

async function ensureBrowsers(engines) {
  const missing = [...new Set(engines)].filter(name => {
    try { return !existsSync(ENGINE_MAP[name].executablePath()); }
    catch { return true; }
  });
  if (missing.length === 0) return;

  console.log(`Playwright browser binaries not found: ${missing.join(', ')}`);
  console.log('Installing now (one-time, ~300 MB)...\n');
  const pkgDir = dirname(_require.resolve('playwright/package.json'));
  const cli = join(pkgDir, 'cli.js');
  execFileSync(process.execPath, [cli, 'install', ...missing], { stdio: 'inherit' });
  console.log('');
}

export async function launch({ url, targets, syncScroll = true }) {
  await ensureBrowsers(targets.map(t => t.engine));

  const browsers = [];
  const pages = [];

  // Close all browsers on Ctrl+C. Force-exit after 3s if cleanup hangs.
  const cleanup = async () => {
    setTimeout(() => process.exit(0), 3000).unref();
    await Promise.allSettled(browsers.map(b => b.close()));
    process.exit(0);
  };
  process.once('SIGINT', cleanup);
  process.once('SIGTERM', cleanup);

  console.log(`Launching ${targets.length} window(s) → ${url}\n`);

  try {
    for (const t of targets) {
      const engine = ENGINE_MAP[t.engine];
      if (!engine) throw new Error(`Unknown engine: "${t.engine}". Valid: chromium, firefox, webkit`);

      let browser;
      try {
        browser = await engine.launch({ headless: false });
      } catch (err) {
        if (IS_LINUX && t.engine === 'webkit') {
          console.error(
            `\nFailed to launch WebKit on Linux. This usually means required GTK3+ system\n` +
            `libraries are missing. Install them with:\n\n` +
            `  sudo apt-get install libgdk-pixbuf2.0-0 libglib2.0-0 libxkbcommon0\n\n` +
            `Or skip WebKit with: browserdeck --engines chromium,firefox <url>\n`
          );
          process.exit(1);
        }
        throw err;
      }
      browsers.push(browser);

      const context = await browser.newContext({ viewport: t.viewport });
      const page = await context.newPage();

      await page.addInitScript((label) => {
        window.addEventListener('DOMContentLoaded', () => {
          document.title = `[${label}] ` + document.title;
        });
      }, t.label);

      pages.push(page);
      console.log(`  ✓ ${t.label}`);
    }

    if (syncScroll) await wireSync(pages);

    // Navigate after sync wiring so addInitScript is in place for the first load.
    await Promise.all(targets.map((_, i) => pages[i].goto(url)));
  } catch (err) {
    await Promise.allSettled(browsers.map(b => b.close()));
    throw err;
  }

  console.log(`\nAll windows open.${syncScroll ? ' Scroll any one — the rest will follow.' : ''}`);
  console.log('Press Ctrl+C to quit.\n');

  await new Promise(() => {});
}
