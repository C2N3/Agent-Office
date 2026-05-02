#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const npmCli = process.env.npm_execpath;
const electronBuilderCli = path.join(repoRoot, 'node_modules', 'electron-builder', 'cli.js');

function fail(message) {
  console.error(`[dist:mac:signed] ${message}`);
  process.exit(1);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    env: options.env || process.env,
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function hasAppleApiKeyEnv(env) {
  return !!(env.APPLE_API_KEY || env.APPLE_API_KEY_BASE64);
}

function hasAppleIdEnv(env) {
  return !!(env.APPLE_ID && env.APPLE_APP_SPECIFIC_PASSWORD && env.APPLE_TEAM_ID);
}

function validateMacSigningEnv(env) {
  if (process.platform !== 'darwin') {
    fail('Run this script on macOS.');
  }
  if (!npmCli) {
    fail('npm_execpath is not available. Run this through npm: `npm run dist:mac:signed`.');
  }
  if (!fs.existsSync(electronBuilderCli)) {
    fail('electron-builder is not installed. Run `npm install` first.');
  }

  if (!hasAppleApiKeyEnv(env) && !hasAppleIdEnv(env)) {
    fail(
      'Missing notarization credentials. Set either APPLE_API_KEY/APPLE_API_KEY_ID/APPLE_API_ISSUER ' +
        'or APPLE_API_KEY_BASE64/APPLE_API_KEY_ID/APPLE_API_ISSUER, or APPLE_ID/APPLE_APP_SPECIFIC_PASSWORD/APPLE_TEAM_ID.'
    );
  }

  if (hasAppleApiKeyEnv(env) && !(env.APPLE_API_KEY_ID && env.APPLE_API_ISSUER)) {
    fail('APPLE_API_KEY authentication also requires APPLE_API_KEY_ID and APPLE_API_ISSUER.');
  }
  if (env.APPLE_API_KEY && !fs.existsSync(env.APPLE_API_KEY)) {
    fail(`APPLE_API_KEY file was not found: ${env.APPLE_API_KEY}`);
  }

  if (!env.CSC_LINK && !env.CSC_NAME) {
    console.warn(
      '[dist:mac:signed] CSC_LINK or CSC_NAME is not set. electron-builder will try to discover a signing identity from your keychain.'
    );
  }
}

function withAppleApiKeyFile(baseEnv) {
  if (!baseEnv.APPLE_API_KEY_BASE64 || baseEnv.APPLE_API_KEY) {
    return { env: baseEnv, cleanupDir: null };
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-office-notary-'));
  const apiKeyPath = path.join(tempDir, `AuthKey_${baseEnv.APPLE_API_KEY_ID}.p8`);
  fs.writeFileSync(apiKeyPath, Buffer.from(baseEnv.APPLE_API_KEY_BASE64, 'base64'));

  return {
    env: {
      ...baseEnv,
      APPLE_API_KEY: apiKeyPath,
    },
    cleanupDir: tempDir,
  };
}

function main() {
  validateMacSigningEnv(process.env);

  const { env, cleanupDir } = withAppleApiKeyFile({ ...process.env });
  const shouldRunRebuild = env.SKIP_REBUILD !== '1';
  const shouldRunTests = env.SKIP_TESTS !== '1';

  try {
    if (shouldRunRebuild) {
      run(process.execPath, [npmCli, 'run', 'rebuild']);
    }
    run(process.execPath, [npmCli, 'run', 'build:dist']);
    run(process.execPath, [npmCli, 'run', 'typecheck']);

    if (shouldRunTests) {
      run(process.execPath, [npmCli, 'test', '--', '--runInBand']);
    }

    run(process.execPath, [electronBuilderCli, '--mac', '--publish', 'never', ...process.argv.slice(2)], { env });
  } finally {
    if (cleanupDir) {
      fs.rmSync(cleanupDir, { recursive: true, force: true });
    }
  }
}

main();
