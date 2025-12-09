import { existsSync, readFileSync } from 'node:fs';

/**
 * Validates that a PR implementing a new ESLint rule has all required files
 * and that src/index.ts properly exports the rule.
 */

type ValidationResult = {
  isValid: boolean;
  missingFiles: string[];
  indexIssues: string[];
};

/**
 * Convert kebab-case rule name to camelCase for import variable name.
 * Examples:
 *   'no-async-foreach' -> 'noAsyncForeach'
 *   'enforce-callback-memo' -> 'enforceCallbackMemo'
 */
function kebabToCamelCase(str: string): string {
  return str.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Safely read file contents, returning null if file doesn't exist.
 */
function safeReadFile(filePath: string): string | null {
  try {
    if (!existsSync(filePath)) {
      return null;
    }
    return readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

export function validateRuleStructure(ruleName: string): ValidationResult {
  const requiredFiles = [
    `src/rules/${ruleName}.ts`,
    `src/tests/${ruleName}.test.ts`,
    `docs/rules/${ruleName}.md`,
  ];

  const indexIssues: string[] = [];

  // Check for missing files
  const missingFiles = requiredFiles.filter((file) => !existsSync(file));

  // Validate src/index.ts includes the rule in 3 places:
  // 1. Import statement
  // 2. configs.recommended.rules entry
  // 3. rules object entry
  const indexContent = safeReadFile('src/index.ts');
  if (!indexContent) {
    indexIssues.push('src/index.ts file not found or could not be read');
    return {
      isValid: false,
      missingFiles,
      indexIssues,
    };
  }

  const camelCaseName = kebabToCamelCase(ruleName);
  const escapedRuleName = escapeRegex(ruleName);

  // Check for import (flexible to handle various import styles)
  // Matches: import { foo } from './rules/foo'; or import { default as foo } from './rules/foo';
  const importRegex = new RegExp(
    `import\\s*\\{[^}]*\\}\\s*from\\s*['"]\\./rules/${escapedRuleName}['"]`,
  );

  // Check for config rule entry
  // Matches: '@blumintinc/blumint/rule-name': 'error' (with flexible whitespace)
  const configRulesRegex = new RegExp(
    `['"]@blumintinc/blumint/${escapedRuleName}['"]\\s*:\\s*['"](?:error|warn)['"]`,
  );

  // Check for rules export entry
  // Matches: 'rule-name': ruleName (with flexible whitespace)
  const rulesExportRegex = new RegExp(
    `['"]${escapedRuleName}['"]\\s*:\\s*\\w+`,
  );

  if (!importRegex.test(indexContent)) {
    indexIssues.push(`Missing import for ${ruleName} in src/index.ts`);
  }
  if (!configRulesRegex.test(indexContent)) {
    indexIssues.push(
      `Missing '@blumintinc/blumint/${ruleName}': 'error' in configs.recommended.rules`,
    );
  }
  if (!rulesExportRegex.test(indexContent)) {
    indexIssues.push(`Missing '${ruleName}': ${camelCaseName} in rules object`);
  }

  // Check README.md mentions the rule
  const readmeContent = safeReadFile('README.md');
  if (!readmeContent) {
    indexIssues.push('README.md file not found or could not be read');
  } else if (!readmeContent.includes(ruleName)) {
    indexIssues.push(`README.md does not mention the new rule: ${ruleName}`);
  }

  return {
    isValid: missingFiles.length === 0 && indexIssues.length === 0,
    missingFiles,
    indexIssues,
  };
}
