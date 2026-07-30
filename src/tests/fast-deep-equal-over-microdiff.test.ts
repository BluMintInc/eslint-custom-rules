import { Linter, Rule } from 'eslint';
import { ruleTesterTs } from '../utils/ruleTester';
import { fastDeepEqualOverMicrodiff } from '../rules/fast-deep-equal-over-microdiff';

const messageData = (diffName = 'diff', fastEqualName = 'isEqual') => ({
  diffName,
  fastEqualName,
});

ruleTesterTs.run('fast-deep-equal-over-microdiff', fastDeepEqualOverMicrodiff, {
  valid: [
    // Using fast-deep-equal correctly
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
  ],
  invalid: [
    // Using microdiff for equality check with .length === 0
    {
      code: `import { diff } from 'microdiff';

function areObjectsEqual(obj1, obj2) {
  return diff(obj1, obj2).length === 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

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
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

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
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

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
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

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
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

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
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

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
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

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
import isEqual from 'fast-deep-equal';

function areObjectsEqual(obj1, obj2) {
  return diff(obj1, obj2).length === 0;
}

function objectsAreTheSame(obj1, obj2) {
  return isEqual(obj1, obj2);
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

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
      output: `import { diff as compareObjects } from 'microdiff';
import isEqual from 'fast-deep-equal';

function areObjectsEqual(obj1, obj2) {
  return isEqual(obj1, obj2);
}`,
    },
    // Using microdiff with renamed fast-deep-equal import
    {
      code: `import { diff } from 'microdiff';
import deepEqual from 'fast-deep-equal';

function areObjectsEqual(obj1, obj2) {
  return diff(obj1, obj2).length === 0;
}`,
      errors: [
        {
          messageId: 'useFastDeepEqual',
          data: messageData('diff', 'deepEqual'),
        },
      ],
      output: `import { diff } from 'microdiff';
import deepEqual from 'fast-deep-equal';

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
      output: `import diff from 'microdiff';
import isEqual from 'fast-deep-equal';

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
      output: `import diff from 'microdiff';
import isEqual from 'fast-deep-equal';

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
      output: `import diff from 'microdiff';
import isEqual from 'fast-deep-equal';

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
      output: `import diff from 'microdiff';
import isEqual from 'fast-deep-equal';

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
      output: `import diff from 'microdiff';
import isEqual from 'fast-deep-equal';

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
      output: `import diff from 'microdiff';
import isEqual from 'fast-deep-equal';

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
      output: `import diff from 'microdiff';
import isEqual from 'fast-deep-equal';

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
      output: `import diff from 'microdiff';
import isEqual from 'fast-deep-equal';

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
      output: `import diff from 'microdiff';
import isEqual from 'fast-deep-equal';

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
      output: `import diff from 'microdiff';
import isEqual from 'fast-deep-equal';

function eq(a, b) {
  return isEqual(
    { ...a },
    { ...b },
  );
}`,
    },
    // ------------------------------------------------------------------
    // Issue #1415: the `import isEqual from 'fast-deep-equal'` fix must ride
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
import isEqual from 'fast-deep-equal';

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
import isEqual from 'fast-deep-equal';

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
import isEqual from 'fast-deep-equal';

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
import isEqual from 'fast-deep-equal';

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
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

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
import isEqual from 'fast-deep-equal';

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
import isEqual from 'fast-deep-equal';

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
import isEqual from 'fast-deep-equal';

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
import isEqual from 'fast-deep-equal';

function areSame(a, b) {
  // eslint-disable-next-line fast-deep-equal-over-microdiff
  return diff(a, b).length === 0;
}

function areDifferent(a, b) {
  return diff(a, b).length !== 0;
}`,
      errors: [{ messageId: 'useFastDeepEqual', data: messageData() }],
      output: `import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

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
import deepEqual from 'fast-deep-equal';

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
import deepEqual from 'fast-deep-equal';

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
import isEqual from 'fast-deep-equal';

function areSame(a, b) {
  // eslint-disable-next-line fast-deep-equal-over-microdiff
  return diff(a, b).length === 0;
}

function areDifferent(a, b) {
  return !isEqual(a, b);
}`,
    },
  ],
});

// Issue #1415: RuleTester applies a single fix pass and never shows the file
// that `eslint --fix` actually writes. These cases run the real multi-pass
// fixer and assert the invariant the bug violated: an emitted `isEqual(…)`
// call is never left without its import.
describe('fast-deep-equal-over-microdiff: inline disables and the import carrier (issue #1415)', () => {
  const RULE_ID = '@blumintinc/blumint/fast-deep-equal-over-microdiff';
  const IMPORT_LINE = "import isEqual from 'fast-deep-equal';";

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
import isEqual from 'fast-deep-equal';

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
      output.match(/import isEqual from 'fast-deep-equal';/g),
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

    expect(output).toBe(`import { diff } from 'microdiff';
import isEqual from 'fast-deep-equal';

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
import isEqual from 'fast-deep-equal';

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
import isEqual from 'fast-deep-equal';

function areSame(a, b) {
  // eslint-disable-next-line @blumintinc/blumint/fast-deep-equal-over-microdiff
  return diff(a, b).length === 0;
}

function areDifferent(a, b) {
  return diff(a, b).length !== 0;
}
`);

    expect(
      output.match(/import isEqual from 'fast-deep-equal';/g),
    ).toHaveLength(1);
    expect(output).toContain('return !isEqual(a, b);');
    expectNoUnboundIsEqual(output);
  });
});
