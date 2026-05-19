# Lab900 Display Attributes

Chrome extension that toggles a floating overlay showing the underlying attribute name above each `lab900-*-field-*` form field on the current page.

## Requirements

- Node.js 18+
- Google Chrome (or any Chromium-based browser that supports Manifest V3)

## Build

The extension is written in TypeScript and bundled with esbuild. The browser loads the compiled output from `dist/`, not the sources.

```bash
npm install
npm run build
```

This produces a loadable extension in `dist/` containing `manifest.json`, the compiled `background.js` and `content.js`, `overlay.css`, and the `icons/` folder.

Other scripts:

- `npm run watch` — rebuild on file change during development.
- `npm run typecheck` — run `tsc --noEmit` without bundling.
- `npm run zip` — build and package `dist/` into `lab900-display-attributes.zip` (suitable for upload to the Chrome Web Store).

## Load the extension in Chrome

1. Run `npm run build` (this creates the `dist/` folder).
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked**.
5. Select the `dist/` folder of this project. The extension will appear in the list and its icon will be added to the toolbar.

After making code changes, run `npm run build` again (or keep `npm run watch` running) and hit the reload button on the extension card in `chrome://extensions`.

## Usage

1. Navigate to a page that contains `lab900-*-field-*` elements.
2. Click the extension's toolbar icon to **show** the overlay — each matching field gets a small label above it with its attribute name.
3. Click the toolbar icon again to **hide** the overlay.

The overlay tracks scrolling, resizing, and DOM mutations, so it stays in sync as the page changes. State is per-tab and resets on page reload.

## Project layout

```
src/              TypeScript sources
  background.ts   Service worker — handles the toolbar click
  content.ts      Content script — injects and toggles the overlay
manifest.json     MV3 manifest (copied to dist/ at build time)
overlay.css       Overlay styles (copied to dist/ at build time)
icons/            Toolbar icons (copied to dist/ at build time)
build.mjs         esbuild bundler + static-asset copier
tsconfig.json     strict TypeScript config (noEmit)
```
