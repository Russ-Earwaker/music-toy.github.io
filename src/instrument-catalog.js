// src/instrument-catalog.js
// Loads instrument entries from CSV and provides simple categorization.

export async function loadInstrumentEntries(){
  try{
    const url = './assets/samples/samples.csv';
    const res = await fetch(url);
    if (res && res.ok){
      const txt = await res.text();
      const lines = txt.split(/\r?\n/).filter(Boolean);
      if (!lines.length) return [];
      const header = lines.shift().split(',').map(s=>s.trim());
      const idIdx   = header.findIndex(h=>/^(id|name|instrument_id|instrument)$/i.test(h));
      const dispIdx = header.findIndex(h=>/^(display\s*_?name|display|label|title)$/i.test(h));
      const synthIdx= header.findIndex(h=>/^(synth|synth_id|tone)$/i.test(h));
      const typeIdx = header.findIndex(h=>/^(instrument\s*_?type|type|category)$/i.test(h));
      const out = [];
      for (const line of lines){
        const cells = line.split(',');
        const id = String((cells[idIdx]||cells[synthIdx]||'')).trim();
        const display = String((cells[dispIdx]||id)).trim();
        const type = String((cells[typeIdx]||'')).trim();
        if (!id || !display) continue;
        out.push({ id: id.toLowerCase(), display, type });
      }
      // Dedup by display label; keep first id per label
      const byLabel = new Map();
      for (const e of out){ if (!byLabel.has(e.display)) byLabel.set(e.display, e); }
      return Array.from(byLabel.values());
    }
  }catch{}
  return [];
}

export function categorize(entries){
  const cats = new Map();
  const add = (c, e)=>{ if (!cats.has(c)) cats.set(c, []); cats.get(c).push(e); };
  const tc = s=> String(s||'').replace(/[_-]/g,' ').replace(/\w\S*/g, t=> t[0].toUpperCase()+t.slice(1).toLowerCase());
  for (const e of entries){
    const cat = tc(e.type||'Other');
    add(cat, e);
  }
  // Sort category names and entries
  for (const [k, list] of cats){ list.sort((a,b)=> a.display.localeCompare(b.display)); }
  return new Map(Array.from(cats.entries()).sort((a,b)=> a[0].localeCompare(b[0])));
}
