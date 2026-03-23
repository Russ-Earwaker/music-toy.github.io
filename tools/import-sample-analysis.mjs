import fs from 'node:fs/promises';
import path from 'node:path';

const REQUIRED_COLUMNS = ['source_base_note', 'source_base_oct', 'volume'];
const DEFAULTS = {
  input: 'samples.csv',
  suggestions: 'tools/output/sample-analysis-suggestions.csv',
  debug: 'tools/output/sample-analysis-debug.csv',
  output: '',
  write: false,
  minPitchConfidence: 0.85,
  importVolume: 'outliers',
};

function parseArgs(argv) {
  const args = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--input' && argv[i + 1]) {
      args.input = argv[++i];
    } else if (arg === '--suggestions' && argv[i + 1]) {
      args.suggestions = argv[++i];
    } else if (arg === '--debug' && argv[i + 1]) {
      args.debug = argv[++i];
    } else if (arg === '--output' && argv[i + 1]) {
      args.output = argv[++i];
    } else if (arg === '--min-pitch-confidence' && argv[i + 1]) {
      args.minPitchConfidence = Number(argv[++i]);
    } else if (arg === '--import-volume' && argv[i + 1]) {
      args.importVolume = String(argv[++i] || '').trim().toLowerCase();
    } else if (arg === '--write') {
      args.write = true;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function printHelp() {
  console.log([
    'Usage: node tools/import-sample-analysis.mjs [options]',
    '',
    'Options:',
    '  --input <file>                 samples.csv input path',
    '  --suggestions <file>           sample-analysis-suggestions.csv path',
    '  --debug <file>                 optional sample-analysis-debug.csv path',
    '  --output <file>                write merged CSV to a new file',
    '  --write                        update the input CSV in place',
    '  --min-pitch-confidence <n>     minimum confidence for source pitch import (default 0.85)',
    "  --import-volume <mode>         'none' | 'outliers' | 'all' (default outliers)",
    '',
    'Dry-run by default: prints a summary without modifying files.',
    'This tool imports raw source-pitch metadata and conservative volume hints,',
    'but leaves playback base_note/base_oct unchanged.',
  ].join('\n'));
}

function csvSplit(line) {
  return line.split(',');
}

function ensureColumns(header) {
  const out = header.slice();
  for (const col of REQUIRED_COLUMNS) {
    if (!out.includes(col)) out.push(col);
  }
  return out;
}

function normalize(value) {
  return String(value || '').trim();
}

function normalizeUpperNote(value) {
  const raw = normalize(value).toUpperCase();
  return /^[A-G](#|B)?$/.test(raw) ? raw.replace('B', 'b') : raw;
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
    rows.push({ row, lineIndex: i });
  }
  return { lines, headerLineIndex, header, rows };
}

function toCsvLine(header, row) {
  return header.map((key) => normalize(row[key] || '')).join(',');
}

function isHighConfidencePitched(suggestion, minPitchConfidence) {
  const status = normalize(suggestion.analysis_status).toLowerCase();
  const confidence = Number(suggestion.pitch_confidence);
  return status === 'pitched' && Number.isFinite(confidence) && confidence >= minPitchConfidence;
}

function getVolumeHint(suggestion, mode = 'outliers') {
  const importMode = normalize(mode).toLowerCase() || 'outliers';
  if (importMode === 'none') return '';
  const classification = normalize(suggestion.volume_classification).toLowerCase();
  if (!classification) return '';
  if (importMode === 'outliers' && classification === 'ok') return '';
  const peak = Number(suggestion.suggested_volume_peak_dbfs);
  const rms = Number(suggestion.suggested_volume_rms_dbfs);
  if (classification === 'too_hot') {
    if (Number.isFinite(peak) && peak > -0.25) return '-6';
    if (Number.isFinite(peak) && peak > -1.0) return '-3';
    return '-3';
  }
  if (classification === 'quiet') {
    if (Number.isFinite(rms) && rms <= -34) return '+9';
    if (Number.isFinite(rms) && rms <= -28) return '+6';
    return '+3';
  }
  return importMode === 'all' ? '0' : '';
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const inputPath = path.resolve(args.input);
  const suggestionPath = path.resolve(args.suggestions);
  const debugPath = path.resolve(args.debug);
  const inputText = await fs.readFile(inputPath, 'utf8');
  const suggestionText = await fs.readFile(suggestionPath, 'utf8');
  const parsed = readCsvWithComments(inputText);
  if (!parsed) throw new Error('Could not parse samples.csv');
  const suggestionParsed = readCsvWithComments(suggestionText);
  if (!suggestionParsed) throw new Error('Could not parse suggestions CSV');
  let debugParsed = null;
  try {
    const debugText = await fs.readFile(debugPath, 'utf8');
    debugParsed = readCsvWithComments(debugText);
  } catch {}

  const header = ensureColumns(parsed.header);
  const suggestionByFilename = new Map();
  for (const { row } of suggestionParsed.rows) {
    const filename = normalize(row.filename);
    if (!filename) continue;
    suggestionByFilename.set(filename, row);
  }
  if (debugParsed) {
    for (const { row } of debugParsed.rows) {
      const filename = normalize(row.filename);
      if (!filename) continue;
      const base = suggestionByFilename.get(filename) || {};
      suggestionByFilename.set(filename, { ...base, ...row });
    }
  }

  let importedPitchCount = 0;
  let importedVolumeCount = 0;
  let touchedRows = 0;
  const touched = [];

  for (const { row, lineIndex } of parsed.rows) {
    let rowChanged = false;
    const filename = normalize(row.filename);
    const suggestion = suggestionByFilename.get(filename);
    if (!suggestion) continue;

    if (!normalize(row.source_base_note) && !normalize(row.source_base_oct) && isHighConfidencePitched(suggestion, args.minPitchConfidence)) {
      const note = normalizeUpperNote(suggestion.suggested_base_note);
      const oct = normalize(suggestion.suggested_base_oct);
      if (note && oct) {
        row.source_base_note = note;
        row.source_base_oct = oct;
        importedPitchCount += 1;
        rowChanged = true;
      }
    }

    if (!normalize(row.volume)) {
      const volumeHint = getVolumeHint(suggestion, args.importVolume);
      if (volumeHint) {
        row.volume = volumeHint;
        importedVolumeCount += 1;
        rowChanged = true;
      }
    }

    if (rowChanged) {
      touchedRows += 1;
      touched.push({ filename, lineIndex: lineIndex + 1, source_base_note: row.source_base_note || '', source_base_oct: row.source_base_oct || '', volume: row.volume || '' });
    }
  }

  const outLines = parsed.lines.slice();
  outLines[parsed.headerLineIndex] = header.join(',');
  for (const { row, lineIndex } of parsed.rows) {
    outLines[lineIndex] = toCsvLine(header, row);
  }
  const outputText = `${outLines.join('\n').replace(/\n?$/, '\n')}`;

  console.log(`rows_touched=${touchedRows}`);
  console.log(`imported_source_pitch=${importedPitchCount}`);
  console.log(`imported_volume=${importedVolumeCount}`);
  if (touched.length) {
    console.log('review:');
    for (const item of touched.slice(0, 20)) {
      console.log(`  line ${item.lineIndex}: ${item.filename} -> source=${item.source_base_note}${item.source_base_oct || ''} volume=${item.volume}`);
    }
    if (touched.length > 20) {
      console.log(`  ... ${touched.length - 20} more`);
    }
  }

  if (args.write) {
    await fs.writeFile(inputPath, outputText, 'utf8');
    console.log(`wrote ${inputPath}`);
  } else if (args.output) {
    const outputPath = path.resolve(args.output);
    await fs.writeFile(outputPath, outputText, 'utf8');
    console.log(`wrote ${outputPath}`);
  } else {
    console.log('dry_run=true');
  }
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
