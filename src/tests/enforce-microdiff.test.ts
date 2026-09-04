import { Linter, Rule } from 'eslint';
import * as typescriptParser from '@typescript-eslint/parser';
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
    // The file's own `diffArrays`, with no import anywhere. The name is a
    // candidate for a report and nothing more: what it binds is a local
    // function, so renaming its calls would swap in a change list for whatever
    // that function computes.
    {
      code: `function diffArrays(a, b) {
  return [a, b];
}

export const changes = diffArrays(oldItems, newItems);`,
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
    // Using the jsdiff `diff` package. Reported at both sites and rewritten at
    // neither: `diffArrays` is a Myers SEQUENCE diff whose runs of
    // `{value, added, removed, count}` are not microdiff's per-path change
    // list, so the rename compiles and silently answers a different question
    // (#2322). Retiring the import alongside it would strand `diffArrays`.
    {
      code: `import { diffArrays } from 'diff';

function compareArrays(oldArray, newArray) {
  return diffArrays(oldArray, newArray);
}`,
      errors: [
        { messageId: 'enforceMicrodiffImport', data: { importSource: 'diff' } },
        {
          messageId: 'enforceMicrodiffManual',
          data: { importSource: 'diff' },
        },
      ],
      output: null,
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
    // Using fast-diff, which diffs STRINGS: its operands satisfy neither half
    // of microdiff's `Record<string, unknown> | unknown[]` bound, so the rename
    // is TS2345 unconditionally (#2322). Reported at both sites, rewritten at
    // neither.
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
          messageId: 'enforceMicrodiffManual',
          data: { importSource: 'fast-diff' },
        },
      ],
      output: null,
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
      output: null,
      errors: [
        {
          messageId: 'enforceMicrodiffImport',
          data: { importSource: 'fast-diff' },
        },
        {
          messageId: 'enforceMicrodiffManual',
          data: { importSource: 'fast-diff' },
        },
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
      output: null,
      errors: [
        {
          messageId: 'enforceMicrodiffImport',
          data: { importSource: 'fast-diff' },
        },
        {
          messageId: 'enforceMicrodiffManual',
          data: { importSource: 'fast-diff' },
        },
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
      // The competing import binds `diff` under that very name, yet no fix
      // retires it: jsdiff is left for manual conversion (#2322). The name it
      // occupies is therefore not the fix's to claim — writing microdiff's
      // import beside a surviving `import { diff } from 'diff'` is TS2300 — so
      // the whole file comes out of the pass unchanged.
      code: `import { diff } from 'diff';

function compareArrays(oldArray, newArray) {
  return diff(oldArray, newArray);
}`,
      errors: [
        { messageId: 'enforceMicrodiffImport', data: { importSource: 'diff' } },
        {
          messageId: 'enforceMicrodiffManual',
          data: { importSource: 'diff' },
        },
      ],
      output: null,
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
      // A default import binds no specifier the import handler tracks, so the
      // call resolves through the name-only path — and the withholding has to
      // cover that path too, or `fast-diff` is rewritten by the route the
      // tracked branch does not see.
      code: `import fastDiff from 'fast-diff';

function findChanges(oldItems, newItems) {
  return fastDiff(oldItems, newItems);
}`,
      errors: [
        {
          messageId: 'enforceMicrodiffImport',
          data: { importSource: 'fast-diff' },
        },
        {
          messageId: 'enforceMicrodiffManual',
          data: { importSource: 'fast-diff' },
        },
      ],
      output: null,
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
      // in place alongside the call it binds. The library it resolves to
      // withholds the rewrite on its own account as well, so the report names
      // the manual conversion.
      code: `import { fastDiff } from 'fast-diff';
const diff = 1;

function run(objA, objB) {
  return fastDiff(objA, objB);
}`,
      output: null,
      errors: [
        {
          messageId: 'enforceMicrodiffImport',
          data: { importSource: 'fast-diff' },
        },
        {
          messageId: 'enforceMicrodiffManual',
          data: { importSource: 'fast-diff' },
        },
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
      // computes something else entirely.
      //
      // The import is not retired either. Its reference list is empty precisely
      // because the shadow answers the calls, so writing microdiff's import over
      // it binds a `diff` no code reads: the file goes into the fix carrying one
      // unused import and comes out carrying another, which the consumer's
      // `no-unused-vars` and `noUnusedLocals` both fail the build on (#1903).
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
      output: null,
    },
    {
      // The same shape with the fork already imported and used: the competing
      // import is dropped rather than rewritten, so nothing new is bound and the
      // `diff` the file does read survives. Over-eager removal of a live `diff`
      // is the worse bug, and this is the fixture that pins it.
      code: `import diff from '@blumintinc/microdiff';
import { detailedDiff } from 'deep-object-diff';

export function compare(oldState, newState) {
  const detailedDiff = (a, b) => [a, b];
  return diff(oldState, newState).length + detailedDiff(oldState, newState).length;
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
  return diff(oldState, newState).length + detailedDiff(oldState, newState).length;
}`,
    },
    {
      // An import nothing references at all is the same trade in its plainest
      // form: replacing it swaps one unread name for another.
      code: `import { detailedDiff } from 'deep-object-diff';

export const answer = 1;`,
      errors: [
        {
          messageId: 'enforceMicrodiffImport',
          data: { importSource: 'deep-object-diff' },
        },
      ],
      output: null,
    },
    {
      // Declining the import rewrite holds up nothing else in the file: the
      // comparison below is still converted, and the import it emits is what
      // retires the competing declaration on the following pass.
      code: `import { detailedDiff } from 'deep-object-diff';

export function compare(oldState, newState) {
  const detailedDiff = (a, b) => [a, b];
  return detailedDiff(oldState, newState);
}

export function hasConfigChanged(oldConfig, newConfig) {
  return JSON.stringify(oldConfig) !== JSON.stringify(newConfig);
}`,
      errors: [
        {
          messageId: 'enforceMicrodiffImport',
          data: { importSource: 'deep-object-diff' },
        },
        { messageId: 'enforceMicrodiff' },
      ],
      output: `import diff from '@blumintinc/microdiff';
import { detailedDiff } from 'deep-object-diff';

export function compare(oldState, newState) {
  const detailedDiff = (a, b) => [a, b];
  return detailedDiff(oldState, newState);
}

export function hasConfigChanged(oldConfig, newConfig) {
  return diff(oldConfig, newConfig).length > 0;
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
      // A parameter shadows the import for the whole function body, which
      // leaves the import serving no call to rewrite.
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
      output: null,
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
      output: null,
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
      // An existing microdiff import binds the emitted `diff` whatever happens
      // to the competing declaration, which is exactly when a rename can strand
      // the binding it stops referencing: `applyChange` keeps the declaration
      // alive, and rewriting the only call of `deepDiff` would leave that
      // specifier bound to nothing (#1903).
      code: `import diff from '@blumintinc/microdiff';
import { diff as deepDiff, applyChange } from 'deep-diff';

export function compare(oldConfig, newConfig) {
  applyChange(oldConfig, newConfig);
  return deepDiff(oldConfig, newConfig).length + diff(oldConfig, newConfig).length;
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
      // The control for that gate: a reference the rename leaves alone keeps the
      // specifier read, so the call is still converted. Declining here would
      // trade the orphan for a rule that stops fixing what it can.
      code: `import diff from '@blumintinc/microdiff';
import { detailedDiff } from 'deep-object-diff';

export const chosen = detailedDiff;
export const changes = detailedDiff(oldState, newState);`,
      errors: [
        {
          messageId: 'enforceMicrodiffImport',
          data: { importSource: 'deep-object-diff' },
        },
        { messageId: 'enforceMicrodiff' },
      ],
      output: `import diff from '@blumintinc/microdiff';
import { detailedDiff } from 'deep-object-diff';

export const chosen = detailedDiff;
export const changes = diff(oldState, newState);`,
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
    {
      // An arrow carries the same rewrite its `function` twin gets: the same
      // violation is auto-remediable in either spelling. A concise body needs
      // no `return` and no semicolon, which the rewrite never has to reason
      // about because it replaces the comparison rather than the body.
      code: `export const hasConfigChanged = (a, b) => JSON.stringify(a) !== JSON.stringify(b);`,
      errors: [{ messageId: 'enforceMicrodiff' }],
      output: `import diff from '@blumintinc/microdiff';

export const hasConfigChanged = (a, b) => diff(a, b).length > 0;`,
    },
    {
      // A concise body split across lines keeps its layout: only the
      // comparison's own range moves.
      code: `export const hasConfigChanged = (oldConfig, newConfig) =>
  JSON.stringify(oldConfig) !== JSON.stringify(newConfig);`,
      errors: [{ messageId: 'enforceMicrodiff' }],
      output: `import diff from '@blumintinc/microdiff';

export const hasConfigChanged = (oldConfig, newConfig) =>
  diff(oldConfig, newConfig).length > 0;`,
    },
    {
      // A block-bodied arrow behaves exactly as the declaration does, down to
      // the statements the comparison shares the body with.
      code: `export const hasConfigChanged = (oldConfig, newConfig) => {
  recordComparison(oldConfig, newConfig);
  return JSON.stringify(oldConfig) !== JSON.stringify(newConfig);
};`,
      errors: [{ messageId: 'enforceMicrodiff' }],
      output: `import diff from '@blumintinc/microdiff';

export const hasConfigChanged = (oldConfig, newConfig) => {
  recordComparison(oldConfig, newConfig);
  return diff(oldConfig, newConfig).length > 0;
};`,
    },
    {
      // The signature is outside the replaced range, so the `export`, the
      // parameter annotations and the return annotation all survive.
      code: `export const hasConfigChanged = (oldConfig: object, newConfig: object): boolean =>
  JSON.stringify(oldConfig) !== JSON.stringify(newConfig);`,
      errors: [{ messageId: 'enforceMicrodiff' }],
      output: `import diff from '@blumintinc/microdiff';

export const hasConfigChanged = (oldConfig: object, newConfig: object): boolean =>
  diff(oldConfig, newConfig).length > 0;`,
    },
    {
      // An existing microdiff import is reused rather than duplicated: a second
      // binding of `diff` is TS2300.
      code: `import diff from '@blumintinc/microdiff';

export const hasConfigChanged = (oldConfig, newConfig) =>
  JSON.stringify(oldConfig) !== JSON.stringify(newConfig);`,
      errors: [{ messageId: 'enforceMicrodiff' }],
      output: `import diff from '@blumintinc/microdiff';

export const hasConfigChanged = (oldConfig, newConfig) =>
  diff(oldConfig, newConfig).length > 0;`,
    },
    {
      // The sense comes off the comparison's own operator in an arrow too, so
      // an `===` body reached through an unrelated `!==` inverts to an empty
      // change list.
      code: `export const hasConfigChanged = (oldConfig, newConfig) => {
  if (oldConfig.id !== newConfig.id) {
    return true;
  }
  return JSON.stringify(oldConfig) === JSON.stringify(newConfig);
};`,
      errors: [{ messageId: 'enforceMicrodiff' }],
      output: `import diff from '@blumintinc/microdiff';

export const hasConfigChanged = (oldConfig, newConfig) => {
  if (oldConfig.id !== newConfig.id) {
    return true;
  }
  return diff(oldConfig, newConfig).length === 0;
};`,
    },
    {
      // A nested arrow takes the import to module scope, where the grammar
      // allows it.
      code: `export function outer() {
  const hasConfigChanged = (oldConfig, newConfig) =>
    JSON.stringify(oldConfig) !== JSON.stringify(newConfig);
  return hasConfigChanged;
}`,
      errors: [{ messageId: 'enforceMicrodiff' }],
      output: `import diff from '@blumintinc/microdiff';

export function outer() {
  const hasConfigChanged = (oldConfig, newConfig) =>
    diff(oldConfig, newConfig).length > 0;
  return hasConfigChanged;
}`,
    },
    {
      // A parameter named `diff` captures the emitted call, so the arrow
      // declines the fix exactly as the declaration does.
      code: `export const hasConfigChanged = (diff, newConfig) =>
  JSON.stringify(diff) !== JSON.stringify(newConfig);`,
      errors: [{ messageId: 'enforceMicrodiff' }],
      output: null,
    },
    {
      // Two comparisons leave the rule no way to tell which one the arrow's
      // answer turns on, so the report stands without a fix.
      code: `export const hasConfigChanged = (oldConfig, newConfig) => {
  if (JSON.stringify(oldConfig.a) !== JSON.stringify(newConfig.a)) {
    return true;
  }
  return JSON.stringify(oldConfig.b) !== JSON.stringify(newConfig.b);
};`,
      errors: [{ messageId: 'enforceMicrodiff' }],
      output: null,
    },
    {
      // A comparison inside a callback sits in a scope the emit guard never
      // inspects, so the walk stops at the function boundary and the arrow is
      // left for the author.
      code: `export const hasConfigChanged = (oldConfig, newConfig) =>
  newConfig.entries.some((entry, index) =>
    JSON.stringify(oldConfig.entries[index]) !== JSON.stringify(entry),
  );`,
      errors: [{ messageId: 'enforceMicrodiff' }],
      output: null,
    },
    {
      // An all-`===` body is reported without a fix in either spelling: the
      // arrow mirrors the declaration's gate rather than widening it.
      code: `export const hasConfigChanged = (oldConfig, newConfig) =>
  JSON.stringify(oldConfig) === JSON.stringify(newConfig);`,
      errors: [{ messageId: 'enforceMicrodiff' }],
      output: null,
    },
    {
      // The control for that gate: the same all-`===` body as a declaration is
      // reported without a fix too.
      code: `export function hasConfigChanged(oldConfig, newConfig) {
  return JSON.stringify(oldConfig) === JSON.stringify(newConfig);
}`,
      errors: [{ messageId: 'enforceMicrodiff' }],
      output: null,
    },
    {
      // The rewrite is keyed on one name in either spelling, so the other
      // comparison-ish names keep reporting without a fix.
      code: `export const compareObjects = (oldConfig, newConfig) =>
  JSON.stringify(oldConfig) !== JSON.stringify(newConfig);`,
      errors: [{ messageId: 'enforceMicrodiff' }],
      output: null,
    },
    {
      // The control for that one: the declaration spelling of the same name is
      // reported without a fix as well.
      code: `export function compareObjects(oldConfig, newConfig) {
  return JSON.stringify(oldConfig) !== JSON.stringify(newConfig);
}`,
      errors: [{ messageId: 'enforceMicrodiff' }],
      output: null,
    },
    {
      // What this rule writes is SHORTER than what it replaces, so a wrap the
      // author needed for the old text is dead weight around the new one. A
      // formatter joins it on its next run, and agora runs the formatter and
      // `--fix` over the same tree, so leaving the wrap is a diff that never
      // settles (#2116). Parentheses written purely to break the line are taken
      // back with it.
      code: `function hasConfigChanged(oldConfig, newConfig) {
  return (
    JSON.stringify(oldConfig.settings) !== JSON.stringify(newConfig.settings)
  );
}`,
      errors: [{ messageId: 'enforceMicrodiff' }],
      output: `import diff from '@blumintinc/microdiff';

function hasConfigChanged(oldConfig, newConfig) {
  return diff(oldConfig.settings, newConfig.settings).length > 0;
}`,
    },
    {
      // The other wrap worth taking back: a break between the token that
      // introduces the expression and the expression itself.
      code: `export const hasConfigChanged = (a, b) =>
  JSON.stringify(a) !== JSON.stringify(b);`,
      errors: [{ messageId: 'enforceMicrodiff' }],
      output: `import diff from '@blumintinc/microdiff';

export const hasConfigChanged = (a, b) => diff(a, b).length > 0;`,
    },
    {
      // A comment inside the parentheses is the group the author wrote it into,
      // so the pair stays and the wrap with it.
      code: `function hasConfigChanged(a, b) {
  return (
    // keep
    JSON.stringify(a) !== JSON.stringify(b)
  );
}`,
      errors: [{ messageId: 'enforceMicrodiff' }],
      output: `import diff from '@blumintinc/microdiff';

function hasConfigChanged(a, b) {
  return (
    // keep
    diff(a, b).length > 0
  );
}`,
    },
    // #2322. jsdiff and fast-diff are reported and never rewritten, whatever
    // shape their operands take. Both sit in `DIFF_FUNCTION_NAMES` and
    // `COMPETING_DIFF_MODULES`, so detection is unchanged; the withholding is
    // keyed on the module the callee's binding RESOLVES to, which is the only
    // thing that separates jsdiff's `diffArrays` from a `deepDiff` the fix does
    // convert.
    {
      // Case A of the report: the rewrite compiles and answers a different
      // question. `diffArrays` groups its inputs into runs, so equal non-empty
      // arrays yield one kept run and `.length === 0` is false, where
      // microdiff's list is empty exactly when the inputs are deeply equal.
      code: `
import { diffArrays } from 'diff';
export const same = (a: string[], b: string[]) => diffArrays(a, b).length === 0;
`,
      errors: [
        { messageId: 'enforceMicrodiffImport', data: { importSource: 'diff' } },
        {
          messageId: 'enforceMicrodiffManual',
          data: { importSource: 'diff' },
        },
      ],
      output: null,
    },
    {
      // Case C of the report: `fast-diff` diffs strings, and `string` satisfies
      // neither half of `Record<string, unknown> | unknown[]`, so this arm can
      // never emit a rewrite that compiles (TS2345).
      code: `
import fastDiff from 'fast-diff';
export const changes = (a: string, b: string) => fastDiff(a, b);
`,
      errors: [
        {
          messageId: 'enforceMicrodiffImport',
          data: { importSource: 'fast-diff' },
        },
        {
          messageId: 'enforceMicrodiffManual',
          data: { importSource: 'fast-diff' },
        },
      ],
      output: null,
    },
    {
      // Case B of the report: jsdiff's third argument is a comparator bag, and
      // microdiff's is `Partial<MicrodiffOptions>` — `{cyclesFix, isAtomic,
      // isEqualAtomic}` — so carrying it across is TS2345 on the option name.
      code: `
import { diffArrays } from 'diff';
export const same = (a: string[], b: string[]) =>
  diffArrays(a, b, { comparator: (x, y) => x === y }).length === 0;
`,
      errors: [
        { messageId: 'enforceMicrodiffImport', data: { importSource: 'diff' } },
        {
          messageId: 'enforceMicrodiffManual',
          data: { importSource: 'diff' },
        },
      ],
      output: null,
    },
    {
      // The gate reads the binding, not the spelling: an alias off the
      // conventional name is withheld exactly as the conventional one is.
      code: `
import { diffArrays as seqDiff } from 'diff';
export const same = (a: string[], b: string[]) => seqDiff(a, b).length === 0;
`,
      errors: [
        { messageId: 'enforceMicrodiffImport', data: { importSource: 'diff' } },
        {
          messageId: 'enforceMicrodiffManual',
          data: { importSource: 'diff' },
        },
      ],
      output: null,
    },
    {
      // An arity the rewrite could not serve anyway still earns the report that
      // names the manual conversion, because the module decides before the
      // argument list does.
      code: `
import { diffArrays } from 'diff';
export const runs = (oldItems: string[]) => diffArrays(oldItems);
`,
      errors: [
        { messageId: 'enforceMicrodiffImport', data: { importSource: 'diff' } },
        {
          messageId: 'enforceMicrodiffManual',
          data: { importSource: 'diff' },
        },
      ],
      output: null,
    },
    {
      // A microdiff import already in the file unlocks nothing: the rewrite is
      // withheld on what jsdiff RETURNS, not on whether a `diff` is bound. The
      // competing import survives with it, so its call keeps a binding.
      code: `import diff from '@blumintinc/microdiff';
import { diffArrays } from 'diff';

export const runs = (oldItems, newItems) => diffArrays(oldItems, newItems);`,
      errors: [
        { messageId: 'enforceMicrodiffImport', data: { importSource: 'diff' } },
        {
          messageId: 'enforceMicrodiffManual',
          data: { importSource: 'diff' },
        },
      ],
      output: null,
    },
    {
      // A value reference of jsdiff's export has no call to rewrite, and the
      // import that binds it is left alone on the module's own account.
      code: `import { diffArrays } from 'diff';

export const chosen = diffArrays;`,
      errors: [
        { messageId: 'enforceMicrodiffImport', data: { importSource: 'diff' } },
      ],
      output: null,
    },
    {
      // The withholding is narrow. `deep-diff` is a structural per-path diff,
      // so its call and its import are converted exactly as before.
      code: `import { diff as deepDiff } from 'deep-diff';

export const changes = (oldConfig, newConfig) => deepDiff(oldConfig, newConfig);`,
      errors: [
        {
          messageId: 'enforceMicrodiffImport',
          data: { importSource: 'deep-diff' },
        },
        { messageId: 'enforceMicrodiff' },
      ],
      output: `import diff from '@blumintinc/microdiff';

export const changes = (oldConfig, newConfig) => diff(oldConfig, newConfig);`,
    },
    {
      // The same for `deep-object-diff`, the other structural differ the
      // migration targets.
      code: `import { detailedDiff } from 'deep-object-diff';

export const changes = (oldObj, newObj) => detailedDiff(oldObj, newObj);`,
      errors: [
        {
          messageId: 'enforceMicrodiffImport',
          data: { importSource: 'deep-object-diff' },
        },
        { messageId: 'enforceMicrodiff' },
      ],
      output: `import diff from '@blumintinc/microdiff';

export const changes = (oldObj, newObj) => diff(oldObj, newObj);`,
    },
    {
      // Both kinds in one file. The convertible import is retired and its call
      // renamed; jsdiff's import stays, so the `diffArrays` beside it is still
      // bound. Neither name comes out of the pass unresolved.
      code: `import { diffArrays } from 'diff';
import { diff as deepDiff } from 'deep-diff';

export const runs = (oldItems, newItems) => diffArrays(oldItems, newItems);
export const changes = (oldConfig, newConfig) => deepDiff(oldConfig, newConfig);`,
      errors: [
        { messageId: 'enforceMicrodiffImport', data: { importSource: 'diff' } },
        {
          messageId: 'enforceMicrodiffImport',
          data: { importSource: 'deep-diff' },
        },
        {
          messageId: 'enforceMicrodiffManual',
          data: { importSource: 'diff' },
        },
        { messageId: 'enforceMicrodiff' },
      ],
      output: `import { diffArrays } from 'diff';
import diff from '@blumintinc/microdiff';

export const runs = (oldItems, newItems) => diffArrays(oldItems, newItems);
export const changes = (oldConfig, newConfig) => diff(oldConfig, newConfig);`,
    },
    {
      // The same split with `fast-diff` on the withheld side, reached through
      // the name-only resolution path a default import takes.
      code: `import fastDiff from 'fast-diff';
import { detailedDiff } from 'deep-object-diff';

export const text = (a, b) => fastDiff(a, b);
export const changes = (oldObj, newObj) => detailedDiff(oldObj, newObj);`,
      errors: [
        {
          messageId: 'enforceMicrodiffImport',
          data: { importSource: 'fast-diff' },
        },
        {
          messageId: 'enforceMicrodiffImport',
          data: { importSource: 'deep-object-diff' },
        },
        {
          messageId: 'enforceMicrodiffManual',
          data: { importSource: 'fast-diff' },
        },
        { messageId: 'enforceMicrodiff' },
      ],
      output: `import fastDiff from 'fast-diff';
import diff from '@blumintinc/microdiff';

export const text = (a, b) => fastDiff(a, b);
export const changes = (oldObj, newObj) => diff(oldObj, newObj);`,
    },
    {
      // A default import of `fast-diff` read as a value as well as called. The
      // import survives the pass, so both references keep their binding.
      code: `import fastDiff from 'fast-diff';

export const chosen = fastDiff;
export const changes = (a: string, b: string) => fastDiff(a, b);`,
      errors: [
        {
          messageId: 'enforceMicrodiffImport',
          data: { importSource: 'fast-diff' },
        },
        {
          messageId: 'enforceMicrodiffManual',
          data: { importSource: 'fast-diff' },
        },
      ],
      output: null,
    },
  ],
});

// Taking a wrap back is conditional on the joined line FITTING: a wrap removed
// from a line that still overflows just moves the churn rather than ending it.
//
// This arm is driven through a bare `Linter` rather than declared as a fixture
// on purpose. Reaching it needs an emission wider than the print width, so the
// output is one a formatter must re-wrap — declaring it would put a knowingly
// non-fixed-point case into the corpus the #2116 sweep asserts over.
describe('enforce-microdiff: the wrap is taken back only when it fits', () => {
  const RULE_ID = '@blumintinc/blumint/enforce-microdiff';

  const fixOf = (code: string) => {
    const linter = new Linter();
    linter.defineParser(
      'ts',
      typescriptParser as unknown as Linter.ParserModule,
    );
    linter.defineRule(RULE_ID, enforceMicrodiff as unknown as Rule.RuleModule);
    return linter.verifyAndFix(
      code,
      {
        parser: 'ts',
        parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
        rules: { [RULE_ID]: 'error' },
      } as unknown as Linter.Config,
      { filename: 'x.ts' },
    );
  };

  it('keeps a wrap whose joined line would still overflow', () => {
    const fixed =
      fixOf(`function hasConfigChanged(oldConfiguration, newConfiguration) {
  return (
    JSON.stringify(oldConfiguration.deeplyNestedSettingsBag) !== JSON.stringify(newConfiguration.deeplyNestedSettingsBag)
  );
}`);

    // The comparison is still rewritten — declining the COLLAPSE must never
    // decline the rewrite that is the rule's whole purpose.
    expect(fixed.output).toContain('diff(');
    expect(fixed.output).toContain('.length > 0');
    // And the author's wrap is left where it was.
    expect(fixed.output).toContain('return (');
  });

  it('the collapse IS taken where the joined line fits', () => {
    // The positive control: without it the assertion above would pass on a
    // fixer that had simply stopped collapsing anywhere.
    const fixed = fixOf(`function hasConfigChanged(oldConfig, newConfig) {
  return (
    JSON.stringify(oldConfig.settings) !== JSON.stringify(newConfig.settings)
  );
}`);

    expect(fixed.output).toContain(
      'return diff(oldConfig.settings, newConfig.settings).length > 0;',
    );
    expect(fixed.output).not.toContain('return (');
  });
});
