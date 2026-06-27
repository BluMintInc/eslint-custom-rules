/* eslint-disable @typescript-eslint/no-var-requires */
/**
 * Notify agora that a new plugin version published, so its `eslint-rules-sync`
 * workflow bumps the pin and re-enables now-fixed OFF rules immediately —
 * instead of waiting on dependabot's daily scan.
 *
 * Invoked as a semantic-release `@semantic-release/exec` successCmd (after npm
 * publish + GitHub release succeed):
 *   node scripts/dispatch-agora-release.js --version=${nextRelease.version}
 *
 * BEST-EFFORT BY DESIGN: a missing token or a failed dispatch logs a warning and
 * exits 0 — it never fails an otherwise-successful release. agora's dependabot is
 * the passive backstop. Cross-repo dispatch needs a token with `contents:write`
 * (or repository-dispatch) on agora, provisioned as the `AGORA_DISPATCH_TOKEN`
 * secret here (the default repo-scoped GITHUB_TOKEN cannot dispatch to agora).
 */
const { execFileSync } = require('node:child_process');

const AGORA_REPO = 'BluMintInc/agora';
const EVENT_TYPE = 'eslint-rules-released';

function parseArgs(argv) {
  const args = {};
  for (const token of argv) {
    const match = /^--([\w-]+)(?:=(.*))?$/.exec(token);
    if (match) {
      args[match[1]] = match[2] ?? '';
    }
  }
  return args;
}

function buildManifestUrl(version) {
  return `https://unpkg.com/@blumintinc/eslint-plugin-blumint@${version}/release-manifest.json`;
}

/**
 * Send the repository_dispatch. Returns true if attempted, false if skipped for
 * a missing token. Throws only if the underlying gh call throws (caller swallows).
 */
function dispatch({ version, token, exec = execFileSync }) {
  if (!token) {
    console.warn(
      'dispatch-agora-release: AGORA_DISPATCH_TOKEN not set; skipping cross-repo dispatch (agora dependabot is the backstop).',
    );
    return false;
  }
  const body = JSON.stringify({
    event_type: EVENT_TYPE,
    client_payload: { version, manifestUrl: buildManifestUrl(version) },
  });
  exec(
    'gh',
    [
      'api',
      '--method',
      'POST',
      `repos/${AGORA_REPO}/dispatches`,
      '--input',
      '-',
    ],
    {
      input: body,
      env: { ...process.env, GH_TOKEN: token, GITHUB_TOKEN: token },
      stdio: ['pipe', 'inherit', 'inherit'],
    },
  );
  console.log(
    `dispatch-agora-release: sent ${EVENT_TYPE} to ${AGORA_REPO} for v${version}`,
  );
  return true;
}

function main() {
  const { version } = parseArgs(process.argv.slice(2));
  if (!version) {
    console.warn(
      'dispatch-agora-release: --version missing; skipping dispatch.',
    );
    return;
  }
  try {
    dispatch({ version, token: process.env.AGORA_DISPATCH_TOKEN });
  } catch (error) {
    console.warn(
      `dispatch-agora-release: dispatch failed (non-fatal): ${
        error && error.message ? error.message : error
      }`,
    );
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  AGORA_REPO,
  EVENT_TYPE,
  parseArgs,
  buildManifestUrl,
  dispatch,
};
