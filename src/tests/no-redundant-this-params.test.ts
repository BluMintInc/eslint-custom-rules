import { noRedundantThisParams } from '../rules/no-redundant-this-params';
import { ruleTesterTs } from '../utils/ruleTester';

ruleTesterTs.run('no-redundant-this-params', noRedundantThisParams, {
  valid: [
    `
    class Service {
      process(value: number) {
        return value * 2;
      }

      run() {
        return this.process(10);
      }
    }
    `,
    `
    class Child extends BaseService {
      private config!: Config;

      run() {
        return super.handle(this.config);
      }
    }
    `,
    `
    class ExternalConsumer {
      private readonly config!: Config;

      execute() {
        return externalLib.process(this.config);
      }
    }
    `,
    `
    class Parent {
      protected build(cfg: Config) {
        return cfg;
      }
    }

    class Child extends Parent {
      private readonly config!: Config;

      run() {
        // Method is inherited; rule should not flag
        return this.build(this.config);
      }
    }
    `,
    `
    class Mapper {
      private readonly validator!: Validator;

      process(items: string[]) {
        return items.map((item) => this.transform(item, this.validator));
      }

      private transform(item: string, validator: Validator) {
        return validator.validate(item);
      }
    }
    `,
    `
    class DynamicLookup {
      private fetch(key: string) {
        return key;
      }

      read(key: string) {
        return this.fetch(this[key]);
      }
    }
    `,
    `
    class Example {
      static format(value: string) {
        return value.trim();
      }

      private name = 'test';

      output() {
        return Example.format(this.name);
      }
    }
    `,
    `
    class NestedCallbacks {
      private config!: Config;

      run(items: number[]) {
        return items.reduce((acc, item) => {
          return acc + this.calculate(item, this.config);
        }, 0);
      }

      private calculate(value: number, config: Config) {
        return value + config.offset;
      }
    }
    `,
    `
    class OtherArg {
      private value = 1;

      compute(extra: number) {
        return this.calculate(extra);
      }

      private calculate(extra: number) {
        return this.value + extra;
      }
    }
    `,
    `
    class ComputedMember {
      private getField(key: keyof this) {
        return this[key];
      }

      run(key: keyof this) {
        return this.getField(this[key]);
      }
    }
    `,
    `
    class BrandCheck {
      #secret = 1;

      private use(result: boolean) {
        return result;
      }

      verify(target: object) {
        return this.use(#secret in target);
      }
    }
    `,
    `
    class ApiClient {
      constructor(
        private readonly apiKey: string,
        private readonly baseUrl: string,
      ) {}

      private request(options: { url: string; headers: Record<string, string> }) {
        return options;
      }

      fetch(endpoint: string) {
        return this.request({
          url: \`\${this.baseUrl}\${endpoint}\`,
          headers: {
            Authorization: \`Bearer \${this.apiKey}\`,
          },
        });
      }
    }
    `,
    `
    class Transformer {
      private config!: Config;

      private consume(payload: string) {
        return payload.length;
      }

      run() {
        return this.consume(JSON.stringify(this.config));
      }
    }
    `,
    `
    class PropagationStrategizerBase {
      private beforeSource: any;
      private afterSource: any;

      private resolveTargetsForSource(source: any) {
        if (!source) return [];
        // ... logic processing the source ...
        return [];
      }

      public initialize() {
        const beforeTargets = this.resolveTargetsForSource(this.beforeSource);
        const afterTargets = this.resolveTargetsForSource(this.afterSource);
      }
    }
    `,
    `
    class MixedUsage {
      private value = 1;
      private helper(val: any) { return val; }
      run() {
        this.helper(this.value);
        this.helper(123);
      }
    }
    `,
    // Getter-returned external function: `callback` is a `get` accessor forwarding a
    // constructor-injected function. Calling `this.callback(this.event)` invokes the
    // getter's RETURN VALUE, not a class method — the external function cannot read
    // `this.event` off the orchestrator's `this`, so the argument is mandatory.
    `
type Handler = (event: unknown) => Promise<void>;
class DebounceOrchestrator {
  constructor(
    private readonly props: { event: unknown; callback: Handler },
  ) {}
  public async orchestrate() {
    await this.callback(this.event);
  }
  private get callback() {
    return this.props.callback;
  }
  private get event() {
    return this.props.event;
  }
}
`,
    // Public getter returning a locally-built function still invokes the return value,
    // never the accessor with arguments — passing instance state remains correct.
    `
    class Dispatcher {
      private target = 'x';
      get send() {
        return (payload: string) => payload;
      }
      run() {
        return this.send(this.target);
      }
    }
    `,
    // A getter with a matching setter (accessor pair) must not be registered as a
    // callable method under either kind; invoking the getter's return value is fine.
    `
    class Store {
      private _run: (v: number) => number = (v) => v;
      private value = 1;
      get run() {
        return this._run;
      }
      set run(fn: (v: number) => number) {
        this._run = fn;
      }
      execute() {
        return this.run(this.value);
      }
    }
    `,
    // Set-accessor-only member: the setter is never a direct callable, so a call whose
    // callee syntactically matches its name must not be flagged.
    `
    class Sink {
      private value = 1;
      set write(fn: (v: number) => number) {
        this.handler = fn;
      }
      private handler: (v: number) => number = (v) => v;
      run() {
        return this.write(this.value);
      }
    }
    `,
    // Issue #1309: a protected method on an abstract base class whose polymorphic
    // parameter receives DIFFERENT instance members across the base and a subclass.
    // The parameter cannot be inlined to a single `this.<member>`, so the rule must
    // not report. The subclass call site (this.beforeSource) is outside the declaring
    // class body — in production it lives in another file, making the base call site
    // the only one the single-file rule can enumerate.
    `
    abstract class Base {
      protected abstract get beforeSource(): string;
      protected abstract get afterSource(): string;

      protected transform(sourceLocated: string, targetRef: string) {
        return \`\${sourceLocated}:\${targetRef}\`;
      }

      protected buildAfter(targetRef: string) {
        return this.transform(this.afterSource, targetRef);
      }
    }

    class Derived extends Base {
      protected get beforeSource() { return 'b'; }
      protected get afterSource() { return 'a'; }

      protected buildBefore(targetRef: string) {
        return this.transform(this.beforeSource, targetRef);
      }
    }
    `,
    // A protected abstract method on an abstract class: subclasses in other files may
    // call it with a different member, so the single visible base call site cannot
    // prove redundancy. (Formerly an invalid case; corrected by #1309.)
    `
    abstract class BaseProcessor {
      constructor(protected readonly config: Config) {}

      process() {
        return this.execute(this.config);
      }

      protected abstract execute(cfg: Config): Result;
    }

    class ConcreteProcessor extends BaseProcessor {
      protected execute(cfg: Config): Result {
        return { value: cfg.value };
      }
    }
    `,
    // A public method on an exported class is reachable from subclasses in other
    // files; the rule cannot enumerate those call sites, so it must not report.
    `
    export class Widget {
      private x = 1;

      compute() {
        return this.helper(this.x);
      }

      helper(value: number) {
        return value;
      }
    }
    `,
    // Exported abstract class with a protected method: externally reachable, so no report.
    `
    export abstract class Pipeline {
      protected stage = 'a';

      run() {
        return this.process(this.stage);
      }

      protected process(name: string) {
        return name;
      }
    }
    `,
    // `export default` (non-abstract) class exposes its public method to subclasses elsewhere.
    `
    export default class Router {
      private route = '/';

      dispatch() {
        return this.navigate(this.route);
      }

      navigate(path: string) {
        return path;
      }
    }
    `,
    // `export const X = class { ... }` is just as reachable as an exported declaration.
    `
    export const Handler = class {
      private target = 'x';

      run() {
        return this.send(this.target);
      }

      protected send(value: string) {
        return value;
      }
    };
    `,
    // A class exported by a trailing `export { Foo }` statement is reachable from
    // subclasses in other files just as an inline `export class` is.
    `
    class TrailingExport {
      private target = 'x';

      run() {
        return this.send(this.target);
      }

      send(value: string) {
        return value;
      }
    }

    export { TrailingExport };
    `,
    // Renamed trailing export (`export { Foo as Bar }`) still exposes the class.
    `
    class RenamedExport {
      protected stage = 'a';

      run() {
        return this.process(this.stage);
      }

      protected process(name: string) {
        return name;
      }
    }

    export { RenamedExport as PublicName };
    `,
    // `export default Foo` referencing an earlier declaration exposes the class.
    `
    class DefaultExported {
      private route = '/';

      dispatch() {
        return this.navigate(this.route);
      }

      navigate(path: string) {
        return path;
      }
    }

    export default DefaultExported;
    `,
    // `const Foo = class {}` exported by a later `export { Foo }` is reachable too.
    `
    const DeferredClassExpr = class {
      private target = 'x';

      run() {
        return this.send(this.target);
      }

      protected send(value: string) {
        return value;
      }
    };

    export { DeferredClassExpr };
    `,
  ],
  invalid: [
    {
      code: `
      class Example {
        private value = 1;

        private useValue(value: number) {
          return value * 2;
        }

        run() {
          return this.useValue(this.value);
        }
      }
      `,
      errors: [{ messageId: 'redundantInstanceArg' }],
    },
    {
      code: `
      class Processor {
        constructor(private readonly event: Event) {}

        process() {
          return this.handle(this.event);
        }

        private handle(e: Event) {
          return e.type;
        }
      }
      `,
      errors: [{ messageId: 'redundantInstanceArg' }],
    },
    {
      code: `
      class Tracker {
        private _id = 'id';

        get id() {
          return this._id;
        }

        private track(userId: string) {
          return userId;
        }

        log() {
          return this.track(this.id);
        }
      }
      `,
      errors: [{ messageId: 'redundantInstanceArg' }],
    },
    {
      code: `
      class Calculator {
        private readonly config!: Config;
        private readonly multiplier = 2;

        private process(cfg: Config, value: number, factor: number) {
          return value * factor;
        }

        compute(value: number) {
          return this.process(this.config, value, this.multiplier);
        }
      }
      `,
      errors: [
        { messageId: 'redundantInstanceArg' },
        { messageId: 'redundantInstanceArg' },
      ],
    },
    {
      code: `
      class Service {
        private cfg: Config;

        constructor(cfg: Config) {
          this.cfg = cfg;
          this.initialize(this.cfg);
        }

        private initialize(config: Config) {
          return config;
        }
      }
      `,
      errors: [{ messageId: 'redundantInstanceArg' }],
    },
    {
      code: `
      class MaybeHandler {
        private value = 1;
        private handler?(value: number): void;

        run() {
          this.handler?.(this.value);
        }
      }
      `,
      errors: [{ messageId: 'redundantInstanceArg' }],
    },
    {
      code: `
      class TaskRunner {
        private data!: Data;
        private runTask = (payload: Data) => payload;

        execute() {
          return this.runTask(this.data);
        }
      }
      `,
      errors: [{ messageId: 'redundantInstanceArg' }],
    },
    {
      code: `
      class DynamicKeys {
        private key = 'id';

        private send(payload: Record<string, unknown>) {
          return payload;
        }

        run() {
          return this.send({
            [this.key]: 1,
          });
        }
      }
      `,
      errors: [{ messageId: 'redundantInstanceValueInObject' }],
    },
    {
      code: `
      class SubProperty {
        private config = { value: 1 };

        private consume(input: number) {
          return input;
        }

        run() {
          return this.consume(this.config.value);
        }
      }
      `,
      errors: [{ messageId: 'redundantInstanceArg' }],
    },
    {
      code: `
      class ParenthesizedMember {
        private config = { value: 1 };

        private consume(input: number) {
          return input + 1;
        }

        run() {
          return this.consume((this.config).value);
        }
      }
      `,
      errors: [{ messageId: 'redundantInstanceArg' }],
    },
    {
      code: `
      type Config = { value: number };

      class AsExpressionMemberChain {
        private config: Config = { value: 1 };

        private consume(input: number) {
          return input + 1;
        }

        run() {
          return this.consume((this.config as Config).value);
        }
      }
      `,
      errors: [{ messageId: 'redundantInstanceArg' }],
    },
    {
      code: `
      class NonNullMemberChain {
        private config?: { value: number } = { value: 1 };

        private consume(input: number) {
          return input + 1;
        }

        run() {
          return this.consume(this.config!.value);
        }
      }
      `,
      errors: [{ messageId: 'redundantInstanceArg' }],
    },
    {
      code: `
      class InstantiationExpression {
        private factory<T>(): T {
          return null as any as T;
        }

        private useFactory(factory: unknown) {
          return factory;
        }

        run() {
          return this.useFactory(this.factory<string>);
        }
      }
      `,
      errors: [{ messageId: 'redundantInstanceArg' }],
    },
    {
      code: `
      class PropertyInitializerCall {
        private value = 1;

        private useValue(value: number) {
          return value * 2;
        }

        private result = this.useValue(this.value);
      }
      `,
      errors: [{ messageId: 'redundantInstanceArg' }],
    },
    {
      code: `
      class Reporter {
        private ids: string[] = [];

        private publish(batch: string[][]) {
          return batch;
        }

        flush() {
          return this.publish([this.ids]);
        }
      }
      `,
      errors: [{ messageId: 'redundantInstanceValueInObject' }],
    },
    {
      code: `
      class Queue {
        private items: string[] = [];

        private enqueue(...items: string[]) {
          return items.length;
        }

        push() {
          return this.enqueue(...this.items);
        }
      }
      `,
      errors: [{ messageId: 'redundantInstanceArg' }],
    },
    {
      code: `
      class PrivateFieldExample {
        #token = 'abc';

        private consume(token: string) {
          return token.length;
        }

        run() {
          return this.consume(this.#token);
        }
      }
      `,
      errors: [{ messageId: 'redundantInstanceArg' }],
    },
    {
      code: `
      class MixedMethodShapes {
        private value = 1;

        process(value: number) {
          return value;
        }

        static process(value: number) {
          return value * 2;
        }

        run() {
          return this.process(this.value);
        }
      }
      `,
      errors: [{ messageId: 'redundantInstanceArg' }],
    },
    // Export does not hide a `private` method: it is never inherited, so its call
    // sites are provably confined to the declaring class body and remain reportable.
    {
      code: `
      export class ExportedWithPrivate {
        private value = 1;

        run() {
          return this.useValue(this.value);
        }

        private useValue(value: number) {
          return value * 2;
        }
      }
      `,
      errors: [{ messageId: 'redundantInstanceArg' }],
    },
    // An abstract class does not hide a `private` method either — private members
    // cannot be threaded differently by a subclass.
    {
      code: `
      abstract class AbstractWithPrivate {
        private value = 1;

        run() {
          return this.useValue(this.value);
        }

        private useValue(value: number) {
          return value * 2;
        }
      }
      `,
      errors: [{ messageId: 'redundantInstanceArg' }],
    },
    // A `#private` method is inaccessible to subclasses, so an exported class does
    // not make it externally reachable.
    {
      code: `
      export class ExportedWithBrandPrivate {
        value = 1;

        run() {
          return this.#consume(this.value);
        }

        #consume(value: number) {
          return value * 2;
        }
      }
      `,
      errors: [{ messageId: 'redundantInstanceArg' }],
    },
    // A protected method on a plain (non-exported, non-abstract) class cannot be
    // subclassed from another file, so its visible call sites are exhaustive.
    {
      code: `
      class LocalOnly {
        private cfg = { value: 1 };

        run() {
          return this.handle(this.cfg);
        }

        protected handle(config: { value: number }) {
          return config.value;
        }
      }
      `,
      errors: [{ messageId: 'redundantInstanceArg' }],
    },
    // Export detection is name-precise: a class that is NOT itself exported still
    // reports even when an unrelated binding is exported from the same file.
    {
      code: `
      const helperValue = 1;
      export { helperValue };

      class NotExported {
        private cfg = { value: 1 };

        run() {
          return this.handle(this.cfg);
        }

        protected handle(config: { value: number }) {
          return config.value;
        }
      }
      `,
      errors: [{ messageId: 'redundantInstanceArg' }],
    },
  ],
});
