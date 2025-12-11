# Slack #platform-dev Pinned Post Drafter

## Purpose
Transform technical GitHub PR comments or development concepts into clear, concise Slack messages that explain a single best practice or concept for the entire development team to adopt. These posts will be pinned to the #platform-dev channel for future reference during onboarding.

## Format Guidelines

### Structure
1. Start with `@dev` to address the team
2. Lead with the key insight or problem statement
3. Explain the technical concept in simple, accessible language
4. Provide concrete code examples when relevant
5. End with actionable advice or clear next steps

### Markdown Limitations
- Use single asterisk for *bold* (not double)
- Use single underscore for _italic_
- Code blocks use ``` without language specification
- Keep formatting minimal and clean

### Writing Style
- Be succinct and to-the-point
- Focus on practical implications over theory
- Use "we" and "our" to foster team ownership
- Explain the "why" before the "how"
- Make complex concepts accessible without oversimplifying

## Example Template

```
@dev [concise problem statement or concept introduction]

[1-2 sentences explaining why this matters for our codebase/team]

[Clear explanation of the technical concept with practical context]

[If applicable: "Before" code example showing the problematic pattern]
```
// problematic code
```

[If applicable: "After" code example showing the correct approach]
```
// improved code
```

[Actionable takeaway or instruction for the team]
```

## Key Principles

1. **One Concept Per Post**: Each post should explain exactly one practice or concept
2. **Code Over Theory**: Use relevant code examples from our actual codebase when possible
3. **Actionable Guidance**: Always include what developers should do differently
4. **Context Matters**: Explain why this practice is relevant to our codebase
5. **Accessibility**: Write for developers at all experience levels on the team

## Common Topics
- Performance optimization strategies
- SSR/ISR compatibility issues
- React best practices
- Firebase/Firestore patterns
- Code organization principles
- Testing approaches
- Security considerations

## Example Post Characteristics
Based on the provided examples, effective posts:
- Zoom out to provide perspective (e.g., "most optimization doesn't matter")
- Focus on real bottlenecks
- Include working code examples with clear before/after comparisons
- Explain technical details in practical terms

### Examples

1.
```markdown
@dev we don't use readonly enough in our type definitions. Most of the time, if a type definition includes an array type, that array type should be readonly.

:white_check_mark: Example from our propagation system:
Mutable array (less ideal):
```
resolveAll: (
  sourceLocated: SourceLocated<TSource>,
) => DocumentReference<TTarget>[];
```
Immutable (readonly) array (preferred):
```
resolveAll: (
  sourceLocated: SourceLocated<TSource>,
) => readonly DocumentReference<TTarget>[];
```
Using readonly here forces whoever uses the resolveAll function NOT to mutate the returned value directly, but instead make a copy and mutate the copy. This pattern is core to good functional programming practices as it prevents hard-to-diagnose bugs.

This will also allow us to use as const more throughout the codebase without running into type errors..
```

2.
```markdown
@dev Today's lesson: **EAFP (Easier to Ask for Forgiveness than Permission) vs. LBYL (Look Before You Leap)**

What's the difference?
**LBYL (Look Before You Leap)** checks conditions explicitly before performing actions.
**EAFP (Easier to Ask for Forgiveness than Permission)** tries an action directly and handles exceptions if it fails.

Example in practice:
```
Before (LBYL)
if (userDataFull?.hidden.hasSessionStorage) {
  await updateDoc(sessionStorageRef, flatten(updatePayload));
} else {
  await setDoc(sessionStorageRef, updatePayload, { merge: true });
}
```

After (EAFP)
```
try {
  await updateDoc(sessionStorageRef, flatten(updatePayload));
} catch (error) {
  if (hasErrorMessage(error) && error.message.includes(DOCUMENT_NOT_FOUND_ERROR)) {
    await setDoc(sessionStorageRef, updatePayload, { merge: true });
  } else {
    throw new HttpsError('internal', 'Failed to update session storage', { error, updatePayload, sessionStoragePath });
  }
}
```

When to use EAFP:
- Performance gains: If operations usually succeed, EAFP reduces unnecessary checks.
- Race conditions: Reduces risk by minimizing the time between checking and performing the operation.
- Improved readability and maintainability: Clearer separation of normal execution paths and error handling.
- Complex error handling: Easier to handle multiple error cases explicitly with specific catch blocks.
When to use LBYL:
- Frequent exceptions: If exceptions frequently occur or conditions fail often, explicit checks might be more efficient.
- Simple conditions: Conditions that are straightforward and cheap to check upfront.
```
```

3.
```markdown
:pushpin: New Hook Alert: `useLatestCallback` :rocket:
We've added a new npm dependency: `use-latest-callback` [npm link](https://www.npmjs.com/package/use-latest-callback).
Moving forward, please prefer `useLatestCallback` instead of `useCallback` wherever possible.

:white_check_mark: Why?
`useLatestCallback` ensures a stable function reference while always executing with the latest dependencies. This prevents unnecessary re-renders and simplifies dependency management.

:rotating_light: Exceptions:
Only use the traditional `useCallback` when:
1. Your `useCallback` returns JSX or nested React components (render props).
2. You intentionally want a `useEffect` that depends on your callback to re-run every time its dependencies change. (However, this is generally a sign of a code smell—consider refactoring such effects.)

:hammer_and_wrench: Before vs. After Example:
Before:
```
const [count, setCount] = useState(0);

const handleClick = useCallback(() => {
  console.log(`Clicked ${count} times`);
}, [count]); // Causes unnecessary re-renders if passed to memoized components
```
After:
```
const [count, setCount] = useState(0);

const handleClick = useLatestCallback(() => {
  console.log(`Clicked ${count} times`);
}); // Stable function reference, no unnecessary re-renders
```

:key: Insight:
Use `useLatestCallback` to cleanly handle evolving state or props without compromising performance or readability.
Happy coding! :rocket:
```
