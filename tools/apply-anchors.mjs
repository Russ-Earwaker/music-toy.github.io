#!/usr/bin/env node
// tools/apply-anchors-robust.mjs
// A robust, zero-backup anchors applier with better diagnostics and flexible anchors.
// Usage:
//   node tools/apply-anchors-robust.mjs --plan changes/latest.json
//   node tools/apply-anchors-robust.mjs --apply changes/latest.json
//
// Supports operations:
//   insert_after, insert_before, replace_between, replace_exact, delete_between
//
// Anchor fields (per op):
//   - anchor: string (default literal); use anchor_is_regex:true for regex
//   - anchor_flags: string flags for regex, e.g. "im"
//   - anchor_any: array of alternative anchors (each can have its own is_regex/flags via arrays)
//   - nth: 1-based occurrence index (default 1)
//   - normalize_ws: boolean; if true, retry match ignoring whitespace differences
//   - start/end (for replace_between/delete_between) with *_is_regex, *_flags
//
// Notes:
//   - No .bak files are created.
//   - Prints a small snippet around the match in --plan mode for sanity checking.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const args = process.argv.slice(2);
let mode = 'plan'; // or 'apply'
let packPath = null;
let root = process.cwd();

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--apply') { mode = 'apply'; continue; }
  if (a === '--plan')  { mode = 'plan';  continue; }
  if (a === '--root')  { root = path.resolve(args[++i] || '.'); continue; }
  if (!packPath) { packPath = a; continue; }
}

if (!packPath) {
  console.error('Usage: node tools/apply-anchors-robust.mjs [--plan|--apply] [--root <dir>] <pack.json>');
  process.exit(2);
}

function readJson(p) {
  const raw = fs.readFileSync(p, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to parse JSON at', p, '\nFirst 200 chars:\n', raw.slice(0, 200));
    throw e;
  }
}

function normalizeWS(s) {
  return s.replace(/[\s\r\n\t]+/g, ' ').trim();
}

function findLiteral(haystack, needle, nth=1) {
  let idx = -1, from = 0, count = 0;
  while (true) {
    idx = haystack.indexOf(needle, from);
    if (idx === -1) return -1;
    count++;
    if (count === nth) return idx;
    from = idx + needle.length;
  }
}

function findRegex(haystack, pattern, flags='m', nth=1) {
  const re = new RegExp(pattern, flags);
  let m, lastIndex = 0, count = 0;
  while ((m = re.exec(haystack)) !== null) {
    count++;
    if (count === nth) return m.index;
    if (re.lastIndex === m.index) re.lastIndex++; // avoid zero-length loops
    lastIndex = re.lastIndex;
  }
  return -1;
}

function resolveAnchor(content, op, kind='anchor') {
  // Returns index where anchor starts; -1 if not found.
  const nth = op.nth ?? 1;
  const norm = !!op.normalize_ws;

  // Support anchor_any list
  if (Array.isArray(op.anchor_any) && op.anchor_any.length) {
    for (const item of op.anchor_any) {
      const a = typeof item === 'string' ? { value: item } : item;
      const isRegex = !!a.anchor_is_regex || !!a.is_regex;
      const flags = a.anchor_flags || a.flags || 'm';
      const val = a.value || a.anchor || '';
      const hay = norm ? normalizeWS(content) : content;
      const needle = norm ? normalizeWS(val) : val;
      const idx = isRegex ? findRegex(hay, needle, flags, nth) : findLiteral(hay, needle, nth);
      if (idx !== -1) return { index: idx, normalized: norm, isAlt: true, value: val };
    }
    return { index: -1 };
  }

  // Single anchor
  const anchor = op.anchor || '';
  const isRegex = !!op.anchor_is_regex;
  const flags = op.anchor_flags || 'm';
  const hay = norm ? normalizeWS(content) : content;
  const needle = norm ? normalizeWS(anchor) : anchor;
  const idx = isRegex ? findRegex(hay, needle, flags, nth) : findLiteral(hay, needle, nth);
  return { index: idx, normalized: norm, isAlt: false, value: anchor };
}

function snippetAround(text, index, radius=120) {
  if (index < 0) return '';
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + radius);
  return text.slice(start, end);
}

function applyOpAbs(content, op) {
  switch (op.op) {
    case 'insert_after': {
      const { index } = resolveAnchor(content, op);
      if (index === -1) return { ok:false, message:`anchor not found` };
      const anchorText = op.anchor || (Array.isArray(op.anchor_any) ? op.anchor_any.join('|') : '');
      const insertAt = index + (anchorText ? (content.indexOf(anchorText, index) === index ? anchorText.length : 0) : 0);
      // If we couldn't get anchor length (regex, normalized), try to place after end-of-line of the matched region.
      let finalPos = insertAt;
      if (finalPos === index) {
        // push to the end of current line
        const nl = content.indexOf('\n', index);
        finalPos = nl === -1 ? content.length : nl + 1;
      }
      const before = content.slice(0, finalPos);
      const after  = content.slice(finalPos);
      return { ok:true, content: before + (op.text || '') + after };
    }
    case 'insert_before': {
      const { index } = resolveAnchor(content, op);
      if (index === -1) return { ok:false, message:`anchor not found` };
      const before = content.slice(0, index);
      const after  = content.slice(index);
      return { ok:true, content: before + (op.text || '') + after };
    }
    case 'replace_exact': {
      const pattern = op.pattern;
      if (!pattern) return { ok:false, message:`pattern missing` };
      const re = new RegExp(pattern, 'm');
      if (!re.test(content)) return { ok:false, message:`pattern not found` };
      const newContent = content.replace(re, op.text || '');
      return { ok:true, content: newContent };
    }
    case 'replace_between': {
      const start = op.start || '';
      const end = op.end || '';
      const startIdx = resolveAnchor(content, { anchor:start, anchor_is_regex:!!op.start_is_regex, anchor_flags: op.start_flags || 'm' }).index;
      if (startIdx === -1) return { ok:false, message:`start not found` };
      const sub = content.slice(startIdx);
      const endIdxLocal = resolveAnchor(sub, { anchor:end, anchor_is_regex:!!op.end_is_regex, anchor_flags: op.end_flags || 'm' }).index;
      if (endIdxLocal === -1) return { ok:false, message:`end not found` };
      const endIdx = startIdx + endIdxLocal + end.length;
      const before = content.slice(0, startIdx);
      const after  = content.slice(endIdx);
      const replacement = op.text || '';
      return { ok:true, content: before + replacement + after };
    }
    case 'delete_between': {
      const start = op.start || '';
      const end = op.end || '';
      const startIdx = resolveAnchor(content, { anchor:start, anchor_is_regex:!!op.start_is_regex, anchor_flags: op.start_flags || 'm' }).index;
      if (startIdx === -1) return { ok:false, message:`start not found` };
      const sub = content.slice(startIdx);
      const endIdxLocal = resolveAnchor(sub, { anchor:end, anchor_is_regex:!!op.end_is_regex, anchor_flags: op.end_flags || 'm' }).index;
      if (endIdxLocal === -1) return { ok:false, message:`end not found` };
      const endIdx = startIdx + endIdxLocal + end.length;
      const before = content.slice(0, startIdx);
      const after  = content.slice(endIdx);
      return { ok:true, content: before + after };
    }
    default:
      return { ok:false, message:`unknown op: ${op.op}` };
  }
}

function run(pack) {
  const ops = Array.isArray(pack) ? pack : (pack.operations || []);
  let hadError = false;
  for (const op of ops) {
    const filePath = path.resolve(root, op.file);
    if (!fs.existsSync(filePath)) {
      console.error(`❌ ${op.op} -> ${op.file}: file not found`);
      hadError = true; continue;
    }
    const original = fs.readFileSync(filePath, 'utf8');
    const result = applyOpAbs(original, op);
    if (!result.ok) {
      console.error(`❌ ${op.op} -> ${op.file}: ${result.message}`);
      // Diagnostics: show nearby lines similar to anchor
      const anchor = op.anchor || (op.anchor_any ? JSON.stringify(op.anchor_any) : '');
      console.error(`   anchor used:`, anchor);
      // show a short snippet for context
      const guess = original.indexOf(anchor);
      if (guess !== -1) {
        console.error('   near match snippet ->\n' + snippetAround(original, guess));
      }
      hadError = true; continue;
    }
    if (mode === 'plan') {
      console.log(`📝 Plan: ${op.op} -> ${op.file} (will apply)`);
    } else {
      fs.writeFileSync(filePath, result.content, 'utf8');
      console.log(`✅ Applied: ${op.op} -> ${op.file}`);
    }
  }
  if (mode === 'plan') {
    console.log('\nDry run complete.');
    if (hadError) console.log('Heads up: Some ops would fail. Adjust anchors or use regex (anchor_is_regex:true).');
  } else if (hadError) {
    process.exitCode = 1;
  }
}

const pack = readJson(path.resolve(root, packPath));
run(pack);
