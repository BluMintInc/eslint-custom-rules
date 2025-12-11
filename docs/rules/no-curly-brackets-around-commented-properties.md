# Disallow curly braces wrapping commented-out members in type declarations

Rule ID: `@blumintinc/blumint/no-curly-brackets-around-commented-properties`

💼 Enabled in ✅ `recommended` config • 🔧 Fixable • 💭 No type info required

<!-- end auto-generated rule header -->

## Rule Details

This rule flags standalone curly-brace blocks that contain only comments inside type-focused files (interfaces, type aliases, enums, and namespace/type declaration sections). Wrapping commented-out members in their own brace block makes the surrounding type syntactically invalid, hides the intent of the comments, and breaks editor tooling. Remove the braces and leave the comments inline so type declarations stay readable and compilable.

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

## Options

This rule has no options.

## When Not To Use It

If your codebase intentionally uses empty brace blocks to create manual scopes (without any commented-out members inside), you can disable this rule for those files.

## Related Resources

- Issue request: flag invalid brace blocks around commented-out type members to keep interfaces and type aliases readable and compilable.
