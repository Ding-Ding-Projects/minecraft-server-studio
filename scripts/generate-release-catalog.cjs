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
const BASELINE_PATH = path.join(REPOSITORY_ROOT, 'src', 'main', 'release-catalog.json');
const TAG_PATTERN = /^v\d+\.\d+\.\d+-build\.(\d+)\.(\d+)$/;
const SHA_PATTERN = /^[a-f0-9]{40}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RECORDS = 2_048;
const REFRESH_BASELINE_ARGUMENT = '--refresh-baseline';

function localTagRecords() {
  // GitHub source archives deliberately omit .git. Packaging from one must
  // retain the reviewed checked-in baseline rather than failing or inventing
  // tag, date, or commit metadata. Real clones and linked worktrees have a
  // .git directory or file and continue to enrich the baseline from tags.
  if (!fs.existsSync(path.join(REPOSITORY_ROOT, '.git'))) return [];
  const output = gitText([
    '-C', REPOSITORY_ROOT,
    'for-each-ref',
    '--sort=version:refname',
    '--format=%(refname:short)|%(creatordate:short)',
    'refs/tags'
  ]);
  const records = [];
  for (const line of output.replace(/\r\n?/g, '\n').split('\n')) {
    if (!line.trim()) continue;
    const [tag, date] = line.split('|', 2);
    if (!TAG_PATTERN.test(tag || '')) continue;
    if (!DATE_PATTERN.test(date || '')) {
      throw new Error(`Release tag ${tag} has no valid local Git date metadata.`);
    }
    const commit = gitText(['-C', REPOSITORY_ROOT, 'rev-parse', '--verify', `${tag}^{commit}`]).trim().toLowerCase();
    if (!SHA_PATTERN.test(commit)) {
      throw new Error(`Release tag ${tag} does not resolve to a commit.`);
    }
    records.push({ tag, date, commit });
  }
  return records;
}

function gitText(args) {
  return childProcess.execFileSync('git', args, {
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 1024 * 1024
  });
}

function baselineTagRecords() {
  let catalog;
  try {
    catalog = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
  } catch (error) {
    throw new Error(`The checked-in release catalog cannot be read: ${String(error?.message || error).replace(/[\r\n]+/g, ' ').slice(0, 180)}`);
  }
  if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog) || catalog.schemaVersion !== 1 || !Array.isArray(catalog.records)) {
    throw new Error('The checked-in release catalog has an unsupported schema.');
  }
  if (catalog.records.length > MAX_RECORDS) {
    throw new Error(`The checked-in release catalog exceeds its ${MAX_RECORDS}-record capacity.`);
  }
  const tags = new Set();
  return catalog.records.map((record, index) => {
    const tag = typeof record?.tag === 'string' ? record.tag.trim() : '';
    const date = typeof record?.date === 'string' ? record.date.trim() : '';
    const commit = typeof record?.commit === 'string' ? record.commit.trim().toLowerCase() : '';
    if (!TAG_PATTERN.test(tag) || !DATE_PATTERN.test(date) || !SHA_PATTERN.test(commit) || tags.has(tag)) {
      throw new Error(`The checked-in release catalog has invalid metadata at record ${index + 1}.`);
    }
    tags.add(tag);
    return { tag, date, commit };
  });
}

function currentWorkflowRecord() {
  const run = String(process.env.GITHUB_RUN_NUMBER || '').trim();
  const attempt = String(process.env.GITHUB_RUN_ATTEMPT || '').trim();
  const commit = String(process.env.GITHUB_SHA || '').trim().toLowerCase();
  const startedAt = String(process.env.WORKFLOW_STARTED_AT || '').trim();
  const hasWorkflowMetadata = [run, attempt, commit, startedAt].some(Boolean);
  if (!hasWorkflowMetadata) return null;
  if (!/^\d+$/.test(run) || !/^\d+$/.test(attempt) || !SHA_PATTERN.test(commit) || !startedAt) {
    throw new Error('GitHub Actions release metadata is incomplete, so the current release record cannot be generated truthfully.');
  }
  const packageJson = JSON.parse(fs.readFileSync(path.join(REPOSITORY_ROOT, 'package.json'), 'utf8'));
  const version = String(packageJson.version || '').trim();
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('package.json must contain a semantic version before release metadata can be generated.');
  const parsed = Date.parse(startedAt);
  if (!Number.isFinite(parsed)) {
    throw new Error('GitHub Actions did not provide a valid workflow start timestamp for the current release record.');
  }
  const date = new Date(parsed).toISOString().slice(0, 10);
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
  const byTag = new Map(baselineTagRecords().map((record) => [record.tag, record]));
  for (const record of localTagRecords()) byTag.set(record.tag, record);
  const current = currentWorkflowRecord();
  if (current) byTag.set(current.tag, current);
  const records = [...byTag.values()].sort(compareReleaseRecord);
  if (records.length > MAX_RECORDS) {
    throw new Error(`The release catalog has ${records.length} records, exceeding its ${MAX_RECORDS}-record capacity. Raise the documented bound before packaging rather than dropping older releases.`);
  }
  return { schemaVersion: 1, source: 'generated-local-release-metadata', records };
}

function parseArguments() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== REFRESH_BASELINE_ARGUMENT)) {
    throw new Error(`Unsupported argument. Use ${REFRESH_BASELINE_ARGUMENT} to refresh the checked-in baseline.`);
  }
  return { refreshBaseline: args.includes(REFRESH_BASELINE_ARGUMENT) };
}

function writeCatalog(destination, catalog) {
  fs.writeFileSync(destination, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
}

function main() {
  const { refreshBaseline } = parseArguments();
  const catalog = buildCatalog();
  writeCatalog(OUTPUT_PATH, catalog);
  if (refreshBaseline) writeCatalog(BASELINE_PATH, catalog);
  process.stdout.write(`Generated ${catalog.records.length} package-local release metadata record(s)${refreshBaseline ? ' and refreshed the checked-in baseline' : ''}.\n`);
}

main();
