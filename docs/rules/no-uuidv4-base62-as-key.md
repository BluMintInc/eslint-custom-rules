# Disallow using uuidv4Base62() to generate keys for elements in a list or loop (`@blumintinc/blumint/no-uuidv4-base62-as-key`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Avoid using `uuidv4Base62()` as React list keys.

## Rule Details

Using `uuidv4Base62()` as a key in React list iteration should be a last resort. Keys should ideally be derived from uniquely identifying props of the component being rendered. Relying on `uuidv4Base62()` can lead to unnecessary re-renders since new UUIDs are generated on each render, preventing React from correctly diffing elements.

This rule warns when `uuidv4Base62()` is used as a key inside `.map()` callbacks, encouraging more stable key choices.

### Examples

#### ❌ Incorrect

```jsx
{items.map((item) => (
  <div key={uuidv4Base62()}>{item.name}</div>
))}

{items.map((item) => (
  <React.Fragment key={uuidv4Base62()}>
    <h3>{item.title}</h3>
    <p>{item.description}</p>
  </React.Fragment>
))}
```

#### ✅ Correct

```jsx
{items.map((item) => (
  <div key={item.id}>{item.name}</div>
))}

// When no unique ID exists, use a combination of properties
{items.map((item) => (
  <div key={`${item.name}-${item.index}`}>{item.name}</div>
))}

// Using index as a fallback (better than random UUID)
{items.map((item, index) => (
  <div key={index}>{item.name}</div>
))}

// Using a stable identifier function
{items.map((item) => (
  <div key={getStableId(item)}>{item.name}</div>
))}
```

## When Not To Use It

If you have a specific use case where you need to generate random keys and you understand the performance implications, you might want to disable this rule. However, this is generally not recommended as it can lead to performance issues and unexpected behavior.

## Further Reading

- [React Lists and Keys](https://reactjs.org/docs/lists-and-keys.html)
- [React Reconciliation](https://reactjs.org/docs/reconciliation.html#keys)
- [Understanding React's key prop](https://kentcdodds.com/blog/understanding-reacts-key-prop)
