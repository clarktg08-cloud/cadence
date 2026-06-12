# CLAUDE.md

Context for working on **Cadence** in Claude Code. Read this before making changes.

## What this is

A job application tracker with two views (Applications, Dashboard). Vanilla HTML/CSS/JS, **no framework, no build step**. It must keep running by opening `index.html` directly from disk unless we deliberately decide to adopt a bundler.

## How to run

- Open `index.html` directly, or `python3 -m http.server`, or `npm start` (optional `serve`).
- There is no test runner wired up yet. `js/model.js` is pure (no DOM, no storage) and is the right place to add unit tests first — see "Testing" below.

## Architecture

Three classic scripts, loaded in this order from `index.html`:

1. **`js/model.js`** — reference data (`STATUSES`, `SOURCES`) and pure helpers: `uid`, `todayISO`, `esc`, `parseDate`, `daysBetween`, `fmtDate`, `fmtShort`, `followUpState`, `needsFollowUp`. No DOM access, no storage. Keep it that way.
2. **`js/store.js`** — `Store`, the single persistence seam (details below).
3. **`js/app.js`** — `state`, data shaping (`visibleRows`), all `render*` functions, the SVG `weeklyChart`, form/delete/import-export handlers, UI plumbing, and the boot call `render()`.

Because these are classic scripts, **top-level `const`/`function` declarations are shared across all three files** (one global lexical environment). That's intentional and is what avoids needing a module server.

### Two hard constraints to preserve

1. **Inline `onclick` handlers must stay function *declarations*.** Handlers in `index.html` and in rendered HTML strings (`onclick="openForm('id')"`) resolve against `window`. Function declarations attach to `window`; `const fn = () => {}` does **not**. If you convert a handler function to a `const` arrow, the button silently breaks. Either keep them as `function foo(){}` or switch to `addEventListener` + event delegation.
2. **Keep the `model → store → app` load order.** `app.js` and `store.js` rely on names defined earlier.

### Data flow

`Store.getAll()` → `visibleRows()` (search + filter + sort) → `render*()` builds an HTML string → assigned to `#main` → `wireToolbar()` re-binds toolbar/header events. The whole view re-renders on change; there's no virtual DOM. Search input preserves caret via `rerenderTablePreserveFocus()`.

## The storage seam (how to add a backend)

`js/store.js` is the only file that touches `localStorage`. Today:

```js
const Store = (() => {
  const KEY = 'cadence.applications.v1';
  const read  = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
  const write = (list) => localStorage.setItem(KEY, JSON.stringify(list));
  return {
    getAll(){ return read(); },
    save(record){ /* upsert by id */ },
    remove(id){ /* filter out id */ },
    replaceAll(list){ write(list); },
    clear(){ localStorage.removeItem(KEY); },
  };
})();
```

To move to an API, replace the bodies and make them return Promises, then `await` the calls in `app.js` (the render path is small and easy to make async):

```js
const Store = {
  async getAll(){ return (await fetch('/api/applications')).json(); },
  async save(r){ const m = r.id ? 'PUT' : 'POST';
    return (await fetch(`/api/applications/${r.id ?? ''}`, {
      method: m, headers: {'Content-Type':'application/json'}, body: JSON.stringify(r)
    })).json(); },
  async remove(id){ await fetch(`/api/applications/${id}`, { method:'DELETE' }); },
  async replaceAll(list){ await fetch('/api/applications', {
      method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(list) }); },
  async clear(){ await fetch('/api/applications', { method:'DELETE' }); },
};
```

Suggested record shape and validation already match the table in `README.md`. Bump `KEY` to `...v2` if the stored shape ever changes, and add a one-time migration in `read()`.

## Data model

See `README.md`. `id` is the primary key. `daysSinceApplied` is derived at render time, never persisted. Dates are `'YYYY-MM-DD'` strings (or `''`). `followUpState()` defines the follow-up buckets: `due` / `today` / `soon` (≤3 days) / `ok` / `none` / `closed` (Rejected). `needsFollowUp()` = `due` or `today`, and drives the overdue highlight and the dashboard counter.

## Design system (keep changes consistent with this)

All tokens are CSS custom properties in `:root` at the top of `css/styles.css`. Don't hardcode colors in new UI — use the variables.

- **Surfaces:** `--paper #F5F6F4`, `--surface #FFFFFF`. **Ink:** `--ink #16201C`, `--muted`, `--faint`.
- **Brand/chrome accent:** forest green `--brand #1F6B4F`. Used for primary actions, active nav, focus rings. It's deliberately *not* a status color.
- **Status semantics (reserved — don't reuse for chrome):** Applied = blue, Interview Scheduled = amber, Interview Conducted = violet, Rejected = rose. Defined as `--*-fg` / `--*-bg` pairs and mapped in `STATUSES` (`model.js`).
- **Type:** Space Grotesk (display, headings, numbers) + Inter (body/table). Numeric cells use `.tnum` (tabular figures) so columns align.
- **Signature element:** the colored status rail on the left edge of each row (`--rail`), which becomes a top stripe on mobile cards. Preserve this — it's the core scanning affordance.
- Quality floor: visible `:focus-visible`, `prefers-reduced-motion` respected, table reflows to cards under 720px. Maintain these.

## Conventions

- Re-render by rebuilding HTML strings; always `esc()` any user-entered text interpolated into HTML (XSS guard).
- Charts are hand-rolled inline SVG (`weeklyChart`, the pipeline bar, source bars). No chart library — keep it dependency-free unless we consciously decide otherwise.
- Toasts via `toast(msg)`; modals via `openScrim/closeScrim` (Esc + click-outside already wired).

## Reasonable next steps

- Persist UI state (active filters/sort) across reloads.
- "No follow-up set after N days" as an additional follow-up signal (currently follow-up status keys off `nextFollowUpDate` only).
- Stand up the backend using the `Store` swap above; add server-side validation mirroring the data model.
- Add tests for `model.js` (see below).

## Testing

`js/model.js` is pure. To test in Node, add `export`s (or a `module.exports` shim) and import the helpers — `daysBetween`, `followUpState`, `needsFollowUp` are the highest-value cases (off-by-one on dates and the Rejected exclusion). Keep DOM/storage out of `model.js` so it stays trivially testable.
