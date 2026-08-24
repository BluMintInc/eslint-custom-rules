import { Linter, Rule } from 'eslint';
import { parse } from '@typescript-eslint/typescript-estree';
import { ruleTesterTs } from '../utils/ruleTester';
import { enforceFieldPathSyntaxInDocSetter } from '../rules/enforce-fieldpath-syntax-in-docsetter';

ruleTesterTs.run(
  'enforce-fieldpath-syntax-in-docsetter',
  enforceFieldPathSyntaxInDocSetter,
  {
    valid: [
      // Flat object: no nested fields to rewrite
      `
        const ds = new DocSetter();
        ds.set({ role: 'admin' });
      `,
      // Already in FieldPath syntax
      `
        const ds = new DocSetter();
        ds.updateIfExists({ 'roles.contributor': value });
      `,
      // Not a DocSetter instance
      `
        const other = new NotDocSetter();
        other.set({ roles: { contributor: value } });
      `,
      // Computed property should be ignored
      `
        const ds = new DocSetter();
        ds.set({ [dynamic]: { contributor: value } });
      `,
      // Numeric keys should be ignored
      `
        const ds = new DocSetter();
        ds.set({ 0: { id: 1 } });
      `,
      `
        const ds = new DocSetter();
        ds.set({ '1': { id: 2 } });
      `,
      // Mixed numeric and nested keys should be ignored entirely
      `
        const ds = new DocSetter();
        ds.set({
          0: { id: 1 },
          profile: { name: profileName },
        });
      `,
      // Nested array should not be flattened
      `
        const ds = new DocSetter();
        ds.set({ roles: [{ id: 1 }] });
      `,
      // Chained instantiation with flat object is allowed
      `
        new DocSetter().set({ role: 'admin' });
      `,
    ],
    invalid: [
      {
        code: `
          const ds = new DocSetter();
          ds.set({
            roles: { contributor: value },
          });
        `,
        output: `
          const ds = new DocSetter();
          ds.set({
            'roles.contributor': value,
          });
        `,
        errors: [{ messageId: 'enforceFieldPathSyntax' }],
      },
      {
        code: `
          const ds = new DocSetter();
          ds.set({
            id: docId,
            profile: { name: profileName },
          });
        `,
        output: `
          const ds = new DocSetter();
          ds.set({
            id: docId,
            'profile.name': profileName,
          });
        `,
        errors: [{ messageId: 'enforceFieldPathSyntax' }],
      },
      {
        code: `
          new DocSetter().updateIfExists({
            data: { title: title },
          });
        `,
        output: `
          new DocSetter().updateIfExists({
            'data.title': title,
          });
        `,
        errors: [{ messageId: 'enforceFieldPathSyntax' }],
      },
      // A disable directive above an untouched property must survive the fix:
      // dropping it silently re-enables the suppressed rule
      {
        code: `
const ds = new DocSetter();
ds.set({
  // eslint-disable-next-line no-console
  id: console.log('x'),
  profile: { name: profileName },
});
`,
        output: `
const ds = new DocSetter();
ds.set({
  // eslint-disable-next-line no-console
  id: console.log('x'),
  'profile.name': profileName,
});
`,
        errors: [{ messageId: 'enforceFieldPathSyntax' }],
      },
      // Original indentation of untouched lines must be preserved
      {
        code: `
function run() {
  if (ready) {
      const ds = new DocSetter();
      ds.set({
          id: docId,
          settings: { display: { theme: 'dark' } },
      });
  }
}
`,
        output: `
function run() {
  if (ready) {
      const ds = new DocSetter();
      ds.set({
          id: docId,
          'settings.display.theme': 'dark',
      });
  }
}
`,
        errors: [{ messageId: 'enforceFieldPathSyntax' }],
      },
      // Tab indentation is preserved
      {
        code: '\nconst ds = new DocSetter();\nds.set({\n\tid: docId,\n\tprofile: { name: profileName },\n});\n',
        output:
          "\nconst ds = new DocSetter();\nds.set({\n\tid: docId,\n\t'profile.name': profileName,\n});\n",
        errors: [{ messageId: 'enforceFieldPathSyntax' }],
      },
      // A comment above the property being flattened stays where it is
      {
        code: `
const ds = new DocSetter();
ds.set({
  // roles are additive
  roles: { contributor: value },
});
`,
        output: `
const ds = new DocSetter();
ds.set({
  // roles are additive
  'roles.contributor': value,
});
`,
        errors: [{ messageId: 'enforceFieldPathSyntax' }],
      },
      // A JSDoc block above an untouched property survives verbatim
      {
        code: `
const ds = new DocSetter();
ds.set({
  /**
   * The tournament document id.
   */
  id: docId,
  profile: { name: profileName },
});
`,
        output: `
const ds = new DocSetter();
ds.set({
  /**
   * The tournament document id.
   */
  id: docId,
  'profile.name': profileName,
});
`,
        errors: [{ messageId: 'enforceFieldPathSyntax' }],
      },
      // A directive inside the flattened property is carried onto the rewrite so
      // it still covers the line it suppressed
      {
        code: `
const ds = new DocSetter();
ds.set({
  roles: {
    // eslint-disable-next-line no-console
    contributor: console.log('x'),
  },
});
`,
        output: `
const ds = new DocSetter();
ds.set({
  // eslint-disable-next-line no-console
  'roles.contributor': console.log('x'),
});
`,
        errors: [{ messageId: 'enforceFieldPathSyntax' }],
      },
      // A comment between the key and its nested value is carried onto the rewrite
      {
        code: `
const ds = new DocSetter();
ds.set({
  profile: /* nested */ { name: profileName },
});
`,
        output: `
const ds = new DocSetter();
ds.set({
  /* nested */
  'profile.name': profileName,
});
`,
        errors: [{ messageId: 'enforceFieldPathSyntax' }],
      },
      // A trailing comment after the flattened property is outside the splice
      {
        code: `
const ds = new DocSetter();
ds.set({
  profile: { name: profileName }, // display name
});
`,
        output: `
const ds = new DocSetter();
ds.set({
  'profile.name': profileName, // display name
});
`,
        errors: [{ messageId: 'enforceFieldPathSyntax' }],
      },
      // Single-line payloads stay on one line, block comment included
      {
        code: `
const ds = new DocSetter();
ds.set({ roles: { /* additive */ contributor: value } });
`,
        output: `
const ds = new DocSetter();
ds.set({ /* additive */ 'roles.contributor': value });
`,
        errors: [{ messageId: 'enforceFieldPathSyntax' }],
      },
      {
        code: `
const ds = new DocSetter();
ds.set({ metadata: { version: '1.0', author: 'system' } });
`,
        output: `
const ds = new DocSetter();
ds.set({ 'metadata.version': '1.0', 'metadata.author': 'system' });
`,
        errors: [{ messageId: 'enforceFieldPathSyntax' }],
      },
      // Several nested levels collapse into multiple entries at the original indent
      {
        code: `
const ds = new DocSetter();
ds.set({
  settings: {
    // theme is user scoped
    display: { theme: 'dark', fontSize: 14 },
  },
});
`,
        output: `
const ds = new DocSetter();
ds.set({
  // theme is user scoped
  'settings.display.theme': 'dark',
  'settings.display.fontSize': 14,
});
`,
        errors: [{ messageId: 'enforceFieldPathSyntax' }],
      },
      // Each nested property is spliced independently; comments between them stay
      {
        code: `
const ds = new DocSetter();
ds.set({
  metadata: { version: '1.0' },
  // theme is user scoped
  settings: { theme: 'dark' },
});
`,
        output: `
const ds = new DocSetter();
ds.set({
  'metadata.version': '1.0',
  // theme is user scoped
  'settings.theme': 'dark',
});
`,
        errors: [{ messageId: 'enforceFieldPathSyntax' }],
      },
      // Missing trailing comma is not invented
      {
        code: `
const ds = new DocSetter();
ds.set({
  id: docId,
  roles: { first: 1, second: 2 }
});
`,
        output: `
const ds = new DocSetter();
ds.set({
  id: docId,
  'roles.first': 1,
  'roles.second': 2
});
`,
        errors: [{ messageId: 'enforceFieldPathSyntax' }],
      },
      // A spread nested below the top level cannot be flattened losslessly, so
      // that property is left alone instead of being deleted by the fix
      {
        code: `
const ds = new DocSetter();
ds.set({
  metadata: { version: '1.0' },
  nested: { inner: { ...extra } },
});
`,
        output: `
const ds = new DocSetter();
ds.set({
  'metadata.version': '1.0',
  nested: { inner: { ...extra } },
});
`,
        errors: [{ messageId: 'enforceFieldPathSyntax' }],
      },
      // Computed keys below the top level are likewise preserved
      {
        code: `
const ds = new DocSetter();
ds.set({
  metadata: { version: '1.0' },
  dynamic: { [key]: value },
});
`,
        output: `
const ds = new DocSetter();
ds.set({
  'metadata.version': '1.0',
  dynamic: { [key]: value },
});
`,
        errors: [{ messageId: 'enforceFieldPathSyntax' }],
      },
      // Accessors and methods have no FieldPath equivalent, so they are preserved
      {
        code: `
const ds = new DocSetter();
ds.set({
  metadata: { version: '1.0' },
  accessors: { get theme() { return 'dark'; } },
});
`,
        output: `
const ds = new DocSetter();
ds.set({
  'metadata.version': '1.0',
  accessors: { get theme() { return 'dark'; } },
});
`,
        errors: [{ messageId: 'enforceFieldPathSyntax' }],
      },
      // A method shorthand holds the same leaf value as `key: function () {}`,
      // so it flattens too. Its FunctionExpression text starts at the parameter
      // list, hence the re-emitted `function` keyword
      {
        code: `
const ds = new DocSetter();
ds.set({
  metadata: { version: '1.0' },
  handlers: { onDone() { return 1; } },
});
`,
        output: `
const ds = new DocSetter();
ds.set({
  'metadata.version': '1.0',
  'handlers.onDone': function () { return 1; },
});
`,
        errors: [{ messageId: 'enforceFieldPathSyntax' }],
      },
      // `async` sits ahead of the key, outside the value's range, so it has to
      // be re-emitted rather than copied
      {
        code: `
const ds = new DocSetter();
ds.set({
  handlers: { async onDone() { await go(); } },
});
`,
        output: `
const ds = new DocSetter();
ds.set({
  'handlers.onDone': async function () { await go(); },
});
`,
        errors: [{ messageId: 'enforceFieldPathSyntax' }],
      },
      // The generator star likewise precedes the key
      {
        code: `
const ds = new DocSetter();
ds.set({
  handlers: { *onDone() { yield 1; } },
});
`,
        output: `
const ds = new DocSetter();
ds.set({
  'handlers.onDone': function* () { yield 1; },
});
`,
        errors: [{ messageId: 'enforceFieldPathSyntax' }],
      },
      {
        code: `
const ds = new DocSetter();
ds.set({
  handlers: { async *onDone() { yield 1; } },
});
`,
        output: `
const ds = new DocSetter();
ds.set({
  'handlers.onDone': async function* () { yield 1; },
});
`,
        errors: [{ messageId: 'enforceFieldPathSyntax' }],
      },
      // Parameters, defaults and rest elements live inside the value's range
      {
        code: `
const ds = new DocSetter();
ds.set({
  handlers: { onDone(a, b = 2, ...rest) { return a + b + rest.length; } },
});
`,
        output: `
const ds = new DocSetter();
ds.set({
  'handlers.onDone': function (a, b = 2, ...rest) { return a + b + rest.length; },
});
`,
        errors: [{ messageId: 'enforceFieldPathSyntax' }],
      },
      // Type parameters open the value's range ahead of the parameter list
      {
        code: `
const ds = new DocSetter();
ds.set({
  handlers: { onDone<T>(x: T): T { return x; } },
});
`,
        output: `
const ds = new DocSetter();
ds.set({
  'handlers.onDone': function <T>(x: T): T { return x; },
});
`,
        errors: [{ messageId: 'enforceFieldPathSyntax' }],
      },
      // `this` is dynamically bound in both spellings, so the rewrite preserves it
      {
        code: `
const ds = new DocSetter();
ds.set({
  handlers: { onDone() { return this.value; } },
});
`,
        output: `
const ds = new DocSetter();
ds.set({
  'handlers.onDone': function () { return this.value; },
});
`,
        errors: [{ messageId: 'enforceFieldPathSyntax' }],
      },
      // A method beyond the second level flattens like any other leaf
      {
        code: `
const ds = new DocSetter();
ds.set({
  settings: { display: { render() { return 'dark'; } } },
});
`,
        output: `
const ds = new DocSetter();
ds.set({
  'settings.display.render': function () { return 'dark'; },
});
`,
        errors: [{ messageId: 'enforceFieldPathSyntax' }],
      },
      // A method alongside plain leaves in the same nested object
      {
        code: `
const ds = new DocSetter();
ds.set({
  handlers: { name: 'done', onDone() { return 1; } },
});
`,
        output: `
const ds = new DocSetter();
ds.set({
  'handlers.name': 'done',
  'handlers.onDone': function () { return 1; },
});
`,
        errors: [{ messageId: 'enforceFieldPathSyntax' }],
      },
      // A method key that is not an IdentifierName still quotes cleanly
      {
        code: `
const ds = new DocSetter();
ds.set({
  handlers: { 'on-done'() { return 1; } },
});
`,
        output: `
const ds = new DocSetter();
ds.set({
  'handlers.on-done': function () { return 1; },
});
`,
        errors: [{ messageId: 'enforceFieldPathSyntax' }],
      },
      // A method sharing its line with other code stays inline
      {
        code: `
const ds = new DocSetter();
ds.set({ handlers: { onDone() { return 1; } } });
`,
        output: `
const ds = new DocSetter();
ds.set({ 'handlers.onDone': function () { return 1; } });
`,
        errors: [{ messageId: 'enforceFieldPathSyntax' }],
      },
      // A computed method key has no FieldPath spelling, so the property survives
      {
        code: `
const ds = new DocSetter();
ds.set({
  metadata: { version: '1.0' },
  handlers: { [dynamic]() { return 1; } },
});
`,
        output: `
const ds = new DocSetter();
ds.set({
  'metadata.version': '1.0',
  handlers: { [dynamic]() { return 1; } },
});
`,
        errors: [{ messageId: 'enforceFieldPathSyntax' }],
      },
      // A setter runs on write rather than holding a value, so it is declined
      // exactly as a getter is
      {
        code: `
const ds = new DocSetter();
ds.set({
  metadata: { version: '1.0' },
  accessors: { set theme(value) { store(value); } },
});
`,
        output: `
const ds = new DocSetter();
ds.set({
  'metadata.version': '1.0',
  accessors: { set theme(value) { store(value); } },
});
`,
        errors: [{ messageId: 'enforceFieldPathSyntax' }],
      },
      {
        code: `
const ds = new DocSetter();
ds.set({
  accessors: { get theme() { return 'dark'; } },
});
`,
        output: null,
        errors: [{ messageId: 'enforceFieldPathSyntax' }],
      },
      // `super` resolves through the object literal's home object, which the
      // re-emitted function expression does not have, so the fix is withheld
      {
        code: `
const ds = new DocSetter();
ds.set({
  handlers: { onDone() { return super.toString(); } },
});
`,
        output: null,
        errors: [{ messageId: 'enforceFieldPathSyntax' }],
      },
      // An arrow inside the method inherits the same `super`
      {
        code: `
const ds = new DocSetter();
ds.set({
  handlers: { onDone() { return () => super.toString(); } },
});
`,
        output: null,
        errors: [{ messageId: 'enforceFieldPathSyntax' }],
      },
      // An empty nested object flattens to nothing, so the payload is reported
      // without a fix rather than having the property silently deleted
      {
        code: `
const ds = new DocSetter();
ds.set({
  empty: {},
});
`,
        output: null,
        errors: [{ messageId: 'enforceFieldPathSyntax' }],
      },
      // A computed key deep inside the only nested property leaves nothing that
      // can be expressed as a FieldPath, so the whole sub-document must survive
      {
        code: `
const setter = new DocSetter(ref);
await setter.set({
  id,
  roles: {
    owner: {
      [id]: {
        id,
        username,
      },
    },
  },
});
`,
        output: null,
        errors: [{ messageId: 'enforceFieldPathSyntax' }],
      },
      // An already dotted key gains the nested leaf
      {
        code: `
const ds = new DocSetter();
ds.set({
  'app.config': { version: 1 },
});
`,
        output: `
const ds = new DocSetter();
ds.set({
  'app.config.version': 1,
});
`,
        errors: [{ messageId: 'enforceFieldPathSyntax' }],
      },
      // A multiline leaf value keeps its own nesting but lands at the depth its
      // new enclosing scope implies, so prettier has nothing left to re-indent
      {
        code: `
const ds = new DocSetter();
ds.set({
  data: {
    tags: [
      'a',
      'b',
    ],
  },
});
`,
        output: `
const ds = new DocSetter();
ds.set({
  'data.tags': [
    'a',
    'b',
  ],
});
`,
        errors: [{ messageId: 'enforceFieldPathSyntax' }],
      },
      // A property sharing its line with other code but carrying a line comment
      // still has to break across lines to keep the comment from swallowing code
      {
        code: `
const ds = new DocSetter();
ds.set({ settings: {
  // themed
  theme: 'dark',
}, other: 1 });
`,
        output: `
const ds = new DocSetter();
ds.set({ // themed
  'settings.theme': 'dark', other: 1 });
`,
        errors: [{ messageId: 'enforceFieldPathSyntax' }],
      },
      // A nested object under `id` is flattened like any other nested property
      // instead of being emitted twice
      {
        code: `
const ds = new DocSetter();
ds.set({
  id: { nested: 1 },
});
`,
        output: `
const ds = new DocSetter();
ds.set({
  'id.nested': 1,
});
`,
        errors: [{ messageId: 'enforceFieldPathSyntax' }],
      },
      // Issue #2083: the body lifted out of the nested object lands two columns
      // shallower, so every line it brings with it has to move with it. Leaving
      // them at their old depth emits text prettier rewrites on sight.
      {
        code: `
const ds = new DocSetter();
ds.set({
  handlers: {
    *onDone() {
      yield 1;
    },
  },
});
`,
        output: `
const ds = new DocSetter();
ds.set({
  'handlers.onDone': function* () {
    yield 1;
  },
});
`,
        errors: [{ messageId: 'enforceFieldPathSyntax' }],
      },
      // Nesting inside the moved span is relative, so a multi-level body shifts
      // as a block rather than collapsing onto one column
      {
        code: `
const ds = new DocSetter();
ds.set({
  settings: {
    display: {
      render() {
        if (dark) {
          return 'dark';
        }
        return 'light';
      },
    },
  },
});
`,
        output: `
const ds = new DocSetter();
ds.set({
  'settings.display.render': function () {
    if (dark) {
      return 'dark';
    }
    return 'light';
  },
});
`,
        errors: [{ messageId: 'enforceFieldPathSyntax' }],
      },
      // The delta is read from the landing column, not assumed to be one nesting
      // step outwards: a leaf written shallower than its own key moves DEEPER
      {
        code: `
const ds = new DocSetter();
ds.set({
      data: {
  tags: [
    'a',
  ],
      },
});
`,
        output: `
const ds = new DocSetter();
ds.set({
      'data.tags': [
        'a',
      ],
});
`,
        errors: [{ messageId: 'enforceFieldPathSyntax' }],
      },
      // Padding a blank line would leave trailing whitespace, which is a
      // fixed-point failure of its own
      {
        code: `
const ds = new DocSetter();
ds.set({
      handlers: {
  onDone() {
    const a = 1;

    return a;
  },
      },
});
`,
        output: `
const ds = new DocSetter();
ds.set({
      'handlers.onDone': function () {
        const a = 1;

        return a;
      },
});
`,
        errors: [{ messageId: 'enforceFieldPathSyntax' }],
      },
      // Leading whitespace inside a template literal is part of the string's
      // VALUE, so the moved body is re-indented around it and the literal
      // survives byte for byte
      {
        code: `
const ds = new DocSetter();
ds.set({
  handlers: {
    onDone() {
      return \`first
  second
third\`;
    },
  },
});
`,
        output: `
const ds = new DocSetter();
ds.set({
  'handlers.onDone': function () {
    return \`first
  second
third\`;
  },
});
`,
        errors: [{ messageId: 'enforceFieldPathSyntax' }],
      },
      // The same holds when the literal is the relocated leaf itself
      {
        code: `
const ds = new DocSetter();
ds.set({
  data: {
    body: \`first
  second
third\`,
  },
});
`,
        output: `
const ds = new DocSetter();
ds.set({
  'data.body': \`first
  second
third\`,
});
`,
        errors: [{ messageId: 'enforceFieldPathSyntax' }],
      },
      // A tab-indented span shifts by whole tabs; measuring the delta in columns
      // would rewrite the file's indentation style
      {
        code: '\nconst ds = new DocSetter();\nds.set({\n\tdata: {\n\t\ttags: [\n\t\t\t1,\n\t\t],\n\t},\n});\n',
        output:
          "\nconst ds = new DocSetter();\nds.set({\n\t'data.tags': [\n\t\t1,\n\t],\n});\n",
        errors: [{ messageId: 'enforceFieldPathSyntax' }],
      },
      // Tabs landing in a space-indented object share no prefix to add or
      // remove, so the span is left where it was rather than guessing a width
      {
        code: '\nconst ds = new DocSetter();\nds.set({\n  data: {\n\t\ttags: [\n\t\t\t1,\n\t\t],\n  },\n});\n',
        output:
          "\nconst ds = new DocSetter();\nds.set({\n  'data.tags': [\n\t\t\t1,\n\t\t],\n});\n",
        errors: [{ messageId: 'enforceFieldPathSyntax' }],
      },
      // A hoisted comment is relocated text too: a `*`-aligned block realigns to
      // the depth it lands at, exactly as prettier would print it
      {
        code: `
const ds = new DocSetter();
ds.set({
  settings: {
    display: {
      /**
       * Theme is user scoped.
       */
      theme: 'dark',
    },
  },
});
`,
        output: `
const ds = new DocSetter();
ds.set({
  /**
   * Theme is user scoped.
   */
  'settings.display.theme': 'dark',
});
`,
        errors: [{ messageId: 'enforceFieldPathSyntax' }],
      },
      // A string continued with a backslash spans lines the same way a template
      // literal does, and its second line is likewise part of the value
      {
        code: "\nconst ds = new DocSetter();\nds.set({\n  handlers: {\n    onDone() {\n      return 'foo \\\nbar';\n    },\n  },\n});\n",
        output:
          "\nconst ds = new DocSetter();\nds.set({\n  'handlers.onDone': function () {\n    return 'foo \\\nbar';\n  },\n});\n",
        errors: [{ messageId: 'enforceFieldPathSyntax' }],
      },
      // A block comment that is not `*`-aligned carries prose in its interior
      // whitespace, so it is reproduced verbatim
      {
        code: `
const ds = new DocSetter();
ds.set({
  settings: {
    /* theme
       is user scoped */
    theme: 'dark',
  },
});
`,
        output: `
const ds = new DocSetter();
ds.set({
  /* theme
       is user scoped */
  'settings.theme': 'dark',
});
`,
        errors: [{ messageId: 'enforceFieldPathSyntax' }],
      },
      // Issue #2096: a comment inside a leaf value rides along in that value's
      // copied text, so hoisting it as well would emit it twice — once detached
      // from the statement it documents
      {
        code: `
const ds = new DocSetter();
ds.set({
  handlers: {
    onDone() {
      // keep
      return 1;
    },
  },
});
`,
        output: `
const ds = new DocSetter();
ds.set({
  'handlers.onDone': function () {
    // keep
    return 1;
  },
});
`,
        errors: [{ messageId: 'enforceFieldPathSyntax' }],
      },
      // A block comment inside the relocated body travels with it just as a line
      // comment does
      {
        code: `
const ds = new DocSetter();
ds.set({
  handlers: {
    onDone() {
      /* keep */
      return 1;
    },
  },
});
`,
        output: `
const ds = new DocSetter();
ds.set({
  'handlers.onDone': function () {
    /* keep */
    return 1;
  },
});
`,
        errors: [{ messageId: 'enforceFieldPathSyntax' }],
      },
      // The leaf value need not be a method shorthand: an arrow function's body
      // is copied verbatim too
      {
        code: `
const ds = new DocSetter();
ds.set({
  handlers: {
    onDone: () => {
      // keep
      return 1;
    },
  },
});
`,
        output: `
const ds = new DocSetter();
ds.set({
  'handlers.onDone': () => {
    // keep
    return 1;
  },
});
`,
        errors: [{ messageId: 'enforceFieldPathSyntax' }],
      },
      // Both channels at once: the comment between nested members is hoisted
      // above the entry, the one inside the leaf body stays where it was, and
      // neither is emitted twice
      {
        code: `
const ds = new DocSetter();
ds.set({
  handlers: {
    // hoisted
    onDone() {
      // keep
      return 1;
    },
  },
});
`,
        output: `
const ds = new DocSetter();
ds.set({
  // hoisted
  'handlers.onDone': function () {
    // keep
    return 1;
  },
});
`,
        errors: [{ messageId: 'enforceFieldPathSyntax' }],
      },
      // A comment between the key and its nested value is outside every leaf, so
      // it is still hoisted while the body comment stays put
      {
        code: `
const ds = new DocSetter();
ds.set({
  handlers: /* nested */ {
    onDone() {
      // keep
      return 1;
    },
  },
});
`,
        output: `
const ds = new DocSetter();
ds.set({
  /* nested */
  'handlers.onDone': function () {
    // keep
    return 1;
  },
});
`,
        errors: [{ messageId: 'enforceFieldPathSyntax' }],
      },
      // A directive inside the body governs the line beneath it, so duplicating
      // it above the entry would suppress a line its author never covered
      {
        code: `
const ds = new DocSetter();
ds.set({
  handlers: {
    onDone() {
      // eslint-disable-next-line no-console
      console.log('x');
    },
  },
});
`,
        output: `
const ds = new DocSetter();
ds.set({
  'handlers.onDone': function () {
    // eslint-disable-next-line no-console
    console.log('x');
  },
});
`,
        errors: [{ messageId: 'enforceFieldPathSyntax' }],
      },
      // A leaf that is a multi-line array literal carries its interior comment
      // the same way a function body does
      {
        code: `
const ds = new DocSetter();
ds.set({
  data: {
    tags: [
      // first
      'a',
      'b',
    ],
  },
});
`,
        output: `
const ds = new DocSetter();
ds.set({
  'data.tags': [
    // first
    'a',
    'b',
  ],
});
`,
        errors: [{ messageId: 'enforceFieldPathSyntax' }],
      },
      // A `*`-aligned block inside the body realigns with the code it moves
      // with, and is not also hoisted
      {
        code: `
const ds = new DocSetter();
ds.set({
  handlers: {
    onDone() {
      /**
       * Keep me.
       */
      return 1;
    },
  },
});
`,
        output: `
const ds = new DocSetter();
ds.set({
  'handlers.onDone': function () {
    /**
     * Keep me.
     */
    return 1;
  },
});
`,
        errors: [{ messageId: 'enforceFieldPathSyntax' }],
      },
      // A non-aligned block inside the body keeps its interior whitespace, which
      // is prose rather than layout
      {
        code: `
const ds = new DocSetter();
ds.set({
  handlers: {
    onDone() {
      /* keep
         me */
      return 1;
    },
  },
});
`,
        output: `
const ds = new DocSetter();
ds.set({
  'handlers.onDone': function () {
    /* keep
         me */
    return 1;
  },
});
`,
        errors: [{ messageId: 'enforceFieldPathSyntax' }],
      },
      // Each leaf keeps its own body comment; no comment migrates to a sibling
      // entry or is repeated above the pair
      {
        code: `
const ds = new DocSetter();
ds.set({
  handlers: {
    onStart() {
      // start
      return 0;
    },
    onDone() {
      // done
      return 1;
    },
  },
});
`,
        output: `
const ds = new DocSetter();
ds.set({
  'handlers.onStart': function () {
    // start
    return 0;
  },
  'handlers.onDone': function () {
    // done
    return 1;
  },
});
`,
        errors: [{ messageId: 'enforceFieldPathSyntax' }],
      },
    ],
  },
);

// Issue #1876: RuleTester compares the fixed text as a string and never parses
// it, so the defect it is blind to is precisely the one this rule had — a method
// shorthand's FunctionExpression range starts at its parameter list, and copying
// that text emitted `() { return 1; }` in value position. These cases run the
// real fixer and parse what it wrote.
describe('enforce-fieldpath-syntax-in-docsetter: the fixed payload parses (issue #1876)', () => {
  const RULE_ID = '@blumintinc/blumint/enforce-fieldpath-syntax-in-docsetter';

  const config = {
    parser: '@typescript-eslint/parser',
    parserOptions: {
      ecmaVersion: 2020 as const,
      sourceType: 'module' as const,
    },
    rules: { [RULE_ID]: 'error' as const },
  };

  const lint = (code: string) => {
    const linter = new Linter();
    linter.defineParser(
      '@typescript-eslint/parser',
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@typescript-eslint/parser'),
    );
    linter.defineRule(
      RULE_ID,
      enforceFieldPathSyntaxInDocSetter as unknown as Rule.RuleModule,
    );
    return linter.verifyAndFix(code, config, 'save.ts').output;
  };

  const parses = (code: string) => {
    // `range` is required or the parser throws on any comment the source carries
    parse(code, { range: true, loc: true, jsx: false });
  };

  const payload = (body: string) =>
    `const ds = new DocSetter();\nds.set({\n  ${body},\n});\n`;

  /**
   * `[name, payload body, the entry the fix must emit]`.
   *
   * The emitted text is asserted alongside parseability because the parser is
   * blind to the halves of the spelling that are grammar rather than syntax: a
   * dropped `async` or `*` leaves `function () { await go(); }`, which parses
   * and means something else.
   */
  const REWRITTEN = [
    [
      'plain method',
      'handlers: { onDone() { return 1; } }',
      "'handlers.onDone': function () { return 1; }",
    ],
    [
      'async method',
      'handlers: { async onDone() { await go(); } }',
      "'handlers.onDone': async function () { await go(); }",
    ],
    [
      'generator method',
      'handlers: { *onDone() { yield 1; } }',
      "'handlers.onDone': function* () { yield 1; }",
    ],
    [
      'async generator method',
      'handlers: { async *onDone() { yield 1; } }',
      "'handlers.onDone': async function* () { yield 1; }",
    ],
    [
      'parameters with defaults',
      'handlers: { onDone(a, b = 2, ...rest) { return a + b + rest.length; } }',
      "'handlers.onDone': function (a, b = 2, ...rest) { return a + b + rest.length; }",
    ],
    [
      'type parameters',
      'handlers: { onDone<T>(x: T): T { return x; } }',
      "'handlers.onDone': function <T>(x: T): T { return x; }",
    ],
    [
      'destructured parameter',
      'handlers: { onDone({ a, b: c = 1 }) { return a + c; } }',
      "'handlers.onDone': function ({ a, b: c = 1 }) { return a + c; }",
    ],
    [
      'nested beyond two levels',
      'settings: { display: { render() { return 1; } } }',
      "'settings.display.render': function () { return 1; }",
    ],
    [
      'method beside plain leaves',
      "handlers: { name: 'done', onDone() { return 1; } }",
      "'handlers.onDone': function () { return 1; }",
    ],
    [
      'non-identifier key',
      "handlers: { 'on-done'() { return 1; } }",
      "'handlers.on-done': function () { return 1; }",
    ],
  ] as const;

  const DECLINED = [
    ['getter', "accessors: { get theme() { return 'dark'; } }"],
    ['setter', 'accessors: { set theme(value) { store(value); } }'],
    ['computed method key', 'handlers: { [dynamic]() { return 1; } }'],
    ['super reference', 'handlers: { onDone() { return super.toString(); } }'],
  ] as const;

  it.each(REWRITTEN)('rewrites and parses: %s', (_name, body, emitted) => {
    const source = payload(body);
    const output = lint(source);

    expect(output).not.toBe(source);
    expect(output).toContain(emitted);
    expect(() => parses(output)).not.toThrow();
    // Reaching a fixpoint: nothing nested survives for a second pass to flag
    expect(lint(output)).toBe(output);
  });

  it.each(DECLINED)('declines and leaves intact: %s', (_name, body) => {
    const source = payload(body);

    expect(lint(source)).toBe(source);
  });

  // Without this the parse assertion above would pass on any string the fixer
  // could possibly emit: it proves the emission the bug produced is caught.
  it('rejects the value text a verbatim method copy would emit', () => {
    expect(() =>
      parses(payload("'handlers.onDone': () { return 1; }")),
    ).toThrow();
    expect(() =>
      parses(payload("'handlers.onDone': function () { return 1; }")),
    ).not.toThrow();
  });
});

// Issue #2083: the fixer lifts a nested value to a new column, and a relocated
// span's continuation lines have to move with it or prettier rewrites the fix on
// sight. Re-indenting is a layout edit, so it must stop at the boundary of any
// text whose leading whitespace is DATA. RuleTester compares strings, which
// makes it a fine oracle for byte identity — the assertion below states the
// invariant the string comparison is standing in for.
describe('enforce-fieldpath-syntax-in-docsetter: relocation keeps data intact (issue #2083)', () => {
  const RULE_ID = '@blumintinc/blumint/enforce-fieldpath-syntax-in-docsetter';

  const lint = (code: string) => {
    const linter = new Linter();
    linter.defineParser(
      '@typescript-eslint/parser',
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@typescript-eslint/parser'),
    );
    linter.defineRule(
      RULE_ID,
      enforceFieldPathSyntaxInDocSetter as unknown as Rule.RuleModule,
    );
    return linter.verifyAndFix(
      code,
      {
        parser: '@typescript-eslint/parser',
        parserOptions: {
          ecmaVersion: 2020 as const,
          sourceType: 'module' as const,
        },
        rules: { [RULE_ID]: 'error' as const },
      },
      'save.ts',
    ).output;
  };

  const LITERAL = ['`first', '  second', 'third`'].join('\n');

  it('carries a multi-line template literal through the move byte for byte', () => {
    const source = [
      'const ds = new DocSetter();',
      'ds.set({',
      '  handlers: {',
      '    onDone() {',
      `      return ${LITERAL};`,
      '    },',
      '  },',
      '});',
      '',
    ].join('\n');

    const output = lint(source);

    // Non-vacuity: a fixer that declined would preserve the literal trivially
    expect(output).not.toBe(source);
    expect(output).toContain("'handlers.onDone': function () {");
    expect(output).toContain(LITERAL);
  });

  it('moves the surrounding body even though the literal is pinned', () => {
    const output = lint(
      [
        'const ds = new DocSetter();',
        'ds.set({',
        '  handlers: {',
        '    onDone() {',
        `      return ${LITERAL};`,
        '    },',
        '  },',
        '});',
        '',
      ].join('\n'),
    );

    // The `return` line rode two columns outwards with its new enclosing scope
    expect(output).toContain(`\n    return ${LITERAL.split('\n')[0]}`);
  });
});

// Issue #2096: the fixer hoists comments above the flattened entry so directives
// survive the splice, and copies each leaf value's text verbatim. A comment
// inside a leaf value sits in both sets, and RuleTester's string comparison is a
// poor witness for that — a duplicate reads as just another expected byte, and
// the membership-based corpus fidelity guard (`output.includes(marker)`) passes
// on a marker emitted twice. These cases count occurrences instead.
describe('enforce-fieldpath-syntax-in-docsetter: a relocated comment is emitted once (issue #2096)', () => {
  const RULE_ID = '@blumintinc/blumint/enforce-fieldpath-syntax-in-docsetter';

  const lint = (code: string) => {
    const linter = new Linter();
    linter.defineParser(
      '@typescript-eslint/parser',
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@typescript-eslint/parser'),
    );
    linter.defineRule(
      RULE_ID,
      enforceFieldPathSyntaxInDocSetter as unknown as Rule.RuleModule,
    );
    return linter.verifyAndFix(
      code,
      {
        parser: '@typescript-eslint/parser',
        parserOptions: {
          ecmaVersion: 2020 as const,
          sourceType: 'module' as const,
        },
        rules: { [RULE_ID]: 'error' as const },
      },
      'save.ts',
    ).output;
  };

  const occurrences = (text: string, marker: string) =>
    text.split(marker).length - 1;

  /** `[name, source, marker]` — every marker occurs exactly once in the input. */
  const CARRIED_ONCE = [
    [
      'line comment in a method body',
      [
        'const ds = new DocSetter();',
        'ds.set({',
        '  handlers: {',
        '    onDone() {',
        '      // keep',
        '      return 1;',
        '    },',
        '  },',
        '});',
        '',
      ].join('\n'),
      '// keep',
    ],
    [
      'block comment in a method body',
      [
        'const ds = new DocSetter();',
        'ds.set({',
        '  handlers: {',
        '    onDone() {',
        '      /* keep */',
        '      return 1;',
        '    },',
        '  },',
        '});',
        '',
      ].join('\n'),
      '/* keep */',
    ],
    [
      'comment in an arrow function body',
      [
        'const ds = new DocSetter();',
        'ds.set({',
        '  handlers: {',
        '    onDone: () => {',
        '      // keep',
        '      return 1;',
        '    },',
        '  },',
        '});',
        '',
      ].join('\n'),
      '// keep',
    ],
    [
      'directive in a method body',
      [
        'const ds = new DocSetter();',
        'ds.set({',
        '  handlers: {',
        '    onDone() {',
        '      // eslint-disable-next-line no-console',
        "      console.log('x');",
        '    },',
        '  },',
        '});',
        '',
      ].join('\n'),
      '// eslint-disable-next-line no-console',
    ],
    [
      'comment in a multi-line array leaf',
      [
        'const ds = new DocSetter();',
        'ds.set({',
        '  data: {',
        '    tags: [',
        '      // first',
        "      'a',",
        '    ],',
        '  },',
        '});',
        '',
      ].join('\n'),
      '// first',
    ],
    [
      'comment in a leaf on a shared property line',
      [
        'const ds = new DocSetter();',
        'ds.set({ handlers: {',
        '  onDone() {',
        '    // keep',
        '    return 1;',
        '  },',
        '}, other: 1 });',
        '',
      ].join('\n'),
      '// keep',
    ],
  ] as const;

  it.each(CARRIED_ONCE)('emits once: %s', (_name, source, marker) => {
    const output = lint(source);

    // Non-vacuity: a fixer that declined would carry the marker once trivially
    expect(output).not.toBe(source);
    expect(occurrences(source, marker)).toBe(1);
    expect(occurrences(output, marker)).toBe(1);
  });

  // Positive control for the other channel: the hoist this rule performs is what
  // keeps a directive between nested members covering the rewritten line, so it
  // has to keep happening — exactly once, and above the entry.
  it('still hoists a comment between nested members, once', () => {
    const source = [
      'const ds = new DocSetter();',
      'ds.set({',
      '  roles: {',
      '    // eslint-disable-next-line no-console',
      "    contributor: console.log('x'),",
      '  },',
      '});',
      '',
    ].join('\n');

    const output = lint(source);
    const marker = '// eslint-disable-next-line no-console';

    expect(output).not.toBe(source);
    expect(occurrences(output, marker)).toBe(1);
    expect(output.indexOf(marker)).toBeLessThan(
      output.indexOf("'roles.contributor'"),
    );
  });

  // Both channels in one property: each comment lands on its own side of the
  // entry, so a fix that hoisted everything or hoisted nothing fails here.
  it('separates the hoisted comment from the one inside the value', () => {
    const output = lint(
      [
        'const ds = new DocSetter();',
        'ds.set({',
        '  handlers: {',
        '    // hoisted',
        '    onDone() {',
        '      // keep',
        '      return 1;',
        '    },',
        '  },',
        '});',
        '',
      ].join('\n'),
    );

    expect(occurrences(output, '// hoisted')).toBe(1);
    expect(occurrences(output, '// keep')).toBe(1);

    const entry = output.indexOf("'handlers.onDone'");
    expect(output.indexOf('// hoisted')).toBeLessThan(entry);
    expect(output.indexOf('// keep')).toBeGreaterThan(entry);
  });

  // Without this the counting oracle above would pass on any output at all: it
  // states that a duplicated marker — the emission the bug produced — counts as
  // two rather than being smoothed into a membership check.
  it('counts a duplicated marker as two', () => {
    expect(
      occurrences(
        ['  // keep', "  'handlers.onDone': function () {", '    // keep'].join(
          '\n',
        ),
        '// keep',
      ),
    ).toBe(2);
  });
});
