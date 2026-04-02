import http from 'http';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const port = Number(process.env.PERF_LAB_PORT || 5174);
const outRootDir = process.env.PERF_LAB_OUT_DIR || 'resources';
const perfDirName = process.env.PERF_LAB_RESULTS_DIR || 'perf-lab-results';
const musicDirName = process.env.MUSIC_LAB_RESULTS_DIR || 'music-lab-results';
const debugDirName = process.env.DEBUG_OUTPUT_DIR || 'debug-output';

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function send(res, code, body, type = 'text/plain') {
  res.writeHead(code, {
    'Content-Type': type,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    send(res, 204, '');
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    send(res, 200, 'ok');
    return;
  }

  const saveBundle = async ({ routeTag, stampPrefix, outputDirName }) => {
    try {
      const body = await readBody(req);
      const payload = JSON.parse(body);
      const targetDir = join(outRootDir, outputDirName);
      mkdirSync(targetDir, { recursive: true });
      const stampPath = join(targetDir, `${stampPrefix}-${nowStamp()}.json`);
      const out = JSON.stringify(payload, null, 2);
      writeFileSync(stampPath, out, 'utf8');
      send(res, 200, 'saved');
      console.log(`[${routeTag}] saved`, stampPath);
      return;
    } catch (err) {
      console.error(`[${routeTag}] failed`, err);
      send(res, 400, 'invalid json');
      return;
    }
  };

  const saveDebugOutput = async () => {
    try {
      const body = await readBody(req);
      const payload = JSON.parse(body);
      const targetDir = join(outRootDir, debugDirName);
      mkdirSync(targetDir, { recursive: true });
      const rawFileName = String(payload?.fileName || '').trim();
      const safeFileName = rawFileName
        ? rawFileName.replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
        : `debug-output-${nowStamp()}.txt`;
      const outPath = join(targetDir, safeFileName);
      const text = typeof payload?.text === 'string'
        ? payload.text
        : JSON.stringify(payload, null, 2);
      writeFileSync(outPath, text, 'utf8');
      send(res, 200, 'saved');
      console.log('[debug-output] saved', outPath);
      return;
    } catch (err) {
      console.error('[debug-output] failed', err);
      send(res, 400, 'invalid json');
      return;
    }
  };

  if (req.method === 'POST' && req.url === '/perf-lab-results') {
    await saveBundle({
      routeTag: 'perf-lab-results',
      stampPrefix: 'perf-lab-results',
      outputDirName: perfDirName,
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/music-lab-results') {
    await saveBundle({
      routeTag: 'music-lab-results',
      stampPrefix: 'music-lab-results',
      outputDirName: musicDirName,
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/debug-output') {
    await saveDebugOutput();
    return;
  }

  send(res, 404, 'not found');
});

server.listen(port, () => {
  console.log(`[perf-lab-results] listening on http://localhost:${port}`);
});
