import type { TSESLint, TSESTree } from '@typescript-eslint/utils';

declare module '@typescript-eslint/utils/ts-eslint' {
  interface SourceCode {
    getAncestors(node: TSESTree.Node): TSESTree.Node[];
  }

  interface RuleContext<
    TMessageIds extends string,
    TOptions extends readonly unknown[],
    MessageIds extends string = TMessageIds,
    Options extends readonly unknown[] = TOptions,
  > {
    readonly sourceCode: TSESLint.SourceCode;
  }
}

declare module '@typescript-eslint/utils/dist/ts-eslint' {
  interface RuleContext<
    TMessageIds extends string,
    TOptions extends readonly unknown[],
    MessageIds extends string = TMessageIds,
    Options extends readonly unknown[] = TOptions,
  > {
    readonly sourceCode: import('@typescript-eslint/utils').TSESLint.SourceCode;
  }
}
