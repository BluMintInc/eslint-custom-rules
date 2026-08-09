import { Linter, Rule } from 'eslint';
import { ruleTesterTs } from '../utils/ruleTester';
import { fastDeepEqualOverMicrodiff } from '../rules/fast-deep-equal-over-microdiff';

const messageData = (diffName = 'diff', fastEqualName = 'isEqual') => ({
  diffName,
  fastEqualName,
});

ruleTesterTs.run('fast-deep-equal-over-microdiff', fastDeepEqualOverMicrodiff, {
  valid: [
    // Using upstream fast-deep-equal correctly
    {
      code: `import isEqual from 'fast-deep-equal';

function areObjectsEqual(obj1, obj2) {
  return isEqual(obj1, obj2);
}`,
    },
    // Using fast-deep-equal/es6 correctly
    {
      code: `import isEqual from 'fast-deep-equal/es6';

function areObjectsEqual(obj1, obj2) {
  return isEqual(obj1, obj2);
}`,
    },
    // Issue #1533: the scoped fork is the declared dependency, and its React
    // subpath is the second-most used specifier.
    {
      code: `import isEqual from '@blumintinc/fast-deep-equal';

function areObjectsEqual(obj1, obj2) {
  return isEqual(obj1, obj2);
}`,
    },
    {
      code: `import isEqual from '@blumintinc/fast-deep-equal/react';

function arePropsEqual(prev, next) {
  return isEqual(prev, next);
}`,
    },
    // Using microdiff for actual diff analysis (not just equality)
    {
      code: `import { diff } from 'microdiff';

function getConfigChanges(oldConfig, newConfig) {
  const changes = diff(oldConfig, newConfig);
  return changes;
}`,
    },
    // Using microdiff to analyze specific changes
    {
      code: `import { diff } from 'microdiff';

function applyPartialUpdates(oldSettings, newSettings) {
  const changes = diff(oldSettings, newSettings);
  const needsRefresh = changes.some(change =>
    change.path.includes('critical_setting')
  );
  return needsRefresh;
}`,
    },
    // Using microdiff to detect specific types of changes
    {
      code: `import { diff } from 'microdiff';

function detectItemChanges(oldItems, newItems) {
  const changes = diff(oldItems, newItems);
  const addedItems = changes.filter(change => change.type === 'CREATE');
  const removedItems = changes.filter(change => change.type === 'REMOVE');
  const updatedItems = changes.filter(change => change.type === 'UPDATE');
  return { addedItems, removedItems, updatedItems };
}`,
    },
    // Using microdiff to check if changes exist (not equality)
    {
      code: `import { diff } from 'microdiff';

function hasConfigChanged(oldConfig, newConfig) {
  return diff(oldConfig, newConfig).length > 0;
}`,
    },
    // Do not flag when variable is used beyond length equality (for-of)
    {
      code: `import diff from 'microdiff';

function processChanges(a, b) {
  const changes = diff(a, b);
  const isEqual = changes.length === 0;
  for (const change of changes) {
    if (change.type === 'CREATE') return false;
  }
  return isEqual;
}`,
    },
    // Do not flag when comparing to non-zero literal
    {
      code: `import diff from 'microdiff';

function hasOneChange(a, b) {
  const changes = diff(a, b);
  return changes.length === 1;
}`,
    },
    // Do not flag when variable is reassigned later
    {
      code: `import diff from 'microdiff';

function maybeEqual(a, b) {
  let changes = diff(a, b);
  changes = [];
  return changes.length === 0;
}`,
    },
    // Do not flag when microdiff is not imported (local function named diff)
    {
      code: `
function diff(a, b) {
  return [{ a, b }];
}

function isSame(a, b) {
  const changes = diff(a, b);
  return changes.length === 0;
}
`,
    },
    // Issue #1415: every violation suppressed inline leaves the file untouched
    {
      name: 'all violations disabled inline report nothing',
      code: `import { diff } from 'microdiff';

function areSame(a, b) {
  // eslint-disable-next-line fast-deep-equal-over-microdiff
  return diff(a, b).length === 0;
}

function areDifferent(a, b) {
  // eslint-disable-next-line fast-deep-equal-over-microdiff
  return diff(a, b).length !== 0;
}`,
    },
    // Issue #1415: a block disable naming this rule suppresses the whole file
    {
      name: 'block disable naming this rule suppresses the whole file',
      code: `/* eslint-disable fast-deep-equal-over-microdiff */
import { diff } from 'microdiff';

function areSame(a, b) {
  return diff(a, b).length === 0;
}

function areDifferent(a, b) {
  return diff(a, b).length !== 0;
}`,
    },
    // Issue #1415: a bare block disable suppresses every rule
    {
      name: 'bare block disable suppresses the whole file',
      code: `/* eslint-disable */
import { diff } from 'microdiff';

function areSame(a, b) {
  return diff(a, b).length === 0;
}`,
    },
    // Issue #1415: a bare line disable suppresses this rule too
    {
      name: 'bare eslint-disable-next-line suppresses this rule',
      code: `import { diff } from 'microdiff';

function areSame(a, b) {
  // eslint-disable-next-line
  return diff(a, b).length === 0;
}`,
    },
    // ------------------------------------------------------------------
    // Issue #1532: the scoped fork is microdiff too, so every shape the
    // unscoped specifier declines must stay declined under the scoped one —
    // and an import that binds no diff function is not microdiff's presence.
    // ------------------------------------------------------------------
    {
      name: 'the scoped fork used for diff analysis is not an equality check',
      code: `import diff from '@blumintinc/microdiff';

function getConfigChanges(oldConfig, newConfig) {
  const changes = diff(oldConfig, newConfig);
  return changes;
}`,
    },
    {
      name: 'the scoped fork compared against a non-zero length is left alone',
      code: `import diff from '@blumintinc/microdiff';

function hasConfigChanged(oldConfig, newConfig) {
  return diff(oldConfig, newConfig).length > 0;
}`,
    },
    {
      name: 'a scoped variable read beyond its length is left alone',
      code: `import diff from '@blumintinc/microdiff';

function processChanges(a, b) {
  const changes = diff(a, b);
  const same = changes.length === 0;
  for (const change of changes) {
    if (change.type === 'CREATE') return false;
  }
  return same;
}`,
    },
    // The specifier alone proves nothing: microdiff's named exports are types,
    // so a file importing only `Difference` binds no callable `diff` and its
    // own `diff` helper is unrelated to the library.
    {
      name: 'importing only the Difference type binds no diff function',
      code: `import { Difference } from '@blumintinc/microdiff';

function diff(a, b): Difference[] {
  return [{ type: 'CREATE', path: [], value: [a, b] }] as Difference[];
}

function isSame(a, b) {
  return diff(a, b).length === 0;
}`,
    },
    {
      name: 'a type-only Difference import binds no diff function',
      code: `import type { Difference } from '@blumintinc/microdiff';

function diff(a, b): Difference[] {
  return [] as Difference[];
}

function isSame(a, b) {
  const changes = diff(a, b);
  return changes.length === 0;
}`,
    },
    // A type-only import binds nothing in value space, so the same name is
    // free for a local function — and that local call is not microdiff's.
    {
      name: 'a type-only diff import leaves the name free for a local function',
      code: `import type diff from '@blumintinc/microdiff';

export type Differ = typeof diff;

export function isSame(a, b) {
  const diff = (x, y) => [{ x, y }];
  return diff(a, b).length === 0;
}`,
    },
    // A namespace import is deliberately out of scope: the local name is the
    // module, not the diff function, and inferring a call through it would
    // report on member calls this rule cannot prove are microdiff's.
    {
      name: 'a namespace import of the scoped fork is not flagged',
      code: `import * as microdiff from '@blumintinc/microdiff';

function isSame(a, b) {
  return microdiff.default(a, b).length === 0;
}`,
    },
    {
      name: 'a namespace import of upstream microdiff is not flagged',
      code: `import * as microdiff from 'microdiff';

function isSame(a, b) {
  return microdiff.default(a, b).length === 0;
}`,
    },
    // Issue #1825: unwrapping the ChainExpression must not widen the arms past
    // the carve-outs the unchained spelling already respects.
    {
      name: 'an optional-chained length compared to a non-zero literal is not flagged',
      code: `import diff from 'microdiff';

function hasOneChange(a, b) {
  const changes = diff(a, b);
  return changes?.length === 1;
}`,
    },
    {
      name: 'an optional-chained length check is not flagged when the diff itself is read',
      code: `import diff from 'microdiff';

function summarize(a, b) {
  const changes = diff(a, b);
  if (changes?.length === 0) {
    return [];
  }
  return changes;
}`,
    },
    {
      name: 'an optional-chained length ordering comparison is not flagged',
      code: `import diff from 'microdiff';

function hasChanged(a, b) {
  return diff(a, b)?.length > 0;
}`,
    },
    {
      name: 'an optional-chained computed length access is not flagged',
      code: `import diff from 'microdiff';

function areSame(a, b) {
  const changes = diff(a, b);
  return changes?.['length'] === 0;
}`,
    },
    {
      name: 'an optional-chained length check on a reassigned variable is not flagged',
      code: `import diff from 'microdiff';

function maybeEqual(a, b) {
  let changes = diff(a, b);
  changes = [];
  return changes?.length === 0;
}`,
    },
    {
      name: 'an optional-chained length check on a local diff is not flagged',
      code: `
function diff(a, b) {
  return [{ a, b }];
}

function isSame(a, b) {
  const changes = diff(a, b);
  return changes?.length === 0;
}
`,
    },
  ],
  invalid: [
    // Using microdiff for equality check with .length === 0
    {
      code: `import { diff } from 'microdiff';

function areObjectsEqual(obj1, obj2) {
  return diff(obj1, obj2).length === 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import isEqual from '@blumintinc/fast-deep-equal';

function areObjectsEqual(obj1, obj2) {
  return isEqual(obj1, obj2);
}`,
    },
    // Using microdiff for equality check with .length == 0
    {
      code: `import { diff } from 'microdiff';

function areObjectsEqual(obj1, obj2) {
  return diff(obj1, obj2).length == 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import isEqual from '@blumintinc/fast-deep-equal';

function areObjectsEqual(obj1, obj2) {
  return isEqual(obj1, obj2);
}`,
    },
    // Using microdiff for inequality check with .length !== 0
    {
      code: `import { diff } from 'microdiff';

function objectsAreDifferent(obj1, obj2) {
  return diff(obj1, obj2).length !== 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import isEqual from '@blumintinc/fast-deep-equal';

function objectsAreDifferent(obj1, obj2) {
  return !isEqual(obj1, obj2);
}`,
    },
    // Using microdiff for inequality check with .length != 0
    {
      code: `import { diff } from 'microdiff';

function objectsAreDifferent(obj1, obj2) {
  return diff(obj1, obj2).length != 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import isEqual from '@blumintinc/fast-deep-equal';

function objectsAreDifferent(obj1, obj2) {
  return !isEqual(obj1, obj2);
}`,
    },
    // Using microdiff with !diff(...).length
    {
      code: `import { diff } from 'microdiff';

function areObjectsEqual(obj1, obj2) {
  return !diff(obj1, obj2).length;
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import isEqual from '@blumintinc/fast-deep-equal';

function areObjectsEqual(obj1, obj2) {
  return isEqual(obj1, obj2);
}`,
    },
    // Using microdiff in if statement condition
    {
      code: `import { diff } from 'microdiff';

function updateIfNeeded(obj1, obj2) {
  if (diff(obj1, obj2).length === 0) {
    return false;
  }
  return true;
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import isEqual from '@blumintinc/fast-deep-equal';

function updateIfNeeded(obj1, obj2) {
  if (isEqual(obj1, obj2)) {
    return false;
  }
  return true;
}`,
    },
    // Using microdiff in if statement with !diff(...).length
    {
      code: `import { diff } from 'microdiff';

function updateIfNeeded(obj1, obj2) {
  if (!diff(obj1, obj2).length) {
    return false;
  }
  return true;
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import isEqual from '@blumintinc/fast-deep-equal';

function updateIfNeeded(obj1, obj2) {
  if (isEqual(obj1, obj2)) {
    return false;
  }
  return true;
}`,
    },
    // Using microdiff with existing fast-deep-equal import
    {
      code: `import { diff } from 'microdiff';
import isEqual from '@blumintinc/fast-deep-equal';

function areObjectsEqual(obj1, obj2) {
  return diff(obj1, obj2).length === 0;
}

function objectsAreTheSame(obj1, obj2) {
  return isEqual(obj1, obj2);
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import isEqual from '@blumintinc/fast-deep-equal';

function areObjectsEqual(obj1, obj2) {
  return isEqual(obj1, obj2);
}

function objectsAreTheSame(obj1, obj2) {
  return isEqual(obj1, obj2);
}`,
    },
    // Using microdiff with renamed import
    {
      code: `import { diff as compareObjects } from 'microdiff';

function areObjectsEqual(obj1, obj2) {
  return compareObjects(obj1, obj2).length === 0;
}`,
      errors: [
        {
          messageId: 'useFastDeepEqual',
          data: messageData('compareObjects'),
        },
      ],
      output: `import isEqual from '@blumintinc/fast-deep-equal';

function areObjectsEqual(obj1, obj2) {
  return isEqual(obj1, obj2);
}`,
    },
    // Using microdiff with renamed fast-deep-equal import
    {
      code: `import { diff } from 'microdiff';
import deepEqual from '@blumintinc/fast-deep-equal';

function areObjectsEqual(obj1, obj2) {
  return diff(obj1, obj2).length === 0;
}`,
      errors: [
        {
          messageId: 'useFastDeepEqual',
          data: messageData('diff', 'deepEqual'),
        },
      ],
      output: `import deepEqual from '@blumintinc/fast-deep-equal';

function areObjectsEqual(obj1, obj2) {
  return deepEqual(obj1, obj2);
}`,
    },
    // Default import of microdiff, direct inline equality
    {
      code: `import diff from 'microdiff';

function areObjectsEqual(a, b) {
  return diff(a, b).length === 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import isEqual from '@blumintinc/fast-deep-equal';

function areObjectsEqual(a, b) {
  return isEqual(a, b);
}`,
    },
    // Variable assignment with arbitrary name, then equality check
    {
      code: `import diff from 'microdiff';

function areObjectsEqual(a, b) {
  const changes = diff(a, b);
  return changes.length === 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import isEqual from '@blumintinc/fast-deep-equal';

function areObjectsEqual(a, b) {
  return isEqual(a, b);
}`,
    },
    // Variable assignment with different name, used in if condition
    {
      code: `import diff from 'microdiff';

function doSomething(before, after) {
  const differences = diff(before, after);
  if (differences.length === 0) {
    return;
  }
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import isEqual from '@blumintinc/fast-deep-equal';

function doSomething(before, after) {
  if (isEqual(before, after)) {
    return;
  }
}`,
    },
    // Unary usage on variable: !changes.length
    {
      code: `import diff from 'microdiff';

function areSame(x, y) {
  const changes = diff(x, y);
  return !changes.length;
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import isEqual from '@blumintinc/fast-deep-equal';

function areSame(x, y) {
  return isEqual(x, y);
}`,
    },
    // Symmetric literal comparison: 0 === diff(...).length
    {
      code: `import diff from 'microdiff';

function eq(a, b) {
  return 0 === diff(a, b).length;
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import isEqual from '@blumintinc/fast-deep-equal';

function eq(a, b) {
  return isEqual(a, b);
}`,
    },
    // Multiple occurrences in the same file should add a single import
    {
      code: `import diff from 'microdiff';

function checkAll(prevData, newData, previousMetadataRef, newMetadata) {
  const changesData = diff({ ...prevData }, { ...newData });
  const isDataEqual = changesData.length === 0;

  const changesMetadata = diff(
    { ...previousMetadataRef.current },
    { ...newMetadata },
  );
  const isMetadataEqual = changesMetadata.length === 0;

  return isDataEqual && isMetadataEqual;
}`,
      errors: [
        { messageId: 'useFastDeepEqual', data: messageData() },
        { messageId: 'useFastDeepEqual', data: messageData() },
      ],
      output: `import isEqual from '@blumintinc/fast-deep-equal';

function checkAll(prevData, newData, previousMetadataRef, newMetadata) {
  const isDataEqual = isEqual({ ...prevData }, { ...newData });

  const isMetadataEqual = isEqual(
    { ...previousMetadataRef.current },
    { ...newMetadata },
  );

  return isDataEqual && isMetadataEqual;
}`,
    },
    // Variable-based inequality check using changes.length !== 0
    {
      code: `import diff from 'microdiff';

function objectsAreDifferent(obj1, obj2) {
  const changes = diff(obj1, obj2);
  return changes.length !== 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import isEqual from '@blumintinc/fast-deep-equal';

function objectsAreDifferent(obj1, obj2) {
  return !isEqual(obj1, obj2);
}`,
    },
    // Variable-based equality check with literal on left side
    {
      code: `import diff from 'microdiff';

function eq(a, b) {
  const changes = diff(a, b);
  return 0 === changes.length;
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import isEqual from '@blumintinc/fast-deep-equal';

function eq(a, b) {
  return isEqual(a, b);
}`,
    },
    // Unary variable check !changes.length
    {
      code: `import diff from 'microdiff';

function areSame(x, y) {
  const changes = diff(x, y);
  return !changes.length;
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import isEqual from '@blumintinc/fast-deep-equal';

function areSame(x, y) {
  return isEqual(x, y);
}`,
    },
    // Multiline diff call formatting
    {
      code: `import diff from 'microdiff';

function eq(a, b) {
  return diff(
    { ...a },
    { ...b },
  ).length === 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual' }],
      output: `import isEqual from '@blumintinc/fast-deep-equal';

function eq(a, b) {
  return isEqual(
    { ...a },
    { ...b },
  );
}`,
    },
    // ------------------------------------------------------------------
    // Issue #1442: the fix must not destroy anything between the arguments.
    // Re-emitting the argument list dropped every comment inside the call, and
    // an `eslint-disable` directive dropped that way silently re-enables the
    // rule it was suppressing.
    // ------------------------------------------------------------------
    {
      name: 'a directive between the paren and the first argument survives',
      code: `import diff from 'microdiff';

function areEqual(a, b) {
  return diff(
    // eslint-disable-next-line no-console
    console.log(a),
    b,
  ).length === 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import isEqual from '@blumintinc/fast-deep-equal';

function areEqual(a, b) {
  return isEqual(
    // eslint-disable-next-line no-console
    console.log(a),
    b,
  );
}`,
    },
    {
      name: 'a comment between the two arguments survives',
      code: `import diff from 'microdiff';

function eq(a, b) {
  return diff(
    { ...a },
    // eslint-disable-next-line no-console
    { ...b },
  ).length === 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import isEqual from '@blumintinc/fast-deep-equal';

function eq(a, b) {
  return isEqual(
    { ...a },
    // eslint-disable-next-line no-console
    { ...b },
  );
}`,
    },
    {
      name: 'a trailing comment after the second argument survives',
      code: `import diff from 'microdiff';

function eq(a, b) {
  return diff(
    a,
    b, // compare by value
  ).length === 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import isEqual from '@blumintinc/fast-deep-equal';

function eq(a, b) {
  return isEqual(
    a,
    b, // compare by value
  );
}`,
    },
    {
      name: 'the inequality form keeps its inline comments',
      code: `import diff from 'microdiff';

function ne(a, b) {
  return diff(
    a, /* left */
    b, /* right */
  ).length !== 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import isEqual from '@blumintinc/fast-deep-equal';

function ne(a, b) {
  return !isEqual(
    a, /* left */
    b, /* right */
  );
}`,
    },
    {
      name: 'a comment inside a nested object argument survives',
      code: `import diff from 'microdiff';

function eq(a, b) {
  return diff(
    {
      // eslint-disable-next-line no-console
      id: a.id,
    },
    b,
  ).length === 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import isEqual from '@blumintinc/fast-deep-equal';

function eq(a, b) {
  return isEqual(
    {
      // eslint-disable-next-line no-console
      id: a.id,
    },
    b,
  );
}`,
    },
    {
      name: 'a single-line comment between arguments survives',
      code: `import diff from 'microdiff';

function eq(a, b) {
  return diff(a, /* by value */ b).length === 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import isEqual from '@blumintinc/fast-deep-equal';

function eq(a, b) {
  return isEqual(a, /* by value */ b);
}`,
    },
    {
      name: 'a comment between the callee and the argument list survives',
      code: `import diff from 'microdiff';

function eq(a, b) {
  return diff /* deep */ (a, b).length === 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import isEqual from '@blumintinc/fast-deep-equal';

function eq(a, b) {
  return isEqual /* deep */ (a, b);
}`,
    },
    {
      name: 'the unary form keeps its inline comments',
      code: `import diff from 'microdiff';

function eq(a, b) {
  return !diff(
    // eslint-disable-next-line no-console
    console.log(a),
    b,
  ).length;
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import isEqual from '@blumintinc/fast-deep-equal';

function eq(a, b) {
  return isEqual(
    // eslint-disable-next-line no-console
    console.log(a),
    b,
  );
}`,
    },
    {
      name: 'the literal-on-the-left form keeps its inline comments',
      code: `import diff from 'microdiff';

function eq(a, b) {
  return 0 === diff(a, /* by value */ b).length;
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import isEqual from '@blumintinc/fast-deep-equal';

function eq(a, b) {
  return isEqual(a, /* by value */ b);
}`,
    },
    {
      // The call moves to the comparison's position here, so its text is
      // re-emitted; slicing it verbatim still carries the comments along.
      name: 'a comment inside a hoisted diff variable survives the inlining',
      code: `import diff from 'microdiff';

function checkAll(previousMetadataRef, newMetadata) {
  const changesMetadata = diff(
    // eslint-disable-next-line no-console
    { ...previousMetadataRef.current },
    { ...newMetadata },
  );
  return changesMetadata.length === 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import isEqual from '@blumintinc/fast-deep-equal';

function checkAll(previousMetadataRef, newMetadata) {
  return isEqual(
    // eslint-disable-next-line no-console
    { ...previousMetadataRef.current },
    { ...newMetadata },
  );
}`,
    },
    // ------------------------------------------------------------------
    // Issue #1415: the `import isEqual from '@blumintinc/fast-deep-equal'` fix must ride
    // on the first *surviving* violation. A suppressed violation used to claim
    // the carrier slot and take the import down with it, emitting `isEqual(…)`
    // calls that reference an unbound identifier.
    // ------------------------------------------------------------------
    {
      name: 'disable on the FIRST violation still lands the import',
      code: `import { diff } from 'microdiff';

function areSame(a, b) {
  // eslint-disable-next-line fast-deep-equal-over-microdiff
  return diff(a, b).length === 0;
}

function areDifferent(a, b) {
  return diff(a, b).length !== 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import { diff } from 'microdiff';
import isEqual from '@blumintinc/fast-deep-equal';

function areSame(a, b) {
  // eslint-disable-next-line fast-deep-equal-over-microdiff
  return diff(a, b).length === 0;
}

function areDifferent(a, b) {
  return !isEqual(a, b);
}`,
    },
    {
      name: 'disable on a MIDDLE violation keeps one import and both other rewrites',
      code: `import { diff } from 'microdiff';

function first(a, b) {
  return diff(a, b).length === 0;
}

function second(a, b) {
  // eslint-disable-next-line fast-deep-equal-over-microdiff
  return diff(a, b).length === 0;
}

function third(a, b) {
  return diff(a, b).length !== 0;
}`,
      errors: [
        { messageId: 'useFastDeepEqual', data: messageData() },
        { messageId: 'useFastDeepEqual', data: messageData() },
      ],
      output: `import { diff } from 'microdiff';
import isEqual from '@blumintinc/fast-deep-equal';

function first(a, b) {
  return isEqual(a, b);
}

function second(a, b) {
  // eslint-disable-next-line fast-deep-equal-over-microdiff
  return diff(a, b).length === 0;
}

function third(a, b) {
  return !isEqual(a, b);
}`,
    },
    {
      name: 'disable on the LAST violation keeps one import and both other rewrites',
      code: `import { diff } from 'microdiff';

function first(a, b) {
  return diff(a, b).length === 0;
}

function second(a, b) {
  return diff(a, b).length !== 0;
}

function third(a, b) {
  // eslint-disable-next-line fast-deep-equal-over-microdiff
  return diff(a, b).length === 0;
}`,
      errors: [
        { messageId: 'useFastDeepEqual', data: messageData() },
        { messageId: 'useFastDeepEqual', data: messageData() },
      ],
      output: `import { diff } from 'microdiff';
import isEqual from '@blumintinc/fast-deep-equal';

function first(a, b) {
  return isEqual(a, b);
}

function second(a, b) {
  return !isEqual(a, b);
}

function third(a, b) {
  // eslint-disable-next-line fast-deep-equal-over-microdiff
  return diff(a, b).length === 0;
}`,
    },
    {
      name: 'bare disable on the FIRST violation still lands the import',
      code: `import { diff } from 'microdiff';

function areSame(a, b) {
  // eslint-disable-next-line
  return diff(a, b).length === 0;
}

function areDifferent(a, b) {
  return diff(a, b).length !== 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import { diff } from 'microdiff';
import isEqual from '@blumintinc/fast-deep-equal';

function areSame(a, b) {
  // eslint-disable-next-line
  return diff(a, b).length === 0;
}

function areDifferent(a, b) {
  return !isEqual(a, b);
}`,
    },
    {
      name: 'a disable naming a DIFFERENT rule does not suppress this one',
      code: `import { diff } from 'microdiff';

function areSame(a, b) {
  // eslint-disable-next-line no-console
  return diff(a, b).length === 0;
}

function areDifferent(a, b) {
  return diff(a, b).length !== 0;
}`,
      errors: [
        { messageId: 'useFastDeepEqual', data: messageData() },
        { messageId: 'useFastDeepEqual', data: messageData() },
      ],
      output: `import isEqual from '@blumintinc/fast-deep-equal';

function areSame(a, b) {
  // eslint-disable-next-line no-console
  return isEqual(a, b);
}

function areDifferent(a, b) {
  return !isEqual(a, b);
}`,
    },
    {
      name: 'a disable with a -- description suffix suppresses this rule',
      code: `import { diff } from 'microdiff';

function areSame(a, b) {
  // eslint-disable-next-line fast-deep-equal-over-microdiff -- diff order matters here
  return diff(a, b).length === 0;
}

function areDifferent(a, b) {
  return diff(a, b).length !== 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import { diff } from 'microdiff';
import isEqual from '@blumintinc/fast-deep-equal';

function areSame(a, b) {
  // eslint-disable-next-line fast-deep-equal-over-microdiff -- diff order matters here
  return diff(a, b).length === 0;
}

function areDifferent(a, b) {
  return !isEqual(a, b);
}`,
    },
    {
      name: 'eslint-disable-line suppresses the violation on its own line',
      code: `import { diff } from 'microdiff';

function areSame(a, b) {
  return diff(a, b).length === 0; // eslint-disable-line fast-deep-equal-over-microdiff
}

function areDifferent(a, b) {
  return diff(a, b).length !== 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import { diff } from 'microdiff';
import isEqual from '@blumintinc/fast-deep-equal';

function areSame(a, b) {
  return diff(a, b).length === 0; // eslint-disable-line fast-deep-equal-over-microdiff
}

function areDifferent(a, b) {
  return !isEqual(a, b);
}`,
    },
    {
      name: 'violations after an eslint-enable are fixed and carry the import',
      code: `import { diff } from 'microdiff';

/* eslint-disable fast-deep-equal-over-microdiff */
function areSame(a, b) {
  return diff(a, b).length === 0;
}
/* eslint-enable fast-deep-equal-over-microdiff */

function areDifferent(a, b) {
  return diff(a, b).length !== 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import { diff } from 'microdiff';
import isEqual from '@blumintinc/fast-deep-equal';

/* eslint-disable fast-deep-equal-over-microdiff */
function areSame(a, b) {
  return diff(a, b).length === 0;
}
/* eslint-enable fast-deep-equal-over-microdiff */

function areDifferent(a, b) {
  return !isEqual(a, b);
}`,
    },
    {
      name: 'suppressed first violation with fast-deep-equal already imported adds no duplicate import',
      code: `import { diff } from 'microdiff';
import isEqual from '@blumintinc/fast-deep-equal';

function areSame(a, b) {
  // eslint-disable-next-line fast-deep-equal-over-microdiff
  return diff(a, b).length === 0;
}

function areDifferent(a, b) {
  return diff(a, b).length !== 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import { diff } from 'microdiff';
import isEqual from '@blumintinc/fast-deep-equal';

function areSame(a, b) {
  // eslint-disable-next-line fast-deep-equal-over-microdiff
  return diff(a, b).length === 0;
}

function areDifferent(a, b) {
  return !isEqual(a, b);
}`,
    },
    {
      name: 'suppressed first violation with an aliased default import reuses the alias',
      code: `import { diff } from 'microdiff';
import deepEqual from '@blumintinc/fast-deep-equal';

function areSame(a, b) {
  // eslint-disable-next-line fast-deep-equal-over-microdiff
  return diff(a, b).length === 0;
}

function areDifferent(a, b) {
  return diff(a, b).length !== 0;
}`,
      errors: [
        {
          messageId: 'useFastDeepEqual',
          data: messageData('diff', 'deepEqual'),
        },
      ],
      output: `import { diff } from 'microdiff';
import deepEqual from '@blumintinc/fast-deep-equal';

function areSame(a, b) {
  // eslint-disable-next-line fast-deep-equal-over-microdiff
  return diff(a, b).length === 0;
}

function areDifferent(a, b) {
  return !deepEqual(a, b);
}`,
    },
    {
      name: 'suppressed first violation still drops the redundant diff variable of the survivor',
      code: `import diff from 'microdiff';

function areSame(a, b) {
  // eslint-disable-next-line fast-deep-equal-over-microdiff
  return diff(a, b).length === 0;
}

function areDifferent(a, b) {
  const changes = diff(a, b);
  return changes.length !== 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import diff from 'microdiff';
import isEqual from '@blumintinc/fast-deep-equal';

function areSame(a, b) {
  // eslint-disable-next-line fast-deep-equal-over-microdiff
  return diff(a, b).length === 0;
}

function areDifferent(a, b) {
  return !isEqual(a, b);
}`,
    },
    // Issue #1435: a pre-existing `isEqual` binding makes the import unsafe to
    // insert, so the violation is reported without an autofix.
    {
      name: 'a top-scope isEqual binding declines the fix',
      code: `const isEqual = undefined as unknown as never;
import diff from 'microdiff';

function eq(a, b) {
  return 0 === diff(a, b).length;
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `const isEqual = undefined as unknown as never;
import diff from 'microdiff';

function eq(a, b) {
  return 0 === diff(a, b).length;
}`,
    },
    // Issue #1435: a narrower-scope shadow raises no TypeScript diagnostic, so
    // the emitted call would silently bind to the local value.
    {
      name: 'a function-scoped isEqual shadow declines the fix',
      code: `import diff from 'microdiff';

function eq(a, b) {
  const isEqual = a === b;
  return diff(a, b).length === 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import diff from 'microdiff';

function eq(a, b) {
  const isEqual = a === b;
  return diff(a, b).length === 0;
}`,
    },
    {
      name: 'an isEqual parameter shadow declines the fix',
      code: `import diff from 'microdiff';

function eq(a, b, isEqual) {
  return !diff(a, b).length;
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import diff from 'microdiff';

function eq(a, b, isEqual) {
  return !diff(a, b).length;
}`,
    },
    // Issue #1435: declining must drop the whole fix, including the removal of
    // the redundant diff variable, rather than leave a half-applied edit.
    {
      name: 'a colliding binding keeps the redundant diff variable in place',
      code: `const isEqual = undefined as unknown as never;
import diff from 'microdiff';

function eq(a, b) {
  const changes = diff(a, b);
  return changes.length === 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `const isEqual = undefined as unknown as never;
import diff from 'microdiff';

function eq(a, b) {
  const changes = diff(a, b);
  return changes.length === 0;
}`,
    },
    // ------------------------------------------------------------------
    // Issue #1448: removing the redundant declaration by *line* boundaries
    // swallowed whatever else sat on that line, including the comparison the
    // same report rewrites. Overlapping fixes make ESLint assert and abort the
    // whole file, so the multi-line shape worked while the one-liner crashed.
    // ------------------------------------------------------------------
    {
      name: 'a single-line declaration and comparison fix without overlapping',
      code: `import diff from 'microdiff';
function f(a, b) { const changes = diff(a, b); return changes.length !== 0; }`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import isEqual from '@blumintinc/fast-deep-equal';
function f(a, b) { return !isEqual(a, b); }`,
    },
    {
      name: 'a single-line declaration keeps every other statement on its line',
      code: `import diff from 'microdiff';
function f(a, b) { const changes = diff(a, b); const same = changes.length === 0; return same; }`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import isEqual from '@blumintinc/fast-deep-equal';
function f(a, b) { const same = isEqual(a, b); return same; }`,
    },
    {
      name: 'the multi-line declaration still takes its whole line with it',
      code: `import diff from 'microdiff';

function areSame(a, b) {
  const label = 'compare';
  const changes = diff(a, b);

  return changes.length === 0 ? label : '';
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import isEqual from '@blumintinc/fast-deep-equal';

function areSame(a, b) {
  const label = 'compare';

  return isEqual(a, b) ? label : '';
}`,
    },
    {
      name: 'a comment between the declaration and the comparison survives',
      code: `import diff from 'microdiff';
function f(a, b) { const changes = diff(a, b); /* keep */ return changes.length === 0; }`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import isEqual from '@blumintinc/fast-deep-equal';
function f(a, b) { /* keep */ return isEqual(a, b); }`,
    },
    {
      name: 'a comment before the declaration on its line survives',
      code: `import diff from 'microdiff';

function f(a, b) {
  /* keep */ const changes = diff(a, b);
  return changes.length === 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import isEqual from '@blumintinc/fast-deep-equal';

function f(a, b) {
  /* keep */
  return isEqual(a, b);
}`,
    },
    {
      name: 'a semicolon-less declaration sharing its line leaves no trailing blanks',
      code: `import diff from 'microdiff';
function f(a, b) { const changes = diff(a, b)
  return changes.length === 0 }`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import isEqual from '@blumintinc/fast-deep-equal';
function f(a, b) {
  return isEqual(a, b) }`,
    },
    {
      // A directive trailing the declaration governs the *next* line, which
      // survives the fix — swallowing it re-enables the rule it suppresses.
      name: 'a directive after the declaration keeps governing the surviving line',
      code: `import diff from 'microdiff';

function f(a, b) {
  const changes = diff(a, b); // eslint-disable-next-line no-console
  return changes.length === 0 && !console.log(a);
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import isEqual from '@blumintinc/fast-deep-equal';

function f(a, b) {
  // eslint-disable-next-line no-console
  return isEqual(a, b) && !console.log(a);
}`,
    },
    {
      // The `;` after a for-init declaration belongs to the ForStatement, so a
      // removal that reaches the end of the line takes the loop apart.
      name: 'a declaration in a for-init is removed without taking the separator',
      code: `import diff from 'microdiff';

function f(a, b) {
  for (let changes = diff(a, b); changes.length !== 0; ) {
    break;
  }
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import isEqual from '@blumintinc/fast-deep-equal';

function f(a, b) {
  for (; !isEqual(a, b); ) {
    break;
  }
}`,
    },
    {
      // A diff argument that reads `changes.length` puts the comparison inside
      // the declaration the fix wants to delete, so no pair of disjoint edits
      // exists. Reporting without a fix beats aborting the file.
      name: 'a comparison nested in the declaration it would delete reports without a fix',
      code: `import diff from 'microdiff';
function f(a) { const changes = diff(a, changes.length === 0); }`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import diff from 'microdiff';
function f(a) { const changes = diff(a, changes.length === 0); }`,
    },
    {
      name: 'a nested comparison declines the fix in the multi-line shape too',
      code: `import diff from 'microdiff';

function f(a) {
  const changes = diff(
    a,
    changes.length === 0,
  );
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import diff from 'microdiff';

function f(a) {
  const changes = diff(
    a,
    changes.length === 0,
  );
}`,
    },
    {
      // Issue #1415's invariant applies to this decline too: a violation that
      // emits no fix must not consume the import-carrier slot.
      name: 'a declining nested comparison still lets another violation carry the import',
      code: `import diff from 'microdiff';

function nested(a) {
  const changes = diff(a, changes.length === 0);
}

function clean(a, b) {
  return diff(a, b).length !== 0;
}`,
      errors: [
        { messageId: 'useFastDeepEqual', data: messageData() },
        { messageId: 'useFastDeepEqual', data: messageData() },
      ],
      output: `import diff from 'microdiff';
import isEqual from '@blumintinc/fast-deep-equal';

function nested(a) {
  const changes = diff(a, changes.length === 0);
}

function clean(a, b) {
  return !isEqual(a, b);
}`,
    },
    // Issue #1435: the guard is per violation — a shadow in one function must
    // not disarm the rule for the rest of the file, and the declining violation
    // must not consume the import-carrier slot.
    {
      name: 'a shadow in one function still lets another violation carry the import',
      code: `import diff from 'microdiff';

function shadowed(a, b) {
  const isEqual = a === b;
  return diff(a, b).length === 0;
}

function clean(a, b) {
  return diff(a, b).length !== 0;
}`,
      errors: [
        { messageId: 'useFastDeepEqual', data: messageData() },
        { messageId: 'useFastDeepEqual', data: messageData() },
      ],
      output: `import diff from 'microdiff';
import isEqual from '@blumintinc/fast-deep-equal';

function shadowed(a, b) {
  const isEqual = a === b;
  return diff(a, b).length === 0;
}

function clean(a, b) {
  return !isEqual(a, b);
}`,
    },
    // ------------------------------------------------------------------
    // Issue #1532: `@blumintinc/microdiff` is the specifier the codebase
    // actually depends on, so every shape recognised under the unscoped name
    // has to be recognised under the scoped one — the rule was inert on all of
    // them. Both specifiers are asserted for each shape.
    // ------------------------------------------------------------------
    {
      name: 'the scoped fork is recognised as microdiff',
      code: `import diff from '@blumintinc/microdiff';
export const same = (a: object, b: object) => diff(a, b).length === 0;`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import isEqual from '@blumintinc/fast-deep-equal';
export const same = (a: object, b: object) => isEqual(a, b);`,
    },
    {
      name: 'a scoped named diff import is recognised',
      code: `import { diff } from '@blumintinc/microdiff';

function areObjectsEqual(obj1, obj2) {
  return diff(obj1, obj2).length === 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import isEqual from '@blumintinc/fast-deep-equal';

function areObjectsEqual(obj1, obj2) {
  return isEqual(obj1, obj2);
}`,
    },
    {
      name: 'the scoped fork with a loose equality comparison',
      code: `import diff from '@blumintinc/microdiff';

function areObjectsEqual(obj1, obj2) {
  return diff(obj1, obj2).length == 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import isEqual from '@blumintinc/fast-deep-equal';

function areObjectsEqual(obj1, obj2) {
  return isEqual(obj1, obj2);
}`,
    },
    {
      name: 'the scoped fork with a strict inequality comparison',
      code: `import diff from '@blumintinc/microdiff';

function objectsAreDifferent(obj1, obj2) {
  return diff(obj1, obj2).length !== 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import isEqual from '@blumintinc/fast-deep-equal';

function objectsAreDifferent(obj1, obj2) {
  return !isEqual(obj1, obj2);
}`,
    },
    {
      name: 'the scoped fork with a loose inequality comparison',
      code: `import diff from '@blumintinc/microdiff';

function objectsAreDifferent(obj1, obj2) {
  return diff(obj1, obj2).length != 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import isEqual from '@blumintinc/fast-deep-equal';

function objectsAreDifferent(obj1, obj2) {
  return !isEqual(obj1, obj2);
}`,
    },
    {
      name: 'the scoped fork with the unary length form',
      code: `import diff from '@blumintinc/microdiff';

function areSame(a, b) {
  return !diff(a, b).length;
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import isEqual from '@blumintinc/fast-deep-equal';

function areSame(a, b) {
  return isEqual(a, b);
}`,
    },
    {
      name: 'the scoped fork with the literal on the left',
      code: `import diff from '@blumintinc/microdiff';

function eq(a, b) {
  return 0 === diff(a, b).length;
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import isEqual from '@blumintinc/fast-deep-equal';

function eq(a, b) {
  return isEqual(a, b);
}`,
    },
    {
      name: 'the scoped fork inside an if condition',
      code: `import diff from '@blumintinc/microdiff';

function updateIfNeeded(obj1, obj2) {
  if (diff(obj1, obj2).length === 0) {
    return false;
  }
  return true;
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import isEqual from '@blumintinc/fast-deep-equal';

function updateIfNeeded(obj1, obj2) {
  if (isEqual(obj1, obj2)) {
    return false;
  }
  return true;
}`,
    },
    {
      name: 'a hoisted scoped diff variable measured once is inlined and dropped',
      code: `import diff from '@blumintinc/microdiff';

function areSame(a, b) {
  const changes = diff(a, b);
  return changes.length === 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import isEqual from '@blumintinc/fast-deep-equal';

function areSame(a, b) {
  return isEqual(a, b);
}`,
    },
    // agora's actual import shape: the diff function plus its Difference type.
    {
      name: 'a scoped default import beside a named type import is recognised',
      code: `import diff, { Difference } from '@blumintinc/microdiff';

export function isSame(a: object, b: object) {
  const changes: Difference[] = diff(a, b);
  return changes.length === 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import isEqual from '@blumintinc/fast-deep-equal';

export function isSame(a: object, b: object) {
  return isEqual(a, b);
}`,
    },
    // An aliased default import: the report names the local alias, and the fix
    // rewrites the call under that name.
    {
      name: 'an aliased default import of the scoped fork is recognised',
      code: `import compareDeep from '@blumintinc/microdiff';

function areSame(a, b) {
  return compareDeep(a, b).length === 0;
}`,
      errors: [
        { messageId: 'useFastDeepEqual', data: messageData('compareDeep') },
      ],
      output: `import isEqual from '@blumintinc/fast-deep-equal';

function areSame(a, b) {
  return isEqual(a, b);
}`,
    },
    {
      name: 'an aliased default import of upstream microdiff is recognised',
      code: `import compareDeep from 'microdiff';

function areSame(a, b) {
  return compareDeep(a, b).length === 0;
}`,
      errors: [
        { messageId: 'useFastDeepEqual', data: messageData('compareDeep') },
      ],
      output: `import isEqual from '@blumintinc/fast-deep-equal';

function areSame(a, b) {
  return isEqual(a, b);
}`,
    },
    {
      name: 'an aliased named import of the scoped fork is recognised',
      code: `import { diff as compareObjects } from '@blumintinc/microdiff';

function areObjectsEqual(obj1, obj2) {
  const changes = compareObjects(obj1, obj2);
  return changes.length === 0;
}`,
      errors: [
        { messageId: 'useFastDeepEqual', data: messageData('compareObjects') },
      ],
      output: `import isEqual from '@blumintinc/fast-deep-equal';

function areObjectsEqual(obj1, obj2) {
  return isEqual(obj1, obj2);
}`,
    },
    {
      name: 'an existing aliased fast-deep-equal import is reused for the scoped fork',
      code: `import diff from '@blumintinc/microdiff';
import deepEqual from '@blumintinc/fast-deep-equal';

function areObjectsEqual(obj1, obj2) {
  return diff(obj1, obj2).length === 0;
}`,
      errors: [
        {
          messageId: 'useFastDeepEqual',
          data: messageData('diff', 'deepEqual'),
        },
      ],
      output: `import deepEqual from '@blumintinc/fast-deep-equal';

function areObjectsEqual(obj1, obj2) {
  return deepEqual(obj1, obj2);
}`,
    },
    // The inserted import is anchored on the microdiff declaration, which the
    // scoped specifier has to match or the import lands on the wrong statement.
    // The same fix deletes that declaration, so the new import takes over its
    // position rather than following it: an insertion point inside a deleted
    // span is an overlap ESLint rejects, discarding every message for the file.
    {
      name: 'the inserted import takes the place of the scoped microdiff declaration',
      code: `import diff from '@blumintinc/microdiff';
import { helper } from './helper';

function areSame(a, b) {
  return helper(diff(a, b).length === 0);
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import isEqual from '@blumintinc/fast-deep-equal';
import { helper } from './helper';

function areSame(a, b) {
  return helper(isEqual(a, b));
}`,
    },
    // Issue #1533: the emitted specifier has to name the package this codebase
    // depends on. Only '@blumintinc/fast-deep-equal' is declared, so an
    // unscoped emission is an unresolvable import (TS2307) on every fixed file.
    {
      name: 'the emitted import names the scoped fast-deep-equal package',
      code: `import diff from '@blumintinc/microdiff';

function areSame(a, b) {
  return diff(a, b).length === 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import isEqual from '@blumintinc/fast-deep-equal';

function areSame(a, b) {
  return isEqual(a, b);
}`,
    },
    // Each recognised specifier, as an import the file already has: the fix
    // reuses that binding instead of adding a second import of the same
    // function, and never declines for want of recognising it.
    {
      name: 'an existing scoped fast-deep-equal import is reused, not duplicated',
      code: `import diff from '@blumintinc/microdiff';
import isEqual from '@blumintinc/fast-deep-equal';

function areSame(a, b) {
  return diff(a, b).length === 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import isEqual from '@blumintinc/fast-deep-equal';

function areSame(a, b) {
  return isEqual(a, b);
}`,
    },
    {
      name: 'an existing /react subpath import is reused, not duplicated',
      code: `import diff from '@blumintinc/microdiff';
import isEqual from '@blumintinc/fast-deep-equal/react';

function areSame(a, b) {
  return diff(a, b).length !== 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import isEqual from '@blumintinc/fast-deep-equal/react';

function areSame(a, b) {
  return !isEqual(a, b);
}`,
    },
    {
      name: 'an existing unscoped fast-deep-equal import is reused, not duplicated',
      code: `import diff from '@blumintinc/microdiff';
import isEqual from 'fast-deep-equal';

function areSame(a, b) {
  return diff(a, b).length === 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import isEqual from 'fast-deep-equal';

function areSame(a, b) {
  return isEqual(a, b);
}`,
    },
    {
      name: 'an existing fast-deep-equal/es6 import is reused, not duplicated',
      code: `import diff from '@blumintinc/microdiff';
import isEqual from 'fast-deep-equal/es6';

function areSame(a, b) {
  return diff(a, b).length === 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import isEqual from 'fast-deep-equal/es6';

function areSame(a, b) {
  return isEqual(a, b);
}`,
    },
    {
      name: 'an aliased scoped fast-deep-equal import supplies the emitted name',
      code: `import diff from '@blumintinc/microdiff';
import deepEqual from '@blumintinc/fast-deep-equal';

function areSame(a, b) {
  return diff(a, b).length === 0;
}`,
      errors: [
        {
          messageId: 'useFastDeepEqual',
          data: messageData('diff', 'deepEqual'),
        },
      ],
      output: `import deepEqual from '@blumintinc/fast-deep-equal';

function areSame(a, b) {
  return deepEqual(a, b);
}`,
    },
    {
      name: 'an aliased /react subpath import supplies the emitted name',
      code: `import diff from '@blumintinc/microdiff';
import deepEqual from '@blumintinc/fast-deep-equal/react';

function areSame(a, b) {
  return diff(a, b).length === 0;
}`,
      errors: [
        {
          messageId: 'useFastDeepEqual',
          data: messageData('diff', 'deepEqual'),
        },
      ],
      output: `import deepEqual from '@blumintinc/fast-deep-equal/react';

function areSame(a, b) {
  return deepEqual(a, b);
}`,
    },
    // A recognised specifier is not by itself a usable equality function: these
    // two shapes bind no callable, so the emitted call still needs its own
    // import or it names nothing.
    {
      name: 'a side-effect-only fast-deep-equal import still gets a real import',
      code: `import diff from '@blumintinc/microdiff';
import '@blumintinc/fast-deep-equal';

function areSame(a, b) {
  return diff(a, b).length === 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import isEqual from '@blumintinc/fast-deep-equal';
import '@blumintinc/fast-deep-equal';

function areSame(a, b) {
  return isEqual(a, b);
}`,
    },
    {
      name: 'a namespace fast-deep-equal import still gets a default import',
      code: `import diff from '@blumintinc/microdiff';
import * as fastDeepEqual from '@blumintinc/fast-deep-equal';

function areSame(a, b) {
  return fastDeepEqual && diff(a, b).length === 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import isEqual from '@blumintinc/fast-deep-equal';
import * as fastDeepEqual from '@blumintinc/fast-deep-equal';

function areSame(a, b) {
  return fastDeepEqual && isEqual(a, b);
}`,
    },
    // Issue #1825: `?.` interposes a ChainExpression between the operand and
    // the comparison, which the BinaryExpression arm did not unwrap — so every
    // comparison spelling below reported nothing at all, while the unary arm
    // (which already unwrapped) kept firing. `diff()` returns an array, so the
    // optional branch is dead and the remedy is the same call it is without the
    // `?.`.
    {
      name: 'an optional-chained length on a diff variable is flagged (issue #1825)',
      code: `import diff from 'microdiff';

function areObjectsEqual(a, b) {
  const changes = diff(a, b);
  return changes?.length === 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import isEqual from '@blumintinc/fast-deep-equal';

function areObjectsEqual(a, b) {
  return isEqual(a, b);
}`,
    },
    {
      name: 'an optional-chained length on the diff call itself is flagged (issue #1825)',
      code: `import diff from 'microdiff';

function areObjectsEqual(a, b) {
  return diff(a, b)?.length === 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import isEqual from '@blumintinc/fast-deep-equal';

function areObjectsEqual(a, b) {
  return isEqual(a, b);
}`,
    },
    {
      name: 'an optional-chained length inequality is flagged (issue #1825)',
      code: `import diff from 'microdiff';

function objectsAreDifferent(a, b) {
  const changes = diff(a, b);
  return changes?.length !== 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import isEqual from '@blumintinc/fast-deep-equal';

function objectsAreDifferent(a, b) {
  return !isEqual(a, b);
}`,
    },
    {
      name: 'an optional-chained length with the literal on the left is flagged (issue #1825)',
      code: `import diff from 'microdiff';

function eq(a, b) {
  const changes = diff(a, b);
  return 0 === changes?.length;
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import isEqual from '@blumintinc/fast-deep-equal';

function eq(a, b) {
  return isEqual(a, b);
}`,
    },
    {
      name: 'an optional-chained length in an if test is flagged (issue #1825)',
      code: `import diff from 'microdiff';

function doSomething(before, after) {
  const changes = diff(before, after);
  if (changes?.length === 0) {
    return;
  }
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import isEqual from '@blumintinc/fast-deep-equal';

function doSomething(before, after) {
  if (isEqual(before, after)) {
    return;
  }
}`,
    },
    // The unary arm already reported on this shape, but `getLengthIdentifierFromNode`
    // read `node.argument` unwrapped, so `findRedundantDeclaration` never
    // matched and the fix left a dead `const changes = diff(a, b);` behind.
    {
      name: 'an optional-chained unary length check also drops the redundant declaration (issue #1825)',
      code: `import diff from 'microdiff';

function areSame(x, y) {
  const changes = diff(x, y);
  return !changes?.length;
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import isEqual from '@blumintinc/fast-deep-equal';

function areSame(x, y) {
  return isEqual(x, y);
}`,
    },
    // The optional-call arm. Nobody writes `diff?.(a, b)` against a static
    // import, but the same unwrap reaches it, and the fixer rewrites only the
    // callee token — so the `?.` survives into the output. That is correct
    // (`isEqual` is an import binding, never nullish) and pinned here so the
    // shape is asserted rather than incidental.
    {
      name: 'an optional call to diff is flagged and keeps its optional call (issue #1825)',
      code: `import diff from 'microdiff';

function areObjectsEqual(a, b) {
  return diff?.(a, b).length === 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import isEqual from '@blumintinc/fast-deep-equal';

function areObjectsEqual(a, b) {
  return isEqual?.(a, b);
}`,
    },
    // ------------------------------------------------------------------
    // Issue #1893: the rewrite deletes the microdiff binding's last reference,
    // so the same fix has to unbind it. Leaving the import behind turns a file
    // that lints clean into one that fails `no-unused-vars` — an error in the
    // consumer's CI and a `noUnusedLocals` build failure — and since the fix
    // resolves this rule's own report, nothing re-reports the debt.
    //
    // The mirror shape matters more than the fix itself: an import still read
    // elsewhere must survive, because deleting it unbinds working code.
    // ------------------------------------------------------------------
    {
      name: 'the stranded microdiff import goes with the last reference (issue #1893)',
      code: `import diff from 'microdiff';

export const eq = (a, b) => diff(a, b).length === 0;`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import isEqual from '@blumintinc/fast-deep-equal';

export const eq = (a, b) => isEqual(a, b);`,
    },
    {
      name: 'a microdiff import still read elsewhere survives the fix (issue #1893)',
      code: `import diff from 'microdiff';

export const eq = (a, b) => diff(a, b).length === 0;
export const changesOf = (a, b) => diff(a, b);`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import diff from 'microdiff';
import isEqual from '@blumintinc/fast-deep-equal';

export const eq = (a, b) => isEqual(a, b);
export const changesOf = (a, b) => diff(a, b);`,
    },
    {
      name: 'an aliased microdiff import is unbound under its alias (issue #1893)',
      code: `import d from 'microdiff';

export const eq = (a, b) => d(a, b).length === 0;`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData('d') }],
      output: `import isEqual from '@blumintinc/fast-deep-equal';

export const eq = (a, b) => isEqual(a, b);`,
    },
    {
      name: 'an aliased microdiff import still read elsewhere survives (issue #1893)',
      code: `import d from 'microdiff';

export const eq = (a, b) => d(a, b).length === 0;
export const changesOf = (a, b) => d(a, b);`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData('d') }],
      output: `import d from 'microdiff';
import isEqual from '@blumintinc/fast-deep-equal';

export const eq = (a, b) => isEqual(a, b);
export const changesOf = (a, b) => d(a, b);`,
    },
    // microdiff's other exports are types, so a declaration with more than one
    // specifier is `diff` beside `Difference`. Only the specifier whose last
    // reference the fix deleted may go; the braces stay with the survivor.
    {
      name: 'only the orphaned specifier leaves a shared microdiff import (issue #1893)',
      code: `import diff, { Difference } from '@blumintinc/microdiff';

export type Changes = Difference[];
export const eq = (a, b) => diff(a, b).length === 0;`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import { Difference } from '@blumintinc/microdiff';
import isEqual from '@blumintinc/fast-deep-equal';

export type Changes = Difference[];
export const eq = (a, b) => isEqual(a, b);`,
    },
    {
      name: 'a shared microdiff import goes whole when every specifier is orphaned (issue #1893)',
      code: `import diff, { Difference } from '@blumintinc/microdiff';

export function isSame(a: object, b: object) {
  const changes: Difference[] = diff(a, b);
  return changes.length === 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import isEqual from '@blumintinc/fast-deep-equal';

export function isSame(a: object, b: object) {
  return isEqual(a, b);
}`,
    },
    // The arguments are carried through verbatim rather than deleted, so a
    // binding they mention is still read after the fix. Reading the deleted
    // declaration as the whole of the edit would strip its import — an
    // over-removal strictly worse than the stranded import above.
    {
      name: 'an import read only by the diff arguments survives the inlining (issue #1893)',
      code: `import diff from 'microdiff';
import { normalize } from './normalize';

export function eq(a, b) {
  const changes = diff(normalize(a), b);
  return changes.length === 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import isEqual from '@blumintinc/fast-deep-equal';
import { normalize } from './normalize';

export function eq(a, b) {
  return isEqual(normalize(a), b);
}`,
    },
    // Two comparisons of one microdiff binding: neither rewrite alone strips
    // its last reference, so the unbinding is only visible once both ship in
    // the same fix — which is also what lets the hoisted declaration be deleted
    // once instead of twice.
    {
      name: 'two comparisons unbind the shared microdiff import together (issue #1893)',
      code: `import diff from 'microdiff';

export const eq = (a, b) => diff(a, b).length === 0;
export const ne = (a, b) => diff(a, b).length !== 0;`,
      errors: [
        { messageId: 'useFastDeepEqual', data: messageData() },
        { messageId: 'useFastDeepEqual', data: messageData() },
      ],
      output: `import isEqual from '@blumintinc/fast-deep-equal';

export const eq = (a, b) => isEqual(a, b);
export const ne = (a, b) => !isEqual(a, b);`,
    },
    {
      name: 'two comparisons of one hoisted diff variable drop it once (issue #1893)',
      code: `import diff from 'microdiff';

export function eq(a, b) {
  const changes = diff(a, b);
  return changes.length === 0 && changes.length !== 0;
}`,
      errors: [
        { messageId: 'useFastDeepEqual', data: messageData() },
        { messageId: 'useFastDeepEqual', data: messageData() },
      ],
      output: `import isEqual from '@blumintinc/fast-deep-equal';

export function eq(a, b) {
  return isEqual(a, b) && !isEqual(a, b);
}`,
    },
    // A declaration this rule will not delete — it declares a second variable —
    // leaves `changes` unread once the comparison is rewritten. Rewriting it
    // anyway would orphan `changes` instead of the import, so the whole fix is
    // declined and the report stands on its own.
    {
      name: 'a multi-declarator hoisted diff declines the fix (issue #1893)',
      code: `import diff from 'microdiff';

export function eq(a, b) {
  const changes = diff(a, b), label = 'compare';
  return changes.length === 0 ? label : '';
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: null,
    },
    // The removal helper refuses an import it cannot rewrite cleanly, and that
    // refusal takes the rewrite with it: half of this edit is worse than none.
    {
      name: 'a comment inside the microdiff import declines the fix (issue #1893)',
      code: `import /* deep */ diff from 'microdiff';

export const eq = (a, b) => diff(a, b).length === 0;`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: null,
    },
    {
      name: 'a directive bound to the microdiff import declines the fix (issue #1893)',
      code: `// eslint-disable-next-line no-restricted-imports
import diff from 'microdiff';

export const eq = (a, b) => diff(a, b).length === 0;`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: null,
    },
    // A same-named local elsewhere in the file is the case scope analysis and a
    // text scan can disagree about, so the removal is declined rather than
    // guessed at.
    {
      name: 'a same-named local elsewhere declines the removal (issue #1893)',
      code: `import diff from 'microdiff';

export const eq = (a, b) => diff(a, b).length === 0;

export function report() {
  const diff = 1;
  return diff;
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: null,
    },
  ],
});

// Issue #1415: RuleTester applies a single fix pass and never shows the file
// that `eslint --fix` actually writes. These cases run the real multi-pass
// fixer and assert the invariant the bug violated: an emitted `isEqual(…)`
// call is never left without its import.
describe('fast-deep-equal-over-microdiff: inline disables and the import carrier (issue #1415)', () => {
  const RULE_ID = '@blumintinc/blumint/fast-deep-equal-over-microdiff';
  const IMPORT_LINE = "import isEqual from '@blumintinc/fast-deep-equal';";

  const lint = (code: string) => {
    const linter = new Linter();
    linter.defineParser(
      '@typescript-eslint/parser',
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@typescript-eslint/parser'),
    );
    linter.defineRule(
      RULE_ID,
      fastDeepEqualOverMicrodiff as unknown as Rule.RuleModule,
    );
    // A near-miss neighbour proves rule matching is exact rather than a
    // suffix/substring heuristic.
    linter.defineRule('@blumintinc/blumint/fast-deep-equal-over-microdiff-2', {
      meta: { schema: [] },
      create: () => ({}),
    } as unknown as Rule.RuleModule);
    const config = {
      parser: '@typescript-eslint/parser',
      parserOptions: {
        ecmaVersion: 2020 as const,
        sourceType: 'module' as const,
      },
      rules: { [RULE_ID]: 'error' as const },
    };
    const { output } = linter.verifyAndFix(code, config, 'compare.ts');
    return output;
  };

  const expectNoUnboundIsEqual = (output: string) => {
    if (/\bisEqual\(/.test(output)) {
      expect(output).toContain(IMPORT_LINE);
    }
  };

  it('carries the import on the first surviving violation', () => {
    const output = lint(`import { diff } from 'microdiff';

function areSame(a, b) {
  // eslint-disable-next-line @blumintinc/blumint/fast-deep-equal-over-microdiff
  return diff(a, b).length === 0;
}

function areDifferent(a, b) {
  return diff(a, b).length !== 0;
}
`);

    expect(output).toBe(`import { diff } from 'microdiff';
import isEqual from '@blumintinc/fast-deep-equal';

function areSame(a, b) {
  // eslint-disable-next-line @blumintinc/blumint/fast-deep-equal-over-microdiff
  return diff(a, b).length === 0;
}

function areDifferent(a, b) {
  return !isEqual(a, b);
}
`);
    expectNoUnboundIsEqual(output);
  });

  it('rewrites both polarities across passes with exactly one import', () => {
    const output = lint(`import { diff } from 'microdiff';

function areSame(a, b) {
  // eslint-disable-next-line @blumintinc/blumint/fast-deep-equal-over-microdiff
  return diff(a, b).length === 0;
}

function areDifferent(a, b) {
  return diff(a, b).length !== 0;
}

function alsoSame(a, b) {
  return !diff(a, b).length;
}
`);

    expect(output.match(/isEqual\(/g)).toHaveLength(2);
    expect(output).toContain('return !isEqual(a, b);');
    expect(output).toContain('return isEqual(a, b);');
    expect(
      output.match(/import isEqual from '@blumintinc\/fast-deep-equal';/g),
    ).toHaveLength(1);
    expectNoUnboundIsEqual(output);
  });

  it('adds neither import nor rewrite when every violation is disabled', () => {
    const code = `import { diff } from 'microdiff';

function areSame(a, b) {
  // eslint-disable-next-line @blumintinc/blumint/fast-deep-equal-over-microdiff
  return diff(a, b).length === 0;
}

function areDifferent(a, b) {
  // eslint-disable-next-line @blumintinc/blumint/fast-deep-equal-over-microdiff
  return diff(a, b).length !== 0;
}
`;

    const output = lint(code);

    expect(output).toBe(code);
    expect(output).not.toContain('isEqual');
  });

  it('adds neither import nor rewrite under a whole-file block disable', () => {
    const code = `/* eslint-disable @blumintinc/blumint/fast-deep-equal-over-microdiff */
import { diff } from 'microdiff';

function areSame(a, b) {
  return diff(a, b).length === 0;
}

function areDifferent(a, b) {
  return diff(a, b).length !== 0;
}
`;

    const output = lint(code);

    expect(output).toBe(code);
    expect(output).not.toContain('isEqual');
  });

  it('does not treat a disable for a similarly named rule as its own', () => {
    const output = lint(`import { diff } from 'microdiff';

function areSame(a, b) {
  // eslint-disable-next-line @blumintinc/blumint/fast-deep-equal-over-microdiff-2
  return diff(a, b).length === 0;
}
`);

    expect(output).toBe(`import isEqual from '@blumintinc/fast-deep-equal';

function areSame(a, b) {
  // eslint-disable-next-line @blumintinc/blumint/fast-deep-equal-over-microdiff-2
  return isEqual(a, b);
}
`);
    expectNoUnboundIsEqual(output);
  });

  it('keeps the import when only the last violation survives a block disable', () => {
    const output = lint(`import { diff } from 'microdiff';

/* eslint-disable @blumintinc/blumint/fast-deep-equal-over-microdiff */
function areSame(a, b) {
  return diff(a, b).length === 0;
}

function alsoSame(a, b) {
  return !diff(a, b).length;
}
/* eslint-enable @blumintinc/blumint/fast-deep-equal-over-microdiff */

function areDifferent(a, b) {
  return diff(a, b).length !== 0;
}
`);

    expect(output).toBe(`import { diff } from 'microdiff';
import isEqual from '@blumintinc/fast-deep-equal';

/* eslint-disable @blumintinc/blumint/fast-deep-equal-over-microdiff */
function areSame(a, b) {
  return diff(a, b).length === 0;
}

function alsoSame(a, b) {
  return !diff(a, b).length;
}
/* eslint-enable @blumintinc/blumint/fast-deep-equal-over-microdiff */

function areDifferent(a, b) {
  return !isEqual(a, b);
}
`);
    expectNoUnboundIsEqual(output);
  });

  it('adds no duplicate import when the file already imports fast-deep-equal', () => {
    const output = lint(`import { diff } from 'microdiff';
import isEqual from '@blumintinc/fast-deep-equal';

function areSame(a, b) {
  // eslint-disable-next-line @blumintinc/blumint/fast-deep-equal-over-microdiff
  return diff(a, b).length === 0;
}

function areDifferent(a, b) {
  return diff(a, b).length !== 0;
}
`);

    expect(
      output.match(/import isEqual from '@blumintinc\/fast-deep-equal';/g),
    ).toHaveLength(1);
    expect(output).toContain('return !isEqual(a, b);');
    expectNoUnboundIsEqual(output);
  });

  // Issue #1435: an existing `isEqual` binding makes the import unsafe, and the
  // multi-pass fixer is where the duplicate declaration was actually written.
  it('leaves a file that already binds isEqual untouched', () => {
    const code = `const isEqual = undefined as unknown as never;
import diff from 'microdiff';

function eq(a, b) {
  return 0 === diff(a, b).length;
}
`;

    expect(lint(code)).toBe(code);
  });

  it('carries the import on a violation whose scope has no isEqual shadow', () => {
    const output = lint(`import diff from 'microdiff';

function shadowed(a, b) {
  const isEqual = a === b;
  return diff(a, b).length === 0;
}

function clean(a, b) {
  return diff(a, b).length !== 0;
}
`);

    expect(output).toBe(`import diff from 'microdiff';
import isEqual from '@blumintinc/fast-deep-equal';

function shadowed(a, b) {
  const isEqual = a === b;
  return diff(a, b).length === 0;
}

function clean(a, b) {
  return !isEqual(a, b);
}
`);
    expectNoUnboundIsEqual(output);
  });
});

// Issue #1442: a comment destroyed by the fix is not merely cosmetic — when it
// is an `eslint-disable` directive, the fix silently re-enables the rule it was
// suppressing. RuleTester only compares text, so the suppression itself is
// asserted here against the real linter.
describe('fast-deep-equal-over-microdiff: the fix preserves suppressions inside the call (issue #1442)', () => {
  const RULE_ID = '@blumintinc/blumint/fast-deep-equal-over-microdiff';

  const config = {
    parser: '@typescript-eslint/parser',
    parserOptions: {
      ecmaVersion: 2020 as const,
      sourceType: 'module' as const,
    },
    rules: {
      [RULE_ID]: 'error' as const,
      'no-console': 'error' as const,
    },
  };

  const createLinter = () => {
    const linter = new Linter();
    linter.defineParser(
      '@typescript-eslint/parser',
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@typescript-eslint/parser'),
    );
    linter.defineRule(
      RULE_ID,
      fastDeepEqualOverMicrodiff as unknown as Rule.RuleModule,
    );
    return linter;
  };

  const countNoConsole = (code: string) =>
    createLinter()
      .verify(code, config, 'compare.ts')
      .filter((message) => message.ruleId === 'no-console').length;

  it('leaves a disable directive inside the call still suppressing after --fix', () => {
    const code = `import diff from 'microdiff';

function areEqual(a, b) {
  return diff(
    // eslint-disable-next-line no-console
    console.log(a),
    b,
  ).length === 0;
}
`;

    expect(countNoConsole(code)).toBe(0);

    const { output } = createLinter().verifyAndFix(code, config, 'compare.ts');

    expect(output).toBe(`import isEqual from '@blumintinc/fast-deep-equal';

function areEqual(a, b) {
  return isEqual(
    // eslint-disable-next-line no-console
    console.log(a),
    b,
  );
}
`);
    expect(countNoConsole(output)).toBe(0);
  });
});

// Issue #1448: overlapping fixes inside one report make ESLint throw an
// assertion that discards every message for the file, so the bug is a crash
// rather than a bad fix. RuleTester surfaces the throw, but only the real
// linter proves the file still lints — and that a swallowed directive is not
// silently re-enabling its rule.
describe('fast-deep-equal-over-microdiff: single-line declarations do not abort the file (issue #1448)', () => {
  const RULE_ID = '@blumintinc/blumint/fast-deep-equal-over-microdiff';

  const config = {
    parser: '@typescript-eslint/parser',
    parserOptions: {
      ecmaVersion: 2020 as const,
      sourceType: 'module' as const,
    },
    rules: {
      [RULE_ID]: 'error' as const,
      'no-console': 'error' as const,
    },
  };

  const createLinter = () => {
    const linter = new Linter();
    linter.defineParser(
      '@typescript-eslint/parser',
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@typescript-eslint/parser'),
    );
    linter.defineRule(
      RULE_ID,
      fastDeepEqualOverMicrodiff as unknown as Rule.RuleModule,
    );
    return linter;
  };

  const fix = (code: string) =>
    createLinter().verifyAndFix(code, config, 'compare.ts');

  const countNoConsole = (code: string) =>
    createLinter()
      .verify(code, config, 'compare.ts')
      .filter((message) => message.ruleId === 'no-console').length;

  it('fixes the one-liner instead of throwing', () => {
    const { output, messages } = fix(`import diff from 'microdiff';
function f(a, b) { const changes = diff(a, b); return changes.length !== 0; }
`);

    expect(messages).toHaveLength(0);
    expect(output).toBe(`import isEqual from '@blumintinc/fast-deep-equal';
function f(a, b) { return !isEqual(a, b); }
`);
  });

  it('keeps a directive trailing the declaration suppressing its line', () => {
    const code = `import diff from 'microdiff';

function f(a, b) {
  const changes = diff(a, b); // eslint-disable-next-line no-console
  return changes.length === 0 && !console.log(a);
}
`;

    expect(countNoConsole(code)).toBe(0);

    const { output } = fix(code);

    expect(output).toContain('// eslint-disable-next-line no-console');
    expect(countNoConsole(output)).toBe(0);
  });

  it('reports without fixing when the comparison sits inside the declaration', () => {
    const code = `import diff from 'microdiff';
function f(a) { const changes = diff(a, changes.length === 0); }
`;

    const { output, messages } = fix(code);

    expect(output).toBe(code);
    expect(messages.map((message) => message.ruleId)).toEqual([RULE_ID]);
  });

  it('lands the import on a violation that can be fixed', () => {
    const { output } = fix(`import diff from 'microdiff';

function nested(a) {
  const changes = diff(a, changes.length === 0);
}

function clean(a, b) {
  return diff(a, b).length !== 0;
}
`);

    expect(output).toContain(
      "import isEqual from '@blumintinc/fast-deep-equal';",
    );
    expect(output).toContain('return !isEqual(a, b);');
  });
});

// Issue #1893: `RuleTester` compares text against `output` and never asks
// whether the file it wrote still lints. The damage here is exactly that — a
// binding left with no reader — so the instrument has to be the rule that counts
// USES. agora runs `no-unused-vars` as an error and builds with
// `noUnusedLocals`, so a stranded import is a red build there and a green suite
// here.
describe('fast-deep-equal-over-microdiff: --fix strands no binding (issue #1893)', () => {
  const RULE_ID = '@blumintinc/blumint/fast-deep-equal-over-microdiff';

  const createLinter = () => {
    const linter = new Linter();
    linter.defineParser(
      '@typescript-eslint/parser',
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@typescript-eslint/parser'),
    );
    linter.defineRule(
      RULE_ID,
      fastDeepEqualOverMicrodiff as unknown as Rule.RuleModule,
    );
    return linter;
  };

  const base = {
    parser: '@typescript-eslint/parser',
    parserOptions: {
      ecmaVersion: 2020 as const,
      sourceType: 'module' as const,
    },
  };

  /** The binding names core `no-unused-vars` quotes, as a sorted multiset. */
  const unusedNames = (code: string) =>
    createLinter()
      .verify(
        code,
        { ...base, rules: { 'no-unused-vars': 'error' as const } },
        'compare.ts',
      )
      .flatMap((message) => {
        const match = /^'([^']+)'/.exec(message.message);
        return match ? [match[1]] : [];
      })
      .sort();

  const fix = (code: string) =>
    createLinter().verifyAndFix(
      code,
      { ...base, rules: { [RULE_ID]: 'error' as const } },
      'compare.ts',
    ).output;

  const expectNoNewOrphan = (code: string) => {
    const output = fix(code);
    expect(unusedNames(output)).toEqual(unusedNames(code));
    return output;
  };

  it('leaves no unreferenced diff behind on the reported repro', () => {
    const output = expectNoNewOrphan(`import diff from 'microdiff';

export const eq = (a, b) => diff(a, b).length === 0;
`);

    expect(output).toBe(`import isEqual from '@blumintinc/fast-deep-equal';

export const eq = (a, b) => isEqual(a, b);
`);
  });

  it('leaves no unreferenced diff behind across two passes', () => {
    const output = expectNoNewOrphan(`import diff from 'microdiff';

export function checkAll(a, b, c, d) {
  const first = diff(a, b);
  const second = diff(c, d);
  return first.length === 0 && second.length !== 0;
}
`);

    expect(output).not.toContain('microdiff');
  });

  it('keeps a microdiff import that another call still reads', () => {
    const output = expectNoNewOrphan(`import diff from 'microdiff';

export const eq = (a, b) => diff(a, b).length === 0;
export const changesOf = (a, b) => diff(a, b);
`);

    expect(output).toContain("import diff from 'microdiff';");
    expect(output).toContain('export const changesOf = (a, b) => diff(a, b);');
    expect(output).toContain('export const eq = (a, b) => isEqual(a, b);');
  });

  it('keeps a microdiff import whose only surviving reader is suppressed', () => {
    const output = expectNoNewOrphan(`import diff from 'microdiff';

export function areSame(a, b) {
  // eslint-disable-next-line @blumintinc/blumint/fast-deep-equal-over-microdiff
  return diff(a, b).length === 0;
}

export function areDifferent(a, b) {
  return diff(a, b).length !== 0;
}
`);

    expect(output).toContain("import diff from 'microdiff';");
    expect(output).toContain('return !isEqual(a, b);');
  });

  it('keeps an import read only by the arguments it moves', () => {
    const output = expectNoNewOrphan(`import diff from 'microdiff';
import { normalize } from './normalize';

export function eq(a, b) {
  const changes = diff(normalize(a), b);
  return changes.length === 0;
}
`);

    expect(output).toContain("import { normalize } from './normalize';");
    expect(output).toContain('return isEqual(normalize(a), b);');
  });

  // The control: the same measurement over the input proves the instrument
  // fires at all, so a green run above is a verdict rather than a no-op.
  it('does measure an unreferenced binding when there is one (control)', () => {
    expect(
      unusedNames(`import diff from 'microdiff';

export const eq = (a, b) => a === b;
`),
    ).toEqual(['diff']);
  });
});
