import { ruleTesterJsx } from '../utils/ruleTester';
import { noStablehashReactNodes } from '../rules/no-stablehash-react-nodes';

const HASH_IMPORT = `import { stableHash } from 'functions/src/util/hash/stableHash';`;
const SORTED_HASH_IMPORT = `import { sortedHash } from 'functions/src/util/hash/stableHash';`;
const ALIASED_HASH_IMPORT = `import { stableHash as hash } from 'functions/src/util/hash/stableHash';`;
const NAMESPACE_HASH_IMPORT = `import * as Hash from 'functions/src/util/hash/stableHash';`;

ruleTesterJsx.run('no-stablehash-react-nodes', noStablehashReactNodes, {
  valid: [
    // Hashing keys/ids (strings) — safe
    {
      code: `
${HASH_IMPORT}
function Component({ content }) {
  return stableHash(content.map(({ key }) => key));
}
      `,
    },

    // Plain string argument
    {
      code: `
${HASH_IMPORT}
const hash = stableHash('some-string');
      `,
    },

    // Array of strings
    {
      code: `
${HASH_IMPORT}
const hash = stableHash(['a', 'b', 'c']);
      `,
    },

    // Object without node-shaped props
    {
      code: `
${HASH_IMPORT}
const hash = stableHash({ id: 'x', name: 'y' });
      `,
    },

    // stableHash imported but arg is a plain typed-string param
    {
      code: `
${HASH_IMPORT}
function getHash(label: string) {
  return stableHash(label);
}
      `,
    },

    // A function named stableHash from a DIFFERENT module — must not flag
    {
      code: `
import { stableHash } from 'some-other-library';
function Component({ node }: { node: ReactNode }) {
  return stableHash(node);
}
      `,
    },

    // No import from the hash module at all — local function named stableHash
    {
      code: `
function stableHash(x: unknown) { return String(x); }
function Component({ node }: { node: ReactNode }) {
  return stableHash(node);
}
      `,
    },

    // Arg typed `any` — rule must be conservative and skip
    {
      code: `
${HASH_IMPORT}
function process(data: any) {
  return stableHash(data);
}
      `,
    },

    // Arg typed `unknown` — rule must be conservative and skip
    {
      code: `
${HASH_IMPORT}
function process(data: unknown) {
  return stableHash(data);
}
      `,
    },

    // Namespace import used for a method other than stableHash
    {
      code: `
${NAMESPACE_HASH_IMPORT}
const result = Hash.someOtherMethod({ node });
      `,
    },

    // Relative import from a non-hash module path
    {
      code: `
import { stableHash } from '../utils/stableHash';
function Component({ node }: { node: ReactNode }) {
  return stableHash(node);
}
      `,
    },

    // Object with neither `children` nor `Node` props
    {
      code: `
${HASH_IMPORT}
const hash = stableHash({ uid: user.id, role: user.role });
      `,
    },

    // Hashing a number
    {
      code: `
${HASH_IMPORT}
const hash = stableHash(42);
      `,
    },

    // Hashing a boolean
    {
      code: `
${HASH_IMPORT}
const hash = stableHash(true);
      `,
    },
  ],

  invalid: [
    // Direct JSX element
    {
      code: `
${HASH_IMPORT}
const hash = stableHash(<div />);
      `,
      errors: [{ messageId: 'noStableHashReactNode' }],
    },

    // JSX fragment
    {
      code: `
${HASH_IMPORT}
const hash = stableHash(<>hello</>);
      `,
      errors: [{ messageId: 'noStableHashReactNode' }],
    },

    // Nested JSX element
    {
      code: `
${HASH_IMPORT}
const hash = stableHash(<div><span>text</span></div>);
      `,
      errors: [{ messageId: 'noStableHashReactNode' }],
    },

    // Parameter typed KeyedNode
    {
      code: `
${HASH_IMPORT}
function getNodeHash(node: KeyedNode) {
  return stableHash(node);
}
      `,
      errors: [{ messageId: 'noStableHashReactNode' }],
    },

    // Parameter typed OrNode<T>
    {
      code: `
${HASH_IMPORT}
function getNodeHash(node: OrNode<MyType>) {
  return stableHash(node);
}
      `,
      errors: [{ messageId: 'noStableHashReactNode' }],
    },

    // Parameter typed React.ReactNode
    {
      code: `
${HASH_IMPORT}
function hashNode(node: React.ReactNode) {
  return stableHash(node);
}
      `,
      errors: [{ messageId: 'noStableHashReactNode' }],
    },

    // Parameter typed ReactNode (bare)
    {
      code: `
${HASH_IMPORT}
function hashNode(node: ReactNode) {
  return stableHash(node);
}
      `,
      errors: [{ messageId: 'noStableHashReactNode' }],
    },

    // Parameter typed ReactElement
    {
      code: `
${HASH_IMPORT}
function hashNode(node: ReactElement) {
  return stableHash(node);
}
      `,
      errors: [{ messageId: 'noStableHashReactNode' }],
    },

    // Parameter typed JSX.Element
    {
      code: `
${HASH_IMPORT}
function hashNode(node: JSX.Element) {
  return stableHash(node);
}
      `,
      errors: [{ messageId: 'noStableHashReactNode' }],
    },

    // Parameter typed readonly KeyedNode[]
    {
      code: `
${HASH_IMPORT}
function hashContent(content: readonly KeyedNode[]) {
  return stableHash(content);
}
      `,
      errors: [{ messageId: 'noStableHashReactNode' }],
    },

    // Parameter typed KeyedNode[] (non-readonly)
    {
      code: `
${HASH_IMPORT}
function hashContent(content: KeyedNode[]) {
  return stableHash(content);
}
      `,
      errors: [{ messageId: 'noStableHashReactNode' }],
    },

    // Object literal with `Node` property (shorthand)
    {
      code: `
${HASH_IMPORT}
const hash = stableHash({ key, Node });
      `,
      errors: [{ messageId: 'noStableHashReactNode' }],
    },

    // Object literal with `children` property
    {
      code: `
${HASH_IMPORT}
const hash = stableHash({ id, children });
      `,
      errors: [{ messageId: 'noStableHashReactNode' }],
    },

    // Aliased import: hash(<div/>)
    {
      code: `
${ALIASED_HASH_IMPORT}
const result = hash(<div />);
      `,
      errors: [{ messageId: 'noStableHashReactNode' }],
    },

    // Namespace import: Hash.stableHash(node) where node is KeyedNode
    {
      code: `
${NAMESPACE_HASH_IMPORT}
function hashNode(node: KeyedNode) {
  return Hash.stableHash(node);
}
      `,
      errors: [{ messageId: 'noStableHashReactNode' }],
    },

    // sortedHash with JSX element
    {
      code: `
${SORTED_HASH_IMPORT}
const hash = sortedHash(<div />);
      `,
      errors: [{ messageId: 'noStableHashReactNode' }],
    },

    // sortedHash with ReactNode param
    {
      code: `
${SORTED_HASH_IMPORT}
function hashNode(node: ReactNode) {
  return sortedHash(node);
}
      `,
      errors: [{ messageId: 'noStableHashReactNode' }],
    },

    // Relative import path (ends in util/hash/stableHash) — should still flag
    {
      code: `
import { stableHash } from '../../../functions/src/util/hash/stableHash';
function hashNode(node: ReactNode) {
  return stableHash(node);
}
      `,
      errors: [{ messageId: 'noStableHashReactNode' }],
    },

    // Object literal with `children` as explicit key-value
    {
      code: `
${HASH_IMPORT}
function hashRow(row: { id: string; children: ReactNode }) {
  return stableHash({ id: row.id, children: row.children });
}
      `,
      errors: [{ messageId: 'noStableHashReactNode' }],
    },

    // Multiple imports in file — still flags the hash call
    {
      code: `
import React from 'react';
${HASH_IMPORT}
import { useState } from 'react';
function hashNode(node: ReactElement) {
  return stableHash(node);
}
      `,
      errors: [{ messageId: 'noStableHashReactNode' }],
    },

    // React.ReactElement (qualified)
    {
      code: `
${HASH_IMPORT}
function hashNode(node: React.ReactElement) {
  return stableHash(node);
}
      `,
      errors: [{ messageId: 'noStableHashReactNode' }],
    },
  ],
});
