# Disallow curly-brace blocks that only wrap commented-out members inside type declarations (`@blumintinc/blumint/no-curly-brackets-around-commented-properties`)

💼 This rule is enabled in the ✅ `recommended` config.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

## Rule Details

This rule flags standalone curly-brace blocks that contain only comments inside type declarations (interfaces, type aliases, enums, and namespace/module sections). Wrapping commented-out members in their own brace block makes the surrounding type syntactically invalid, hides the intent of the comments, and breaks editor tooling. Remove the braces and leave the comments inline so type declarations stay readable and compilable.

## Examples

### ❌ Incorrect

```typescript
interface TournamentSettings {
  maxParticipants: number;
  {
    /**
     * @remarks
     * There will be Math.ceil(participants / maxTeamsPerMatch) matches.
     * Teams will be divided up as evenly among the matches as possible.
     *
     * Set this to Number.MAX_SAFE_INTEGER to indicate that
     * there is no upper limit to the number of teams per match.
     *
     * This MUST be greater than 1.
     */
    // maxTeamsPerMatch: number;
  }
  isPublic: boolean;
}
```

### ✅ Correct

```typescript
interface TournamentSettings {
  maxParticipants: number;
  /**
   * @remarks
   * There will be Math.ceil(participants / maxTeamsPerMatch) matches.
   * Teams will be divided up as evenly among the matches as possible.
   *
   * Set this to Number.MAX_SAFE_INTEGER to indicate that
   * there is no upper limit to the number of teams per match.
   *
   * This MUST be greater than 1.
   */
  // maxTeamsPerMatch: number;
  isPublic: boolean;
}
```

### ❌ Incorrect (namespace / ambient declarations)

```typescript
namespace TournamentSettings {
  export interface Settings {
    maxParticipants: number;
  }

  {
    // maxTeamsPerMatch: number;
    // deprecatedField: string;
  }

  export interface NextGen {
    isPublic: boolean;
  }
}
```

### ✅ Correct (namespace / ambient declarations)

```typescript
namespace TournamentSettings {
  export interface Settings {
    maxParticipants: number;
  }

  // maxTeamsPerMatch: number;
  // deprecatedField: string;

  export interface NextGen {
    isPublic: boolean;
  }
}
```

## When Not To Use It

If your codebase intentionally uses curly-brace blocks that wrap only comments (and you rely on that pattern), you can disable this rule for those files.

## Related Resources

- Issue request: flag invalid brace blocks around commented-out type members to keep interfaces and type aliases readable and compilable.
