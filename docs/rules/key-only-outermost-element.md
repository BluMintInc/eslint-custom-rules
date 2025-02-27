# key-only-outermost-element

Enforce that only the outermost element in list rendering has a key prop.

## Rule Details

When rendering lists in React, assigning a key to the outermost element ensures that React can efficiently track and update list items. This rule enforces that only the outermost element within a `.map()` function has a `key` prop, preventing redundant keys on nested elements. This improves rendering performance and avoids unnecessary re-renders.

### Examples

#### ❌ Incorrect

```jsx
{items.map((item) => (
  <div key={item.id}>
    <span key={`inner-${item.id}`}>{item.name}</span>
  </div>
))}

{items.map((item) => (
  <div key={item.id}>
    <h3 key={`title-${item.id}`}>{item.title}</h3>
    <p key={`desc-${item.id}`}>{item.description}</p>
  </div>
))}

{items.map((item) => (
  <>
    <h3 key={`title-${item.id}`}>{item.title}</h3>
    <p key={`desc-${item.id}`}>{item.description}</p>
  </>
))}
```

#### ✅ Correct

```jsx
{items.map((item) => (
  <div key={item.id}>
    <span>{item.name}</span>
  </div>
))}

{items.map((item) => (
  <div key={item.id}>
    <h3>{item.title}</h3>
    <p>{item.description}</p>
  </div>
))}

{items.map((item) => (
  <React.Fragment key={item.id}>
    <h3>{item.title}</h3>
    <p>{item.description}</p>
  </React.Fragment>
))}
```

## When Not To Use It

If you have a specific use case where you need to assign keys to nested elements within a list rendering, you might want to disable this rule. However, this is generally not recommended as it can lead to performance issues.

## Further Reading

- [React Lists and Keys](https://reactjs.org/docs/lists-and-keys.html)
- [React Reconciliation](https://reactjs.org/docs/reconciliation.html#keys)
