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

| Name                                                                           | Description                                                                               | 💼 | ⚠️ | 🔧 |
| :----------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------- | :- | :- | :- |
| [array-methods-this-context](docs/rules/array-methods-this-context.md)         | Prevent misuse of Array methods in OOP                                                    |    | ✅  |    |
| [export-if-in-doubt](docs/rules/export-if-in-doubt.md)                         | All top-level const definitions, type definitions, and functions should be exported       |    | ✅  |    |
| [extract-global-constants](docs/rules/extract-global-constants.md)             | Extract constants/functions to the global scope when possible                             |    | ✅  |    |
| [generic-starts-with-t](docs/rules/generic-starts-with-t.md)                   | Enforce TypeScript generic types to start with T                                          |    | ✅  |    |
| [no-async-array-filter](docs/rules/no-async-array-filter.md)                   | Disallow async callbacks for Array.filter                                                 | ✅  |    |    |
| [no-async-foreach](docs/rules/no-async-foreach.md)                             | Disallow Array.forEach with an async callback function                                    | ✅  |    |    |
| [no-conditional-literals-in-jsx](docs/rules/no-conditional-literals-in-jsx.md) | Disallow use of conditional literals in JSX code                                          | ✅  |    |    |
| [no-filter-without-return](docs/rules/no-filter-without-return.md)             | Disallow Array.filter callbacks without an explicit return (if part of a block statement) | ✅  |    |    |
| [no-misused-switch-case](docs/rules/no-misused-switch-case.md)                 | Prevent misuse of logical OR in switch case statements                                    | ✅  |    |    |
| [no-unpinned-dependencies](docs/rules/no-unpinned-dependencies.md)             | Enforces pinned dependencies                                                              | ✅  |    | 🔧 |
| [no-useless-fragment](docs/rules/no-useless-fragment.md)                       | Prevent unnecessary use of React fragments                                                |    | ✅  |    |
| [prefer-fragment-shorthand](docs/rules/prefer-fragment-shorthand.md)           | Prefer <> shorthand for <React.Fragment>                                                  |    | ✅  | 🔧 |
| [prefer-type-over-interface](docs/rules/prefer-type-over-interface.md)         | Prefer using type alias over interface                                                    |    | ✅  |    |

<!-- end auto-generated rules list -->


