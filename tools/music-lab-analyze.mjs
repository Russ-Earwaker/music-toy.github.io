import { readdirSync, readFileSync, statSync } from 'fs';
import { basename, join, resolve } from 'path';

const DEFAULT_THRESHOLDS = Object.freeze({
  notePoolComplianceMin: 0.85,
  intervalSmoothShareMin: 0.7,
  motifReuseRateMin: 0.18,
  responseRateMin: 0.2,
  paletteContinuityMin: 0.55,
  playerMaskingRateMax: 0.35,
  enemyExecutedToCreatedRateMin: 0.985,
  spawnerExecutedToCreatedRateMin: 0.99,
  bassExecutedToCreatedRateMin: 0.99,
  maxEnemyStepsWithoutBassMax: 24,
});

function parseArgs(argv) {
  const out = {
    dir: 'resources/music-lab-results',
    files: [],
    all: false,
    limit: 10,
    json: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = String(argv[i] || '').trim();
    if (!a) continue;
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--all') out.all = true;
    else if (a === '--json') out.json = true;
    else if (a === '--dir') out.dir = String(argv[++i] || out.dir);
    else if (a === '--file') out.files.push(String(argv[++i] || '').trim());
    else if (a === '--limit') out.limit = Math.max(1, Math.trunc(Number(argv[++i]) || out.limit));
  }
  if (out.all) out.limit = Number.POSITIVE_INFINITY;
  return out;
}

function formatPct(v, digits = 1) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 'n/a';
  return `${(n * 100).toFixed(digits)}%`;
}

function formatNum(v, digits = 3) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 'n/a';
  return n.toFixed(digits);
}

function usage() {
  return [
    'Usage: node tools/music-lab-analyze.mjs [options]',
    '',
    'Options:',
    '  --dir <path>     Directory to scan (default: resources/music-lab-results)',
    '  --file <path>    Analyze a specific JSON file (repeatable)',
    '  --limit <n>      Max files to scan (default: 10)',
    '  --all            Scan all matching files',
    '  --json           Print JSON report',
    '  --help           Show this help',
    '',
    'Examples:',
    '  node tools/music-lab-analyze.mjs',
    '  node tools/music-lab-analyze.mjs --all',
    '  node tools/music-lab-analyze.mjs --limit 25',
    '  node tools/music-lab-analyze.mjs --file resources/music-lab-results/music-lab-results-<timestamp>.json',
  ].join('\n');
}

function listCandidateFiles(opts) {
  if (opts.files.length > 0) return opts.files.map((f) => resolve(f));
  const dir = resolve(opts.dir);
  const files = [];
  const collect = (scanDir, depth = 0) => {
    let entries = [];
    try { entries = readdirSync(scanDir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = join(scanDir, entry.name);
      if (entry.isDirectory()) {
        if (depth < 1) collect(full, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      let mtimeMs = 0;
      try { mtimeMs = Number(statSync(full).mtimeMs) || 0; } catch {}
      const isMusic = /^music-lab-results.*\.json$/i.test(entry.name);
      const isPerf = /^perf-lab-results.*\.json$/i.test(entry.name);
      files.push({ full, mtimeMs, isMusic, isPerf });
    }
  };
  collect(dir, 0);
  const musicOnly = files.filter((x) => x.isMusic);
  const legacyPerf = files.filter((x) => x.isPerf);
  const picked = (musicOnly.length > 0) ? musicOnly : legacyPerf;
  return picked
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, Number.isFinite(opts.limit) ? opts.limit : undefined)
    .map((x) => x.full);
}

function safeReadJson(filePath) {
  try {
    const raw = readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function extractSessions(bundle, filePath) {
  const results = Array.isArray(bundle?.results) ? bundle.results : [];
  const out = [];
  for (const r of results) {
    const ml = r?.musicLab;
    if (!ml || typeof ml !== 'object') continue;
    out.push({
      filePath,
      fileName: basename(filePath),
      bundleCreatedAt: String(bundle?.createdAt || ''),
      runId: String(bundle?.meta?.runId || r?.runId || ''),
      label: String(r?.label || ''),
      session: ml,
    });
  }
  return out;
}

function metricValue(session, path, fallback = NaN) {
  const parts = String(path || '').split('.');
  let cur = session?.metrics;
  for (const p of parts) {
    if (!cur || typeof cur !== 'object') return fallback;
    cur = cur[p];
  }
  const n = Number(cur);
  return Number.isFinite(n) ? n : fallback;
}

function evaluateSession(sessionWrap, thresholds = DEFAULT_THRESHOLDS) {
  const s = sessionWrap?.session || {};
  const eventCount = Array.isArray(s?.eventTimeline) ? s.eventTimeline.length : 0;
  const paletteChanges = Array.isArray(s?.paletteChanges) ? s.paletteChanges.length : 0;
  const pacingChanges = Array.isArray(s?.pacingChanges) ? s.pacingChanges.length : 0;

  const observed = {
    notePoolCompliance: metricValue(s, 'notePoolCompliance.poolComplianceRate'),
    intervalSmoothShare: metricValue(s, 'intervalProfile.smoothShare'),
    motifReuseRate: metricValue(s, 'motifReuse.motifReuseRate'),
    responseRate: metricValue(s, 'callResponse.responseRate'),
    paletteContinuityScore: metricValue(s, 'paletteContinuity.paletteContinuityScore'),
    playerMaskingRate: metricValue(s, 'playerMasking.playerMaskingRate'),
    perfectSyncSpawnerPairs: metricValue(s, 'spawnerSync.perfectSyncSpawnerPairs'),
    nearDuplicateSpawnerPairs: metricValue(s, 'spawnerSync.nearDuplicateSpawnerPairs'),
    enemyExecutedToCreatedRate: metricValue(s, 'executedToCreatedRate'),
    spawnerExecutedToCreatedRate: metricValue(s, 'spawnerExecutedToCreatedRate'),
    bassExecutedToCreatedRate: metricValue(s, 'bassExecutedToCreatedRate'),
    maxEnemyStepsWithoutBass: metricValue(s, 'maxEnemyStepsWithoutBass'),
    skippedCreatedEvents: metricValue(s, 'skippedCreatedEvents'),
    spawnerSkippedCreatedEvents: metricValue(s, 'spawnerSkippedCreatedEvents'),
    bassSkippedCreatedEvents: metricValue(s, 'bassSkippedCreatedEvents'),
  };

  const checks = [
    { key: 'notePoolCompliance', op: '>=', target: thresholds.notePoolComplianceMin, value: observed.notePoolCompliance },
    { key: 'intervalSmoothShare', op: '>=', target: thresholds.intervalSmoothShareMin, value: observed.intervalSmoothShare },
    { key: 'motifReuseRate', op: '>=', target: thresholds.motifReuseRateMin, value: observed.motifReuseRate },
    { key: 'responseRate', op: '>=', target: thresholds.responseRateMin, value: observed.responseRate },
    { key: 'paletteContinuityScore', op: '>=', target: thresholds.paletteContinuityMin, value: observed.paletteContinuityScore },
    { key: 'playerMaskingRate', op: '<=', target: thresholds.playerMaskingRateMax, value: observed.playerMaskingRate },
    { key: 'enemyExecutedToCreatedRate', op: '>=', target: thresholds.enemyExecutedToCreatedRateMin, value: observed.enemyExecutedToCreatedRate },
    { key: 'spawnerExecutedToCreatedRate', op: '>=', target: thresholds.spawnerExecutedToCreatedRateMin, value: observed.spawnerExecutedToCreatedRate },
    { key: 'bassExecutedToCreatedRate', op: '>=', target: thresholds.bassExecutedToCreatedRateMin, value: observed.bassExecutedToCreatedRate },
    { key: 'maxEnemyStepsWithoutBass', op: '<=', target: thresholds.maxEnemyStepsWithoutBassMax, value: observed.maxEnemyStepsWithoutBass },
  ].map((c) => {
    const has = Number.isFinite(c.value);
    const pass = !has ? false : (c.op === '>=' ? c.value >= c.target : c.value <= c.target);
    return { ...c, has, pass };
  });

  const failed = checks.filter((c) => !c.pass).map((c) => c.key);
  const pass = failed.length === 0;

  return {
    ...sessionWrap,
    sessionId: String(s?.sessionId || ''),
    startedAtIso: String(s?.startedAtIso || ''),
    endedAtIso: String(s?.endedAtIso || ''),
    eventCount,
    paletteChanges,
    pacingChanges,
    observed,
    checks,
    pass,
    failed,
  };
}

function aggregate(sessions) {
  const keys = [
    'notePoolCompliance',
    'intervalSmoothShare',
    'motifReuseRate',
    'responseRate',
    'paletteContinuityScore',
    'playerMaskingRate',
    'enemyExecutedToCreatedRate',
    'spawnerExecutedToCreatedRate',
    'bassExecutedToCreatedRate',
    'maxEnemyStepsWithoutBass',
  ];
  const out = {};
  for (const k of keys) {
    const vals = sessions
      .map((s) => Number(s?.observed?.[k]))
      .filter((n) => Number.isFinite(n));
    if (!vals.length) {
      out[k] = { count: 0, min: null, max: null, avg: null };
      continue;
    }
    const sum = vals.reduce((a, b) => a + b, 0);
    out[k] = {
      count: vals.length,
      min: Math.min(...vals),
      max: Math.max(...vals),
      avg: sum / vals.length,
    };
  }
  return out;
}

function dedupeSessions(sessions) {
  const seen = new Set();
  const out = [];
  for (const s of sessions) {
    const key = [
      String(s?.sessionId || ''),
      String(s?.endedAtIso || ''),
      String(s?.eventCount || 0),
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

function printReport(scannedFiles, sessions) {
  console.log(`Scanned files: ${scannedFiles.length}`);
  console.log(`Music Lab sessions: ${sessions.length}`);
  if (!sessions.length) {
    console.log('No musicLab payloads found.');
    return;
  }
  console.log('');
  for (const s of sessions) {
    console.log(`- ${s.fileName} | session=${s.sessionId || 'n/a'} | ${s.pass ? 'PASS' : 'FAIL'}`);
    console.log(`  time: ${s.startedAtIso || 'n/a'} -> ${s.endedAtIso || 'n/a'}`);
    console.log(`  events=${s.eventCount} paletteChanges=${s.paletteChanges} pacingChanges=${s.pacingChanges}`);
    console.log(
      `  notePool=${formatPct(s.observed.notePoolCompliance)} intervalSmooth=${formatPct(s.observed.intervalSmoothShare)} motifReuse=${formatPct(s.observed.motifReuseRate)}`
    );
    console.log(
      `  responseRate=${formatNum(s.observed.responseRate)} paletteContinuity=${formatNum(s.observed.paletteContinuityScore)} playerMasking=${formatPct(s.observed.playerMaskingRate)}`
    );
    console.log(
      `  spawnerSync perfectPairs=${formatNum(s.observed.perfectSyncSpawnerPairs, 0)} nearDupPairs=${formatNum(s.observed.nearDuplicateSpawnerPairs, 0)}`
    );
    console.log(
      `  delivery enemy=${formatPct(s.observed.enemyExecutedToCreatedRate)} spawner=${formatPct(s.observed.spawnerExecutedToCreatedRate)} bass=${formatPct(s.observed.bassExecutedToCreatedRate)} maxEnemyStepsWithoutBass=${formatNum(s.observed.maxEnemyStepsWithoutBass, 0)}`
    );
    console.log(
      `  skipped created total=${formatNum(s.observed.skippedCreatedEvents, 0)} spawner=${formatNum(s.observed.spawnerSkippedCreatedEvents, 0)} bass=${formatNum(s.observed.bassSkippedCreatedEvents, 0)}`
    );
    if (!s.pass) console.log(`  failed: ${s.failed.join(', ')}`);
  }
  console.log('');
  const agg = aggregate(sessions);
  console.log('Aggregate baseline (min/avg/max):');
  const row = (key, pct = false) => {
    const v = agg[key];
    if (!v || !v.count) {
      console.log(`  ${key}: n/a`);
      return;
    }
    if (pct) {
      console.log(`  ${key}: ${formatPct(v.min)} / ${formatPct(v.avg)} / ${formatPct(v.max)} (n=${v.count})`);
      return;
    }
    console.log(`  ${key}: ${formatNum(v.min)} / ${formatNum(v.avg)} / ${formatNum(v.max)} (n=${v.count})`);
  };
  row('notePoolCompliance', true);
  row('intervalSmoothShare', true);
  row('motifReuseRate', true);
  row('responseRate', false);
  row('paletteContinuityScore', false);
  row('playerMaskingRate', true);
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(usage());
    process.exit(0);
  }
  const files = listCandidateFiles(opts);
  const sessions = [];
  for (const filePath of files) {
    const bundle = safeReadJson(filePath);
    if (!bundle) continue;
    sessions.push(...extractSessions(bundle, filePath));
  }
  const evaluated = dedupeSessions(sessions.map((s) => evaluateSession(s)));
  if (opts.json) {
    const payload = {
      scannedFiles: files,
      thresholds: { ...DEFAULT_THRESHOLDS },
      sessions: evaluated,
      aggregate: aggregate(evaluated),
    };
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  printReport(files, evaluated);
}

main();
