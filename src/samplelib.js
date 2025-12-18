// src/samplelib.js
// Minimal CSV-driven sample/synth library.
// CSV columns: filename,instrument_type,instrument,function,display_name,synth_id(optional),instrument_id,base_note,base_oct,theme,recommended_toys
// - If filename is provided -> sample in ./assets/samples/<filename>
// - Else if synth_id is provided -> a synth instrument, resolved by your audio engine
// - `theme` can list multiple tags separated by `;` (e.g., "Drum and Bass; Gaming")
export const SampleLib = {
  rows: [],
  byName: {},     // display_name -> row
  byFile: {},     // filename -> row
  bySynth: {},    // display_name -> synth_id
  loaded: false,

  async load(url = './samples.csv'){
    const res = await fetch(url);
    if (!res.ok) throw new Error(`CSV load failed: ${res.status}`);
    const text = await res.text();
    this.parse(text);
  },

  parse(text){
    const lines = text.split(/\r?\n/).filter(l => l.trim().length && !l.trim().startsWith('#'));
    if (!lines.length){ this.rows = []; this.loaded = true; return; }
    const headers = lines[0].split(',').map(h => h.trim());
    const rows = [];
    for (let i=1;i<lines.length;i++){
      const raw = lines[i];
      if (!raw.trim()) continue;
      const cols = raw.split(',');
      const row = {};
      headers.forEach((h, j)=> row[h] = (cols[j] ?? '').trim());
      if (row.theme){
        row.themes = row.theme.split(/[;|]/).map(t=> t.trim()).filter(Boolean);
      }
      if (row.recommended_toys){
        row.recommended_toys = row.recommended_toys.split(/[;|]/).map(t=> t.trim()).filter(Boolean);
      }
      if (!row.display_name) continue;
      rows.push(row);
    }
    this.rows = rows;
    this.byName = {}; this.byFile = {}; this.bySynth = {};
    for (const r of rows){
      const name = r.display_name;
      if (r.filename) this.byFile[r.filename] = r;
      if (r.synth_id && !r.filename) this.bySynth[name] = r.synth_id;
      this.byName[name] = r;
    }
    this.loaded = true;
  },

  getDisplayNames(){
    return this.rows.map(r => r.display_name).filter(Boolean);
  },

  getUrlForDisplayName(name){
    const r = this.byName[name];
    if (!r) return null;
    return r.filename ? `./assets/samples/${r.filename}` : null;
  },

  getSynthIdForDisplayName(name){
    const r = this.byName[name];
    if (!r) return null;
    return r.synth_id || null;
  }
};
