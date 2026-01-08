# Enforce .f.ts extension for entry points (`@blumintinc/blumint/enforce-f-extension-for-entry-points`)

<!-- end auto-generated rule header -->

This rule enforces a naming convention for files that contain Firebase Cloud Function entry points. Specifically, any file that invokes entry point wrappers such as `onCall`, `onCallVaripotent`, `onRequest`, `onQueueTask`, `onWebhook`, or any of the `onDocument*` / `sequentialDocument*` triggers must have a filename ending in `.f.ts` (or `.f.tsx`).

This convention serves as a visual signal in the file explorer and code reviews, making it immediately obvious which files are responsible for defining the public interface of our serverless backend. It helps distinguish between implementation logic (typically in `.ts` files) and the entry points that glue that logic to Firebase events.

## Why it matters:

- **Enhanced Discoverability**: Developers can quickly scan the `functions/src/` directory to identify all deployed Cloud Functions.
- **Consistency across the Monorepo**: Aligns with our established pattern for Firestore, RealtimeDB, and Callable entry points.
- **Improved Code Reviews**: Reviewers can immediately see if a change impacts a public API or a database trigger based on the filename.
- **Prevents Accidental Deployment of Helpers**: Ensures that internal utility files aren't mistakenly structured as entry points, and vice versa.

## Rule Details

The rule applies to any `.ts` or `.tsx` file under `functions/src/`. It flags files that invoke one of the protected entry point wrappers but do not have the `.f.ts` or `.f.tsx` extension.

### Entry Point Wrappers (Default):

- `onCall`
- `onCallVaripotent`
- `onRequest`
- `onQueueTask`
- `onWebhook`
- `sequentialDocumentWritten`
- `onDocumentWritten`
- `onDocumentCreated`
- `onDocumentDeleted`
- `onDocumentUpdated`
- `onSchedule`
- `onValueWritten`
- `onValueCreated`
- `onValueUpdated`
- `onValueDeleted`
- `sequentialValueWritten`
- `sequentialValueCreated`
- `sequentialValueUpdated`
- `sequentialValueDeleted`

### Examples of **incorrect** code for this rule:

```typescript
// File: functions/src/firestore/Membership/onWrite.ts
import { sequentialDocumentWritten } from '../../v2/firestore/sequentialDocumentWritten';

const onWrite = sequentialDocumentWritten<Membership, MembershipPath>(
  { document: MEMBERSHIP_PATH },
  [ /* ... handlers */ ]
);
export default onWrite;
```

```typescript
// File: functions/src/callable/user/deleteUser.ts
import { onCall } from '../../v2/https/onCall';

const deleteUser = async (request: Readonly<CallableRequest<DeleteUserRequest>>) => {
  // ... logic
};
export default onCall(deleteUser);
```

### Examples of **correct** code for this rule:

```typescript
// File: functions/src/firestore/Tournament/onWrite.f.ts
import { sequentialDocumentWritten } from '../../v2/firestore/sequentialDocumentWritten';

const onWrite = sequentialDocumentWritten<Tournament, TournamentPath>(
  { document: TOURNAMENT_PATH },
  [ /* ... handlers */ ]
);
export default onWrite;
```

```typescript
// File: functions/src/callable/user/deleteUser.f.ts
import { onCall } from '../../v2/https/onCall';

export default onCall(async (request) => {
  // ... logic
});
```

## Options

### `entryPoints`

An array of function names that should be treated as entry point wrappers. Defaults to the list mentioned above.

```json
{
  "@blumintinc/blumint/enforce-f-extension-for-entry-points": [
    "error",
    {
      "entryPoints": ["onCall", "onRequest", "onMyCustomTrigger"]
    }
  ]
}
```

## When Not To Use It

You might consider turning this rule off if you do not follow the `.f.ts` naming convention for Cloud Function entry points.
