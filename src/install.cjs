/**
 * Agent-Office - Post-install Migration
 *
 * Agent-Office no longer registers a global Claude hook. This script
 * removes any Agent-Office hook entries previously written to
 * ~/.claude/settings.json so upgrades leave the user's config clean.
 *
 * Runs automatically during npm install. Delegates to a JS-only helper
 * because postinstall runs before the TypeScript sources are built
 * into dist/.
 */

const { unregisterClaudeHooks } = require('./main/hookRegistration.install.cjs');

function main() {
  console.log('=================================');
  console.log('Agent-Office - Install Script');
  console.log('=================================\n');

  const debugLog = (msg) => console.log(msg);
  const removed = unregisterClaudeHooks(debugLog);

  if (removed) {
    console.log('\nMigration: removed Agent-Office hook entries from ~/.claude/settings.json');
    console.log('Agent characters now react only to tasks launched from Agent-Office.\n');
  } else {
    console.log('\nNo Agent-Office hook entries found in ~/.claude/settings.json — nothing to migrate.\n');
  }

  console.log('=================================');
  console.log('Installation complete!');
  console.log('=================================\n');
  console.log('Run the app with:');
  console.log('  npm start\n');
}

main();
