# prefer-document-flattening

Enforces using the `shouldFlatten` option and field path notation when setting deeply nested objects in Firestore documents.

## Rule Details

This rule detects when developers create DocSetter or DocSetterTransaction instances without the `shouldFlatten` option while subsequently using them to set documents with nested objects.

Using field paths with flattened documents instead of nested objects provides several critical advantages:
1. Enables direct querying of nested fields without compound indexes
2. Eliminates the need for read-before-write operations when updating nested fields
3. Reduces transaction requirements for updating nested properties
4. Minimizes potential update conflicts
5. Improves performance through more targeted database operations

### Examples

#### ❌ Incorrect

```typescript
// Creating DocSetter without shouldFlatten
const userSetter = new DocSetter<UserDocument>(db.collection('users'));

// Setting a document with nested objects
await userSetter.set({
  id: 'user123',
  profile: {
    personal: {
      firstName: 'John',
      lastName: 'Doe'
    },
    settings: {
      theme: 'dark',
      notifications: {
        email: true,
        push: false
      }
    }
  }
});

// Later, to update a nested field, we must first read the document
const user = await userFetcher.fetch();
user.profile.settings.theme = 'light';
await userSetter.set(user);
```

#### ✅ Correct

```typescript
// Creating DocSetter with shouldFlatten option
const userSetter = new DocSetter<UserDocument>(
  db.collection('users'),
  { shouldFlatten: true }
);

// Setting a document with nested objects (which will be flattened automatically)
await userSetter.set({
  id: 'user123',
  profile: {
    personal: {
      firstName: 'John',
      lastName: 'Doe'
    },
    settings: {
      theme: 'dark',
      notifications: {
        email: true,
        push: false
      }
    }
  }
});

// Later, update a nested field directly without reading first
await userSetter.updateIfExists({
  id: 'user123',
  'profile.settings.theme': 'light'
});
```

## When Not To Use It

You might consider disabling this rule if:

1. You're working with documents that don't have nested objects
2. You have specific performance requirements that benefit from nested object structures
3. You're using a different pattern for document updates that doesn't rely on field paths

## Further Reading

- [Firestore Field Paths Documentation](https://firebase.google.com/docs/firestore/query-data/queries#query_operators)
- [Firestore Update Operations](https://firebase.google.com/docs/firestore/manage-data/add-data#update-data)
