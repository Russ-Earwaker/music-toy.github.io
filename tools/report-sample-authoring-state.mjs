import fs from 'node:fs/promises';
import path from 'node:path';

function csvSplit(line) {
  return line.split(',');
}

function normalize(value) {
  return String(value || '').trim();
}

function readCsvWithComments(text) {
  const lines = text.split(/\r?\n/);
  const headerLineIndex = lines.findIndex((line) => line.trim() && !line.trim().startsWith('#'));
  if (headerLineIndex < 0) return null;
  const header = csvSplit(lines[headerLineIndex]).map((cell) => normalize(cell));
  const rows = [];
  for (let i = headerLineIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const cells = csvSplit(line);
    const row = {};
    header.forEach((key, idx) => {
      row[key] = normalize(cells[idx]);
    });
    rows.push(row);
  }
  return { header, rows };
}

function getPlaybackBaseNote(row) {
  const note = normalize(row.base_note);
  const oct = normalize(row.base_oct);
  if (note && /-?\d+/.test(note)) return note;
  if (note && oct) return `${note}${oct}`;
  if (note) return note;
  if (oct) return `C${oct}`;
  return '';
}

function getSourceBaseNote(row) {
  const note = normalize(row.source_base_note);
  const oct = normalize(row.source_base_oct);
  if (note && /-?\d+/.test(note)) return note;
  if (note && oct) return `${note}${oct}`;
  if (note) return note;
  if (oct) return `C${oct}`;
  return '';
}

async function main() {
  const csvPath = path.resolve('samples.csv');
  const text = await fs.readFile(csvPath, 'utf8');
  const parsed = readCsvWithComments(text);
  if (!parsed) throw new Error('Could not parse samples.csv');

  let totalRows = 0;
  let withPlaybackAnchor = 0;
  let withSourcePitch = 0;
  let withVolumeHint = 0;
  let playbackVsSourceMismatch = 0;
  let strongVolumeHints = 0;

  const mismatchRows = [];
  const strongVolumeRows = [];
  const missingPlaybackRows = [];

  for (const row of parsed.rows) {
    totalRows += 1;
    const filename = normalize(row.filename);
    const playbackBase = getPlaybackBaseNote(row);
    const sourceBase = getSourceBaseNote(row);
    const volume = normalize(row.volume);
    if (playbackBase) withPlaybackAnchor += 1;
    if (sourceBase) withSourcePitch += 1;
    if (volume) withVolumeHint += 1;
    if (!playbackBase && sourceBase) {
      missingPlaybackRows.push({ filename, sourceBase });
    }
    if (playbackBase && sourceBase && playbackBase.toUpperCase() !== sourceBase.toUpperCase()) {
      playbackVsSourceMismatch += 1;
      mismatchRows.push({ filename, playbackBase, sourceBase });
    }
    const volumeDb = Number(volume);
    if (Number.isFinite(volumeDb) && Math.abs(volumeDb) >= 6) {
      strongVolumeHints += 1;
      strongVolumeRows.push({ filename, volume });
    }
  }

  console.log(`rows=${totalRows}`);
  console.log(`with_playback_anchor=${withPlaybackAnchor}`);
  console.log(`with_source_pitch=${withSourcePitch}`);
  console.log(`with_volume_hint=${withVolumeHint}`);
  console.log(`playback_source_mismatch=${playbackVsSourceMismatch}`);
  console.log(`strong_volume_hints=${strongVolumeHints}`);

  if (mismatchRows.length) {
    console.log('playback_vs_source_examples:');
    for (const row of mismatchRows.slice(0, 20)) {
      console.log(`  ${row.filename}: playback=${row.playbackBase} source=${row.sourceBase}`);
    }
    if (mismatchRows.length > 20) {
      console.log(`  ... ${mismatchRows.length - 20} more`);
    }
  }

  if (strongVolumeRows.length) {
    console.log('strong_volume_examples:');
    for (const row of strongVolumeRows.slice(0, 20)) {
      console.log(`  ${row.filename}: volume=${row.volume}`);
    }
    if (strongVolumeRows.length > 20) {
      console.log(`  ... ${strongVolumeRows.length - 20} more`);
    }
  }

  if (missingPlaybackRows.length) {
    console.log('source_without_playback_anchor:');
    for (const row of missingPlaybackRows.slice(0, 20)) {
      console.log(`  ${row.filename}: source=${row.sourceBase}`);
    }
    if (missingPlaybackRows.length > 20) {
      console.log(`  ... ${missingPlaybackRows.length - 20} more`);
    }
  }
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
