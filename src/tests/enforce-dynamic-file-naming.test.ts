import { Linter } from 'eslint';
import * as tsParser from '@typescript-eslint/parser';
import { ruleTesterTs, withParserOptions } from '../utils/ruleTester';
import rule, {
  RULE_NAME,
  DYNAMIC_RULES_LABEL,
  REQUIRE_DYNAMIC_FIREBASE_IMPORTS_RULE,
} from '../rules/enforce-dynamic-file-naming';
import requireDynamicFirebaseImports from '../rules/require-dynamic-firebase-imports';
import enforceDynamicImports from '../rules/enforce-dynamic-imports';

// Module scope analysis is not the shared tester's default, and every snippet
// here is an ES module, so the cases carry it themselves.
const parserOptions = {
  ecmaVersion: 2020,
  sourceType: 'module',
} as const;

const ENFORCE_DYNAMIC_IMPORTS_RULE =
  '@blumintinc/blumint/enforce-dynamic-imports';

// The rule reads eslint-disable directives naming sibling rules; stubbing them
// on the tester's linter keeps this suite from depending on their real
// implementations.
const linter = (ruleTesterTs as unknown as { linter: Linter }).linter;

linter.defineRule(ENFORCE_DYNAMIC_IMPORTS_RULE, {
  meta: {
    type: 'problem',
    docs: { description: 'stub', recommended: false },
    schema: [],
  },
  create: () => ({}),
});

linter.defineRule(REQUIRE_DYNAMIC_FIREBASE_IMPORTS_RULE, {
  meta: {
    type: 'problem',
    docs: { description: 'stub', recommended: false },
    schema: [],
  },
  create: () => ({}),
});

ruleTesterTs.run(RULE_NAME, rule, {
  valid: withParserOptions(parserOptions, [
    // Regular TypeScript file without disable directive
    {
      code: `import React from 'react';`,
      filename: 'example.ts',
    },
    // File with .dynamic.ts extension and enforce-dynamic-imports eslint-disable-line directive
    {
      code: `import SomeModule from './SomeModule'; // eslint-disable-line @blumintinc/blumint/enforce-dynamic-imports`,
      filename: 'example.dynamic.ts',
    },
    // Regular TypeScript file without disable directive
    {
      code: `import React from 'react';`,
      filename: 'example.tsx',
    },
    // File with .dynamic.ts extension and enforce-dynamic-imports disable directive
    {
      code: `// eslint-disable-next-line @blumintinc/blumint/enforce-dynamic-imports
import SomeModule from './SomeModule';`,
      filename: 'example.dynamic.ts',
    },
    // File with .dynamic.tsx extension and enforce-dynamic-imports disable directive
    {
      code: `// eslint-disable-next-line @blumintinc/blumint/enforce-dynamic-imports
import SomeModule from './SomeModule';`,
      filename: 'example.dynamic.tsx',
    },
    // Block-comment eslint-disable-next-line is honored by ESLint too
    {
      code: `/* eslint-disable-next-line @blumintinc/blumint/enforce-dynamic-imports */
import SomeModule from './SomeModule';`,
      filename: 'block-next-line.dynamic.ts',
    },
    // Trailing block-comment eslint-disable-line is honored by ESLint too
    {
      code: `import SomeModule from './SomeModule'; /* eslint-disable-line @blumintinc/blumint/enforce-dynamic-imports */`,
      filename: 'block-line.dynamic.ts',
    },
    // File with .dynamic.ts extension and require-dynamic-firebase-imports disable directive
    {
      code: `// eslint-disable-next-line @blumintinc/blumint/require-dynamic-firebase-imports
import SomeModule from 'firebase/auth';`,
      filename: 'example.dynamic.ts',
    },
    // File with .dynamic.tsx extension and require-dynamic-firebase-imports disable directive
    {
      code: `// eslint-disable-next-line @blumintinc/blumint/require-dynamic-firebase-imports
import SomeModule from 'firebase/auth';`,
      filename: 'example.dynamic.tsx',
    },
    // Block disable should be allowed with .dynamic extension
    {
      code: `/* eslint-disable @blumintinc/blumint/require-dynamic-firebase-imports */
import SomeModule from 'firebase/auth';`,
      filename: 'block.dynamic.ts',
    },
    // A justification tail does not stop ESLint honoring the directive
    {
      code: `// eslint-disable-next-line @blumintinc/blumint/require-dynamic-firebase-imports -- auth must load eagerly here
import SomeModule from 'firebase/auth';`,
      filename: 'justified.dynamic.ts',
    },
    // The rule may be one entry of a comma separated directive list
    {
      code: `/* eslint-disable no-console, @blumintinc/blumint/require-dynamic-firebase-imports */
import SomeModule from 'firebase/auth';`,
      filename: 'list.dynamic.ts',
    },
    // Quoted rule names are unquoted by ESLint before the directive is applied
    {
      code: `/* eslint-disable "@blumintinc/blumint/require-dynamic-firebase-imports" */
import SomeModule from 'firebase/auth';`,
      filename: 'quoted.dynamic.ts',
    },
    // Both dynamic rules disabled at once
    {
      code: `/* eslint-disable @blumintinc/blumint/enforce-dynamic-imports, @blumintinc/blumint/require-dynamic-firebase-imports */
import SomeModule from 'firebase/auth';`,
      filename: 'both.dynamic.ts',
    },
    // Regular TypeScript file without disable directive
    {
      code: `import React from 'react';`,
      filename: 'example.test.ts',
    },
    {
      code: `// eslint-disable-next-line @blumintinc/blumint/enforce-dynamic-imports
import SomeModule from './SomeModule';`,
      filename: 'example.client.dynamic.tsx',
    },
    // Ignore non-TypeScript files
    {
      code: `// eslint-disable-next-line @blumintinc/blumint/enforce-dynamic-imports
import SomeModule from './SomeModule';`,
      filename: 'example.js',
    },
    // Reference to rule name in a comment without disable shorthand should not trigger
    {
      code: `// This is modeled after guidance in @blumintinc/blumint/enforce-dynamic-imports
const value = 1;`,
      filename: 'note.ts',
    },
    // Uppercase directive is ignored (ESLint is case-sensitive)
    {
      code: `// ESLINT-DISABLE-NEXT-LINE @blumintinc/blumint/enforce-dynamic-imports
import SomeModule from './SomeModule';`,
      filename: 'uppercase.ts',
    },
    // `ednl` is not ESLint syntax: it suppresses nothing, so it is not a bypass
    // that has to be paid for with a .dynamic name.
    {
      code: `// ednl @blumintinc/blumint/enforce-dynamic-imports
import SomeModule from './SomeModule';`,
      filename: 'ednl.ts',
    },
    // `edl` is not ESLint syntax either
    {
      code: `// edl @blumintinc/blumint/enforce-dynamic-imports
import SomeModule from './SomeModule';`,
      filename: 'edl.ts',
    },
    // A bare `eslint-disable` in a LINE comment is inert; ESLint parses that
    // directive only out of a block comment.
    {
      code: `// eslint-disable @blumintinc/blumint/enforce-dynamic-imports
import SomeModule from './SomeModule';`,
      filename: 'line-comment-disable.ts',
    },
    // ESLint requires the directive to open the comment, so this is prose
    {
      code: `// see eslint-disable-next-line @blumintinc/blumint/enforce-dynamic-imports
import SomeModule from './SomeModule';`,
      filename: 'prose.ts',
    },
    {
      code: `/* see eslint-disable @blumintinc/blumint/enforce-dynamic-imports */
import SomeModule from './SomeModule';`,
      filename: 'prose-block.ts',
    },
    // A rule named in the justification tail is not a disable target
    {
      code: `// eslint-disable-next-line no-console -- @blumintinc/blumint/enforce-dynamic-imports explains the shape
console.log('Debugging');`,
      filename: 'justification-only.ts',
    },
    // A multi-line `eslint-disable-line`, which ESLint refuses outright, is
    // covered by the composed suite below: ESLint answers it with a directive
    // problem of its own, and RuleTester counts that extra message against the
    // fixture even though it does not come from this rule.
  ]),
  invalid: withParserOptions(parserOptions, [
    // File without .dynamic.ts extension but with enforce-dynamic-imports disable directive
    {
      code: `// eslint-disable-next-line @blumintinc/blumint/enforce-dynamic-imports
import SomeModule from './SomeModule';`,
      filename: 'example.ts',
      errors: [
        {
          messageId: 'requireDynamicExtension',
          data: {
            fileName: 'example.ts',
            ruleName: '@blumintinc/blumint/enforce-dynamic-imports',
            extension: '.ts',
            suggestedName: 'example.dynamic.ts',
          },
        },
      ],
    },
    // File without .dynamic.ts extension but with a block eslint-disable-next-line
    {
      code: `/* eslint-disable-next-line @blumintinc/blumint/enforce-dynamic-imports */
import SomeModule from './SomeModule';`,
      filename: 'block-next-line.ts',
      errors: [
        {
          messageId: 'requireDynamicExtension',
          data: {
            fileName: 'block-next-line.ts',
            ruleName: '@blumintinc/blumint/enforce-dynamic-imports',
            extension: '.ts',
            suggestedName: 'block-next-line.dynamic.ts',
          },
        },
      ],
    },
    // File without .dynamic.tsx extension but with enforce-dynamic-imports disable directive
    {
      code: `// eslint-disable-next-line @blumintinc/blumint/enforce-dynamic-imports
import SomeModule from './SomeModule';`,
      filename: 'example.tsx',
      errors: [
        {
          messageId: 'requireDynamicExtension',
          data: {
            fileName: 'example.tsx',
            ruleName: '@blumintinc/blumint/enforce-dynamic-imports',
            extension: '.tsx',
            suggestedName: 'example.dynamic.tsx',
          },
        },
      ],
    },
    // Block disable for enforce-dynamic-imports still requires .dynamic extension
    {
      code: `/* eslint-disable @blumintinc/blumint/enforce-dynamic-imports */
import SomeModule from './SomeModule';`,
      filename: 'block.ts',
      errors: [
        {
          messageId: 'requireDynamicExtension',
          data: {
            fileName: 'block.ts',
            ruleName: '@blumintinc/blumint/enforce-dynamic-imports',
            extension: '.ts',
            suggestedName: 'block.dynamic.ts',
          },
        },
      ],
    },
    // A justification tail does not exempt the file from the naming contract
    {
      code: `// eslint-disable-next-line @blumintinc/blumint/enforce-dynamic-imports -- legacy entry point
import SomeModule from './SomeModule';`,
      filename: 'justified.ts',
      errors: [
        {
          messageId: 'requireDynamicExtension',
          data: {
            fileName: 'justified.ts',
            ruleName: '@blumintinc/blumint/enforce-dynamic-imports',
            extension: '.ts',
            suggestedName: 'justified.dynamic.ts',
          },
        },
      ],
    },
    // Multi-dot TypeScript file without .dynamic.ts extension but with enforce-dynamic-imports disable directive
    {
      code: `// eslint-disable-next-line @blumintinc/blumint/enforce-dynamic-imports
import SomeModule from './SomeModule';`,
      filename: 'example.test.ts',
      errors: [
        {
          messageId: 'requireDynamicExtension',
          data: {
            fileName: 'example.test.ts',
            ruleName: '@blumintinc/blumint/enforce-dynamic-imports',
            extension: '.ts',
            suggestedName: 'example.test.dynamic.ts',
          },
        },
      ],
    },
    // Multi-dot TypeScript file without .dynamic.tsx extension but with enforce-dynamic-imports disable directive
    {
      code: `// eslint-disable-next-line @blumintinc/blumint/enforce-dynamic-imports
import SomeModule from './SomeModule';`,
      filename: 'index.client.tsx',
      errors: [
        {
          messageId: 'requireDynamicExtension',
          data: {
            fileName: 'index.client.tsx',
            ruleName: '@blumintinc/blumint/enforce-dynamic-imports',
            extension: '.tsx',
            suggestedName: 'index.client.dynamic.tsx',
          },
        },
      ],
    },
    // File without .dynamic.ts extension but with require-dynamic-firebase-imports disable directive
    {
      code: `// eslint-disable-next-line @blumintinc/blumint/require-dynamic-firebase-imports
import SomeModule from 'firebase/auth';`,
      filename: 'example.ts',
      errors: [
        {
          messageId: 'requireDynamicExtension',
          data: {
            fileName: 'example.ts',
            ruleName: '@blumintinc/blumint/require-dynamic-firebase-imports',
            extension: '.ts',
            suggestedName: 'example.dynamic.ts',
          },
        },
      ],
    },
    // File without .dynamic.tsx extension but with require-dynamic-firebase-imports disable directive
    {
      code: `// eslint-disable-next-line @blumintinc/blumint/require-dynamic-firebase-imports
import SomeModule from 'firebase/auth';`,
      filename: 'example.tsx',
      errors: [
        {
          messageId: 'requireDynamicExtension',
          data: {
            fileName: 'example.tsx',
            ruleName: '@blumintinc/blumint/require-dynamic-firebase-imports',
            extension: '.tsx',
            suggestedName: 'example.dynamic.tsx',
          },
        },
      ],
    },
    // Both rules disabled at once still requires the .dynamic extension
    {
      code: `/* eslint-disable @blumintinc/blumint/enforce-dynamic-imports, @blumintinc/blumint/require-dynamic-firebase-imports */
import SomeModule from 'firebase/auth';`,
      filename: 'both.ts',
      errors: [
        {
          messageId: 'requireDynamicExtension',
          data: {
            fileName: 'both.ts',
            ruleName: DYNAMIC_RULES_LABEL,
            extension: '.ts',
            suggestedName: 'both.dynamic.ts',
          },
        },
      ],
    },
    // File with .dynamic.ts extension but without disable directive
    {
      code: `import SomeModule from './SomeModule';`,
      filename: 'example.dynamic.ts',
      errors: [
        {
          messageId: 'requireDisableDirective',
          data: {
            fileName: 'example.dynamic.ts',
            standardName: 'example.ts',
            dynamicRulesLabel: DYNAMIC_RULES_LABEL,
          },
        },
      ],
    },
    // File with .dynamic.tsx extension but without disable directive
    {
      code: `import SomeModule from './SomeModule';`,
      filename: 'example.dynamic.tsx',
      errors: [
        {
          messageId: 'requireDisableDirective',
          data: {
            fileName: 'example.dynamic.tsx',
            standardName: 'example.tsx',
            dynamicRulesLabel: DYNAMIC_RULES_LABEL,
          },
        },
      ],
    },
    // File with .dynamic.tsx extension but with disable directive for another rule
    {
      code: `// eslint-disable-next-line no-console
console.log('Debugging');`,
      filename: 'example.dynamic.tsx',
      errors: [
        {
          messageId: 'requireDisableDirective',
          data: {
            fileName: 'example.dynamic.tsx',
            standardName: 'example.tsx',
            dynamicRulesLabel: DYNAMIC_RULES_LABEL,
          },
        },
      ],
    },
    // Uppercase block disable should not count, so .dynamic requires directive
    {
      code: `// ESLINT-DISABLE @blumintinc/blumint/enforce-dynamic-imports
import SomeModule from './SomeModule';`,
      filename: 'uppercase.dynamic.ts',
      errors: [
        {
          messageId: 'requireDisableDirective',
          data: {
            fileName: 'uppercase.dynamic.ts',
            standardName: 'uppercase.ts',
            dynamicRulesLabel: DYNAMIC_RULES_LABEL,
          },
        },
      ],
    },
    // File without .dynamic.ts extension but with enforce-dynamic-imports eslint-disable-line directive
    {
      code: `import SomeModule from './SomeModule'; // eslint-disable-line @blumintinc/blumint/enforce-dynamic-imports`,
      filename: 'example.ts',
      errors: [
        {
          messageId: 'requireDynamicExtension',
          data: {
            fileName: 'example.ts',
            ruleName: '@blumintinc/blumint/enforce-dynamic-imports',
            extension: '.ts',
            suggestedName: 'example.dynamic.ts',
          },
        },
      ],
    },
    // `ednl` suppresses nothing, so the .dynamic suffix is unbacked signal
    {
      code: `// ednl @blumintinc/blumint/enforce-dynamic-imports
import SomeModule from './SomeModule';`,
      filename: 'ednl.dynamic.ts',
      errors: [
        {
          messageId: 'requireDisableDirective',
          data: {
            fileName: 'ednl.dynamic.ts',
            standardName: 'ednl.ts',
            dynamicRulesLabel: DYNAMIC_RULES_LABEL,
          },
        },
      ],
    },
    // Same for `edl`
    {
      code: `// edl @blumintinc/blumint/enforce-dynamic-imports
import SomeModule from './SomeModule';`,
      filename: 'edl.dynamic.ts',
      errors: [
        {
          messageId: 'requireDisableDirective',
          data: {
            fileName: 'edl.dynamic.ts',
            standardName: 'edl.ts',
            dynamicRulesLabel: DYNAMIC_RULES_LABEL,
          },
        },
      ],
    },
    // A bare `eslint-disable` inside a LINE comment is inert
    {
      code: `// eslint-disable @blumintinc/blumint/enforce-dynamic-imports
import SomeModule from './SomeModule';`,
      filename: 'line-comment-disable.dynamic.ts',
      errors: [
        {
          messageId: 'requireDisableDirective',
          data: {
            fileName: 'line-comment-disable.dynamic.ts',
            standardName: 'line-comment-disable.ts',
            dynamicRulesLabel: DYNAMIC_RULES_LABEL,
          },
        },
      ],
    },
    // The directive has to open the comment
    {
      code: `// see eslint-disable-next-line @blumintinc/blumint/enforce-dynamic-imports
import SomeModule from './SomeModule';`,
      filename: 'prose.dynamic.ts',
      errors: [
        {
          messageId: 'requireDisableDirective',
          data: {
            fileName: 'prose.dynamic.ts',
            standardName: 'prose.ts',
            dynamicRulesLabel: DYNAMIC_RULES_LABEL,
          },
        },
      ],
    },
    // A rule named only in the justification tail is not disabled
    {
      code: `// eslint-disable-next-line no-console -- @blumintinc/blumint/enforce-dynamic-imports explains the shape
console.log('Debugging');`,
      filename: 'justification-only.dynamic.ts',
      errors: [
        {
          messageId: 'requireDisableDirective',
          data: {
            fileName: 'justification-only.dynamic.ts',
            standardName: 'justification-only.ts',
            dynamicRulesLabel: DYNAMIC_RULES_LABEL,
          },
        },
      ],
    },
  ]),
});

/**
 * The rule's whole value is that a `.dynamic` filename buys a REAL suppression:
 * a reviewer reads the suffix as "an exception was taken here", and CI is
 * supposed to be quiet because the sibling rule really is disabled. A spelling
 * ESLint does not honor inverts that — the exception reads as reviewed while
 * the sibling keeps reporting (#1843, where `// ednl <rule>` and a bare
 * `// eslint-disable <rule>` in a line comment were both blessed).
 *
 * A single-rule RuleTester case cannot express the contradiction: it can only
 * say what this rule thinks of a comment, never whether ESLint acts on it. So
 * the corpus below runs `enforce-dynamic-file-naming` and the real
 * `require-dynamic-firebase-imports` through one `Linter` and asserts the
 * equivalence directly:
 *
 *     this rule treats the comment as a bypass  <=>  ESLint silences the sibling
 *
 * Rules are registered under their real `@blumintinc/blumint/` ids on purpose.
 * Under bare ids the directives below name a rule the linter has never heard
 * of, so ESLint discards them and every case would read as "not silenced" —
 * manufacturing agreement with a broken rule.
 */
describe(`${RULE_NAME} directive spellings match ESLint's own`, () => {
  const NAMING_RULE_ID = `@blumintinc/blumint/${RULE_NAME}`;

  const composedLinter = new Linter();
  composedLinter.defineParser('ts', tsParser as never);
  composedLinter.defineRule(NAMING_RULE_ID, rule as never);
  composedLinter.defineRule(
    REQUIRE_DYNAMIC_FIREBASE_IMPORTS_RULE,
    requireDynamicFirebaseImports as never,
  );
  // Defined but not enabled: a directive naming an unknown rule is reported as
  // "Definition for rule was not found" and never applied.
  composedLinter.defineRule(
    ENFORCE_DYNAMIC_IMPORTS_RULE,
    enforceDynamicImports as never,
  );

  const composedConfig = {
    parser: 'ts',
    parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
    rules: {
      [NAMING_RULE_ID]: 'error',
      [REQUIRE_DYNAMIC_FIREBASE_IMPORTS_RULE]: 'error',
    },
  };

  const STATIC_FIREBASE_IMPORT = `import { getAuth } from 'firebase/auth';`;
  const SIBLING = REQUIRE_DYNAMIC_FIREBASE_IMPORTS_RULE;

  type SpellingCase = {
    label: string;
    code: string;
    /** What this rule must conclude, and what ESLint must actually do. */
    bypass: boolean;
  };

  // Every directive is placed where it applies (`-line` trailing the import,
  // `-next-line` above it), so a case that fails to silence the sibling failed
  // on its SPELLING rather than on its position.
  const cases: SpellingCase[] = [
    {
      label: 'no directive at all',
      code: STATIC_FIREBASE_IMPORT,
      bypass: false,
    },
    {
      label: 'line comment eslint-disable-next-line',
      code: `// eslint-disable-next-line ${SIBLING}\n${STATIC_FIREBASE_IMPORT}`,
      bypass: true,
    },
    {
      label: 'block comment eslint-disable-next-line',
      code: `/* eslint-disable-next-line ${SIBLING} */\n${STATIC_FIREBASE_IMPORT}`,
      bypass: true,
    },
    {
      label: 'trailing line comment eslint-disable-line',
      code: `${STATIC_FIREBASE_IMPORT} // eslint-disable-line ${SIBLING}`,
      bypass: true,
    },
    {
      label: 'trailing block comment eslint-disable-line',
      code: `${STATIC_FIREBASE_IMPORT} /* eslint-disable-line ${SIBLING} */`,
      bypass: true,
    },
    {
      label: 'block comment eslint-disable',
      code: `/* eslint-disable ${SIBLING} */\n${STATIC_FIREBASE_IMPORT}`,
      bypass: true,
    },
    {
      label: 'eslint-disable-next-line with a justification tail',
      code: `// eslint-disable-next-line ${SIBLING} -- auth must load eagerly\n${STATIC_FIREBASE_IMPORT}`,
      bypass: true,
    },
    {
      label: 'comma separated rule list',
      code: `/* eslint-disable no-console, ${SIBLING} */\n${STATIC_FIREBASE_IMPORT}`,
      bypass: true,
    },
    {
      label: 'quoted rule name',
      code: `/* eslint-disable "${SIBLING}" */\n${STATIC_FIREBASE_IMPORT}`,
      bypass: true,
    },
    {
      label: 'ednl shorthand',
      code: `// ednl ${SIBLING}\n${STATIC_FIREBASE_IMPORT}`,
      bypass: false,
    },
    {
      label: 'edl shorthand',
      code: `// edl ${SIBLING}\n${STATIC_FIREBASE_IMPORT}`,
      bypass: false,
    },
    {
      label: 'bare eslint-disable inside a line comment',
      code: `// eslint-disable ${SIBLING}\n${STATIC_FIREBASE_IMPORT}`,
      bypass: false,
    },
    {
      label: 'directive not at the start of a line comment',
      code: `// see eslint-disable-next-line ${SIBLING}\n${STATIC_FIREBASE_IMPORT}`,
      bypass: false,
    },
    {
      label: 'directive not at the start of a block comment',
      code: `/* see eslint-disable ${SIBLING} */\n${STATIC_FIREBASE_IMPORT}`,
      bypass: false,
    },
    {
      label: 'uppercase directive',
      code: `// ESLINT-DISABLE-NEXT-LINE ${SIBLING}\n${STATIC_FIREBASE_IMPORT}`,
      bypass: false,
    },
    {
      label: 'rule named only in the justification tail',
      code: `// eslint-disable-next-line no-console -- ${SIBLING} explains it\n${STATIC_FIREBASE_IMPORT}`,
      bypass: false,
    },
    {
      label: 'multi-line eslint-disable-line block comment',
      code: `${STATIC_FIREBASE_IMPORT} /* eslint-disable-line\n${SIBLING} */`,
      bypass: false,
    },
    {
      label: 'jsdoc comment carrying eslint-disable',
      code: `/** eslint-disable ${SIBLING} */\n${STATIC_FIREBASE_IMPORT}`,
      bypass: false,
    },
  ];

  const lint = (code: string, filename: string) => {
    const messages = composedLinter.verify(
      code,
      composedConfig as never,
      filename,
    );
    const fatal = messages.filter((message) => message.fatal);
    // A parse failure reports nothing from either rule, which would read as
    // "silenced" for every case and pass the whole table vacuously.
    expect(fatal).toEqual([]);
    return messages;
  };

  const counters = { silenced: 0, reported: 0, naming: 0, extension: 0 };

  it.each(cases.map((testCase) => [testCase.label, testCase] as const))(
    '%s',
    (_label, testCase) => {
      const dynamicMessages = lint(testCase.code, 'subject.dynamic.ts');
      const siblingSilenced = !dynamicMessages.some(
        (message) => message.ruleId === SIBLING,
      );

      // The load-bearing assertion: acceptance must track real suppression.
      expect(siblingSilenced).toBe(testCase.bypass);

      const missingDirective = dynamicMessages.some(
        (message) =>
          message.ruleId === NAMING_RULE_ID &&
          message.messageId === 'requireDisableDirective',
      );
      expect(missingDirective).toBe(!testCase.bypass);

      // The mirror direction: a real bypass on a plain .ts name has to be paid
      // for with the .dynamic suffix, and an inert comment buys no debt.
      const plainMessages = lint(testCase.code, 'subject.ts');
      const needsDynamicName = plainMessages.some(
        (message) =>
          message.ruleId === NAMING_RULE_ID &&
          message.messageId === 'requireDynamicExtension',
      );
      expect(needsDynamicName).toBe(testCase.bypass);

      if (siblingSilenced) {
        counters.silenced += 1;
      } else {
        counters.reported += 1;
      }
      if (missingDirective) {
        counters.naming += 1;
      }
      if (needsDynamicName) {
        counters.extension += 1;
      }
    },
  );

  // Non-vacuity: the table has to exercise both verdicts, and the harness has
  // to have seen the sibling actually fire and actually go quiet.
  it('exercises both verdicts on a non-degenerate corpus', () => {
    expect(cases.filter((testCase) => testCase.bypass).length).toBeGreaterThan(
      5, // measured 8
    );
    expect(cases.filter((testCase) => !testCase.bypass).length).toBeGreaterThan(
      5, // measured 10
    );
    expect(counters.silenced).toBeGreaterThan(5); // measured 8
    expect(counters.reported).toBeGreaterThan(5); // measured 10
    expect(counters.naming).toBe(counters.reported);
    expect(counters.extension).toBe(counters.silenced);
  });

  it('reports the sibling on an undirected file, proving the corpus can fail', () => {
    const messages = lint(STATIC_FIREBASE_IMPORT, 'control.dynamic.ts');
    expect(
      messages.filter((message) => message.ruleId === SIBLING),
    ).toHaveLength(1);
  });
});
