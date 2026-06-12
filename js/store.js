/* Cadence · store: the ONLY module that touches persistence — swap its internals to add a backend
   Loaded as a classic script (no bundler). Load order: model.js → store.js → app.js */

/* ============================================================
   Cadence — Job Application Tracker
   ------------------------------------------------------------
   DATA LAYER (Store)
   This is the ONLY place that touches storage. It currently uses
   the browser's localStorage. To move to a real database later,
   replace the bodies of getAll/save/remove/replaceAll with calls
   to your API (e.g. fetch('/api/applications')) and make them
   return Promises — the rest of the app already treats records
   as plain objects keyed by `id`.
   ============================================================ */
const Store = (() => {
  const KEY = 'cadence.applications.v1';
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
  const write = (list) => localStorage.setItem(KEY, JSON.stringify(list));
  return {
    getAll(){ return read(); },
    save(record){
      const list = read();
      const i = list.findIndex(r => r.id === record.id);
      if (i >= 0) list[i] = record; else list.push(record);
      write(list);
      return record;
    },
    remove(id){ write(read().filter(r => r.id !== id)); },
    replaceAll(list){ write(list); },
    clear(){ localStorage.removeItem(KEY); }
  };
})();
