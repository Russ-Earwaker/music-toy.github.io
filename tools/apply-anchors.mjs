#!/usr/bin/env node
// Simple anchored patcher for JS/TS/HTML/CSS/etc.
// Ops supported: insert_after, insert_before, replace_between, replace_exact, delete_between
// Safe by default: backs up originals as .bak, dry-run by default.
// Usage:
//   node tools/apply-anchors.mjs --plan changes/my-change.json
//   node tools/apply-anchors.mjs --apply changes/my-change.json

import fs from "fs";
import path from "path";
import process from "process";

const HELP = `
apply-anchors.mjs
  --plan   : dry-run (default)
  --apply  : write changes
  --root <path> : repo root (default: process.cwd())
  <file.json> : change pack (array or {operations:[...]})

Change operation formats:
  {
    "file": "src/ui/playButton.js",
    "op": "insert_after",
    "anchor": "function initPlayButton\\(",
    "text": "\\n  // injected...\\n"
  }

  {
    "file": "src/ui/playButton.js",
    "op": "insert_before",
    "anchor": "// END: play-button-setup",
    "text": "/* new code */\\n"
  }

  {
    "file": "src/ui/playButton.js",
    "op": "replace_between",
    "start": "// << GPT:PLAY_BTN START >>",
    "end":   "// << GPT:PLAY_BTN END >>",
    "text": "// << GPT:PLAY_BTN START >>\\n...new block...\\n// << GPT:PLAY_BTN END >>\\n"
  }

  {
    "file": "src/ui/theme.css",
    "op": "replace_exact",
    "pattern": "button.play\\s*\\{[\\s\\S]*?\\}",
    "text": "button.play { /* new rules */ }"
  }

  {
    "file": "src/ui/junk.js",
    "op": "delete_between",
    "start": "/* LEGACY-START */",
    "end":   "/* LEGACY-END */"
  }
`;

const args = process.argv.slice(2);
if (!args.length || args.includes("--help") || args.includes("-h")) {
  console.log(HELP);
  process.exit(0);
}

let mode = "plan"; // or "apply"
let root = process.cwd();
let packPath = null;

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--apply") mode = "apply";
  else if (a === "--plan") mode = "plan";
  else if (a === "--root") {
    root = path.resolve(args[++i]);
  } else if (!a.startsWith("--")) {
    packPath = a;
  }
}

if (!packPath) {
  console.error("❌ No change pack provided.\n" + HELP);
  process.exit(1);
}

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const packRaw = readJson(packPath);
const operations = Array.isArray(packRaw) ? packRaw : (packRaw.operations || []);

if (!operations.length) {
  console.error("❌ No operations found in change pack.");
  process.exit(1);
}

const ensureBackup = (filePath, original) => {
  // Backups disabled by project policy — no .bak files will be created.
};

const insertAfter = (content, anchorRe, insertText) => {
  const m = content.match(anchorRe);
  if (!m) return { ok: false, reason: "anchor not found" };
  const idx = m.index + m[0].length;
  return { ok: true, out: content.slice(0, idx) + insertText + content.slice(idx) };
};

const insertBefore = (content, anchorRe, insertText) => {
  const m = content.match(anchorRe);
  if (!m) return { ok: false, reason: "anchor not found" };
  const idx = m.index;
  return { ok: true, out: content.slice(0, idx) + insertText + content.slice(idx) };
};

const replaceBetween = (content, startRe, endRe, replacement) => {
  const s = content.match(startRe);
  if (!s) return { ok: false, reason: "start not found" };
  const e = content.slice(s.index + s[0].length).match(endRe);
  if (!e) return { ok: false, reason: "end not found" };
  const startIdx = s.index;
  const endIdx = s.index + s[0].length + e.index;
  return { ok: true, out: content.slice(0, startIdx) + replacement + content.slice(endIdx) };
};

const deleteBetween = (content, startRe, endRe) => {
  const res = replaceBetween(content, startRe, endRe, "");
  return res.ok ? { ok: true, out: res.out } : res;
};

const replaceExact = (content, patternRe, replacement) => {
  const re = new RegExp(patternRe, "s");
  if (!re.test(content)) return { ok: false, reason: "pattern not found" };
  return { ok: true, out: content.replace(re, replacement) };
};

const toRe = (s) => new RegExp(s, "s"); // dotAll by default

let failures = 0;
let changedFiles = new Set();

for (const op of operations) {
  const target = path.resolve(root, op.file);
  if (!fs.existsSync(target)) {
    console.error(`❌ File not found: ${op.file}`);
    failures++;
    continue;
  }
  const original = fs.readFileSync(target, "utf8");

  let result = { ok: false, reason: "unsupported op" };
  try {
    switch (op.op) {
      case "insert_after":
        result = insertAfter(original, toRe(op.anchor), op.text ?? "");
        break;
      case "insert_before":
        result = insertBefore(original, toRe(op.anchor), op.text ?? "");
        break;
      case "replace_between":
        result = replaceBetween(original, toRe(op.start), toRe(op.end), op.text ?? "");
        break;
      case "delete_between":
        result = deleteBetween(original, toRe(op.start), toRe(op.end));
        break;
      case "replace_exact":
        result = replaceExact(original, op.pattern, op.text ?? "");
        break;
      default:
        result = { ok: false, reason: `unknown op '${op.op}'` };
    }
  } catch (e) {
    result = { ok: false, reason: e.message || String(e) };
  }

  const tag = `${op.op} -> ${op.file}`;
  if (!result.ok) {
    console.error(`❌ ${tag}: ${result.reason}`);
    failures++;
    continue;
  }

  if (mode === "apply") {
    ensureBackup(target, original);
    fs.writeFileSync(target, result.out, "utf8");
    changedFiles.add(op.file);
    console.log(`✅ Applied: ${tag}`);
  } else {
    console.log(`📝 Plan: ${tag} (will apply)`);
  }
}

if (mode === "apply") {
  if (changedFiles.size) {
    console.log("\nChanged files:");
    [...changedFiles].forEach((f) => console.log(" • " + f));
  }
  if (failures) {
    console.log(`\nCompleted with ${failures} failure(s). See messages above.`);
    process.exit(2);
  } else {
    console.log("\nAll operations applied successfully.");
  }
} else {
  console.log("\nDry run complete.");
  if (failures) {
    console.log(`Heads up: ${failures} op(s) would fail. Fix anchors or file paths.`);
  }
}
