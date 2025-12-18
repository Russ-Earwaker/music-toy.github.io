// src/instrument-catalog.js
// Loads instrument entries from CSV and provides simple categorization, including theme tags.

const ID_TO_DISPLAY_NAME = new Map();
const DISPLAY_NAME_TO_ID = new Map();
const ID_TO_THEMES = new Map();
const ALL_THEMES = new Set();

export function getDisplayNameForId(id) { return ID_TO_DISPLAY_NAME.get(id); }
export function getIdForDisplayName(displayName) { return DISPLAY_NAME_TO_ID.get(displayName); }
export function getAllIds() { return Array.from(ID_TO_DISPLAY_NAME.keys()); }
export function getThemesForId(id){ return ID_TO_THEMES.get(id) || []; }
export function getAllThemes(){ return Array.from(ALL_THEMES.values()).sort((a,b)=> a.localeCompare(b)); }

export async function loadInstrumentEntries(){
  try{
    const url = './samples.csv';
    const res = await fetch(url);
    if (res && res.ok){
      const txt = await res.text();
      const lines = txt.split(/\r?\n/).filter(Boolean);
      if (!lines.length) return [];
      const header = lines.shift().split(',').map(s=>s.trim());
      // Prioritize `instrument_id` as the canonical ID, falling back to `instrument`.
      const idIdx = header.includes('instrument_id') ? header.indexOf('instrument_id') : header.findIndex(h=>/^(id|name|instrument)$/i.test(h));
      const dispIdx = header.findIndex(h=>/^(display\s*_?name|display|label|title)$/i.test(h));
      const synthIdx= header.findIndex(h=>/^(synth|synth_id|tone)$/i.test(h));
      const typeIdx = header.findIndex(h=>/^(instrument\s*_?type|type|category)$/i.test(h));
      const themeIdx= header.findIndex(h=>/^themes?$/i.test(h));
      ID_TO_DISPLAY_NAME.clear(); DISPLAY_NAME_TO_ID.clear(); ID_TO_THEMES.clear(); ALL_THEMES.clear();
      const out = [];
      for (const line of lines){
        const cells = line.split(',');
        const id = String((idIdx !== -1 ? cells[idIdx] : '') || cells[synthIdx] || '').trim();
        const display = String((cells[dispIdx] || id)).trim();
        const type = String((cells[typeIdx]||'')).trim();
        const synth = String((cells[synthIdx]||'')).trim();
        const themesRaw = themeIdx >= 0 ? String(cells[themeIdx] || '') : '';
        const themes = themesRaw.split(/[;|]/).map(t=>t.trim()).filter(Boolean);
        if (!id || !display) continue;
        out.push({ id, display, type, synth, themes });
        ID_TO_DISPLAY_NAME.set(id, display);
        DISPLAY_NAME_TO_ID.set(display, id);
        if (themes.length){
          ID_TO_THEMES.set(id, themes);
          themes.forEach(t=> ALL_THEMES.add(t));
        }
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
  cats.set('All', []);
  for (const e of entries){
    add('All', e);
    const cat = tc(e.type||'Other');
    add(cat, e);
    if (Array.isArray(e.themes)){
      e.themes.filter(Boolean).forEach(theme=> add(`Theme: ${tc(theme)}`, e));
    }
  }
  // Sort category names and entries
  for (const [k, list] of cats){ list.sort((a,b)=> a.display.localeCompare(b.display)); }
  const sorted = Array.from(cats.entries()).sort((a,b)=>{
    if (a[0] === 'All') return -1;
    if (b[0] === 'All') return 1;
    return a[0].localeCompare(b[0]);
  });
  return new Map(sorted);
}
