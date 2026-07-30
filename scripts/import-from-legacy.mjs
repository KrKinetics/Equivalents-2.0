/**
 * Deprecated alias — redirects to bootstrap with a clear warning.
 */
console.error(
  '[DEPRECATED] data:import / import-from-legacy.mjs\n' +
    'Use: npm run data:bootstrap\n' +
    'Bootstrap is ONE-TIME. Corrections: npm run data:apply -- file.json\n' +
    'Audit only: npm run data:audit'
);
process.exit(1);
