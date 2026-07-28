import type { TestCaseError } from '@typescript-eslint/utils/dist/ts-eslint/RuleTester';
import { ruleTesterTs } from '../utils/ruleTester';
import { preferCloneDeep } from '../rules/prefer-clone-deep';

const message =
  'Nested spread copies only clone one level, so inner objects still point at the original and later mutations leak back. Use cloneDeep from functions/src/util/cloneDeep.ts and pass overrides as the second argument so the base object is deeply cloned before applying updates.';
// Cast keeps explicit message assertions while satisfying RuleTester typings that expect messageId-only errors.
const expectPreferCloneDeepError = {
  message,
} as unknown as TestCaseError<'preferCloneDeep'>;

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
  ],
  invalid: [
    // Basic nested spread
    {
      code: `
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
      output: `import { cloneDeep } from 'functions/src/util/cloneDeep';

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
      code: `
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
      output: `import { cloneDeep } from 'functions/src/util/cloneDeep';

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
      code: `
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
      output: `import { cloneDeep } from 'functions/src/util/cloneDeep';

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
      code: `
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
      output: `import { cloneDeep } from 'functions/src/util/cloneDeep';

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
      code: `
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
      output: `import { cloneDeep } from 'functions/src/util/cloneDeep';

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
    {
      code: `
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
      code: `
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
      output: `import { cloneDeep } from 'functions/src/util/cloneDeep';

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
      code: `
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
      output: `import { cloneDeep } from 'functions/src/util/cloneDeep';

        const config = cloneDeep(baseConfig, {
          features: {
            advanced: {
              enabled: true
            }
          }
        } as const);
      `,
    },
    // Regression #1364: emitting the fix must also import cloneDeep, otherwise
    // the fixed file references an undefined identifier.
    {
      code: `const merged = { ...a, nested: { ...a.nested, value: 42 } };`,
      errors: [expectPreferCloneDeepError],
      output: `import { cloneDeep } from 'functions/src/util/cloneDeep';
const merged = cloneDeep(a, {
  nested: {
    value: 42
  }
} as const);`,
    },
    // Regression #1364: an already-imported cloneDeep is not imported twice.
    {
      code: `import { cloneDeep } from 'functions/src/util/cloneDeep';
const merged = { ...a, nested: { ...a.nested, value: 42 } };`,
      errors: [expectPreferCloneDeepError],
      output: `import { cloneDeep } from 'functions/src/util/cloneDeep';
const merged = cloneDeep(a, {
  nested: {
    value: 42
  }
} as const);`,
    },
    // Regression #1364: a relative import of the same helper also counts as
    // already imported.
    {
      code: `import { cloneDeep } from '../util/cloneDeep';
const merged = { ...a, nested: { ...a.nested, value: 42 } };`,
      errors: [expectPreferCloneDeepError],
      output: `import { cloneDeep } from '../util/cloneDeep';
const merged = cloneDeep(a, {
  nested: {
    value: 42
  }
} as const);`,
    },
    // Regression #1364: an existing import of the helper module is extended
    // instead of duplicated.
    {
      code: `import { deepEqual } from 'functions/src/util/cloneDeep';
const merged = { ...a, nested: { ...a.nested, value: 42 } };`,
      errors: [expectPreferCloneDeepError],
      output: `import { deepEqual, cloneDeep } from 'functions/src/util/cloneDeep';
const merged = cloneDeep(a, {
  nested: {
    value: 42
  }
} as const);`,
    },
    // Regression #1364: the import goes above the existing imports.
    {
      code: `import { useState } from 'react';
const merged = { ...a, nested: { ...a.nested, value: 42 } };`,
      errors: [expectPreferCloneDeepError],
      output: `import { cloneDeep } from 'functions/src/util/cloneDeep';
import { useState } from 'react';
const merged = cloneDeep(a, {
  nested: {
    value: 42
  }
} as const);`,
    },
    // Regression #1364: lodash's cloneDeep takes no overrides argument, so the
    // fix must not silently reuse that binding.
    {
      code: `import { cloneDeep } from 'lodash';
const merged = { ...a, nested: { ...a.nested, value: 42 } };`,
      errors: [expectPreferCloneDeepError],
      output: null,
    },
    // Regression #1364: a local binding of the same name would shadow the
    // helper, so the fix is declined.
    {
      code: `const cloneDeep = (base, overrides) => overrides;
const merged = { ...a, nested: { ...a.nested, value: 42 } };`,
      errors: [expectPreferCloneDeepError],
      output: null,
    },
    // Regression #1364: a second top-level spread cannot be represented in the
    // overrides object; it used to be dropped.
    {
      code: `const merged = { ...a, ...b, nested: { ...a.nested, value: 42 } };`,
      errors: [expectPreferCloneDeepError],
      output: null,
    },
    // Regression #1364: a spread that is not the first property overrides the
    // keys declared before it, so dropping it changes precedence.
    {
      code: `const merged = { ...a, nested: { value: 42, ...a.nested } };`,
      errors: [expectPreferCloneDeepError],
      output: null,
    },
    // Computed keys and shorthand properties survive the rebuild.
    {
      code: `const merged = { ...a, nested: { ...a.nested, [key]: 42, value } };`,
      errors: [expectPreferCloneDeepError],
      output: `import { cloneDeep } from 'functions/src/util/cloneDeep';
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
      code: `const merged = { ...a, nested: { ...a.nested } };`,
      errors: [expectPreferCloneDeepError],
      output: `import { cloneDeep } from 'functions/src/util/cloneDeep';
const merged = cloneDeep(a, {
  nested: {}
} as const);`,
    },
    // Regression #1300: an outer literal without its own spread is no longer
    // wrapped in `cloneDeep(..., {} as const)` until ESLint's pass cap; only the
    // child that shallow-copies a base is rewritten.
    {
      code: `const wrapper = {
  keep: 1,
  child: {
    ...a,
    nested: { ...a.nested, value: 42 },
  },
};`,
      errors: [expectPreferCloneDeepError],
      output: `import { cloneDeep } from 'functions/src/util/cloneDeep';
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
      code: `const merged = { ...a, nested: { ...a.nested!, value: 42 } };`,
      errors: [expectPreferCloneDeepError],
      output: `import { cloneDeep } from 'functions/src/util/cloneDeep';
const merged = cloneDeep(a, {
  nested: {
    value: 42
  }
} as const);`,
    },
    // String-literal keys map onto bracket access on the base path.
    {
      code: `const merged = { ...a, 'my-key': { ...a['my-key'], value: 42 } };`,
      errors: [expectPreferCloneDeepError],
      output: `import { cloneDeep } from 'functions/src/util/cloneDeep';
const merged = cloneDeep(a, {
  'my-key': {
    value: 42
  }
} as const);`,
    },
    // Member-expression bases are supported (the #365 shape).
    {
      code: `const merged = { ...this.props.base, nested: { ...this.props.base.nested, value: 42 } };`,
      errors: [expectPreferCloneDeepError],
      output: `import { cloneDeep } from 'functions/src/util/cloneDeep';
const merged = cloneDeep(this.props.base, {
  nested: {
    value: 42
  }
} as const);`,
    },
    // Regression #1364: a default import of the helper already provides the
    // binding, so no import is added.
    {
      code: `import cloneDeep from 'functions/src/util/cloneDeep';
const merged = { ...a, nested: { ...a.nested, value: 42 } };`,
      errors: [expectPreferCloneDeepError],
      output: `import cloneDeep from 'functions/src/util/cloneDeep';
const merged = cloneDeep(a, {
  nested: {
    value: 42
  }
} as const);`,
    },
    // Regression #1364: a type-only import provides no runtime value, and its
    // binding cannot be re-declared, so the fix is declined.
    {
      code: `import type { cloneDeep } from 'functions/src/util/cloneDeep';
const merged = { ...a, nested: { ...a.nested, value: 42 } };`,
      errors: [expectPreferCloneDeepError],
      output: null,
    },
    // Regression #1364: same for an inline type specifier.
    {
      code: `import { type cloneDeep } from 'functions/src/util/cloneDeep';
const merged = { ...a, nested: { ...a.nested, value: 42 } };`,
      errors: [expectPreferCloneDeepError],
      output: null,
    },
    // Regression #1364: a namespace import binds a module object, not the
    // helper function.
    {
      code: `import * as cloneDeep from 'functions/src/util/cloneDeep';
const merged = { ...a, nested: { ...a.nested, value: 42 } };`,
      errors: [expectPreferCloneDeepError],
      output: null,
    },
    // Sibling children that each shallow-copy their own base are both rewritten
    // under the single report on the enclosing literal.
    {
      code: `const both = { one: { ...x, n: { ...x.n, v: 1 } }, two: { ...y, m: { ...y.m, v: 2 } } };`,
      errors: [expectPreferCloneDeepError],
      output: `import { cloneDeep } from 'functions/src/util/cloneDeep';
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
      code: `const m = { ...a, nested: { ...a.other, value: 42 } };`,
      errors: [expectPreferCloneDeepError],
      output: null,
    },
    // Regression #1371: the hand-copied sub-path can sit several levels down.
    {
      code: `const m = { ...a, x: { y: { ...a.x.y, v: 1 } } };`,
      errors: [expectPreferCloneDeepError],
      output: `import { cloneDeep } from 'functions/src/util/cloneDeep';
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
      code: `const m = { ...a, [k]: { ...a[k], v: 1 } };`,
      errors: [expectPreferCloneDeepError],
      output: `import { cloneDeep } from 'functions/src/util/cloneDeep';
const m = cloneDeep(a, {
  [k]: {
    v: 1
  }
} as const);`,
    },
    // Regression #1364: a shadowing binding in an enclosing scope also blocks
    // the fix.
    {
      code: `function outer() {
  const cloneDeep = 1;
  return { ...a, nested: { ...a.nested, value: 42 } };
}`,
      errors: [expectPreferCloneDeepError],
      output: null,
    },
  ],
});
