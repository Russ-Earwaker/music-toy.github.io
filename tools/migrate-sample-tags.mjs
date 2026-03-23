import fs from 'node:fs/promises';
import path from 'node:path';

const REQUIRED_COLUMNS = ['music_role', 'music_behavior', 'runtime_family', 'needs_review'];
const ALLOWED_ROLES = new Set(['foundation', 'foreground', 'support', 'accent']);

function parseArgs(argv) {
  const args = {
    input: 'samples.csv',
    output: '',
    write: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--input' && argv[i + 1]) {
      args.input = argv[i + 1];
      i += 1;
    } else if (arg === '--output' && argv[i + 1]) {
      args.output = argv[i + 1];
      i += 1;
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
  console.log(
    [
      'Usage: node tools/migrate-sample-tags.mjs [--input samples.csv] [--output out.csv] [--write]',
      '',
      'Dry-run by default: prints a summary and review list without modifying files.',
      '--write updates the input file in place.',
      '--output writes the migrated CSV to the provided path.',
    ].join('\n')
  );
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

function normalizeToken(value) {
  return String(value || '').trim().toLowerCase();
}

function splitTags(value) {
  return String(value || '')
    .split(/[;|,/]/)
    .map((part) => normalizeToken(part))
    .filter(Boolean);
}

function uniqueOrdered(values) {
  const out = [];
  const seen = new Set();
  for (const value of values) {
    const v = normalizeToken(value);
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function normalizeRuntimeFamily(row) {
  const explicit = normalizeToken(row.runtime_family);
  if (explicit) return explicit;
  const instrumentType = normalizeToken(row.instrument_type);
  const family = normalizeToken(row.instrument);
  const functionTag = normalizeToken(row.function);
  const combatRole = normalizeToken(row.combatRole);
  const display = normalizeToken(row.display_name);

  if (family === 'drum' || instrumentType === 'percussion') return 'percussion';
  if (combatRole === 'foundation' || display.includes('bass')) return 'bass';
  if (display.includes('saw') || display.includes('square') || display.includes('synth')) return 'synth';
  if (family === 'effects' || instrumentType === 'effects' || functionTag.includes('fx')) return 'fx';
  if (family) return family;
  if (instrumentType) return instrumentType;
  return '';
}

function inferMusicRole(row) {
  const existing = normalizeToken(row.music_role);
  if (ALLOWED_ROLES.has(existing)) {
    return { value: existing, confidence: 'explicit', reasons: [] };
  }

  const combatRole = normalizeToken(row.combatRole);
  const laneRole = normalizeToken(row.laneRole);
  const functionTag = normalizeToken(row.function);
  const runtimeFamily = normalizeRuntimeFamily(row);
  const display = normalizeToken(row.display_name);
  const reasons = [];

  if (combatRole === 'foundation' || laneRole === 'bass') {
    reasons.push('legacy foundation/bass mapping');
    return { value: 'foundation', confidence: 'high', reasons };
  }
  if (laneRole === 'lead') {
    reasons.push('legacy lead lane mapping');
    return { value: 'foreground', confidence: 'medium', reasons };
  }
  if (combatRole === 'texture' || laneRole === 'motion') {
    reasons.push('legacy texture/motion mapping');
    return { value: 'support', confidence: 'medium', reasons };
  }
  if (
    combatRole === 'percussive'
    || combatRole === 'punctuation'
    || combatRole === 'player_weapon'
    || laneRole === 'accent'
    || functionTag.includes('short')
    || display.includes('explosion')
    || display.includes('impact')
    || display.includes('hit')
    || display.includes('punch')
  ) {
    reasons.push('accent-like punctuation mapping');
    return { value: 'accent', confidence: 'medium', reasons };
  }
  if (runtimeFamily === 'percussion' || runtimeFamily === 'fx') {
    reasons.push('family-based support/accent ambiguity');
    return { value: 'accent', confidence: 'low', reasons };
  }
  return { value: '', confidence: 'low', reasons: ['no confident role inference'] };
}

function inferMusicBehavior(row) {
  const existing = uniqueOrdered(splitTags(row.music_behavior));
  if (existing.length) {
    return { value: existing.join('|'), confidence: 'explicit', reasons: [] };
  }

  const functionTag = normalizeToken(row.function);
  const instrumentType = normalizeToken(row.instrument_type);
  const instrument = normalizeToken(row.instrument);
  const laneRole = normalizeToken(row.laneRole);
  const combatRole = normalizeToken(row.combatRole);
  const recommendedToys = splitTags(row.recommended_toys);
  const display = normalizeToken(row.display_name);
  const baseNote = normalizeToken(row.base_note);
  const runtimeFamily = normalizeRuntimeFamily(row);
  const behavior = [];
  const reasons = [];

  const isShort = functionTag.includes('short') || functionTag.includes('hit') || functionTag.includes('pluck');
  const isOneShot = isShort
    || display.includes('explosion')
    || display.includes('impact')
    || display.includes('punch')
    || display.includes('bling');
  const isSustain = functionTag.includes('sustain')
    || functionTag.includes('drone')
    || functionTag.includes('pad')
    || functionTag.includes('long');
  const isRhythmic = instrumentType === 'percussion'
    || instrument === 'drum'
    || combatRole === 'percussive'
    || laneRole === 'bass'
    || laneRole === 'accent'
    || laneRole === 'motion';
  const isMelodic = laneRole === 'lead'
    || laneRole === 'bass'
    || combatRole === 'foundation'
    || (baseNote && instrumentType !== 'percussion' && runtimeFamily !== 'fx');
  const isLoop = recommendedToys.includes('loopgrid')
    || recommendedToys.includes('loopgrid-drum')
    || recommendedToys.includes('drawgrid')
    || (combatRole === 'foundation' && !isOneShot)
    || (laneRole === 'lead' && !isOneShot);

  if (isLoop) {
    behavior.push('loop');
    reasons.push('loop-capable legacy hints');
  }
  if (isOneShot) {
    behavior.push('oneshot');
    reasons.push('short impact-like behavior');
  }
  if (isShort) behavior.push('short');
  if (isSustain) behavior.push('sustain');
  if (isRhythmic) behavior.push('rhythmic');
  if (isMelodic) behavior.push('melodic');

  const unique = uniqueOrdered(behavior);
  if (!unique.length) {
    return { value: '', confidence: 'low', reasons: ['no confident behavior inference'] };
  }

  const confidence = unique.includes('loop') || unique.includes('oneshot')
    ? 'medium'
    : 'low';
  return { value: unique.join('|'), confidence, reasons };
}

function inferNeedsReview(roleInference, behaviorInference) {
  if (!roleInference.value || !behaviorInference.value) return true;
  if (roleInference.confidence !== 'high') return true;
  if (behaviorInference.confidence === 'low') return true;
  return false;
}

function migrateRow(row) {
  const runtimeFamily = normalizeRuntimeFamily(row);
  const roleInference = inferMusicRole({ ...row, runtime_family: runtimeFamily });
  const behaviorInference = inferMusicBehavior({ ...row, runtime_family: runtimeFamily });
  const needsReview = normalizeToken(row.needs_review) === 'true'
    ? 'true'
    : (inferNeedsReview(roleInference, behaviorInference) ? 'true' : '');
  return {
    row: {
      ...row,
      music_role: row.music_role || roleInference.value,
      music_behavior: row.music_behavior || behaviorInference.value,
      runtime_family: row.runtime_family || runtimeFamily,
      needs_review: row.needs_review || needsReview,
    },
    review: needsReview === 'true',
    reasons: uniqueOrdered([
      ...roleInference.reasons,
      ...behaviorInference.reasons,
      ...(needsReview === 'true' ? ['manual review recommended'] : []),
    ]),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const inputPath = path.resolve(args.input);
  const raw = await fs.readFile(inputPath, 'utf8');
  const lines = raw.split(/\r?\n/);
  if (!lines.length || !lines[0].trim()) throw new Error('CSV is empty');

  const header = ensureColumns(csvSplit(lines[0]));
  const inputHeader = csvSplit(lines[0]);
  const migratedLines = [header.join(',')];
  const reviewRows = [];
  let dataRowCount = 0;
  let changedRowCount = 0;

  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line == null) continue;
    if (!line.trim()) {
      migratedLines.push('');
      continue;
    }
    if (line.trim().startsWith('#')) {
      const cols = csvSplit(line);
      while (cols.length < header.length) cols.push('');
      migratedLines.push(cols.slice(0, header.length).join(','));
      continue;
    }

    const cols = csvSplit(line);
    const row = {};
    header.forEach((name, idx) => {
      const oldIdx = inputHeader.indexOf(name);
      row[name] = oldIdx >= 0 ? (cols[oldIdx] ?? '').trim() : '';
    });
    if (!normalizeToken(row.display_name)) {
      while (cols.length < header.length) cols.push('');
      migratedLines.push(cols.slice(0, header.length).join(','));
      continue;
    }

    dataRowCount += 1;
    const before = JSON.stringify({
      music_role: row.music_role || '',
      music_behavior: row.music_behavior || '',
      runtime_family: row.runtime_family || '',
      needs_review: row.needs_review || '',
    });
    const migrated = migrateRow(row);
    const after = JSON.stringify({
      music_role: migrated.row.music_role || '',
      music_behavior: migrated.row.music_behavior || '',
      runtime_family: migrated.row.runtime_family || '',
      needs_review: migrated.row.needs_review || '',
    });
    if (before !== after) changedRowCount += 1;
    if (migrated.review) {
      reviewRows.push({
        display_name: migrated.row.display_name,
        instrument_id: migrated.row.instrument_id,
        music_role: migrated.row.music_role,
        music_behavior: migrated.row.music_behavior,
        runtime_family: migrated.row.runtime_family,
        reasons: migrated.reasons,
      });
    }

    const outCols = header.map((name) => migrated.row[name] ?? '');
    migratedLines.push(outCols.join(','));
  }

  const migratedText = migratedLines.join('\n');
  if (args.write) {
    await fs.writeFile(inputPath, migratedText.endsWith('\n') ? migratedText : `${migratedText}\n`, 'utf8');
  } else if (args.output) {
    const outputPath = path.resolve(args.output);
    await fs.writeFile(outputPath, migratedText.endsWith('\n') ? migratedText : `${migratedText}\n`, 'utf8');
  }

  const summary = {
    input: inputPath,
    writeMode: args.write ? 'in-place' : (args.output ? `output:${path.resolve(args.output)}` : 'dry-run'),
    dataRows: dataRowCount,
    changedRows: changedRowCount,
    reviewRows: reviewRows.length,
  };
  console.log(JSON.stringify(summary, null, 2));

  if (reviewRows.length) {
    console.log('\nNeeds review:');
    for (const item of reviewRows.slice(0, 40)) {
      console.log(
        `- ${item.display_name} [${item.instrument_id}] role=${item.music_role || '?'} behavior=${item.music_behavior || '?'} family=${item.runtime_family || '?'} :: ${item.reasons.join('; ')}`
      );
    }
    if (reviewRows.length > 40) {
      console.log(`...and ${reviewRows.length - 40} more`);
    }
  }
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exitCode = 1;
});
