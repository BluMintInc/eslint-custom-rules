import type { TestCaseError } from '@typescript-eslint/utils/dist/ts-eslint/RuleTester';
import { ruleTesterTs } from '../utils/ruleTester';
import { preferCloneDeep } from '../rules/prefer-clone-deep';

const message =
  'Nested spread copies only clone one level, so inner objects still point at the original and later mutations leak back. Use cloneDeep from functions/src/util/cloneDeep.ts and pass overrides as the second argument so the base object is deeply cloned before applying updates.';
// Cast keeps explicit message assertions while satisfying RuleTester typings that expect messageId-only errors.
const expectPreferCloneDeepError = {
  message,
} as unknown as TestCaseError<'preferCloneDeep'>;

// The fix fires only where the file already imports the helper (#1396), so every
// case that asserts a rewrite carries that import and every case without one
// asserts that the report stands unfixed.
const CLONE_DEEP_IMPORT = `import { cloneDeep } from 'functions/src/util/cloneDeep';`;

// Shared fixture for the filename cases: the flagged literal is identical across
// filenames, so only the path of the file under lint varies.
const backendCode = `const merged = { ...a, nested: { ...a.nested, value: 42 } };`;
const MERGED_OUTPUT = `const merged = cloneDeep(a, {
  nested: {
    value: 42
  }
} as const);`;

ruleTesterTs.run('prefer-clone-deep', preferCloneDeep, {
  valid: [
    // Single level spread is allowed
    {
      code: `const updatedUser = { ...user, active: true };`,
    },
    // Objects with functions should not trigger the rule
    {
      code: `
        const obj = {
          ...baseObj,
          method: () => console.log('Hello'),
          data: { ...otherData }
        };
      `,
    },
    // Objects with symbols should not trigger the rule
    {
      code: `
        const obj = {
          ...baseObj,
          [Symbol('id')]: 123,
          data: { ...otherData }
        };
      `,
    },
    // Single level spread with multiple properties
    {
      code: `
        const config = {
          ...defaultConfig,
          enabled: true,
          timeout: 5000,
          retries: 3
        };
      `,
    },
    // Single level spread with computed properties
    {
      code: `
        const key = 'dynamicKey';
        const obj = {
          ...baseObj,
          [key]: value,
          ['computed' + key]: otherValue
        };
      `,
    },
    // Object with class methods should not trigger
    {
      code: `
        class Example {
          getData() {
            return {
              ...this.baseData,
              handler: this.handleEvent.bind(this),
              cleanup: () => this.cleanup()
            };
          }
        }
      `,
    },
    // Object with getters/setters should not trigger
    {
      code: `
        const obj = {
          ...baseObj,
          get value() { return this._value; },
          set value(v) { this._value = v; }
        };
      `,
    },
    // Regression #1364: a getter beside a nested spread still suppresses the
    // report, so the rebuild never has to demote an accessor to a data property.
    {
      code: `
        const obj = {
          ...baseObj,
          nested: {
            ...baseObj.nested,
            get value() { return this._value; }
          }
        };
      `,
    },
    // Regression #1364: same for a setter nested beside a spread.
    {
      code: `
        const obj = {
          ...baseObj,
          nested: {
            ...baseObj.nested,
            set value(v) { this._value = v; }
          }
        };
      `,
    },
    // Regression #1364: same for a shorthand method nested beside a spread.
    {
      code: `
        const obj = {
          ...baseObj,
          nested: {
            ...baseObj.nested,
            run() { return 1; }
          }
        };
      `,
    },
    // Object with prototype methods should not trigger
    {
      code: `
        const obj = {
          ...baseObj,
          __proto__: protoObj,
          toString() { return 'custom'; }
        };
      `,
    },
    // Object with async functions should not trigger
    {
      code: `
        const obj = {
          ...baseObj,
          async fetch() { return await api.get(); },
          data: { ...otherData }
        };
      `,
    },
    // Object with generator functions should not trigger
    {
      code: `
        const obj = {
          ...baseObj,
          *generator() { yield 1; },
          data: { ...otherData }
        };
      `,
    },
    // Spread in array should not trigger
    {
      code: `
        const arr = [...items, { ...newItem }];
      `,
    },
    // Disabled with eslint comment
    {
      code: `
        // eslint-disable-next-line prefer-clone-deep
        const obj = {
          ...baseObj,
          nested: {
            ...baseObj.nested,
            value: 42
          }
        };
      `,
    },
    // Regression #1299: a top-level spread alongside a sibling nested object
    // literal that contains NO spread of its own is not a multi-level spread
    // chain — there is nothing for cloneDeep to protect, so it must not flag.
    {
      code: `const x = { ...prev, address: { city: 'X' } };`,
    },
    // Regression #1299: conditional-spread idiom with a sibling nested object,
    // still no spread nested inside a child object.
    {
      code: `const patch = { ...(condition && { field: 'value' }), other: { nested: true } };`,
    },
    // Regression #1299: an empty nested object has no inner spread at all.
    {
      code: `function f() { return { ...base, key: {} }; }`,
    },
    // Regression #1371: `...b`/`...c` copy objects unrelated to the base, so no
    // sub-object of `a` is hand-copied and nothing aliases twice.
    {
      code: `const x = { ...a, nested: { ...b, deeper: { ...c } } };`,
    },
    // Regression #1371: an ordinary two-source merge is not a partial deep copy.
    {
      code: `const merged: Foo = { ...a, nested: { ...b } };`,
    },
    // Regression #1371: the same unrelated merge two levels down.
    {
      code: `const merged = { ...a, x: { y: { ...b } } };`,
    },
    // Regression #1371: no base is spread at all, so there is nothing to
    // partially copy.
    {
      code: `const o = { x: { y: { ...b } } };`,
    },
    // Regression #1371: a MUI `sx` style object composed from a style constant.
    {
      code: `const sx = { '& .MuiInputBase-input': { ...variantStyle } } as const;`,
    },
    // Regression #1371: a lookup map whose entries each extend a shared style.
    {
      code: `const map = { bottomLeft: { ...OVERLAY_LAYER_SX, bottom: 4 }, topRight: { ...OVERLAY_LAYER_SX, top: 4 } };`,
    },
    // Regression #1371: merging two unrelated sources into one property.
    {
      code: `const newResult = { data: { ...oldHits, ...hits }, state: 1 };`,
    },
    // Regression #1371: the same merge beside a shorthand property.
    {
      code: `const options = { operation, details: { ...baseDetails, ...banDetails } };`,
    },
    // Regression #1371: the nested spread is rooted at a different base than the
    // top-level spread, so no sub-object of `a` is copied by hand.
    {
      code: `const m = { ...a, nested: { ...other.nested, v: 1 } };`,
    },
    // Regression #1371: `abc.x` merely shares a string prefix with `ab`; it is
    // not a sub-path of the spread base.
    {
      code: `const m = { ...ab, nested: { ...abc.x, v: 1 } };`,
    },
    /**
     * A nested literal that merges a DISTINCT source with a sub-path of the
     * base is a merge, not a partial deep copy: `sx` is a new object combining
     * DEFAULT_SX and props.sx, aliasing neither. cloneDeep cannot express it
     * (buildOverrideObject already declines the fix), so the report is noise.
     */
    {
      code: `const merged = { ...props, sx: { ...DEFAULT_SX, ...props?.sx } };`,
    },
    /** The same merge with the spreads reversed — no ordering escapes today. */
    {
      code: `const reversed = { ...props, sx: { ...props?.sx, ...DEFAULT_SX } };`,
    },
    /** Non-optional spelling, to pin that accessPathOf normalization is not the cause. */
    {
      code: `const merged = { ...a, sx: { ...b, ...a.sx } };`,
    },
    // Regression #1745: a third source does not turn the merge back into a
    // partial copy — the verdict is over ALL of a literal's sources.
    {
      code: `const merged = { ...props, sx: { ...DEFAULT_SX, ...props?.sx, ...themeSx } };`,
    },
    // Regression #1745: the mixed literal is exempt wherever it sits, so the
    // grouping cannot be an artifact of the first nesting level.
    {
      code: `const merged = { ...props, slotProps: { tooltip: { ...DEFAULT_SX, ...props.slotProps.tooltip } } };`,
    },
    // Regression #1745: a merge whose foreign source is itself a member path of
    // an unrelated object is still a merge.
    {
      code: `const merged = { ...props, sx: { ...theme.defaults.sx, ...props.sx } };`,
    },
  ],
  invalid: [
    // Basic nested spread
    {
      code: `${CLONE_DEEP_IMPORT}
        const result = {
          ...baseObj,
          data: {
            ...baseObj.data,
            nested: {
              ...baseObj.data.nested,
              value: 42
            }
          }
        };
      `,
      errors: [expectPreferCloneDeepError],
      output: `${CLONE_DEEP_IMPORT}
        const result = cloneDeep(baseObj, {
          data: {
            nested: {
              value: 42
            }
          }
        } as const);
      `,
    },
    // Complex membership object: the outer literal has no spread of its own, so
    // only the child that shallow-copies a base is rewritten.
    {
      code: `${CLONE_DEEP_IMPORT}
        const membership = {
          sender: 'unchanged',
          receiver: 'unchanged',
          membership: {
            ...membershipIncomplete,
            sender: {
              ...membershipIncomplete.sender,
              request: {
                ...membershipIncomplete.sender.request,
                status: 'accepted',
              },
            },
            receiver: {
              ...membershipIncomplete.receiver,
              request: {
                ...membershipIncomplete.receiver.request,
                status: 'accepted',
              },
            },
          },
        };
      `,
      errors: [expectPreferCloneDeepError],
      output: `${CLONE_DEEP_IMPORT}
        const membership = {
          sender: 'unchanged',
          receiver: 'unchanged',
          membership: cloneDeep(membershipIncomplete, {
            sender: {
              request: {
                status: 'accepted'
              }
            },
            receiver: {
              request: {
                status: 'accepted'
              }
            }
          } as const),
        };
      `,
    },
    // Nested spread with arrays: array values are copied verbatim, so the
    // `...newItem` element keeps every property it contributed (#1364).
    {
      code: `${CLONE_DEEP_IMPORT}
        const config = {
          ...baseConfig,
          features: {
            ...baseConfig.features,
            items: [
              ...baseConfig.features.items,
              {
                ...newItem,
                settings: {
                  ...newItem.settings,
                  enabled: true
                }
              }
            ]
          }
        };
      `,
      errors: [expectPreferCloneDeepError],
      output: `${CLONE_DEEP_IMPORT}
        const config = cloneDeep(baseConfig, {
          features: {
            items: [
              ...baseConfig.features.items,
              {
                ...newItem,
                settings: {
                  ...newItem.settings,
                  enabled: true
                }
              }
            ]
          }
        } as const);
      `,
    },
    // Multiple nested objects with computed properties
    {
      code: `${CLONE_DEEP_IMPORT}
        const key = 'config';
        const result = {
          ...baseObj,
          [key]: {
            ...baseObj[key],
            nested: {
              ...baseObj[key].nested,
              ['dynamic' + key]: {
                ...baseObj[key].nested['dynamic' + key],
                value: 42
              }
            }
          }
        };
      `,
      errors: [expectPreferCloneDeepError],
      output: `${CLONE_DEEP_IMPORT}
        const key = 'config';
        const result = cloneDeep(baseObj, {
          [key]: {
            nested: {
              ['dynamic' + key]: {
                value: 42
              }
            }
          }
        } as const);
      `,
    },
    // Deeply nested object with mixed content
    {
      code: `${CLONE_DEEP_IMPORT}
        const state = {
          ...prevState,
          ui: {
            ...prevState.ui,
            modal: {
              ...prevState.ui.modal,
              content: {
                ...prevState.ui.modal.content,
                form: {
                  ...prevState.ui.modal.content.form,
                  values: {
                    ...prevState.ui.modal.content.form.values,
                    submitted: true
                  }
                }
              }
            }
          }
        };
      `,
      errors: [expectPreferCloneDeepError],
      output: `${CLONE_DEEP_IMPORT}
        const state = cloneDeep(prevState, {
          ui: {
            modal: {
              content: {
                form: {
                  values: {
                    submitted: true
                  }
                }
              }
            }
          }
        } as const);
      `,
    },
    // Nested spread with conditional properties: a conditional spread carries
    // data the overrides object cannot express, so the fix is declined (#1364).
    // The helper import is present to prove the shape alone declines it.
    {
      code: `${CLONE_DEEP_IMPORT}
        const result = {
          ...baseObj,
          settings: {
            ...baseObj.settings,
            ...(condition ? {
              advanced: {
                ...baseObj.settings.advanced,
                enabled: true
              }
            } : {}),
            basic: {
              ...baseObj.settings.basic,
              value: 42
            }
          }
        };
      `,
      errors: [expectPreferCloneDeepError],
      output: null,
    },
    // Nested spread with template literals in property names
    {
      code: `${CLONE_DEEP_IMPORT}
        const prefix = 'test';
        const obj = {
          ...baseObj,
          [\`\${prefix}Config\`]: {
            ...baseObj[\`\${prefix}Config\`],
            nested: {
              ...baseObj[\`\${prefix}Config\`].nested,
              value: 42
            }
          }
        };
      `,
      errors: [expectPreferCloneDeepError],
      output: `${CLONE_DEEP_IMPORT}
        const prefix = 'test';
        const obj = cloneDeep(baseObj, {
          [\`\${prefix}Config\`]: {
            nested: {
              value: 42
            }
          }
        } as const);
      `,
    },
    // Nested spread with null coalescing: `...(base?.x ?? {})` is a defensive
    // spelling of `...base.x`, which cloneDeep already copies.
    {
      code: `${CLONE_DEEP_IMPORT}
        const config = {
          ...baseConfig,
          features: {
            ...(baseConfig?.features ?? {}),
            advanced: {
              ...(baseConfig?.features?.advanced ?? {}),
              enabled: true
            }
          }
        };
      `,
      errors: [expectPreferCloneDeepError],
      output: `${CLONE_DEEP_IMPORT}
        const config = cloneDeep(baseConfig, {
          features: {
            advanced: {
              enabled: true
            }
          }
        } as const);
      `,
    },
    // Regression #1396: a file that never imports the helper has no demonstrated
    // path to it, so the report stands without a fix rather than inserting an
    // import that may not resolve.
    {
      code: backendCode,
      errors: [expectPreferCloneDeepError],
      output: null,
    },
    // Regression #1364: an already-imported cloneDeep is not imported twice.
    {
      code: `${CLONE_DEEP_IMPORT}
${backendCode}`,
      errors: [expectPreferCloneDeepError],
      output: `${CLONE_DEEP_IMPORT}
${MERGED_OUTPUT}`,
    },
    // Regression #1364: a relative import of the same helper also counts as
    // already imported.
    {
      code: `import { cloneDeep } from '../util/cloneDeep';
${backendCode}`,
      errors: [expectPreferCloneDeepError],
      output: `import { cloneDeep } from '../util/cloneDeep';
${MERGED_OUTPUT}`,
    },
    // Regression #1396: importing a DIFFERENT export of the helper module leaves
    // `cloneDeep` unbound, and nothing in the file shows the module exports it,
    // so the fix is declined instead of extending that import.
    {
      code: `import { deepEqual } from 'functions/src/util/cloneDeep';
${backendCode}`,
      errors: [expectPreferCloneDeepError],
      output: null,
    },
    // Regression #1396: the same holds for a relative import of the module.
    {
      code: `import { deepEqual } from '../util/cloneDeep';
${backendCode}`,
      errors: [expectPreferCloneDeepError],
      output: null,
    },
    // Regression #1396: unrelated imports are no evidence either, so a file that
    // merely has an import statement gets no helper import written into it.
    {
      code: `import { useState } from 'react';
${backendCode}`,
      errors: [expectPreferCloneDeepError],
      output: null,
    },
    // Regression #1364: lodash's cloneDeep takes no overrides argument, so the
    // fix must not silently reuse that binding.
    {
      code: `import { cloneDeep } from 'lodash';
${backendCode}`,
      errors: [expectPreferCloneDeepError],
      output: null,
    },
    // Regression #1396: an aliased import binds the helper under another name,
    // leaving the `cloneDeep` the rewrite would call undefined.
    {
      code: `import { cloneDeep as clone } from 'functions/src/util/cloneDeep';
${backendCode}`,
      errors: [expectPreferCloneDeepError],
      output: null,
    },
    // Regression #1396: a specifier that appears only in a comment or a string
    // imports nothing.
    {
      code: `// import { cloneDeep } from 'functions/src/util/cloneDeep';
const helperModule = 'functions/src/util/cloneDeep';
${backendCode}`,
      errors: [expectPreferCloneDeepError],
      output: null,
    },
    // Regression #1364: a local binding of the same name would shadow the
    // helper, so the fix is declined.
    {
      code: `const cloneDeep = (base, overrides) => overrides;
${backendCode}`,
      errors: [expectPreferCloneDeepError],
      output: null,
    },
    // Regression #1364: a second top-level spread cannot be represented in the
    // overrides object; it used to be dropped.
    {
      code: `${CLONE_DEEP_IMPORT}
const merged = { ...a, ...b, nested: { ...a.nested, value: 42 } };`,
      errors: [expectPreferCloneDeepError],
      output: null,
    },
    // Regression #1364: a spread that is not the first property overrides the
    // keys declared before it, so dropping it changes precedence.
    {
      code: `${CLONE_DEEP_IMPORT}
const merged = { ...a, nested: { value: 42, ...a.nested } };`,
      errors: [expectPreferCloneDeepError],
      output: null,
    },
    // Computed keys and shorthand properties survive the rebuild.
    {
      code: `${CLONE_DEEP_IMPORT}
const merged = { ...a, nested: { ...a.nested, [key]: 42, value } };`,
      errors: [expectPreferCloneDeepError],
      output: `${CLONE_DEEP_IMPORT}
const merged = cloneDeep(a, {
  nested: {
    [key]: 42,
    value: value
  }
} as const);`,
    },
    // A nested object whose only content is the redundant base spread collapses
    // to an empty override, which cloneDeep leaves untouched.
    {
      code: `${CLONE_DEEP_IMPORT}
const merged = { ...a, nested: { ...a.nested } };`,
      errors: [expectPreferCloneDeepError],
      output: `${CLONE_DEEP_IMPORT}
const merged = cloneDeep(a, {
  nested: {}
} as const);`,
    },
    // Regression #1300: an outer literal without its own spread is no longer
    // wrapped in `cloneDeep(..., {} as const)` until ESLint's pass cap; only the
    // child that shallow-copies a base is rewritten.
    {
      code: `${CLONE_DEEP_IMPORT}
const wrapper = {
  keep: 1,
  child: {
    ...a,
    nested: { ...a.nested, value: 42 },
  },
};`,
      errors: [expectPreferCloneDeepError],
      output: `${CLONE_DEEP_IMPORT}
const wrapper = {
  keep: 1,
  child: cloneDeep(a, {
    nested: {
      value: 42
    }
  } as const),
};`,
    },
    // A non-null assertion is a spelling of the same base path.
    {
      code: `${CLONE_DEEP_IMPORT}
const merged = { ...a, nested: { ...a.nested!, value: 42 } };`,
      errors: [expectPreferCloneDeepError],
      output: `${CLONE_DEEP_IMPORT}
${MERGED_OUTPUT}`,
    },
    // String-literal keys map onto bracket access on the base path.
    {
      code: `${CLONE_DEEP_IMPORT}
const merged = { ...a, 'my-key': { ...a['my-key'], value: 42 } };`,
      errors: [expectPreferCloneDeepError],
      output: `${CLONE_DEEP_IMPORT}
const merged = cloneDeep(a, {
  'my-key': {
    value: 42
  }
} as const);`,
    },
    // Member-expression bases are supported (the #365 shape).
    {
      code: `${CLONE_DEEP_IMPORT}
const merged = { ...this.props.base, nested: { ...this.props.base.nested, value: 42 } };`,
      errors: [expectPreferCloneDeepError],
      output: `${CLONE_DEEP_IMPORT}
const merged = cloneDeep(this.props.base, {
  nested: {
    value: 42
  }
} as const);`,
    },
    // Regression #1364: a default import of the helper already provides the
    // binding, so the rewrite resolves.
    {
      code: `import cloneDeep from 'functions/src/util/cloneDeep';
${backendCode}`,
      errors: [expectPreferCloneDeepError],
      output: `import cloneDeep from 'functions/src/util/cloneDeep';
${MERGED_OUTPUT}`,
    },
    // Regression #1364: a type-only import provides no runtime value, and its
    // binding cannot be re-declared, so the fix is declined.
    {
      code: `import type { cloneDeep } from 'functions/src/util/cloneDeep';
${backendCode}`,
      errors: [expectPreferCloneDeepError],
      output: null,
    },
    // Regression #1364: same for an inline type specifier.
    {
      code: `import { type cloneDeep } from 'functions/src/util/cloneDeep';
${backendCode}`,
      errors: [expectPreferCloneDeepError],
      output: null,
    },
    // Regression #1364: a namespace import binds a module object, not the
    // helper function.
    {
      code: `import * as cloneDeep from 'functions/src/util/cloneDeep';
${backendCode}`,
      errors: [expectPreferCloneDeepError],
      output: null,
    },
    // Sibling children that each shallow-copy their own base are both rewritten
    // under the single report on the enclosing literal.
    {
      code: `${CLONE_DEEP_IMPORT}
const both = { one: { ...x, n: { ...x.n, v: 1 } }, two: { ...y, m: { ...y.m, v: 2 } } };`,
      errors: [expectPreferCloneDeepError],
      output: `${CLONE_DEEP_IMPORT}
const both = { one: cloneDeep(x, {
  n: {
    v: 1
  }
} as const), two: cloneDeep(y, {
  m: {
    v: 2
  }
} as const) };`,
    },
    // Regression #1371: a nested spread of a DIFFERENT sub-path of the same
    // base is still a partial deep copy — `a`'s other sub-objects keep aliasing
    // the original. The overrides object cannot express `...a.other`, so the
    // fix is declined.
    {
      code: `${CLONE_DEEP_IMPORT}
const m = { ...a, nested: { ...a.other, value: 42 } };`,
      errors: [expectPreferCloneDeepError],
      output: null,
    },
    // Regression #1371: the hand-copied sub-path can sit several levels down.
    {
      code: `${CLONE_DEEP_IMPORT}
const m = { ...a, x: { y: { ...a.x.y, v: 1 } } };`,
      errors: [expectPreferCloneDeepError],
      output: `${CLONE_DEEP_IMPORT}
const m = cloneDeep(a, {
  x: {
    y: {
      v: 1
    }
  }
} as const);`,
    },
    // Regression #1371: a computed sub-path of the base counts as a sub-path.
    {
      code: `${CLONE_DEEP_IMPORT}
const m = { ...a, [k]: { ...a[k], v: 1 } };`,
      errors: [expectPreferCloneDeepError],
      output: `${CLONE_DEEP_IMPORT}
const m = cloneDeep(a, {
  [k]: {
    v: 1
  }
} as const);`,
    },
    // Regression #1364: a shadowing binding in an enclosing scope also blocks
    // the fix.
    {
      code: `${CLONE_DEEP_IMPORT}
function outer() {
  const cloneDeep = 1;
  return { ...a, nested: { ...a.nested, value: 42 } };
}`,
      errors: [expectPreferCloneDeepError],
      output: null,
    },
    // Regression #1389/#1396: which specifier reaches the helper is a property of
    // the consuming project — the backend tier resolves only relative paths, the
    // frontend tier the bare form, and some consumers lack the module entirely —
    // so no filename earns a guessed import.
    {
      code: backendCode,
      filename: '/repo/functions/src/callable/tournament/updateTeam.ts',
      errors: [expectPreferCloneDeepError],
      output: null,
    },
    {
      code: backendCode,
      filename: '/repo/functions/src/index.ts',
      errors: [expectPreferCloneDeepError],
      output: null,
    },
    // A sibling of the helper is as close as a file can get and still gets none.
    {
      code: backendCode,
      filename: '/repo/functions/src/util/merge.ts',
      errors: [expectPreferCloneDeepError],
      output: null,
    },
    {
      code: backendCode,
      filename: '/repo/src/components/tournament/TeamCard.ts',
      errors: [expectPreferCloneDeepError],
      output: null,
    },
    {
      code: backendCode,
      filename: '/repo/functions/src/util/cloneDeep/index.ts',
      errors: [expectPreferCloneDeepError],
      output: null,
    },
    // Regression #1389: a backend file that already imports the helper
    // relatively is fixed, and gets no second import.
    {
      code: `import { cloneDeep } from '../util/cloneDeep';
${backendCode}`,
      filename: '/repo/functions/src/callable/updateTeam.ts',
      errors: [expectPreferCloneDeepError],
      output: `import { cloneDeep } from '../util/cloneDeep';
${MERGED_OUTPUT}`,
    },
    // Regression #1389: an existing bare import binds the name just as well, so
    // the rewrite reuses it.
    {
      code: `${CLONE_DEEP_IMPORT}
${backendCode}`,
      filename: '/repo/functions/src/callable/updateTeam.ts',
      errors: [expectPreferCloneDeepError],
      output: `${CLONE_DEEP_IMPORT}
${MERGED_OUTPUT}`,
    },
    // Regression #1396: the reported hazard from the issue, in a frontend file
    // with no helper import — reported, unfixed.
    {
      code: `const merged = { ...base, sx: { ...base.sx, color: 'red' } };`,
      filename: '/agora/src/components/DialogCentered.tsx',
      errors: [expectPreferCloneDeepError],
      output: null,
    },
    // Regression #1745: the exemption is per literal, so a sibling that IS a
    // pure partial copy still reports even though `merged` is a merge. The fix
    // is declined because the merge cannot be expressed as overrides.
    {
      code: `${CLONE_DEEP_IMPORT}
const both = { ...a, merged: { ...DEFAULTS, ...a.merged }, pure: { ...a.pure, v: 1 } };`,
      errors: [expectPreferCloneDeepError],
      output: null,
    },
    // Regression #1745: dropping the foreign source from the mixed literal
    // leaves a hand-written copy of `props.sx`, which is the hazard again.
    {
      code: `${CLONE_DEEP_IMPORT}
const merged = { ...props, sx: { ...props?.sx, color: 'red' } };`,
      errors: [expectPreferCloneDeepError],
      output: `${CLONE_DEEP_IMPORT}
const merged = cloneDeep(props, {
  sx: {
    color: 'red'
  }
} as const);`,
    },
    // Regression #1396: the same file with the helper imported is fixed, which
    // keeps the fixer reachable and the 🔧 badge honest.
    {
      code: `${CLONE_DEEP_IMPORT}
const merged = { ...base, sx: { ...base.sx, color: 'red' } };`,
      filename: '/agora/src/components/DialogCentered.tsx',
      errors: [expectPreferCloneDeepError],
      output: `${CLONE_DEEP_IMPORT}
const merged = cloneDeep(base, {
  sx: {
    color: 'red'
  }
} as const);`,
    },
    // Regression #2011 / #2032: a `const` assertion is legal only on a literal,
    // so leaving it wrapped around the emitted call is TS1355. A `const`
    // assertion applied DIRECTLY to the rewritten literal is absorbed instead:
    // the replaced range covers the assertion, and the emitted call already
    // carries `as const` on its overrides literal, which is the one place it
    // stays legal. This is the fixture the composed `--fix` produces once
    // `global-const-style` has appended `as const` first, so it must fix.
    {
      code: `${CLONE_DEEP_IMPORT}
const result = {
  ...baseObj,
  data: {
    ...baseObj.data,
    nested: {
      ...baseObj.data.nested,
      value: 42
    }
  }
} as const;`,
      errors: [expectPreferCloneDeepError],
      output: `${CLONE_DEEP_IMPORT}
const result = cloneDeep(baseObj, {
  data: {
    nested: {
      value: 42
    }
  }
} as const);`,
    },
    // Regression #2032: the exact text `global-const-style` leaves behind on
    // the reproduction — renamed AND `as const`-asserted — takes the rewrite.
    {
      code: `${CLONE_DEEP_IMPORT}
const RESULT = {
  ...baseObj,
  data: {
    ...baseObj.data,
    nested: {
      ...baseObj.data.nested,
      value: 42
    }
  }
} as const;`,
      errors: [expectPreferCloneDeepError],
      output: `${CLONE_DEEP_IMPORT}
const RESULT = cloneDeep(baseObj, {
  data: {
    nested: {
      value: 42
    }
  }
} as const);`,
    },
    // Regression #2032: the single-line spelling absorbs its assertion too.
    {
      code: `${CLONE_DEEP_IMPORT}
const result = { ...a, nested: { ...a.nested, value: 42 } } as const;`,
      errors: [expectPreferCloneDeepError],
      output: `${CLONE_DEEP_IMPORT}
const result = cloneDeep(a, {
  nested: {
    value: 42
  }
} as const);`,
    },
    // Regression #2032: the declaration kind does not change the rewrite.
    {
      code: `${CLONE_DEEP_IMPORT}
let result = { ...a, b: { ...a.b, c: 1 } } as const;`,
      errors: [expectPreferCloneDeepError],
      output: `${CLONE_DEEP_IMPORT}
let result = cloneDeep(a, {
  b: {
    c: 1
  }
} as const);`,
    },
    {
      code: `${CLONE_DEEP_IMPORT}
var result = { ...a, b: { ...a.b, c: 1 } } as const;`,
      errors: [expectPreferCloneDeepError],
      output: `${CLONE_DEEP_IMPORT}
var result = cloneDeep(a, {
  b: {
    c: 1
  }
} as const);`,
    },
    // Regression #2032: a returned literal carries the same assertion and
    // absorbs it the same way.
    {
      code: `${CLONE_DEEP_IMPORT}
function build() {
  return { ...a, b: { ...a.b, c: 1 } } as const;
}`,
      errors: [expectPreferCloneDeepError],
      output: `${CLONE_DEEP_IMPORT}
function build() {
  return cloneDeep(a, {
    b: {
      c: 1
    }
  } as const);
}`,
    },
    // Regression #2032: parentheses are not AST nodes, so the assertion is
    // still the literal's direct parent; the parentheses survive around the
    // call.
    {
      code: `${CLONE_DEEP_IMPORT}
const result = ({ ...a, b: { ...a.b, c: 1 } } as const);`,
      errors: [expectPreferCloneDeepError],
      output: `${CLONE_DEEP_IMPORT}
const result = (cloneDeep(a, {
  b: {
    c: 1
  }
} as const));`,
    },
    // Regression #2032: the rewritten literal is the inner one here (the #365
    // membership shape), and it is the operand of the assertion, so the
    // assertion is absorbed with it.
    {
      code: `${CLONE_DEEP_IMPORT}
const result = { key: ({ ...a, nested: { ...a.nested, value: 42 } } as const) };`,
      errors: [expectPreferCloneDeepError],
      output: `${CLONE_DEEP_IMPORT}
const result = { key: (cloneDeep(a, {
  nested: {
    value: 42
  }
} as const)) };`,
    },
    // Regression #2032: nested `const` assertions — one on the rewritten
    // literal and one on the literal enclosing it. The inner one is absorbed;
    // the outer one still applies to an object literal and is kept.
    {
      code: `${CLONE_DEEP_IMPORT}
const result = { key: ({ ...a, nested: { ...a.nested, value: 42 } } as const) } as const;`,
      errors: [expectPreferCloneDeepError],
      output: `${CLONE_DEEP_IMPORT}
const result = { key: (cloneDeep(a, {
  nested: {
    value: 42
  }
} as const)) } as const;`,
    },
    // Regression #2032: links AFTER the `const` assertion are legal on a call
    // expression, so they are kept while the `as const` itself is absorbed.
    {
      code: `${CLONE_DEEP_IMPORT}
const result = { ...a, nested: { ...a.nested, value: 42 } } as const as Foo;`,
      errors: [expectPreferCloneDeepError],
      output: `${CLONE_DEEP_IMPORT}
const result = cloneDeep(a, {
  nested: {
    value: 42
  }
} as const) as Foo;`,
    },
    {
      code: `${CLONE_DEEP_IMPORT}
const result = { ...a, nested: { ...a.nested, value: 42 } } as const satisfies Foo;`,
      errors: [expectPreferCloneDeepError],
      output: `${CLONE_DEEP_IMPORT}
const result = cloneDeep(a, {
  nested: {
    value: 42
  }
} as const) satisfies Foo;`,
    },
    {
      code: `${CLONE_DEEP_IMPORT}
const result = ({ ...a, nested: { ...a.nested, value: 42 } } as const)!;`,
      errors: [expectPreferCloneDeepError],
      output: `${CLONE_DEEP_IMPORT}
const result = (cloneDeep(a, {
  nested: {
    value: 42
  }
} as const))!;`,
    },
    // Regression #2011: a `const` assertion BEHIND another link is not the
    // literal's direct parent, so it cannot be absorbed without dropping the
    // intervening assertion, and it would still wrap the emitted call
    // (TS1355). The report stands; the fix is declined.
    {
      code: `${CLONE_DEEP_IMPORT}
const result = { ...a, b: { ...a.b, c: 1 } } as Foo as const;`,
      errors: [expectPreferCloneDeepError],
      output: null,
    },
    {
      code: `${CLONE_DEEP_IMPORT}
const result = { ...a, b: { ...a.b, c: 1 } } satisfies Foo as const;`,
      errors: [expectPreferCloneDeepError],
      output: null,
    },
    {
      code: `${CLONE_DEEP_IMPORT}
const result = { ...a, b: { ...a.b, c: 1 } }! as const;`,
      errors: [expectPreferCloneDeepError],
      output: null,
    },
    // Regression #2011: absorbing the direct `as const` still leaves a second
    // one wrapping the call, so a doubled assertion is declined.
    {
      code: `${CLONE_DEEP_IMPORT}
const result = { ...a, b: { ...a.b, c: 1 } } as const as const;`,
      errors: [expectPreferCloneDeepError],
      output: null,
    },
    // Regression #2011: `as Foo` is legal on a call expression, so it keeps its
    // fix and is NOT absorbed — a non-`const` assertion names a type the
    // rewrite must not drop.
    {
      code: `${CLONE_DEEP_IMPORT}
const result = { ...a, nested: { ...a.nested, value: 42 } } as Foo;`,
      errors: [expectPreferCloneDeepError],
      output: `${CLONE_DEEP_IMPORT}
const result = cloneDeep(a, {
  nested: {
    value: 42
  }
} as const) as Foo;`,
    },
    // Regression #2011: so is `satisfies Foo`.
    {
      code: `${CLONE_DEEP_IMPORT}
const result = { ...a, nested: { ...a.nested, value: 42 } } satisfies Foo;`,
      errors: [expectPreferCloneDeepError],
      output: `${CLONE_DEEP_IMPORT}
const result = cloneDeep(a, {
  nested: {
    value: 42
  }
} as const) satisfies Foo;`,
    },
    // Regression #2011: an assertion on an ENCLOSING literal survives the
    // rewrite legally, because it still applies to an object literal. The
    // rewritten literal is the inner one, which carries no assertion.
    {
      code: `${CLONE_DEEP_IMPORT}
const result = { key: { ...a, nested: { ...a.nested, value: 42 } } } as const;`,
      errors: [expectPreferCloneDeepError],
      output: `${CLONE_DEEP_IMPORT}
const result = { key: cloneDeep(a, {
  nested: {
    value: 42
  }
} as const) } as const;`,
    },
    // Regression #2011 control: the deeply nested shape from the issue with no
    // outer assertion still fixes normally.
    {
      code: `${CLONE_DEEP_IMPORT}
const result = {
  ...baseObj,
  data: {
    ...baseObj.data,
    nested: {
      ...baseObj.data.nested,
      value: 42
    }
  }
};`,
      errors: [expectPreferCloneDeepError],
      output: `${CLONE_DEEP_IMPORT}
const result = cloneDeep(baseObj, {
  data: {
    nested: {
      value: 42
    }
  }
} as const);`,
    },
  ],
});
