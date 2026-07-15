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
      errors: [
        {
          messageId: 'redundantInstanceArg',
          data: {
            methodName: 'execute',
            memberText: 'this.config',
            parameterNote: ' (parameter "cfg")',
          },
        },
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
  ],
});
