import type { TSESLint } from '@typescript-eslint/utils';

declare module '@typescript-eslint/utils/ts-eslint' {
  interface RuleContext<MessageIds extends string, Options extends readonly unknown[]> {
    readonly sourceCode: TSESLint.SourceCode;
  }
}

declare module '@typescript-eslint/utils/dist/ts-eslint/Rule' {
  interface RuleContext<MessageIds extends string, Options extends readonly unknown[]> {
    readonly sourceCode: TSESLint.SourceCode;
  }
}
