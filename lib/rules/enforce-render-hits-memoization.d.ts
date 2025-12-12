import { TSESLint } from '@typescript-eslint/utils';

type MessageIds =
  | 'requireMemoizedTransformBefore'
  | 'requireMemoizedRender'
  | 'requireMemoizedRenderHits'
  | 'noDirectComponentInRender';

export declare const enforceRenderHitsMemoization: TSESLint.RuleModule<
  MessageIds,
  []
>;
