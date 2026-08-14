'use strict';

const path = require('node:path');
const { verifyOfflineChangelogBundle } = require('../src/main/changelog-library.cjs');

verifyOfflineChangelogBundle({ appPath: path.resolve(__dirname, '..') })
  .then((snapshot) => {
    process.stdout.write(`Offline changelog bundle ready with ${snapshot.records.length} local record(s).\n`);
  })
  .catch((error) => {
    process.stderr.write(`${error?.message || String(error)}\n`);
    process.exitCode = 1;
  });
