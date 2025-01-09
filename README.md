# @blumintinc/eslint-plugin-blumint

Custom eslint rules for use at BluMint

## Installation

You'll first need to install [ESLint](https://eslint.org/):

```sh
npm i eslint --save-dev
```

Next, install `@blumintinc/eslint-plugin-blumint`:

```sh
npm install @blumintinc/eslint-plugin-blumint --save-dev
```

## Usage

Add `@blumintinc/blumint` to the plugins section of your `.eslintrc` configuration file. You can omit the `eslint-plugin-` prefix:

```json
{
    "plugins": [
        "@blumintinc/blumint"
    ]
}
```


Then configure the rules you want to use under the rules section.

```json
{
    "rules": {
        "blumint/rule-name": "error"
    }
}
```

Or use the recommended config:

```json
{
    "extends": ["some-other-plugin", "plugin:@blumintinc/blumint/recommended"]
}
```

## Rules

<!-- begin auto-generated rules list -->

💼 Configurations enabled in.\
⚠️ Configurations set to warn in.\
✅ Set in the `recommended` configuration.\
🔧 Automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/user-guide/command-line-interface#--fix).

| Name                                                                                     | Description                                                                                                                                     | 💼 | ⚠️ | 🔧 |
| :--------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------- | :- | :- | :- |
| [array-methods-this-context](docs/rules/array-methods-this-context.md)                   | Prevent misuse of Array methods in OOP                                                                                                          |    | ✅  |    |
| [class-methods-read-top-to-bottom](docs/rules/class-methods-read-top-to-bottom.md)       | Ensures classes read linearly from top to bottom.                                                                                               |    | ✅  | 🔧 |
| [consistent-callback-naming](docs/rules/consistent-callback-naming.md)                   | Enforce consistent naming conventions for callback props and functions                                                                          | ✅  |    | 🔧 |
| [dynamic-https-errors](docs/rules/dynamic-https-errors.md)                               | Dynamic error details should only be in the third argument of the HttpsError constructor. The second argument is hashed to produce a unique id. |    | ✅  |    |
| [enforce-callable-types](docs/rules/enforce-callable-types.md)                           | Enforce Params and Response type exports in callable functions                                                                                  | ✅  |    |    |
| [enforce-callback-memo](docs/rules/enforce-callback-memo.md)                             | Enforce useCallback or useMemo for inline functions in JSX props                                                                                | ✅  |    |    |
| [enforce-dynamic-firebase-imports](docs/rules/enforce-dynamic-firebase-imports.md)       | Enforce dynamic importing for modules within the firebaseCloud directory                                                                        | ✅  |    |    |
| [enforce-identifiable-firestore-type](docs/rules/enforce-identifiable-firestore-type.md) | Enforce that Firestore type definitions extend Identifiable and match their folder name                                                         | ✅  |    |    |
| [enforce-safe-stringify](docs/rules/enforce-safe-stringify.md)                           | Enforce using safe-stable-stringify instead of JSON.stringify                                                                                   | ✅  |    | 🔧 |
| [export-if-in-doubt](docs/rules/export-if-in-doubt.md)                                   | All top-level const definitions, type definitions, and functions should be exported                                                             |    |    |    |
| [extract-global-constants](docs/rules/extract-global-constants.md)                       | Extract static constants and functions to the global scope when possible                                                                        |    | ✅  |    |
| [generic-starts-with-t](docs/rules/generic-starts-with-t.md)                             | Enforce TypeScript generic types to start with T                                                                                                |    | ✅  |    |
| [global-const-style](docs/rules/global-const-style.md)                                   | Enforce UPPER_SNAKE_CASE and as const for global static constants                                                                               | ✅  |    | 🔧 |
| [no-async-array-filter](docs/rules/no-async-array-filter.md)                             | Disallow async callbacks for Array.filter                                                                                                       | ✅  |    |    |
| [no-async-foreach](docs/rules/no-async-foreach.md)                                       | Disallow Array.forEach with an async callback function                                                                                          | ✅  |    |    |
| [no-conditional-literals-in-jsx](docs/rules/no-conditional-literals-in-jsx.md)           | Disallow use of conditional literals in JSX code                                                                                                | ✅  |    |    |
| [no-filter-without-return](docs/rules/no-filter-without-return.md)                       | Disallow Array.filter callbacks without an explicit return (if part of a block statement)                                                       | ✅  |    |    |
| [no-jsx-whitespace-literal](docs/rules/no-jsx-whitespace-literal.md)                     | Disallow the use of {" "} elements in JSX code                                                                                                  | ✅  |    |    |
| [no-misused-switch-case](docs/rules/no-misused-switch-case.md)                           | Prevent misuse of logical OR in switch case statements                                                                                          | ✅  |    |    |
| [no-unpinned-dependencies](docs/rules/no-unpinned-dependencies.md)                       | Enforces pinned dependencies                                                                                                                    | ✅  |    | 🔧 |
| [no-unused-props](docs/rules/no-unused-props.md)                                         | Detect unused props in React component type definitions                                                                                         | ✅  |    | 🔧 |
| [no-useless-fragment](docs/rules/no-useless-fragment.md)                                 | Prevent unnecessary use of React fragments                                                                                                      |    | ✅  | 🔧 |
| [prefer-fragment-shorthand](docs/rules/prefer-fragment-shorthand.md)                     | Prefer <> shorthand for <React.Fragment>                                                                                                        |    | ✅  | 🔧 |
| [prefer-type-over-interface](docs/rules/prefer-type-over-interface.md)                   | Prefer using type alias over interface                                                                                                          |    | ✅  | 🔧 |
| [require-dynamic-firebase-imports](docs/rules/require-dynamic-firebase-imports.md)       | Enforce dynamic imports for Firebase dependencies                                                                                               | ✅  |    | 🔧 |
| [require-https-error](docs/rules/require-https-error.md)                                 | Enforce using proprietary HttpsError instead of throw new Error or firebase-admin HttpsError in functions/src                                   | ✅  |    |    |
| [require-image-overlayed](docs/rules/require-image-overlayed.md)                         | Enforce using ImageOverlayed component instead of next/image or img tags                                                                        | ✅  |    | 🔧 |
| [require-memo](docs/rules/require-memo.md)                                               | React components must be memoized                                                                                                               | ✅  |    | 🔧 |
| [require-usememo-object-literals](docs/rules/require-usememo-object-literals.md)         | Enforce using useMemo for inline object literals passed as props to JSX components                                                              | ✅  |    |    |
| [use-custom-router](docs/rules/use-custom-router.md)                                     | Enforce using src/hooks/routing/useRouter instead of next/router                                                                                | ✅  |    | 🔧 |

<!-- end auto-generated rules list -->
