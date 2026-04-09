/**
 * Agent-Office - Auto Installation Script
 *
 * Automatically registers HTTP hooks in the Claude CLI config.
 * Runs automatically during npm install.
 *
 * Delegates actual registration logic to a JS-only helper because postinstall
 * runs before the TypeScript sources are built into dist/.
 */

const { registerClaudeHooks } = require('./main/hookRegistration.install');

/**
 * Main entry point
 */
function main() {
  console.log('=================================');
  console.log('Agent-Office - Install Script');
  console.log('=================================\n');

  const debugLog = (msg) => console.log(msg);
  const success = registerClaudeHooks(debugLog);

  if (success) {
    console.log('\n=================================');
    console.log('Installation complete!');
    console.log('=================================\n');
    console.log('Run the app with:');
    console.log('  npm start\n');
  } else {
    console.log('\n⚠️  Hook registration failed.');
    console.log('Please manually edit ~/.claude/settings.json.');
    process.exit(1);
  }
}

// Run
main();
