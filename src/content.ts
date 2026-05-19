/**
 * Content script: renders floating labels above Lab900 form fields and CDK
 * table headers, showing their attribute name. Toggled by a message from the
 * background script.
 */

interface LabelEntry {
  field: Element;
  label: HTMLDivElement;
  name: string;
}

interface ToggleMessage {
  type: 'toggle';
}

(() => {
  const w = window as typeof window & { __lab900AttrInjected?: boolean };
  if (w.__lab900AttrInjected) return;
  w.__lab900AttrInjected = true;

  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------

  const ROOT_ID = 'lab900-attr-overlay-root';
  const LABEL_CLASS = 'lab900-attr-label';

  // Lab900 form field ids look like `lab900-<form>-field-<name>`.
  const FIELD_ID_PATTERN = /^lab900-[a-z0-9-]+-field-(.+)$/i;
  const FIELD_SELECTOR = '[id^="lab900-"][id*="-field-"]';

  // CDK table headers carry a `cdk-column-<name>` class with dashes encoding dots.
  const CDK_COLUMN_CLASS_PREFIX = 'cdk-column-';
  const CDK_HEADER_SELECTOR = '.cdk-header-cell[class*="cdk-column-"]';

  const SELECTOR = `${FIELD_SELECTOR}, ${CDK_HEADER_SELECTOR}`;

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  let visible = false;
  let rafId: number | null = null;
  let mo: MutationObserver | null = null;
  let entries: LabelEntry[] = [];
  let scanScheduled = false;

  // ---------------------------------------------------------------------------
  // Name resolution
  // ---------------------------------------------------------------------------

  function nameFromCdkColumn(el: Element): string | null {
    for (const cls of Array.from(el.classList)) {
      if (cls.startsWith(CDK_COLUMN_CLASS_PREFIX) && cls.length > CDK_COLUMN_CLASS_PREFIX.length) {
        return cls.slice(CDK_COLUMN_CLASS_PREFIX.length).replace(/-/g, '.');
      }
    }
    return null;
  }

  function nameFor(el: Element): string | null {
    if (el.id) {
      const match = el.id.match(FIELD_ID_PATTERN);
      if (match) return match[1];
    }
    if (el.classList.contains('cdk-header-cell')) {
      return nameFromCdkColumn(el);
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // DOM helpers
  // ---------------------------------------------------------------------------

  function ensureRoot(): HTMLElement {
    let root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement('div');
      root.id = ROOT_ID;
      document.body.appendChild(root);
    }
    return root;
  }

  function isRendered(el: Element): boolean {
    const html = el as HTMLElement;
    if (!html.isConnected) return false;
    if (html.offsetParent !== null) return true;
    const rect = html.getBoundingClientRect();
    return rect.width > 0 || rect.height > 0;
  }

  // ---------------------------------------------------------------------------
  // Scan: discover fields, create/update/remove labels
  // ---------------------------------------------------------------------------

  /**
   * Picks the set of fields to label and syncs `entries` and the overlay root.
   *
   * The same field id can appear multiple times in the DOM (e.g. inside hidden
   * templates). When duplicates exist for one name we prefer the rendered one;
   * otherwise we fall back to the first match.
   */
  function scan(): void {
    const root = ensureRoot();
    const fieldsToLabel = selectFieldsToLabel();

    const seen = new Set<Element>(fieldsToLabel);
    const next: LabelEntry[] = [];

    for (const field of fieldsToLabel) {
      const name = nameFor(field)!;
      next.push(upsertEntry(root, field, name));
    }

    for (const e of entries) {
      if (!seen.has(e.field) && e.label.parentNode) {
        e.label.parentNode.removeChild(e.label);
      }
    }
    entries = next;
  }

  function selectFieldsToLabel(): Element[] {
    const idFieldByName = new Map<string, Element>();
    const cdkFields: Element[] = [];

    document.querySelectorAll(SELECTOR).forEach((field) => {
      const name = nameFor(field);
      if (!name) return;
      if (field.id) {
        // Deduplicate id-based fields by name, preferring a rendered instance.
        const prev = idFieldByName.get(name);
        if (!prev || (!isRendered(prev) && isRendered(field))) {
          idFieldByName.set(name, field);
        }
      } else {
        cdkFields.push(field);
      }
    });

    return [...idFieldByName.values(), ...cdkFields];
  }

  function upsertEntry(root: HTMLElement, field: Element, name: string): LabelEntry {
    const existing = entries.find((e) => e.field === field);
    if (!existing) {
      const label = document.createElement('div');
      label.className = LABEL_CLASS;
      label.textContent = name;
      root.appendChild(label);
      return { field, label, name };
    }
    if (existing.name !== name) {
      existing.label.textContent = name;
      existing.name = name;
    }
    return existing;
  }

  // ---------------------------------------------------------------------------
  // Reposition: place labels above their fields, hoisting on collision
  // ---------------------------------------------------------------------------

  interface PositionedLabel {
    label: HTMLDivElement;
    left: number;
    baseTop: number;
    width: number;
    height: number;
  }

  function reposition(): void {
    const items = collectVisibleLabels();

    // Sort top-to-bottom, left-to-right so collision resolution is stable.
    items.sort((a, b) => a.baseTop - b.baseTop || a.left - b.left);

    const placed: { left: number; right: number; top: number; bottom: number }[] = [];
    for (const it of items) {
      const top = resolveTop(it, placed);
      it.label.style.left = `${it.left}px`;
      it.label.style.top = `${top}px`;
      placed.push({ left: it.left, right: it.left + it.width, top, bottom: top + it.height });
    }
  }

  function collectVisibleLabels(): PositionedLabel[] {
    const items: PositionedLabel[] = [];
    for (const { field, label } of entries) {
      const rect = field.getBoundingClientRect();
      const onScreen =
        rect.width > 0 &&
        rect.height > 0 &&
        rect.bottom > 0 &&
        rect.right > 0 &&
        rect.top < window.innerHeight &&
        rect.left < window.innerWidth;
      if (!onScreen) {
        label.style.display = 'none';
        continue;
      }
      label.style.display = '';
      const labelRect = label.getBoundingClientRect();
      items.push({
        label,
        left: rect.left,
        baseTop: rect.top - labelRect.height - 2,
        width: labelRect.width,
        height: labelRect.height,
      });
    }
    return items;
  }

  /** Walk upward from baseTop until the label no longer overlaps placed labels. */
  function resolveTop(
    it: PositionedLabel,
    placed: { left: number; right: number; top: number; bottom: number }[],
  ): number {
    let top = it.baseTop;
    const right = it.left + it.width;
    for (let i = 0; i < placed.length + 1; i++) {
      const collide = placed.find(
        (p) => !(right <= p.left || it.left >= p.right || top + it.height <= p.top || top >= p.bottom),
      );
      if (!collide) break;
      top = collide.top - it.height - 2;
    }
    return Math.max(0, top);
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  function loop(): void {
    if (!visible) return;
    reposition();
    rafId = requestAnimationFrame(loop);
  }

  // Coalesce mutation bursts into a single scan at the end of the microtask.
  function scheduleScan(): void {
    if (scanScheduled) return;
    scanScheduled = true;
    queueMicrotask(() => {
      scanScheduled = false;
      if (visible) scan();
    });
  }

  function show(): void {
    scan();
    rafId = requestAnimationFrame(loop);
    mo = new MutationObserver(() => scheduleScan());
    mo.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('scroll', reposition, { passive: true, capture: true });
    window.addEventListener('resize', reposition, { passive: true });
  }

  function hide(): void {
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
    if (mo) mo.disconnect();
    mo = null;
    window.removeEventListener('scroll', reposition, { capture: true });
    window.removeEventListener('resize', reposition);
    const root = document.getElementById(ROOT_ID);
    if (root && root.parentNode) root.parentNode.removeChild(root);
    entries = [];
  }

  // ---------------------------------------------------------------------------
  // Message listener
  // ---------------------------------------------------------------------------

  chrome.runtime.onMessage.addListener((msg: ToggleMessage) => {
    if (msg && msg.type === 'toggle') {
      visible = !visible;
      if (visible) show();
      else hide();
    }
  });
})();
