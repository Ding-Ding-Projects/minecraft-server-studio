'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mss-release-catalog-archive-'));

try {
  fs.mkdirSync(path.join(temporaryRoot, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(temporaryRoot, 'src', 'main'), { recursive: true });
  for (const relativePath of [
    'package.json',
    path.join('scripts', 'generate-release-catalog.cjs'),
    path.join('src', 'main', 'release-catalog.json'),
  ]) {
    const destination = path.join(temporaryRoot, relativePath);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(root, relativePath), destination);
  }

  assert.equal(fs.existsSync(path.join(temporaryRoot, '.git')), false);
  childProcess.execFileSync(process.execPath, ['scripts/generate-release-catalog.cjs'], {
    cwd: temporaryRoot,
    encoding: 'utf8',
    windowsHide: true,
  });

  const baseline = JSON.parse(fs.readFileSync(path.join(temporaryRoot, 'src', 'main', 'release-catalog.json'), 'utf8'));
  const generated = JSON.parse(fs.readFileSync(path.join(temporaryRoot, 'src', 'main', 'release-catalog.generated.json'), 'utf8'));
  assert.deepEqual(generated.records, baseline.records, 'An archive build must retain the checked-in release records exactly.');
  assert.equal(generated.schemaVersion, 1);
  assert.equal(generated.source, 'generated-local-release-metadata');
  process.stdout.write(`PASS: archive release catalog retained ${generated.records.length} checked-in record(s).\n`);
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
