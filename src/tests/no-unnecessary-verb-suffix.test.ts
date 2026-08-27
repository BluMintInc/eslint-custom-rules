import { Linter, Rule } from 'eslint';
import { ruleTesterTs } from '../utils/ruleTester';
import { noUnnecessaryVerbSuffix } from '../rules/no-unnecessary-verb-suffix';
import { enforceObjectLiteralAsConst } from '../rules/enforce-object-literal-as-const';
import { preferTypeOverInterface } from '../rules/prefer-type-over-interface';

ruleTesterTs.run('no-unnecessary-verb-suffix', noUnnecessaryVerbSuffix, {
  valid: [
    // #1885: an `as T` pins the member names `T` REQUIRES, even though it does
    // not reject excess ones. These two were `invalid` on the excess-property
    // reasoning, but the rename they demanded does not compile — measured:
    //   { orderBy } as QueryLike            -> clean
    //   { order }   as QueryLike            -> TS2352, "Property 'orderBy' is
    //                                          missing ... but required"
    // The excess half of the premise does hold, and is still covered elsewhere:
    //   { orderBy, extra } as QueryLike     -> clean
    //   const c: QueryLike = { orderBy, extra } -> TS2322
    // A rename removes a REQUIRED member, which is the check an assertion does
    // perform, so the name is dictated by the target type either way.
    // Spelled `type` rather than `interface` so the fixtures do not also join
    // the documented no-unnecessary-verb-suffix::prefer-type-over-interface
    // disagreement; the assertion is what this pins, and it reads identically.
    `
    type QueryLike = {
      orderBy: (field: string) => void;
    };
    const chain = {
      orderBy: (field: string) => {
        return;
      },
    } as QueryLike;
  `,
    `
    type FakeQuery = {
      fetchTournamentsBy: (key: string) => string;
    };
    const query = {
      fetchTournamentsBy: (key: string) => {
        return key;
      },
    } as FakeQuery;
  `,
    // `as const` declares no members of its own, so it pins no name and stays
    // transparent — `enforce-object-literal-as-const` appends one to exactly
    // these literals by `--fix`, and that must not silence the rule.
    // Regular function declarations
    'function createMatch(player) {}',
    'function computeValue(data) {}',
    'function updateConfig(options) {}',
    'function convertData(format) {}',
    'function validateInput(rules) {}',
    'function searchItems(container) {}',
    'function processEvent(element) {}',

    // Single-word functions (no verb+suffix pattern)
    'function fetch() {}',
    'function get() {}',
    'function set() {}',
    'function update() {}',
    'function remove() {}',
    'function erase() {}',

    // Functions with non-verb suffixes
    'function dataProcessor() {}',
    'function eventHandler() {}',
    'function configManager() {}',
    'function userController() {}',

    // Functions with suffixes that are part of the name, not prepositions
    'function fetchUserInfo() {}',
    'function processDataPoints() {}',
    'function calculateTotalAmount() {}',
    'function validateUserInput() {}',

    // Class methods
    `class TournamentService {
      initializeGame(player) {}
      calculateScore(results) {}
      updateState(data) {}
      transformData(format) {}
      filterUsers(criteria) {}
    }`,

    // Class methods with non-verb suffixes
    `class DataService {
      dataProcessor() {}
      eventHandler() {}
      configManager() {}
    }`,

    // Interface methods - simple valid test
    `interface UserService {
      getUser(id: string): User;
      createUser(data: UserData): User;
      updateUser(id: string, data: UserData): User;
      deleteUser(id: string): void;
    }`,

    // Arrow functions
    'const transformData = (options) => {};',
    'const prepareState = (component) => {};',
    'const validate = (rules) => {};',
    'const search = (scope) => {};',

    // Arrow functions with non-verb suffixes
    'const dataHandler = () => {};',
    'const eventProcessor = () => {};',
    'const configManager = () => {};',

    // Object methods
    `const api = {
      getUser(id) {},
      createUser(data) {},
      updateUser(id, data) {},
      deleteUser(id) {}
    };`,

    // Function expressions - only simple cases
    'const fn = function process() {};',
    'const handler = function handle() {};',

    // Functions with legitimate compound names
    'function buildUserInterface() {}',
    'function createDataStructure() {}',
    'function validateFormInput() {}',

    // Cases where suffix adds necessary context
    'function migrateDataFromLegacy(data) {}',
    'function mergeConfigWithDefaults(config) {}',
    'function convertTemperatureToCelsius(temp) {}',
    'function sortUsersByRank(users) {}',
    'function searchProductsInCategory(category) {}',
    'function validateInputAgainstSchema(input) {}',
    'function processEventsUntilTimeout(events) {}',
    'function computeScoreViaAlgorithm(data) {}',

    // More legitimate cases with meaningful context
    'function fetchDataFromApi() {}',
    'function saveDataToDatabase() {}',
    'function filterUsersByRole() {}',
    'function processEventsInBatch() {}',
    'function executeTasksInParallel() {}',
    'function transformDataWithPipeline() {}',

    // Edge cases with non-standard naming
    'function _privateProcess() {}',
    'function $specialHandler() {}',
    'const _privateTransform = () => {};',
    'const $specialProcess = () => {};',

    // Functions with numeric components
    'function process123() {}',
    'function handle456() {}',
    'const transform789 = () => {};',

    // Phrasal-verb past-participle adjectives (the trailing particle fuses with
    // a preceding "-ed" participle into a single state adjective; stripping it
    // destroys the meaning). Regression: issue #1227.
    'const isLiveUserSignedIn = async () => {};',
    'function isSignedIn() {}',
    'function isLoggedIn() {}',
    'const signedIn = () => {};',
    'const loggedIn = () => {};',
    'const optedIn = () => {};',
    'const zoomedIn = () => {};',
    'function isOptedIn() {}',
    'function hasZoomedIn() {}',
    'function wasLoggedOut() {}',
    'function isLoggedOut() {}',
    'const signedOut = () => {};',

    // Base-form compound phrasal verbs (the particle is inseparable from a
    // known phrasal-verb stem). Regression: issue #1227.
    'const useGuardSignIn = () => {};',
    'const useGuardSignInGame = () => {};',
    'function handleSignIn() {}',
    'function handleLogIn() {}',
    'function handleLogOut() {}',
    'function handleOptIn() {}',
    'function handleCheckIn() {}',
    'function handleZoomIn() {}',
    `class AuthService {
      handleSignIn() {}
      handleLogOut() {}
    }`,

    // Async/Sync suffixes encode execution model (async vs sync variant), not a
    // parameter relationship — stripping them produces name collisions with sync
    // siblings and destroys the paired-variant convention. Regression: issue #1252.

    // Paired sync sibling: auto-fix would collide with the sibling name.
    'function executeCommand(command) {}\nfunction executeCommandAsync(command) {}',

    // Standalone async function declarations
    'function fetchDataAsync(url) {}',
    'function loadConfigAsync(path) {}',
    'function executeAsync(task) {}',
    'function processAsync(data) {}',

    // Standalone sync function declarations
    'function loadConfigSync(path) {}',
    'function processSync(data) {}',
    'function readFileSync(path) {}',

    // Arrow function consts
    'const runTaskAsync = (task) => task;',
    'const fetchResultsAsync = (query) => query;',
    'const computeSync = (val) => val;',

    // Object methods
    'const obj = { saveRecordAsync(record) { return record; } };',
    'const obj = { loadDataSync(path) { return path; } };',

    // Class instance methods
    `class Runner {
      executeAsync(command) {}
      runSync(command) {}
    }`,

    // Class static methods
    `class FileUtils {
      static readAsync(path) {}
      static writeSync(path, data) {}
    }`,

    // Multi-word names with Async/Sync suffix
    'function initializeGameAsync(options) {}',
    'function calculateScoreSync(results) {}',
    `class DataService {
      fetchUserProfileAsync(id) {}
      updateCacheSync(key, value) {}
    }`,

    // Declared conformance signals (#1350): a member name fixed by someone
    // else's contract is not the author's to rename. An annotated object
    // literal, a `satisfies` clause, and a class heritage clause each pin the
    // member name to the target type.

    // A: type-annotated variable holding the literal.
    `
  interface QueryLike {
    orderBy: (field: string, direction: string) => QueryLike;
  }
  const buildFake = (): QueryLike => {
    const chain: QueryLike = {
      orderBy: (field, direction) => {
        return chain;
      },
    };
    return chain;
  };
`,
    // B: `satisfies` clause on the literal.
    `
  interface QueryLike {
    orderBy: (field: string, direction: string) => QueryLike;
  }
  const satisfied = {
    orderBy: (field: string, direction: string) => {
      return satisfied;
    },
  } satisfies QueryLike;
`,
    // C: class heritage whose in-file interface declares the member.
    `
  interface QueryLike {
    orderBy: (field: string, direction: string) => QueryLike;
  }
  class FakeQuery implements QueryLike {
    public orderBy(field: string, direction: string) {
      return this as never;
    }
  }
`,
    // A on a class field: the field annotation checks the literal just as a
    // variable annotation does.
    `
  interface QueryLike {
    orderBy: (field: string, direction: string) => void;
  }
  class FakeQuery {
    private handlers: QueryLike = {
      orderBy: (field, direction) => {
        return;
      },
    };
  }
`,
    // A reaching a nested literal: the outer annotation checks the whole shape.
    `
  interface Cfg {
    handlers: { orderBy: (field: string) => void };
  }
  const cfg: Cfg = {
    handlers: {
      orderBy: (field: string) => {
        return;
      },
    },
  };
`,
    // A reaching through an array element.
    `
  interface Handler {
    filterUsersBy: (role: string) => void;
  }
  const handlers: Handler[] = [
    {
      filterUsersBy: (role: string) => {
        return;
      },
    },
  ];
`,
    // B reaching through an array element.
    `
  type Handlers = { orderBy: (field: string) => void }[];
  const handlers = [
    {
      orderBy: (field: string) => {
        return;
      },
    },
  ] satisfies Handlers;
`,
    // A with a generic type reference: any non-any/unknown annotation carries
    // the excess-property check.
    `
  interface QueryLike<T> {
    orderBy: (field: keyof T) => void;
  }
  const chain: QueryLike<{ score: number }> = {
    orderBy: (field) => {
      return;
    },
  };
`,
    // C via a type alias to a type literal declared in file.
    `
  type QueryLike = {
    orderBy: (field: string) => void;
  };
  class FakeQuery implements QueryLike {
    orderBy(field: string) {}
  }
`,
    // C via an interface `extends` chain that resolves in file.
    `
  interface Sortable {
    orderBy: (field: string) => void;
  }
  interface QueryLike extends Sortable {
    limit: (count: number) => void;
  }
  class FakeQuery implements QueryLike {
    orderBy(field: string) {}
    limit(count: number) {}
  }
`,
    // C via `extends`: the base class declares the member.
    `
  interface Sortable {
    orderBy: (field: string) => void;
  }
  class BaseQuery implements Sortable {
    orderBy(field: string) {}
  }
  class FakeQuery extends BaseQuery {
    orderBy(field: string) {}
  }
`,
    // C via an inherited member two levels up the `extends` chain.
    `
  interface Sortable {
    orderBy: (field: string) => void;
  }
  class RootQuery implements Sortable {
    orderBy(field: string) {}
  }
  class BaseQuery extends RootQuery {}
  class FakeQuery extends BaseQuery {
    orderBy(field: string) {}
  }
`,
    // C with an unresolvable (imported) heritage type: the contract lives in
    // another module, so a false negative is preferred over a false positive.
    `
  import type { QueryLike } from './QueryLike';
  class FakeQuery implements QueryLike {
    public orderBy(field: string, direction: string) {
      return this as never;
    }
  }
`,
    // C with an unresolvable superclass expression (mixin call).
    `
  class FakeQuery extends mixin(Base) {
    orderBy(field: string) {}
  }
`,
    // C with the contract declared after its implementer: resolution is
    // file-wide, not order-dependent.
    `
  class FakeQuery implements QueryLike {
    orderBy(field: string) {}
  }
  interface QueryLike {
    orderBy: (field: string) => void;
  }
`,
    // C across merged interface declarations.
    `
  interface QueryLike {
    limit: (count: number) => void;
  }
  interface QueryLike {
    orderBy: (field: string) => void;
  }
  class FakeQuery implements QueryLike {
    orderBy(field: string) {}
  }
`,
    // C with an exported contract: the export wrapper must not hide it.
    `
  export interface QueryLike {
    orderBy: (field: string) => void;
  }
  class FakeQuery implements QueryLike {
    orderBy(field: string) {}
  }
`,
    // C where the in-file contract inherits from an unresolvable one.
    `
  import type { Sortable } from './Sortable';
  interface QueryLike extends Sortable {
    limit: (count: number) => void;
  }
  class FakeQuery implements QueryLike {
    orderBy(field: string) {}
  }
`,
    // C where one of several contracts declares the member.
    `
  interface Limitable {
    limit: (count: number) => void;
  }
  interface Sortable {
    orderBy: (field: string) => void;
  }
  class FakeQuery implements Limitable, Sortable {
    orderBy(field: string) {}
  }
`,
    // C on a class expression.
    `
  interface QueryLike {
    orderBy: (field: string) => void;
  }
  const FakeQuery = class implements QueryLike {
    orderBy(field: string) {}
  };
`,
    // C where the contract is an intersection alias: the reference constituent
    // resolves in file and declares the member.
    `
  interface Sortable {
    orderBy: (field: string) => void;
  }
  type QueryLike = Sortable & { limit: (count: number) => void };
  class FakeQuery implements QueryLike {
    orderBy(field: string) {}
  }
`,
    // C where an intersection constituent is a type literal declaring the
    // member: an intersection contributes every constituent's members, so the
    // name is the contract's (#1679).
    `
  type Base = { limit: (count: number) => void };
  type QueryLike = Base & { orderBy: (field: string) => void };
  class FakeQuery implements QueryLike {
    orderBy(field: string) {}
  }
`,
    // C via a plain type-literal alias declaring the member — the control the
    // intersection cases above are read against.
    `
  type QueryLike = { filterUsersBy: (role: string) => void };
  class FakeQuery implements QueryLike {
    filterUsersBy(role: string) {}
  }
`,
    // C where every intersection constituent is an imported reference: nothing
    // about the contract is readable here.
    `
  import type { Sortable } from './Sortable';
  import type { Limitable } from './Limitable';
  type QueryLike = Sortable & Limitable;
  class FakeQuery implements QueryLike {
    orderBy(field: string) {}
  }
`,
    // C where the member is absent from the readable constituent but an
    // imported one remains: the name may be declared in the part this file
    // cannot see, so the answer is indeterminate and the exemption stands.
    `
  import type { Sortable } from './Sortable';
  type QueryLike = Sortable & { limit: (count: number) => void };
  class FakeQuery implements QueryLike {
    orderBy(field: string) {}
  }
`,
    // C where a constituent is a mapped type, whose members are produced rather
    // than listed.
    `
  type Fields = { limit: number };
  type QueryLike = { [K in keyof Fields]: Fields[K] } & {
    page: (index: number) => void;
  };
  class FakeQuery implements QueryLike {
    orderBy(field: string) {}
  }
`,
    // C where a constituent applies a utility type the file does not declare.
    `
  type Fields = { limit: (count: number) => void };
  type QueryLike = Partial<Fields> & { page: (index: number) => void };
  class FakeQuery implements QueryLike {
    orderBy(field: string) {}
  }
`,
    // C where a constituent is a namespaced reference, which cannot be
    // followed.
    `
  type QueryLike = firestore.Sortable & { limit: (count: number) => void };
  class FakeQuery implements QueryLike {
    orderBy(field: string) {}
  }
`,
    // C where the contract is a union: a value satisfies one branch, so no
    // branch's member list describes the implementer.
    `
  type QueryLike =
    | { limit: (count: number) => void }
    | { page: (index: number) => void };
  class FakeQuery implements QueryLike {
    orderBy(field: string) {}
  }
`,
    // C through a chain of intersection aliases: the member sits in the
    // innermost constituent.
    `
  type Sortable = { orderBy: (field: string) => void };
  type Inner = Sortable & { limit: (count: number) => void };
  type QueryLike = Inner & { page: (index: number) => void };
  class FakeQuery implements QueryLike {
    orderBy(field: string) {}
  }
`,
    // C with a namespaced heritage expression, which cannot be followed.
    `
  class FakeQuery implements firestore.QueryLike {
    orderBy(field: string) {}
  }
`,
    // C where the base class declares the member as a field.
    `
  interface Sortable {
    orderBy: (field: string) => void;
  }
  class BaseQuery implements Sortable {
    orderBy = (field: string) => {
      return;
    };
  }
  class FakeQuery extends BaseQuery {
    orderBy(field: string) {}
  }
`,
    // A on a class field whose literal nests another literal.
    `
  interface Cfg {
    handlers: { orderBy: (field: string) => void };
  }
  class Service {
    private config: Cfg = {
      handlers: {
        orderBy: (field: string) => {
          return;
        },
      },
    };
  }
`,
    // A declarator with a definite-assignment assertion but no function
    // initializer names no function, so nothing is reported — documented here
    // because the `!` token sits inside the identifier's range and the rename
    // fixer must never see this shape (#1351).
    `
  type Validator = (rules: string) => boolean;
  let validateBy!: Validator;
`,

    // D (#1511): the enclosing function's own return-type annotation. A
    // RECURSIVE factory cannot reach signals A or B — `satisfies` on the return
    // expression leaves TypeScript with nothing to infer from and it errors
    // TS7023 ("implicitly has return type 'any' because it ... is referenced
    // directly or indirectly in one of its return expressions"), so annotating
    // the factory is the only shape that compiles.
    `
  type FakeSnapshot = { ref: { path: string } };
  interface FakeQuery {
    orderBy: () => FakeQuery;
    limit: (count: number) => FakeQuery;
    startAfter: (snapshot: FakeSnapshot) => FakeQuery;
  }
  const buildQuery = (afterPath?: string, limitCount?: number): FakeQuery => {
    return {
      orderBy: () => {
        return buildQuery(afterPath, limitCount);
      },
      limit: (count: number) => {
        return buildQuery(afterPath, count);
      },
      startAfter: (snapshot: FakeSnapshot) => {
        return buildQuery(snapshot.ref.path, limitCount);
      },
    };
  };
`,
    // D via a concise arrow body: the returned literal is the arrow's body
    // rather than a return argument.
    `
  interface FakeQuery {
    orderBy: () => FakeQuery;
  }
  const buildQuery = (): FakeQuery => ({
    orderBy: () => {
      return buildQuery();
    },
  });
`,
    // D on a function declaration, whose return type is annotated the same way.
    `
  interface FakeQuery {
    orderBy: () => FakeQuery;
  }
  function buildQuery(): FakeQuery {
    return {
      orderBy: () => {
        return buildQuery();
      },
    };
  }
`,
    // D on a method's return type: a contract declared on the member signature
    // pins the returned literal's names just as a free function's does.
    `
  interface FakeQuery {
    orderBy: () => FakeQuery;
  }
  class Fixture {
    public buildQuery(): FakeQuery {
      return {
        orderBy: () => {
          return this.buildQuery();
        },
      };
    }
  }
`,
    // D reaching a nested literal: the return annotation checks the whole shape.
    `
  interface Cfg {
    handlers: { orderBy: (field: string) => void };
  }
  const buildCfg = (): Cfg => {
    return {
      handlers: {
        orderBy: (field: string) => {
          return;
        },
      },
    };
  };
`,
    // B on a return statement is ALREADY a signal — the walk hits the
    // `satisfies` clause before it ever asks about the enclosing function. Pinned
    // so the D work cannot regress it.
    `
  interface FakeQuery {
    orderBy: () => void;
  }
  const buildQuery = () => {
    return {
      orderBy: () => {
        return;
      },
    } satisfies FakeQuery;
  };
`,

    // Assertion-wrapped literals (#1597). `as const`, `as T`, `satisfies` and
    // `!` never change the runtime value, so the conformance signal that sits
    // OUTSIDE the wrapper still pins the member names underneath it. The
    // `as const` form is not hypothetical: `enforce-object-literal-as-const`
    // ships in the same recommended config and appends it by `--fix`.

    // D through `as const` on a returned literal.
    `
  interface FakeQuery {
    orderBy: () => FakeQuery;
  }
  function buildQuery(): FakeQuery {
    return {
      orderBy: () => {
        return buildQuery();
      },
    } as const;
  }
`,
    // D through `as const` on an arrow builder's returned literal.
    `
  interface FakeQuery {
    orderBy: () => FakeQuery;
  }
  const buildQuery = (): FakeQuery => {
    return {
      orderBy: () => {
        return buildQuery();
      },
    } as const;
  };
`,
    // D through `as const` on a class method's returned literal.
    `
  interface FakeQuery {
    orderBy: () => FakeQuery;
  }
  class Fixture {
    public buildQuery(): FakeQuery {
      return {
        orderBy: () => {
          return this.buildQuery();
        },
      } as const;
    }
  }
`,
    // D through `as const` reaching a NESTED literal.
    `
  interface Cfg {
    handlers: { orderBy: (field: string) => void };
  }
  const buildCfg = (): Cfg => {
    return {
      handlers: {
        orderBy: (field: string) => {
          return;
        },
      },
    } as const;
  };
`,
    // D through `as const` on a concise arrow body.
    `
  interface FakeQuery {
    orderBy: () => FakeQuery;
  }
  const buildQuery = (): FakeQuery => ({
    orderBy: () => {
      return buildQuery();
    },
  } as const);
`,
    // A through `as const` on an annotated variable.
    `
  interface QueryLike {
    orderBy: (field: string) => void;
  }
  const chain: QueryLike = {
    orderBy: (field) => {
      return;
    },
  } as const;
`,
    // A through `as const` on an annotated class field.
    `
  interface QueryLike {
    orderBy: (field: string) => void;
  }
  class Service {
    private handlers: QueryLike = {
      orderBy: (field) => {
        return;
      },
    } as const;
  }
`,
    // A through `as const` on an array element inside an annotated array.
    `
  interface Handler {
    filterUsersBy: (role: string) => void;
  }
  const handlers: Handler[] = [
    {
      filterUsersBy: (role) => {
        return;
      },
    } as const,
  ];
`,
    // A through `as const` wrapping the annotated array itself.
    `
  interface Handler {
    filterUsersBy: (role: string) => void;
  }
  const handlers: Handler[] = [
    {
      filterUsersBy: (role) => {
        return;
      },
    },
  ] as const;
`,
    // B where `as const` sits between the literal and its `satisfies` clause —
    // the idiomatic `as const satisfies T` pairing.
    `
  interface QueryLike {
    orderBy: (field: string) => void;
  }
  const query = {
    orderBy: (field: string) => {
      return;
    },
  } as const satisfies QueryLike;
`,
    // A through a non-null assertion.
    `
  interface QueryLike {
    orderBy: (field: string) => void;
  }
  const chain: QueryLike = {
    orderBy: (field) => {
      return;
    },
  }!;
`,
    // D through an angle-bracket type assertion.
    `
  interface FakeQuery {
    orderBy: () => FakeQuery;
  }
  function buildQuery(): FakeQuery {
    return <FakeQuery>{
      orderBy: () => {
        return buildQuery();
      },
    };
  }
`,
    // A through stacked assertions: unwrapping must survive more than one layer.
    `
  interface QueryLike {
    orderBy: (field: string) => void;
  }
  const chain: QueryLike = {
    orderBy: (field) => {
      return;
    },
  } as const as QueryLike;
`,

    // === #2156: a class field holding a function declares the same callable
    // member a method does, so both spellings answer to the same check. These
    // cases fence the field arm so it stays as narrow as the method arm.
    // Contracts here are spelled `type` rather than `interface` for the reason
    // given at the top of this array. ===

    // A field arrow whose name carries no verb-preposition suffix.
    `
  class TournamentService {
    createMatch = (player: string) => {
      return player;
    };
  }
`,
    // The same for a field holding a function expression.
    `
  class DataService {
    computeValue = function (data: string) {
      return data;
    };
  }
`,
    // A data field is not a function member, so its name is outside this
    // rule's subject however it ends.
    'class Cache { cachedFor = new Map<string, number>(); }',
    'class Labels { readonly labelFor = "unknown"; }',
    // A function-TYPED field holding no function declares nothing callable
    // here: the value gate reads the initializer, not the annotation.
    'class Registry { handlerFor: ((id: string) => void) | null = null; }',
    // A field initialized from a call is a value this rule cannot read as a
    // function declaration, so it stays inert — the deliberate false negative
    // the value gate buys (CLAUDE.md ranks a false positive above one).
    `
  declare function debounce(callback: () => void): () => void;
  class Saver {
    saveChangesFor = debounce(() => {
      return;
    });
  }
`,
    // An ambient member declares a type, not code: its initializer is not even
    // valid TypeScript (TS1039), so nothing in it is the author's shipped
    // implementation.
    'class Ambient { declare initializeGameFor: (player: string) => void; }',
    'class Ambient { declare initializeGameFor = (player: string) => {}; }',
    // A computed key's identifier is a VARIABLE READ, not the member's name —
    // renaming it would rewrite an unrelated binding.
    `
  const initializeGameFor = "run";
  class Dynamic {
    [initializeGameFor] = (player: string) => {
      return player;
    };
  }
`,
    'class Dynamic { ["initializeGameFor"] = (player: string) => {}; }',
    // A `#`-named field is unreachable from outside the class, exactly as a
    // `#`-named method is, and the method arm is silent on both.
    'class Private { #initializeGameFor = (player: string) => {}; }',
    // Phrasal-verb endings fuse with their verb in a field name too.
    'class Session { signIn = () => {}; }',
    'class Session { logOut = () => {}; }',
    // A single-word field name has no verb+suffix pattern to strip.
    'class Client { fetch = (url: string) => url; }',
    // A static field is judged by the same name rules as a static method.
    'class MathUtils { static computeValue = (data: string) => data; }',
    // A field whose name a contract the class implements declares is named by
    // that contract, so renaming it would break conformance (#1350).
    `
  type Sortable = {
    orderBy: (field: string) => void;
  };
  class BaseQuery implements Sortable {
    orderBy = (field: string) => {
      return;
    };
  }
`,
    // The same through a base class rather than an implemented contract.
    `
  type Sortable = {
    orderBy: (field: string) => void;
  };
  class BaseQuery implements Sortable {
    orderBy = (field: string) => {
      return;
    };
  }
  class ChildQuery extends BaseQuery {
    orderBy = (field: string) => {
      return;
    };
  }
`,
    // A contract that cannot be followed syntactically hides its member list,
    // so the field keeps its exemption.
    `
  class NamespacedQuery implements firestore.Sortable {
    orderBy = (field: string) => {
      return;
    };
  }
`,
    // An abstract member carries no value and has its own node type, which
    // neither arm registers — the field spelling matches the method spelling
    // in staying silent here.
    'abstract class Service { abstract initializeGameFor(player: string): void; }',
    'abstract class Service { abstract initializeGameFor: (player: string) => void; }',
  ],
  invalid: [
    // Controls (#1227): a NOUN object before the particle is a genuine
    // redundant verb-preposition suffix — the phrasal-verb exemption must NOT
    // swallow these. The pre-particle word ("widget", "embed", "items",
    // "admin") is not a known phrasal-verb stem, so they still fire.
    {
      code: 'function isWidgetIn(container) {}',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: { name: 'isWidgetIn', suffix: 'In', suggestion: 'isWidget' },
        },
      ],
      output: 'function isWidget(container) {}',
    },
    {
      code: 'function loadEmbedIn(target) {}',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: { name: 'loadEmbedIn', suffix: 'In', suggestion: 'loadEmbed' },
        },
      ],
      output: 'function loadEmbed(target) {}',
    },
    {
      code: 'function canRenderItemsIn(container) {}',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: 'canRenderItemsIn',
            suffix: 'In',
            suggestion: 'canRenderItems',
          },
        },
      ],
      output: 'function canRenderItems(container) {}',
    },
    {
      code: 'function isUserAdminOn(platform) {}',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: 'isUserAdminOn',
            suffix: 'On',
            suggestion: 'isUserAdmin',
          },
        },
      ],
      output: 'function isUserAdmin(platform) {}',
    },
    // Function declarations with basic prepositions
    {
      code: 'function createMatchFor(player) {}',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: 'createMatchFor',
            suffix: 'For',
            suggestion: 'createMatch',
          },
        },
      ],
      output: 'function createMatch(player) {}',
    },
    {
      code: 'function computeValueFrom(data) {}',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: 'computeValueFrom',
            suffix: 'From',
            suggestion: 'computeValue',
          },
        },
      ],
      output: 'function computeValue(data) {}',
    },
    {
      code: 'function updateConfigWith(options) {}',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: 'updateConfigWith',
            suffix: 'With',
            suggestion: 'updateConfig',
          },
        },
      ],
      output: 'function updateConfig(options) {}',
    },
    {
      code: 'function convertDataTo(format) {}',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: 'convertDataTo',
            suffix: 'To',
            suggestion: 'convertData',
          },
        },
      ],
      output: 'function convertData(format) {}',
    },
    {
      code: 'function validateInputBy(rules) {}',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: 'validateInputBy',
            suffix: 'By',
            suggestion: 'validateInput',
          },
        },
      ],
      output: 'function validateInput(rules) {}',
    },
    {
      code: 'function searchItemsIn(container) {}',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: 'searchItemsIn',
            suffix: 'In',
            suggestion: 'searchItems',
          },
        },
      ],
      output: 'function searchItems(container) {}',
    },
    {
      code: 'function processEventOn(element) {}',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: 'processEventOn',
            suffix: 'On',
            suggestion: 'processEvent',
          },
        },
      ],
      output: 'function processEvent(element) {}',
    },

    // Function declarations with temporal prepositions
    {
      code: 'function processDuring(interval) {}',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: 'processDuring',
            suffix: 'During',
            suggestion: 'process',
          },
        },
      ],
      output: 'function process(interval) {}',
    },

    // Function declarations with logical/causal prepositions
    {
      code: 'function executeVia(method) {}',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: 'executeVia',
            suffix: 'Via',
            suggestion: 'execute',
          },
        },
      ],
      output: 'function execute(method) {}',
    },
    {
      code: 'function processWithout(options) {}',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: 'processWithout',
            suffix: 'Without',
            suggestion: 'process',
          },
        },
      ],
      output: 'function process(options) {}',
    },

    // Function declarations with phrasal prepositions
    {
      code: 'function fightAgainst(enemy) {}',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: 'fightAgainst',
            suffix: 'Against',
            suggestion: 'fight',
          },
        },
      ],
      output: 'function fight(enemy) {}',
    },

    // Function declarations with adverbs
    {
      code: 'function retryAgain(attempt) {}',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: 'retryAgain',
            suffix: 'Again',
            suggestion: 'retry',
          },
        },
      ],
      output: 'function retry(attempt) {}',
    },
    {
      code: 'function attemptAgain(data) {}',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: 'attemptAgain',
            suffix: 'Again',
            suggestion: 'attempt',
          },
        },
      ],
      output: 'function attempt(data) {}',
    },
    {
      code: 'function startNow(task) {}',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: 'startNow',
            suffix: 'Now',
            suggestion: 'start',
          },
        },
      ],
      output: 'function start(task) {}',
    },

    // Class methods: violation is reported, but the fix is SUPPRESSED —
    // methods are called via member expressions (this.x()/instance.x()) the
    // scope manager cannot resolve, so renaming the key would orphan call
    // sites (#1256). output === code proves no unsafe fix is applied.
    {
      code: `class TournamentService {
        initializeGameFor(player) {}
      }`,
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: 'initializeGameFor',
            suffix: 'For',
            suggestion: 'initializeGame',
          },
        },
      ],
      output: `class TournamentService {
        initializeGameFor(player) {}
      }`,
    },
    {
      code: `class TournamentService {
        calculateScoreFrom(results) {}
      }`,
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: 'calculateScoreFrom',
            suffix: 'From',
            suggestion: 'calculateScore',
          },
        },
      ],
      output: `class TournamentService {
        calculateScoreFrom(results) {}
      }`,
    },
    {
      code: `class DataService {
        updateStateWith(data) {}
        transformDataTo(format) {}
        filterUsersBy(criteria) {}
      }`,
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: 'updateStateWith',
            suffix: 'With',
            suggestion: 'updateState',
          },
        },
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: 'transformDataTo',
            suffix: 'To',
            suggestion: 'transformData',
          },
        },
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: 'filterUsersBy',
            suffix: 'By',
            suggestion: 'filterUsers',
          },
        },
      ],
      output: `class DataService {
        updateStateWith(data) {}
        transformDataTo(format) {}
        filterUsersBy(criteria) {}
      }`,
    },

    // Arrow functions
    {
      code: 'const transformDataWith = (options) => {};',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: 'transformDataWith',
            suffix: 'With',
            suggestion: 'transformData',
          },
        },
      ],
      output: 'const transformData = (options) => {};',
    },
    {
      code: 'const prepareStateFor = (component) => {};',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: 'prepareStateFor',
            suffix: 'For',
            suggestion: 'prepareState',
          },
        },
      ],
      output: 'const prepareState = (component) => {};',
    },
    {
      code: 'const validateBy = (rules) => {};',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: 'validateBy',
            suffix: 'By',
            suggestion: 'validate',
          },
        },
      ],
      output: 'const validate = (rules) => {};',
    },
    {
      code: 'const searchIn = (scope) => {};',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: 'searchIn',
            suffix: 'In',
            suggestion: 'search',
          },
        },
      ],
      output: 'const search = (scope) => {};',
    },

    // Object methods: reported but fix SUPPRESSED — accessed via member
    // expressions (api.method()) the scope manager does not track. output === code.
    {
      code: `const api = {
        getUserFrom(source) {},
        createUserWith(data) {},
        updateUserTo(id, data) {},
        deleteUserBy(id) {}
      };`,
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: 'getUserFrom',
            suffix: 'From',
            suggestion: 'getUser',
          },
        },
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: 'createUserWith',
            suffix: 'With',
            suggestion: 'createUser',
          },
        },
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: 'updateUserTo',
            suffix: 'To',
            suggestion: 'updateUser',
          },
        },
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: 'deleteUserBy',
            suffix: 'By',
            suggestion: 'deleteUser',
          },
        },
      ],
      output: `const api = {
        getUserFrom(source) {},
        createUserWith(data) {},
        updateUserTo(id, data) {},
        deleteUserBy(id) {}
      };`,
    },

    // Edge cases with non-standard naming
    {
      code: 'function _privateProcessWith() {}',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: '_privateProcessWith',
            suffix: 'With',
            suggestion: '_privateProcess',
          },
        },
      ],
      output: 'function _privateProcess() {}',
    },
    {
      code: 'function $specialHandleFor() {}',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: '$specialHandleFor',
            suffix: 'For',
            suggestion: '$specialHandle',
          },
        },
      ],
      output: 'function $specialHandle() {}',
    },

    // Controls for the phrasal-verb exemption (issue #1227): genuine
    // verb-preposition suffixes whose token before the particle is a NOUN
    // object (not a participle or phrasal stem) MUST still be flagged.
    {
      code: 'function loadFeedIn(scope) {}',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: 'loadFeedIn',
            suffix: 'In',
            suggestion: 'loadFeed',
          },
        },
      ],
      output: 'function loadFeed(scope) {}',
    },
    {
      code: 'function renderItemsIn(container) {}',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: 'renderItemsIn',
            suffix: 'In',
            suggestion: 'renderItems',
          },
        },
      ],
      output: 'function renderItems(container) {}',
    },
    // Non-predicate prefix with a noun-before-particle: the boolean-predicate
    // exemption must NOT trigger, so this still fires.
    {
      code: 'function fetchModalOn(element) {}',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: 'fetchModalOn',
            suffix: 'On',
            suggestion: 'fetchModal',
          },
        },
      ],
      output: 'function fetchModal(element) {}',
    },
    // Past-participle exemption must remain particle-scoped: a participle before
    // a NON-particle preposition ("From") is still a redundant suffix.
    {
      code: 'function loadCachedFrom(source) {}',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: 'loadCachedFrom',
            suffix: 'From',
            suggestion: 'loadCached',
          },
        },
      ],
      output: 'function loadCached(source) {}',
    },
    // "is"-prefixed name whose suffix is NOT a phrasal particle: the
    // boolean-predicate exemption is particle-scoped, so "From" still fires.
    {
      code: 'function isolateDataFrom(source) {}',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: 'isolateDataFrom',
            suffix: 'From',
            suggestion: 'isolateData',
          },
        },
      ],
      output: 'function isolateData(source) {}',
    },

    // Multiple unnecessary suffixes
    {
      code: 'function extractConfigFromWithToViaBy() {}',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: 'extractConfigFromWithToViaBy',
            suffix: 'By',
            suggestion: 'extractConfigFromWithToVia',
          },
        },
      ],
      output: 'function extractConfigFromWithToVia() {}',
    },

    // FunctionDeclaration branch: fixer must rename the call site too.
    {
      code: [
        'function elementAt(arr: number[], index: number) {',
        '  return arr[index];',
        '}',
        'const first = elementAt([10, 20, 30], 0);',
      ].join('\n'),
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
      output: [
        'function element(arr: number[], index: number) {',
        '  return arr[index];',
        '}',
        'const first = element([10, 20, 30], 0);',
      ].join('\n'),
    },
    // VariableDeclarator (arrow) branch: same requirement.
    {
      code: [
        'const hoursBetween = (start: Date, end: Date) => {',
        '  return (end.getTime() - start.getTime()) / 3_600_000;',
        '};',
        'const elapsed = hoursBetween(new Date(0), new Date());',
      ].join('\n'),
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
      output: [
        'const hours = (start: Date, end: Date) => {',
        '  return (end.getTime() - start.getTime()) / 3_600_000;',
        '};',
        'const elapsed = hours(new Date(0), new Date());',
      ].join('\n'),
    },

    // Multiple call sites: all references must be renamed.
    {
      code: [
        'function elementAt(arr: number[], index: number) {',
        '  return arr[index];',
        '}',
        'const a = elementAt([1, 2, 3], 0);',
        'const b = elementAt([4, 5, 6], 1);',
        'const c = elementAt([7, 8, 9], 2);',
      ].join('\n'),
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
      output: [
        'function element(arr: number[], index: number) {',
        '  return arr[index];',
        '}',
        'const a = element([1, 2, 3], 0);',
        'const b = element([4, 5, 6], 1);',
        'const c = element([7, 8, 9], 2);',
      ].join('\n'),
    },

    // Object Property arrow WITH a member-expression call site: the fix must be
    // SUPPRESSED entirely. Renaming only the key to `computeValue` while leaving
    // `utils.computeValueFrom(...)` would orphan the call site (a runtime
    // ReferenceError / TS error). Since the scope manager cannot resolve the
    // member reference, no fix is offered — output === code.
    {
      code: [
        'const utils = {',
        '  computeValueFrom: (data: number[]) => data.reduce((a, b) => a + b, 0),',
        '};',
        'const result = utils.computeValueFrom([1, 2, 3]);',
      ].join('\n'),
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
      output: [
        'const utils = {',
        '  computeValueFrom: (data: number[]) => data.reduce((a, b) => a + b, 0),',
        '};',
        'const result = utils.computeValueFrom([1, 2, 3]);',
      ].join('\n'),
    },

    // Exported FunctionDeclaration: fix must be suppressed (output === code).
    {
      code: [
        'export function elementAt(arr: number[], index: number) {',
        '  return arr[index];',
        '}',
        'const first = elementAt([10, 20, 30], 0);',
      ].join('\n'),
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
      // Fix suppressed for exported symbol — output unchanged.
      output: [
        'export function elementAt(arr: number[], index: number) {',
        '  return arr[index];',
        '}',
        'const first = elementAt([10, 20, 30], 0);',
      ].join('\n'),
    },

    // Exported arrow const: fix must be suppressed.
    {
      code: [
        'export const hoursBetween = (start: Date, end: Date) => {',
        '  return (end.getTime() - start.getTime()) / 3_600_000;',
        '};',
        'const elapsed = hoursBetween(new Date(0), new Date());',
      ].join('\n'),
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
      // Fix suppressed for exported symbol — output unchanged.
      output: [
        'export const hoursBetween = (start: Date, end: Date) => {',
        '  return (end.getTime() - start.getTime()) / 3_600_000;',
        '};',
        'const elapsed = hoursBetween(new Date(0), new Date());',
      ].join('\n'),
    },

    // String literal with same text as function name must NOT be renamed.
    {
      code: [
        'function elementAt(arr: number[], index: number) {',
        '  return arr[index];',
        '}',
        "const name = 'elementAt';",
        'const first = elementAt([10, 20, 30], 0);',
      ].join('\n'),
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
      output: [
        'function element(arr: number[], index: number) {',
        '  return arr[index];',
        '}',
        // String literal unchanged — only true references renamed.
        "const name = 'elementAt';",
        'const first = element([10, 20, 30], 0);',
      ].join('\n'),
    },

    // Shadowing: inner scope redefines the name — each declaration is reported
    // separately and its own references are renamed. The outer declaration's
    // references (outer call site) are renamed; the inner shadow's reference
    // (inner call site) is renamed independently.
    {
      code: [
        'function elementAt(arr: number[], index: number) {',
        '  return arr[index];',
        '}',
        'const outer = elementAt([1, 2, 3], 0);',
        'function wrapper() {',
        '  function elementAt(x: number) { return x; }',
        '  return elementAt(42);',
        '}',
      ].join('\n'),
      errors: [
        { messageId: 'unnecessaryVerbSuffix' },
        { messageId: 'unnecessaryVerbSuffix' },
      ],
      // After applying both fixes: outer declaration + outer call site renamed,
      // inner shadow declaration + inner call site renamed.
      output: [
        'function element(arr: number[], index: number) {',
        '  return arr[index];',
        '}',
        'const outer = element([1, 2, 3], 0);',
        'function wrapper() {',
        '  function element(x: number) { return x; }',
        '  return element(42);',
        '}',
      ].join('\n'),
    },

    // MethodDefinition WITH a this.method() call site: the fix must be
    // SUPPRESSED. Renaming only the method to `computeValue` while leaving
    // `this.computeValueFrom(...)` is the exact ReferenceError bug from #1256.
    // `this.x` is a member expression the scope manager does not track, so no
    // fix is offered — output === code (violation still reported).
    {
      code: [
        'class Calculator {',
        '  computeValueFrom(data: number[]) {',
        '    return data.reduce((a, b) => a + b, 0);',
        '  }',
        '  run() {',
        '    return this.computeValueFrom([1, 2, 3]);',
        '  }',
        '}',
      ].join('\n'),
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
      output: [
        'class Calculator {',
        '  computeValueFrom(data: number[]) {',
        '    return data.reduce((a, b) => a + b, 0);',
        '  }',
        '  run() {',
        '    return this.computeValueFrom([1, 2, 3]);',
        '  }',
        '}',
      ].join('\n'),
    },

    // Interface method signature (TSMethodSignature): reported but fix
    // SUPPRESSED. The implementation and every call site live on implementers
    // (member accesses) that a single-file syntactic fixer cannot reach, so no
    // rename is offered — output === code.
    {
      code: [
        'interface Repository {',
        '  fetchRecordFrom(source: string): unknown;',
        '}',
      ].join('\n'),
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
      output: [
        'interface Repository {',
        '  fetchRecordFrom(source: string): unknown;',
        '}',
      ].join('\n'),
    },

    // Class method with an EXTERNAL call site (instance.method()) — also a
    // member expression, also suppressed. Guards against a future change that
    // renames only same-name identifiers regardless of member context.
    {
      code: [
        'class Store {',
        '  loadItemsFrom(key: string) {',
        '    return key;',
        '  }',
        '}',
        'const store = new Store();',
        "const items = store.loadItemsFrom('cache');",
      ].join('\n'),
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
      output: [
        'class Store {',
        '  loadItemsFrom(key: string) {',
        '    return key;',
        '  }',
        '}',
        'const store = new Store();',
        "const items = store.loadItemsFrom('cache');",
      ].join('\n'),
    },

    // Collision bail-out (#1278): the suggested name `line` is already bound at
    // a call site AND inside the function body. The rule may still REPORT, but
    // must NOT autofix — rewriting to `const line = line(lines, i)` produces a
    // TDZ self-reference (TS2448/TS7022) that fails compilation. `output: null`
    // asserts the fixer bails.
    {
      code: `
export function parseBlocks(source: string) {
  const lines = source.split('\\n');
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lineAt(lines, i);
    out.push(line.trim());
  }
  return out;
}

function lineAt(lines: string[], index: number) {
  const line = lines[Number(index)];
  if (line === undefined) {
    throw new Error('out of range');
  }
  return line;
}
`,
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
      output: null,
    },

    // Collision ONLY at the declaration site (no call sites): a `const line`
    // sibling in the declaration scope would clash with the renamed function.
    // Report-only.
    {
      code: [
        'function lineAt(arr: number[], index: number) {',
        '  return arr[Number(index)];',
        '}',
        "const line = 'reserved';",
      ].join('\n'),
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
      output: null,
    },

    // Collision ONLY at a call site's enclosing scope (declaration scope is
    // clean): renaming would capture `lineAt(...)` onto the caller's local
    // `line`. Report-only.
    {
      code: [
        'function lineAt(arr: number[], index: number) {',
        '  return arr[Number(index)];',
        '}',
        'function consumer() {',
        "  const line = 'reserved';",
        '  return lineAt([1, 2, 3], 0);',
        '}',
      ].join('\n'),
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
      output: null,
    },

    // No collision anywhere: the strip-suffix rename still autofixes the
    // declaration and every call site (guards against the collision check
    // over-suppressing safe fixes).
    {
      code: [
        'function lineAt(arr: number[], index: number) {',
        '  return arr[Number(index)];',
        '}',
        'const first = lineAt([1, 2, 3], 0);',
      ].join('\n'),
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
      output: [
        'function line(arr: number[], index: number) {',
        '  return arr[Number(index)];',
        '}',
        'const first = line([1, 2, 3], 0);',
      ].join('\n'),
    },

    // Conformance-signal fence (#1350): an object literal with NO declared
    // target type carries author-chosen names, so the exemption must not reach
    // it.
    {
      code: `
    const helpers = {
      fetchTournamentsBy: (key: string) => {
        return key;
      },
    };
  `,
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
    },
    {
      code: `
    const helpers = {
      computeValueFrom: (data: string) => {
        return data;
      },
    };
  `,
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
    },
    // An unannotated hand-built double stays reported: the principled escape is
    // to annotate the double against the contract it imitates, not to suppress.
    {
      code: `
    const chain = {
      orderBy: (field: string, direction: string) => {
        return chain;
      },
    };
  `,
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
    },
    // `any` disables excess-property checking, so the annotation proves nothing
    // about the member name.
    {
      code: `
    const helpers: any = {
      fetchTournamentsBy: (key: string) => {
        return key;
      },
    };
  `,
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
    },
    {
      code: `
    const helpers: unknown = {
      fetchTournamentsBy: (key: string) => {
        return key;
      },
    };
  `,
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
    },
    // A variable's own name is never dictated by its annotation, so an
    // annotated arrow const stays reported. Exported here so the rename fix is
    // suppressed and the assertion isolates the report.
    {
      code: `
    type Validator = (rules: string) => void;
    export const validateBy: Validator = (rules: string) => {
      return;
    };
  `,
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
      output: null,
    },
    // The signal covers the annotated literal only — a sibling declaration
    // keeps its own author-chosen name.
    {
      code: `
    interface QueryLike {
      orderBy: (field: string) => void;
    }
    const chain: QueryLike = {
      orderBy: (field: string) => {
        return;
      },
    };
    function fetchDataFrom(source: string) {
      return source;
    }
  `,
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
      output: `
    interface QueryLike {
      orderBy: (field: string) => void;
    }
    const chain: QueryLike = {
      orderBy: (field: string) => {
        return;
      },
    };
    function fetchData(source: string) {
      return source;
    }
  `,
    },
    // Heritage resolves in file and does NOT declare the member: classes may
    // add members beyond their contract, and those names are the author's.
    {
      code: `
    interface QueryLike {
      limit: (count: number) => void;
    }
    class FakeQuery implements QueryLike {
      limit(count: number) {}
      filterUsersBy(role: string) {}
    }
  `,
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
    },
    // Same for a resolvable superclass that does not declare the member.
    {
      code: `
    class BaseQuery {
      limit(count: number) {}
    }
    class FakeQuery extends BaseQuery {
      filterUsersBy(role: string) {}
    }
  `,
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
    },
    // A class with no heritage at all has no conformance signal.
    {
      code: `
    class FakeQuery {
      orderBy(field: string) {}
    }
  `,
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
    },
    // `satisfies any` checks nothing, so it is no signal.
    {
      code: `
    const helpers = {
      fetchTournamentsBy: (key: string) => {
        return key;
      },
    } satisfies any;
  `,
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
    },
    // A literal passed straight to a call has no declared target type in the
    // syntax, so the walk must not exempt it.
    {
      code: `
    register({
      fetchTournamentsBy: (key: string) => {
        return key;
      },
    });
  `,
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
    },
    // A class field annotated `any` gives its literal no excess-property check.
    {
      code: `
    class Service {
      private handlers: any = {
        fetchTournamentsBy: (key: string) => {
          return key;
        },
      };
    }
  `,
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
    },
    // Several resolvable contracts, none declaring the member.
    {
      code: `
    interface Limitable {
      limit: (count: number) => void;
    }
    interface Pageable {
      page: (index: number) => void;
    }
    class FakeQuery implements Limitable, Pageable {
      limit(count: number) {}
      page(index: number) {}
      filterUsersBy(role: string) {}
    }
  `,
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
    },
    // Contracts sharing a base: revisiting the base adds nothing, and none of
    // the three declares the member.
    {
      code: `
    interface Base {
      limit: (count: number) => void;
    }
    interface Sortable extends Base {
      sort: (field: string) => void;
    }
    interface Pageable extends Base {
      page: (index: number) => void;
    }
    class FakeQuery implements Sortable, Pageable {
      filterUsersBy(role: string) {}
    }
  `,
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
    },
    // The contract's own declaration is still the author's naming choice: only
    // the implementation conforming to it is exempt, so the method signature in
    // the interface stays reported while the class member does not.
    {
      code: `
    interface QueryLike {
      orderBy(field: string): void;
    }
    class FakeQuery implements QueryLike {
      orderBy(field: string) {}
    }
  `,
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
    },
    // === #1679: `prefer-type-over-interface` ships in the same recommended
    // config and rewrites `interface S extends Base { … }` to
    // `type S = Base & { … }` by `--fix`. An intersection contract must read
    // exactly as the interface it replaces, or that sibling fix retires the
    // member check for every contract declared with a heritage clause. ===
    // The pre-fix interface shape, paired with its rewrite below: the contract
    // declares the member, so its own signature is reported and the class
    // member conforming to it is not.
    {
      code: `
    import type { Base } from './Base';
    interface S extends Base {
      filterUsersBy(role: string): void;
    }
    class Q implements S {
      filterUsersBy(role: string) {}
    }
  `,
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
    },
    // The same contract as an intersection alias reports the same one member.
    {
      code: `
    import type { Base } from './Base';
    type S = Base & {
      filterUsersBy(role: string): void;
    };
    class Q implements S {
      filterUsersBy(role: string) {}
    }
  `,
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
    },
    // The rewrite of a contract that declares neither the member nor anything
    // unreadable: every constituent resolves in file, so the class member is
    // the author's own and stays reported.
    {
      code: `
    type Base = {
      limit: (count: number) => void;
    };
    type QueryLike = Base & {
      count: number;
    };
    class FakeQuery implements QueryLike {
      count = 0;
      filterUsersBy(role: string) {}
    }
  `,
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
    },
    // Two type-literal constituents, neither declaring the member.
    {
      code: `
    type QueryLike = {
      limit: (count: number) => void;
    } & {
      page: (index: number) => void;
    };
    class FakeQuery implements QueryLike {
      filterUsersBy(role: string) {}
    }
  `,
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
    },
    // An intersection whose reference constituent is an in-file interface that
    // does not declare the member.
    {
      code: `
    interface Sortable {
      sort: (field: string) => void;
    }
    type QueryLike = Sortable & {
      limit: (count: number) => void;
    };
    class FakeQuery implements QueryLike {
      filterUsersBy(role: string) {}
    }
  `,
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
    },
    // A chain of intersection aliases, all readable, none declaring the member.
    {
      code: `
    type Sortable = { sort: (field: string) => void };
    type Inner = Sortable & { limit: (count: number) => void };
    type QueryLike = Inner & { page: (index: number) => void };
    class FakeQuery implements QueryLike {
      filterUsersBy(role: string) {}
    }
  `,
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
    },
    // The intersection reached through a superclass rather than an `implements`
    // clause.
    {
      code: `
    type Sortable = { sort: (field: string) => void };
    type QueryLike = Sortable & { limit: (count: number) => void };
    class BaseQuery implements QueryLike {
      sort(field: string) {}
      limit(count: number) {}
    }
    class FakeQuery extends BaseQuery {
      filterUsersBy(role: string) {}
    }
  `,
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
    },
    // A resolvable in-file interface declares the member only in the nested
    // literal's position; the outer object's own extra member stays reported.
    {
      code: `
    interface Cfg {
      handlers: { orderBy: (field: string) => void };
    }
    const cfg: Cfg = {
      handlers: {
        orderBy: (field: string) => {
          return;
        },
      },
    };
    const extras = {
      sortUsersBy: (role: string) => {
        return role;
      },
    };
  `,
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
    },
    // === #1351: an Identifier's range spans its type annotation, definite
    // assignment assertion and optional marker, so the rename must rewrite the
    // NAME only. A whole-node replace deletes the annotation, which strips the
    // contextual type off the initializer's parameters (implicit `any`) while
    // leaving the rule with nothing left to report — a silent corruption. ===
    {
      code: `
type Validator = (rules: string) => boolean;
const validateBy: Validator = (rules) => true;
console.log(validateBy('x'));
  `,
      output: `
type Validator = (rules: string) => boolean;
const validate: Validator = (rules) => true;
console.log(validate('x'));
  `,
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
    },
    // The annotated declarator holds a function expression rather than an arrow.
    {
      code: `
type Compute = () => void;
const computeFrom: Compute = function () {};
computeFrom();
  `,
      output: `
type Compute = () => void;
const compute: Compute = function () {};
compute();
  `,
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
    },
    // A generic annotation: the type arguments sit inside the identifier's range
    // and must survive intact.
    {
      code: `
type Mapper<I, O> = (input: I) => O;
const mapFrom: Mapper<string, number> = (input) => input.length;
const size = mapFrom('abc');
  `,
      output: `
type Mapper<I, O> = (input: I) => O;
const map: Mapper<string, number> = (input) => input.length;
const size = map('abc');
  `,
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
    },
    // An inline curried function type: the nested `=>` arrows are part of the
    // annotation, not of the initializer.
    {
      code: `
const pickBy: (a: string) => (b: number) => void = (a) => (b) => {};
pickBy('a')(1);
  `,
      output: `
const pick: (a: string) => (b: number) => void = (a) => (b) => {};
pick('a')(1);
  `,
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
    },
    // A generic annotation whose type argument itself nests `<>` and `=>`.
    {
      code: `
type Factory<T> = () => T;
const buildFrom: Factory<Map<string, () => void>> = () => new Map();
buildFrom();
  `,
      output: `
type Factory<T> = () => T;
const build: Factory<Map<string, () => void>> = () => new Map();
build();
  `,
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
    },
    // A definite-assignment assertion also lives inside the identifier's range.
    // TypeScript rejects `!` alongside an initializer semantically, but the
    // parser accepts it, and it is the only shape that pins the `!` token for a
    // declarator this rule reports (a bare `let validateBy!: Validator;` has no
    // function initializer, so it is not reported at all — see the valid cases).
    {
      code: `
type Validator = (rules: string) => boolean;
let checkBy!: Validator = (rules) => true;
checkBy('x');
  `,
      output: `
type Validator = (rules: string) => boolean;
let check!: Validator = (rules) => true;
check('x');
  `,
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
    },
    // A comment between the name and its annotation proves the replaced range
    // stops at the name token rather than spanning trailing trivia.
    {
      code: `
type Validator = (rules: string) => boolean;
const inspectBy /* keep me */: Validator = (rules) => true;
inspectBy('x');
  `,
      output: `
type Validator = (rules: string) => boolean;
const inspect /* keep me */: Validator = (rules) => true;
inspect('x');
  `,
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
    },
    // A named function expression assigned to an annotated const: the reported
    // name is the inner one, and the outer annotation is untouched.
    {
      code: `
type Compute = () => void;
const holder: Compute = function tallyFrom() {};
holder();
  `,
      output: `
type Compute = () => void;
const holder: Compute = function tally() {};
holder();
  `,
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
    },
    // Several references across nested scopes exercise the reference-rename loop
    // alongside the annotated declaration.
    {
      code: `
type Validator = (rules: string) => boolean;
const screenBy: Validator = (rules) => rules.length > 0;
function outer() {
  return () => screenBy('nested');
}
const direct = screenBy('direct');
const again = screenBy('again');
  `,
      output: `
type Validator = (rules: string) => boolean;
const screen: Validator = (rules) => rules.length > 0;
function outer() {
  return () => screen('nested');
}
const direct = screen('direct');
const again = screen('again');
  `,
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
    },
    // Control: an UNANNOTATED declarator keeps fixing exactly as before.
    {
      code: `
const auditBy = (rules) => true;
auditBy('x');
  `,
      output: `
const audit = (rules) => true;
audit('x');
  `,
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
    },
    // Control: a FunctionDeclaration carries no annotation on its id, so its
    // output is unchanged by the narrowed replacement.
    {
      code: `
function reviewBy(rules: string) {
  return rules.length > 0;
}
reviewBy('x');
  `,
      output: `
function review(rules: string) {
  return rules.length > 0;
}
review('x');
  `,
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
    },
    // Suppression paths are unchanged: an exported annotated symbol offers no
    // fix, so the annotation cannot be damaged there either.
    {
      code: `
type Validator = (rules: string) => boolean;
export const surveyBy: Validator = (rules) => true;
  `,
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
      output: null,
    },
    // Suppression path: object-literal property (member-accessed call sites).
    {
      code: `
const registry = {
  rankUsersBy: (role: string) => role,
};
  `,
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
      output: null,
    },
    // Suppression path: class method (member-accessed call sites).
    {
      code: `
class Roster {
  groupUsersBy(role: string) {
    return role;
  }
}
  `,
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
      output: null,
    },
    // A shorthand reference is both the property key and its value, so a
    // one-token rename would change the object's shape. It expands instead.
    {
      code: `
const validateBy = (rules: string) => true;
const registry = { validateBy };
console.log(registry);
  `,
      output: `
const validate = (rules: string) => true;
const registry = { validateBy: validate };
console.log(registry);
  `,
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
    },
    // The shorthand expansion applies wherever the literal lives, including
    // inside an exported object whose shape other modules read.
    {
      code: `
const computeFrom = (data: string) => data;
export const registry = { computeFrom };
  `,
      output: `
const compute = (data: string) => data;
export const registry = { computeFrom: compute };
  `,
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
    },
    // A nested shorthand is expanded the same way; the outer literal is
    // untouched.
    {
      code: `
const rankUsersBy = (role: string) => role;
const config = { handlers: { rankUsersBy } };
console.log(config);
  `,
      output: `
const rankUsers = (role: string) => role;
const config = { handlers: { rankUsersBy: rankUsers } };
console.log(config);
  `,
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
    },
    // A non-shorthand property value is a plain read, so it renames directly
    // and the key stays as the author wrote it.
    {
      code: `
const validateBy = (rules: string) => true;
const registry = { validator: validateBy };
console.log(registry);
  `,
      output: `
const validate = (rules: string) => true;
const registry = { validator: validate };
console.log(registry);
  `,
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
    },
    // A separate re-export specifier binds the public export name, which a
    // single-file fixer cannot rewrite across importers. The declaration-level
    // export guard misses this form because the declaration carries no
    // `export` keyword.
    {
      code: `
const validateBy = (rules: string) => true;
export { validateBy };
  `,
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
      output: null,
    },
    // A renamed re-export declines too: the fix is withheld rather than
    // reasoning about which half of `local as exported` is safe to touch.
    {
      code: `
const validateBy = (rules: string) => true;
export { validateBy as validateByPublic };
  `,
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
      output: null,
    },
    // A re-export anywhere in the file blocks the whole rename, not just the
    // specifier, so the declaration and its call sites never drift apart.
    {
      code: `
const validateBy = (rules: string) => true;
console.log(validateBy('x'));
export { validateBy };
  `,
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
      output: null,
    },
    // The suggested name already binds inside the function body, so renaming
    // would shadow it and change what the body resolves.
    {
      code: `
function validateBy(rules: string) {
  const validate = rules.length > 0;
  return validate;
}
  `,
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
      output: null,
    },
    // Same collision through a parameter rather than a body binding.
    {
      code: `
function computeFrom(compute: string) {
  return compute;
}
  `,
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
      output: null,
    },

    // === #1511 fence: the return-type signal is pinned to the ANNOTATION, not
    // to "any factory", and it reaches only what the annotated function
    // actually returns. ===

    // The valid recursive factory with its return-type annotation removed: no
    // declared contract, so the member name is the author's again.
    {
      code: `
    type FakeSnapshot = { ref: { path: string } };
    const buildQuery = (afterPath?: string, limitCount?: number) => {
      return {
        orderBy: () => {
          return buildQuery(afterPath, limitCount);
        },
        limit: (count: number) => {
          return buildQuery(afterPath, count);
        },
        startAfter: (snapshot: FakeSnapshot) => {
          return buildQuery(snapshot.ref.path, limitCount);
        },
      };
    };
  `,
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
    },
    // An annotated function whose literal is NOT what it returns: the literal is
    // an argument to a helper call, so the annotation says nothing about it.
    {
      code: `
    interface FakeQuery {
      limit: (count: number) => FakeQuery;
    }
    const buildQuery = (): FakeQuery => {
      register({
        fetchTournamentsBy: (key: string) => {
          return key;
        },
      });
      return { limit: (count: number) => buildQuery() };
    };
  `,
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
    },
    // A nested callback's own returned literal is scoped to the NEAREST
    // enclosing function, which carries no annotation — the outer function's
    // annotation must not reach through it.
    {
      code: `
    interface FakeQuery {
      limit: (count: number) => FakeQuery;
    }
    const buildQuery = (): FakeQuery => {
      register(() => {
        return {
          fetchTournamentsBy: (key: string) => {
            return key;
          },
        };
      });
      return { limit: (count: number) => buildQuery() };
    };
  `,
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
    },
    // A return type of `any` imposes no excess-property check, so it proves
    // nothing about where the member name came from.
    {
      code: `
    const buildQuery = (): any => {
      return {
        fetchTournamentsBy: (key: string) => {
          return key;
        },
      };
    };
  `,
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
    },
    // Same for `unknown`.
    {
      code: `
    const buildQuery = (): unknown => {
      return {
        fetchTournamentsBy: (key: string) => {
          return key;
        },
      };
    };
  `,
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
    },

    // Controls for #1597: seeing through an assertion must not become a
    // blanket amnesty. An assertion is transparent, not a contract — with no
    // conformance signal outside it, the member name is still the author's.
    {
      code: `
    const handlers = {
      fetchTournamentsBy: (key: string) => {
        return key;
      },
    } as const;
  `,
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
    },
    {
      code: `
    const buildQuery = () => {
      return {
        fetchTournamentsBy: (key: string) => {
          return key;
        },
      } as const;
    };
  `,
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
    },
    // A return type of `any` still proves nothing once an assertion wraps the
    // literal — the unwrap reaches the annotation, which is unchecked.
    {
      code: `
    const buildQuery = (): any => {
      return {
        fetchTournamentsBy: (key: string) => {
          return key;
        },
      } as const;
    };
  `,
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
    },
    // `satisfies any` imposes no excess-property check either, and the walk
    // through it must not invent a signal the outer scope does not have.
    {
      code: `
    const buildQuery = () => {
      return {
        fetchTournamentsBy: (key: string) => {
          return key;
        },
      } satisfies any;
    };
  `,
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
    },

    // === #2156: the class-field spelling of a function member. Writing `=`
    // before the member changes nothing this rule judges — the name is still
    // the author's and the call site is still a member access — so the field
    // reports exactly as the method does, and report-only for the same reason:
    // `this.x()` / `instance.x()` are not variable references the scope
    // manager can find and rename. Every case pins `output: null` so a future
    // fixer cannot orphan those call sites silently. ===
    {
      code: `
class TournamentService {
  initializeGameFor = (player: string) => {
    return player;
  };
}
  `,
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: 'initializeGameFor',
            suffix: 'For',
            suggestion: 'initializeGame',
          },
        },
      ],
      output: null,
    },
    // The function-expression spelling of the same field.
    {
      code: `
class TournamentService {
  initializeGameFor = function (player: string) {
    return player;
  };
}
  `,
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
      output: null,
    },
    // A `static` field, whose call sites are `Class.x()`.
    {
      code: 'class MathUtils { static computeValueFrom = (data: string) => data; }',
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: {
            name: 'computeValueFrom',
            suffix: 'From',
            suggestion: 'computeValue',
          },
        },
      ],
      output: null,
    },
    // Accessibility modifiers are not part of the name, so each spelling
    // reports the same once.
    {
      code: 'class Converter { public convertDataTo = (format: string) => format; }',
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
      output: null,
    },
    {
      code: 'class Validator { private validateInputWith = (rules: string) => rules; }',
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
      output: null,
    },
    {
      code: 'class Finder { protected searchItemsIn = (container: string) => container; }',
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
      output: null,
    },
    {
      code: 'class Emitter { readonly processEventOn = (element: string) => element; }',
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
      output: null,
    },
    {
      code: 'class Repo { private static readonly loadRecordFrom = (id: string) => id; }',
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
      output: null,
    },
    // An `async` field arrow is the idiom agora writes most; the keyword sits
    // on the value and leaves the member's name unchanged.
    {
      code: `
class Loader {
  fetchDataFrom = async (source: string) => {
    return source;
  };
}
  `,
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
      output: null,
    },
    // A generic field arrow: type parameters belong to the value, not the name.
    {
      code: 'class Mapper { convertItemsTo = <T>(items: T[]) => items; }',
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
      output: null,
    },
    // The field's OWN annotation does not dictate its name: a declaration is
    // free to be renamed with its type, which is why `const validateBy:
    // Validator = ...` reports too.
    {
      code: `
type Matcher = (player: string) => string;
class TournamentService {
  createMatchFor: Matcher = (player) => {
    return player;
  };
}
  `,
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
      output: null,
    },
    // A class expression has no declaration statement of its own; the member
    // is reached the same way.
    {
      code: `
const TournamentService = class {
  initializeGameFor = (player: string) => {
    return player;
  };
};
  `,
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
      output: null,
    },
    // The heritage carve-out is not a blanket amnesty: a class may add members
    // its contract never declares, and those names are the author's.
    {
      code: `
type Sortable = {
  limit: (count: number) => void;
};
class FakeQuery implements Sortable {
  limit = (count: number) => {
    return;
  };
  orderBy = (field: string) => {
    return;
  };
}
  `,
      errors: [
        {
          messageId: 'unnecessaryVerbSuffix',
          data: { name: 'orderBy', suffix: 'By', suggestion: 'order' },
        },
      ],
      output: null,
    },
    // The same through a readable base class that does not declare the member.
    {
      code: `
class BaseQuery {
  limit = (count: number) => {
    return;
  };
}
class FakeQuery extends BaseQuery {
  orderBy = (field: string) => {
    return;
  };
}
  `,
      errors: [{ messageId: 'unnecessaryVerbSuffix' }],
      output: null,
    },
    // Two field members of one class are two independent names.
    {
      code: `
class Reporter {
  computeValueFrom = (data: string) => data;
  convertDataTo = (format: string) => format;
}
  `,
      errors: [
        { messageId: 'unnecessaryVerbSuffix' },
        { messageId: 'unnecessaryVerbSuffix' },
      ],
      output: null,
    },
    // A method and a field in the same class report once each — the field arm
    // must not double-count the value the method arm already judged.
    {
      code: `
class Roster {
  groupUsersBy(role: string) {
    return role;
  }
  rankUsersBy = (role: string) => {
    return role;
  };
}
  `,
      errors: [
        { messageId: 'unnecessaryVerbSuffix' },
        { messageId: 'unnecessaryVerbSuffix' },
      ],
      output: null,
    },
    // A NAMED function expression carries a second, independently renameable
    // name — its own binding — so both are judged, exactly as they are in the
    // object-literal spelling `{ initializeGameFor: function helperFrom() {} }`
    // (measured: 2 reports there before this change and after it). Only the
    // inner binding is scope-tracked, so only it is rewritten; the member name
    // stays report-only, which is what keeps `this.initializeGameFor()` intact.
    {
      code: `
class TournamentService {
  initializeGameFor = function helperFrom(player: string) {
    return player;
  };
}
  `,
      errors: [
        { messageId: 'unnecessaryVerbSuffix' },
        { messageId: 'unnecessaryVerbSuffix' },
      ],
      output: `
class TournamentService {
  initializeGameFor = function helper(player: string) {
    return player;
  };
}
  `,
    },
  ],
});

// #2156 was an ASYMMETRY rather than a missing check: the same member reported
// as a method and went silent the moment an `=` turned it into a field arrow,
// so writing the member the way a bound member has to be written switched the
// rule off. The two spellings are pinned against each other here, with counts,
// because neither half of that failure is visible from one spelling alone — a
// lost report and a duplicated one both show up as a count that stopped
// matching its twin.
describe('no-unnecessary-verb-suffix across member spellings', () => {
  const RULE_ID = '@blumintinc/blumint/no-unnecessary-verb-suffix';
  const FILENAME = 'x.ts';

  const SPELLINGS: Record<
    string,
    { method: string; field: string; reports: number }
  > = {
    'suffixed member': {
      method:
        'class Probe { initializeGameFor(player: string) { return player; } }',
      field: 'class Probe { initializeGameFor = (player: string) => player; }',
      reports: 1,
    },
    'suffixed static member': {
      method:
        'class Probe { static computeValueFrom(data: string) { return data; } }',
      field:
        'class Probe { static computeValueFrom = (data: string) => data; }',
      reports: 1,
    },
    'suffixed private member': {
      method:
        'class Probe { private validateInputWith(rules: string) { return rules; } }',
      field:
        'class Probe { private validateInputWith = (rules: string) => rules; }',
      reports: 1,
    },
    'suffixed async member': {
      method:
        'class Probe { async fetchDataFrom(source: string) { return source; } }',
      field:
        'class Probe { fetchDataFrom = async (source: string) => source; }',
      reports: 1,
    },
    'member with no verb-preposition suffix': {
      method: 'class Probe { createMatch(player: string) { return player; } }',
      field: 'class Probe { createMatch = (player: string) => player; }',
      reports: 0,
    },
    'phrasal-verb member': {
      method: 'class Probe { signIn() { return; } }',
      field: 'class Probe { signIn = () => { return; }; }',
      reports: 0,
    },
    'member dictated by an implemented contract': {
      method: [
        'type Sortable = { orderBy: (field: string) => void };',
        'class Probe implements Sortable { orderBy(field: string) { return; } }',
      ].join('\n'),
      field: [
        'type Sortable = { orderBy: (field: string) => void };',
        'class Probe implements Sortable { orderBy = (field: string) => { return; }; }',
      ].join('\n'),
      reports: 0,
    },
    '#-named member': {
      method:
        'class Probe { #initializeGameFor(player: string) { return player; } }',
      field: 'class Probe { #initializeGameFor = (player: string) => player; }',
      reports: 0,
    },
    'abstract member': {
      method:
        'abstract class Probe { abstract initializeGameFor(player: string): void; }',
      field:
        'abstract class Probe { abstract initializeGameFor: (player: string) => void; }',
      reports: 0,
    },
  };

  const makeLinter = () => {
    const linter = new Linter();
    linter.defineParser(
      '@typescript-eslint/parser',
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@typescript-eslint/parser'),
    );
    linter.defineRule(
      RULE_ID,
      noUnnecessaryVerbSuffix as unknown as Rule.RuleModule,
    );
    return linter;
  };

  const config: Linter.Config = {
    parser: '@typescript-eslint/parser',
    parserOptions: {
      ecmaVersion: 2022 as const,
      sourceType: 'module' as const,
    },
    rules: { [RULE_ID]: 'error' },
  };

  it.each(Object.keys(SPELLINGS))(
    'reports the same on a %s whichever spelling declares it',
    (label) => {
      const linter = makeLinter();
      const { method, field, reports } = SPELLINGS[label];

      const methodMessages = linter.verify(method, config, FILENAME);
      const fieldMessages = linter.verify(field, config, FILENAME);

      // A fatal parse carries no ruleId and would otherwise read as silence on
      // both sides, making the parity hold vacuously.
      expect(
        [...methodMessages, ...fieldMessages].filter(
          (message) => message.ruleId !== RULE_ID,
        ),
      ).toEqual([]);
      expect({
        method: methodMessages.length,
        field: fieldMessages.length,
      }).toEqual({ method: reports, field: reports });
    },
  );

  it('pins both directions of the parity', () => {
    // A matrix of silent cases alone would pass against a rule that reports
    // nothing, and one of reporting cases alone against a rule that reports on
    // everything.
    const counts = Object.values(SPELLINGS).map((entry) => entry.reports);
    expect(counts.filter((count) => count > 0).length).toBeGreaterThanOrEqual(
      4,
    );
    expect(counts.filter((count) => count === 0).length).toBeGreaterThanOrEqual(
      4,
    );
  });
});

// Both rules ship in the recommended config and the `as const` appender is
// fixable, so a single `eslint --fix` pass must not turn a silent fluent
// builder into a violation whose only remedies are re-deleting the `as const`
// (which the next `--fix` restores) or renaming a method the declared type
// pins (#1597).
describe('no-unnecessary-verb-suffix after enforce-object-literal-as-const --fix', () => {
  const VICTIM_ID = '@blumintinc/blumint/no-unnecessary-verb-suffix';
  const CULPRIT_ID = '@blumintinc/blumint/enforce-object-literal-as-const';
  const FILENAME = 'x.ts';

  const BUILDER_SOURCES: Record<string, string> = {
    'arrow builder': [
      'interface FakeQuery {',
      '  orderBy: () => FakeQuery;',
      '}',
      'const buildQuery = (): FakeQuery => {',
      '  return {',
      '    orderBy: () => {',
      '      return buildQuery();',
      '    },',
      '  };',
      '};',
      '',
    ].join('\n'),
    'function declaration builder': [
      'interface FakeQuery {',
      '  orderBy: () => FakeQuery;',
      '}',
      'function buildQuery(): FakeQuery {',
      '  return {',
      '    orderBy: () => {',
      '      return buildQuery();',
      '    },',
      '  };',
      '}',
      '',
    ].join('\n'),
    'class method builder': [
      'interface FakeQuery {',
      '  orderBy: () => FakeQuery;',
      '}',
      'class Fixture {',
      '  public buildQuery(): FakeQuery {',
      '    return {',
      '      orderBy: () => {',
      '        return this.buildQuery();',
      '      },',
      '    };',
      '  }',
      '}',
      '',
    ].join('\n'),
    'nested handlers config': [
      'interface Cfg {',
      '  handlers: { orderBy: (field: string) => void };',
      '}',
      'const buildCfg = (): Cfg => {',
      '  return {',
      '    handlers: {',
      '      orderBy: (field: string) => {',
      '        return;',
      '      },',
      '    },',
      '  };',
      '};',
      '',
    ].join('\n'),
  };

  const UNNECESSARY_SUFFIX_SOURCE = [
    'const build = () => {',
    '  return {',
    '    fetchTournamentsBy: (key: string) => {',
    '      return key;',
    '    },',
    '  };',
    '};',
    '',
  ].join('\n');

  const makeLinter = () => {
    const linter = new Linter();
    linter.defineParser(
      '@typescript-eslint/parser',
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@typescript-eslint/parser'),
    );
    linter.defineRule(
      VICTIM_ID,
      noUnnecessaryVerbSuffix as unknown as Rule.RuleModule,
    );
    linter.defineRule(
      CULPRIT_ID,
      enforceObjectLiteralAsConst as unknown as Rule.RuleModule,
    );
    return linter;
  };

  const configFor = (rules: Linter.RulesRecord): Linter.Config => ({
    parser: '@typescript-eslint/parser',
    parserOptions: {
      ecmaVersion: 2022 as const,
      sourceType: 'module' as const,
    },
    rules,
  });

  it.each(Object.keys(BUILDER_SOURCES))(
    'stays silent on a %s once the sibling fixer adds `as const`',
    (label) => {
      const linter = makeLinter();
      const source = BUILDER_SOURCES[label];

      expect(
        linter.verify(source, configFor({ [VICTIM_ID]: 'error' }), FILENAME),
      ).toHaveLength(0);

      const fixed = linter.verifyAndFix(
        source,
        configFor({ [CULPRIT_ID]: 'error' }),
        FILENAME,
      );
      // Without this assertion the test passes vacuously whenever the sibling
      // fixer stops emitting `as const` for this shape.
      expect(fixed.output).toContain('as const');
      expect(
        linter.verify(
          fixed.output,
          configFor({ [VICTIM_ID]: 'error' }),
          FILENAME,
        ),
      ).toHaveLength(0);
    },
  );

  it('still reports a genuinely unnecessary suffix through the same pipeline', () => {
    const linter = makeLinter();
    expect(
      linter.verify(
        UNNECESSARY_SUFFIX_SOURCE,
        configFor({ [VICTIM_ID]: 'error' }),
        FILENAME,
      ),
    ).toHaveLength(1);

    const fixed = linter.verifyAndFix(
      UNNECESSARY_SUFFIX_SOURCE,
      configFor({ [CULPRIT_ID]: 'error' }),
      FILENAME,
    );
    expect(fixed.output).toContain('as const');
    expect(
      linter.verify(
        fixed.output,
        configFor({ [VICTIM_ID]: 'error' }),
        FILENAME,
      ),
    ).toHaveLength(1);
  });
});

// `prefer-type-over-interface` ships in the same recommended config and is
// fixable, so one `eslint --fix` pass turns every `interface S extends Base`
// contract into `type S = Base & { … }`. Reading a contract's members must
// survive that rewrite unchanged, or the member check silently retires itself
// across the whole codebase the first time the config is applied (#1679).
describe('no-unnecessary-verb-suffix after prefer-type-over-interface --fix', () => {
  const VICTIM_ID = '@blumintinc/blumint/no-unnecessary-verb-suffix';
  const CULPRIT_ID = '@blumintinc/blumint/prefer-type-over-interface';
  const FILENAME = 'x.ts';

  const CONTRACT_SOURCES: Record<string, { source: string; reports: number }> =
    {
      // The class adds a suffixed member its contract never declares: the name is
      // the author's, and the report must survive the rewrite.
      'member outside the contract': {
        source: [
          'interface Base {',
          '  limit(count: number): void;',
          '}',
          'interface QueryLike extends Base {',
          '  count: number;',
          '}',
          'class FakeQuery implements QueryLike {',
          '  count = 0;',
          '  filterUsersBy(role: string) {}',
          '}',
          '',
        ].join('\n'),
        reports: 1,
      },
      // The contract declares the suffixed member: its own declaration is
      // reported, the conforming class member is not — one report either side.
      'member declared by the contract': {
        source: [
          'interface Base {',
          '  limit(count: number): void;',
          '}',
          'interface QueryLike extends Base {',
          '  filterUsersBy(role: string): void;',
          '}',
          'class FakeQuery implements QueryLike {',
          '  filterUsersBy(role: string) {}',
          '}',
          '',
        ].join('\n'),
        reports: 1,
      },
      // A contract whose base lives in another module stays unreadable on both
      // sides of the rewrite, so the class member keeps its exemption.
      'member behind an imported base': {
        source: [
          "import type { Base } from './Base';",
          'interface QueryLike extends Base {',
          '  count: number;',
          '}',
          'class FakeQuery implements QueryLike {',
          '  count = 0;',
          '  filterUsersBy(role: string) {}',
          '}',
          '',
        ].join('\n'),
        reports: 0,
      },
    };

  const makeLinter = () => {
    const linter = new Linter();
    linter.defineParser(
      '@typescript-eslint/parser',
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@typescript-eslint/parser'),
    );
    linter.defineRule(
      VICTIM_ID,
      noUnnecessaryVerbSuffix as unknown as Rule.RuleModule,
    );
    linter.defineRule(
      CULPRIT_ID,
      preferTypeOverInterface as unknown as Rule.RuleModule,
    );
    return linter;
  };

  const configFor = (rules: Linter.RulesRecord): Linter.Config => ({
    parser: '@typescript-eslint/parser',
    parserOptions: {
      ecmaVersion: 2022 as const,
      sourceType: 'module' as const,
    },
    rules,
  });

  it.each(Object.keys(CONTRACT_SOURCES))(
    'reports the same on a %s once the sibling fixer rewrites the contract',
    (label) => {
      const linter = makeLinter();
      const { source, reports } = CONTRACT_SOURCES[label];

      expect(
        linter.verify(source, configFor({ [VICTIM_ID]: 'error' }), FILENAME),
      ).toHaveLength(reports);

      const fixed = linter.verifyAndFix(
        source,
        configFor({ [CULPRIT_ID]: 'error' }),
        FILENAME,
      );
      // Without this assertion the test passes vacuously whenever the sibling
      // fixer stops emitting an intersection for this shape.
      expect(fixed.output).toContain('type QueryLike = Base & {');
      expect(
        linter.verify(
          fixed.output,
          configFor({ [VICTIM_ID]: 'error' }),
          FILENAME,
        ),
      ).toHaveLength(reports);
    },
  );
});
