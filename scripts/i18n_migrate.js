const fs = require('fs');
const path = require('path');

const base = '/home/a3emond/projects/audiobook-platform';
const root = path.join(base, 'frontend/src/app');
const enPath = path.join(base, 'frontend/src/assets/i18n/en.json');
const frPath = path.join(base, 'frontend/src/assets/i18n/fr.json');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.(ts|html)$/.test(entry.name)) out.push(p);
  }
  return out;
}

const files = walk(root);
const extracted = new Map();

function record(key, fallback) {
  if (!key) return;
  if (!extracted.has(key) && fallback) extracted.set(key, fallback);
  else if (!extracted.has(key)) extracted.set(key, key);
}

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');

  const tCallRe = /i18n\.t\(\s*'([^']+)'\s*,\s*'([^']*)'\s*(,\s*[\s\S]*?)?\)/g;
  content = content.replace(tCallRe, (_m, key, fallback, extra = '') => {
    record(key, fallback);
    return `i18n.t('${key}'${extra || ''})`;
  });

  const tPipeWithParamsRe = /\|\s*t\s*:\s*'([^']*)'\s*:\s*/g;
  content = content.replace(tPipeWithParamsRe, () => '| t:');

  const keyPipeRe = /'([^']+)'\s*\|\s*t\s*:\s*'([^']*)'/g;
  content = content.replace(keyPipeRe, (_m, key, fallback) => {
    record(key, fallback);
    return `'${key}' | t`;
  });

  fs.writeFileSync(file, content, 'utf8');
}

function loadJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return {};
  }
}

const en = loadJson(enPath);
const fr = loadJson(frPath);

for (const [key, fallback] of extracted.entries()) {
  if (!en[key] || en[key] === key) en[key] = fallback || key;
  if (!fr[key]) fr[key] = en[key];
}

const sortedEn = Object.fromEntries(Object.entries(en).sort(([a], [b]) => a.localeCompare(b)));
const sortedFr = Object.fromEntries(Object.entries(fr).sort(([a], [b]) => a.localeCompare(b)));

fs.writeFileSync(enPath, JSON.stringify(sortedEn, null, 2) + '\n');
fs.writeFileSync(frPath, JSON.stringify(sortedFr, null, 2) + '\n');

console.log(`Processed ${files.length} files, extracted ${extracted.size} i18n keys.`);
