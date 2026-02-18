import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { request } from 'node:https';
import type { IncomingMessage } from 'node:http';
import * as ts from 'typescript';

type LaunchResult =
  | { success: true; rule: string; messageId: string; branch: string }
  | { success: false; rule: string; branch: string; error: string };

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SOURCE_REF = process.env.SOURCE_REF || 'develop';
const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';
const BATCH_SIZE = Number(process.env.BATCH_SIZE || 20);
const CLAUDE_API_TIMEOUT_MS = Number(
  process.env.CLAUDE_API_TIMEOUT_MS || 60000,
);
// Default gap between batches: 15 minutes
const BATCH_DELAY_MS = Number(process.env.BATCH_DELAY_MS || 15 * 60 * 1000);
const DRY_RUN = process.argv.includes('--dry-run');

if (!ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY environment variable is required.');
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

function readLintMessageGuide(): string {
  const path = '.claude/skills/lint-message/SKILL.md';
  try {
    return readFileSync(path, 'utf-8');
  } catch (error) {
    console.error(`Failed to read ${path}`);
    throw error;
  }
}

const lintMessageGuide = readLintMessageGuide();

function buildPrompt(ruleName: string): string {
  const rulePath = `src/rules/${ruleName}.ts`;
  const docPath = `docs/rules/${ruleName}.md`;
  const testPath = `src/tests/${ruleName}.test.ts`;

  return [
    `You are improving the ESLint rule "${ruleName}". Focus strictly on lint messaging and documentation quality while keeping the rule logic intact.`,
    '',
    'Deliverables:',
    `- Refine all message strings in ${rulePath} to follow the lint-message SKILL.md guide.`,
    `- Update tests such as ${testPath} to expect the refined messages (no behavior changes).`,
    `- Refresh ${docPath} so it explains the why/how of the rule and shows updated examples.`,
    '',
    'Lint message requirements (full guide from .claude/skills/lint-message/SKILL.md):',
    lintMessageGuide,
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

function callClaudeAPI(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const payload = {
      model: MODEL,
      max_tokens: 8192,
      messages: [{ role: 'user', content: prompt }],
    };
    const data = JSON.stringify(payload);
    const req = request(
      {
        method: 'POST',
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        timeout: CLAUDE_API_TIMEOUT_MS,
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
      },
      (res: IncomingMessage) => {
        const chunks: Uint8Array[] = [];
        res.on('data', (chunk: Uint8Array) => chunks.push(chunk));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf-8');
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const parsed = JSON.parse(body) as {
                id: string;
                content: Array<{ type: string; text: string }>;
              };
              resolve(parsed.id);
            } catch (error) {
              reject(
                new Error(
                  `Failed to parse Anthropic response (status ${res.statusCode}): ${body}`,
                ),
              );
            }
          } else {
            reject(
              new Error(
                `Anthropic API error (status ${
                  res.statusCode ?? 'unknown'
                }): ${body}`,
              ),
            );
          }
        });
      },
    );

    req.setTimeout(CLAUDE_API_TIMEOUT_MS, () => {
      req.destroy(
        new Error(
          `Anthropic API request socket timed out after ${CLAUDE_API_TIMEOUT_MS}ms`,
        ),
      );
    });

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
    return { success: true, rule, branch, messageId: 'dry-run' };
  }

  try {
    const messageId = await callClaudeAPI(prompt);
    console.log(`Launched agent for ${rule} -> messageId: ${messageId}`);
    return { success: true, rule, branch, messageId };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown error launching agent';
    console.error(`Failed to launch agent for ${rule}: ${message}`);
    return { success: false, rule, branch, error: message };
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

  const successes = results.filter((result) => result.success);
  const failures = results.filter((result) => !result.success);

  console.log('\nSummary:');
  console.log(
    `  Success: ${successes.length} | Failed: ${failures.length} | Total: ${results.length}`,
  );

  if (successes.length > 0) {
    console.log('\nLaunched agents:');
    for (const success of successes) {
      console.log(
        `- ${success.rule} (messageId: ${success.messageId}, branch ${success.branch})`,
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
