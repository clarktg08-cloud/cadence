/* Cadence · app: state, rendering, and all UI wiring. Boots with render() at the end
   Loaded as a classic script (no bundler). Load order: model.js → store.js → app.js */

/* ---- app state ---- */
let state = {
  view:'applications',
  search:'',
  filters:{ status:'', source:'', company:'' },
  sort:{ key:'dateApplied', dir:'desc' },
};

/* ============================================================
   data shaping
   ============================================================ */
function visibleRows(){
  const q = state.search.trim().toLowerCase();
  const { status, source, company } = state.filters;
  let rows = Store.getAll().filter(a => {
    if(status && a.status !== status) return false;
    if(source && a.howApplied !== source) return false;
    if(company && a.company !== company) return false;
    if(q){
      const hay = [a.company,a.role,a.location,a.contactName,a.contactInfo,a.notes,a.howApplied,a.status]
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
  const filtersActive = state.search || state.filters.status || state.filters.source || state.filters.company;

  const companies = [...new Set(all.map(a=>a.company).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  const needCount = all.filter(needsFollowUp).length;

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
        ${colHead('daysSince','Days')}
        ${colHead('howApplied','Source')}
        <th>Follow-up</th>
        ${colHead('nextFollowUpDate','Next')}
        <th>Contact</th>
        <th style="text-align:right">Actions</th>
      </tr></thead>
      <tbody>${rows.map(rowHTML).join('')}</tbody>
    </table></div></div>`;
  }

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
      ${filtersActive?`<button class="btn btn-sm clearfilters" id="clearFilters">Clear filters</button>`:''}
    </div>
    ${body}`;
}

function rowHTML(a){
  const meta = statusMeta(a.status);
  const days = daysBetween(a.dateApplied);
  const stale = days !== null && days >= 14 && a.status === 'Applied';
  const fu = followUpState(a);
  const overdue = needsFollowUp(a);

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

  return `<tr class="${overdue?'overdue':''}" style="--rail:${meta.color}">
    <td class="td-head" data-label="Company">
      <div>
        <div class="company">${esc(a.company)||'—'}</div>
        <div class="role-muted">${esc(a.role)||'—'}${a.location?` · ${esc(a.location)}`:''}</div>
      </div>
    </td>
    <td data-label="Status"><span class="badge ${meta.cls}"><span class="dot"></span>${esc(a.status)}</span></td>
    <td data-label="Applied" class="tnum">${fmtDate(a.dateApplied)}</td>
    <td data-label="Days"><span class="days-chip tnum ${stale?'stale':''}">${days===null?'—':days+'d'}</span></td>
    <td data-label="Source"><span class="src-pill">${esc(a.howApplied)||'—'}</span></td>
    <td data-label="Follow-up">
      <span class="cadence ${cad.cls}"><span class="glyph"></span>${cad.text}</span>
      ${fuCount>0?`<div class="small tnum">${fuCount} sent${a.lastFollowUpDate?` · last ${fmtShort(a.lastFollowUpDate)}`:''}</div>`:''}
    </td>
    <td data-label="Next" class="tnum">${a.nextFollowUpDate?fmtDate(a.nextFollowUpDate):'—'}</td>
    <td data-label="Contact">
      ${a.contactName?`<div class="cell-strong">${esc(a.contactName)}</div>`:'<span class="small">—</span>'}
      ${a.contactInfo?`<div class="small">${esc(a.contactInfo)}</div>`:''}
    </td>
    <td data-label="Actions">
      <div class="rowactions">
        <button class="iconbtn" title="Edit" onclick="openForm('${a.id}')"><svg class="ic"><use href="#i-edit"/></svg></button>
        <button class="iconbtn del" title="Delete" onclick="askDelete('${a.id}')"><svg class="ic"><use href="#i-trash"/></svg></button>
      </div>
    </td>
  </tr>`;
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
    {label:'Total applications', num:total, meta:'all-time', accent:'var(--brand)'},
    {label:'Active interviews', num:interviewing, meta:`${sched} scheduled · ${conducted} conducted`, accent:'var(--conducted-fg)'},
    {label:'Rejections', num:rejected, meta: total?`${Math.round(rejected/total*100)}% of total`:'—', accent:'var(--rejected-fg)'},
    {label:'Need follow-up', num:needFU, meta: needFU?'due today or overdue':'all caught up', accent:'var(--danger)', alert: needFU>0, icon:'i-bell'},
    {label:'Interviews scheduled', num:sched, meta:'upcoming', accent:'var(--sched-fg)'},
    {label:'Interviews conducted', num:conducted, meta:'completed', accent:'var(--conducted-fg)'},
    {label:'Avg days since applying', num: isNaN(avgDays)?'—':avgDays, meta:'across all applications', accent:'var(--brand)'},
    {label:'Applied (status)', num:byStatus['Applied'], meta:'awaiting response', accent:'var(--applied-fg)'},
  ];

  const statCards = stats.map(s=>`
    <div class="stat ${s.alert?'alert':''}" style="--accent:${s.accent}">
      <span class="tick"></span>
      <div class="label">${s.icon?`<svg class="ic" style="width:14px;height:14px;color:${s.accent}"><use href="#${s.icon}"/></svg>`:''}${s.label}</div>
      <div class="num tnum">${s.num}</div>
      <div class="meta">${s.meta}</div>
    </div>`).join('');

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
        <h3>Applications submitted by week <span class="hint">most recent ${'\u2192'}</span></h3>
        <div class="body">${weeklyChart(all)}</div>
      </div>
    </div>`;
}

/* weekly columns as inline SVG (no dependencies) */
function weeklyChart(all){
  const dates = all.map(a=>parseDate(a.dateApplied)).filter(Boolean);
  if(dates.length === 0) return `<p style="color:var(--muted)">No dated applications yet.</p>`;

  // bucket by week (Monday start)
  const mondayOf = (d)=>{ const x=new Date(d); const day=(x.getDay()+6)%7; x.setDate(x.getDate()-day); x.setHours(0,0,0,0); return x; };
  const buckets = {};
  dates.forEach(d=>{ const k=mondayOf(d).getTime(); buckets[k]=(buckets[k]||0)+1; });

  const last = mondayOf(new Date());
  const WEEKS = 10;
  const series = [];
  for(let i=WEEKS-1;i>=0;i--){
    const wk = new Date(last); wk.setDate(wk.getDate()-i*7);
    const k = wk.getTime();
    series.push({ date:wk, n: buckets[k]||0 });
  }
  const max = Math.max(1, ...series.map(s=>s.n));

  const W=720, H=200, padL=26, padB=26, padT=10, padR=8;
  const cw = (W-padL-padR)/series.length;
  const bw = Math.min(40, cw*0.6);
  const chartH = H-padB-padT;

  const bars = series.map((s,i)=>{
    const h = s.n/max*chartH;
    const x = padL + i*cw + (cw-bw)/2;
    const y = padT + (chartH-h);
    const label = `${s.date.getMonth()+1}/${s.date.getDate()}`;
    return `
      <rect class="col" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0,h).toFixed(1)}" rx="4">
        <title>Week of ${label}: ${s.n}</title></rect>
      ${s.n>0?`<text x="${(x+bw/2).toFixed(1)}" y="${(y-5).toFixed(1)}" text-anchor="middle" style="fill:var(--ink);font-weight:600">${s.n}</text>`:''}
      <text x="${(x+bw/2).toFixed(1)}" y="${H-9}" text-anchor="middle">${label}</text>`;
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
  if(si){
    si.oninput = (e)=>{ state.search = e.target.value; rerenderTablePreserveFocus(); };
  }
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

/* keep search focus/caret while live-filtering */
function rerenderTablePreserveFocus(){
  const si = document.getElementById('searchInput');
  const caret = si ? si.selectionStart : null;
  render();
  const si2 = document.getElementById('searchInput');
  if(si2){ si2.focus(); if(caret!=null) si2.setSelectionRange(caret,caret); }
}

function resetFilters(){
  state.search=''; state.filters={status:'',source:'',company:''};
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
  set('f-contactinfo', a?a.contactInfo:'');
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
    location: v('f-location'),
    status: document.getElementById('f-status').value,
    dateApplied: v('f-date') || todayISO(),
    howApplied: document.getElementById('f-source').value,
    followUpCount: Math.max(0, parseInt(document.getElementById('f-fucount').value||'0',10) || 0),
    lastFollowUpDate: v('f-lastfu'),
    nextFollowUpDate: v('f-nextfu'),
    contactName: v('f-contactname'),
    contactInfo: v('f-contactinfo'),
    notes: v('f-notes'),
    createdAt: base?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  Store.save(record);
  closeForm();
  render();
  toast(editingId ? 'Application updated' : 'Application added');
}

/* submit on Enter (except inside textarea) */
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
   data: export / import / sample / clear
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
  const t = todayISO();
  const offset = (days)=>{ const d=new Date(); d.setDate(d.getDate()+days); return d.toISOString().slice(0,10); };
  const sample = [
    {company:'Northwind Studio', role:'Senior Product Designer', location:'Remote', status:'Interview Scheduled', dateApplied:offset(-9), howApplied:'LinkedIn', followUpCount:1, lastFollowUpDate:offset(-3), nextFollowUpDate:offset(1), contactName:'Priya Anand', contactInfo:'priya@northwind.co', notes:'Portfolio review Tuesday. Loved the case studies.'},
    {company:'Lumen Analytics', role:'UX Researcher', location:'Chicago, IL', status:'Interview Conducted', dateApplied:offset(-21), howApplied:'Referral', followUpCount:2, lastFollowUpDate:offset(-2), nextFollowUpDate:offset(4), contactName:'Marcus Lee', contactInfo:'(312) 555-0148', notes:'Panel went well. Waiting on team decision.'},
    {company:'Brightpath Health', role:'Design Lead', location:'Remote · US', status:'Applied', dateApplied:offset(-2), howApplied:'Company Website', followUpCount:0, lastFollowUpDate:'', nextFollowUpDate:offset(5), contactName:'', contactInfo:'', notes:''},
    {company:'Cobalt Robotics', role:'Product Designer', location:'San Mateo, CA', status:'Applied', dateApplied:offset(-16), howApplied:'Indeed', followUpCount:1, lastFollowUpDate:offset(-9), nextFollowUpDate:offset(-2), contactName:'Dana Ortiz', contactInfo:'dana.ortiz@cobalt.io', notes:'Follow-up overdue — ping recruiter.'},
    {company:'Fernpost', role:'Senior UX Designer', location:'Austin, TX', status:'Rejected', dateApplied:offset(-34), howApplied:'LinkedIn', followUpCount:1, lastFollowUpDate:offset(-20), nextFollowUpDate:'', contactName:'', contactInfo:'', notes:'Role put on hold. Reconnect next quarter.'},
    {company:'Atlas Freight', role:'Design Systems Designer', location:'Remote', status:'Applied', dateApplied:offset(-5), howApplied:'Recruiter', followUpCount:0, lastFollowUpDate:'', nextFollowUpDate:offset(2), contactName:'Sam Whitfield', contactInfo:'sam@atlasrecruiting.com', notes:'Recruiter reached out first.'},
    {company:'Meridian Bank', role:'UX/UI Designer', location:'New York, NY', status:'Interview Scheduled', dateApplied:offset(-12), howApplied:'Monster', followUpCount:1, lastFollowUpDate:offset(-1), nextFollowUpDate:offset(0), contactName:'Renee Park', contactInfo:'rpark@meridian.com', notes:'First round Thursday 2pm.'},
    {company:'Sproutly', role:'Product Designer (Growth)', location:'Remote', status:'Applied', dateApplied:offset(-27), howApplied:'Other', followUpCount:0, lastFollowUpDate:'', nextFollowUpDate:'', contactName:'', contactInfo:'', notes:'Applied via AngelList.'},
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
/* click-outside + Esc close */
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
