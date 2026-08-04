import { ruleTesterTs } from '../utils/ruleTester';
import { enforceMicrodiff } from '../rules/enforce-microdiff';

ruleTesterTs.run('enforce-microdiff', enforceMicrodiff, {
  valid: [
    // A zero-argument JSON.stringify() used to abort the whole lint run: the
    // indexed `arguments[0]` read is typed non-optional (issue #1571).
    {
      code: `export function isSameConfig(
  JSON: { stringify: (value?: unknown) => string },
  next: unknown,
): boolean {
  return JSON.stringify() === JSON.stringify(next);
}`,
    },
    // The right operand is reached whenever the left one is an object literal.
    {
      code: `declare const JSON: { stringify: (value?: unknown) => string };
const same = JSON.stringify({ a: 1 }) === JSON.stringify();`,
    },
    {
      code: `declare const JSON: { stringify: (value?: unknown) => string };
const same = JSON.stringify() === JSON.stringify({ a: 1 });`,
    },
    {
      code: `declare const JSON: { stringify: (value?: unknown) => string };
const differs = JSON.stringify() !== JSON.stringify();`,
    },
    // Using microdiff correctly
    {
      code: `import { diff } from 'microdiff';

function hasConfigChanged(oldConfig, newConfig) {
  return diff(oldConfig, newConfig).length > 0;
}`,
    },
    // Getting specific changes with microdiff
    {
      code: `import { diff } from 'microdiff';

function getConfigChanges(oldConfig, newConfig) {
  const changes = diff(oldConfig, newConfig);
  return changes;
}`,
    },
    // Array comparison with microdiff
    {
      code: `import { diff } from 'microdiff';

function arrayHasChanged(oldItems, newItems) {
  return diff(oldItems, newItems).length > 0;
}`,
    },
    // Using diff results for specific updates
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
    // Handling arrays of objects with microdiff
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
    // Simple equality checks (should not be flagged)
    {
      code: `function checkSimpleEquality(user, otherUser) {
  if (user.id === otherUser.id) {
    return true;
  }
  if (count === previousCount) {
    return true;
  }
  if (status !== 'active') {
    return true;
  }
  return false;
}`,
    },
    // React dependency arrays (should not be flagged)
    {
      code: `import React from 'react';
import { useEffect } from 'react';

function MyComponent(props) {
  const { user, count } = props;
  useEffect(() => {
    // Do something
  }, [user.id, count]);

  return React.createElement('div');
}`,
    },
    // Simple optimization checks (should not be flagged)
    {
      code: `import { diff } from 'microdiff';

function compareWithOptimization(oldItems, newItems) {
  if (oldItems.length !== newItems.length) {
    return true;
  }
  return diff(oldItems, newItems).length > 0;
}`,
    },
    // Specific field comparison (should not be flagged)
    {
      code: `function checkSpecificField(user, previousUser) {
  if (user.lastLogin !== previousUser.lastLogin) {
    return true;
  }
  return false;
}`,
    },
    // Using fast-deep-equal (should not be flagged as it's an allowed alternative)
    {
      code: `import isEqual from 'fast-deep-equal';

function isTournamentEqual(beforeTournament, tournament) {
  return isEqual(beforeTournament, tournament);
}`,
    },
    // Using fast-deep-equal/es6 (should not be flagged as it's an allowed alternative)
    {
      code: `import isEqual from 'fast-deep-equal/es6';

function areObjectsEqual(obj1, obj2) {
  return isEqual(obj1, obj2);
}`,
    },
    // A local function that happens to carry a diff library's export name owes
    // nothing to that library: the file uses no diff library at all.
    {
      code: `function detailedDiff(a, b) {
  return { added: [], removed: [] };
}

export const changes = detailedDiff(oldState, newState);`,
    },
    // The same for a local arrow assigned to a const.
    {
      code: `const deepDiff = (a, b) => ({ ...a, ...b });

export const merged = deepDiff(oldProps, newProps);`,
    },
    // A parameter shadows any library of the same name inside the function.
    {
      code: `function runComparison(fastDiff, oldItems, newItems) {
  return fastDiff(oldItems, newItems);
}`,
    },
    // An import of the same name from a module that is not a competing diff
    // library — a project-local helper — is left alone.
    {
      code: `import { detailedDiff } from './utils/detailedDiff';

export const changes = detailedDiff(oldState, newState);`,
    },
    // A class method reached through `this` carries the name without binding it.
    {
      code: `class ChangeTracker {
  detailedDiff(oldState, newState) {
    return { oldState, newState };
  }

  track(oldState, newState) {
    return this.detailedDiff(oldState, newState);
  }
}`,
    },
    // An unbound name is not evidence of a diff library either, and renaming it
    // to `diff` would only trade one unresolved name for another.
    {
      code: `export const changes = detailedDiff(oldState, newState);`,
    },
    // A module-scope function shadowed by nothing, called from a nested scope.
    {
      code: `function deepDiff(a, b) {
  return [a, b];
}

export function compare(oldConfig, newConfig) {
  return deepDiff(oldConfig, newConfig);
}`,
    },
    // The package the fix emits, imported the way it actually exports its diff
    // function: as the module default.
    {
      code: `import diff from '@blumintinc/microdiff';

function hasConfigChanged(oldConfig, newConfig) {
  return diff(oldConfig, newConfig).length > 0;
}`,
    },
    // The default alongside the named type export, which is how call sites that
    // annotate the change list import it.
    {
      code: `import diff, { Difference } from '@blumintinc/microdiff';

export function changesOf(oldConfig, newConfig): Difference[] {
  return diff(oldConfig, newConfig);
}`,
    },
  ],
  invalid: [
    // Using deep-diff
    {
      code: `import { diff as deepDiff } from 'deep-diff';

function compareConfigs(oldConfig, newConfig) {
  return deepDiff(oldConfig, newConfig);
}`,
      errors: [
        {
          messageId: 'enforceMicrodiffImport',
          data: { importSource: 'deep-diff' },
        },
        { messageId: 'enforceMicrodiff' },
      ],
      output: `import diff from '@blumintinc/microdiff';

function compareConfigs(oldConfig, newConfig) {
  return diff(oldConfig, newConfig);
}`,
    },
    // Using diff library
    {
      code: `import { diffArrays } from 'diff';

function compareArrays(oldArray, newArray) {
  return diffArrays(oldArray, newArray);
}`,
      errors: [
        { messageId: 'enforceMicrodiffImport', data: { importSource: 'diff' } },
        { messageId: 'enforceMicrodiff' },
      ],
      output: `import diff from '@blumintinc/microdiff';

function compareArrays(oldArray, newArray) {
  return diff(oldArray, newArray);
}`,
    },
    // Using deep-object-diff
    {
      code: `import { detailedDiff } from 'deep-object-diff';

function compareObjects(oldObj, newObj) {
  return detailedDiff(oldObj, newObj);
}`,
      errors: [
        {
          messageId: 'enforceMicrodiffImport',
          data: { importSource: 'deep-object-diff' },
        },
        { messageId: 'enforceMicrodiff' },
      ],
      output: `import diff from '@blumintinc/microdiff';

function compareObjects(oldObj, newObj) {
  return diff(oldObj, newObj);
}`,
    },
    // Using fast-diff
    {
      code: `import { diff as fastDiff } from 'fast-diff';

function findChanges(prev, next) {
  return fastDiff(prev, next);
}`,
      errors: [
        {
          messageId: 'enforceMicrodiffImport',
          data: { importSource: 'fast-diff' },
        },
        {
          messageId: 'enforceMicrodiff',
        },
      ],
      output: `import diff from '@blumintinc/microdiff';

function findChanges(prev, next) {
  return diff(prev, next);
}`,
    },
    // Using Lodash difference functions. `_.differenceWith` returns the
    // elements of `original` with no comparator-equal match in `updated`, while
    // microdiff's `diff` returns a structural change list, so the report stands
    // without a fix.
    {
      code: `import _ from 'lodash';

function detectDifferences(original, updated) {
  return _.differenceWith(original, updated, _.isEqual);
}`,
      errors: [{ messageId: 'enforceMicrodiff' }],
      output: null,
    },
    {
      // Two-argument `_.difference` is no more convertible than the comparator
      // form: it still yields a subset of `original`, not a change list.
      code: `import _ from 'lodash';

function detectDifferences(original, updated) {
  return _.difference(original, updated);
}`,
      errors: [{ messageId: 'enforceMicrodiff' }],
      output: null,
    },
    {
      // `_.differenceBy`'s iteratee has no counterpart in microdiff's signature.
      code: `import _ from 'lodash';

function detectDifferences(original, updated) {
  return _.differenceBy(original, updated, 'id');
}`,
      errors: [{ messageId: 'enforceMicrodiff' }],
      output: null,
    },
    {
      // An existing microdiff import does not make the lodash call convertible:
      // the two functions compute different things, so the report stands alone.
      code: `import { diff } from 'microdiff';
import _ from 'lodash';

function detectDifferences(original, updated) {
  return _.differenceWith(original, updated, _.isEqual);
}`,
      errors: [{ messageId: 'enforceMicrodiff' }],
      output: null,
    },
    {
      // Declining leaves the comments inside the lodash call untouched.
      code: `import _ from 'lodash';

function detectDifferences(original, updated) {
  return _.differenceWith(
    original, // the baseline
    updated,
    _.isEqual,
  );
}`,
      errors: [{ messageId: 'enforceMicrodiff' }],
      output: null,
    },
    {
      // A competing import alongside a lodash call: the import rewrite still
      // lands, and the lodash call is left for the author.
      code: `import { diff as deepDiff } from 'deep-diff';
import _ from 'lodash';

function compareConfigs(oldConfig, newConfig) {
  return deepDiff(oldConfig, newConfig);
}

function detectDifferences(original, updated) {
  return _.difference(original, updated);
}`,
      errors: [
        {
          messageId: 'enforceMicrodiffImport',
          data: { importSource: 'deep-diff' },
        },
        { messageId: 'enforceMicrodiff' },
        { messageId: 'enforceMicrodiff' },
      ],
      output: `import diff from '@blumintinc/microdiff';
import _ from 'lodash';

function compareConfigs(oldConfig, newConfig) {
  return diff(oldConfig, newConfig);
}

function detectDifferences(original, updated) {
  return _.difference(original, updated);
}`,
    },
    // These test cases for fast-deep-equal have been removed since fast-deep-equal is now allowed
    // as a valid alternative to microdiff
    // Manual object comparison with JSON.stringify
    {
      code: `function hasConfigChanged(oldConfig, newConfig) {
  return JSON.stringify(oldConfig) !== JSON.stringify(newConfig);
}`,
      errors: [{ messageId: 'enforceMicrodiff' }],
      output: `import diff from '@blumintinc/microdiff';

function hasConfigChanged(oldConfig, newConfig) {
  return diff(oldConfig, newConfig).length > 0;
}`,
    },
    // Custom deep comparison function
    {
      code: `function detectChanges(prev, next) {
  if (typeof prev !== typeof next) return true;
  if (Array.isArray(prev) !== Array.isArray(next)) return true;
  if (typeof prev === 'object') {
    return Object.keys(prev).some(key =>
      prev[key] !== next[key]
    );
  }
  return prev !== next;
}`,
      errors: [{ messageId: 'enforceMicrodiff' }],
    },
    // Array comparison with loops
    {
      code: `function arrayHasChanged(oldItems, newItems) {
  if (oldItems.length !== newItems.length) return true;
  for (let i = 0; i < oldItems.length; i++) {
    if (oldItems[i].id !== newItems[i].id) return true;
  }
  return false;
}`,
      errors: [{ messageId: 'enforceMicrodiff' }],
    },
    // Object.keys comparison
    {
      code: `function settingsChanged(oldSettings, newSettings) {
  const oldKeys = Object.keys(oldSettings);
  const newKeys = Object.keys(newSettings);
  if (oldKeys.length !== newKeys.length) return true;
  return oldKeys.some(key => oldSettings[key] !== newSettings[key]);
}`,
      errors: [{ messageId: 'enforceMicrodiff' }],
    },
    // Nested object comparison
    {
      code: `function stateHasUpdated(prevState, nextState) {
  for (const key in prevState) {
    if (typeof prevState[key] === 'object') {
      if (JSON.stringify(prevState[key]) !== JSON.stringify(nextState[key])) {
        return true;
      }
    } else if (prevState[key] !== nextState[key]) {
      return true;
    }
  }
  return false;
}`,
      errors: [{ messageId: 'enforceMicrodiff' }],
    },
    // Using microdiff with another diffing library
    {
      code: `import { diff } from 'microdiff';
import { diff as deepDiff } from 'deep-diff';

function compareConfigs(oldConfig, newConfig) {
  return deepDiff(oldConfig, newConfig);
}

function hasConfigChanged(oldConfig, newConfig) {
  return diff(oldConfig, newConfig).length > 0;
}`,
      errors: [
        {
          messageId: 'enforceMicrodiffImport',
          data: { importSource: 'deep-diff' },
        },
        {
          messageId: 'enforceMicrodiff',
        },
      ],
      output: `import { diff } from 'microdiff';


function compareConfigs(oldConfig, newConfig) {
  return diff(oldConfig, newConfig);
}

function hasConfigChanged(oldConfig, newConfig) {
  return diff(oldConfig, newConfig).length > 0;
}`,
    },
    {
      // A pre-existing `diff` binding makes the import unsafe to insert, so the
      // violation is reported without an autofix.
      code: `
const diff = undefined as unknown as never;
import { diff as fastDiff } from 'fast-diff';

function findChanges(prev, next) {
  return fastDiff(prev, next);
}
`,
      output: `
const diff = undefined as unknown as never;
import { diff as fastDiff } from 'fast-diff';

function findChanges(prev, next) {
  return fastDiff(prev, next);
}
`,
      errors: [
        {
          messageId: 'enforceMicrodiffImport',
          data: { importSource: 'fast-diff' },
        },
        { messageId: 'enforceMicrodiff' },
      ],
    },
    {
      // A `diff` bound inside the function would capture the rewritten call
      // without any compile error, so neither the call nor the import it needs
      // is rewritten.
      code: `import { diff as fastDiff } from 'fast-diff';

function findChanges(prev, next) {
  const diff = fastDiff;
  return fastDiff(prev, next);
}`,
      output: `import { diff as fastDiff } from 'fast-diff';

function findChanges(prev, next) {
  const diff = fastDiff;
  return fastDiff(prev, next);
}`,
      errors: [
        {
          messageId: 'enforceMicrodiffImport',
          data: { importSource: 'fast-diff' },
        },
        { messageId: 'enforceMicrodiff' },
      ],
    },
    {
      // A parameter named `diff` shadows the import the rewritten body needs.
      code: `function hasConfigChanged(diff, newConfig) {
  return JSON.stringify(diff) !== JSON.stringify(newConfig);
}`,
      output: `function hasConfigChanged(diff, newConfig) {
  return JSON.stringify(diff) !== JSON.stringify(newConfig);
}`,
      errors: [{ messageId: 'enforceMicrodiff' }],
    },
    {
      // The microdiff import trailing the competing one is still found, so the
      // competing import is dropped rather than replaced by a duplicate.
      code: `import { diff as deepDiff } from 'deep-diff';
import { diff } from 'microdiff';

function compareConfigs(oldConfig, newConfig) {
  return deepDiff(oldConfig, newConfig);
}`,
      errors: [
        {
          messageId: 'enforceMicrodiffImport',
          data: { importSource: 'deep-diff' },
        },
        { messageId: 'enforceMicrodiff' },
      ],
      output: `
import { diff } from 'microdiff';

function compareConfigs(oldConfig, newConfig) {
  return diff(oldConfig, newConfig);
}`,
    },
    {
      // microdiff's default export binds `diff` just as its named export does,
      // so the existing import carries the rewritten call.
      code: `import diff from 'microdiff';
import { diff as deepDiff } from 'deep-diff';

function compareConfigs(oldConfig, newConfig) {
  return deepDiff(oldConfig, newConfig);
}`,
      errors: [
        {
          messageId: 'enforceMicrodiffImport',
          data: { importSource: 'deep-diff' },
        },
        { messageId: 'enforceMicrodiff' },
      ],
      output: `import diff from 'microdiff';


function compareConfigs(oldConfig, newConfig) {
  return diff(oldConfig, newConfig);
}`,
    },
    {
      // A namespace import of microdiff binds no `diff`, so the rewrite adds
      // the specifier the call needs instead of leaving it unresolved.
      code: `import * as microdiff from 'microdiff';
import { diff as deepDiff } from 'deep-diff';

function compareConfigs(oldConfig, newConfig) {
  return deepDiff(oldConfig, newConfig);
}`,
      errors: [
        {
          messageId: 'enforceMicrodiffImport',
          data: { importSource: 'deep-diff' },
        },
        { messageId: 'enforceMicrodiff' },
      ],
      output: `import * as microdiff from 'microdiff';
import diff from '@blumintinc/microdiff';

function compareConfigs(oldConfig, newConfig) {
  return diff(oldConfig, newConfig);
}`,
    },
    {
      // The competing import is itself the only thing binding `diff`, and the
      // fix retires it, so the name is free for the microdiff import.
      code: `import { diff } from 'diff';

function compareArrays(oldArray, newArray) {
  return diff(oldArray, newArray);
}`,
      errors: [
        { messageId: 'enforceMicrodiffImport', data: { importSource: 'diff' } },
        { messageId: 'enforceMicrodiff' },
      ],
      output: `import diff from '@blumintinc/microdiff';

function compareArrays(oldArray, newArray) {
  return diff(oldArray, newArray);
}`,
    },
    {
      // fast-deep-equal is an allowed alternative, so its import survives the
      // fix and keeps the name `diff` occupied.
      code: `import diff from 'fast-deep-equal';
import { detailedDiff } from 'deep-object-diff';

function compareObjects(oldObj, newObj) {
  return detailedDiff(oldObj, newObj);
}`,
      output: `import diff from 'fast-deep-equal';
import { detailedDiff } from 'deep-object-diff';

function compareObjects(oldObj, newObj) {
  return detailedDiff(oldObj, newObj);
}`,
      errors: [
        {
          messageId: 'enforceMicrodiffImport',
          data: { importSource: 'deep-object-diff' },
        },
        { messageId: 'enforceMicrodiff' },
      ],
    },
    {
      // The rewritten JSON.stringify comparison would read the file's own
      // `diff`.
      code: `const diff = 1;

function isSameConfig(oldConfig, newConfig) {
  return JSON.stringify(oldConfig) === JSON.stringify(newConfig);
}`,
      output: `const diff = 1;

function isSameConfig(oldConfig, newConfig) {
  return JSON.stringify(oldConfig) === JSON.stringify(newConfig);
}`,
      errors: [{ messageId: 'enforceMicrodiff' }],
    },
    {
      // The name-only branch fires on a name a competing library binds under an
      // export the import handler does not track by itself, and the call rename
      // rides along with the import rewrite that makes `diff` resolvable.
      code: `import { deepDiff } from 'deep-diff';

function compareConfigs(oldConfig, newConfig) {
  return deepDiff(oldConfig, newConfig);
}`,
      errors: [
        {
          messageId: 'enforceMicrodiffImport',
          data: { importSource: 'deep-diff' },
        },
        { messageId: 'enforceMicrodiff' },
      ],
      output: `import diff from '@blumintinc/microdiff';

function compareConfigs(oldConfig, newConfig) {
  return diff(oldConfig, newConfig);
}`,
    },
    {
      // The same for a default import of a competing library.
      code: `import fastDiff from 'fast-diff';

function findChanges(oldItems, newItems) {
  return fastDiff(oldItems, newItems);
}`,
      errors: [
        {
          messageId: 'enforceMicrodiffImport',
          data: { importSource: 'fast-diff' },
        },
        { messageId: 'enforceMicrodiff' },
      ],
      output: `import diff from '@blumintinc/microdiff';

function findChanges(oldItems, newItems) {
  return diff(oldItems, newItems);
}`,
    },
    {
      // An alias renames the export away from the name-only list, so the call is
      // caught by the imported-name tracking instead, and both paths land the
      // same rewrite.
      code: `import { detailedDiff as dd } from 'deep-object-diff';

function compareObjects(oldObj, newObj) {
  return dd(oldObj, newObj);
}`,
      errors: [
        {
          messageId: 'enforceMicrodiffImport',
          data: { importSource: 'deep-object-diff' },
        },
        { messageId: 'enforceMicrodiff' },
      ],
      output: `import diff from '@blumintinc/microdiff';

function compareObjects(oldObj, newObj) {
  return diff(oldObj, newObj);
}`,
    },
    {
      // An alias onto one of the name-only names still resolves to a competing
      // library's import, so the call is rewritten with it.
      code: `import { somethingElse as detailedDiff } from 'deep-object-diff';

function compareObjects(oldObj, newObj) {
  return detailedDiff(oldObj, newObj);
}`,
      errors: [
        {
          messageId: 'enforceMicrodiffImport',
          data: { importSource: 'deep-object-diff' },
        },
        { messageId: 'enforceMicrodiff' },
      ],
      output: `import diff from '@blumintinc/microdiff';

function compareObjects(oldObj, newObj) {
  return diff(oldObj, newObj);
}`,
    },
    {
      // A local binding of `diff` blocks the rename of a name-only call that
      // does resolve to a competing library, so the import is reported and left
      // in place alongside the call it binds.
      code: `import { fastDiff } from 'fast-diff';
const diff = 1;

function run(objA, objB) {
  return fastDiff(objA, objB);
}`,
      output: `import { fastDiff } from 'fast-diff';
const diff = 1;

function run(objA, objB) {
  return fastDiff(objA, objB);
}`,
      errors: [
        {
          messageId: 'enforceMicrodiffImport',
          data: { importSource: 'fast-diff' },
        },
        { messageId: 'enforceMicrodiff' },
      ],
    },
    {
      // A local `diff` binding changes nothing about the lodash path: it is
      // report-only regardless of what the surrounding scope binds.
      code: `import _ from 'lodash';

function detectDifferences(original, updated) {
  const diff = 1;
  return _.differenceWith(original, updated, _.isEqual);
}`,
      output: null,
      errors: [{ messageId: 'enforceMicrodiff' }],
    },
    {
      // A local binding shadowing the import calls the file's own function, not
      // the library's, so renaming it to `diff` would swap in a function that
      // computes something else entirely. The import itself is still retired.
      code: `import { detailedDiff } from 'deep-object-diff';

export function compare(oldState, newState) {
  const detailedDiff = (a, b) => [a, b];
  return detailedDiff(oldState, newState);
}`,
      errors: [
        {
          messageId: 'enforceMicrodiffImport',
          data: { importSource: 'deep-object-diff' },
        },
      ],
      output: `import diff from '@blumintinc/microdiff';

export function compare(oldState, newState) {
  const detailedDiff = (a, b) => [a, b];
  return detailedDiff(oldState, newState);
}`,
    },
    {
      // A shadow confined to a nested block leaves the calls outside it bound to
      // the import, so those are rewritten while the shadowed one is not.
      code: `import { detailedDiff } from 'deep-object-diff';

export function compare(oldState, newState) {
  if (oldState) {
    const detailedDiff = (a, b) => [a, b];
    return detailedDiff(oldState, newState);
  }
  return detailedDiff(oldState, newState);
}`,
      errors: [
        {
          messageId: 'enforceMicrodiffImport',
          data: { importSource: 'deep-object-diff' },
        },
        { messageId: 'enforceMicrodiff' },
      ],
      output: `import diff from '@blumintinc/microdiff';

export function compare(oldState, newState) {
  if (oldState) {
    const detailedDiff = (a, b) => [a, b];
    return detailedDiff(oldState, newState);
  }
  return diff(oldState, newState);
}`,
    },
    {
      // A parameter shadows the import for the whole function body.
      code: `import { detailedDiff } from 'deep-object-diff';

export function compare(detailedDiff, oldState, newState) {
  return detailedDiff(oldState, newState);
}`,
      errors: [
        {
          messageId: 'enforceMicrodiffImport',
          data: { importSource: 'deep-object-diff' },
        },
      ],
      output: `import diff from '@blumintinc/microdiff';

export function compare(detailedDiff, oldState, newState) {
  return detailedDiff(oldState, newState);
}`,
    },
    {
      // The same holds for an aliased specifier: the tracked name is the local
      // one, and a local binding of it answers the call.
      code: `import { diff as deepDiff } from 'deep-diff';

export function compare(oldConfig, newConfig) {
  const deepDiff = (a, b) => [a, b];
  return deepDiff(oldConfig, newConfig);
}`,
      errors: [
        {
          messageId: 'enforceMicrodiffImport',
          data: { importSource: 'deep-diff' },
        },
      ],
      output: `import diff from '@blumintinc/microdiff';

export function compare(oldConfig, newConfig) {
  const deepDiff = (a, b) => [a, b];
  return deepDiff(oldConfig, newConfig);
}`,
    },
    {
      // The import rewrite carries the call site it feeds. Argument names told
      // the call fix nothing the resolved callee had not already settled, and
      // gating on them retired the import while `deepDiff` stayed behind,
      // unbound.
      code: `import deepDiff from 'deep-diff';

export const f = (a: object, b: object) => deepDiff(a, b);`,
      errors: [
        {
          messageId: 'enforceMicrodiffImport',
          data: { importSource: 'deep-diff' },
        },
        { messageId: 'enforceMicrodiff' },
      ],
      output: `import diff from '@blumintinc/microdiff';

export const f = (a: object, b: object) => diff(a, b);`,
    },
    {
      // A reference that is not a callee has no rewrite of its own, so the
      // import that binds it stays put and the report stands alone.
      code: `import { detailedDiff } from 'deep-object-diff';

export const chosen = detailedDiff;`,
      errors: [
        {
          messageId: 'enforceMicrodiffImport',
          data: { importSource: 'deep-object-diff' },
        },
      ],
      output: null,
    },
    {
      // A specifier this rule has no rewrite for keeps the whole declaration
      // alive, so the call that would have been renamed is left alone too:
      // renaming it would emit a `diff` the surviving import does not bind.
      code: `import { diff as deepDiff, applyChange } from 'deep-diff';

export function compare(oldConfig, newConfig) {
  applyChange(oldConfig, newConfig);
  return deepDiff(oldConfig, newConfig);
}`,
      errors: [
        {
          messageId: 'enforceMicrodiffImport',
          data: { importSource: 'deep-diff' },
        },
        { messageId: 'enforceMicrodiff' },
      ],
      output: null,
    },
    {
      // `diff(obj, newObj)` needs both operands, so a one-argument call has no
      // conversion — and the import that binds it cannot be retired either.
      code: `import deepDiff from 'deep-diff';

export const f = (oldConfig) => deepDiff(oldConfig);`,
      errors: [
        {
          messageId: 'enforceMicrodiffImport',
          data: { importSource: 'deep-diff' },
        },
        { messageId: 'enforceMicrodiff' },
      ],
      output: null,
    },
    {
      // A comparison inside a function still needs the import: deciding on the
      // enclosing node emitted a bare `diff` nothing bound.
      code: `export const isSameConfig = (oldConfig, newConfig) =>
  JSON.stringify(oldConfig) === JSON.stringify(newConfig);`,
      errors: [{ messageId: 'enforceMicrodiff' }],
      output: `import diff from '@blumintinc/microdiff';

export const isSameConfig = (oldConfig, newConfig) =>
  diff(oldConfig, newConfig).length === 0;`,
    },
    {
      // The same comparison against an existing import reuses it.
      code: `import diff from '@blumintinc/microdiff';

export const isSameConfig = (oldConfig, newConfig) =>
  JSON.stringify(oldConfig) === JSON.stringify(newConfig);`,
      errors: [{ messageId: 'enforceMicrodiff' }],
      output: `import diff from '@blumintinc/microdiff';

export const isSameConfig = (oldConfig, newConfig) =>
  diff(oldConfig, newConfig).length === 0;`,
    },
    {
      // Only the body is rewritten, so the signature keeps its annotations and
      // its `export`, and the import lands at the top of the file rather than
      // in front of the declaration it would otherwise replace.
      code: `export function hasConfigChanged(oldConfig: object, newConfig: object): boolean {
  return JSON.stringify(oldConfig) !== JSON.stringify(newConfig);
}`,
      errors: [{ messageId: 'enforceMicrodiff' }],
      output: `import diff from '@blumintinc/microdiff';

export function hasConfigChanged(oldConfig: object, newConfig: object): boolean {
  return diff(oldConfig, newConfig).length > 0;
}`,
    },
    {
      // A nested declaration takes the import to module scope, where the
      // grammar allows it.
      code: `export function outer() {
  function hasConfigChanged(oldConfig, newConfig) {
    return JSON.stringify(oldConfig) !== JSON.stringify(newConfig);
  }
  return hasConfigChanged;
}`,
      errors: [{ messageId: 'enforceMicrodiff' }],
      output: `import diff from '@blumintinc/microdiff';

export function outer() {
  function hasConfigChanged(oldConfig, newConfig) {
    return diff(oldConfig, newConfig).length > 0;
  }
  return hasConfigChanged;
}`,
    },
    {
      // The comparison names what to diff, so a parameter that binds no single
      // name is no obstacle: the operands come from the operands.
      code: `function hasConfigChanged({ current }, newConfig) {
  return JSON.stringify(current) !== JSON.stringify(newConfig);
}`,
      errors: [{ messageId: 'enforceMicrodiff' }],
      output: `import diff from '@blumintinc/microdiff';

function hasConfigChanged({ current }, newConfig) {
  return diff(current, newConfig).length > 0;
}`,
    },
    {
      // Every statement the comparison shares the body with survives: a body
      // re-emitted from the signature drops the side effect silently.
      code: `function hasConfigChanged(oldConfig, newConfig) {
  recordComparison(oldConfig, newConfig);
  return JSON.stringify(oldConfig) !== JSON.stringify(newConfig);
}`,
      errors: [{ messageId: 'enforceMicrodiff' }],
      output: `import diff from '@blumintinc/microdiff';

function hasConfigChanged(oldConfig, newConfig) {
  recordComparison(oldConfig, newConfig);
  return diff(oldConfig, newConfig).length > 0;
}`,
    },
    {
      // A comparison of two properties stays a comparison of those properties.
      // Operands read off the signature widen it to the whole objects, which
      // reports changes the source never asked about.
      code: `function hasConfigChanged(oldConfig, newConfig) {
  return JSON.stringify(oldConfig.settings) !== JSON.stringify(newConfig.settings);
}`,
      errors: [{ messageId: 'enforceMicrodiff' }],
      output: `import diff from '@blumintinc/microdiff';

function hasConfigChanged(oldConfig, newConfig) {
  return diff(oldConfig.settings, newConfig.settings).length > 0;
}`,
    },
    {
      // A guard clause, a side effect and a local all outlive the rewrite, and
      // the comparison's right operand is the local rather than the parameter.
      code: `function hasConfigChanged(oldConfig, newConfig) {
  recordComparison(oldConfig, newConfig);
  if (!oldConfig) {
    return true;
  }
  const normalized = normalize(newConfig);
  return JSON.stringify(oldConfig) !== JSON.stringify(normalized);
}`,
      errors: [{ messageId: 'enforceMicrodiff' }],
      output: `import diff from '@blumintinc/microdiff';

function hasConfigChanged(oldConfig, newConfig) {
  recordComparison(oldConfig, newConfig);
  if (!oldConfig) {
    return true;
  }
  const normalized = normalize(newConfig);
  return diff(oldConfig, normalized).length > 0;
}`,
    },
    {
      // Comments the body carries are outside the replaced range, so both the
      // leading one and the one trailing the comparison survive.
      code: `function hasConfigChanged(oldConfig, newConfig) {
  // Structural comparison, not a reference check.
  return JSON.stringify(oldConfig) !== JSON.stringify(newConfig); // deep
}`,
      errors: [{ messageId: 'enforceMicrodiff' }],
      output: `import diff from '@blumintinc/microdiff';

function hasConfigChanged(oldConfig, newConfig) {
  // Structural comparison, not a reference check.
  return diff(oldConfig, newConfig).length > 0; // deep
}`,
    },
    {
      // The sense comes off the comparison's own operator, so an `===` body
      // reached through an unrelated `!==` still inverts correctly.
      code: `function hasConfigChanged(oldConfig, newConfig) {
  if (oldConfig.id !== newConfig.id) {
    return true;
  }
  return JSON.stringify(oldConfig) === JSON.stringify(newConfig);
}`,
      errors: [{ messageId: 'enforceMicrodiff' }],
      output: `import diff from '@blumintinc/microdiff';

function hasConfigChanged(oldConfig, newConfig) {
  if (oldConfig.id !== newConfig.id) {
    return true;
  }
  return diff(oldConfig, newConfig).length === 0;
}`,
    },
    {
      // The comparison need not be the returned expression: rewriting it in
      // place leaves the assignment and the return it feeds alone.
      code: `function hasConfigChanged(oldConfig, newConfig) {
  const changed = JSON.stringify(oldConfig) !== JSON.stringify(newConfig);
  return changed;
}`,
      errors: [{ messageId: 'enforceMicrodiff' }],
      output: `import diff from '@blumintinc/microdiff';

function hasConfigChanged(oldConfig, newConfig) {
  const changed = diff(oldConfig, newConfig).length > 0;
  return changed;
}`,
    },
    {
      // The signature keeps its annotations and its `export` while the body
      // keeps its guard: only the comparison's own range is replaced.
      code: `export function hasConfigChanged(oldConfig: object, newConfig: object): boolean {
  if (!oldConfig) {
    return true;
  }
  return JSON.stringify(oldConfig) !== JSON.stringify(newConfig);
}`,
      errors: [{ messageId: 'enforceMicrodiff' }],
      output: `import diff from '@blumintinc/microdiff';

export function hasConfigChanged(oldConfig: object, newConfig: object): boolean {
  if (!oldConfig) {
    return true;
  }
  return diff(oldConfig, newConfig).length > 0;
}`,
    },
    {
      // Two comparisons leave the rule no way to tell which one the result
      // depends on, so the report stands without a fix.
      code: `function hasConfigChanged(oldConfig, newConfig) {
  if (JSON.stringify(oldConfig.a) !== JSON.stringify(newConfig.a)) {
    return true;
  }
  return JSON.stringify(oldConfig.b) !== JSON.stringify(newConfig.b);
}`,
      errors: [{ messageId: 'enforceMicrodiff' }],
      output: null,
    },
    {
      // A comparison split across a local has no single expression to replace,
      // so the body is left for the author.
      code: `function hasConfigChanged(oldConfig, newConfig) {
  const serialized = JSON.stringify(oldConfig);
  return serialized !== JSON.stringify(newConfig);
}`,
      errors: [{ messageId: 'enforceMicrodiff' }],
      output: null,
    },
    {
      // A zero-argument `JSON.stringify()` supplies no operand, so there is
      // nothing to hand `diff`.
      code: `declare const JSON: { stringify: (value?: unknown) => string };

function hasConfigChanged(oldConfig, newConfig) {
  return JSON.stringify() !== JSON.stringify(newConfig);
}`,
      errors: [{ messageId: 'enforceMicrodiff' }],
      output: null,
    },
    {
      // A comparison inside a callback sits in a scope the emit guard never
      // inspects — a parameter named `diff` there would capture the rewrite —
      // so the walk stops at the function boundary and the fix is declined.
      code: `function hasConfigChanged(oldConfig, newConfig) {
  return newConfig.entries.some((entry, index) =>
    JSON.stringify(oldConfig.entries[index]) !== JSON.stringify(entry),
  );
}`,
      errors: [{ messageId: 'enforceMicrodiff' }],
      output: null,
    },
    {
      // The parameter shadow still blocks the emit, and the surviving body is
      // the original one rather than a re-emitted single return.
      code: `function hasConfigChanged(diff, newConfig) {
  recordComparison(diff, newConfig);
  return JSON.stringify(diff) !== JSON.stringify(newConfig);
}`,
      errors: [{ messageId: 'enforceMicrodiff' }],
      output: null,
    },
    {
      // A file already importing the fork gets its competing import removed
      // rather than a second binding of `diff` (TS2300).
      code: `import diff from '@blumintinc/microdiff';
import { diff as deepDiff } from 'deep-diff';

function compareConfigs(oldConfig, newConfig) {
  return deepDiff(oldConfig, newConfig);
}`,
      errors: [
        {
          messageId: 'enforceMicrodiffImport',
          data: { importSource: 'deep-diff' },
        },
        { messageId: 'enforceMicrodiff' },
      ],
      output: `import diff from '@blumintinc/microdiff';


function compareConfigs(oldConfig, newConfig) {
  return diff(oldConfig, newConfig);
}`,
    },
    {
      // The competing import precedes the fork's, so it is fixed before the
      // visitor ever reaches the fork. Reading `Program.body` rather than a flag
      // the visitor raises is what keeps the second binding from being emitted.
      code: `import { diff as deepDiff } from 'deep-diff';
import diff from '@blumintinc/microdiff';

function compareConfigs(oldConfig, newConfig) {
  return deepDiff(oldConfig, newConfig);
}`,
      errors: [
        {
          messageId: 'enforceMicrodiffImport',
          data: { importSource: 'deep-diff' },
        },
        { messageId: 'enforceMicrodiff' },
      ],
      output: `
import diff from '@blumintinc/microdiff';

function compareConfigs(oldConfig, newConfig) {
  return diff(oldConfig, newConfig);
}`,
    },
    {
      // A `'use client'` directive stops being one as soon as a statement
      // precedes it, so the emitted import lands below the prologue.
      code: `'use client';

function hasConfigChanged(oldConfig, newConfig) {
  return JSON.stringify(oldConfig) !== JSON.stringify(newConfig);
}`,
      errors: [{ messageId: 'enforceMicrodiff' }],
      output: `'use client';

import diff from '@blumintinc/microdiff';

function hasConfigChanged(oldConfig, newConfig) {
  return diff(oldConfig, newConfig).length > 0;
}`,
    },
    {
      // A `#!` shebang has to stay at character 0: anything above it leaves the
      // file unparseable.
      code: `#!/usr/bin/env node
function hasConfigChanged(oldConfig, newConfig) {
  return JSON.stringify(oldConfig) !== JSON.stringify(newConfig);
}`,
      errors: [{ messageId: 'enforceMicrodiff' }],
      output: `#!/usr/bin/env node
import diff from '@blumintinc/microdiff';

function hasConfigChanged(oldConfig, newConfig) {
  return diff(oldConfig, newConfig).length > 0;
}`,
    },
    {
      // A `// @ts-nocheck` header governs the file only from above its code, so
      // the import goes below the comment rather than over it.
      code: `// @ts-nocheck
function hasConfigChanged(oldConfig, newConfig) {
  return JSON.stringify(oldConfig) !== JSON.stringify(newConfig);
}`,
      errors: [{ messageId: 'enforceMicrodiff' }],
      output: `// @ts-nocheck
import diff from '@blumintinc/microdiff';

function hasConfigChanged(oldConfig, newConfig) {
  return diff(oldConfig, newConfig).length > 0;
}`,
    },
    {
      // The control for the three cases above: an existing import is the anchor,
      // and the directive in front of it still comes first. The normalized left
      // operand rides through as well, since the rewrite reads the comparison
      // rather than the signature.
      code: `'use client';
import { formatConfig } from './formatConfig';

function hasConfigChanged(oldConfig, newConfig) {
  return JSON.stringify(formatConfig(oldConfig)) !== JSON.stringify(newConfig);
}`,
      errors: [{ messageId: 'enforceMicrodiff' }],
      output: `'use client';
import diff from '@blumintinc/microdiff';
import { formatConfig } from './formatConfig';

function hasConfigChanged(oldConfig, newConfig) {
  return diff(formatConfig(oldConfig), newConfig).length > 0;
}`,
    },
  ],
});
