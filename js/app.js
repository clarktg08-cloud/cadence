/* Cadence · app: state, rendering, and all UI wiring. Boots with render() at the end
   Loaded as a classic script (no bundler). Load order: model.js → store.js → app.js */

/* ---- app state ---- */
let state = {
  view: 'applications',
  search: '',
  filters: { status: '', source: '', company: '', needsFollowUp: false },
  sort: { key: 'dateApplied', dir: 'desc' },
  expandedRows: new Set(),
};

/* ============================================================
   data shaping
   ============================================================ */
function visibleRows(){
  const q = state.search.trim().toLowerCase();
  const { status, source, company, needsFollowUp: nfu } = state.filters;
  let rows = Store.getAll().filter(a => {
    if(status && a.status !== status) return false;
    if(source && a.howApplied !== source) return false;
    if(company && a.company !== company) return false;
    if(nfu && !needsFollowUp(a)) return false;
    if(q){
      const hay = [a.company,a.role,a.location,a.contactName,a.contactEmail,a.contactPhone,a.contactInfo,a.notes,a.howApplied,a.status]
        .join(' ').toLowerCase();
      if(!hay.includes(q)) return false;
    }
    return true;
  });
  const { key, dir } = state.sort;
  const mul = dir === 'asc' ? 1 : -1;
  rows.sort((a,b) => {
    let av, bv;
    if(key === 'daysSince'){ av = daysBetween(a.dateApplied) ?? -1; bv = daysBetween(b.dateApplied) ?? -1; }
    else if(key === 'followUpCount'){ av = +a.followUpCount||0; bv = +b.followUpCount||0; }
    else if(key === 'dateApplied' || key === 'nextFollowUpDate'){
      av = parseDate(a[key])?.getTime() ?? -Infinity; bv = parseDate(b[key])?.getTime() ?? -Infinity;
    } else { av = (a[key]||'').toLowerCase(); bv = (b[key]||'').toLowerCase(); }
    if(av < bv) return -1*mul; if(av > bv) return 1*mul; return 0;
  });
  return rows;
}

/* ============================================================
   render: applications
   ============================================================ */
function render(){
  document.getElementById('tab-apps').setAttribute('aria-pressed', state.view==='applications');
  document.getElementById('tab-dash').setAttribute('aria-pressed', state.view==='dashboard');
  const main = document.getElementById('main');
  main.innerHTML = state.view === 'applications' ? renderApplications() : renderDashboard();
  renderFooter();
  if(state.view === 'applications') wireToolbar();
}

function renderFooter(){
  const n = Store.getAll().length;
  document.getElementById('footerNote').innerHTML =
    `Stored locally on this device · ${n} application${n===1?'':'s'} · your data never leaves your browser`;
}

function colHead(key,label){
  const active = state.sort.key === key;
  const arrow = active ? (state.sort.dir==='asc'?'▲':'▼') : '↕';
  const sortAttr = active ? ` aria-sort="${state.sort.dir==='asc'?'ascending':'descending'}"` : '';
  return `<th class="sortable" data-sort="${key}"${sortAttr}>${label}<span class="sortarrow">${arrow}</span></th>`;
}

function renderApplications(){
  const all = Store.getAll();
  const rows = visibleRows();
  const { status, source, company, needsFollowUp: nfu } = state.filters;
  const filtersActive = state.search || status || source || company || nfu;
  const needCount = all.filter(needsFollowUp).length;

  const companies = [...new Set(all.map(a=>a.company).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  const statusOpts = `<option value="">All statuses</option>` + STATUSES.map(s=>`<option ${state.filters.status===s.value?'selected':''}>${s.value}</option>`).join('');
  const sourceOpts = `<option value="">All sources</option>` + SOURCES.map(s=>`<option ${state.filters.source===s?'selected':''}>${s}</option>`).join('');
  const companyOpts = `<option value="">All companies</option>` + companies.map(c=>`<option ${state.filters.company===c?'selected':''}>${esc(c)}</option>`).join('');

  let body;
  if(all.length === 0){
    body = emptyState('first');
  } else if(rows.length === 0){
    body = emptyState('filtered');
  } else {
    body = `
    <div class="tablecard"><div class="tablescroll"><table>
      <thead><tr>
        ${colHead('company','Company')}
        ${colHead('status','Status')}
        ${colHead('dateApplied','Applied')}
        <th>Follow-up</th>
        <th></th>
      </tr></thead>
      <tbody>${rows.map(rowHTML).join('')}</tbody>
    </table></div></div>`;
  }

  const filterPill = nfu
    ? `<span class="filter-pill">Needs follow-up <button onclick="clearNfuFilter()" aria-label="Remove filter">×</button></span>`
    : '';

  return `
    <div class="view-head">
      <div>
        <h2>Applications</h2>
        <div class="sub">${all.length} total${needCount?` · <span style="color:var(--danger);font-weight:600">${needCount} need follow-up</span>`:''}</div>
      </div>
    </div>
    <div class="toolbar">
      <div class="search">
        <svg class="ic"><use href="#i-search"/></svg>
        <input id="searchInput" type="search" placeholder="Search company, role, contact, notes…" value="${esc(state.search)}" />
      </div>
      <div class="selectwrap"><select id="filterStatus">${statusOpts}</select></div>
      <div class="selectwrap"><select id="filterSource">${sourceOpts}</select></div>
      <div class="selectwrap"><select id="filterCompany">${companyOpts}</select></div>
      ${filterPill}
      ${filtersActive?`<button class="btn btn-sm clearfilters" id="clearFilters">Clear filters</button>`:''}
    </div>
    ${body}`;
}

function clearNfuFilter(){
  state.filters.needsFollowUp = false;
  render();
}

function rowHTML(a){
  const meta = statusMeta(a.status);
  const days = daysBetween(a.dateApplied);
  const stale = days !== null && days >= 14 && a.status === 'Applied';
  const fu = followUpState(a);
  const overdue = needsFollowUp(a);
  const isOpen = state.expandedRows.has(a.id);

  const cadenceMap = {
    due:   {cls:'due',  text: a.nextFollowUpDate ? `Overdue · ${fmtShort(a.nextFollowUpDate)}` : 'Overdue'},
    today: {cls:'due',  text:'Due today'},
    soon:  {cls:'soon', text:`Due ${fmtShort(a.nextFollowUpDate)}`},
    ok:    {cls:'ok',   text:`Set ${fmtShort(a.nextFollowUpDate)}`},
    none:  {cls:'none', text:'None set'},
    closed:{cls:'ok',   text:'—'},
  };
  const cad = cadenceMap[fu];
  const fuCount = (+a.followUpCount||0);

  /* backward-compat: old records stored a single contactInfo field */
  const email = a.contactEmail || (!a.contactPhone && a.contactInfo && a.contactInfo.includes('@') ? a.contactInfo : '');
  const phone = a.contactPhone || (!a.contactEmail && a.contactInfo && !a.contactInfo.includes('@') ? a.contactInfo : '');

  const mainRow = `<tr id="row-${a.id}" class="row-compact${overdue?' overdue':''}${isOpen?' expanded':''}" style="--rail:${meta.color}" onclick="toggleRow('${a.id}')">
    <td class="td-head" data-label="Company">
      <div class="company">${esc(a.company)||'—'}</div>
      <div class="role-muted">${esc(a.role)||'—'}${a.location?` · <span class="loc">${esc(a.location)}</span>`:''}</div>
    </td>
    <td data-label="Status"><span class="badge ${meta.cls}"><span class="dot"></span>${esc(a.status)}</span></td>
    <td data-label="Applied" class="tnum">
      <span class="days-chip ${stale?'stale':''}">${days===null?'—':days+'d'}</span>
      <div class="small">${fmtDate(a.dateApplied)}</div>
    </td>
    <td data-label="Follow-up">
      <span class="cadence ${cad.cls}"><span class="glyph"></span>${cad.text}</span>
      ${fuCount>0?`<div class="small tnum">${fuCount} sent</div>`:''}
    </td>
    <td data-label="Actions">
      <div class="rowactions">
        <button class="iconbtn expand-btn" title="${isOpen?'Collapse':'Expand'}" aria-expanded="${isOpen}">
          <svg class="ic expand-ic${isOpen?' open':''}"><use href="#i-chevron"/></svg>
        </button>
        <button class="iconbtn" title="Edit" onclick="event.stopPropagation();openForm('${a.id}')"><svg class="ic"><use href="#i-edit"/></svg></button>
        <button class="iconbtn del" title="Delete" onclick="event.stopPropagation();askDelete('${a.id}')"><svg class="ic"><use href="#i-trash"/></svg></button>
      </div>
    </td>
  </tr>`;

  const detailItems = [
    a.howApplied   ? `<div class="detail-item"><div class="dl">Source</div><div class="dv">${esc(a.howApplied)}</div></div>` : '',
    a.contactName  ? `<div class="detail-item"><div class="dl">Contact</div><div class="dv">${esc(a.contactName)}</div></div>` : '',
    email          ? `<div class="detail-item"><div class="dl">Email</div><div class="dv"><a href="mailto:${esc(email)}" onclick="event.stopPropagation()">${esc(email)}</a></div></div>` : '',
    phone          ? `<div class="detail-item"><div class="dl">Phone</div><div class="dv"><a href="tel:${esc(phone)}" onclick="event.stopPropagation()">${esc(phone)}</a></div></div>` : '',
    a.nextFollowUpDate ? `<div class="detail-item"><div class="dl">Next follow-up</div><div class="dv">${fmtDate(a.nextFollowUpDate)}</div></div>` : '',
    a.lastFollowUpDate ? `<div class="detail-item"><div class="dl">Last follow-up</div><div class="dv">${fmtDate(a.lastFollowUpDate)}${fuCount>0?` · ${fuCount} sent`:''}</div></div>` : '',
    a.notes        ? `<div class="detail-item detail-notes"><div class="dl">Notes</div><div class="dv">${esc(a.notes)}</div></div>` : '',
  ].filter(Boolean).join('');

  const detailRow = `<tr id="detail-${a.id}" class="row-detail${isOpen?' open':''}">
    <td colspan="5"><div class="detail-grid">${detailItems}</div></td>
  </tr>`;

  return mainRow + detailRow;
}

function toggleRow(id){
  const mainRow = document.getElementById('row-' + id);
  const detailRow = document.getElementById('detail-' + id);
  if(!mainRow || !detailRow) return;
  const isOpen = detailRow.classList.toggle('open');
  mainRow.classList.toggle('expanded', isOpen);
  const ic = mainRow.querySelector('.expand-ic');
  if(ic) ic.classList.toggle('open', isOpen);
  const btn = mainRow.querySelector('.expand-btn');
  if(btn) btn.setAttribute('aria-expanded', isOpen);
  if(isOpen) state.expandedRows.add(id);
  else state.expandedRows.delete(id);
}

function emptyState(kind){
  if(kind === 'filtered'){
    return `<div class="tablecard"><div class="empty">
      <div class="emblem"><svg class="ic"><use href="#i-search"/></svg></div>
      <h3>No matches</h3>
      <p>No applications match your search and filters.</p>
      <div class="actions"><button class="btn" onclick="resetFilters()">Clear filters</button></div>
    </div></div>`;
  }
  return `<div class="tablecard"><div class="empty">
    <div class="emblem"><svg class="ic"><use href="#i-list"/></svg></div>
    <h3>Track your first application</h3>
    <p>Log a role, set a follow-up date, and Cadence keeps the rest in view — days since applying, overdue nudges, and your pipeline at a glance.</p>
    <div class="actions">
      <button class="btn btn-primary" onclick="openForm()"><svg class="ic"><use href="#i-plus"/></svg> Add application</button>
      <button class="btn" onclick="loadSample()"><svg class="ic"><use href="#i-spark"/></svg> Load sample data</button>
    </div>
  </div></div>`;
}

/* ============================================================
   render: dashboard
   ============================================================ */
function renderDashboard(){
  const all = Store.getAll();
  if(all.length === 0){
    return `
    <div class="view-head"><div><h2>Dashboard</h2><div class="sub">Your search at a glance</div></div></div>
    <div class="panel"><div class="empty">
      <div class="emblem"><svg class="ic"><use href="#i-grid"/></svg></div>
      <h3>Nothing to chart yet</h3>
      <p>Add a few applications and your stats, pipeline, and weekly activity will appear here.</p>
      <div class="actions">
        <button class="btn btn-primary" onclick="openForm()"><svg class="ic"><use href="#i-plus"/></svg> Add application</button>
        <button class="btn" onclick="loadSample()"><svg class="ic"><use href="#i-spark"/></svg> Load sample data</button>
      </div>
    </div></div>`;
  }

  const byStatus = Object.fromEntries(STATUSES.map(s=>[s.value, all.filter(a=>a.status===s.value).length]));
  const total = all.length;
  const sched = byStatus['Interview Scheduled'];
  const conducted = byStatus['Interview Conducted'];
  const rejected = byStatus['Rejected'];
  const needFU = all.filter(needsFollowUp).length;
  const avgDays = Math.round(all.map(a=>daysBetween(a.dateApplied)).filter(d=>d!==null).reduce((x,y)=>x+y,0) / Math.max(1,all.filter(a=>daysBetween(a.dateApplied)!==null).length));
  const interviewing = sched + conducted;

  const stats = [
    {label:'Total applications',     num:total,        meta:'all-time',                                     accent:'var(--brand)',        action:`dashStatus('')`},
    {label:'Active interviews',       num:interviewing, meta:`${sched} scheduled · ${conducted} conducted`,  accent:'var(--conducted-fg)', action:`dashStatus('Interview Scheduled')`},
    {label:'Rejections',              num:rejected,     meta:total?`${Math.round(rejected/total*100)}% of total`:'—', accent:'var(--rejected-fg)', action:`dashStatus('Rejected')`},
    {label:'Need follow-up',          num:needFU,       meta:needFU?'due today or overdue':'all caught up',  accent:'var(--danger)',       action:`dashFollowUp()`, alert:needFU>0, icon:'i-bell'},
    {label:'Interviews scheduled',    num:sched,        meta:'upcoming',                                     accent:'var(--sched-fg)',     action:`dashStatus('Interview Scheduled')`},
    {label:'Interviews conducted',    num:conducted,    meta:'completed',                                    accent:'var(--conducted-fg)', action:`dashStatus('Interview Conducted')`},
    {label:'Avg days since applying', num:isNaN(avgDays)?'—':avgDays, meta:'across all applications',       accent:'var(--brand)'},
    {label:'Applied (status)',        num:byStatus['Applied'], meta:'awaiting response',                     accent:'var(--applied-fg)',   action:`dashStatus('Applied')`},
  ];

  const statCards = stats.map(s=>{
    const tag = s.action ? 'button' : 'div';
    const onclick = s.action ? ` onclick="${s.action}"` : '';
    return `<${tag} class="stat${s.alert?' alert':''}"${onclick} style="--accent:${s.accent}">
      <span class="tick"></span>
      <div class="label">${s.icon?`<svg class="ic" style="width:14px;height:14px;color:${s.accent}"><use href="#${s.icon}"/></svg>`:''}${s.label}${s.action?'<svg class="ic stat-arrow"><use href="#i-chevron"/></svg>':''}</div>
      <div class="num tnum">${s.num}</div>
      <div class="meta">${s.meta}</div>
    </${tag}>`;
  }).join('');

  /* pipeline segmented bar */
  const pipeSegs = STATUSES.map(s=>{
    const n = byStatus[s.value]; const pct = total? n/total*100 : 0;
    return pct>0 ? `<span style="width:${pct}%;background:${s.color}" title="${s.value}: ${n}"></span>` : '';
  }).join('');
  const pipeLegend = STATUSES.map(s=>`
    <div class="leg"><span class="sw" style="background:${s.color}"></span>
      <span class="lname">${s.value}</span><span class="lcount tnum">${byStatus[s.value]}</span></div>`).join('');

  /* source bars */
  const srcCounts = SOURCES.map(s=>({name:s, n: all.filter(a=>a.howApplied===s).length})).filter(x=>x.n>0).sort((a,b)=>b.n-a.n);
  const srcMax = Math.max(1, ...srcCounts.map(s=>s.n));
  const srcBars = srcCounts.length ? srcCounts.map(s=>`
    <div class="hbar"><div class="hl">${s.name}</div>
      <div class="track"><div class="fill" style="width:${s.n/srcMax*100}%"></div></div>
      <div class="hv tnum">${s.n}</div></div>`).join('')
    : `<p style="color:var(--muted)">No source data yet.</p>`;

  return `
    <div class="view-head"><div><h2>Dashboard</h2><div class="sub">Your search at a glance</div></div></div>
    <div class="stats">${statCards}</div>
    <div class="panels">
      <div class="panel">
        <h3>Status breakdown <span class="hint">${total} applications</span></h3>
        <div class="body">
          <div class="pipebar">${pipeSegs || '<span style="width:100%;background:var(--surface-2)"></span>'}</div>
          <div class="pipelegend">${pipeLegend}</div>
        </div>
      </div>
      <div class="panel">
        <h3>Where you applied <span class="hint">by source</span></h3>
        <div class="body"><div class="hbars">${srcBars}</div></div>
      </div>
      <div class="panel panel-wide">
        <h3>Applications submitted by week <span class="hint">most recent ${'→'}</span></h3>
        <div class="body">${weeklyChart(all)}</div>
      </div>
    </div>`;
}

/* dashboard filter helpers — must be function declarations for onclick */
function dashFollowUp(){ filterToView({needsFollowUp:true}); }
function dashStatus(s){ filterToView({status:s}); }

function filterToView(patch){
  state.view = 'applications';
  state.filters = { status:'', source:'', company:'', needsFollowUp:false, ...patch };
  state.search = '';
  render();
  window.scrollTo({top:0, behavior:'smooth'});
}

/* weekly columns as inline SVG (no dependencies) */
function weeklyChart(all){
  const dates = all.map(a=>parseDate(a.dateApplied)).filter(Boolean);
  if(dates.length === 0) return `<p style="color:var(--muted)">No dated applications yet.</p>`;

  const mondayOf = (d)=>{ const x=new Date(d); const day=(x.getDay()+6)%7; x.setDate(x.getDate()-day); x.setHours(0,0,0,0); return x; };
  const buckets = {};
  dates.forEach(d=>{ const k=mondayOf(d).getTime(); buckets[k]=(buckets[k]||0)+1; });

  const last = mondayOf(new Date());
  const WEEKS = 10;
  const series = [];
  for(let i=WEEKS-1;i>=0;i--){
    const wk = new Date(last); wk.setDate(wk.getDate()-i*7);
    series.push({ date:wk, n: buckets[wk.getTime()]||0 });
  }
  const max = Math.max(1, ...series.map(s=>s.n));

  const W=720, H=220, padL=26, padB=30, padT=28, padR=8;
  const cw = (W-padL-padR)/series.length;
  const bw = Math.min(44, cw*0.62);
  const chartH = H-padB-padT;

  const bars = series.map((s,i)=>{
    const h = s.n/max*chartH;
    const x = padL + i*cw + (cw-bw)/2;
    const y = padT + (chartH-h);
    const label = `${s.date.getMonth()+1}/${s.date.getDate()}`;
    return `
      <rect class="col" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0,h).toFixed(1)}" rx="5">
        <title>Week of ${label}: ${s.n}</title></rect>
      ${s.n>0?`
        <rect x="${(x+bw/2-11).toFixed(1)}" y="${(y-20).toFixed(1)}" width="22" height="17" rx="4" fill="var(--ink)" opacity=".85"/>
        <text x="${(x+bw/2).toFixed(1)}" y="${(y-7).toFixed(1)}" text-anchor="middle" style="fill:#fff;font-size:11px;font-weight:700">${s.n}</text>`:''}
      <text x="${(x+bw/2).toFixed(1)}" y="${H-8}" text-anchor="middle" style="font-size:10.5px">${label}</text>`;
  }).join('');

  return `<svg class="weekly" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Applications submitted per week">
    <line class="axis" x1="${padL}" y1="${H-padB}" x2="${W-padR}" y2="${H-padB}"/>
    ${bars}
  </svg>`;
}

/* ============================================================
   toolbar wiring (re-bound on each apps render)
   ============================================================ */
function wireToolbar(){
  const si = document.getElementById('searchInput');
  if(si) si.oninput = (e)=>{ state.search = e.target.value; rerenderTablePreserveFocus(); };
  const fs = document.getElementById('filterStatus');
  if(fs) fs.onchange = (e)=>{ state.filters.status = e.target.value; render(); };
  const fsrc = document.getElementById('filterSource');
  if(fsrc) fsrc.onchange = (e)=>{ state.filters.source = e.target.value; render(); };
  const fc = document.getElementById('filterCompany');
  if(fc) fc.onchange = (e)=>{ state.filters.company = e.target.value; render(); };
  const cf = document.getElementById('clearFilters');
  if(cf) cf.onclick = resetFilters;

  document.querySelectorAll('th.sortable').forEach(th=>{
    th.onclick = ()=>{
      const key = th.dataset.sort;
      if(state.sort.key === key) state.sort.dir = state.sort.dir==='asc'?'desc':'asc';
      else { state.sort.key = key; state.sort.dir = (key==='company'||key==='howApplied'||key==='status')?'asc':'desc'; }
      render();
    };
  });
}

function rerenderTablePreserveFocus(){
  const si = document.getElementById('searchInput');
  const caret = si ? si.selectionStart : null;
  render();
  const si2 = document.getElementById('searchInput');
  if(si2){ si2.focus(); if(caret!=null) si2.setSelectionRange(caret,caret); }
}

function resetFilters(){
  state.search=''; state.filters={status:'',source:'',company:'',needsFollowUp:false};
  render();
}

/* ============================================================
   add / edit form
   ============================================================ */
function fillSelect(el, items, current){
  el.innerHTML = items.map(v=>`<option ${v===current?'selected':''}>${esc(v)}</option>`).join('');
}
let editingId = null;

function openForm(id){
  editingId = id || null;
  const a = id ? Store.getAll().find(r=>r.id===id) : null;
  document.getElementById('formTitle').textContent = a ? 'Edit application' : 'Add application';
  document.getElementById('saveLabel').textContent = a ? 'Save changes' : 'Save application';

  fillSelect(document.getElementById('f-status'), STATUSES.map(s=>s.value), a?a.status:'Applied');
  fillSelect(document.getElementById('f-source'), SOURCES, a?a.howApplied:'LinkedIn');

  const set = (id,v)=>document.getElementById(id).value = v ?? '';
  set('f-id', a?a.id:'');
  set('f-company', a?a.company:'');
  set('f-role', a?a.role:'');
  set('f-location', a?a.location:'');
  set('f-date', a?a.dateApplied:todayISO());
  set('f-fucount', a?(a.followUpCount??0):0);
  set('f-lastfu', a?a.lastFollowUpDate:'');
  set('f-nextfu', a?a.nextFollowUpDate:'');
  set('f-contactname', a?a.contactName:'');

  /* backward-compat: migrate old single contactInfo into email or phone */
  const oldInfo = a?.contactInfo || '';
  set('f-contactemail', a?.contactEmail ?? (oldInfo.includes('@') ? oldInfo : ''));
  set('f-contactphone', a?.contactPhone ?? (!oldInfo.includes('@') ? oldInfo : ''));

  set('f-notes', a?a.notes:'');

  document.querySelectorAll('#appForm .field').forEach(f=>f.classList.remove('invalid'));
  openScrim('formScrim');
  setTimeout(()=>document.getElementById('f-company').focus(), 30);
}
function closeForm(){ closeScrim('formScrim'); }

function submitForm(){
  const v = (id)=>document.getElementById(id).value.trim();
  const company = v('f-company'), role = v('f-role');
  let ok = true;
  const mark = (inputId, bad)=>{
    const field = document.getElementById(inputId).closest('.field');
    field.classList.toggle('invalid', bad); if(bad) ok=false;
  };
  mark('f-company', !company); mark('f-role', !role);
  if(!ok){ document.getElementById((!company?'f-company':'f-role')).focus(); return; }

  const base = editingId ? Store.getAll().find(r=>r.id===editingId) : null;
  const record = {
    id: editingId || uid(),
    company, role,
    location:       v('f-location'),
    status:         document.getElementById('f-status').value,
    dateApplied:    v('f-date') || todayISO(),
    howApplied:     document.getElementById('f-source').value,
    followUpCount:  Math.max(0, parseInt(document.getElementById('f-fucount').value||'0',10) || 0),
    lastFollowUpDate: v('f-lastfu'),
    nextFollowUpDate: v('f-nextfu'),
    contactName:    v('f-contactname'),
    contactEmail:   v('f-contactemail'),
    contactPhone:   v('f-contactphone'),
    notes:          v('f-notes'),
    createdAt:      base?.createdAt || new Date().toISOString(),
    updatedAt:      new Date().toISOString(),
  };
  Store.save(record);
  closeForm();
  render();
  toast(editingId ? 'Application updated' : 'Application added');
}

document.getElementById('appForm').addEventListener('keydown', (e)=>{
  if(e.key === 'Enter' && e.target.tagName !== 'TEXTAREA'){ e.preventDefault(); submitForm(); }
});

/* ============================================================
   delete (custom confirm)
   ============================================================ */
let pendingDelete = null;
function askDelete(id){
  const a = Store.getAll().find(r=>r.id===id); if(!a) return;
  pendingDelete = id;
  document.getElementById('confirmTitle').textContent = 'Delete application';
  document.getElementById('confirmMsg').innerHTML =
    `Remove <b>${esc(a.role||'this role')}</b> at <b>${esc(a.company||'this company')}</b>? This can't be undone.`;
  const ok = document.getElementById('confirmOk');
  ok.className = 'btn btn-primary';
  ok.textContent = 'Delete';
  ok.onclick = ()=>{ Store.remove(pendingDelete); pendingDelete=null; closeConfirm(); render(); toast('Application deleted'); };
  openScrim('confirmScrim');
}
function closeConfirm(){ closeScrim('confirmScrim'); pendingDelete=null; }

/* ============================================================
   data: export / import / share / sample / clear
   ============================================================ */
function exportData(){
  const data = JSON.stringify(Store.getAll(), null, 2);
  const blob = new Blob([data], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `cadence-applications-${todayISO()}.json`;
  a.click(); URL.revokeObjectURL(url);
  toast('Exported your data');
}

function importData(){ document.getElementById('importFile').click(); }
document.getElementById('importFile').addEventListener('change', (e)=>{
  const file = e.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = ()=>{
    try{
      const parsed = JSON.parse(reader.result);
      if(!Array.isArray(parsed)) throw new Error('bad');
      const clean = parsed.filter(r=>r && typeof r==='object').map(r=>({ id: r.id||uid(), ...r }));
      Store.replaceAll(clean);
      render(); toast(`Imported ${clean.length} application${clean.length===1?'':'s'}`);
    }catch{ toast('That file could not be read'); }
    e.target.value = '';
  };
  reader.readAsText(file);
});

async function shareData(){
  const data = Store.getAll();
  if(!data.length){ toast('Nothing to share yet'); return; }
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], {type:'application/json'});
  const file = new File([blob], `cadence-${todayISO()}.json`, {type:'application/json'});
  if(navigator.canShare && navigator.canShare({files:[file]})){
    try{
      await navigator.share({files:[file], title:'Cadence Applications', text:`${data.length} job application${data.length===1?'':'s'}`});
      return;
    }catch(e){ if(e.name==='AbortError') return; }
  }
  exportData();
}

function clearAll(){
  if(Store.getAll().length === 0){ toast('Nothing to clear'); return; }
  document.getElementById('confirmTitle').textContent = 'Clear all data';
  document.getElementById('confirmMsg').innerHTML = `Delete <b>every</b> application stored on this device? Export first if you want a backup. This can't be undone.`;
  const ok = document.getElementById('confirmOk');
  ok.className = 'btn btn-primary'; ok.textContent = 'Clear everything';
  ok.onclick = ()=>{ Store.clear(); closeConfirm(); render(); toast('All data cleared'); };
  openScrim('confirmScrim');
}

function loadSample(){
  const offset = (days)=>{ const d=new Date(); d.setDate(d.getDate()+days); return d.toISOString().slice(0,10); };
  const sample = [
    {company:'Northwind Studio',  role:'Senior Product Designer', location:'Remote',          status:'Interview Scheduled', dateApplied:offset(-9),  howApplied:'LinkedIn',        followUpCount:1, lastFollowUpDate:offset(-3), nextFollowUpDate:offset(1),  contactName:'Priya Anand',   contactEmail:'priya@northwind.co',  contactPhone:'',              notes:'Portfolio review Tuesday. Loved the case studies.'},
    {company:'Lumen Analytics',   role:'UX Researcher',           location:'Chicago, IL',     status:'Interview Conducted', dateApplied:offset(-21), howApplied:'Referral',        followUpCount:2, lastFollowUpDate:offset(-2), nextFollowUpDate:offset(4),  contactName:'Marcus Lee',    contactEmail:'',                   contactPhone:'(312) 555-0148', notes:'Panel went well. Waiting on team decision.'},
    {company:'Brightpath Health',  role:'Design Lead',             location:'Remote · US',     status:'Applied',             dateApplied:offset(-2),  howApplied:'Company Website', followUpCount:0, lastFollowUpDate:'',         nextFollowUpDate:offset(5),  contactName:'',              contactEmail:'',                   contactPhone:'',              notes:''},
    {company:'Cobalt Robotics',   role:'Product Designer',        location:'San Mateo, CA',   status:'Applied',             dateApplied:offset(-16), howApplied:'Indeed',          followUpCount:1, lastFollowUpDate:offset(-9), nextFollowUpDate:offset(-2), contactName:'Dana Ortiz',    contactEmail:'dana.ortiz@cobalt.io',contactPhone:'',             notes:'Follow-up overdue — ping recruiter.'},
    {company:'Fernpost',          role:'Senior UX Designer',      location:'Austin, TX',      status:'Rejected',            dateApplied:offset(-34), howApplied:'LinkedIn',        followUpCount:1, lastFollowUpDate:offset(-20),nextFollowUpDate:'',         contactName:'',              contactEmail:'',                   contactPhone:'',              notes:'Role put on hold. Reconnect next quarter.'},
    {company:'Atlas Freight',     role:'Design Systems Designer', location:'Remote',          status:'Applied',             dateApplied:offset(-5),  howApplied:'Recruiter',       followUpCount:0, lastFollowUpDate:'',         nextFollowUpDate:offset(2),  contactName:'Sam Whitfield', contactEmail:'sam@atlasrecruiting.com', contactPhone:'',         notes:'Recruiter reached out first.'},
    {company:'Meridian Bank',     role:'UX/UI Designer',          location:'New York, NY',    status:'Interview Scheduled', dateApplied:offset(-12), howApplied:'Monster',         followUpCount:1, lastFollowUpDate:offset(-1), nextFollowUpDate:offset(0),  contactName:'Renee Park',    contactEmail:'rpark@meridian.com', contactPhone:'',              notes:'First round Thursday 2pm.'},
    {company:'Sproutly',          role:'Product Designer (Growth)',location:'Remote',         status:'Applied',             dateApplied:offset(-27), howApplied:'Other',           followUpCount:0, lastFollowUpDate:'',         nextFollowUpDate:'',         contactName:'',              contactEmail:'',                   contactPhone:'',              notes:'Applied via AngelList.'},
  ].map(s=>({ id:uid(), createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(), ...s }));

  if(Store.getAll().length > 0){
    document.getElementById('confirmTitle').textContent = 'Load sample data';
    document.getElementById('confirmMsg').innerHTML = `This replaces your current ${Store.getAll().length} application(s) with 8 sample records. Export first if you want a backup.`;
    const ok = document.getElementById('confirmOk');
    ok.className='btn btn-primary'; ok.textContent='Load samples';
    ok.onclick = ()=>{ Store.replaceAll(sample); closeConfirm(); render(); toast('Sample data loaded'); };
    openScrim('confirmScrim');
  } else {
    Store.replaceAll(sample); render(); toast('Sample data loaded');
  }
}

/* ============================================================
   ui plumbing: view, menu, scrim, toast
   ============================================================ */
function setView(v){ state.view = v; render(); window.scrollTo({top:0,behavior:'smooth'}); }

function toggleMenu(e){
  e.stopPropagation();
  const m = document.getElementById('overflowMenu');
  const open = m.classList.toggle('open');
  document.getElementById('overflowBtn').setAttribute('aria-expanded', open);
}
function closeMenu(){ document.getElementById('overflowMenu').classList.remove('open'); document.getElementById('overflowBtn').setAttribute('aria-expanded','false'); }
document.addEventListener('click', ()=>closeMenu());

let lastFocused = null;
function openScrim(id){
  lastFocused = document.activeElement;
  const s = document.getElementById(id);
  s.classList.add('open'); s.setAttribute('aria-hidden','false');
  document.body.style.overflow='hidden';
}
function closeScrim(id){
  const s = document.getElementById(id);
  s.classList.remove('open'); s.setAttribute('aria-hidden','true');
  document.body.style.overflow='';
  if(lastFocused) try{ lastFocused.focus(); }catch{}
}
['formScrim','confirmScrim'].forEach(id=>{
  document.getElementById(id).addEventListener('mousedown', (e)=>{ if(e.target.id===id) closeScrim(id); });
});
document.addEventListener('keydown', (e)=>{
  if(e.key==='Escape'){
    if(document.getElementById('formScrim').classList.contains('open')) closeForm();
    else if(document.getElementById('confirmScrim').classList.contains('open')) closeConfirm();
    else closeMenu();
  }
});

let toastTimer = null;
function toast(msg){
  const t = document.getElementById('toast');
  document.getElementById('toastMsg').textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>t.classList.remove('show'), 2200);
}

/* ============================================================
   boot
   ============================================================ */
render();
