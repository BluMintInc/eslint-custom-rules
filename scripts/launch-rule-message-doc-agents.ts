import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { request } from 'node:https';
import * as ts from 'typescript';

type LaunchResult =
  | { rule: string; agentUrl: string; branch: string }
  | { rule: string; branch: string; error: string };

const CURSOR_API_KEY = process.env.CURSOR_API_KEY;
const GITHUB_REPOSITORY =
  process.env.GITHUB_REPOSITORY || 'BluMintInc/eslint-custom-rules';
const SOURCE_REF = process.env.SOURCE_REF || 'develop';
const MODEL = process.env.CURSOR_MODEL || 'gpt-5.1-codex-max-high';
const BATCH_SIZE = Number(process.env.BATCH_SIZE || 20);
const BATCH_DELAY_MS = Number(process.env.BATCH_DELAY_MS || 15 * 60 * 1000); // 5 minutes
const DRY_RUN = process.argv.includes('--dry-run');

if (!CURSOR_API_KEY) {
  console.error('CURSOR_API_KEY environment variable is required.');
  process.exit(1);
}

function readIndexFile(): string {
  const path = 'src/index.ts';
  try {
    return readFileSync(path, 'utf-8');
  } catch (error) {
    console.error(`Failed to read ${path}`);
    throw error;
  }
}

function extractRuleNames(): string[] {
  const content = readIndexFile();
  const sourceFile = ts.createSourceFile(
    'index.ts',
    content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  const names = new Set<string>();

  function visit(node: ts.Node) {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(node.left) &&
      node.left.expression.getText(sourceFile) === 'module' &&
      node.left.name.getText(sourceFile) === 'exports' &&
      ts.isObjectLiteralExpression(node.right)
    ) {
      const rulesProp = node.right.properties.find((prop) => {
        return (
          ts.isPropertyAssignment(prop) &&
          prop.name.getText(sourceFile) === 'rules' &&
          ts.isObjectLiteralExpression(prop.initializer)
        );
      }) as ts.PropertyAssignment | undefined;

      if (rulesProp && ts.isObjectLiteralExpression(rulesProp.initializer)) {
        for (const prop of rulesProp.initializer.properties) {
          if (!ts.isPropertyAssignment(prop)) continue;
          const rawName = prop.name.getText(sourceFile);
          const cleaned = rawName.replace(/^['"]|['"]$/g, '');
          if (cleaned) names.add(cleaned);
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  ts.forEachChild(sourceFile, visit);
  return Array.from(names).sort();
}

const lintMessageSummary = [
  'Structure messages as: [What is wrong] -> [Why it matters] -> [How to fix].',
  'Use {{handlebars}} variables to point at the specific code that triggered the message.',
  'Explain the underlying pitfall or bug the rule prevents; do not rely on prior context.',
  'Offer concrete, actionable fixes when the next step is not obvious.',
  'Avoid tautological, purely imperative, or AST-jargon-only messages.',
].join('\n- ');

function buildPrompt(ruleName: string): string {
  const rulePath = `src/rules/${ruleName}.ts`;
  const docPath = `docs/rules/${ruleName}.md`;
  const testPath = `src/tests/${ruleName}.test.ts`;

  return [
    `You are improving the ESLint rule "${ruleName}". Focus strictly on lint messaging and documentation quality while keeping the rule logic intact.`,
    '',
    'Deliverables:',
    `- Refine all message strings in ${rulePath} to follow the lint-message.mdc guide.`,
    `- Update tests such as ${testPath} to expect the refined messages (no behavior changes).`,
    `- Refresh ${docPath} so it explains the why/how of the rule and shows updated examples.`,
    '',
    'Lint message requirements (from .cursor/rules/lint-message.mdc):',
    `- ${lintMessageSummary}`,
    '',
    'Constraints:',
    '- Keep statements a-temporal and clear; prefer explicit reasoning over brevity.',
    '- Reuse existing {{variables}} and add more when it improves specificity.',
    '',
    'Quality steps to perform:',
    '- Run npm test.',
    '- Run npm run build.',
    '- Ensure documentation examples align with the refined messages.',
    '',
    `When you finish, open a PR targeting ${SOURCE_REF}.`,
  ].join('\n');
}

function slugifyBranch(ruleName: string): string {
  const base = ruleName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `improve-msg-docs-${base}`;
}

function callCursorAPI(payload: unknown): Promise<any> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = request(
      {
        method: 'POST',
        hostname: 'api.cursor.com',
        path: '/v0/agents',
        headers: {
          Authorization: `Bearer ${CURSOR_API_KEY}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf-8');
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(body));
            } catch (error) {
              reject(
                new Error(
                  `Failed to parse Cursor response (status ${res.statusCode}): ${body}`,
                ),
              );
            }
          } else {
            reject(
              new Error(
                `Cursor API error (status ${
                  res.statusCode ?? 'unknown'
                }): ${body}`,
              ),
            );
          }
        });
      },
    );

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function launchAgent(rule: string): Promise<LaunchResult> {
  const branch = slugifyBranch(rule);
  const prompt = buildPrompt(rule);

  if (DRY_RUN) {
    console.log(`[dry-run] Would launch agent for ${rule} on branch ${branch}`);
    return { rule, branch, agentUrl: 'dry-run' };
  }

  const payload = {
    model: MODEL,
    prompt: { text: prompt },
    source: {
      repository: `https://github.com/${GITHUB_REPOSITORY}`,
      ref: SOURCE_REF,
    },
    target: {
      branchName: branch,
      autoCreatePr: true,
      skipReviewerRequest: true,
    },
  };

  try {
    const response = await callCursorAPI(payload);
    const agentUrl =
      (response && response.target && response.target.url) || 'unknown';
    console.log(`Launched agent for ${rule} -> ${agentUrl}`);
    return { rule, branch, agentUrl };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown error launching agent';
    console.error(`Failed to launch agent for ${rule}: ${message}`);
    return { rule, branch, error: message };
  }
}

async function run() {
  const rules = extractRuleNames();
  if (rules.length === 0) {
    console.error('No rules found in src/index.ts');
    process.exit(1);
  }

  console.log(
    `Launching agents for ${rules.length} rules in batches of ${BATCH_SIZE}${
      DRY_RUN ? ' (dry-run)' : ''
    }`,
  );

  const results: LaunchResult[] = [];

  for (let i = 0; i < rules.length; i += BATCH_SIZE) {
    const batch = rules.slice(i, i + BATCH_SIZE);
    console.log(
      `Starting batch ${Math.floor(i / BATCH_SIZE) + 1} (${
        batch.length
      } rules)`,
    );

    // Launch batch in parallel
    const batchResults = await Promise.all(batch.map(launchAgent));
    results.push(...batchResults);

    const moreRemaining = i + BATCH_SIZE < rules.length;
    if (moreRemaining && BATCH_DELAY_MS > 0) {
      console.log(`Waiting ${BATCH_DELAY_MS / 1000}s before next batch...`);
      await delay(BATCH_DELAY_MS);
    }
  }

  const successes = results.filter(
    (result): result is { rule: string; agentUrl: string; branch: string } =>
      'agentUrl' in result && !('error' in result),
  );
  const failures = results.filter(
    (result): result is { rule: string; branch: string; error: string } =>
      'error' in result,
  );

  console.log('\nSummary:');
  console.log(
    `  Success: ${successes.length} | Failed: ${failures.length} | Total: ${results.length}`,
  );

  if (successes.length > 0) {
    console.log('\nLaunched agents:');
    for (const success of successes) {
      console.log(
        `- ${success.rule} -> ${success.agentUrl} (branch ${success.branch})`,
      );
    }
  }

  if (failures.length > 0) {
    console.log('\nFailures:');
    for (const failure of failures) {
      console.log(
        `- ${failure.rule} (branch ${failure.branch}): ${failure.error}`,
      );
    }
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
