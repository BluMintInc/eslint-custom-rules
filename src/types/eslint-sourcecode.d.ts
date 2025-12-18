import type { TSESLint } from '@typescript-eslint/utils';

declare module '@typescript-eslint/utils/ts-eslint' {
  interface RuleContext<
    TMessageIds extends string,
    TOptions extends readonly unknown[],
    MessageIds extends string = TMessageIds,
    Options extends readonly unknown[] = TOptions,
  > {
    readonly sourceCode: TSESLint.SourceCode;
  }
}

declare module '@typescript-eslint/utils/dist/ts-eslint/Rule' {
  interface RuleContext<
    TMessageIds extends string,
    TOptions extends readonly unknown[],
    MessageIds extends string = TMessageIds,
    Options extends readonly unknown[] = TOptions,
  > {
    readonly sourceCode: TSESLint.SourceCode;
  }
}
