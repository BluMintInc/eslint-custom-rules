/**
 * Sibling module read off disk by the narrowing proof (#1644). The consumer
 * snippets live in the test file; only this module's declarations are real.
 */
import type { Base } from './base';

/** The agora `queue-maintainer` shape verbatim: four members, three picked. */
export type LinkedPullRequest = {
  readonly number: number;
  readonly headRefName: string;
  readonly closesIssue: boolean;
  readonly updatedAt: string;
};

export type Wide = { a: string; b: string; c: string };

/** Matches a two-field pick exactly, so that reassembly stays reportable. */
export type Exact = { a: string; b: string };

export type WideReadonly = Readonly<{ a: string; b: string; c: string }>;

export interface WideInterface {
  a: string;
  b: string;
  c: string;
}

/** An alias chain confined to this module still enumerates. */
export type WideViaLocalAlias = InnerWide;

type InnerWide = { a: string; b: string; c: string };

/** `Pick` rewrites the key set, so nothing follows from it. */
export type NarrowPick = Pick<Wide, 'a' | 'b'>;

/** Its members live one module further out, past the single hop. */
export type ViaThird = Base;

/** A specifier export is indistinguishable from a re-export at the specifier. */
type SpecifierExportedInner = { a: string; b: string; c: string };
export type { SpecifierExportedInner as SpecifierExported };

export type { Relayed } from './relayed';
