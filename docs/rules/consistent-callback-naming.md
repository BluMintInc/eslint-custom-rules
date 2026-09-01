# Enforce consistent naming conventions for callback props and functions (`@blumintinc/blumint/consistent-callback-naming`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

> **What is auto-fixed:** only the `handle` prefix removal on functions, methods, class fields and object members the file itself owns — and then the rename moves every reference it owns with it, in a single fix. **Callback prop renames are reported but never auto-fixed** — see [Why prop renames are not auto-fixed](#why-prop-renames-are-not-auto-fixed) — and neither are exported top-level bindings, destructuring keys, shorthand bindings, members of an exported or returned object literal, members of a class that `extends` or `implements` something, abstract member declarations, `declare` field declarations, class members another module can name or whose readers the fixer cannot follow, renames whose new name is already bound where the declaration or one of its references sits, or any rename that would emit a reserved word; see [Renames the autofix withholds](#renames-the-autofix-withholds).

Callback naming should communicate intent at call sites. This rule enforces two conventions:

- **Props that accept functions** must use the `onX` pattern (`onClick`, `onSubmit`) so consumers immediately know a prop is a callback.
- **Callback implementations** should use action verbs (`submitOrder`, `saveDraft`) rather than the vague `handle` prefix, which hides what the function actually does.

> The rule uses TypeScript type info (via parser `project` settings) to detect function-typed props. Files parsed without type information — plain-Node `.mjs` scripts, config files, or anything outside the TS project — are silently skipped rather than causing an error, so mixing them into a lint run is safe.

## Rule Details

The rule reports when:

- A JSX prop is a function-typed expression but its name does not start with `on` (excluding built-in React handlers and common non-callback props like `className`, `style`, `ref`, `sx`, `css`, etc.).
- A function, method, class property, or parameter has a name like `handleSubmit` or `handleClick` — `handle` immediately followed by a **capitalized** word — because the name should describe the action instead of the generic prefix. A **class field** (`handleClick = () => {}`) is a class property, so it is reported exactly as the method spelling is: covering only the method would leave the rule evadable by a single token, since writing `=` in front of the callback changes nothing about it. The field is judged on its **name alone**, not on whether it holds a function — the same question asked of an object-literal member, of an abstract declaration and of `const handleClickCount = 0` — because the prefix describes no action whatever value sits to the right of the `=`, and gating on the value would hand the evasion back one level down (`handleClick = makeHandler()`). A **computed** field key (`[key] = fn`) is not reported: it names whatever the binding holds, and that binding is a subject where it is declared. An **abstract** member (`abstract handleSubmit(): T`, `abstract handleSubmit: () => T`) is a method or class property too, so it is reported at its declaration as well — report-only, because every implementor of that declaration has to move with it and implementors live in other files. Members of an `interface` or type literal are **not** reported by this half of the rule: a member of a type is a prop declaration, whose remedy is the opposite one (`onSubmit`, not `submit`) and belongs to `callbackPropPrefix`. Ordinary words that merely begin with those six letters are **not** flagged: the past participle `handled` (and derived names such as `handledFingerprints`), the nouns `handler`/`handlers`, `handles`, `handling`, the adjective `handleable`, and the bare word `handle`. The distinction is the capital letter after `handle`, so autofix never strips the prefix from a plain data identifier.
- React component props or PascalCase prop names are skipped to avoid renaming component references.

### Why prop renames are not auto-fixed

A JSX attribute name is one end of a props contract. The other end is the declaration that binds the name — a props `type`/`interface`, or a `JSX.IntrinsicElements` augmentation for host elements — together with every reader of that member and every other call site of the component. All of those live outside the range a single-file fixer may edit:

```tsx
type ChildProps = { validate: (value: string) => void };
const Child = (props: ChildProps) => <div>{String(props.validate)}</div>;
const Parent = () => <Child validate={fn} />;
```

Rewriting only the attribute yields `TS2322: Property 'onValidate' does not exist on type 'ChildProps'`. Renaming the local declaration as well only relocates the break: `props.validate` then fails with `TS2551`, and call sites of an exported component in other files fail with `TS2322` — a fixer cannot see those files, let alone edit them atomically. Because no subset of the rename is safe in isolation, the rule reports the violation and names every site the rename must cover, leaving the refactor to an editor rename or a codemod.

Props whose type is a **union that mixes a function with a non-function** (for example `Validate<T> | readonly T[]`) are configuration props that merely accept a function as one option, not event handlers, so they are **not** flagged — even when a plain function value is passed. Both the value's own type and the prop's declared (contextual) type are inspected, and `undefined`/`null` members are ignored so plain optional callbacks (`(() => void) | undefined`) are still treated as exclusively functions.

### Examples of **incorrect** code for this rule:

Props:

```tsx
<Dialog submit={onSubmit} /> // prop is a function but not prefixed with on
```

```tsx
<Form changeHandler={onChange} />
```

Implementations:

```tsx
const handleSubmit = () => save(); // prefer describing the action
```

```tsx
class Modal {
  handleClose() { this.hide(); }
}
```

The field spelling of the same callback — `=` is not an escape from the rule:

```tsx
class Modal {
  handleClose = () => this.hide();
}
```

### Examples of **correct** code for this rule:

Props:

```tsx
<Dialog onSubmit={submitOrder} />
```

```tsx
<Form onChange={onFormChange} />
```

Implementations:

```tsx
const submitOrder = () => save();
```

```tsx
class Modal {
  closeModal() { this.hide(); }
  closeLater = () => this.hide(); // a field is judged the same way
  get isOpen() { return this.visible; } // getter allowed
}
```

Destructuring another module's API — the `handle` prefix belongs to the property being read, not to this file, so nothing is reported:

```tsx
const { handleDelete: streamDeleteMessage } = useMessage('handleDelete');
const { handleClick } = props;
```

### Renames the autofix withholds

The rename is applied only where the file owns every site it must touch. Elsewhere the violation is reported and the rewrite is left to an editor rename or a codemod:

- **An exported top-level binding.** `export const handleClick = () => {}`, `export function handleClick() {}` and `export default function handleClick() {}` are named by importers in files a single-file fixer cannot edit. Renaming the declaration leaves `import { handleClick } from './c'` pointing at a member the module no longer offers — `TS2305: Module './c' has no exported member 'handleClick'` — so the report is kept and the rename withheld. This is the exported-binding withholding read from a module position, the same answer a `public` member of an exported class gets read from a member position.
- **A destructuring key.** In `const { handleDelete: streamDeleteMessage } = useMessage('handleDelete')` the key names a property of the object being destructured — someone else's API — so rewriting it changes _which property is read_ and strands every reader of the old name. Keys in a pattern are therefore not reported at all. When a pattern binds a prefixed key to a local name that also carries the prefix, the **local** name is reported instead, and renaming it moves every reference with the declaration (withheld when the binding is exported or the new name is already taken).
- **A shorthand binding.** `const { handleClick } = props` is a single token serving as both the foreign property name and the local name, so no in-place edit can change one without the other; it is left alone. A shorthand in an object literal (`const api = { handleClick }`) is reported, but rewriting it would rename the member _and_ re-point it at a binding that need not exist, so no fix is offered.
- **A member of an exported or returned object literal.** `export const api = { handleOpenThread: openThread }` and `return { handleOpenThread: openThread }` are read by name in files a single-file fixer cannot edit, exactly as a JSX prop is.
- **A member the file reads by name.** `const o = { handleClick: fn }; o.handleClick()` — and the destructuring form `const { handleClick } = o` — has readers the rename would have to move with it, so the member keeps its name.
- **A rename that would collide with a sibling member.** `{ click: a, handleClick: b }`, `class C { click() {} handleClick() {} }` and the mixed spelling `class C { click() {} handleClick = fn }` would collapse to two members of the same name, silently discarding one. The check is by name across the whole class body, so a `static handleClick` field alongside an instance `handleClick()` — legal, since they are different member spaces — withholds both renames rather than splitting a pair the pass cannot reason about.
- **A member of a class that `extends` or `implements` something.** `class SubmitForm extends BaseForm { handleSubmit(d: string) {…} }` — and the field spelling `class C extends Base { handleClick = () => {} }` — may be satisfying a declaration the fixer does not own. Renaming the implementation alone leaves the declaration behind and the class stops satisfying it: `TS2515: Non-abstract class 'SubmitForm' does not implement inherited abstract member 'handleSubmit'` for an abstract base, `TS2420: Class 'SubmitForm' incorrectly implements interface 'Submittable'` for an `implements` clause — all three measured turning a clean build into a broken one. Renaming both ends instead is safe only when every implementor is in this file, which the rule cannot know: the base is routinely imported, and sibling implementors of the same contract live in files a single-file fixer cannot see. The heritage clause itself therefore withholds the rename, not a declaration the rule managed to find — a member that overrides nothing loses its autofix, which is the price of never breaking a build. **An abstract declaration is likewise never rewritten**, for the same reason read from the other end.
- **A class member another module can name.** Renaming a `public` method — or a `public` field, which has the same binding sites — of an **exported** class edits one end of a contract whose other end is `import { C } from './c'; c.handleClick()` in a file this fixer cannot see, which fails with `TS2339: Property 'handleClick' does not exist on type 'C'` — the exported-binding withholding read from a member position. `protected` is withheld for the same reason, since subclasses in other files name it. A bare mention of the class name is the same leak by a quieter route, since `export const c = new C()` exports no class yet exports every member of one, so **any reference to the class beyond its own declaration** withholds the rename too. Two arms survive: a `private` member, which no other module may name whatever the class does, and a class that is neither exported nor mentioned again. In both, the declaration and every reference move together.
- **A `declare` field.** `class C { declare handleClick: () => void }` defines nothing: it asserts that a base constructor, a decorator or a framework establishes the property by name somewhere the class body does not show. The definition the rename would have to move with is out of reach, so the declaration is reported and never rewritten — the answer an abstract declaration gets, read from the concrete end.
- **A class member reference the fixer cannot follow.** Where the rename does apply it rewrites the declaration and every `this.handleClick` / `this?.handleClick` read — including reads from a nested arrow or a field initializer, which inherit `this` lexically (a field's own initializer reading the field back moves with it), and `this.` reads inside `static` members, where `this` is the class object — as **one** fix, because a rename that reaches the declaration and not its readers is exactly the `TS2339` above. Any reference it cannot prove it owns withholds the whole rename rather than applying part of it: a computed read (`this['handleClick']`, `this[key]`), a read or an assignment through an instance (`c.handleClick = fn`) or through `super`, a name destructured off `this`, a `this` inside an ordinary `function` expression (which the caller rebinds), a `this.` read that belongs to a different class, an instance `this.` read of a `static` member (and the reverse), and a string spelling of the member name anywhere in the file. A `get`/`set` pair is withheld as well: the getter is report-only, so renaming the setter alone would split the accessor in two.
- **A rename whose new name is already bound where one of the references sits.** The rename is emitted at the declaration _and_ at every reference, so it is safe only where the new name still means this declaration at each of them. A binding anywhere between a reference and the declaration takes that reference over instead:

  ```ts
  function handleSubmit(): void {}
  export function run(): void {
    const submit = 1;
    handleSubmit(); // renaming this to `submit()` calls the local number
    console.log(submit);
  }
  ```

  Nothing else notices. The module scope still holds exactly one `submit`, so a redeclaration check passes, and the emitted reference is well-typed against a real binding right up until it is called — `TS2349: This expression is not callable` on a file that compiled clean. Every binding form captures the same way: a `const`/`let`, a parameter, an inner `function`, a `catch` parameter, a `class` or an `enum`, however many scopes down the reference sits. The mirror image withholds too: a `submit` already in scope at the **declaration** would make the rename an outright redeclaration (`TS2300`), and an `import { submit }` collides there for the same reason. The whole rename is withheld rather than partially applied — alpha-renaming the intervening binding instead would mean owning its references as well. The check is per **reference**, not per enclosing function: a binding in a sibling block that encloses no reference captures nothing, so `{ const submit = 1; … } handleSubmit();` is still rewritten.
- **A rename that would emit a reserved word.** `handleDelete` → `delete`, `handleNew` → `new`, `handleReturn` → `return`, `handleTrue` → `true`: none of those is a legal binding name, so `const delete = fn` and `const { delete } = api` do not even parse. The report is kept and the fix withheld rather than emitting a keyword — including in member positions where a keyword happens to be legal, because the rule cannot see whether the member is later destructured into a binding.

## When Not To Use It

- Codebases that intentionally use `handle*` naming for callbacks and do not want automatic renames.
- Projects that cannot enable TypeScript `project` settings for linting (without type information the rule cannot detect function-typed props, so it skips every file and enforces nothing).

## Further Reading

- React docs: [Passing Functions to Components](https://react.dev/learn/passing-props-to-a-component#passing-event-handlers)
