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
    ],
  },
);
