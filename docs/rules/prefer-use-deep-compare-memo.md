# Enforce using useDeepCompareMemo when dependency array contains non-primitive values (objects, arrays) that are not already memoized. This prevents unnecessary re-renders due to reference changes (`@blumintinc/blumint/prefer-use-deep-compare-memo`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

`useMemo` compares dependencies by reference. Objects and arrays created inside a render receive a new identity every time, so `useMemo` treats them as "changed" and reruns the memoized computation, triggering downstream renders. `useDeepCompareMemo` (or memoizing the dependencies first) compares by value and keeps equivalent dependencies stable.

## Rule Details

- **Why**: Non-primitive dependencies change identity each render. Reference equality in `useMemo` sees them as different, so the memo recomputes and can force avoidable renders.
- **How**: The rule flags `useMemo` calls when the dependency array contains an object or array that is not already memoized. Identifiers are considered safe when they come from `useMemo`, `useCallback`, `useLatestCallback`, or `useDeepCompareMemo`.
- **Not**: A dependency the rule can *prove* holds a primitive is never flagged, however it is read inside the callback. Reading a member off a name — `slug.toUpperCase()`, `cents.toFixed(2)`, `s.length` — proves only that the receiver has members, which strings, numbers, booleans, bigints and symbols all do. See [Primitive dependencies](#primitive-dependencies).
- **Fix**: Auto-fix replaces `useMemo` with `useDeepCompareMemo` and inserts `import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';`. The rewritten call no longer reads whatever carried the hook, so the fix also unbinds `useMemo` — or `React`, for a `React.useMemo(...)` call — from the React import when nothing else in the file reads it, leaving the other specifiers untouched. You can also silence the warning by memoizing the dependencies first.

Auto-fix adds the import if needed:

```ts
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';
```

### Examples

#### Examples of incorrect code — non-primitive dependency recreates each render

```tsx
const UserProfile: FC<UserProfileProps> = ({ userConfig }) => {
  const formattedData = useMemo(() => {
    return {
      name: userConfig.name.toUpperCase(),
      status: getStatusLabel(userConfig.status),
      lastActive: formatDate(userConfig.lastLogin),
    };
  }, [userConfig]);

  return <ProfileCard data={formattedData} />;
};
```

#### Examples of correct code — compare dependency by value with `useDeepCompareMemo`

```tsx
import { useDeepCompareMemo } from '@blumintinc/use-deep-compare';

const UserProfile: FC<UserProfileProps> = ({ userConfig }) => {
  const formattedData = useDeepCompareMemo(() => {
    return {
      name: userConfig.name.toUpperCase(),
      status: getStatusLabel(userConfig.status),
      lastActive: formatDate(userConfig.lastLogin),
    };
  }, [userConfig]);

  return <ProfileCard data={formattedData} />;
};
```

#### Examples of correct code — memoize the dependency first (no rule warning)

Build the object from primitives so the memo that produces it is itself stable;
downstream memos may then depend on it by reference.

```tsx
const UserProfile: FC<UserProfileProps> = ({ userId, userName, userStatus }) => {
  const memoizedConfig = useMemo(
    () => ({ id: userId, name: userName, status: getStatusLabel(userStatus) }),
    [userId, userName, userStatus],
  );

  const formattedData = useMemo(() => memoizedConfig.status, [memoizedConfig]);

  return <ProfileCard status={formattedData} />;
};
```

Memoizing a non-primitive prop with plain `useMemo` does not silence the rule:
that `useMemo` still lists an unmemoized object in its own dependency array, so
it is reported in turn. Depend on the object's primitive fields, or reach for
`useDeepCompareMemo` as shown above.

#### Examples of correct code — a primitive dependency read through a member

A primitive carries members as readily as an object does, so reading one says
nothing about identity. `slug` is a `string`: React already compares it by
value, and a deep comparison wrapped around it costs an import and a dependency
that cannot help.

```tsx
const Breadcrumb = ({ slug }: { slug: string }) => {
  const label = useMemo(() => slug.toUpperCase(), [slug]);

  return <span>{label}</span>;
};
```

It holds for a member an array carries too, once the dependency's type settles
what it is, and for state whose initial value is a primitive:

```tsx
const Counter = ({ label }: { label: string }) => {
  const [count] = useState(0);
  const caption = useMemo(
    () => `${label.length}:${count.toFixed(0)}`,
    [label, count],
  );

  return <span>{caption}</span>;
};
```

### Primitive dependencies

A dependency is exempt from the member-access heuristic only when it is
*provably* a primitive. Three independent layers can supply that proof, and any
one of them is enough:

1. **Its type.** The type checker resolves the dependency to a string, number,
   boolean, bigint, symbol, `null`, `undefined` or `void` — or to a union whose
   every member is one of those, which is what an optional `slug?: string`
   resolves to. A type of `any` or `unknown` is *not* a proof: a checker running
   without `parserOptions.project` answers `any` for every imported symbol, and
   reading that silence as an answer would let a degraded program decide the
   verdict.
2. **Its declaration.** A primitive type annotation on the binding — including
   on a `let`, which the annotation constrains just as firmly — or an
   unannotated `const` initialised with a primitive literal or a template
   literal, or a `const [value] = useState(<primitive literal>)` tuple.
3. **Every read of it.** Where the first two layers are silent, the dependency
   is exempt if every read of it inside the callback names a member only a
   primitive has (`toUpperCase`, `toFixed`, `trim`, `startsWith`, `repeat`, and
   the like). `length`, `slice`, `includes`, `indexOf`, `concat`, `at`,
   `toString` and `valueOf` are excluded on purpose — arrays carry them too, so
   accepting one would hide the array dependencies the rule exists to catch. A
   single occurrence that says nothing about the shape — a computed access, a
   spread, the bare name passed along — withdraws this layer.

Nothing short of a proof exempts a dependency, so a dependency whose kind is
genuinely unknowable is still reported. The asymmetry is deliberate: a missed
deep comparison costs one recomputation, while a deep comparison wrapped around
a string costs an injected dependency, a new import and a hook that cannot help.

### Edge Cases

- Primitives: dependency arrays with only primitives are ignored, and so is a primitive dependency read through a member.
- Already memoized: identifiers produced by `useMemo`, `useCallback`, `useLatestCallback`, or `useDeepCompareMemo` are treated as stable.
- Empty dependency arrays: ignored.
- JSX in memo body: ignored, to avoid false positives with JSX-returning memos.
- Performance hotspots: prefer memoizing dependencies instead of deep comparison when deep equality cost is a concern.
- Every reported `useMemo` call the fix can rewrite is rewritten by one edit, so the import they all stop reading is unbound in that same edit. Splitting the rewrites would strand it: with two call sites neither is the specifier's last reader on its own, and once both are converted the rule no longer reports, so nothing revisits the file.
- A call that edit does *not* rewrite keeps the import bound — one the rule never reports, one behind a disable directive (suppression is applied after a rule emits its reports, so that fix never runs), or one whose scope binds `useDeepCompareMemo` to something else. Unbinding on such a call's behalf would leave it spelling a name nothing binds.
- The injected `import { useDeepCompareMemo } …` is placed below the file's prologue — a `'use client'` / `'use server'` directive, a `#!` shebang, a header comment — and above the first existing import. A directive is a directive only while it is the **first** statement, so an import spliced above one would silently demote it to an ordinary expression statement: still valid TypeScript, still reported clean by ESLint, but no longer read by the bundler. Where the anchor shares its line with the prologue the import is written inline after it rather than above it, which costs the displaced statement its indentation and keeps the file's meaning.
- The report stands without a fix whenever the rewrite would strand something the fix cannot safely unbind — a locally declared `useMemo` however it is spelled (`function useMemo` and `const useMemo = ...` alike, since a declaration's own initializer does not count as a use of it), an import behind a directive comment, or a name that also occurs outside the rewritten call. Rewrite those by hand.

### When Not To Use It

- Performance hotspots where deep comparison overhead is undesirable. You can disable the rule for a specific line:

```ts
// eslint-disable-next-line @blumintinc/blumint/prefer-use-deep-compare-memo
const x = useMemo(() => compute(data), [data]);
```

## Version

- Introduced in v1.10.0
