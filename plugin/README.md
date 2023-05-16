# eslint-plugin-blumint

Custom eslint rules for use at BluMint

## Installation

You'll first need to install [ESLint](https://eslint.org/):

```sh
npm i eslint --save-dev
```

Next, install `eslint-plugin-blumint`:

```sh
npm install eslint-plugin-blumint --save-dev
```

## Usage

Add `blumint` to the plugins section of your `.eslintrc` configuration file. You can omit the `eslint-plugin-` prefix:

```json
{
    "plugins": [
        "blumint"
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

## Rules

<!-- begin auto-generated rules list -->

🔧 Automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/user-guide/command-line-interface#--fix).

| Name                                                               | Description                               | 🔧 |
| :----------------------------------------------------------------- | :---------------------------------------- | :- |
| [no-async-array-filter](docs/rules/no-async-array-filter.md)       | Disallow async callbacks for Array.filter | 🔧 |
| [no-unpinned-dependencies](docs/rules/no-unpinned-dependencies.md) | Enforces pinned dependencies              | 🔧 |

<!-- end auto-generated rules list -->


