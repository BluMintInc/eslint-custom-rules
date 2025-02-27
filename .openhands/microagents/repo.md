## BluMint ESLint Plugin Development Guidelines

This repository contains custom ESLint rules for BluMint. When contributing, please follow these guidelines to maintain consistency and quality.

### Repository Purpose
This is an ESLint plugin that provides custom rules for BluMint's TypeScript/React codebase. The rules enforce coding standards, prevent common mistakes, and maintain code quality across BluMint's projects.

### Project Structure
* **docs/**: Markdown documentation for each rule
* **scripts/**: Utility scripts for development and maintenance
* **src/**: Source code for custom ESLint rules
    * **rules**: Contains all custom ESLint rules
    * **tests/**: Contains a Jest test suite for each ESLint rule of the same name
* **utils/**: Helper functions and utilities

### Documentation
1. Write comprehensive metadata in your rule file:
    * Clear description
    * Recommended configuration status
    * Fixable status
    * Examples of valid/invalid code
2. Run `npm run docs` to:
    * Generate rule documentation in `docs/rules/`
    * Update the rules table in `README.md`
3. Revise and expand the documentation
4. Run `npm run lint:eslint-docs` to verify documentation

### Creating New Rules
When creating a new rule:
1. Use the standard ESLint rule structure with `createRule` utility
2. Include comprehensive test cases
3. Write thorough rule metadata for documentation generation
4. Consider whether it should be in the 'recommended' configuration
5. Implement auto-fix functionality where appropriate
6. Run `npm run docs` to generate documentation

### Rule Implementation Guidelines
1. **Rule Structure**
    * Import and use the `createRule` utility from `'../utils/createRule'`
    * Define a `MessageIds` type for your rule's error message IDs
    * Use the following boilerplate:
    ```typescript
    import { createRule } from '../utils/createRule';

    type MessageIds = 'yourMessageId';

    export const yourRuleName = createRule<, MessageIds>({
        name: 'your-rule-name',
        meta: {
            type: 'suggestion', // or 'problem' or 'layout'
            docs: {
                description: 'Clear description of what the rule enforces',
                recommended: 'error', // or 'warn' or false
            },
            fixable: 'code', // or null if not auto-fixable
            schema:, // or your options schema
            messages: {
                yourMessageId: 'Your error message here',
            },
        },
        defaultOptions:,
        create(context) {
            return {
                // Your AST visitor methods here
            };
        },
    });
    ```

2. **Rule Naming and Organization**
    * Use kebab-case
    * Be descriptive and action-oriented (e.g., `enforce-`, `require-`, `no-`)
    * Group related rules with common prefixes

3. **AST Handling**
    * Use TypeScript's AST types from `@typescript-eslint/utils`
    * Create helper functions for complex AST traversal or checks
    * Consider using the `ASTHelpers` utility for common operations
    * When working with nodes, properly type them:
    ```typescript
    import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';

    // Type guards for node types
    function isTargetNode(node: TSESTree.Node): node is TSESTree.SpecificNodeType {
        return node.type === AST_NODE_TYPES.SpecificNodeType;
    }

    // Parent traversal helpers
    function checkParent(node: TSESTree.Node): boolean {
        let current: TSESTree.Node | undefined = node;
        while (current) {
            if (isTargetNode(current)) {
                return true;
            }
            current = current.parent as TSESTree.Node;
        }
        return false;
    }
    ```

4. **Rule Configuration**
    * Define schema for rule options when needed:
    ```typescript
    schema: [
        {
            type: 'object',
            properties: {
                yourOption: {
                    type: 'array',
                    items: { type: 'string' },
                    default: ['defaultValue'],
                },
            },
            additionalProperties: false,
        },
    ],
    ```
    * Access options in `create` function:
    ```typescript
    create(context, [options]) {
        const userOptions = {
          ...defaultOptions,
          ...options,
        };
    }
    ```
    * Consider maintaining constants at the top of the file for reusable values

5. **Error Reporting**
    * Use `context.report()` with `messageId` for errors
    * When implementing fixes:
    ```typescript
    context.report({
        node,
        messageId: 'yourMessageId',
        fix(fixer) {
            // Return null if fix isn't possible in some cases
            if (!canFix) return null;
            return fixer.replaceText(node, newText);
        },
    });
    ```

6. **Performance Considerations**
    * Cache repeated calculations
    * Skip unnecessary processing (e.g., files in `node_modules`)
    * Use early returns when possible
    * Consider the scope of AST traversal
    * Reuse type checking functions and constants
    * Use `Set`s for O(1) lookups of constant values:
    ```typescript
    const CONSTANT_SET = new Set(['value1', 'value2']);
    ```

### Writing ESLint Rule Tests
When writing tests for ESLint rules, follow these guidelines:

1. **Test File Structure**
    * Create test files in the `src/tests/` directory
    * Name the test file the same as the rule file with `.test.ts` extension
    * Use the following import boilerplate:
    ```typescript
    import { ruleTesterTs } from '../utils/ruleTester';
    import { yourRuleName } from '../rules/your-rule-name';
    ```

2. **Test Setup**
    * Use `ruleTesterTs.run()` to run your tests
    * DO NOT create a new `RuleTester` instance
    * Basic structure:
    ```typescript
    ruleTesterTs.run('rule-name', ruleObject, {
        valid: [
            // valid test cases
        ],
        invalid: [
            // invalid test cases with expected errors
        ],
    });
    ```

3. **Test Cases**
    * Valid cases: Code that should pass the rule
    * Invalid cases: Code that should fail with specific error messages
    * Include filename if testing path-related rules
    * Example:
    ```typescript
    valid: [
        {
            code: 'const x = 1;',
            filename: 'src/valid/path.ts',
        }
    ],
    invalid: [
        {
            code: 'const x = 1;',
            filename: 'src/invalid/path.ts',
            errors: [{ messageId: 'yourMessageId' }],
        }
    ]
    ```
    * **Indentation: Avoid using excessive indentation (such as 5 tabs) for multiline `code` and `output` blocks to make them line up with keys like `filename` and `error`. ** This can introduce unintended whitespace and make rules harder to implement.

### Development Workflow
1. **Setup**: Run `npm install` to set up all dependencies
2. **Development**:
    * Write rule implementation and tests
    * Run `npm run build` to compile TypeScript
    * Run `npm test` to run all tests or `npx jest <filename>` to test a specific test suite file
    * Run `npm run lint:fix` to fix any linting issues
3. **Documentation**:
    * Run `npm run docs` to generate/update documentation
    * Run `npm run lint:eslint-docs` to verify documentation

### Adding New Rules
This repository is structured as an ESLint plugin, which means that new rules can be seamlessly integrated into our projects. Here's how to contribute:

1. **Create a New Rule:**
    * Create a new file for your rule in `src/rules/`.
    * Follow the ESLint rule structure guidelines, including metadata and rule logic.
    * Use `utils/createRule.ts` to streamline rule creation with predefined types.
    * Leverage `utils/astUtils.ts` for AST manipulation and traversal.

2. **Write Tests:**
    * Each rule's test suite should reside in the `src/tests/` directory with a filename of the same filename as the rule but with the `.test.ts` suffix.
    * Use `ruleTester` to define valid and invalid code examples for your rule.
    * **Be extremely comprehensive when writing tests. You should expect to write more than 20 tests for each rule. These tests should cover different scenarios and edge cases.**

3. **Document the Rule:**
    * Add a new markdown file in `docs/rules/`.
    * Explain the rule's purpose, usage, options, and provide code examples.
    * Use `scripts/generateDocs.js` to automate documentation generation.

4. **Register the Rule in index.ts:**
    * Import your rule at the top of `src/index.ts`
    * Add it to the `rules` object export
    * If it should be enabled by default, add it to the `recommended` config section with appropriate severity ('error' in almost all cases, 'warn' in rare cases)
    * Ensure the rule name in all places matches your file name in kebab-case

5. **Acceptance Criteria:**
    * **Code Quality:**
        * The rule must adhere to ESLint's plugin guidelines.
        * The rule must pass linting and code style checks with zero errors.
    * **Testing:**
        * The rule must have comprehensive test coverage, with at least 90% of the code covered.
        * Tests should include edge cases, such as:
            * Incorrect AST node types
            * Empty function bodies
            * Invalid function signatures
            * Unusual whitespace or comments
            * Complex nested structures
            * And even more! Be extremely comprehensive.
        * No tests should be failing.
        * You should expect to write more than 20 tests for each rule.
    * **Documentation:**
        * The rule must have clear and concise documentation, including:
            * A description of the rule's purpose
            * Usage instructions
            * Configuration options
            * Examples of correct and incorrect code
