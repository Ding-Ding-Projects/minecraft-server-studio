'use strict';

/**
 * Generates package-local release metadata from local Git tags.
 *
 * This script makes no network request. The generated catalog is ignored by
 * Git, is included only by the package file set, and gives the installed app a
 * fixed release-record snapshot. When a GitHub Actions package run provides
 * its run metadata, the script adds that run's deterministic release tag so a
 * newly published build can list itself offline.
 */

const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const REPOSITORY_ROOT = path.resolve(__dirname, '..');
const OUTPUT_PATH = path.join(REPOSITORY_ROOT, 'src', 'main', 'release-catalog.generated.json');
const TAG_PATTERN = /^v\d+\.\d+\.\d+-build\.(\d+)\.(\d+)$/;
const SHA_PATTERN = /^[a-f0-9]{40}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RECORDS = 128;

function localTagRecords() {
  const output = childProcess.execFileSync('git', [
    '-C', REPOSITORY_ROOT,
    'for-each-ref',
    '--sort=version:refname',
    '--format=%(refname:short)|%(objectname)|%(creatordate:short)',
    'refs/tags'
  ], { encoding: 'utf8', windowsHide: true, maxBuffer: 256 * 1024 });
  const records = [];
  for (const line of output.replace(/\r\n?/g, '\n').split('\n')) {
    if (!line.trim()) continue;
    const [tag, commit, date] = line.split('|', 3);
    if (!TAG_PATTERN.test(tag || '') || !SHA_PATTERN.test(commit || '') || !DATE_PATTERN.test(date || '')) continue;
    records.push({ tag, date, commit });
  }
  return records;
}

function currentWorkflowRecord() {
  const run = String(process.env.GITHUB_RUN_NUMBER || '').trim();
  const attempt = String(process.env.GITHUB_RUN_ATTEMPT || '').trim();
  const commit = String(process.env.GITHUB_SHA || '').trim().toLowerCase();
  if (!/^\d+$/.test(run) || !/^\d+$/.test(attempt) || !SHA_PATTERN.test(commit)) return null;
  const packageJson = JSON.parse(fs.readFileSync(path.join(REPOSITORY_ROOT, 'package.json'), 'utf8'));
  const version = String(packageJson.version || '').trim();
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('package.json must contain a semantic version before release metadata can be generated.');
  const startedAt = String(process.env.WORKFLOW_STARTED_AT || '').trim();
  const parsed = Date.parse(startedAt);
  const date = Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
  return { tag: `v${version}-build.${run}.${attempt}`, date, commit };
}

function compareReleaseRecord(left, right) {
  const leftMatch = String(left.tag).match(TAG_PATTERN);
  const rightMatch = String(right.tag).match(TAG_PATTERN);
  const leftRun = Number(leftMatch?.[1] || 0);
  const rightRun = Number(rightMatch?.[1] || 0);
  const leftAttempt = Number(leftMatch?.[2] || 0);
  const rightAttempt = Number(rightMatch?.[2] || 0);
  return leftRun - rightRun || leftAttempt - rightAttempt || left.tag.localeCompare(right.tag);
}

function buildCatalog() {
  const byTag = new Map(localTagRecords().map((record) => [record.tag, record]));
  const current = currentWorkflowRecord();
  if (current) byTag.set(current.tag, current);
  const records = [...byTag.values()].sort(compareReleaseRecord).slice(-MAX_RECORDS);
  return { schemaVersion: 1, source: 'generated-local-git-tag-metadata', records };
}

function main() {
  const catalog = buildCatalog();
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
  process.stdout.write(`Generated ${catalog.records.length} package-local release metadata record(s).\n`);
}

main();
