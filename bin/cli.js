#!/usr/bin/env node
// Suppress deprecation warnings from transitive deps (e.g. util._extend in playwright's tree)
process.noDeprecation = true;
import { readFileSync, existsSync } from 'fs';
import { resolve, extname, dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { launch, VIEWPORT_PRESETS } from '../lib/launcher.js';
import { startServer } from '../lib/server.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITE_DIR = join(__dirname, '..', 'site');

const HELP = `
Usage: browserdeck [options] <url>
       browserdeck --demo

Arguments:
  url                   URL to open in all browser windows

Options:
  --demo                Launch the built-in cross-engine rendering showcase
  --engines <list>      Comma-separated engines; combined with --viewports as a cross-product
  --viewports <list>    Comma-separated preset names or WxH pairs; combined with --engines
                        Presets: mobile (375x667), tablet (768x1024),
                                 desktop (1280x800), wide (1920x1080)
  --config <path>       JS or JSON config file (overrides all other flags)
  --no-sync             Disable scroll syncing across windows
  --help, -h            Show this help message

Default (no flags): opens 5 windows —
  Chrome mobile (Android), Chrome desktop,
  WebKit mobile (iOS), WebKit desktop (Safari),
  Firefox desktop

Config file shape (JS module or JSON):
  { url, engines, viewports, syncScroll }
  or with explicit window list:
  { url, syncScroll, targets: [{ engine, viewport, label? }, ...] }
  viewport can be a preset name, "WxH" string, or { width, height } object

Examples:
  browserdeck https://example.com
  browserdeck --demo
  browserdeck --engines chromium,webkit --viewports mobile,desktop https://example.com
  browserdeck --no-sync https://example.com
  browserdeck --config ./preview.config.js
`.trimStart();

function parseArgs(argv) {
  const args = argv.slice(2);
  const result = {
    url: null,
    engines: null,
    viewports: null,
    config: null,
    syncScroll: true,
    demo: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--help' || a === '-h') { result.help = true; }
    else if (a === '--no-sync')       { result.syncScroll = false; }
    else if (a === '--demo')          { result.demo = true; }
    else if (a === '--engines')       { result.engines  = args[++i]; }
    else if (a === '--viewports')     { result.viewports = args[++i]; }
    else if (a === '--config')        { result.config   = args[++i]; }
    else if (!a.startsWith('--'))     { result.url = a; }
    else { console.error(`Unknown flag: ${a}\n`); process.exit(1); }
  }

  return result;
}

function parseViewport(val) {
  if (val && typeof val === 'object') return val; // already { width, height }
  const preset = VIEWPORT_PRESETS[val];
  if (preset) return preset;

  const match = String(val).match(/^(\d+)[xX](\d+)$/);
  if (match) return { width: Number(match[1]), height: Number(match[2]) };

  console.error(`Unknown viewport: "${val}". Use a preset name or WxH (e.g. 1440x900).`);
  process.exit(1);
}

function buildTargets(engines, viewports) {
  const targets = [];
  for (const engine of engines) {
    for (const viewport of viewports) {
      const vp = parseViewport(viewport);
      const label = `${engine[0].toUpperCase()}${engine.slice(1)} — ${viewport}`;
      targets.push({ engine, label, viewport: vp });
    }
  }
  return targets;
}

async function loadConfig(configPath) {
  const abs = resolve(configPath);
  if (!existsSync(abs)) {
    console.error(`Config file not found: ${abs}`);
    process.exit(1);
  }

  const ext = extname(abs).toLowerCase();
  if (ext === '.json') {
    return JSON.parse(readFileSync(abs, 'utf8'));
  }

  const mod = await import(pathToFileURL(abs).href);
  return mod.default ?? mod;
}

async function main() {
  const flags = parseArgs(process.argv);

  if (flags.help) { process.stdout.write(HELP); process.exit(0); }

  // When --engines/--viewports are not provided, use explicit default targets
  // rather than a cross-product (Firefox desktop only, not mobile).
  const DEFAULT_TARGETS = [
    { engine: 'chromium', viewport: 'mobile',   label: 'Chrome — mobile (Android)'  },
    { engine: 'chromium', viewport: 'desktop',  label: 'Chrome — desktop'            },
    { engine: 'webkit',   viewport: 'mobile',   label: 'WebKit — mobile (iOS)'       },
    { engine: 'webkit',   viewport: 'desktop',  label: 'WebKit — desktop (Safari)'   },
    { engine: 'firefox',  viewport: 'desktop',  label: 'Firefox — desktop'           },
  ];

  let syncScroll = flags.syncScroll;
  let url = flags.url;

  // --demo: serve the bundled site and launch against it
  if (flags.demo) {
    const port = 8080;
    const server = await startServer(SITE_DIR, port);
    url = `http://localhost:${port}`;
    console.log(`Demo server running at ${url}\n`);
    const resolvedTargets = DEFAULT_TARGETS.map(t => ({ ...t, viewport: parseViewport(t.viewport) }));
    process.once('exit', () => server.close());
    await launch({ url, targets: resolvedTargets, syncScroll });
    return;
  }

  // Config file overrides everything
  if (flags.config) {
    const cfg = await loadConfig(flags.config);
    if (cfg.syncScroll !== undefined) syncScroll = cfg.syncScroll;
    if (cfg.url) url = cfg.url;

    // Config can supply explicit targets OR engines+viewports cross-product
    if (cfg.targets) {
      const targets = cfg.targets.map(t => {
        const vp    = parseViewport(t.viewport);
        const vpStr = typeof t.viewport === 'string' ? t.viewport : `${vp.width}x${vp.height}`;
        return {
          engine:   t.engine,
          viewport: vp,
          label:    t.label ?? `${t.engine[0].toUpperCase()}${t.engine.slice(1)} — ${vpStr}`,
        };
      });
      if (!url) { console.error('Error: a URL is required.\n\nRun with --help for usage.\n'); process.exit(1); }
      await launch({ url, targets, syncScroll });
      return;
    }

    if (cfg.engines || cfg.viewports) {
      const engines   = cfg.engines   ? (Array.isArray(cfg.engines)   ? cfg.engines   : cfg.engines.split(',').map(s => s.trim()))   : ['chromium', 'webkit'];
      const viewports = cfg.viewports ? (Array.isArray(cfg.viewports) ? cfg.viewports : cfg.viewports.split(',').map(s => s.trim())) : ['desktop'];
      if (!url) { console.error('Error: a URL is required.\n\nRun with --help for usage.\n'); process.exit(1); }
      await launch({ url, targets: buildTargets(engines, viewports), syncScroll });
      return;
    }
  }

  // --engines / --viewports flags → cross-product
  if (flags.engines || flags.viewports) {
    const engines   = flags.engines   ? flags.engines.split(',').map(s => s.trim())   : ['chromium', 'firefox', 'webkit'];
    const viewports = flags.viewports ? flags.viewports.split(',').map(s => s.trim()) : ['desktop'];
    const validEngines = ['chromium', 'firefox', 'webkit'];
    for (const e of engines) {
      if (!validEngines.includes(e)) {
        console.error(`Unknown engine: "${e}". Valid: ${validEngines.join(', ')}`);
        process.exit(1);
      }
    }
    if (!url) { console.error('Error: a URL is required.\n\nRun with --help for usage.\n'); process.exit(1); }
    await launch({ url, targets: buildTargets(engines, viewports), syncScroll });
    return;
  }

  // No flags — use curated defaults
  if (!url) { console.error('Error: a URL is required.\n\nRun with --help for usage.\n'); process.exit(1); }
  const resolvedTargets = DEFAULT_TARGETS.map(t => ({ ...t, viewport: parseViewport(t.viewport) }));
  await launch({ url, targets: resolvedTargets, syncScroll });
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
