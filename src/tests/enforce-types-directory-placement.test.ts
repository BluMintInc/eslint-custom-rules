import { ruleTesterTs } from '../utils/ruleTester';
import { enforceTypesDirectoryPlacement } from '../rules/enforce-types-directory-placement';

const errorMessageId = 'typeOnlyFileOutsideTypesDir' as const;

// ─── Valid Cases ─────────────────────────────────────────────────────────────

ruleTesterTs.run(
  'enforce-types-directory-placement',
  enforceTypesDirectoryPlacement,
  {
    valid: [
      // 1. Type-only file already under functions/src/types/ — should not be flagged.
      {
        filename: '/project/functions/src/types/compositor/sequential.ts',
        code: `
import { Transaction } from 'firebase-admin/firestore';
export type SequentialReturn = Promise<true | void>;
export type HandlerSequential<TPayload extends Array<unknown>> = (
  ...payload: TPayload
) => SequentialReturn;
`,
      },

      // 2. File with runtime const — NOT type-only.
      {
        filename: '/project/functions/src/util/errors/errorCodes.ts',
        code: `
export type gRPCErrorCode = 'ok' | 'cancelled' | 'unknown';
export const GRPC_ERROR_CODE_TO_HTTP_STATUS_CODE = {
  ok: { canonicalName: 'OK', status: 200 },
} as const;
`,
      },

      // 3. File with function declaration alongside type — NOT type-only.
      {
        filename: '/project/functions/src/types/Identifiable.ts',
        code: `
export type Identifiable<T = string> = Readonly<{ id: T }>;
export function isIdentifiable(obj: unknown): obj is Identifiable {
  return obj !== null && typeof obj === 'object' && 'id' in obj;
}
`,
      },

      // 4. .d.ts file outside types directory — always exempt.
      {
        filename: '/project/src/types/global.d.ts',
        code: `
declare global {
  interface Window {
    datadog?: Record<string, unknown>;
  }
}
`,
      },

      // 5. Test file (.test.ts) — exempt by default excludePatterns.
      {
        filename:
          '/project/functions/src/util/tournament/__mocks__/tournamentTypes.test.ts',
        code: `
export type MockTournament = {
  id: string;
  title: string;
};
`,
      },

      // 6. Mock file (__mocks__ directory) — exempt by default excludePatterns.
      {
        filename:
          '/project/functions/src/util/tournament/__mocks__/tournamentTypes.ts',
        code: `
export type MockTournament = {
  id: string;
};
`,
      },

      // 7. Mixed type + runtime — has both const and type declarations.
      {
        filename: '/project/src/hooks/guard/guardFlow.ts',
        code: `
export const GUARD_FLOW_ID_SIGN_IN = 'signIn' as const;
export type GuardFlowIdSignIn = typeof GUARD_FLOW_ID_SIGN_IN;
`,
      },

      // 8. File with class declaration — NOT type-only.
      {
        filename:
          '/project/functions/src/util/notifications/NotificationFiler.ts',
        code: `
import { NotificationContent } from '../../types/firestore/User/Notification';
type NotificationFilerProps = NotificationContent & { toId: string };
export class NotificationFiler {
  constructor(private readonly props: NotificationFilerProps) {}
}
`,
      },

      // 9. File with expression statement — NOT type-only.
      {
        filename: '/project/functions/src/util/initialize.ts',
        code: `
export type Config = { debug: boolean };
console.log('initialized');
`,
      },

      // 10. File with let declaration — NOT type-only.
      {
        filename: '/project/functions/src/util/state.ts',
        code: `
export type State = { active: boolean };
let currentState: State = { active: false };
export { currentState };
`,
      },

      // 11. Empty file — not flagged (no type declarations).
      {
        filename: '/project/functions/src/util/empty.ts',
        code: ``,
      },

      // 12. File outside includePaths (e.g. a scripts/ directory) — not flagged.
      {
        filename: '/project/scripts/build.ts',
        code: `
export type BuildConfig = { outDir: string };
`,
      },

      // 13. File with only imports and no type declarations — pure import barrel, not flagged.
      {
        filename: '/project/functions/src/util/barrel.ts',
        code: `
import { Transaction } from 'firebase-admin/firestore';
import { Something } from './something';
`,
      },

      // 14. Type-only file nested deeper in types directory — valid.
      {
        filename: '/project/functions/src/types/firestore/User/Notification.ts',
        code: `
export type NotificationContent = {
  title: string;
  body: string;
};
`,
      },

      // 15. File with default export of a value (arrow function) — NOT type-only.
      {
        filename: '/project/functions/src/util/helpers.ts',
        code: `
export type HelperOptions = { verbose: boolean };
export default (opts: HelperOptions) => opts.verbose;
`,
      },

      // 16. File with spec extension — exempt.
      {
        filename: '/project/src/components/Button.spec.ts',
        code: `
export type ButtonTestCase = { label: string };
`,
      },

      // 17. Custom typesDirectory — file under that directory should be valid.
      {
        filename: '/project/shared/types/foo.ts',
        options: [
          { typesDirectory: 'shared/types', includePaths: ['shared/**'] },
        ],
        code: `
export type Foo = { id: string };
`,
      },

      // 18. Custom excludePatterns — user-specified pattern excludes the file.
      {
        filename: '/project/functions/src/util/generated/generatedTypes.ts',
        options: [{ excludePatterns: ['**/generated/**'] }],
        code: `
export type GeneratedType = { id: string };
`,
      },

      // 19. `export { Foo }` without `from` (local re-export) — conservatively not flagged
      //     because we cannot determine if Foo is a type or value without the type checker.
      {
        filename: '/project/functions/src/util/reexport.ts',
        code: `
type Foo = { id: string };
export { Foo };
`,
      },

      // 20. File with variable declaration (var) — NOT type-only.
      {
        filename: '/project/functions/src/util/legacy.ts',
        code: `
export type LegacyConfig = { version: number };
var config = { version: 1 };
`,
      },
    ],

    // ─── Invalid Cases ──────────────────────────────────────────────────────

    invalid: [
      // 1. Type-only file in functions/src/v2/ — the canonical bad example from the issue.
      {
        filename: '/project/functions/src/v2/compositor/types.ts',
        code: `
import { Transaction } from 'firebase-admin/firestore';
export type SequentialReturn = Promise<true | void>;
export type HandlerSequential<TPayload extends Array<unknown>> = (
  ...payload: TPayload
) => SequentialReturn;
export type HandlerSequentialTransaction<TPayload extends Array<unknown>> = (
  ...params: [...TPayload, Transaction]
) => SequentialReturn;
export type ToNamed<TFunc> = { name: string; func: TFunc };
`,
        errors: [{ messageId: errorMessageId }],
      },

      // 2. Standalone NotificationFilerProps.ts — single export type in util dir.
      {
        filename:
          '/project/functions/src/util/notifications/NotificationFilerProps.ts',
        code: `
import { NotificationContent } from '../../types/firestore/User/Notification';
export type NotificationFilerProps = NotificationContent & { toId: string };
`,
        errors: [{ messageId: errorMessageId }],
      },

      // 3. Interface-only file in src/components/.
      {
        filename:
          '/project/src/components/edit/wrapper/EditableWrapperProps.ts',
        code: `
export interface ViewComponentPropsBase<TValue> {
  value?: TValue;
  placeholder?: string;
}
export interface EditableWrapperProps<TValue> {
  ViewComponent: unknown;
  lock?: string;
}
`,
        errors: [{ messageId: errorMessageId }],
      },

      // 4. Enum-only file outside types dir — treated as type-level per spec.
      {
        filename: '/project/functions/src/util/tournament/TournamentPhase.ts',
        code: `
export enum TournamentPhase {
  Registration = 'registration',
  CheckIn = 'check-in',
  Active = 'active',
  Finished = 'finished',
}
`,
        errors: [{ messageId: errorMessageId }],
      },

      // 5. Type re-export-only file (export type { ... } from '...') outside types dir.
      {
        filename: '/project/functions/src/util/wallet/walletTypes.ts',
        code: `
export type { TokenEncoded } from '../../types/token/TokenEncoded';
export type { TokenMetadata } from '../../types/firestore/TokenMetadata';
export type { WalletBalance } from '../../types/firestore/User/Wallet';
`,
        errors: [{ messageId: errorMessageId }],
      },

      // 6. Single interface in src/hooks/.
      {
        filename: '/project/src/hooks/guard/guardTypes.ts',
        code: `
export interface GuardState {
  isLoading: boolean;
  isAuthenticated: boolean;
}
`,
        errors: [{ messageId: errorMessageId }],
      },

      // 7. Type alias + import (no runtime code) in functions/src/util/.
      {
        filename: '/project/functions/src/util/network/ApiTypes.ts',
        code: `
import type { PromiseOrValue } from '../../types/utility-types';
export type ApiResponse<T> = PromiseOrValue<{ data: T; error: null } | { data: null; error: string }>;
`,
        errors: [{ messageId: errorMessageId }],
      },

      // 8. Multiple type aliases with value import (not type import) — still type-only.
      {
        filename: '/project/functions/src/v2/compositor/types.ts',
        code: `
import { Transaction } from 'firebase-admin/firestore';
export type Foo = { id: string };
export type Bar = { name: string };
`,
        errors: [{ messageId: errorMessageId }],
      },

      // 9. Mixed type aliases and interfaces, no runtime code.
      {
        filename: '/project/src/components/ui/ButtonProps.ts',
        code: `
export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export interface ButtonProps {
  variant: ButtonVariant;
  label: string;
  onClick?: () => void;
}
`,
        errors: [{ messageId: errorMessageId }],
      },

      // 10. Enum + type alias together, no runtime code.
      {
        filename: '/project/functions/src/util/status/StatusTypes.ts',
        code: `
export enum Status { Active = 'active', Inactive = 'inactive' }
export type StatusLabel = Record<Status, string>;
`,
        errors: [{ messageId: errorMessageId }],
      },

      // 11. ExportAllDeclaration with type keyword.
      {
        filename: '/project/functions/src/util/types/allTypes.ts',
        code: `
export type * from '../../types/compositor/sequential';
`,
        errors: [{ messageId: errorMessageId }],
      },

      // 12. Single type alias in src/utils/ (frontend).
      {
        filename: '/project/src/utils/CommonTypes.ts',
        code: `
export type Nullable<T> = T | null;
`,
        errors: [{ messageId: errorMessageId }],
      },

      // 13. declare module block (TSModuleDeclaration) — type-only.
      {
        filename: '/project/functions/src/util/augmentations.ts',
        code: `
declare module 'some-lib' {
  export interface SomeInterface {
    extraField: string;
  }
}
`,
        errors: [{ messageId: errorMessageId }],
      },

      // 14. Type-only file in functions/src/strategy/ — strategy is a non-types directory.
      {
        filename: '/project/functions/src/strategy/payment/PaymentTypes.ts',
        code: `
export type PaymentMethod = 'card' | 'crypto' | 'bank';
export type PaymentStatus = 'pending' | 'complete' | 'failed';
`,
        errors: [{ messageId: errorMessageId }],
      },

      // 15. Frontend component props file importing from React — still flagged.
      {
        filename:
          '/project/src/components/edit/wrapper/EditableWrapperProps.ts',
        code: `
import { ComponentType, Ref } from 'react';
export type ViewComponentPropsBase<TValue> = Readonly<{
  value?: TValue;
  placeholder?: string;
}>;
export type EditableWrapperProps<TValue> = Readonly<{
  ViewComponent: ComponentType<ViewComponentPropsBase<TValue>>;
  lock?: string;
}>;
`,
        errors: [{ messageId: errorMessageId }],
      },
    ],
  },
);
