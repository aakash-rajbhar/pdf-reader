# PDF Reader

A minimal, fast, and beautiful PDF reader desktop application built with **Tauri + React + PDF.js**.

![Dark Mode](https://img.shields.io/badge/theme-dark%20%2F%20light-informational)
![Stack](https://img.shields.io/badge/stack-Tauri%20%2B%20React%20%2B%20PDF.js-blue)
![License](https://img.shields.io/badge/license-MIT-green)

---

## ✨ Features

- 📄 Open any PDF — single page or 1000+ page documents
- ⚡ Lazy page rendering with LRU cache (only renders what you see)
- 🔍 Zoom in / out (25% → 400%), click zoom % to type exact value
- 📖 Smooth page navigation — click, keyboard arrows, or type page number
- 🌙 Dark / Light mode with animated transitions (persisted across sessions)
- 🖱️ Drag to pan when zoomed in
- 🖱️ Ctrl + Scroll to zoom
- 🗂️ Drag & drop a PDF onto the window to open it
- ⌨️ Full keyboard shortcuts
- 📦 Tiny bundle — ~10MB app, ~40MB RAM usage

---

## 🚀 Quick Start

### Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | ≥ 18 | https://nodejs.org |
| Rust | stable | https://rustup.rs |
| System deps | — | See below |

### System Dependencies

**macOS** — No extra steps needed.

**Windows** — Install [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with "Desktop development with C++" workload selected.

**Linux (Ubuntu/Debian)**
```bash
sudo apt update && sudo apt install -y \
  libwebkit2gtk-4.1-dev \
  libgtk-3-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  patchelf
```

**Linux (Fedora/RHEL)**
```bash
sudo dnf install webkit2gtk4.1-devel gtk3-devel librsvg2-devel
```

---

## 📦 Installation & Running

```bash
# 1. Clone / unzip the project
cd pdf-reader

# 2. Install JS dependencies
npm install

# 3a. Run in development mode (live reload)
npm run tauri dev

# 3b. OR build a native binary for your OS
npm run tauri build
# Output: src-tauri/target/release/bundle/
```

---

## 🌐 Run as a Web App (no Rust needed)

If you just want to test the UI in a browser without Tauri:

```bash
npm install
npm run dev
# Open http://localhost:1420
```

> In browser mode, "Open PDF" uses the native `<input type="file">` picker instead of the OS dialog. All other features work identically.

---

## ⌨️ Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Open file | `Ctrl / ⌘ + O` |
| Next page | `→` `↓` `Space` |
| Previous page | `←` `↑` |
| Zoom in | `Ctrl / ⌘ + =` |
| Zoom out | `Ctrl / ⌘ + -` |
| Reset zoom | `Ctrl / ⌘ + 0` |
| Scroll to pan | Mouse wheel |
| Zoom with scroll | `Ctrl + Scroll` |
| Drag to pan | Click & drag |

---

## 🗂️ Project Structure

```
pdf-reader/
├── src/                        # React frontend
│   ├── App.tsx                 # Root app, file-open handler, drag & drop
│   ├── main.tsx                # React entry point
│   ├── hooks/
│   │   ├── usePDF.ts           # PDF.js engine: load, render, cache, navigate
│   │   └── useTheme.tsx        # Dark/light theme context + localStorage persist
│   ├── components/
│   │   ├── Toolbar.tsx         # Top bar: open, navigation, zoom, theme toggle
│   │   ├── Toolbar.module.css
│   │   ├── PDFViewer.tsx       # Canvas renderer + empty/loading/error states
│   │   ├── PDFViewer.module.css
│   │   ├── StatusBar.tsx       # Bottom info bar
│   │   └── StatusBar.module.css
│   ├── styles/
│   │   └── globals.css         # CSS custom properties (theme tokens), scrollbar
│   └── types/
│       ├── css.d.ts            # CSS module type declarations
│       └── tauri-plugins.d.ts  # Tauri plugin type stubs
├── src-tauri/                  # Rust / Tauri backend
│   ├── src/
│   │   ├── main.rs             # Tauri setup, window config, read_pdf_file command
│   │   └── lib.rs
│   ├── capabilities/
│   │   └── default.json        # Tauri v2 permission grants
│   ├── tauri.conf.json         # App metadata, window size, bundle config
│   ├── Cargo.toml
│   └── build.rs
├── index.html
├── vite.config.ts
├── tsconfig.json
└── package.json
```

---

## ⚙️ Performance Architecture

### Lazy Rendering
Only the **current page** is rendered to the canvas. No upfront processing of the whole document.

### LRU Page Cache
After rendering a page, it's stored as an `ImageBitmap` (GPU-resident). Revisiting a cached page is **instant** — just a `drawImage` call.

```
Cache holds up to 20 pages × zoom level
e.g.  "5-1.00" = page 5 at 100% zoom
```

### Background Prefetch
After rendering the current page, pages ±2 ahead/behind are rendered on an **offscreen canvas** in the background so flipping pages feels instantaneous.

### HiDPI / Retina Support
Canvas is sized at `zoom × devicePixelRatio` then CSS-scaled back, giving crisp rendering on all displays.

---

## 🎨 Theming

All colors are CSS custom properties on `:root`. Switching themes just swaps the `data-theme` attribute on `<html>` — no re-render, no flicker.

```css
[data-theme="dark"]  { --bg-primary: #0c0c0c; --text-primary: #f0f0f0; ... }
[data-theme="light"] { --bg-primary: #f2f2f2; --text-primary: #111111; ... }
```

Theme preference is persisted in `localStorage` and restored on next launch.

---

## 📦 Building for Distribution

```bash
npm run tauri build
```

Output locations:
- **macOS**: `src-tauri/target/release/bundle/macos/PDF Reader.app` + `.dmg`
- **Windows**: `src-tauri/target/release/bundle/msi/` + `nsis/`
- **Linux**: `src-tauri/target/release/bundle/deb/` + `appimage/`

Final binary size is typically **8–14 MB**.

---

## 🛠️ Customisation Tips

**Change default window size** — edit `width`/`height` in `src-tauri/tauri.conf.json`

**Change accent color** — edit `--accent` in both theme blocks in `src/styles/globals.css`

**Increase page cache size** — change the `> 20` guard in `usePDF.ts` `renderPage()`

**Change zoom step** — edit `ZOOM_STEP` constant in `usePDF.ts`

---

## 📄 License

MIT
