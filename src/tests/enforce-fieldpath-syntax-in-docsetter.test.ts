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
  handlers: { onDone() { return 1; } },
});
`,
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
      // A multiline leaf value is spliced verbatim
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
    ],
  },
);
