import path from 'path';
import { ruleTesterTs } from '../utils/ruleTester';
import { enforceEmptyObjectCheck } from '../rules/enforce-empty-object-check';
import { payloadScreenFor } from '../utils/syntheticRuleOptions';

const tsconfigRootDir = path.join(__dirname, '..', '..');

ruleTesterTs.run('enforce-empty-object-check', enforceEmptyObjectCheck, {
  valid: [
    `
      function processUserData(userData) {
        if (!userData || Object.keys(userData).length === 0) {
          return null;
        }
        return userData.name || 'Unknown';
      }
      `,
    `
      const config = getConfig();
      if (!config || isEmpty(config)) {
        useDefaultConfig();
      } else {
        applyConfig(config);
      }
      `,
    `
      const count: number | undefined = getCount();
      if (!count) {
        return 0;
      }
      `,
    `
      const isEnabled = getFlag();
      if (!isEnabled) {
        toggle();
      }
      `,
    `
      if (!payload || Object.keys(payload).length <= 0) {
        handle(payload);
      }
      `,
    `
      const payload = getPayload();
      if (!payload || 0 >= Object.keys(payload).length) {
        handle(payload);
      }
      `,
    {
      code: `
        const items: string[] | undefined = getItems();
        if (!items) {
          return [];
        }
        `,
      filename: path.join(
        tsconfigRootDir,
        'src/tests/fixtures/type-aware-array.ts',
      ),
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir,
      },
    },
    `
      const callback: () => void = getCallback();
      if (!callback) {
        throw new Error('missing callback');
      }
      `,
    `
      interface User {
        id: string;
        name: string;
      }

      const user: User | null = getUser();
      if (!user) {
        return;
      }
      `,
    {
      code: `
        for (; !config;) {
          config = loadConfig();
        }
        `,
      options: [{ ignoreInLoops: true }],
    },
    `
      if (Object.keys(settings).length === 0) {
        hydrateDefaults();
      }
      `,
    {
      code: `
        const formBag = getBag();
        if (!formBag || Object.keys(formBag).length === 0) {
          return;
        }
        `,
      options: [{ objectNamePattern: ['Bag'] }],
    },
    {
      code: `
        const responsePayload = getResponse();
        if (!responsePayload || lodash.isEmpty(responsePayload)) {
          return;
        }
        `,
      options: [{ emptyCheckFunctions: ['isEmpty'] }],
    },
    {
      code: `
        const payload = getPayload();
        if (!payload || isEmpty(payload)) {
          return;
        }
        `,
      options: [{ emptyCheckFunctions: ['customIsEmpty'] }],
    },
    {
      code: `
        type Config = { required: string } & { optional?: string };
        const config: Config | undefined = getConfig();
        if (!config) {
          return;
        }
        const value = config.required;
        return value;
        `,
      filename: path.join(
        tsconfigRootDir,
        'src/tests/fixtures/type-aware-object.ts',
      ),
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir,
      },
    },
    /**
     * A construct-signature-only type carries no data: `Object.keys()` of a class
     * is `[]` unless it declares statics, so the prescribed emptiness check would
     * invert the guard. The name deliberately ends with an object-like suffix, so
     * the naming fallback would report it — only real type information exempts it,
     * which keeps this case from passing vacuously if type-aware parsing is lost.
     */
    {
      code: `
        interface BuilderConstructor {
          new (id: string): { build(): string };
        }
        declare const builderConfig: BuilderConstructor | undefined;
        if (!builderConfig) {
          throw new Error('no builder registered');
        }
        `,
      filename: path.join(
        tsconfigRootDir,
        'src/tests/fixtures/type-aware-object.ts',
      ),
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir,
      },
    },
    /**
     * The `ComponentType` shape: a union of a call-signature type and a
     * construct-signature type. A union counts as an object when ANY member does,
     * so the constructor member alone used to poison the whole union.
     */
    {
      code: `
        type ViewProps = { id: string };
        type FunctionComponentLike = (props: ViewProps) => unknown;
        interface ComponentClassLike {
          new (props: ViewProps): { render(): unknown };
          displayName?: string;
        }
        type ComponentTypeLike = FunctionComponentLike | ComponentClassLike;
        declare const TokenView: ComponentTypeLike | undefined;
        if (!TokenView) {
          throw new Error('missing view');
        }
        `,
      filename: path.join(
        tsconfigRootDir,
        'src/tests/fixtures/type-aware-object.ts',
      ),
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir,
      },
    },
    {
      code: `
        type FallbackProps = { id: string };
        interface RendererClass {
          new (props: FallbackProps): { render(): unknown };
        }
        type Renderer = ((props: FallbackProps) => unknown) | RendererClass;
        declare const rendererOptions: Renderer | undefined;
        if (!rendererOptions) {
          throw new Error('missing renderer');
        }
        `,
      filename: path.join(
        tsconfigRootDir,
        'src/tests/fixtures/type-aware-object.ts',
      ),
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir,
      },
    },
    /**
     * A class reference is exempt as well. It reaches `non-object` through the
     * required `prototype` property the checker puts on every `typeof Class`, so
     * this case guards the documented behaviour rather than the construct-signature
     * branch — the branch is what covers the constructor interfaces above, which
     * carry no properties at all.
     */
    {
      code: `
        class NotificationBuilder {
          build() {
            return 'notification';
          }
        }
        declare const BuilderClass: typeof NotificationBuilder | undefined;
        if (!BuilderClass) {
          throw new Error('no builder registered');
        }
        `,
      filename: path.join(
        tsconfigRootDir,
        'src/tests/fixtures/type-aware-object.ts',
      ),
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir,
      },
    },
    {
      code: `
        type StrategyConstructor = abstract new (id: string) => { run(): void };
        declare const strategyConfig: StrategyConstructor | undefined;
        if (!strategyConfig) {
          throw new Error('no strategy registered');
        }
        `,
      filename: path.join(
        tsconfigRootDir,
        'src/tests/fixtures/type-aware-object.ts',
      ),
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir,
      },
    },
    /**
     * The optional spellings of an emptiness check are the SAME guard as the
     * plain one: every `?.` link short-circuits on a nullish receiver, and
     * neither the `Object` global nor the array `Object.keys` hands back is ever
     * nullish. Detection that matched only the plain shape read these as guards
     * missing their emptiness check and appended a duplicate one under `--fix`,
     * corrupting code that was already correct.
     */
    `
      function processUserData(userData) {
        if (!userData || Object?.keys?.(userData)?.length === 0) {
          return null;
        }
        return userData.name || 'Unknown';
      }
      `,
    `
      function processUserData(userData) {
        if (!userData || Object.keys(userData)?.length === 0) {
          return null;
        }
        return userData.name || 'Unknown';
      }
      `,
    `
      if (!userData || Object?.keys(userData).length === 0) {
        handle(userData);
      }
      `,
    `
      if (!userData || Object.keys?.(userData).length === 0) {
        handle(userData);
      }
      `,
    `
      if (!payload || Object.keys(payload)?.length <= 0) {
        handle(payload);
      }
      `,
    `
      const payload = getPayload();
      if (!payload || 0 >= Object.keys(payload)?.length) {
        handle(payload);
      }
      `,
    `
      const payload = getPayload();
      if (!payload || 0 === Object.keys(payload)?.length) {
        handle(payload);
      }
      `,
    `
      const payload = getPayload();
      if (!payload || !Object.keys(payload)?.length) {
        handle(payload);
      }
      `,
    `
      const config = getConfig();
      if (!config || isEmpty?.(config)) {
        useDefaultConfig();
      }
      `,
    {
      code: `
        const responsePayload = getResponse();
        if (!responsePayload || lodash?.isEmpty(responsePayload)) {
          return;
        }
        `,
      options: [{ emptyCheckFunctions: ['isEmpty'] }],
    },
    `
      const name = !userProfile || Object.keys(userProfile)?.length === 0 ? 'anonymous' : userProfile.name;
      `,
    `
      let options = load();
      while (!options || Object.keys(options)?.length === 0) {
        options = retry();
      }
      `,
    `
      let data;
      do {
        data = read();
      } while (!data || Object.keys(data)?.length === 0);
      `,
    `
      let config;
      for (; !config || Object.keys(config)?.length === 0; ) {
        config = getConfig();
      }
      `,
    /**
     * #2252. A file OUTSIDE the `parserOptions.project` program resolves none
     * of its imports, so the checker types the callee's return as `any` and
     * returns `unknown`. Falling through to the naming heuristic there made a
     * test file report on byte-identical code its in-program production twin is
     * exempt from — and the prescribed `Object.keys` fix is banned by the
     * consumer's own `no-restricted-properties`, so `--fix` traded one error for
     * another and reinstated it on every run.
     */
    {
      name: 'a value from an unresolved import is not evidence it can be {}',
      code: `
import { resolveChatCommandConfig } from './resolveChatCommandConfig';
import { hasRequiredChatUserLevel } from './hasRequiredChatUserLevel';
declare const text: string;
declare const viewer: unknown;
function run() {
  const config = resolveChatCommandConfig(text);
  if (!config || !hasRequiredChatUserLevel(viewer, config)) {
    return;
  }
}
`,
    },
    {
      name: 'the in-program twin of that guard, whose type resolves, stays silent',
      code: `
type ChatCommandConfig = { command: string; level: number };
declare function resolveChatCommandConfig(text: string): ChatCommandConfig | undefined;
declare const text: string;
function run() {
  const config = resolveChatCommandConfig(text);
  if (!config) {
    return;
  }
}
`,
    },
    {
      name: 'an imported binding read directly, not through a call',
      code: `
import { config } from './config';
function run() {
  if (!config) {
    return;
  }
}
`,
    },
    /**
     * #2344. The parameter's annotation traces to an unresolved import, so the
     * checker types it `any` and answers `unknown`. The evidence EXISTS and was
     * merely unreadable, which is a different situation from a binding that
     * declares no type at all — and the prescribed fix INVERTS this guard,
     * because a class instance keeps its state behind prototype accessors and
     * answers `Object.keys(...).length === 0` for every valid response.
     */
    {
      name: 'an unresolved annotation on a parameter is not evidence it can be {}',
      code: `import { NextResponse } from 'next/server';
export class UtcPrefixPrepender {
  protected isPathIgnored = false;
  public prepend(response: Readonly<NextResponse> | null | false) {
    if (!response || this.isPathIgnored) {
      return response;
    }
    return response;
  }
}`,
    },
    {
      name: 'a string annotation the checker cannot read keeps its verdict',
      code: `export const f = (response: Readonly<string>, skip: boolean) => {
  if (!response || skip) {
    return '';
  }
  return response;
};`,
    },
    {
      name: 'a number annotation the checker cannot read keeps its verdict',
      code: `export const f = (response: Readonly<number>, skip: boolean) => {
  if (!response || skip) {
    return 0;
  }
  return response;
};`,
    },
    /**
     * A `Map`, `Set` or `Date` reaches the same unresolved-annotation path once
     * lib types are absent from the program, and each keeps its contents off
     * its own enumerable properties, so the prescribed check reads empty for a
     * fully populated value.
     */
    {
      name: 'annotated Map, Set and Date guards stay silent',
      code: `export function run(
  configMap: Map<string, string>,
  roleOptions: Set<string>,
  expiryInfo: Date,
  skip: boolean,
) {
  if (!configMap || skip) {
    return;
  }
  if (!roleOptions || skip) {
    return;
  }
  if (!expiryInfo || skip) {
    return;
  }
}`,
    },
    {
      name: 'an unresolved annotation on a variable declarator stays silent',
      code: `import { NextResponse } from 'next/server';
declare function build(): NextResponse;
export function run(skip: boolean) {
  const response: Readonly<NextResponse> = build();
  if (!response || skip) {
    return;
  }
}`,
    },
    /**
     * The resolved half of the #2344 pair: an annotation the checker CAN read
     * keeps answering, so the carve-out below it never sees this guard.
     */
    {
      name: 'an annotation resolving to a required-property type stays silent',
      code: `type SessionData = { id: string };
export function run(sessionData: SessionData, skip: boolean) {
  if (!sessionData || skip) {
    return;
  }
}`,
    },
    /**
     * `Object.keys` rejects an `unknown` operand, so the fix the naming
     * heuristic would attach here does not typecheck. The declared type is the
     * evidence that stops it.
     */
    {
      name: 'a value declared unknown stays silent',
      code: `export function run(skip) {
  const config: unknown = load();
  if (!config || skip) {
    return;
  }
}`,
    },
    /**
     * #2345 negative controls. Reading MORE spellings of "the source pins a
     * dictionary" widens the arm that reports, so each construct the widening
     * touches carries the case it must still decline: a wrapper is unwrapped
     * only onto a pinned inner type, an intersection needs every member pinned,
     * and an alias is followed only into this file.
     */
    {
      name: 'a wrapper over an unresolvable reference stays silent',
      code: `import type { Thing } from './thing';
export function run(config: Partial<Thing>, skip: boolean) {
  if (!config || skip) {
    return;
  }
}`,
    },
    {
      name: 'a wrapper over a class instance stays silent',
      code: `import { NextResponse } from 'next/server';
export function run(response: Readonly<NextResponse>, skip: boolean) {
  if (!response || skip) {
    return;
  }
}`,
    },
    {
      name: 'a Map annotation stays silent',
      code: `export function run(configMap: Map<string, string>, skip: boolean) {
  if (!configMap || skip) {
    return;
  }
}`,
    },
    /**
     * An intersection carrying a required property is `non-object` to a
     * complete program, so a dictionary intersected with anything the source
     * does not pin keeps the decline — `some`-style matching here would invert
     * the very guards this branch protects.
     */
    {
      name: 'an intersection with an unpinned member stays silent',
      code: `import type { Session } from './session';
export function run(config: Record<string, string> & Session, skip: boolean) {
  if (!config || skip) {
    return;
  }
}`,
    },
    /**
     * `Required<…>` makes every named member required, so it preserves only a
     * type whose keys come from an index signature. An all-optional member list
     * under it gains a required property and stops being object-like.
     */
    {
      name: 'Required over an all-optional member list stays silent',
      code: `type Cfg = { name?: string };
export function run(config: Required<Cfg>, skip: boolean) {
  if (!config || skip) {
    return;
  }
}`,
    },
    {
      name: 'an alias to an unresolvable import stays silent',
      code: `import type { Thing } from './thing';
type Cfg = Readonly<Thing>;
export function run(config: Cfg, skip: boolean) {
  if (!config || skip) {
    return;
  }
}`,
    },
    {
      name: 'a self-referential alias terminates and stays silent',
      code: `type Cfg = Readonly<Cfg>;
export function run(config: Cfg, skip: boolean) {
  if (!config || skip) {
    return;
  }
}`,
    },
    /**
     * A qualified name reaches into a namespace this program did not load, so
     * it stays unpinned exactly as a bare imported reference does.
     */
    {
      name: 'a qualified type name stays silent',
      code: `import type * as Api from './api';
export function run(config: Api.Config, skip: boolean) {
  if (!config || skip) {
    return;
  }
}`,
    },
    /**
     * A member list is read the way `isObjectLikeType` reads a resolved type: a
     * required property makes `Object.keys()` non-empty for every valid value,
     * and a call signature marks behaviour rather than data.
     */
    {
      name: 'an intersection with a required-property literal stays silent',
      code: `export function run(
  config: Record<string, string> & { id: number },
  skip: boolean,
) {
  if (!config || skip) {
    return;
  }
}`,
    },
    {
      name: 'a wrapped call signature stays silent',
      code: `export function run(config: Readonly<{ (): void }>, skip: boolean) {
  if (!config || skip) {
    return;
  }
}`,
    },
    /**
     * A generic alias is written against parameters this reading does not
     * substitute, and each parameter shadows a same-file alias of the same
     * name, so `Wrapper<NextResponse>` would otherwise be answered by the
     * unrelated `Cfg` beside it.
     */
    {
      name: 'a generic alias whose parameter shadows a same-file alias stays silent',
      code: `import { NextResponse } from 'next/server';
type Cfg = Record<string, string>;
type Wrapper<Cfg> = Readonly<Cfg>;
export function run(response: Wrapper<NextResponse>, skip: boolean) {
  if (!response || skip) {
    return;
  }
}`,
    },
    /**
     * The oracle the source readings above mimic. Under a real `ts.Program` the
     * checker answers these on its own, and it declines both — `Required<…>`
     * over an all-optional member list produces a required property, and an
     * intersection carrying one is `non-object`. Pinning the oracle here is what
     * makes the project-free verdicts falsifiable against something other than
     * their own implementation.
     */
    {
      name: 'a complete program declines Required over an all-optional type',
      code: `type Cfg = { name?: string };
export function run(config: Required<Cfg>, skip: boolean) {
  if (!config || skip) {
    return;
  }
}`,
      filename: path.join(
        tsconfigRootDir,
        'src/tests/fixtures/type-aware-object.ts',
      ),
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir,
      },
    },
    {
      name: 'a complete program declines a dictionary intersected with required members',
      code: `interface Session {
  id: string;
}
export function run(config: Record<string, string> & Session, skip: boolean) {
  if (!config || skip) {
    return;
  }
}`,
      filename: path.join(
        tsconfigRootDir,
        'src/tests/fixtures/type-aware-object.ts',
      ),
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir,
      },
    },
    /**
     * The declaration sites #2344's binding annotation left unread. An
     * annotated function return, a class method's return, a type assertion and
     * an awaited promise state the type of the value a guard tests just as
     * directly as the annotation on the binding does, and a complete program
     * declines all six: the class instance they name keeps its state behind
     * prototype accessors, so the prescribed `Object.keys` clause holds for
     * every valid value and inverts the guard rather than hardening it (#2346).
     */
    {
      code: `
import { NextResponse } from 'next/server';
function build(): Readonly<NextResponse> {
  return load();
}
const response = build();
if (!response) {
  handle(response);
}
`,
    },
    {
      name: 'an arrow return type the checker cannot read stays silent',
      code: `import { NextResponse } from 'next/server';
const build = (): Readonly<NextResponse> => load();
const response = build();
if (!response) {
  handle(response);
}`,
    },
    {
      name: 'a class method return type the checker cannot read stays silent',
      code: `import { NextResponse } from 'next/server';
class Api {
  build(): Readonly<NextResponse> {
    return load();
  }
}
const api = new Api();
const response = api.build();
if (!response) {
  handle(response);
}`,
    },
    {
      name: 'an as-cast the checker cannot read stays silent',
      code: `import { NextResponse } from 'next/server';
const response = load() as Readonly<NextResponse>;
if (!response) {
  handle(response);
}`,
    },
    {
      name: 'an angle-bracket assertion the checker cannot read stays silent',
      code: `import { NextResponse } from 'next/server';
const response = <Readonly<NextResponse>>load();
if (!response) {
  handle(response);
}`,
    },
    {
      name: 'an awaited promise return type the checker cannot read stays silent',
      code: `import { NextResponse } from 'next/server';
async function build(): Promise<Readonly<NextResponse>> {
  return load();
}
export async function run() {
  const response = await build();
  if (!response) {
    handle(response);
  }
}`,
    },
    /**
     * A method reached through an instance of a class EXPRESSION, awaited, and
     * through a non-null assertion: the evidence sits in the same place in each
     * spelling, so reading only the plain one would leave the rest deciding on
     * the name alone.
     */
    {
      name: 'an awaited class-expression method return type stays silent',
      code: `import { NextResponse } from 'next/server';
const Api = class {
  async build(): Promise<Readonly<NextResponse>> {
    return load();
  }
};
const api = new Api();
export async function run() {
  const response = await api.build();
  if (!response) {
    handle(response);
  }
}`,
    },
    {
      name: 'a non-null assertion over an unreadable return type stays silent',
      code: `import { NextResponse } from 'next/server';
function build(): Readonly<NextResponse> {
  return load();
}
const response = build()!;
if (!response) {
  handle(response);
}`,
    },
    {
      name: 'an optional call on an unreadable method return type stays silent',
      code: `import { NextResponse } from 'next/server';
class Api {
  build(): Readonly<NextResponse> {
    return load();
  }
}
const api = new Api();
const response = api?.build();
if (!response) {
  handle(response);
}`,
    },
    /**
     * A binding initialized from another binding carries that binding's
     * declared type, so the evidence survives one more hop rather than being
     * lost at the assignment.
     */
    {
      name: 'a binding aliasing an annotated binding stays silent',
      code: `import { NextResponse } from 'next/server';
declare function load(): unknown;
export function run(skip: boolean) {
  const raw: Readonly<NextResponse> = load() as Readonly<NextResponse>;
  const response = raw;
  if (!response || skip) {
    return;
  }
}`,
    },
    /**
     * A helper named by `emptyCheckFix` satisfies the guard even when it is
     * absent from `emptyCheckFunctions`. Emission and recognition have to agree,
     * or `--fix` would report the very call it just wrote and rewrite the guard
     * on every pass (#2360).
     */
    {
      name: 'the configured fix helper counts as an emptiness check',
      code: `
function run(config: Record<string, unknown> | undefined) {
  if (!config || isVacant(config)) {
    return;
  }
}
`,
      options: [{ emptyCheckFix: { name: 'isVacant' } }],
    },
    {
      name: 'the Object.keys spelling still satisfies the guard under emptyCheckFix',
      code: `
function run(config: Record<string, unknown> | undefined) {
  if (!config || Object.keys(config).length === 0) {
    return;
  }
}
`,
      options: [{ emptyCheckFix: { name: 'isEmpty', importPath: 'p' } }],
    },
    {
      name: 'emptyCheckFunctions recognition survives alongside emptyCheckFix',
      code: `
function run(config: Record<string, unknown> | undefined) {
  if (!config || isBlank(config)) {
    return;
  }
}
`,
      options: [
        {
          emptyCheckFunctions: ['isBlank'],
          emptyCheckFix: { name: 'isVacant' },
        },
      ],
    },
  ],
  invalid: [
    /**
     * An explicit `any` is the checker reporting what the source told it, not a
     * resolution failure, so it leaves the value where an unannotated one sits
     * and the naming heuristic keeps answering.
     */
    {
      name: 'a value declared any still reports',
      code: `
export function run(skip) {
  const config: any = JSON.parse(raw);
  if (!config || skip) {
    return;
  }
}
`,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `
export function run(skip) {
  const config: any = JSON.parse(raw);
  if (!config || Object.keys(config).length === 0 || skip) {
    return;
  }
}
`,
    },
    /**
     * The #2344 carve-out is keyed on DECLARED evidence, so a binding that
     * declares nothing keeps the naming heuristic. Without these two controls
     * the arm could widen to every parameter and every variable and silence the
     * rule almost everywhere while the rest of the suite passed.
     */
    {
      name: 'an unannotated parameter still reports',
      code: `
export function run(config, skip) {
  if (!config || skip) {
    return;
  }
}
`,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `
export function run(config, skip) {
  if (!config || Object.keys(config).length === 0 || skip) {
    return;
  }
}
`,
    },
    {
      name: 'an unannotated variable still reports',
      code: `
export function run(skip) {
  const payload = load();
  if (!payload || skip) {
    return;
  }
}
`,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'payload' } },
      ],
      output: `
export function run(skip) {
  const payload = load();
  if (!payload || Object.keys(payload).length === 0 || skip) {
    return;
  }
}
`,
    },
    /**
     * A type declared in the same file resolves even in the isolated
     * single-file program, so the checker's own verdict answers first and the
     * declared-type carve-out never runs. Ordering the carve-out ahead of it
     * would silence every annotated object the rule exists to catch.
     */
    {
      name: 'an annotation resolving to an object-like type still reports',
      code: `
type UserConfig = { name?: string; email?: string };
declare function loadUserConfig(): UserConfig | undefined;
export function run(skip) {
  const userConfig: UserConfig | undefined = loadUserConfig();
  if (!userConfig || skip) {
    return;
  }
}
`,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'userConfig' } },
      ],
      output: `
type UserConfig = { name?: string; email?: string };
declare function loadUserConfig(): UserConfig | undefined;
export function run(skip) {
  const userConfig: UserConfig | undefined = loadUserConfig();
  if (!userConfig || Object.keys(userConfig).length === 0 || skip) {
    return;
  }
}
`,
    },
    /**
     * The annotation has to sit on the BINDING. A destructured property takes
     * its type from a container the checker could not resolve either, and
     * deciding one property from that annotation needs the resolution that
     * failed, so this guard stays with the heuristic.
     */
    {
      name: 'a destructured binding under an unresolved container annotation still reports',
      code: `
import { RouteProps } from './routeProps';
export function run({ config }: RouteProps, skip) {
  if (!config || skip) {
    return;
  }
}
`,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `
import { RouteProps } from './routeProps';
export function run({ config }: RouteProps, skip) {
  if (!config || Object.keys(config).length === 0 || skip) {
    return;
  }
}
`,
    },
    /**
     * The #2252 carve-out is keyed on the IDENTIFIER's own origin, not on the
     * file holding imports: `getConfig` has no declaration to trace, so the
     * naming heuristic still answers and the rule still reports. Without this
     * control the carve-out could widen to "any file that imports anything"
     * and silence the rule almost everywhere while every other test passed.
     */
    {
      name: 'an undeclared callee still reports in a file with unresolved imports',
      code: `
import { unrelated } from './unrelated';
function run() {
  const config = getConfig();
  if (!config) {
    unrelated(config);
  }
}
`,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `
import { unrelated } from './unrelated';
function run() {
  const config = getConfig();
  if (!config || Object.keys(config).length === 0) {
    unrelated(config);
  }
}
`,
    },
    {
      code: `
        function processUserData(userData) {
          if (!userData) {
            return null;
          }
          return userData.name || 'Unknown';
        }
        `,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'userData' } },
      ],
      output: `
        function processUserData(userData) {
          if (!userData || Object.keys(userData).length === 0) {
            return null;
          }
          return userData.name || 'Unknown';
        }
        `,
    },
    {
      code: `
        const config = getConfig();
        if (!config) {
          useDefaultConfig();
        } else {
          applyConfig(config);
        }
        `,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `
        const config = getConfig();
        if (!config || Object.keys(config).length === 0) {
          useDefaultConfig();
        } else {
          applyConfig(config);
        }
        `,
    },
    // An `&&` operand keeps its parentheses: `&&` binds tighter than the `||`
    // the fixer emits, so dropping them would rewrite the guard (#2082).
    {
      code: `
        if (!response && shouldLog) {
          logResponse(response);
        }
        `,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'response' } },
      ],
      output: `
        if ((!response || Object.keys(response).length === 0) && shouldLog) {
          logResponse(response);
        }
        `,
    },
    {
      code: `
        const responseData = getResponse();
        if (shouldLog && !responseData) {
          logResponse(responseData);
        }
        `,
      errors: [
        {
          messageId: 'missingEmptyObjectCheck',
          data: { name: 'responseData' },
        },
      ],
      output: `
        const responseData = getResponse();
        if (
          shouldLog &&
          (!responseData || Object.keys(responseData).length === 0)
        ) {
          logResponse(responseData);
        }
        `,
    },
    // `??` refuses to sit beside `||` unparenthesized at all, so the grouping is
    // a grammar requirement here rather than a precedence one.
    {
      code: `
        const fallbackData = getData();
        if (isReady ?? !fallbackData) {
          handle(fallbackData);
        }
        `,
      errors: [
        {
          messageId: 'missingEmptyObjectCheck',
          data: { name: 'fallbackData' },
        },
      ],
      output: `
        const fallbackData = getData();
        if (
          isReady ??
          (!fallbackData || Object.keys(fallbackData).length === 0)
        ) {
          handle(fallbackData);
        }
        `,
    },
    // Parentheses the author already wrote enclose the emission, so the fixer
    // adds none of its own rather than nesting a second redundant pair.
    {
      code: `
        const cachedData = read();
        if (isReady && (!cachedData)) {
          refresh(cachedData);
        }
        `,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'cachedData' } },
      ],
      output: `
        const cachedData = read();
        if (isReady && (!cachedData || Object.keys(cachedData).length === 0)) {
          refresh(cachedData);
        }
        `,
    },
    // The nearest enclosing operator decides, not the outermost one: an `&&`
    // nested inside an `||` still demands the grouping.
    {
      code: `
        const meta = read();
        if (isStale || (isReady && !meta)) {
          refresh(meta);
        }
        `,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'meta' } },
      ],
      output: `
        const meta = read();
        if (isStale || (isReady && (!meta || Object.keys(meta).length === 0))) {
          refresh(meta);
        }
        `,
    },
    // A ternary branch nested under `&&` takes no parentheses of its own: `?:`
    // binds looser than `||`, and the branch is already delimited by `?` and `:`.
    {
      code: `
        const meta = read();
        if (isReady && (flag ? !meta : isStale)) {
          refresh(meta);
        }
        `,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'meta' } },
      ],
      output: `
        const meta = read();
        if (
          isReady &&
          (flag ? !meta || Object.keys(meta).length === 0 : isStale)
        ) {
          refresh(meta);
        }
        `,
    },
    // The RIGHT operand of `||` needs no grouping either: regrouping a run of
    // `||` preserves both the value and the short-circuit order.
    {
      code: `
        const metaInfo = read();
        if (isStale || !metaInfo) {
          refresh(metaInfo);
        }
        `,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'metaInfo' } },
      ],
      output: `
        const metaInfo = read();
        if (isStale || !metaInfo || Object.keys(metaInfo).length === 0) {
          refresh(metaInfo);
        }
        `,
    },
    {
      code: `
        const name = !userProfile ? 'anonymous' : userProfile.name;
        `,
      errors: [
        {
          messageId: 'missingEmptyObjectCheck',
          data: { name: 'userProfile' },
        },
      ],
      output: `
        const name =
          !userProfile || Object.keys(userProfile).length === 0
            ? 'anonymous'
            : userProfile.name;
        `,
    },
    {
      code: `
        let options = load();
        while (!options) {
          options = retry();
        }
        `,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'options' } },
      ],
      output: `
        let options = load();
        while (!options || Object.keys(options).length === 0) {
          options = retry();
        }
        `,
    },
    {
      code: `
        let data;
        do {
          data = read();
        } while (!data);
        `,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'data' } },
      ],
      output: `
        let data;
        do {
          data = read();
        } while (!data || Object.keys(data).length === 0);
        `,
    },
    {
      code: `
        let config;
        for (; !config; ) {
          config = getConfig();
        }
        `,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `
        let config;
        for (; !config || Object.keys(config).length === 0; ) {
          config = getConfig();
        }
        `,
    },
    {
      code: `
        const payload: Record<string, unknown> | undefined = getPayload();
        if (!payload) {
          return handle(payload);
        }
        `,
      filename: 'src/payload.ts',
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'payload' } },
      ],
      output: `
        const payload: Record<string, unknown> | undefined = getPayload();
        if (!payload || Object.keys(payload).length === 0) {
          return handle(payload);
        }
        `,
    },
    {
      code: `
        const requestContext = getContext();
        if (!requestContext || requestContext.user) {
          return requestContext;
        }
        `,
      errors: [
        {
          messageId: 'missingEmptyObjectCheck',
          data: { name: 'requestContext' },
        },
      ],
      output: `
        const requestContext = getContext();
        if (
          !requestContext ||
          Object.keys(requestContext).length === 0 ||
          requestContext.user
        ) {
          return requestContext;
        }
        `,
    },
    {
      code: `
        const resultBag = getBag();
        if (!resultBag) {
          return null;
        }
        `,
      options: [{ objectNamePattern: ['Bag'] }],
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'resultBag' } },
      ],
      output: `
        const resultBag = getBag();
        if (!resultBag || Object.keys(resultBag).length === 0) {
          return null;
        }
        `,
    },
    {
      code: `
        const responsePayload = getResponse();
        if (!responsePayload) {
          return;
        }
        `,
      options: [{ emptyCheckFunctions: ['isEmpty'] }],
      errors: [
        {
          messageId: 'missingEmptyObjectCheck',
          data: { name: 'responsePayload' },
        },
      ],
      output: `
        const responsePayload = getResponse();
        if (!responsePayload || Object.keys(responsePayload).length === 0) {
          return;
        }
        `,
    },
    {
      code: `
        const count: Record<string, unknown> | undefined = getCount();
        if (!count) {
          return handle(count);
        }
        `,
      filename: path.join(
        tsconfigRootDir,
        'src/tests/fixtures/type-aware-object.ts',
      ),
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir,
      },
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'count' } },
      ],
      output: `
        const count: Record<string, unknown> | undefined = getCount();
        if (!count || Object.keys(count).length === 0) {
          return handle(count);
        }
        `,
    },
    {
      code: `
        type Mixed = { required: string } | Record<string, unknown>;
        const mixed: Mixed = getPayload();
        if (!mixed) {
          return handle(mixed);
        }
        `,
      filename: path.join(
        tsconfigRootDir,
        'src/tests/fixtures/type-aware-object.ts',
      ),
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir,
      },
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'mixed' } },
      ],
      output: `
        type Mixed = { required: string } | Record<string, unknown>;
        const mixed: Mixed = getPayload();
        if (!mixed || Object.keys(mixed).length === 0) {
          return handle(mixed);
        }
        `,
    },
    {
      code: `
        type Payload = { a?: string } & { b?: string };
        const payload: Payload | undefined = getPayload();
        if (!payload) {
          return handle(payload);
        }
        `,
      filename: path.join(
        tsconfigRootDir,
        'src/tests/fixtures/type-aware-object.ts',
      ),
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir,
      },
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'payload' } },
      ],
      output: `
        type Payload = { a?: string } & { b?: string };
        const payload: Payload | undefined = getPayload();
        if (!payload || Object.keys(payload).length === 0) {
          return handle(payload);
        }
        `,
    },
    {
      code: `
        if (!payload ? handleEmpty() : handlePayload(payload)) {
          process();
        }
        `,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'payload' } },
      ],
      output: `
        if (
          !payload || Object.keys(payload).length === 0
            ? handleEmpty()
            : handlePayload(payload)
        ) {
          process();
        }
        `,
    },
    {
      code: `
        if (flag ? !config : hasConfig(config)) {
          apply(config);
        }
        `,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `
        if (
          flag ? !config || Object.keys(config).length === 0 : hasConfig(config)
        ) {
          apply(config);
        }
        `,
    },
    {
      code: `
        if (flag ? hasConfig(config) : !config) {
          apply(config);
        }
        `,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `
        if (
          flag ? hasConfig(config) : !config || Object.keys(config).length === 0
        ) {
          apply(config);
        }
        `,
    },
    {
      code: `
        const config = getConfig();
        if (!config) {
          apply(config);
        }
        `,
      options: [{ objectNamePattern: ['Bag'] }],
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `
        const config = getConfig();
        if (!config || Object.keys(config).length === 0) {
          apply(config);
        }
        `,
    },
    {
      code: `
        if (!payload || Object.keys(payload).length > 5) {
          handle(payload);
        }
        `,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'payload' } },
      ],
      output: `
        if (
          !payload ||
          Object.keys(payload).length === 0 ||
          Object.keys(payload).length > 5
        ) {
          handle(payload);
        }
        `,
    },
    {
      code: `
        const payload = getPayload();
        if (!payload || Object.keys(payload).length < 0) {
          handle(payload);
        }
        `,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'payload' } },
      ],
      output: `
        const payload = getPayload();
        if (
          !payload ||
          Object.keys(payload).length === 0 ||
          Object.keys(payload).length < 0
        ) {
          handle(payload);
        }
        `,
    },
    {
      code: `
        const payload = getPayload();
        if (!payload || 0 > Object.keys(payload).length) {
          handle(payload);
        }
        `,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'payload' } },
      ],
      output: `
        const payload = getPayload();
        if (
          !payload ||
          Object.keys(payload).length === 0 ||
          0 > Object.keys(payload).length
        ) {
          handle(payload);
        }
        `,
    },
    {
      code: `
        const config = load();
        if (!config || Object.keys(config).length === 10) {
          return config;
        }
        `,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `
        const config = load();
        if (
          !config ||
          Object.keys(config).length === 0 ||
          Object.keys(config).length === 10
        ) {
          return config;
        }
        `,
    },
    {
      code: `
        const payload = getPayload();
        if (!payload || !!Object.keys(payload).length) {
          return handle(payload);
        }
        `,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'payload' } },
      ],
      output: `
        const payload = getPayload();
        if (
          !payload ||
          Object.keys(payload).length === 0 ||
          !!Object.keys(payload).length
        ) {
          return handle(payload);
        }
        `,
    },
    {
      code: `
        const islandData = fetchIsland();
        if (!islandData) {
          return islandData;
        }
        `,
      errors: [
        {
          messageId: 'missingEmptyObjectCheck',
          data: { name: 'islandData' },
        },
      ],
      output: `
        const islandData = fetchIsland();
        if (!islandData || Object.keys(islandData).length === 0) {
          return islandData;
        }
        `,
    },
    /**
     * Negative controls for the callable/constructable carve-out. Both names are
     * outside the naming heuristic, so the report can only come from the type
     * analysis: a data object stays an object even when every property is
     * optional, and a union keeps reporting as long as one member is a data
     * object.
     */
    {
      code: `
        declare const incoming: { a?: string } | undefined;
        if (!incoming) {
          throw new Error('missing payload');
        }
        `,
      filename: path.join(
        tsconfigRootDir,
        'src/tests/fixtures/type-aware-object.ts',
      ),
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir,
      },
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'incoming' } },
      ],
      output: `
        declare const incoming: { a?: string } | undefined;
        if (!incoming || Object.keys(incoming).length === 0) {
          throw new Error('missing payload');
        }
        `,
    },
    {
      code: `
        type OptionalOnly = { retries?: number; verbose?: boolean };
        declare const banner: OptionalOnly | undefined;
        if (!banner) {
          throw new Error('missing banner');
        }
        `,
      filename: path.join(
        tsconfigRootDir,
        'src/tests/fixtures/type-aware-object.ts',
      ),
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir,
      },
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'banner' } },
      ],
      output: `
        type OptionalOnly = { retries?: number; verbose?: boolean };
        declare const banner: OptionalOnly | undefined;
        if (!banner || Object.keys(banner).length === 0) {
          throw new Error('missing banner');
        }
        `,
    },
    {
      code: `
        interface WidgetConstructor {
          new (): { render(): void };
        }
        type WidgetSlot = WidgetConstructor | { fallback?: string };
        declare const slot: WidgetSlot | undefined;
        if (!slot) {
          throw new Error('missing slot');
        }
        `,
      filename: path.join(
        tsconfigRootDir,
        'src/tests/fixtures/type-aware-object.ts',
      ),
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir,
      },
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'slot' } },
      ],
      output: `
        interface WidgetConstructor {
          new (): { render(): void };
        }
        type WidgetSlot = WidgetConstructor | { fallback?: string };
        declare const slot: WidgetSlot | undefined;
        if (!slot || Object.keys(slot).length === 0) {
          throw new Error('missing slot');
        }
        `,
    },
    /**
     * Negative controls for the optional-chain arm. Reading through a
     * `ChainExpression` must recognize the emptiness check it wraps, not accept
     * any chain at all: a presence test, a different object, `Object.values`, a
     * negated emptiness test, and a helper called on another identifier each
     * leave `{}` passing the guard, so each still has to report.
     */
    {
      code: `
        const payload = getPayload();
        if (!payload || Object.keys(payload)?.length > 5) {
          handle(payload);
        }
        `,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'payload' } },
      ],
      output: `
        const payload = getPayload();
        if (
          !payload ||
          Object.keys(payload).length === 0 ||
          Object.keys(payload)?.length > 5
        ) {
          handle(payload);
        }
        `,
    },
    {
      code: `
        const userData = getUser();
        if (!userData || Object.keys(otherData)?.length === 0) {
          handle(userData);
        }
        `,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'userData' } },
      ],
      output: `
        const userData = getUser();
        if (
          !userData ||
          Object.keys(userData).length === 0 ||
          Object.keys(otherData)?.length === 0
        ) {
          handle(userData);
        }
        `,
    },
    {
      code: `
        const userData = getUser();
        if (!userData || Object.values(userData)?.length === 0) {
          handle(userData);
        }
        `,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'userData' } },
      ],
      output: `
        const userData = getUser();
        if (
          !userData ||
          Object.keys(userData).length === 0 ||
          Object.values(userData)?.length === 0
        ) {
          handle(userData);
        }
        `,
    },
    {
      code: `
        const payload = getPayload();
        if (!payload || !(Object.keys(payload)?.length === 0)) {
          handle(payload);
        }
        `,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'payload' } },
      ],
      output: `
        const payload = getPayload();
        if (
          !payload ||
          Object.keys(payload).length === 0 ||
          !(Object.keys(payload)?.length === 0)
        ) {
          handle(payload);
        }
        `,
    },
    {
      code: `
        const payload = getPayload();
        if (!payload || !!Object.keys(payload)?.length) {
          return handle(payload);
        }
        `,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'payload' } },
      ],
      output: `
        const payload = getPayload();
        if (
          !payload ||
          Object.keys(payload).length === 0 ||
          !!Object.keys(payload)?.length
        ) {
          return handle(payload);
        }
        `,
    },
    {
      code: `
        const payload = getPayload();
        if (!payload || isEmpty?.(otherPayload)) {
          return;
        }
        `,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'payload' } },
      ],
      output: `
        const payload = getPayload();
        if (
          !payload ||
          Object.keys(payload).length === 0 ||
          isEmpty?.(otherPayload)
        ) {
          return;
        }
        `,
    },
    {
      code: `
        const config = load();
        if (!config || Object.keys(config)?.length === 10) {
          return config;
        }
        `,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `
        const config = load();
        if (
          !config ||
          Object.keys(config).length === 0 ||
          Object.keys(config)?.length === 10
        ) {
          return config;
        }
        `,
    },
    /**
     * Print-width coverage (#2095). The widened condition can push the statement
     * it lives in past the print width, and Prettier answers that by breaking
     * the header one operand per line. Every emission below is a fixed point of
     * Prettier 2.8.8 — agora's pin, which is the binary that decides whether a
     * `--fix` run leaves the tree failing `prettier --check`.
     */
    {
      name: 'an over-wide if header breaks one operand per line',
      code: `
        const requestPayload = getPayload();
        if (!requestPayload || Object.keys(requestPayload).length > 5) {
          handle(requestPayload);
        }
        `,
      errors: [
        {
          messageId: 'missingEmptyObjectCheck',
          data: { name: 'requestPayload' },
        },
      ],
      output: `
        const requestPayload = getPayload();
        if (
          !requestPayload ||
          Object.keys(requestPayload).length === 0 ||
          Object.keys(requestPayload).length > 5
        ) {
          handle(requestPayload);
        }
        `,
    },
    {
      name: 'an over-wide while header breaks one operand per line',
      code: `
        let optionsRecord = load();
        while (!optionsRecord || retryCounterValue < maximumRetryCount) {
          optionsRecord = retry();
        }
        `,
      errors: [
        {
          messageId: 'missingEmptyObjectCheck',
          data: { name: 'optionsRecord' },
        },
      ],
      output: `
        let optionsRecord = load();
        while (
          !optionsRecord ||
          Object.keys(optionsRecord).length === 0 ||
          retryCounterValue < maximumRetryCount
        ) {
          optionsRecord = retry();
        }
        `,
    },
    {
      name: 'an over-wide do-while trailer breaks one operand per line',
      code: `
        let dataRecord;
        do {
          dataRecord = read();
        } while (!dataRecord || retryCounterValue < maximumRetryCount);
        `,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'dataRecord' } },
      ],
      output: `
        let dataRecord;
        do {
          dataRecord = read();
        } while (
          !dataRecord ||
          Object.keys(dataRecord).length === 0 ||
          retryCounterValue < maximumRetryCount
        );
        `,
    },
    /**
     * A parenthesized operand that no longer fits breaks INSIDE its own
     * parentheses, with the closing one glued to the last line — the layout
     * Prettier gives a group, which differs from the one it gives the chain that
     * holds it.
     */
    {
      name: 'a grouped operand breaks inside its own parentheses',
      code: `
        const metaConfigInfo = read();
        if (isStaleAlready || (isReadyToGo && !metaConfigInfo)) {
          refresh(metaConfigInfo);
        }
        `,
      errors: [
        {
          messageId: 'missingEmptyObjectCheck',
          data: { name: 'metaConfigInfo' },
        },
      ],
      output: `
        const metaConfigInfo = read();
        if (
          isStaleAlready ||
          (isReadyToGo &&
            (!metaConfigInfo || Object.keys(metaConfigInfo).length === 0))
        ) {
          refresh(metaConfigInfo);
        }
        `,
    },
    /**
     * An assignment breaks after the `=` and lets the conditional break beneath
     * it; a `return` keeps its argument on the keyword's line and breaks only
     * the conditional. The two layouts differ, so both are pinned.
     */
    {
      name: 'an over-wide assignment breaks after the equals sign',
      code: `
        someHolderObject.displayName = !userProfile ? 'anonymous' : userProfile.name;
        `,
      errors: [
        {
          messageId: 'missingEmptyObjectCheck',
          data: { name: 'userProfile' },
        },
      ],
      output: `
        someHolderObject.displayName =
          !userProfile || Object.keys(userProfile).length === 0
            ? 'anonymous'
            : userProfile.name;
        `,
    },
    {
      name: 'an over-wide return breaks only the conditional',
      code: `
        function pick() {
          return !userProfile ? 'anonymous' : userProfile.displayName;
        }
        `,
      errors: [
        {
          messageId: 'missingEmptyObjectCheck',
          data: { name: 'userProfile' },
        },
      ],
      output: `
        function pick() {
          return !userProfile || Object.keys(userProfile).length === 0
            ? 'anonymous'
            : userProfile.displayName;
        }
        `,
    },
    /**
     * A header Prettier has ALREADY broken is the common case once a condition
     * overflows, so the emitter re-lays it out rather than splicing a one-line
     * guard into the broken form.
     */
    {
      name: 'a header already broken by Prettier is laid out again',
      code: `
        if (
          !payloadRecord ? handleEmptyPayload() : handlePayloadNow(payloadRecord)
        ) {
          process();
        }
        `,
      errors: [
        {
          messageId: 'missingEmptyObjectCheck',
          data: { name: 'payloadRecord' },
        },
      ],
      output: `
        if (
          !payloadRecord || Object.keys(payloadRecord).length === 0
            ? handleEmptyPayload()
            : handlePayloadNow(payloadRecord)
        ) {
          process();
        }
        `,
    },
    /**
     * An inline comment is a layout input once the region is re-laid out, so it
     * is carried rather than declined: Prettier glues a comment written after an
     * operand to that operand's line, ahead of the trailing operator, and one
     * written before an operand opens that operand's line. Both spellings ship
     * because the reconstruction is compared against the spliced source before
     * any line is emitted — a comment the emitter moved would fail that
     * comparison, and only a spelling actually exercised proves it does not.
     */
    {
      name: 'a comment after an operand rides that operand once the header breaks',
      code: `
        if (!payload /* keep me */ || Object.keys(payload).length > 5) {
          handle(payload);
        }
        `,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'payload' } },
      ],
      output: `
        if (
          !payload ||
          Object.keys(payload).length === 0 /* keep me */ ||
          Object.keys(payload).length > 5
        ) {
          handle(payload);
        }
        `,
    },
    {
      name: 'a comment before an operand opens that operand once the header breaks',
      code: `
        if (!payload || /* keep me */ Object.keys(payload).length > 5) {
          handle(payload);
        }
        `,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'payload' } },
      ],
      output: `
        if (
          !payload ||
          Object.keys(payload).length === 0 ||
          /* keep me */ Object.keys(payload).length > 5
        ) {
          handle(payload);
        }
        `,
    },
    /**
     * A non-block clause shares the header's group, so Prettier moves it to its
     * own indented line the moment that group breaks. Which of the two rows
     * overflows decides how much breaks: past the `)` column the test breaks one
     * operand per line as well, within it the test keeps its line and only the
     * clause moves.
     */
    {
      name: 'a non-block clause moves under a test that breaks with it',
      code: `
        if (!payloadContext || Object.keys(payloadContext).length > 5) return handle();
        `,
      errors: [
        {
          messageId: 'missingEmptyObjectCheck',
          data: { name: 'payloadContext' },
        },
      ],
      output: `
        if (
          !payloadContext ||
          Object.keys(payloadContext).length === 0 ||
          Object.keys(payloadContext).length > 5
        )
          return handle();
        `,
    },
    {
      name: 'a non-block clause moves alone when the test still fits its line',
      code: `
        if (!appConfig || flag) handleConfiguredApplication();
        `,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'appConfig' } },
      ],
      output: `
        if (!appConfig || Object.keys(appConfig).length === 0 || flag)
          handleConfiguredApplication();
        `,
    },
    {
      name: 'an else clause keeps its own line while the consequent moves',
      code: `
        if (!payloadContext || Object.keys(payloadContext).length > 5) return handle();
        else return other();
        `,
      errors: [
        {
          messageId: 'missingEmptyObjectCheck',
          data: { name: 'payloadContext' },
        },
      ],
      output: `
        if (
          !payloadContext ||
          Object.keys(payloadContext).length === 0 ||
          Object.keys(payloadContext).length > 5
        )
          return handle();
        else return other();
        `,
    },
    /**
     * Prettier lays every declarator after the first out one level in, and
     * indents a break after `=` one level past that — so the value lands four
     * columns from the statement whichever declarator carries it, including the
     * first, which merely shares the `const` line rather than owning a row of
     * its own.
     */
    {
      name: 'a second declarator breaks after its own equals sign',
      code: `
        const first = 1,
          second = !userProfile ? 'anonymous' : userProfile.name;
        `,
      errors: [
        {
          messageId: 'missingEmptyObjectCheck',
          data: { name: 'userProfile' },
        },
      ],
      output: `
        const first = 1,
          second =
            !userProfile || Object.keys(userProfile).length === 0
              ? 'anonymous'
              : userProfile.name;
        `,
    },
    {
      name: 'the first of several declarators indents to the declarator level',
      code: `
        const displayName = !userProfile ? 'anonymous' : userProfile.name,
          fallback = 1;
        `,
      errors: [
        {
          messageId: 'missingEmptyObjectCheck',
          data: { name: 'userProfile' },
        },
      ],
      output: `
        const displayName =
            !userProfile || Object.keys(userProfile).length === 0
              ? 'anonymous'
              : userProfile.name,
          fallback = 1;
        `,
    },
    /**
     * The decline boundary. A shape whose break Prettier decides by a rule this
     * emitter does not author — opening a call's argument list, switching to its
     * chained-ternary form — keeps the minimal replacement rather than emitting
     * a line `prettier --check` would reject. Declining is not a lost fix: the
     * guard is still added, exactly as it was before the width was measured at
     * all.
     */
    {
      name: 'an operand too wide for its own line keeps the minimal replacement',
      code: `
        if (!payloadInfo || someVeryLongPredicateName(argumentOne, argumentTwo, argumentThree, four)) {
          handle(payloadInfo);
        }
        `,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'payloadInfo' } },
      ],
      output: `
        if (!payloadInfo || Object.keys(payloadInfo).length === 0 || someVeryLongPredicateName(argumentOne, argumentTwo, argumentThree, four)) {
          handle(payloadInfo);
        }
        `,
    },
    /**
     * `printWidth` drives the emission in BOTH directions, against the same
     * fixture pairs: raised, an 86-column header that breaks at the default
     * stays on one line; lowered, a 61-column header that fits at the default
     * breaks. The middle case is the control that pins the default.
     */
    {
      name: 'a raised printWidth keeps an 86-column header on one line',
      options: [{ printWidth: 120 }],
      code: `
        const payload = getPayload();
        if (!payload || Object.keys(payload).length > 5) {
          handle(payload);
        }
        `,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'payload' } },
      ],
      output: `
        const payload = getPayload();
        if (!payload || Object.keys(payload).length === 0 || Object.keys(payload).length > 5) {
          handle(payload);
        }
        `,
    },
    {
      name: 'a lowered printWidth breaks a header that fits at the default',
      options: [{ printWidth: 60 }],
      code: `
        const userData = getUser();
        if (!userData) {
          handle(userData);
        }
        `,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'userData' } },
      ],
      output: `
        const userData = getUser();
        if (
          !userData ||
          Object.keys(userData).length === 0
        ) {
          handle(userData);
        }
        `,
    },
    {
      name: 'the same header stays on one line at the default printWidth',
      code: `
        const userData = getUser();
        if (!userData) {
          handle(userData);
        }
        `,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'userData' } },
      ],
      output: `
        const userData = getUser();
        if (!userData || Object.keys(userData).length === 0) {
          handle(userData);
        }
        `,
    },
    /**
     * #2345. `Record<K, V>` is an index signature whichever way its arguments
     * resolve, and so is every construct below that carries one: the SPELLING
     * is not what makes the value a plain data map. Reading only the bare
     * reference left each of these silent on a guard the rule made before the
     * declared-type carve-out existed and a complete program still reports.
     */
    {
      code: `
function handle(config: Readonly<Record<string, string>>) {
  if (!config) {
    return;
  }
}
`,
      errors: [{ messageId: 'missingEmptyObjectCheck' }],
      output: `
function handle(config: Readonly<Record<string, string>>) {
  if (!config || Object.keys(config).length === 0) {
    return;
  }
}
`,
    },
    {
      name: 'Partial over a Record still reports',
      code: `
export function run(config: Partial<Record<string, string>>, skip: boolean) {
  if (!config || skip) {
    return;
  }
}
`,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `
export function run(config: Partial<Record<string, string>>, skip: boolean) {
  if (!config || Object.keys(config).length === 0 || skip) {
    return;
  }
}
`,
    },
    {
      name: 'Required over a Record still reports',
      code: `
export function run(config: Required<Record<string, string>>, skip: boolean) {
  if (!config || skip) {
    return;
  }
}
`,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `
export function run(config: Required<Record<string, string>>, skip: boolean) {
  if (!config || Object.keys(config).length === 0 || skip) {
    return;
  }
}
`,
    },
    {
      name: 'nested shape-preserving wrappers over a Record still report',
      code: `
export function run(config: Readonly<Partial<Record<string, string>>>, skip: boolean) {
  if (!config || skip) {
    return;
  }
}
`,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `
export function run(config: Readonly<Partial<Record<string, string>>>, skip: boolean) {
  if (!config || Object.keys(config).length === 0 || skip) {
    return;
  }
}
`,
    },
    {
      name: 'a wrapped Record inside a union still reports',
      code: `
export function run(config: Readonly<Record<string, string>> | undefined, skip: boolean) {
  if (!config || skip) {
    return;
  }
}
`,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `
export function run(config: Readonly<Record<string, string>> | undefined, skip: boolean) {
  if (!config || Object.keys(config).length === 0 || skip) {
    return;
  }
}
`,
    },
    {
      name: 'a Record intersected with an all-optional literal still reports',
      code: `
export function run(config: Record<string, string> & { id?: number }, skip: boolean) {
  if (!config || skip) {
    return;
  }
}
`,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `
export function run(config: Record<string, string> & { id?: number }, skip: boolean) {
  if (!config || Object.keys(config).length === 0 || skip) {
    return;
  }
}
`,
    },
    {
      name: 'a same-file alias to a Record on a parameter still reports',
      code: `
type Cfg = Record<string, string>;
export function run(config: Cfg, skip: boolean) {
  if (!config || skip) {
    return;
  }
}
`,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `
type Cfg = Record<string, string>;
export function run(config: Cfg, skip: boolean) {
  if (!config || Object.keys(config).length === 0 || skip) {
    return;
  }
}
`,
    },
    {
      name: 'a chained same-file alias to a Record still reports',
      code: `
type Inner = Record<string, string>;
type Cfg = Inner;
export function run(config: Cfg, skip: boolean) {
  if (!config || skip) {
    return;
  }
}
`,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `
type Inner = Record<string, string>;
type Cfg = Inner;
export function run(config: Cfg, skip: boolean) {
  if (!config || Object.keys(config).length === 0 || skip) {
    return;
  }
}
`,
    },
    {
      name: 'a same-file alias to a wrapped Record still reports',
      code: `
type Cfg = Readonly<Record<string, string>>;
export function run(config: Cfg, skip: boolean) {
  if (!config || skip) {
    return;
  }
}
`,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `
type Cfg = Readonly<Record<string, string>>;
export function run(config: Cfg, skip: boolean) {
  if (!config || Object.keys(config).length === 0 || skip) {
    return;
  }
}
`,
    },
    {
      name: 'a same-file alias to a Record on a variable still reports',
      code: `
type Cfg = Record<string, string>;
export function run(skip: boolean) {
  const config: Cfg = load();
  if (!config || skip) {
    return;
  }
}
`,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `
type Cfg = Record<string, string>;
export function run(skip: boolean) {
  const config: Cfg = load();
  if (!config || Object.keys(config).length === 0 || skip) {
    return;
  }
}
`,
    },
    /**
     * An intersection carrying `any` reduces to `any`, which states nothing
     * about the value's shape, so the naming heuristic keeps answering exactly
     * as it does for a union carrying one.
     */
    {
      name: 'an intersection carrying any still reports',
      code: `
import type { Props } from './props';
export function run(config: Props & any, skip: boolean) {
  if (!config || skip) {
    return;
  }
}
`,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `
import type { Props } from './props';
export function run(config: Props & any, skip: boolean) {
  if (!config || Object.keys(config).length === 0 || skip) {
    return;
  }
}
`,
    },
    /**
     * #2345 positive controls. Each of these resolves in the isolated
     * single-file program, so the checker answers `object` and the declared-type
     * carve-out never runs. They pin the ordering: widening the carve-out must
     * not overtake the checker's own verdict.
     */
    {
      name: 'an inline index signature still reports',
      code: `
export function run(config: { [key: string]: string }, skip: boolean) {
  if (!config || skip) {
    return;
  }
}
`,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `
export function run(config: { [key: string]: string }, skip: boolean) {
  if (!config || Object.keys(config).length === 0 || skip) {
    return;
  }
}
`,
    },
    {
      name: 'a mapped type still reports',
      code: `
type Keys = 'a' | 'b';
type Cfg = { [K in Keys]?: string };
export function run(config: Cfg, skip: boolean) {
  if (!config || skip) {
    return;
  }
}
`,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `
type Keys = 'a' | 'b';
type Cfg = { [K in Keys]?: string };
export function run(config: Cfg, skip: boolean) {
  if (!config || Object.keys(config).length === 0 || skip) {
    return;
  }
}
`,
    },
    {
      name: 'a same-file alias to an inline literal still reports',
      code: `
type Cfg = { name?: string };
export function run(config: Cfg, skip: boolean) {
  if (!config || skip) {
    return;
  }
}
`,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `
type Cfg = { name?: string };
export function run(config: Cfg, skip: boolean) {
  if (!config || Object.keys(config).length === 0 || skip) {
    return;
  }
}
`,
    },
    {
      name: 'a same-file interface with only optional members still reports',
      code: `
interface Cfg {
  name?: string;
}
export function run(config: Cfg, skip: boolean) {
  if (!config || skip) {
    return;
  }
}
`,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `
interface Cfg {
  name?: string;
}
export function run(config: Cfg, skip: boolean) {
  if (!config || Object.keys(config).length === 0 || skip) {
    return;
  }
}
`,
    },
    /**
     * A nullable member contributes no shape to a union, exactly as
     * `isObjectLikeType` skips one on a resolved type, so the dictionary beside
     * it still answers for the whole annotation.
     */
    {
      name: 'a nullable union under Required still reports',
      code: `
export function run(
  config: Required<Record<string, string> | undefined>,
  skip: boolean,
) {
  if (!config || skip) {
    return;
  }
}
`,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `
export function run(
  config: Required<Record<string, string> | undefined>,
  skip: boolean,
) {
  if (!config || Object.keys(config).length === 0 || skip) {
    return;
  }
}
`,
    },
    /**
     * The same three annotations under a real `ts.Program`, where the checker
     * decides and the source-reading arm never runs. They are the oracle the
     * project-free verdicts above are written to match, so a divergence fails
     * here rather than surviving as a difference nobody measures.
     */
    {
      name: 'a complete program reports Required over a Record',
      code: `export function run(config: Required<Record<string, string>>, skip: boolean) {
  if (!config || skip) {
    return;
  }
}`,
      filename: path.join(
        tsconfigRootDir,
        'src/tests/fixtures/type-aware-object.ts',
      ),
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir,
      },
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `export function run(config: Required<Record<string, string>>, skip: boolean) {
  if (!config || Object.keys(config).length === 0 || skip) {
    return;
  }
}`,
    },
    {
      name: 'a complete program reports a Record intersected with an all-optional literal',
      code: `export function run(
  config: Record<string, string> & { id?: number },
  skip: boolean,
) {
  if (!config || skip) {
    return;
  }
}`,
      filename: path.join(
        tsconfigRootDir,
        'src/tests/fixtures/type-aware-object.ts',
      ),
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir,
      },
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `export function run(
  config: Record<string, string> & { id?: number },
  skip: boolean,
) {
  if (!config || Object.keys(config).length === 0 || skip) {
    return;
  }
}`,
    },
    {
      name: 'a complete program reports Required over a nullable Record',
      code: `export function run(
  config: Required<Record<string, string> | undefined>,
  skip: boolean,
) {
  if (!config || skip) {
    return;
  }
}`,
      filename: path.join(
        tsconfigRootDir,
        'src/tests/fixtures/type-aware-object.ts',
      ),
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir,
      },
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `export function run(
  config: Required<Record<string, string> | undefined>,
  skip: boolean,
) {
  if (!config || Object.keys(config).length === 0 || skip) {
    return;
  }
}`,
    },
    /**
     * The index signature can be written inline under the wrapper rather than
     * spelled `Record`; it is the same signature and the same verdict.
     */
    {
      name: 'a wrapped inline index signature still reports',
      code: `
export function run(config: Readonly<{ [key: string]: string }>, skip: boolean) {
  if (!config || skip) {
    return;
  }
}
`,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `
export function run(config: Readonly<{ [key: string]: string }>, skip: boolean) {
  if (!config || Object.keys(config).length === 0 || skip) {
    return;
  }
}
`,
    },
    /**
     * The controls for #2346. Reading a declaration site only buys the decline
     * when what it says is a class instance; a return type or assertion that IS
     * a dictionary keeps its report, so the carve-out cannot widen into "any
     * value produced by a call".
     */
    {
      name: 'a function return type spelling a dictionary still reports',
      code: `
function build(): Record<string, string> {
  return load();
}
const config = build();
if (!config) {
  handle(config);
}
`,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `
function build(): Record<string, string> {
  return load();
}
const config = build();
if (!config || Object.keys(config).length === 0) {
  handle(config);
}
`,
    },
    {
      name: 'an arrow return type spelling a dictionary still reports',
      code: `
const build = (): Record<string, string> => load();
const config = build();
if (!config) {
  handle(config);
}
`,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `
const build = (): Record<string, string> => load();
const config = build();
if (!config || Object.keys(config).length === 0) {
  handle(config);
}
`,
    },
    {
      name: 'a class method return type spelling a dictionary still reports',
      code: `
class Api {
  build(): Record<string, string> {
    return load();
  }
}
const api = new Api();
const config = api.build();
if (!config) {
  handle(config);
}
`,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `
class Api {
  build(): Record<string, string> {
    return load();
  }
}
const api = new Api();
const config = api.build();
if (!config || Object.keys(config).length === 0) {
  handle(config);
}
`,
    },
    {
      name: 'an as-cast spelling a dictionary still reports',
      code: `
const config = load() as Record<string, string>;
if (!config) {
  handle(config);
}
`,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `
const config = load() as Record<string, string>;
if (!config || Object.keys(config).length === 0) {
  handle(config);
}
`,
    },
    {
      name: 'an angle-bracket assertion spelling a dictionary still reports',
      code: `
const config = <Record<string, string>>load();
if (!config) {
  handle(config);
}
`,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `
const config = <Record<string, string>>load();
if (!config || Object.keys(config).length === 0) {
  handle(config);
}
`,
    },
    /**
     * Without unwrapping the promise the awaited dictionary reads as
     * `Promise<…>`, which no source pins, and the guard this rule exists to add
     * would be dropped on every `async` declaration.
     */
    {
      name: 'an awaited promise of a dictionary still reports',
      code: `
async function build(): Promise<Record<string, string>> {
  return load();
}
export async function run() {
  const config = await build();
  if (!config) {
    handle(config);
  }
}
`,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `
async function build(): Promise<Record<string, string>> {
  return load();
}
export async function run() {
  const config = await build();
  if (!config || Object.keys(config).length === 0) {
    handle(config);
  }
}
`,
    },
    /**
     * `satisfies` checks an expression against a type without changing it, so
     * the value keeps whatever the expression carried and the declaration sites
     * read here say nothing about it. A complete program agrees.
     */
    {
      name: 'a satisfies expression still reports',
      code: `
import { NextResponse } from 'next/server';
const response = load() satisfies Readonly<NextResponse>;
if (!response) {
  handle(response);
}
`,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'response' } },
      ],
      output: `
import { NextResponse } from 'next/server';
const response = load() satisfies Readonly<NextResponse>;
if (!response || Object.keys(response).length === 0) {
  handle(response);
}
`,
    },
    /**
     * `as const` pins mutability rather than shape, so the shape stays whatever
     * the asserted expression carries and the heuristic keeps answering.
     * Reading `const` as a named type would silence this instead.
     */
    {
      name: 'a const assertion is read through to the asserted expression',
      code: `
import { DEFAULTS } from './defaults';
const config = { ...DEFAULTS } as const;
if (!config) {
  handle(config);
}
`,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `
import { DEFAULTS } from './defaults';
const config = { ...DEFAULTS } as const;
if (!config || Object.keys(config).length === 0) {
  handle(config);
}
`,
    },
    /**
     * The variable-declarator twin of the parameter control above: an
     * assertion around a destructuring describes the CONTAINER, and deciding
     * one property from it needs the resolution that failed, so the guard stays
     * with the heuristic.
     */
    {
      name: 'a destructured variable under an unreadable container assertion still reports',
      code: `
import { NextResponse } from 'next/server';
const { config } = load() as Readonly<NextResponse>;
if (!config) {
  handle(config);
}
`,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `
import { NextResponse } from 'next/server';
const { config } = load() as Readonly<NextResponse>;
if (!config || Object.keys(config).length === 0) {
  handle(config);
}
`,
    },
    /**
     * A callee this file declares but leaves unannotated states nothing, so the
     * reading below adds no evidence and the heuristic still answers.
     */
    {
      name: 'a same-file callee with no return annotation still reports',
      code: `
function build() {
  return load();
}
const config = build();
if (!config) {
  handle(config);
}
`,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `
function build() {
  return load();
}
const config = build();
if (!config || Object.keys(config).length === 0) {
  handle(config);
}
`,
    },
    /**
     * The receiver's class is not written in this file, so its method's return
     * type is not readable here and the guard keeps the heuristic rather than
     * borrowing a same-named method from an unrelated class.
     */
    {
      name: 'a method on a class this file does not declare still reports',
      code: `
class Other {
  build(): Readonly<NextResponse> {
    return load();
  }
}
const config = registry.build();
if (!config) {
  handle(config);
}
`,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `
class Other {
  build(): Readonly<NextResponse> {
    return load();
  }
}
const config = registry.build();
if (!config || Object.keys(config).length === 0) {
  handle(config);
}
`,
    },
    /**
     * Bindings initialized from each other terminate rather than recursing
     * forever, and the guard falls back to the heuristic exactly as it does
     * when no declaration states a type.
     */
    {
      name: 'mutually aliasing bindings terminate and still report',
      code: `
export function run(skip) {
  let config = payload;
  let payload = config;
  if (!config || skip) {
    return;
  }
}
`,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `
export function run(skip) {
  let config = payload;
  let payload = config;
  if (!config || Object.keys(config).length === 0 || skip) {
    return;
  }
}
`,
    },
    {
      /** Minimal replacement path, src/rules/enforce-empty-object-check.ts:2534. */
      code: `function userPreview(afterData: Record<string, unknown> | undefined) {
  if (!afterData) {
    return;
  }
  return afterData;
}`,
      options: [{ emptyCheckFix: { name: 'isEmpty' } }],
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'afterData' } },
      ],
      output: `function userPreview(afterData: Record<string, unknown> | undefined) {
  if (!afterData || isEmpty(afterData)) {
    return;
  }
  return afterData;
}`,
    },
    {
      /** Widened layout path, :1589. Only the operand text changes. */
      code: `function userPreview(
  afterData: Record<string, unknown> | undefined,
  isPathIgnored: boolean,
  hasPermission: boolean,
) {
  if (!afterData && isPathIgnored && hasPermission && !!afterData.size) {
    return;
  }
  return afterData;
}`,
      options: [{ emptyCheckFix: { name: 'isEmpty' } }],
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'afterData' } },
      ],
      output: `function userPreview(
  afterData: Record<string, unknown> | undefined,
  isPathIgnored: boolean,
  hasPermission: boolean,
) {
  if (
    (!afterData || isEmpty(afterData)) &&
    isPathIgnored &&
    hasPermission &&
    !!afterData.size
  ) {
    return;
  }
  return afterData;
}`,
    },
    /**
     * The unconfigured emission is the compatibility contract: a consumer that
     * has not opted into `emptyCheckFix` must see byte-identical output on both
     * emission paths (#2360).
     */
    {
      name: 'the unconfigured default still emits Object.keys on the minimal path',
      code: `function run(config: Record<string, unknown> | undefined) {
  if (!config) {
    return;
  }
  return config;
}`,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `function run(config: Record<string, unknown> | undefined) {
  if (!config || Object.keys(config).length === 0) {
    return;
  }
  return config;
}`,
    },
    {
      name: 'the unconfigured default still emits Object.keys on the widened path',
      code: `function userPreview(
  afterData: Record<string, unknown> | undefined,
  isPathIgnored: boolean,
  hasPermission: boolean,
) {
  if (!afterData && isPathIgnored && hasPermission && !!afterData.size) {
    return;
  }
  return afterData;
}`,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'afterData' } },
      ],
      output: `function userPreview(
  afterData: Record<string, unknown> | undefined,
  isPathIgnored: boolean,
  hasPermission: boolean,
) {
  if (
    (!afterData || Object.keys(afterData).length === 0) &&
    isPathIgnored &&
    hasPermission &&
    !!afterData.size
  ) {
    return;
  }
  return afterData;
}`,
    },
    {
      name: 'a fix helper without an import path adds no import',
      code: `import { a } from 'a';
declare function isVacant(value: unknown): boolean;

function run(config: Record<string, unknown> | undefined) {
  if (!config) {
    return;
  }
}`,
      options: [{ emptyCheckFix: { name: 'isVacant' } }],
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `import { a } from 'a';
declare function isVacant(value: unknown): boolean;

function run(config: Record<string, unknown> | undefined) {
  if (!config || isVacant(config)) {
    return;
  }
}`,
    },
    {
      name: 'the emitted helper wins over emptyCheckFunctions, which only recognizes',
      code: `declare function isVacant(value: unknown): boolean;
function run(config: Record<string, unknown> | undefined) {
  if (!config) {
    return;
  }
}`,
      options: [
        {
          emptyCheckFunctions: ['isBlank'],
          emptyCheckFix: { name: 'isVacant' },
        },
      ],
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `declare function isVacant(value: unknown): boolean;
function run(config: Record<string, unknown> | undefined) {
  if (!config || isVacant(config)) {
    return;
  }
}`,
    },
    {
      name: 'an import path lands after the last import declaration',
      code: `import { a } from 'a';
import { b } from 'b';

function run(config: Record<string, unknown> | undefined) {
  if (!config) {
    return;
  }
}`,
      options: [
        {
          emptyCheckFix: {
            name: 'isEmpty',
            importPath: 'functions/src/util/isEmpty',
          },
        },
      ],
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `import { a } from 'a';
import { b } from 'b';
import { isEmpty } from 'functions/src/util/isEmpty';

function run(config: Record<string, unknown> | undefined) {
  if (!config || isEmpty(config)) {
    return;
  }
}`,
    },
    /**
     * A directive only counts as one while nothing precedes it, so an import
     * written above `'use client'` would strip the directive of its meaning.
     */
    {
      name: 'an inserted import lands below a use client directive',
      code: `'use client';

function run(config: Record<string, unknown> | undefined) {
  if (!config) {
    return;
  }
}`,
      options: [{ emptyCheckFix: { name: 'isEmpty', importPath: 'p' } }],
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `'use client';

import { isEmpty } from 'p';
function run(config: Record<string, unknown> | undefined) {
  if (!config || isEmpty(config)) {
    return;
  }
}`,
    },
    {
      name: 'an inserted import lands below the whole directive prologue',
      code: `'use client';
'use strict';

function run(config: Record<string, unknown> | undefined) {
  if (!config) {
    return;
  }
}`,
      options: [{ emptyCheckFix: { name: 'isEmpty', importPath: 'p' } }],
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `'use client';
'use strict';

import { isEmpty } from 'p';
function run(config: Record<string, unknown> | undefined) {
  if (!config || isEmpty(config)) {
    return;
  }
}`,
    },
    {
      name: 'an inserted import lands at the top when there is nothing to anchor to',
      code: `function run(config: Record<string, unknown> | undefined) {
  if (!config) {
    return;
  }
}`,
      options: [{ emptyCheckFix: { name: 'isEmpty', importPath: 'p' } }],
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `import { isEmpty } from 'p';
function run(config: Record<string, unknown> | undefined) {
  if (!config || isEmpty(config)) {
    return;
  }
}`,
    },
    {
      name: 'an inserted import lands below a leading comment',
      code: `// Copyright BluMint
function run(config: Record<string, unknown> | undefined) {
  if (!config) {
    return;
  }
}`,
      options: [{ emptyCheckFix: { name: 'isEmpty', importPath: 'p' } }],
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `// Copyright BluMint
import { isEmpty } from 'p';
function run(config: Record<string, unknown> | undefined) {
  if (!config || isEmpty(config)) {
    return;
  }
}`,
    },
    /** A shebang is only a shebang at offset 0. */
    {
      name: 'an inserted import leaves a shebang on line 1',
      code: `#!/usr/bin/env node
function run(config: Record<string, unknown> | undefined) {
  if (!config) {
    return;
  }
}`,
      options: [{ emptyCheckFix: { name: 'isEmpty', importPath: 'p' } }],
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `#!/usr/bin/env node
import { isEmpty } from 'p';
function run(config: Record<string, unknown> | undefined) {
  if (!config || isEmpty(config)) {
    return;
  }
}`,
    },
    {
      name: 'an inserted import clears both a shebang and a directive',
      code: `#!/usr/bin/env node
'use client';
function run(config: Record<string, unknown> | undefined) {
  if (!config) {
    return;
  }
}`,
      options: [{ emptyCheckFix: { name: 'isEmpty', importPath: 'p' } }],
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `#!/usr/bin/env node
'use client';
import { isEmpty } from 'p';
function run(config: Record<string, unknown> | undefined) {
  if (!config || isEmpty(config)) {
    return;
  }
}`,
    },
    /**
     * A comment that governs the line below it would come to govern the import
     * instead, so the anchor climbs above the whole run.
     */
    {
      name: 'an inserted import lands above a line-binding comment',
      code: `// @ts-expect-error legacy
function run(config: Record<string, unknown> | undefined) {
  if (!config) {
    return;
  }
}`,
      options: [{ emptyCheckFix: { name: 'isEmpty', importPath: 'p' } }],
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `import { isEmpty } from 'p';
// @ts-expect-error legacy
function run(config: Record<string, unknown> | undefined) {
  if (!config || isEmpty(config)) {
    return;
  }
}`,
    },
    {
      name: 'an existing import of the helper is not duplicated',
      code: `import { isEmpty } from 'p';

function run(config: Record<string, unknown> | undefined) {
  if (!config) {
    return;
  }
}`,
      options: [{ emptyCheckFix: { name: 'isEmpty', importPath: 'p' } }],
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `import { isEmpty } from 'p';

function run(config: Record<string, unknown> | undefined) {
  if (!config || isEmpty(config)) {
    return;
  }
}`,
    },
    /**
     * The name is already bound, so a second declaration of it would not
     * compile whatever module it came from. The call resolves to whatever the
     * file already imported, which is the consumer's own choice to review.
     */
    {
      name: 'the helper name imported from another path blocks the insertion',
      code: `import { isEmpty } from 'other';

function run(config: Record<string, unknown> | undefined) {
  if (!config) {
    return;
  }
}`,
      options: [{ emptyCheckFix: { name: 'isEmpty', importPath: 'p' } }],
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `import { isEmpty } from 'other';

function run(config: Record<string, unknown> | undefined) {
  if (!config || isEmpty(config)) {
    return;
  }
}`,
    },
    {
      name: 'a renamed import binding the helper name blocks the insertion',
      code: `import { thing as isEmpty } from 'other';
function run(config: Record<string, unknown> | undefined) {
  if (!config) {
    return;
  }
}`,
      options: [{ emptyCheckFix: { name: 'isEmpty', importPath: 'p' } }],
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `import { thing as isEmpty } from 'other';
function run(config: Record<string, unknown> | undefined) {
  if (!config || isEmpty(config)) {
    return;
  }
}`,
    },
    {
      name: 'a local function of the helper name blocks the insertion',
      code: `function isEmpty(value: unknown) {
  return !value;
}
function run(config: Record<string, unknown> | undefined) {
  if (!config) {
    return;
  }
}`,
      options: [{ emptyCheckFix: { name: 'isEmpty', importPath: 'p' } }],
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `function isEmpty(value: unknown) {
  return !value;
}
function run(config: Record<string, unknown> | undefined) {
  if (!config || isEmpty(config)) {
    return;
  }
}`,
    },
    {
      name: 'a destructured top-level binding of the helper name blocks the insertion',
      code: `const { isEmpty } = helpers;
function run(config: Record<string, unknown> | undefined) {
  if (!config) {
    return;
  }
}`,
      options: [{ emptyCheckFix: { name: 'isEmpty', importPath: 'p' } }],
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `const { isEmpty } = helpers;
function run(config: Record<string, unknown> | undefined) {
  if (!config || isEmpty(config)) {
    return;
  }
}`,
    },
    {
      name: 'an array-pattern binding of the helper name blocks the insertion',
      code: `const [isEmpty] = helpers;
function run(config: Record<string, unknown> | undefined) {
  if (!config) {
    return;
  }
}`,
      options: [{ emptyCheckFix: { name: 'isEmpty', importPath: 'p' } }],
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `const [isEmpty] = helpers;
function run(config: Record<string, unknown> | undefined) {
  if (!config || isEmpty(config)) {
    return;
  }
}`,
    },
    {
      name: 'an exported declaration of the helper name blocks the insertion',
      code: `export default function isEmpty(value: unknown) {
  return !value;
}
function run(config: Record<string, unknown> | undefined) {
  if (!config) {
    return;
  }
}`,
      options: [{ emptyCheckFix: { name: 'isEmpty', importPath: 'p' } }],
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `export default function isEmpty(value: unknown) {
  return !value;
}
function run(config: Record<string, unknown> | undefined) {
  if (!config || isEmpty(config)) {
    return;
  }
}`,
    },
    {
      name: 'an import-equals binding of the helper name blocks the insertion',
      code: `import isEmpty = require('other');
function run(config: Record<string, unknown> | undefined) {
  if (!config) {
    return;
  }
}`,
      options: [{ emptyCheckFix: { name: 'isEmpty', importPath: 'p' } }],
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `import isEmpty = require('other');
function run(config: Record<string, unknown> | undefined) {
  if (!config || isEmpty(config)) {
    return;
  }
}`,
    },
    /** A re-export binds nothing locally, so the name is still free. */
    {
      name: 'a star re-export of the helper name does not block the insertion',
      code: `export * as isEmpty from 'other';
function run(config: Record<string, unknown> | undefined) {
  if (!config) {
    return;
  }
}`,
      options: [{ emptyCheckFix: { name: 'isEmpty', importPath: 'p' } }],
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `import { isEmpty } from 'p';
export * as isEmpty from 'other';
function run(config: Record<string, unknown> | undefined) {
  if (!config || isEmpty(config)) {
    return;
  }
}`,
    },
    /**
     * A value import from the same path already has the braces, so the helper
     * joins them rather than opening a second declaration of one module.
     */
    {
      name: 'a value import from the same path gains the helper as a specifier',
      code: `import { other } from 'p';
function run(config: Record<string, unknown> | undefined) {
  if (!config) {
    return;
  }
}`,
      options: [{ emptyCheckFix: { name: 'isEmpty', importPath: 'p' } }],
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `import { other, isEmpty } from 'p';
function run(config: Record<string, unknown> | undefined) {
  if (!config || isEmpty(config)) {
    return;
  }
}`,
    },
    {
      name: 'a default-plus-named import from the same path gains the helper',
      code: `import thing, { other } from 'p';
function run(config: Record<string, unknown> | undefined) {
  if (!config) {
    return;
  }
}`,
      options: [{ emptyCheckFix: { name: 'isEmpty', importPath: 'p' } }],
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `import thing, { other, isEmpty } from 'p';
function run(config: Record<string, unknown> | undefined) {
  if (!config || isEmpty(config)) {
    return;
  }
}`,
    },
    /** A broken specifier list keeps one name per row, as Prettier prints it. */
    {
      name: 'a multi-line specifier list gains the helper on its own row',
      code: `import {
  other,
  another,
} from 'p';
function run(config: Record<string, unknown> | undefined) {
  if (!config) {
    return;
  }
}`,
      options: [{ emptyCheckFix: { name: 'isEmpty', importPath: 'p' } }],
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `import {
  other,
  another,
  isEmpty,
} from 'p';
function run(config: Record<string, unknown> | undefined) {
  if (!config || isEmpty(config)) {
    return;
  }
}`,
    },
    /**
     * A type-only import carries no value binding, so joining it would import
     * the helper as a type and leave the emitted call unresolved.
     */
    {
      name: 'a type-only import from the same path gets a separate declaration',
      code: `import type { Thing } from 'p';

function run(config: Record<string, unknown> | undefined) {
  if (!config) {
    return;
  }
}`,
      options: [{ emptyCheckFix: { name: 'isEmpty', importPath: 'p' } }],
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `import type { Thing } from 'p';
import { isEmpty } from 'p';

function run(config: Record<string, unknown> | undefined) {
  if (!config || isEmpty(config)) {
    return;
  }
}`,
    },
    {
      name: 'a namespace import from the same path gets a separate declaration',
      code: `import * as p from 'p';

function run(config: Record<string, unknown> | undefined) {
  if (!config) {
    return;
  }
}`,
      options: [{ emptyCheckFix: { name: 'isEmpty', importPath: 'p' } }],
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `import * as p from 'p';
import { isEmpty } from 'p';

function run(config: Record<string, unknown> | undefined) {
  if (!config || isEmpty(config)) {
    return;
  }
}`,
    },
    {
      name: 'a side-effect import from the same path gets a separate declaration',
      code: `import 'p';

function run(config: Record<string, unknown> | undefined) {
  if (!config) {
    return;
  }
}`,
      options: [{ emptyCheckFix: { name: 'isEmpty', importPath: 'p' } }],
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `import 'p';
import { isEmpty } from 'p';

function run(config: Record<string, unknown> | undefined) {
  if (!config || isEmpty(config)) {
    return;
  }
}`,
    },
    /**
     * ESM allows a declaration below the statement that uses its binding, so
     * the two edits arrive out of source order and must be sorted before ESLint
     * will merge them.
     */
    {
      name: 'an import anchored below the guard still merges with the rewrite',
      code: `function run(config: Record<string, unknown> | undefined) {
  if (!config) {
    return;
  }
}
import { a } from 'a';`,
      options: [{ emptyCheckFix: { name: 'isEmpty', importPath: 'p' } }],
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `function run(config: Record<string, unknown> | undefined) {
  if (!config || isEmpty(config)) {
    return;
  }
}
import { a } from 'a';
import { isEmpty } from 'p';`,
    },
    {
      name: 'a module specifier holding a quote is escaped',
      code: `function run(config: Record<string, unknown> | undefined) {
  if (!config) {
    return;
  }
}`,
      options: [
        { emptyCheckFix: { name: 'isEmpty', importPath: "it's/util" } },
      ],
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `import { isEmpty } from 'it\\'s/util';
function run(config: Record<string, unknown> | undefined) {
  if (!config || isEmpty(config)) {
    return;
  }
}`,
    },
    {
      name: 'the widened layout and the import insertion travel in one fix',
      code: `import { a } from 'a';

function userPreview(
  afterData: Record<string, unknown> | undefined,
  isPathIgnored: boolean,
  hasPermission: boolean,
) {
  if (!afterData && isPathIgnored && hasPermission && !!afterData.size) {
    return;
  }
  return afterData;
}`,
      options: [{ emptyCheckFix: { name: 'isEmpty', importPath: 'p' } }],
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'afterData' } },
      ],
      output: `import { a } from 'a';
import { isEmpty } from 'p';

function userPreview(
  afterData: Record<string, unknown> | undefined,
  isPathIgnored: boolean,
  hasPermission: boolean,
) {
  if (
    (!afterData || isEmpty(afterData)) &&
    isPathIgnored &&
    hasPermission &&
    !!afterData.size
  ) {
    return;
  }
  return afterData;
}`,
    },
    /**
     * Two reports, one import: the second guard is left for the next pass
     * because both fixes would carry the same insertion, and ESLint applies
     * only the first of two overlapping ones. The pass after this one finds the
     * binding present and rewrites every remaining guard minimally, so a helper
     * call can never be emitted into a file that does not import it.
     */
    {
      name: 'two guards in one file insert the import once',
      code: `function run(
  config: Record<string, unknown> | undefined,
  payload: Record<string, unknown> | undefined,
) {
  if (!config) {
    return;
  }
  if (!payload) {
    return;
  }
}`,
      options: [{ emptyCheckFix: { name: 'isEmpty', importPath: 'p' } }],
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
        { messageId: 'missingEmptyObjectCheck', data: { name: 'payload' } },
      ],
      output: `import { isEmpty } from 'p';
function run(
  config: Record<string, unknown> | undefined,
  payload: Record<string, unknown> | undefined,
) {
  if (!config || isEmpty(config)) {
    return;
  }
  if (!payload) {
    return;
  }
}`,
    },
    {
      name: 'two guards without an import path are both rewritten in one pass',
      code: `declare function isEmpty(value: unknown): boolean;
function run(
  config: Record<string, unknown> | undefined,
  payload: Record<string, unknown> | undefined,
) {
  if (!config) {
    return;
  }
  if (!payload) {
    return;
  }
}`,
      options: [{ emptyCheckFix: { name: 'isEmpty' } }],
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
        { messageId: 'missingEmptyObjectCheck', data: { name: 'payload' } },
      ],
      output: `declare function isEmpty(value: unknown): boolean;
function run(
  config: Record<string, unknown> | undefined,
  payload: Record<string, unknown> | undefined,
) {
  if (!config || isEmpty(config)) {
    return;
  }
  if (!payload || isEmpty(payload)) {
    return;
  }
}`,
    },
    /**
     * The helper's LENGTH is a layout input. `isEmpty(config)` is 18 columns
     * shorter than the `Object.keys` clause, which is enough to keep this
     * header inside the print width — so the same source takes the widened path
     * unconfigured and the minimal one with the helper. The pair is written as
     * two cases so the divergence is pinned from both sides.
     */
    {
      name: 'a short helper keeps a header that the default emission breaks',
      code: `declare function isEmpty(value: unknown): boolean;
function run(
  config: Record<string, unknown> | undefined,
  isPathIgnored: boolean,
  hasPermission: boolean,
) {
  if (!config && isPathIgnored && hasPermission) {
    return;
  }
}`,
      options: [{ emptyCheckFix: { name: 'isEmpty' } }],
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `declare function isEmpty(value: unknown): boolean;
function run(
  config: Record<string, unknown> | undefined,
  isPathIgnored: boolean,
  hasPermission: boolean,
) {
  if ((!config || isEmpty(config)) && isPathIgnored && hasPermission) {
    return;
  }
}`,
    },
    {
      name: 'the same header breaks under the unconfigured default emission',
      code: `function run(
  config: Record<string, unknown> | undefined,
  isPathIgnored: boolean,
  hasPermission: boolean,
) {
  if (!config && isPathIgnored && hasPermission) {
    return;
  }
}`,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `function run(
  config: Record<string, unknown> | undefined,
  isPathIgnored: boolean,
  hasPermission: boolean,
) {
  if (
    (!config || Object.keys(config).length === 0) &&
    isPathIgnored &&
    hasPermission
  ) {
    return;
  }
}`,
    },
    {
      name: 'a long helper breaks a header the default emission keeps',
      code: `declare function isEmptyRecordAccordingToOurHelpers(v: unknown): boolean;
function run(config: Record<string, unknown> | undefined, isPathIgnored: boolean) {
  if (!config && isPathIgnored) {
    return;
  }
}`,
      options: [
        { emptyCheckFix: { name: 'isEmptyRecordAccordingToOurHelpers' } },
      ],
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `declare function isEmptyRecordAccordingToOurHelpers(v: unknown): boolean;
function run(config: Record<string, unknown> | undefined, isPathIgnored: boolean) {
  if (
    (!config || isEmptyRecordAccordingToOurHelpers(config)) &&
    isPathIgnored
  ) {
    return;
  }
}`,
    },
    {
      name: 'the same header stays on one line under the unconfigured default',
      code: `function run(config: Record<string, unknown> | undefined, isPathIgnored: boolean) {
  if (!config && isPathIgnored) {
    return;
  }
}`,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `function run(config: Record<string, unknown> | undefined, isPathIgnored: boolean) {
  if ((!config || Object.keys(config).length === 0) && isPathIgnored) {
    return;
  }
}`,
    },
    /**
     * A narrowed `printWidth` reaches the helper too: the emitted clause fits
     * the re-laid rows the default clause overflows, so the same width takes
     * the widened path with the helper and declines without it.
     */
    {
      name: 'a narrowed printWidth breaks the header around the helper',
      code: `declare function isEmpty(value: unknown): boolean;
function run(config: Record<string, unknown> | undefined, ready: boolean) {
  if (!config && ready) {
    return;
  }
}`,
      options: [{ emptyCheckFix: { name: 'isEmpty' }, printWidth: 40 }],
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `declare function isEmpty(value: unknown): boolean;
function run(config: Record<string, unknown> | undefined, ready: boolean) {
  if (
    (!config || isEmpty(config)) &&
    ready
  ) {
    return;
  }
}`,
    },
    {
      name: 'the same narrowed printWidth declines the default emission',
      code: `function run(config: Record<string, unknown> | undefined, ready: boolean) {
  if (!config && ready) {
    return;
  }
}`,
      options: [{ printWidth: 40 }],
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `function run(config: Record<string, unknown> | undefined, ready: boolean) {
  if ((!config || Object.keys(config).length === 0) && ready) {
    return;
  }
}`,
    },
    {
      name: 'a while head takes the helper',
      code: `declare function isEmpty(value: unknown): boolean;
declare function load(): Record<string, unknown> | undefined;
function run(config: Record<string, unknown> | undefined) {
  while (!config) {
    config = load();
  }
}`,
      options: [{ emptyCheckFix: { name: 'isEmpty' } }],
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `declare function isEmpty(value: unknown): boolean;
declare function load(): Record<string, unknown> | undefined;
function run(config: Record<string, unknown> | undefined) {
  while (!config || isEmpty(config)) {
    config = load();
  }
}`,
    },
    {
      name: 'a ternary test takes the helper and the import',
      code: `const config: Record<string, unknown> | undefined = load();
const value = !config ? fallback() : config;`,
      options: [{ emptyCheckFix: { name: 'isEmpty', importPath: 'p' } }],
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `import { isEmpty } from 'p';
const config: Record<string, unknown> | undefined = load();
const value = !config || isEmpty(config) ? fallback() : config;`,
    },
    /**
     * A bare call resolves where the CALL sits, so a binding of the helper's
     * name between the report and the module scope would silently take the
     * call over. The report stands and the fix is declined, which is the one
     * outcome that cannot rewrite the guard into something else (#1455, #1456).
     */
    {
      name: 'a helper shadowed in the enclosing function declines the fix',
      code: `import { isEmpty } from 'p';
function run(config: Record<string, unknown> | undefined) {
  const isEmpty = 1;
  if (!config) {
    return isEmpty;
  }
}`,
      options: [{ emptyCheckFix: { name: 'isEmpty', importPath: 'p' } }],
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: null,
    },
    {
      name: 'a helper shadowed in a nested block declines the fix',
      code: `declare function isEmpty(value: unknown): boolean;
function run(config: Record<string, unknown> | undefined) {
  {
    const isEmpty = 1;
    if (!config) {
      return isEmpty;
    }
  }
}`,
      options: [{ emptyCheckFix: { name: 'isEmpty' } }],
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: null,
    },
    {
      name: 'a parameter shadowing the helper declines the fix',
      code: `declare function isEmpty(value: unknown): boolean;
function run(config: Record<string, unknown> | undefined, isEmpty: number) {
  if (!config) {
    return isEmpty;
  }
}`,
      options: [{ emptyCheckFix: { name: 'isEmpty' } }],
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: null,
    },
    {
      name: 'a module-level binding of the helper name is not a shadow',
      code: `declare function isEmpty(value: unknown): boolean;
function run(config: Record<string, unknown> | undefined) {
  if (!config) {
    return;
  }
}`,
      options: [{ emptyCheckFix: { name: 'isEmpty' } }],
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `declare function isEmpty(value: unknown): boolean;
function run(config: Record<string, unknown> | undefined) {
  if (!config || isEmpty(config)) {
    return;
  }
}`,
    },
    /** The shadow check is scoped to the helper: `Object` is a global. */
    {
      name: 'a shadow of the helper name leaves the unconfigured default alone',
      code: `function run(config: Record<string, unknown> | undefined) {
  const isEmpty = 1;
  if (!config) {
    return isEmpty;
  }
}`,
      errors: [
        { messageId: 'missingEmptyObjectCheck', data: { name: 'config' } },
      ],
      output: `function run(config: Record<string, unknown> | undefined) {
  const isEmpty = 1;
  if (!config || Object.keys(config).length === 0) {
    return isEmpty;
  }
}`,
    },
  ],
});

/**
 * Schema rejection, read through ESLint's OWN compiled validator rather than a
 * bare `Linter`, which hands rule options straight through without screening
 * them. A malformed `emptyCheckFix` has to fail at CONFIG time: reaching the
 * fixer, it would emit a call no consumer can resolve.
 */
describe('enforce-empty-object-check emptyCheckFix schema', () => {
  const screen = payloadScreenFor(enforceEmptyObjectCheck);

  const accepts = (options: unknown): boolean => {
    if (!screen) {
      throw new Error('the rule declares no option schema to screen against');
    }
    return screen([options]);
  };

  it("compiles a screen from the rule's own schema", () => {
    expect(screen).not.toBeNull();
  });

  it.each([
    ['no name at all', { emptyCheckFix: {} }],
    ['an import path but no name', { emptyCheckFix: { importPath: 'p' } }],
    ['a non-string name', { emptyCheckFix: { name: 42 } }],
    [
      'a non-string import path',
      { emptyCheckFix: { name: 'isEmpty', importPath: 3 } },
    ],
    [
      'an unknown extra property',
      { emptyCheckFix: { name: 'isEmpty', extra: true } },
    ],
    ['a bare string instead of an object', { emptyCheckFix: 'isEmpty' }],
    ['an empty name', { emptyCheckFix: { name: '' } }],
    [
      'an empty import path',
      { emptyCheckFix: { name: 'isEmpty', importPath: '' } },
    ],
    /**
     * A name that is not an identifier could not be recognized as the emptiness
     * check it emits, so `--fix` would report its own output forever.
     */
    [
      'a name that is not an identifier',
      { emptyCheckFix: { name: 'is Empty' } },
    ],
    ['a member-access name', { emptyCheckFix: { name: '_.isEmpty' } }],
    ['a name opening with a digit', { emptyCheckFix: { name: '1isEmpty' } }],
  ])('rejects %s', (_label, options) => {
    expect(accepts(options)).toBe(false);
  });

  it.each([
    ['a bare helper name', { emptyCheckFix: { name: 'isEmpty' } }],
    [
      'a helper name with an import path',
      { emptyCheckFix: { name: 'isEmpty', importPath: 'functions/src/util' } },
    ],
    ['an identifier using $ and _', { emptyCheckFix: { name: '$_isEmpty2' } }],
    ['the option left out entirely', {}],
  ])('accepts %s', (_label, options) => {
    expect(accepts(options)).toBe(true);
  });
});
