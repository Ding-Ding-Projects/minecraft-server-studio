#!/usr/bin/env node
'use strict';

/**
 * Count the repository's tracked text files for release notes.
 *
 * Usage:
 *   node scripts/line-count.cjs
 *   node scripts/line-count.cjs --format json
 *
 * The counter intentionally uses `git ls-files` so dependency directories,
 * build output, and other untracked local material cannot inflate a release
 * figure. It treats a trailing newline as a terminator, not an extra line.
 */

const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const format = process.argv.includes('--format')
  ? process.argv[process.argv.indexOf('--format') + 1]
  : 'markdown';

if (!['markdown', 'json'].includes(format)) {
  console.error('Usage: node scripts/line-count.cjs [--format markdown|json]');
  process.exitCode = 2;
  return;
}

const categoryOrder = [
  'Source',
  'Tests',
  'Styles and markup',
  'Documentation',
  'Workflows and configuration',
  'Other hand-written text',
  'Generated text',
];

const categories = new Map(categoryOrder.map((name) => [name, emptyTotals()]));
const exclusions = new Map();
const countedFiles = [];

function emptyTotals() {
  return { files: 0, lines: 0, nonblank: 0 };
}

function addTotals(target, counts) {
  target.files += 1;
  target.lines += counts.lines;
  target.nonblank += counts.nonblank;
}

function addExclusion(reason) {
  exclusions.set(reason, (exclusions.get(reason) || 0) + 1);
}

function trackedFiles() {
  const output = childProcess.execFileSync('git', ['ls-files', '-z'], {
    encoding: 'buffer',
    stdio: ['ignore', 'pipe', 'inherit'],
  });

  return output
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
}

function classify(file) {
  const normalized = file.replace(/\\/g, '/');
  const base = path.posix.basename(normalized);
  const extension = path.posix.extname(normalized).toLowerCase();

  if (
    normalized === 'package-lock.json' ||
    normalized === 'npm-shrinkwrap.json' ||
    normalized === 'yarn.lock' ||
    normalized === 'pnpm-lock.yaml' ||
    normalized.endsWith('.lock')
  ) {
    return { excluded: 'Lockfiles are generated dependency resolution data.' };
  }

  if (
    normalized.startsWith('node_modules/') ||
    normalized.startsWith('dist/') ||
    normalized.startsWith('out/') ||
    normalized.startsWith('release/') ||
    normalized.startsWith('coverage/') ||
    normalized.startsWith('vendor/') ||
    normalized.startsWith('third_party/')
  ) {
    return { excluded: 'Dependencies, vendor trees, and build or coverage output are not project source.' };
  }

  if (
    /(^|\/)(generated|build|dist)(\/|$)/i.test(normalized) ||
    /\.(generated|gen)\.[cm]?[jt]sx?$/i.test(base) ||
    /\.generated\.(css|html|md|json|ya?ml)$/i.test(base)
  ) {
    return { category: 'Generated text' };
  }

  if (/(^|\/)(test|tests|__tests__|spec)(\/|$)/i.test(normalized) || /\.(test|spec)\.[cm]?[jt]sx?$/i.test(base)) {
    return { category: 'Tests' };
  }

  if (extension === '.css' || extension === '.scss' || extension === '.sass' || extension === '.less' || extension === '.html' || extension === '.htm' || extension === '.svg') {
    return { category: 'Styles and markup' };
  }

  if (
    normalized.startsWith('docs/') ||
    ['README.md', 'ROADMAP.md', 'HANDOFF.md', 'CONTRIBUTING.md', 'SECURITY.md', 'CODE_OF_CONDUCT.md', 'LICENSE.md'].includes(base) ||
    ['.md', '.mdx', '.rst', '.txt'].includes(extension)
  ) {
    return { category: 'Documentation' };
  }

  if (
    normalized.startsWith('.github/') ||
    ['package.json', 'tsconfig.json', 'jsconfig.json', 'electron-builder.json', 'AGENTS.md'].includes(base) ||
    ['.yml', '.yaml', '.toml', '.ini'].includes(extension)
  ) {
    return { category: 'Workflows and configuration' };
  }

  if (['.js', '.cjs', '.mjs', '.jsx', '.ts', '.cts', '.mts', '.tsx', '.py', '.java', '.kt', '.go', '.rs', '.c', '.h', '.cpp', '.hpp', '.cs', '.sh', '.ps1', '.bat', '.cmd'].includes(extension)) {
    return { category: 'Source' };
  }

  return { category: 'Other hand-written text' };
}

function countText(buffer) {
  if (buffer.includes(0)) {
    return null;
  }

  const text = buffer.toString('utf8');
  if (text.length === 0) {
    return { lines: 0, nonblank: 0 };
  }

  const lines = text.split(/\r\n|\n|\r/);
  if (/\r\n$|\n$|\r$/.test(text)) {
    lines.pop();
  }

  return {
    lines: lines.length,
    nonblank: lines.reduce((count, line) => count + (line.trim().length > 0 ? 1 : 0), 0),
  };
}

for (const file of trackedFiles()) {
  const decision = classify(file);
  if (decision.excluded) {
    addExclusion(decision.excluded);
    continue;
  }

  const absolutePath = path.resolve(process.cwd(), file);
  const counts = countText(fs.readFileSync(absolutePath));
  if (!counts) {
    addExclusion('Binary files are not line-oriented source.');
    continue;
  }

  addTotals(categories.get(decision.category), counts);
  countedFiles.push({ file, counts });
}

const categoryRows = categoryOrder.map((category) => ({ category, ...categories.get(category) }));
const projectCategories = new Set(['Source', 'Tests', 'Styles and markup']);
const projectTotal = categoryRows
  .filter((row) => projectCategories.has(row.category))
  .reduce((total, row) => addAggregate(total, row), emptyTotals());
const grandTotal = categoryRows.reduce((total, row) => addAggregate(total, row), emptyTotals());
const attribution = countAttribution(countedFiles);

if (attribution.automation + attribution.human !== grandTotal.lines) {
  throw new Error(
    `Line-attribution mismatch: ${attribution.automation + attribution.human} attributed lines for ${grandTotal.lines} counted lines.`,
  );
}

function addAggregate(total, row) {
  total.files += row.files;
  total.lines += row.lines;
  total.nonblank += row.nonblank;
  return total;
}

function countAttribution(files) {
  const commitKinds = new Map();
  const totals = { automation: 0, human: 0 };

  for (const { file, counts } of files) {
    if (counts.lines === 0) {
      continue;
    }

    const result = childProcess.spawnSync('git', ['blame', '--line-porcelain', '--', file], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });

    if (result.status !== 0) {
      throw new Error(`git blame failed for ${file}: ${String(result.stderr || '').trim()}`);
    }

    let attributedLines = 0;
    for (const line of String(result.stdout).split(/\r\n|\n|\r/)) {
      const match = line.match(/^\^?([0-9a-f]{40})\s+\d+\s+\d+(?:\s+\d+)?$/i);
      if (!match) {
        continue;
      }

      const commit = match[1].toLowerCase();
      if (/^0+$/.test(commit)) {
        throw new Error(`Cannot publish a release line count with uncommitted lines in ${file}.`);
      }

      let kind = commitKinds.get(commit);
      if (!kind) {
        kind = classifyCommit(commit);
        commitKinds.set(commit, kind);
      }
      totals[kind] += 1;
      attributedLines += 1;
    }

    if (attributedLines !== counts.lines) {
      throw new Error(`git blame returned ${attributedLines} lines for ${file}; expected ${counts.lines}.`);
    }
  }

  return totals;
}

function classifyCommit(commit) {
  const metadata = childProcess.execFileSync(
    'git',
    ['show', '-s', '--format=%an%x00%ae%x00%B', commit],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 8 * 1024 * 1024 },
  );
  const [authorName = '', authorEmail = '', ...bodyParts] = metadata.split('\0');
  const body = bodyParts.join('\0');
  const authorIdentity = `${authorName}\n${authorEmail}`;
  const automationAuthor = /\b(claude|codex|chatgpt|openai|anthropic|github-actions|automation|bot)\b/i.test(authorIdentity);
  const automationTrailer = /^Co-Authored-By:\s*.*\b(claude|codex|chatgpt|openai|anthropic)\b.*$/im.test(body);
  return automationAuthor || automationTrailer ? 'automation' : 'human';
}

const report = {
  command: 'node scripts/line-count.cjs --format markdown',
  convention: 'Tracked UTF-8 text files; trailing newline is not counted as an extra line.',
  categories: categoryRows,
  projectTotal,
  grandTotal,
  attribution,
  exclusions: [...exclusions.entries()].map(([reason, files]) => ({ reason, files })),
};

if (format === 'json') {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return;
}

const table = [
  '| Category | Files | Lines | Non-blank lines |',
  '| --- | ---: | ---: | ---: |',
  ...categoryRows.map((row) => `| ${row.category} | ${row.files} | ${row.lines} | ${row.nonblank} |`),
  `| **Project implementation total** | **${projectTotal.files}** | **${projectTotal.lines}** | **${projectTotal.nonblank}** |`,
  `| **Grand total of counted text** | **${grandTotal.files}** | **${grandTotal.lines}** | **${grandTotal.nonblank}** |`,
];

const exclusionRows = report.exclusions.length
  ? report.exclusions.map(({ reason, files }) => `- ${files} file(s): ${reason}`)
  : ['- No tracked files matched the exclusion rules.'];

process.stdout.write([
  '## Line count',
  '',
  ...table,
  '',
  `Convention: ${report.convention}`,
  '',
  'Excluded from counts:',
  ...exclusionRows,
  '',
  '### Surviving-line attribution',
  '',
  '| Attribution rule | Lines |',
  '| --- | ---: |',
  `| Automation-authored (commit author or Co-Authored-By trailer names a known automation identity) | ${attribution.automation} |`,
  `| Human-authored | ${attribution.human} |`,
  `| **Attributed total** | **${attribution.automation + attribution.human}** |`,
  '',
  'The project implementation total contains source, tests, and styles/markup. The grand total additionally includes documentation, workflow/configuration, other hand-written text, and generated text shown separately above.',
  '',
].join('\n'));
