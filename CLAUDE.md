# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run build` — bundle `src/*.ts` with esbuild into `dist/`, and copy `manifest.json`, `overlay.css`, and `icons/` next to the bundles. `dist/` is wiped on every build.
- `npm run watch` — same as build, but rebuilds on file change (static assets are only copied on startup).
- `npm run typecheck` — `tsc --noEmit`; the real compilation is done by esbuild, so this is the only way to surface type errors.
- `npm run zip` — build, then zip `dist/` into `lab900-display-attributes.zip` for Chrome Web Store upload.

There is no test suite and no linter configured.

## Reloading in Chrome

Chrome loads the extension from `dist/`, not from `src/`. After any code change, run `npm run build` (or keep `watch` running) **and** click the reload button on the extension card at `chrome://extensions` — Chrome does not pick up file changes automatically.

## Architecture

Manifest V3 Chrome extension with two entry points and a one-shot message protocol between them:

- **`src/background.ts`** — service worker. Reacts to `chrome.action.onClicked` by calling `scripting.insertCSS` + `scripting.executeScript` on the active tab and then sending a `{ type: 'toggle' }` message. It re-injects on every click; the content script is responsible for not double-initialising.
- **`src/content.ts`** — content script. Wrapped in an IIFE that early-returns if `window.__lab900AttrInjected` is already set, so repeated `executeScript` calls are safe. Owns all overlay state (visible flag, entries list, MutationObserver, rAF loop) and flips on/off in response to each `toggle` message.

### Field detection

Two unrelated DOM shapes are labelled:

1. Form fields whose `id` matches `/^lab900-[a-z0-9-]+-field-(.+)$/i` — the attribute name is the trailing capture group.
2. CDK table headers (`.cdk-header-cell`) carrying a `cdk-column-<name>` class — dashes in the class name are converted back to dots to recover the original attribute path.

The same `lab900-*-field-*` id can appear multiple times in the DOM (e.g. inside hidden Angular templates). `selectFieldsToLabel` deduplicates id-based fields by name, preferring a rendered instance (`offsetParent !== null` or non-zero bounding rect). CDK headers are not deduplicated.

### Overlay lifecycle

- A single `#lab900-attr-overlay-root` div is appended to `<body>` and holds all `.lab900-attr-label` children. Styling lives in `overlay.css` and is injected via `scripting.insertCSS`, not bundled.
- `scan()` reconciles `entries[]` against the current DOM: it upserts labels for newly-discovered fields and removes labels for fields that have disappeared. A `MutationObserver` on `document.body` triggers `scheduleScan`, which coalesces bursts of mutations into one scan per microtask.
- `reposition()` runs every animation frame while the overlay is visible. It places each label above its field's bounding rect, and when two labels would overlap it walks the colliding label upward (`resolveTop`) so vertical neighbours stack instead of clobbering each other. Off-screen labels are hidden via `display: none` rather than removed.
- `hide()` tears down rAF + observer + scroll/resize listeners and removes the root element; state is fully rebuilt on the next `show()`. There is no cross-tab persistence — every page reload starts hidden.

### Build pipeline

`build.mjs` is the single source of truth — there is no webpack/rollup config. It bundles both entry points as IIFE for `chrome120`, and the static-asset copy step is what makes `dist/` a loadable unpacked extension. If you add a new static file (icon, CSS, etc.), it must be wired into `copyStatic()` in `build.mjs` or it will not reach `dist/`.
