# Enforce Props and Response type exports in callable functions (`@blumintinc/blumint/enforce-callable-types`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

Ensure every callable Cloud Function file exports `Props` and `Response` types and applies them to the handler signature. This keeps the request/response contract explicit for both the callable implementation and the clients that consume it.

## Rule Details

The rule checks `.f.ts` files under `callable/` (excluding `callable/scripts/`) that register an `onCall` handler. It reports when:

- `Props` is not exported.
- `Response` is not exported.
- `Props` is exported but not used in the handler parameter (e.g., `CallableRequest<Props>`).
- `Response` is exported but not used as the handler return type (directly or via `Promise<Response>`).

### Why this matters

- Callable payloads arrive as untyped JSON. Without a `Props` export, `request.data` becomes `any`, so invalid payloads and breaking changes slip past compilation.
- Clients depend on a stable response shape. Missing or unused `Response` types let handlers return arbitrary data, causing silent contract drift between server and client.
- Exporting types without using them is misleading documentation; stale contracts provide false safety and hide request/response mismatches.

### Examples of **incorrect** code

Missing Props export:

```ts
import { onCall } from '../../v2/https/onCall';

export type Response = { success: boolean };

const myCallableFunction = async () => ({ success: true });

export default onCall(myCallableFunction);
```

Missing Response export:

```ts
import { onCall } from '../../v2/https/onCall';

export type Props = { userId: string };

const myCallableFunction = async (
  request: CallableRequest<Props>,
) => {
  const { userId } = request.data;
  return { success: true };
};

export default onCall(myCallableFunction);
```

Props exported but unused:

```ts
import { onCall } from '../../v2/https/onCall';

export type Props = { userId: string };
export type Response = { success: boolean };

const myCallableFunction = async (): Promise<Response> => {
  return { success: true };
};

export default onCall(myCallableFunction);
```

Response exported but unused:

```ts
import { onCall } from '../../v2/https/onCall';

export type Props = { userId: string };
export type Response = { success: boolean };

const myCallableFunction = async (
  request: CallableRequest<Props>,
) => {
  const { userId } = request.data;
  return { success: true };
};

export default onCall(myCallableFunction);
```

### Examples of **correct** code

```ts
import { onCall } from '../../v2/https/onCall';

export type Props = { userId: string };
export type Response = { success: boolean };

const myCallableFunction = async (
  request: CallableRequest<Props>,
): Promise<Response> => {
  const { userId } = request.data;
  return { success: true };
};

export default onCall(myCallableFunction);
```

## When Not To Use It

You can disable this rule if your project does not use callable functions, or if you standardize on a different naming/typing scheme for callable request and response contracts.
