# Enforce React hooks with optional parameters to default to an empty object (`@blumintinc/blumint/require-hooks-default-params`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

This rule enforces that React hooks with a single parameter where all properties are optional should default to an empty object. This prevents potential runtime errors from accessing properties of undefined and makes the hook's API more predictable.

## Examples

### ❌ Incorrect

```ts
// All properties in Settings are optional
type Settings = {
  theme?: string;
  language?: string;
};

// Missing default value for settings parameter
function useSettings(settings: Settings) {
  // Could throw if settings is undefined
  const theme = settings.theme;
  return { theme };
}

// Interface with all optional properties
interface Config {
  debug?: boolean;
  timeout?: number;
}

// Missing default value for config parameter
const useConfig = (config: Config) => {
  // Could throw if config is undefined
  return config.debug;
};
```

### ✅ Correct

```ts
type Settings = {
  theme?: string;
  language?: string;
};

// Settings parameter defaults to empty object
function useSettings(settings: Settings = {}) {
  // Safe to access properties
  const theme = settings.theme;
  return { theme };
}

interface Config {
  debug?: boolean;
  timeout?: number;
}

// Config parameter defaults to empty object
const useConfig = (config: Config = {}) => {
  // Safe to access properties
  return config.debug;
};
```

## When Not To Use It

If you prefer to handle undefined parameters explicitly in your hooks or if you want to make it clear that the parameter is required even if all its properties are optional.
