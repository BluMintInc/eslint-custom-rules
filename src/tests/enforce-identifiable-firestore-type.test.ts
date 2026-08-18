import { ruleTesterTs } from '../utils/ruleTester';
import { enforceIdentifiableFirestoreType } from '../rules/enforce-identifiable-firestore-type';

ruleTesterTs.run(
  'enforce-identifiable-firestore-type',
  enforceIdentifiableFirestoreType,
  {
    valid: [
      {
        code: `
        import { Identifiable } from 'functions/src/types/Identifiable';
        export type Connection = Identifiable & {
          userIdsConnected: string[];
          documentPath: string;
        };
      `,
        filename: 'functions/src/types/firestore/Connection/index.ts',
      },
      {
        // Issue #1271: on a Windows backslash firestore path the rule now runs
        // (via separator normalization) and correctly passes a valid type whose
        // name matches its folder and extends Identifiable.
        code: `
        import { Identifiable } from 'functions/src/types/Identifiable';
        export type Connection = Identifiable & {
          userIdsConnected: string[];
          documentPath: string;
        };
      `,
        filename:
          'C:\\repo\\functions\\src\\types\\firestore\\Connection\\index.ts',
      },
      {
        code: `
        import { Identifiable } from '../../Identifiable';
        import { Timestamp } from 'firebase-admin/firestore';

        export type GroupInfo<T = Timestamp> = Identifiable & {
          username: string;
          imgUrl: string;
          dateCreated: T;
        };

        export type Guild<T = Timestamp> = GroupInfo<T>;
      `,
        filename: 'functions/src/types/firestore/Guild/index.ts',
      },
      {
        code: `
        import { Identifiable } from 'path-to-identifiable';
        export type GroupInfo<T = Timestamp> = Resolve<Identifiable & {
          username: string;
          imgUrl: string;
          dateCreated: T;
          groupNumber: number;
          createdBy?: string;
          privacy?: 'private' | 'public' | 'connected';
        }>;
      `,
        filename: 'functions/src/types/firestore/GroupInfo/index.ts',
      },
      {
        code: `
        import { Identifiable } from 'path-to-identifiable';
        export type AdCampaign<TQuota extends Quota, TTime> = Identifiable & {
          quota: TQuota;
          timeRange: TTime;
        };
      `,
        filename: 'functions/src/types/firestore/AdCampaign/index.ts',
      },
      {
        code: `
        import { Resolve } from '../../../utility-types';
        export type UserItem = Resolve<{
          /**
           * id should be \`chainId-contractAddress-itemId\`
           */
          id: string;
          itemId: number;
          amount: number;
          address: string;
          chainId: number;
          provider: NftProvider;
        }>;
      `,
        filename: 'functions/src/types/firestore/UserItem/index.ts',
      },
      {
        code: `
        import { Identifiable } from '../../Identifiable';
        import { Timestamp } from 'firebase-admin/firestore';

        export type GroupInfo<T = Timestamp> = Readonly<
          Identifiable & {
            username: string;
            usernameLowercase: string;
            imgUrl: string;
            dateCreated: T;
          }
        >;

        export type Guild<T = Timestamp> = Readonly<GroupInfo<T>>;
      `,
        filename: 'functions/src/types/firestore/Guild/index.ts',
      },
      {
        code: `
        type Resolve<T> = T;
        type BaseType = { id: string; value: number };
        type TypeA = BaseType;
        type TypeB = Resolve<BaseType>;

        export type Guild = TypeA & TypeB;
      `,
        filename: 'functions/src/types/firestore/Guild/index.ts',
      },
      // Issue #1635: a folder-matching alias exported separately (rather than
      // inline) must still satisfy the rule, since consumers can import it.
      {
        code: `
        import { Identifiable } from '../../Identifiable';

        type Connection = Identifiable & {
          userIdsConnected: string[];
        };

        export { Connection };
      `,
        filename: 'functions/src/types/firestore/Connection/index.ts',
      },
      {
        code: `
        import { Identifiable } from '../../Identifiable';

        type Connection = Identifiable & {
          userIdsConnected: string[];
        };

        export type { Connection };
      `,
        filename: 'functions/src/types/firestore/Connection/index.ts',
      },
      // The export specifier is legal TypeScript even when it precedes the
      // aliased declaration it references (type declarations hoist), so the
      // rule must not depend on visiting the export before the alias.
      {
        code: `
        import { Identifiable } from '../../Identifiable';

        export { Connection };

        type Connection = Identifiable & {
          userIdsConnected: string[];
        };
      `,
        filename: 'functions/src/types/firestore/Connection/index.ts',
      },
      // Renaming on export (including `as default`) still exports the local
      // "Connection" binding, so it must satisfy the gate.
      {
        code: `
        import { Identifiable } from '../../Identifiable';

        type Connection = Identifiable & {
          userIdsConnected: string[];
        };

        export { Connection as default };
      `,
        filename: 'functions/src/types/firestore/Connection/index.ts',
      },
      // Files outside functions/src/types/firestore/** are untouched by the
      // rule regardless of what they export.
      {
        code: `
        export const notAFirestoreType = 1;
      `,
        filename: 'functions/src/types/Connection/index.ts',
      },
      // Issue #1705: the alias chain reaches Identifiable through an IMPORTED
      // type. The rule reads one file, so it cannot see the imported type's
      // shape; asserting the absence of Identifiable there is a claim it
      // cannot substantiate, and the workaround it forces (`Identifiable &
      // Team<TTime>`) is a type-theoretically redundant intersection.
      /**
       * The folder-matching alias reaches Identifiable through an IMPORTED
       * alias. findTypeAliasAnnotation only inspects TSTypeAliasDeclaration
       * defs in scope, so the chain dead-ends at the module boundary and the
       * rule wrongly reports notExtendingIdentifiable.
       */
      {
        code: `
          import { Timestamp } from 'firebase-admin/firestore';
          import { Team } from '../Team';

          export type ParticipantTeam<TTime = Timestamp> = Team<TTime>;

          export type Participant<TTime = Timestamp> = ParticipantTeam<TTime>;
        `,
        filename:
          'functions/src/types/firestore/Tournament/Participant/index.ts',
      },
      /** The directly-imported form, with no local hop at all. */
      {
        code: `
          import { Team } from '../Team';

          export type Participant = Team;
        `,
        filename:
          'functions/src/types/firestore/Tournament/Participant/index.ts',
      },
      // A type-only import is the same dead end.
      {
        code: `
        import type { Team } from '../Team';

        export type Participant = Team;
      `,
        filename:
          'functions/src/types/firestore/Tournament/Participant/index.ts',
      },
      // A default import binds through ImportDefaultSpecifier rather than
      // ImportSpecifier, and is equally opaque.
      {
        code: `
        import Team from '../Team';

        export type Participant = Team;
      `,
        filename:
          'functions/src/types/firestore/Tournament/Participant/index.ts',
      },
      // The imported type may carry Identifiable underneath a transparent
      // wrapper, so the wrapper must not turn the unknown back into a report.
      {
        code: `
        import { Team } from '../Team';

        export type Participant = Readonly<Team>;
      `,
        filename:
          'functions/src/types/firestore/Tournament/Participant/index.ts',
      },
      // An intersection whose other branch is imported: the imported branch
      // may be the one supplying id.
      {
        code: `
        import { Team } from '../Team';

        export type Participant = Team & { seed: number };
      `,
        filename:
          'functions/src/types/firestore/Tournament/Participant/index.ts',
      },
      // A namespace-qualified reference names a type in another module too,
      // even though it carries a TSQualifiedName rather than an Identifier.
      {
        code: `
        import * as Types from '../Team';

        export type Participant = Types.Team;
      `,
        filename:
          'functions/src/types/firestore/Tournament/Participant/index.ts',
      },
      // Issue #2035: every remedy the notExtendingIdentifiable message names
      // has to clear the rule, or the message prescribes advice that reproduces
      // itself. The next four fixtures are the message's own spellings,
      // verbatim.
      /**
       * Remedy 1 of 3: intersect Identifiable. Also the spelling the message
       * renders literally, comment placeholder included.
       */
      {
        code: `
        export type Connection = Identifiable & { /* other fields */ };
      `,
        filename: 'functions/src/types/firestore/Connection/index.ts',
      },
      /** Remedy 2 of 3: `extends Identifiable`, which needs an interface. */
      {
        code: `
        import { Identifiable } from '../../Identifiable';

        export interface Connection extends Identifiable {
          userIdsConnected: string[];
        }
      `,
        filename: 'functions/src/types/firestore/Connection/index.ts',
      },
      /**
       * Remedy 3 of 3: declare `id: string` inline. This is also the example
       * the missingType message renders, so it must clear BOTH messages —
       * creating the folder-named type only to trip notExtendingIdentifiable
       * would make that remedy unfollowable too.
       */
      {
        code: `
        export type Connection = { id: string; /* other fields */ };
      `,
        filename: 'functions/src/types/firestore/Connection/index.ts',
      },
      // An inline id satisfies the rule wherever it appears, not only under a
      // `Resolve<>` wrapper: it delivers exactly the ID field the rule exists
      // to guarantee.
      {
        code: `
        export type Connection = {
          id: string;
          userIdsConnected: string[];
        };
      `,
        filename: 'functions/src/types/firestore/Connection/index.ts',
      },
      // An id contributed by one branch of an intersection.
      {
        code: `
        export type Connection = { userIdsConnected: string[] } & { id: string };
      `,
        filename: 'functions/src/types/firestore/Connection/index.ts',
      },
      // An id reached through a local alias hop.
      {
        code: `
        type Base = { id: string; userIdsConnected: string[] };

        export type Connection = Base;
      `,
        filename: 'functions/src/types/firestore/Connection/index.ts',
      },
      // An id under a transparent wrapper.
      {
        code: `
        export type Connection = Readonly<{
          id: string;
          userIdsConnected: string[];
        }>;
      `,
        filename: 'functions/src/types/firestore/Connection/index.ts',
      },
      // An interface may carry the id inline just as an alias may.
      {
        code: `
        export interface Connection {
          id: string;
          userIdsConnected: string[];
        }
      `,
        filename: 'functions/src/types/firestore/Connection/index.ts',
      },
      // Interface heritage is walked like an intersection: a local base that
      // supplies the id satisfies the requirement.
      {
        code: `
        interface Base {
          id: string;
        }

        export interface Connection extends Base {
          userIdsConnected: string[];
        }
      `,
        filename: 'functions/src/types/firestore/Connection/index.ts',
      },
      // ...including a multi-hop heritage chain ending at Identifiable.
      {
        code: `
        import { Identifiable } from '../../Identifiable';

        interface Base extends Identifiable {
          createdAt: number;
        }

        export interface Connection extends Base {
          userIdsConnected: string[];
        }
      `,
        filename: 'functions/src/types/firestore/Connection/index.ts',
      },
      // An alias whose chain ends at a local interface carrying the id.
      {
        code: `
        interface Base {
          id: string;
        }

        export type Connection = Base;
      `,
        filename: 'functions/src/types/firestore/Connection/index.ts',
      },
      // The export forms accepted for an alias apply to an interface too: a
      // separate export specifier reaches the same local binding.
      {
        code: `
        import { Identifiable } from '../../Identifiable';

        interface Connection extends Identifiable {
          userIdsConnected: string[];
        }

        export { Connection };
      `,
        filename: 'functions/src/types/firestore/Connection/index.ts',
      },
      // `export default interface` exports the local binding as well.
      {
        code: `
        import { Identifiable } from '../../Identifiable';

        export default interface Connection extends Identifiable {
          userIdsConnected: string[];
        }
      `,
        filename: 'functions/src/types/firestore/Connection/index.ts',
      },
      // Interfaces merge, so the id may be declared by either declaration of
      // the name.
      {
        code: `
        export interface Connection {
          id: string;
        }

        export interface Connection {
          userIdsConnected: string[];
        }
      `,
        filename: 'functions/src/types/firestore/Connection/index.ts',
      },
      // Issue #1705's amnesty follows the same reasoning through heritage: an
      // imported base is opaque to this single-file walk, so its lack of an id
      // is unproven rather than disproven.
      {
        code: `
        import { Team } from '../Team';

        export interface Participant extends Team {
          seed: number;
        }
      `,
        filename:
          'functions/src/types/firestore/Tournament/Participant/index.ts',
      },
      // A namespace-qualified base carries a MemberExpression rather than an
      // Identifier, and names another module just the same.
      {
        code: `
        import * as Types from '../Team';

        export interface Participant extends Types.Team {
          seed: number;
        }
      `,
        filename:
          'functions/src/types/firestore/Tournament/Participant/index.ts',
      },
    ],
    invalid: [
      {
        code: `
        export type Connection = {
          userIdsConnected: string[];
          documentPath: string;
        };
      `,
        filename: 'functions/src/types/firestore/Connection/index.ts',
        errors: [
          {
            messageId: 'notExtendingIdentifiable',
            data: { typeName: 'Connection' },
          },
        ],
      },
      {
        code: `
        export type WrongName = Identifiable & {
          userIdsConnected: string[];
          documentPath: string;
        };
      `,
        filename: 'functions/src/types/firestore/Connection/index.ts',
        errors: [
          {
            messageId: 'missingType',
            data: { typeName: 'Connection', folderName: 'Connection' },
          },
        ],
      },
      // Issue #2035: `export type Connection = { id: string; ... }` used to be
      // asserted here, pinning the rule's report on the very remedy its message
      // prescribes. The inline id is the ID field the rule exists to guarantee,
      // so the fixture belongs in `valid` and lives there now; the arm that
      // still has to report — an id-less type — is the fixture directly above.
      {
        code: `
        export const defaultConnection = {
          id: '123',
          userIdsConnected: ['user1', 'user2'],
        };
      `,
        filename: 'functions/src/types/firestore/Connection/index.ts',
        errors: [
          {
            messageId: 'missingType',
            data: { typeName: 'Connection', folderName: 'Connection' },
          },
        ],
      },
      {
        code: `
        import { Timestamp } from 'firebase-admin/firestore';

        export type GroupInfo<T = Timestamp> = Readonly<{
          username: string;
          usernameLowercase: string;
          imgUrl: string;
          dateCreated: T;
        }>;

        export type Guild<T = Timestamp> = Readonly<GroupInfo<T>>;
      `,
        filename: 'functions/src/types/firestore/Guild/index.ts',
        errors: [
          {
            messageId: 'notExtendingIdentifiable',
            data: { typeName: 'Guild' },
          },
        ],
      },
      {
        code: `
        import { Identifiable } from '../../Identifiable';

        export type Guild = Map<Identifiable, string>;
      `,
        filename: 'functions/src/types/firestore/Guild/index.ts',
        errors: [
          {
            messageId: 'notExtendingIdentifiable',
            data: { typeName: 'Guild' },
          },
        ],
      },
      {
        code: `
        export type Guild = Resolve<Map<{ id: string }, string>>;
      `,
        filename: 'functions/src/types/firestore/Guild/index.ts',
        errors: [
          {
            messageId: 'notExtendingIdentifiable',
            data: { typeName: 'Guild' },
          },
        ],
      },
      {
        code: `
        import { Identifiable } from '../../Identifiable';

        export type Guild = Array<Identifiable>;
      `,
        filename: 'functions/src/types/firestore/Guild/index.ts',
        errors: [
          {
            messageId: 'notExtendingIdentifiable',
            data: { typeName: 'Guild' },
          },
        ],
      },
      {
        code: `
        type Loop = Readonly<Loop>;

        export type Guild = Resolve<Loop>;
      `,
        filename: 'functions/src/types/firestore/Guild/index.ts',
        errors: [
          {
            messageId: 'notExtendingIdentifiable',
            data: { typeName: 'Guild' },
          },
        ],
      },
      {
        code: `
        import { Identifiable } from '../../Identifiable';

        type Aliased = Identifiable;

        export type Guild = keyof Aliased;
      `,
        filename: 'functions/src/types/firestore/Guild/index.ts',
        errors: [
          {
            messageId: 'notExtendingIdentifiable',
            data: { typeName: 'Guild' },
          },
        ],
      },
      {
        // Issue #1271: a Windows backslash firestore-types path must be enforced.
        // Before separator normalization the forward-slash pattern never
        // matched, so the rule silently no-op'd on Windows.
        code: `
        export type Connection = {
          userIdsConnected: string[];
          documentPath: string;
        };
      `,
        filename:
          'C:\\repo\\functions\\src\\types\\firestore\\Connection\\index.ts',
        errors: [
          {
            messageId: 'notExtendingIdentifiable',
            data: { typeName: 'Connection' },
          },
        ],
      },
      // Issue #1635: a folder-matching type alias with no `export` at all is
      // unreachable by any consumer, so it must not satisfy the rule.
      {
        code: `
        import { Identifiable } from '../../Identifiable';

        type Connection = Identifiable & {
          userIdsConnected: string[];
          documentPath: string;
        };
      `,
        filename: 'functions/src/types/firestore/Connection/index.ts',
        errors: [
          {
            messageId: 'missingType',
            data: { typeName: 'Connection', folderName: 'Connection' },
          },
        ],
      },
      // An unrelated export existing alongside the unexported matching alias
      // does not make the alias itself reachable.
      {
        code: `
        import { Identifiable } from '../../Identifiable';

        type Connection = Identifiable & {
          userIdsConnected: string[];
        };

        export const DEFAULT_CONNECTION = { id: '1' };
      `,
        filename: 'functions/src/types/firestore/Connection/index.ts',
        errors: [
          {
            messageId: 'missingType',
            data: { typeName: 'Connection', folderName: 'Connection' },
          },
        ],
      },
      // A re-export with a source exports a binding from another module, not
      // the local alias declared in this file, so it must not satisfy the gate.
      {
        code: `
        import { Identifiable } from '../../Identifiable';

        type Connection = Identifiable & {
          userIdsConnected: string[];
        };

        export { Connection } from './other';
      `,
        filename: 'functions/src/types/firestore/Connection/index.ts',
        errors: [
          {
            messageId: 'missingType',
            data: { typeName: 'Connection', folderName: 'Connection' },
          },
        ],
      },
      // A separately-exported alias still needs to extend Identifiable; being
      // exported doesn't exempt it from the id-field requirement.
      {
        code: `
        type Connection = {
          userIdsConnected: string[];
        };

        export { Connection };
      `,
        filename: 'functions/src/types/firestore/Connection/index.ts',
        errors: [
          {
            messageId: 'notExtendingIdentifiable',
            data: { typeName: 'Connection' },
          },
        ],
      },
      // No alias named after the folder exists at all; an unrelated exported
      // type doesn't satisfy the requirement.
      {
        code: `
        import { Identifiable } from '../../Identifiable';

        export type Other = Identifiable & {
          userIdsConnected: string[];
        };
      `,
        filename: 'functions/src/types/firestore/Connection/index.ts',
        errors: [
          {
            messageId: 'missingType',
            data: { typeName: 'Connection', folderName: 'Connection' },
          },
        ],
      },
      // Issue #1705 regression guards. The amnesty granted to a chain that
      // leaves the module must not widen into a blanket one: everything the
      // rule can still resolve must keep reporting.
      /** REGRESSION GUARD: the folder-name gate must still report. */
      {
        code: `
          import { Identifiable } from '../../Identifiable';
          export type Other = Identifiable & { userIdsConnected: string[] };
        `,
        filename: 'functions/src/types/firestore/Connection/index.ts',
        errors: [
          {
            messageId: 'missingType',
            data: { typeName: 'Connection', folderName: 'Connection' },
          },
        ],
      },
      /**
       * REGRESSION GUARD: a locally-declared alias that genuinely lacks
       * Identifiable is fully resolvable, so it must still report.
       */
      {
        code: `
          type Base = { name: string };
          export type Connection = Base;
        `,
        filename: 'functions/src/types/firestore/Connection/index.ts',
        errors: [{ messageId: 'notExtendingIdentifiable' }],
      },
      // The amnesty keys on the chain, not on the file: an import the chain
      // never reaches leaves a fully local — and fully resolvable — chain
      // reportable.
      {
        code: `
        import { Timestamp } from 'firebase-admin/firestore';

        type Base = { dateCreated: Timestamp };
        type Wrapped = Readonly<Base>;

        export type Connection = Wrapped;
      `,
        filename: 'functions/src/types/firestore/Connection/index.ts',
        errors: [
          {
            messageId: 'notExtendingIdentifiable',
            data: { typeName: 'Connection' },
          },
        ],
      },
      // An imported type used only as a type argument of an unresolvable
      // generic is never on the chain the rule walks, so it grants no amnesty.
      {
        code: `
        import { Team } from '../Team';

        export type Connection = Map<Team, string>;
      `,
        filename: 'functions/src/types/firestore/Connection/index.ts',
        errors: [
          {
            messageId: 'notExtendingIdentifiable',
            data: { typeName: 'Connection' },
          },
        ],
      },
      // The amnesty covers notExtendingIdentifiable only. An alias reaching an
      // imported type still has to exist under the folder's name and be
      // exported, so the folder-name gate reports independently.
      {
        code: `
        import { Team } from '../Team';

        type Connection = Team;
      `,
        filename: 'functions/src/types/firestore/Connection/index.ts',
        errors: [
          {
            messageId: 'missingType',
            data: { typeName: 'Connection', folderName: 'Connection' },
          },
        ],
      },
      // Issue #2035 regression guards. Honouring the message's remedies must
      // not soften the requirement itself: a document type carrying neither an
      // id nor Identifiable still reports, in either spelling.
      /** REGRESSION GUARD: an interface with no id and no heritage. */
      {
        code: `
        export interface Connection {
          userIdsConnected: string[];
          documentPath: string;
        }
      `,
        filename: 'functions/src/types/firestore/Connection/index.ts',
        errors: [
          {
            messageId: 'notExtendingIdentifiable',
            data: { typeName: 'Connection' },
          },
        ],
      },
      /**
       * REGRESSION GUARD: a fully resolvable heritage chain that supplies no
       * id is proved id-less, so the amnesty does not apply.
       */
      {
        code: `
        interface Base {
          createdAt: number;
        }

        export interface Connection extends Base {
          userIdsConnected: string[];
        }
      `,
        filename: 'functions/src/types/firestore/Connection/index.ts',
        errors: [
          {
            messageId: 'notExtendingIdentifiable',
            data: { typeName: 'Connection' },
          },
        ],
      },
      // `id` of any other type is not the ID field the rule requires.
      {
        code: `
        export type Connection = {
          id: number;
          userIdsConnected: string[];
        };
      `,
        filename: 'functions/src/types/firestore/Connection/index.ts',
        errors: [
          {
            messageId: 'notExtendingIdentifiable',
            data: { typeName: 'Connection' },
          },
        ],
      },
      // An id declared by a type the walk never descends into (a type argument
      // of an unresolvable generic) is not the document's own id.
      {
        code: `
        export type Connection = Map<{ id: string }, string>;
      `,
        filename: 'functions/src/types/firestore/Connection/index.ts',
        errors: [
          {
            messageId: 'notExtendingIdentifiable',
            data: { typeName: 'Connection' },
          },
        ],
      },
      // Recognizing interfaces does not exempt them from the export gate.
      {
        code: `
        import { Identifiable } from '../../Identifiable';

        interface Connection extends Identifiable {
          userIdsConnected: string[];
        }
      `,
        filename: 'functions/src/types/firestore/Connection/index.ts',
        errors: [
          {
            messageId: 'missingType',
            data: { typeName: 'Connection', folderName: 'Connection' },
          },
        ],
      },
      // Nor from the folder-name gate.
      {
        code: `
        import { Identifiable } from '../../Identifiable';

        export interface Other extends Identifiable {
          userIdsConnected: string[];
        }
      `,
        filename: 'functions/src/types/firestore/Connection/index.ts',
        errors: [
          {
            messageId: 'missingType',
            data: { typeName: 'Connection', folderName: 'Connection' },
          },
        ],
      },
    ],
  },
);
