/* Cadence · model: reference data + pure helpers (no DOM, no storage — safe to unit-test)
   Loaded as a classic script (no bundler). Load order: model.js → store.js → app.js */

/* ---- reference data ---- */
const STATUSES = [
  { value:'Applied',              cls:'applied',   color:'var(--applied-fg)' },
  { value:'Interview Scheduled',  cls:'sched',     color:'var(--sched-fg)' },
  { value:'Interview Conducted',  cls:'conducted', color:'var(--conducted-fg)' },
  { value:'Rejected',             cls:'rejected',  color:'var(--rejected-fg)' },
];
const SOURCES = ['Indeed','LinkedIn','Monster','Company Website','Referral','Recruiter','Other'];
const statusMeta = (v) => STATUSES.find(s => s.value === v) || STATUSES[0];

/* ============================================================
   helpers
   ============================================================ */
const uid = () => 'a_' + Date.now().toString(36) + Math.random().toString(36).slice(2,7);
const todayISO = () => new Date().toISOString().slice(0,10);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function parseDate(iso){ if(!iso) return null; const d = new Date(iso + 'T00:00:00'); return isNaN(d) ? null : d; }
function daysBetween(iso, fromISO = todayISO()){
  const a = parseDate(iso), b = parseDate(fromISO);
  if(!a || !b) return null;
  return Math.round((b - a) / 86400000);
}
function fmtDate(iso){
  const d = parseDate(iso);
  if(!d) return '—';
  return d.toLocaleDateString(undefined,{ month:'short', day:'numeric', year:'numeric' });
}
function fmtShort(iso){
  const d = parseDate(iso); if(!d) return '';
  return d.toLocaleDateString(undefined,{ month:'numeric', day:'numeric' });
}

/* follow-up logic — the "cadence" of the search */
function followUpState(app){
  if(app.status === 'Rejected') return 'closed';
  if(!app.nextFollowUpDate) return 'none';
  const d = daysBetween(app.nextFollowUpDate); // days since next-FU date; >=0 means due/overdue
  if(d > 0) return 'due';          // past due
  if(d === 0) return 'today';      // due today
  if(d >= -3) return 'soon';       // within 3 days
  return 'ok';
}
function needsFollowUp(app){
  const s = followUpState(app);
  return s === 'due' || s === 'today';
}
