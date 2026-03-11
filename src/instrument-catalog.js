// src/instrument-catalog.js
// Loads instrument entries from CSV and provides simple categorization, including theme tags.

const ID_TO_DISPLAY_NAME = new Map();
const DISPLAY_NAME_TO_ID = new Map();
const ID_TO_THEMES = new Map();
const ALL_THEMES = new Set();
let LAST_ENTRIES = [];

export function getDisplayNameForId(id) { return ID_TO_DISPLAY_NAME.get(id); }
export function getIdForDisplayName(displayName) { return DISPLAY_NAME_TO_ID.get(displayName); }
export function getAllIds() { return Array.from(ID_TO_DISPLAY_NAME.keys()); }
export function getInstrumentEntries() { return Array.from(LAST_ENTRIES); }
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
      const familyIdx = header.findIndex(h=>/^(instrument|family|instrument_family)$/i.test(h));
      const fnIdx = header.findIndex(h=>/^(function|usage|use|purpose)$/i.test(h));
      const themeIdx= header.findIndex(h=>/^themes?$/i.test(h));
      const recoIdx = header.findIndex(h=>/^recommended[_-]?toys$/i.test(h));
      const laneIdx = header.findIndex(h=>/^(lane[_-]?tags?|role[_-]?tags?|suitability|suitable[_-]?for|musical[_-]?roles?)$/i.test(h));
      const laneRoleIdx = header.findIndex(h=>/^(lane[_-]?role|role[_-]?lane)$/i.test(h));
      const registerClassIdx = header.findIndex(h=>/^(register[_-]?class|register[_-]?band)$/i.test(h));
      const combatRoleIdx = header.findIndex(h=>/^(combat[_-]?role|usage[_-]?role)$/i.test(h));
      const pitchIdx = header.findIndex(h=>/^(pitch|pitch[_-]?grade|pitch[_-]?band|register)$/i.test(h));
      const baseNoteIdx = header.findIndex(h=>/^(base\s*_?note|baseNote|note_base)$/i.test(h));
      const baseOctIdx = header.findIndex(h=>/^(base\s*_?oct(ave)?|baseOct(ave)?|octave)$/i.test(h));
      const priIdx  = header.findIndex(h=>/^(priority|is_priority|ispriority|first_pick|firstpick)$/i.test(h));
      const mapLaneToken = (rawToken) => {
        const t = String(rawToken || '').trim().toLowerCase();
        if (!t) return '';
        if (t === 'bass' || t === 'drum' || t === 'groove' || t === 'rhythm') return 'bass';
        if (t === 'lead' || t === 'melody' || t === 'phrase') return 'lead';
        if (t === 'accent' || t === 'fx' || t === 'effect') return 'accent';
        if (t === 'motion' || t === 'cosmetic' || t === 'texture' || t === 'ambient') return 'motion';
        return '';
      };
      const normalizeRegisterClass = (value, pitchRankLike = null, baseOctRaw = '') => {
        const raw = String(value || '').trim().toLowerCase();
        if (raw === 'low' || raw === 'mid' || raw === 'high') return raw;
        if (raw === 'sub') return 'low';
        if (raw === 'mid_low' || raw === 'mid-low' || raw === 'midlow') return 'mid';
        if (raw === 'mid_high' || raw === 'mid-high' || raw === 'midhigh') return 'high';
        const pr = Math.trunc(Number(pitchRankLike));
        if (Number.isFinite(pr) && pr >= 1 && pr <= 5) {
          if (pr <= 2) return 'low';
          if (pr === 3) return 'mid';
          return 'high';
        }
        const oct = Math.trunc(Number(baseOctRaw));
        if (Number.isFinite(oct)) {
          if (oct <= 3) return 'low';
          if (oct === 4) return 'mid';
          return 'high';
        }
        return '';
      };
      const normalizeCombatRole = (value) => {
        const raw = String(value || '').trim().toLowerCase();
        if (!raw) return '';
        if (raw === 'foundation' || raw === 'melodic' || raw === 'percussive' || raw === 'texture' || raw === 'punctuation') return raw;
        if (raw.includes('drum') || raw.includes('perc')) return 'percussive';
        if (raw.includes('lead') || raw.includes('melod')) return 'melodic';
        if (raw.includes('bass') || raw.includes('foundation')) return 'foundation';
        if (raw.includes('texture') || raw.includes('ambient') || raw.includes('motion')) return 'texture';
        if (raw.includes('accent') || raw.includes('punct')) return 'punctuation';
        return '';
      };
      const parsePitchRank = (rawValue, baseOctRaw) => {
        const raw = String(rawValue || '').trim().toLowerCase();
        if (raw) {
          const n = Number(raw);
          if (Number.isFinite(n)) return Math.max(1, Math.min(5, Math.trunc(n)));
          if (raw.includes('very low') || raw.includes('sub') || raw.includes('deep')) return 1;
          if (raw.includes('low')) return 2;
          if (raw.includes('mid')) return raw.includes('high') ? 4 : 3;
          if (raw.includes('high')) return 5;
        }
        const oct = Math.trunc(Number(baseOctRaw));
        if (Number.isFinite(oct)) {
          if (oct <= 2) return 1;
          if (oct === 3) return 2;
          if (oct === 4) return 3;
          if (oct === 5) return 4;
          if (oct >= 6) return 5;
        }
        return null;
      };
      ID_TO_DISPLAY_NAME.clear(); DISPLAY_NAME_TO_ID.clear(); ID_TO_THEMES.clear(); ALL_THEMES.clear();
      const out = [];
      for (const line of lines){
        const cells = line.split(',');
        const id = String((idIdx !== -1 ? cells[idIdx] : '') || cells[synthIdx] || '').trim();
        const display = String((cells[dispIdx] || id)).trim();
        const type = String((cells[typeIdx]||'')).trim();
        const instrumentFamily = String((familyIdx >= 0 ? cells[familyIdx] : '') || '').trim();
        const functionTag = String((fnIdx >= 0 ? cells[fnIdx] : '') || '').trim();
        const synth = String((cells[synthIdx]||'')).trim();
        let baseNote = String((baseNoteIdx >= 0 ? cells[baseNoteIdx] : '') || '').trim();
        const baseOct = String((baseOctIdx >= 0 ? cells[baseOctIdx] : '') || '').trim();
        if (!baseNote && baseOct) baseNote = `C${baseOct}`;
        const themesRaw = themeIdx >= 0 ? String(cells[themeIdx] || '') : '';
        const themes = themesRaw.split(/[;|]/).map(t=>t.trim()).filter(Boolean);
        const recoRaw = recoIdx >= 0 ? String(cells[recoIdx] || '') : '';
        const recommendedToys = recoRaw.split(/[;|]/).map(t=>t.trim().toLowerCase()).filter(Boolean);
        const laneRaw = laneIdx >= 0 ? String(cells[laneIdx] || '') : '';
        const laneRoleRaw = laneRoleIdx >= 0 ? String(cells[laneRoleIdx] || '') : '';
        const laneRole = mapLaneToken(laneRoleRaw);
        const laneHints = laneRaw
          .split(/[;|,/]/)
          .map((token) => mapLaneToken(token))
          .filter(Boolean);
        if (laneRole) laneHints.unshift(laneRole);
        const pitchGrade = String((pitchIdx >= 0 ? cells[pitchIdx] : '') || '').trim();
        const pitchRank = parsePitchRank(pitchGrade, baseOct);
        const registerClassRaw = registerClassIdx >= 0 ? String(cells[registerClassIdx] || '') : '';
        const registerClass = normalizeRegisterClass(registerClassRaw, pitchRank, baseOct);
        const combatRoleRaw = combatRoleIdx >= 0 ? String(cells[combatRoleIdx] || '') : '';
        const combatRole = normalizeCombatRole(combatRoleRaw);
        const priRaw = priIdx >= 0 ? String(cells[priIdx] || '') : '';
        const priority = /^(1|true|yes|y|prio|priority)$/i.test(priRaw.trim());
        if (!id || !display) continue;
        out.push({
          id,
          display,
          type,
          instrumentFamily,
          functionTag,
          synth,
          themes,
          recommendedToys,
          laneHints,
          laneRole: laneRole || undefined,
          registerClass: registerClass || undefined,
          combatRole: combatRole || undefined,
          pitchGrade: pitchGrade || undefined,
          pitchRank: Number.isFinite(pitchRank) ? pitchRank : undefined,
          priority,
          baseNote: baseNote || undefined,
        });
        ID_TO_DISPLAY_NAME.set(id, display);
        DISPLAY_NAME_TO_ID.set(display, id);
        if (themes.length){
          ID_TO_THEMES.set(id, themes);
          themes.forEach(t=> ALL_THEMES.add(t));
        }
      }
      // Dedup by display label; prefer priority entries when duplicates exist.
      const byLabel = new Map();
      for (const e of out){
        const key = String(e?.display || '').trim();
        if (!key) continue;
        if (!byLabel.has(key)) {
          byLabel.set(key, e);
          continue;
        }
        const existing = byLabel.get(key);
        const existingPriority = existing?.priority === true;
        const incomingPriority = e?.priority === true;
        if (incomingPriority && !existingPriority) byLabel.set(key, e);
      }
      LAST_ENTRIES = Array.from(byLabel.values());
      try {
        window.dispatchEvent(new CustomEvent('instrument-catalog:loaded', { detail: { entries: LAST_ENTRIES } }));
      } catch {}
      return Array.from(LAST_ENTRIES);
    }
  }catch{}
  LAST_ENTRIES = [];
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
