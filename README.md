# browserdeck

Open any URL side-by-side in Chromium, Firefox, and WebKit — at multiple viewport sizes, with scroll positions synced across all windows. Spot rendering differences without switching browsers manually.

## Setup

```bash
npm install -g github:emboldagency/browserdeck
```

Browser binaries (~300 MB) are downloaded automatically on first run.

**Requirements:** Node.js ≥ 18

## Usage

```bash
browserdeck https://yoursite.com
```

## Default behavior

Running with just a URL opens **5 windows** with scroll sync on:

| Window | Engine | Viewport |
|--------|--------|----------|
| Chrome — mobile (Android) | Chromium | 375 × 667 |
| Chrome — desktop | Chromium | 1280 × 800 |
| WebKit — mobile (iOS) | WebKit | 375 × 667 |
| WebKit — desktop (Safari) | WebKit | 1280 × 800 |
| Firefox — desktop | Firefox | 1280 × 800 |

Firefox mobile is excluded (negligible market share). Scroll any window — all others follow in real time. Press `Ctrl+C` to quit and close all windows.

## Quickstart

```bash
# Built-in rendering showcase (no URL needed)
browserdeck --demo

# 5-window default (see table above)
browserdeck https://yoursite.com

# Chromium + WebKit, mobile only
browserdeck --engines chromium,webkit --viewports mobile https://yoursite.com

# All three engines at two viewport sizes (6 windows)
browserdeck --engines chromium,firefox,webkit --viewports mobile,desktop https://yoursite.com

# Disable scroll sync
browserdeck --no-sync https://yoursite.com

# Use a config file
browserdeck --config preview.config.js
```

## CLI Flags

| Flag | Description |
|------|-------------|
| `<url>` | URL to open in all windows (required unless `--demo` or set in config) |
| `--demo` | Launch the built-in cross-engine rendering showcase |
| `--engines <list>` | Comma-separated engines: `chromium`, `firefox`, `webkit` |
| `--viewports <list>` | Comma-separated preset names or `WxH` pairs |
| `--config <path>` | JS or JSON config file — overrides all flags |
| `--no-sync` | Disable scroll syncing |
| `--help`, `-h` | Print usage |

`--engines` and `--viewports` produce a cross-product: `--engines chromium,webkit --viewports mobile,desktop` → 4 windows (chromium×mobile, chromium×desktop, webkit×mobile, webkit×desktop).

### Viewport presets

| Name | Size |
|------|------|
| `mobile` | 375 × 667 |
| `tablet` | 768 × 1024 |
| `desktop` | 1280 × 800 |
| `wide` | 1920 × 1080 |

Custom dimensions also accepted: `--viewports 1440x900`

## Config File

Config file values override CLI flags, which override built-in defaults.

**`preview.config.js`** (ES module, engines/viewports cross-product):

```js
export default {
  url: 'https://yoursite.com',
  engines: ['chromium', 'webkit'],
  viewports: ['mobile', 'desktop'],
  syncScroll: true,
};
```

**`preview.config.js`** (explicit window list — full control):

```js
export default {
  url: 'https://yoursite.com',
  syncScroll: true,
  targets: [
    { engine: 'chromium', viewport: 'mobile',  label: 'Chrome Android' },
    { engine: 'webkit',   viewport: 'mobile',  label: 'Safari iOS' },
    { engine: 'chromium', viewport: '1440x900' },
    { engine: 'webkit',   viewport: { width: 1440, height: 900 } },
  ],
};
```

**`preview.config.json`**:

```json
{
  "url": "https://yoursite.com",
  "engines": ["chromium", "webkit"],
  "viewports": ["mobile", "1440x900"],
  "syncScroll": false
}
```

Run with a config file:

```bash
browserdeck --config preview.config.js
# url in config — no positional arg needed
```

## Built-in Demo Site

The package ships a demo page showcasing cross-engine CSS differences: backdrop filters, native inputs, scrollbars, subgrid, font smoothing, and more.

```bash
browserdeck --demo
```

No URL needed — starts a local server on port 8080 and launches the 5-window default against it.

## Try without installing

```bash
npx --yes github:emboldagency/browserdeck https://yoursite.com
```

The `--yes` skips npm's install confirmation prompt. After the first run the package is cached, so subsequent `npx` calls won't need it.

## Troubleshooting

### Browser windows don't appear (WSL / SSH / CI)

This tool always opens headed (visible) browser windows. Headless environments won't work. On WSL, you need a display server (e.g. VcXsrv or WSLg). On CI, use a different tool.

### Port 8080 already in use (demo script)

```bash
# Kill whatever's on 8080, then retry:
npx kill-port 8080
npm run demo
```

---

Vibe coded with [Claude Code](https://claude.com/claude-code).
