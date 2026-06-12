# Cadence

A lightweight job application tracker. Two views — **Applications** and **Dashboard** — and nothing you have to configure. Built as plain HTML, CSS, and JavaScript with **no framework and no build step**.

> The name comes from the thing that actually keeps a job search alive: follow-up *cadence*. Overdue follow-ups are surfaced everywhere.

## Run it

Three options, easiest first:

1. **Just open it.** Double-click `index.html`. It runs straight from disk — the scripts are classic (non-module), so no server is required.
2. **Python (zero install):** `python3 -m http.server` then visit the printed URL.
3. **npm (optional):** `npm install && npm start` (uses [`serve`](https://www.npmjs.com/package/serve)).

Your data is saved in the browser via `localStorage`, scoped to the origin you open it from. To explore quickly, use **Load sample data** in the ••• menu.

## Features

- Create / edit / delete applications with every field in the brief; **Days Since Applied** is calculated.
- Searchable, sortable table (click any header). Filter by status, source, and company. Defaults to most-recent-first.
- Status colors as a left-edge rail for fast scanning; overdue follow-ups highlighted on the row and the dashboard.
- Dashboard: totals, status breakdown, interviews scheduled/conducted, rejections, follow-ups needed, average days since applying, source breakdown, and weekly submissions. Charts are hand-drawn SVG — no chart library.
- Export / import your data as JSON (your backup + migration path).
- Responsive: the table reflows to cards on mobile.

## Project structure

```
cadence/
├── index.html        markup + inline SVG icon sprite
├── css/
│   └── styles.css    design tokens (:root) + all styling
├── js/
│   ├── model.js      reference data + pure helpers (dates, follow-up state). No DOM, no storage.
│   ├── store.js      persistence adapter — the ONLY module that touches storage
│   └── app.js        state, rendering, and UI wiring; boots with render()
├── package.json      optional dev server
└── CLAUDE.md         architecture notes for working in Claude Code
```

Scripts load in order: `model.js → store.js → app.js`. They're classic scripts sharing one global scope (no `import`/`export`), which is what lets `index.html` run without a server.

## Data model

Each application is a plain object:

```js
{
  id, company, role, location,
  status,            // 'Applied' | 'Interview Scheduled' | 'Interview Conducted' | 'Rejected'
  dateApplied,       // 'YYYY-MM-DD'
  howApplied,        // 'Indeed' | 'LinkedIn' | 'Monster' | 'Company Website' | 'Referral' | 'Recruiter' | 'Other'
  followUpCount,     // number
  lastFollowUpDate,  // 'YYYY-MM-DD' | ''
  nextFollowUpDate,  // 'YYYY-MM-DD' | ''
  contactName, contactInfo, notes,
  createdAt, updatedAt
}
```

`daysSinceApplied` is derived at render time, never stored.

## Adding a database later

All persistence lives in `js/store.js` behind `Store` (`getAll`, `save`, `remove`, `replaceAll`, `clear`). Swap those method bodies for API calls and make them async — see `CLAUDE.md` for a worked example. Nothing else in the app needs to know where records come from.

## License

Yours to use and modify.
