# Enforce .f.ts extension for entry points (`@blumintinc/blumint/enforce-f-extension-for-entry-points`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

This rule enforces a naming convention for files that contain Firebase Cloud Function entry points. Specifically, any file that invokes entry point wrappers such as `onCall`, `onCallVaripotent`, `onRequest`, `onQueueTask`, `onWebhook`, or any of the `onDocument*` / `sequentialDocument*` triggers must have a filename ending in `.f.ts` (or `.f.tsx`).

This convention serves as a visual signal in the file explorer and code reviews, making it immediately obvious which files are responsible for defining the public interface of our serverless backend. It helps distinguish between implementation logic (typically in `.ts` files) and the entry points that glue that logic to Firebase events.

## Why it matters:

- **Enhanced Discoverability**: Developers can quickly scan the `functions/src/` directory to identify all deployed Cloud Functions.
- **Consistency across the Monorepo**: Aligns with our established pattern for Firestore, RealtimeDB, and Callable entry points.
- **Improved Code Reviews**: Reviewers can immediately see if a change impacts a public API or a database trigger based on the filename.
- **Prevents Accidental Deployment of Helpers**: Ensures that internal utility files aren't mistakenly structured as entry points.

## Rule Details

The rule applies to any `.ts` or `.tsx` file under `functions/src/`. It flags files that invoke one of the protected entry point wrappers but do not have the `.f.ts` or `.f.tsx` extension.

The check runs in one direction only. A file already named `.f.ts` or `.f.tsx` is skipped outright, so a `.f.ts` file holding nothing but helpers is never reported. The extension is read as a declaration of intent, not as a claim the rule verifies.

### Import Handling

The rule is robust against different import styles:
- **Named Imports**: `import { onCall } from ...`
- **Aliased Imports**: `import { onCall as myCall } from ...`
- **Default Imports**: `import onCall from '../../v2/https/onCall'`
- **Default Imports with custom names**: `import myHandler from '../../v2/https/onCall'` (detected by analyzing the module path)
- **Namespace Imports**: `import * as onCall from '../../v2/https/onCall'` (where the namespace itself is called)

Only imports from `firebase-functions` or our internal `v2/` / `util/webhook/` wrappers are considered entry points. Local functions or third-party libraries with matching names are ignored.

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

export type Props = { userId: string };
export type Response = { success: boolean };

const deleteUser = async (
  request: CallableRequest<Props>,
): Promise<Response> => {
  const { userId } = request.data;
  return { success: true } as const;
};

export default onCall(deleteUser);
```

## Options

### `entryPoints`

Additional function names to treat as entry point wrappers. These **extend** the default list above rather than replacing it, so registering a custom trigger never stops the rule enforcing the convention for the built-in Firebase wrappers.

```json
{
  "@blumintinc/blumint/enforce-f-extension-for-entry-points": [
    "error",
    {
      "entryPoints": ["onMyCustomTrigger"]
    }
  ]
}
```

There is no way to remove a default entry point, and nothing is lost by that: a default matches only when it is actually imported from `firebase-functions` or the internal `v2/` / `util/webhook/` wrappers, so an unused one never fires. Suppress an individual site with `eslint-disable-next-line` instead.

## When Not To Use It

You might consider turning this rule off if you do not follow the `.f.ts` naming convention for Cloud Function entry points.
