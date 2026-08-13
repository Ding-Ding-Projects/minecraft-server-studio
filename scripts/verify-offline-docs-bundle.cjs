'use strict';

const path = require('node:path');
const { verifyOfflineDocumentationBundle } = require('../src/main/offline-docs.cjs');

async function main() {
  const result = await verifyOfflineDocumentationBundle({ appPath: path.resolve(__dirname, '..') });
  process.stdout.write(`Bundled offline documentation inventory: ${result.documents.length} article(s).\n`);
}

main().catch((error) => {
  process.stderr.write(`Offline documentation bundle check failed: ${String(error?.message || error)}\n`);
  process.exitCode = 1;
});
