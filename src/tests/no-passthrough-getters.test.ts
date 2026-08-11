import { noPassthroughGetters } from '../rules/no-passthrough-getters';
import { ruleTesterTs } from '../utils/ruleTester';

const error = (getterName: string, propertyPath: string) => ({
  messageId: 'noPassthroughGetter' as const,
  data: { getterName, propertyPath },
});

ruleTesterTs.run('no-passthrough-getters', noPassthroughGetters, {
  valid: [
    // Getters that do more than just return a property
    `
    export class MatchAdmin {
      constructor(private readonly settings: MatchAdminProps) {}

      // Getter with calculation
      private get calculatedResults() {
        return this.settings.otherResults.filter(result => result.isValid);
      }

      // Getter with conditional logic
      private get userStatus() {
        return this.settings.isActive ? 'active' : 'inactive';
      }
    }
    `,

    // Getters with decorators (like @Memoize)
    `
    export class MatchAdmin {
      constructor(private readonly settings: MatchAdminProps) {}

      @Memoize()
      private get otherResults() {
        return this.settings.otherResults;
      }
    }
    `,

    // Getters with multiple decorators
    `
    export class MatchAdmin {
      constructor(private readonly settings: MatchAdminProps) {}

      @Memoize()
      @Cache()
      private get otherResults() {
        return this.settings.otherResults;
      }
    }
    `,

    // Getters with different decorator types
    `
    export class MatchAdmin {
      constructor(private readonly settings: MatchAdminProps) {}

      @computed
      private get computedValue() {
        return this.settings.value;
      }

      @observable
      private get observableValue() {
        return this.settings.data;
      }
    }
    `,

    // Getters that handle null/undefined values with logical OR
    `
    export class MatchAdmin {
      constructor(private readonly settings: MatchAdminProps) {}

      private get otherResults() {
        return this.settings.otherResults || [];
      }
    }
    `,

    // Getters that handle null/undefined values with nullish coalescing
    `
    export class MatchAdmin {
      constructor(private readonly settings: MatchAdminProps) {}

      private get otherResults() {
        return this.settings.otherResults ?? [];
      }
    }
    `,

    // Getters with optional chaining
    `
    export class MatchAdmin {
      constructor(private readonly settings: MatchAdminProps) {}

      private get optionalValue() {
        return this.settings?.optionalProperty;
      }
    }
    `,

    // Getters with conditional expressions (ternary)
    `
    export class MatchAdmin {
      constructor(private readonly settings: MatchAdminProps) {}

      private get conditionalValue() {
        return this.settings.condition ? this.settings.trueValue : this.settings.falseValue;
      }
    }
    `,

    // Getters that use super
    `
    export class ChildAdmin extends BaseAdmin {
      // This getter provides access to a parent class property
      private get parentProperty() {
        return super.parentProperty;
      }
    }
    `,

    // Getters with nested super calls
    `
    export class ChildAdmin extends BaseAdmin {
      private get nestedSuperProperty() {
        return super.parent.property;
      }
    }
    `,

    // Getters with type refinement using 'as'
    `
    export class MatchAdmin {
      constructor(private readonly settings: MatchAdminProps) {}

      private get typedResults(): ValidResult[] {
        return this.settings.otherResults as ValidResult[];
      }
    }
    `,

    // Getters with type assertions using angle brackets
    `
    export class MatchAdmin {
      constructor(private readonly settings: MatchAdminProps) {}

      private get typedResults(): ValidResult[] {
        return <ValidResult[]>this.settings.otherResults;
      }
    }
    `,

    // Getters with complex type assertions
    `
    export class MatchAdmin {
      constructor(private readonly settings: MatchAdminProps) {}

      private get complexTyped() {
        return (this.settings.data as ComplexType).property as string;
      }
    }
    `,

    // Non-getter methods
    `
    export class MatchAdmin {
      constructor(private readonly settings: MatchAdminProps) {}

      private getResults() {
        return this.settings.otherResults;
      }
    }
    `,

    // Getters that call functions
    `
    export class MatchAdmin {
      constructor(private readonly settings: MatchAdminProps) {}

      private get processedResults() {
        return this.settings.otherResults.map(x => x);
      }
    }
    `,

    // Getters that access array elements (should be flagged as passthrough)
    // This test case should be moved to invalid section

    // Getters with template literals
    `
    export class MatchAdmin {
      constructor(private readonly settings: MatchAdminProps) {}

      private get formattedId() {
        return \`id-\${this.settings.uid}\`;
      }
    }
    `,

    // Getters that return new instances
    `
    export class MatchAdmin {
      constructor(private readonly settings: MatchAdminProps) {}

      private get newInstance() {
        return new SomeClass(this.settings.data);
      }
    }
    `,

    // Getters with try-catch blocks
    `
    export class MatchAdmin {
      constructor(private readonly settings: MatchAdminProps) {}

      private get safeValue() {
        try {
          return this.settings.riskyProperty;
        } catch {
          return null;
        }
      }
    }
    `,

    // Getters that access static properties
    `
    export class MatchAdmin {
      constructor(private readonly settings: MatchAdminProps) {}

      private get staticValue() {
        return SomeClass.staticProperty;
      }
    }
    `,

    // Getters that access properties from other constructor parameters (should be flagged as passthrough)
    // This test case should be moved to invalid section

    // Getters with destructuring
    `
    export class MatchAdmin {
      constructor(private readonly settings: MatchAdminProps) {}

      private get destructuredValue() {
        const { value } = this.settings;
        return value;
      }
    }
    `,

    // Getters with complex logical expressions
    `
    export class MatchAdmin {
      constructor(private readonly settings: MatchAdminProps) {}

      private get complexLogic() {
        return this.settings.a && this.settings.b || this.settings.c;
      }
    }
    `,

    // Getters that access properties with computed property names
    `
    export class MatchAdmin {
      constructor(private readonly settings: MatchAdminProps) {}

      private get computedProperty() {
        return this.settings[this.getPropertyName()];
      }
    }
    `,

    // Getters with multiple statements
    `
    export class MatchAdmin {
      constructor(private readonly settings: MatchAdminProps) {}

      private get multiStatement() {
        const temp = this.settings.value;
        return temp;
      }
    }
    `,

    // Getters with no return statement
    `
    export class MatchAdmin {
      constructor(private readonly settings: MatchAdminProps) {}

      private get noReturn() {
        console.log('side effect');
      }
    }
    `,

    // Empty getter bodies
    `
    export class MatchAdmin {
      constructor(private readonly settings: MatchAdminProps) {}

      private get empty() {}
    }
    `,

    // Getters that return undefined explicitly
    `
    export class MatchAdmin {
      constructor(private readonly settings: MatchAdminProps) {}

      private get explicitUndefined() {
        return undefined;
      }
    }
    `,

    // Getters that return literals
    `
    export class MatchAdmin {
      constructor(private readonly settings: MatchAdminProps) {}

      private get literalValue() {
        return 'constant';
      }
    }
    `,

    // Static getters (should not be flagged as they don't access constructor parameters)
    `
    export class MatchAdmin {
      static get staticGetter() {
        return SomeClass.staticProperty;
      }
    }
    `,

    // Static getters accessing static properties
    `
    export class MatchAdmin {
      private static readonly staticSettings = { value: 'test' };

      static get staticPassthrough() {
        return MatchAdmin.staticSettings.value;
      }
    }
    `,

    // Getters in abstract classes
    `
    export abstract class AbstractAdmin {
      constructor(protected readonly settings: MatchAdminProps) {}

      protected get abstractValue() {
        return this.settings.value.transform();
      }
    }
    `,

    // Getters with JSDoc comments
    `
    export class MatchAdmin {
      constructor(private readonly settings: MatchAdminProps) {}

      /**
       * Gets the processed results
       */
      private get documentedGetter() {
        return this.settings.otherResults.filter(x => x.valid);
      }
    }
    `,

    // Getters in nested classes
    `
    export class OuterClass {
      constructor(private readonly settings: OuterProps) {}

      createInner() {
        return new class InnerClass {
          constructor(private readonly innerSettings: InnerProps) {}

          get innerValue() {
            return this.innerSettings.value.process();
          }
        }(this.settings.innerProps);
      }
    }
    `,

    // Getters that access deeply nested properties with computation
    `
    export class MatchAdmin {
      constructor(private readonly settings: MatchAdminProps) {}

      private get deeplyNested() {
        return this.settings.nested.deep.property.getValue();
      }
    }
    `,

    // Getters with logical AND expressions
    `
    export class MatchAdmin {
      constructor(private readonly settings: MatchAdminProps) {}

      private get andExpression() {
        return this.settings.condition && this.settings.value;
      }
    }
    `,

    // Getters that access properties beyond this.settings.property pattern
    `
    export class MatchAdmin {
      constructor(private readonly settings: MatchAdminProps) {}

      private get directProperty() {
        return this.someOtherProperty;
      }
    }
    `,

    // Getters with parentheses around complex expressions
    `
    export class MatchAdmin {
      constructor(private readonly settings: MatchAdminProps) {}

      private get parenthesized() {
        return (this.settings.value + this.settings.other);
      }
    }
    `,

    // Getters that return function calls on the property
    `
    export class MatchAdmin {
      constructor(private readonly settings: MatchAdminProps) {}

      private get functionCall() {
        return this.settings.otherResults.slice();
      }
    }
    `,

    // Getters that satisfy an interface (Issue #1132)
    `
    interface GitHubIssueRequest {
      id: string;
    }

    class DatadogGitHubIssue implements GitHubIssueRequest {
      constructor(private readonly payload: { issue: { id: string } }) {}

      // Should NOT be flagged as a passthrough getter because it satisfies GitHubIssueRequest
      public get id() {
        return this.payload.issue.id;
      }
    }
    `,

    // Getters that override a base class member (Issue #1132)
    `
    abstract class BaseIssue {
      abstract get id(): string;
    }

    class SpecificIssue extends BaseIssue {
      constructor(private readonly payload: { id: string }) {}

      // Should NOT be flagged as it overrides base class abstract getter
      public get id() {
        return this.payload.id;
      }
    }
    `,

    // Getters in anonymous classes satisfying interfaces (Issue #1133)
    `
    interface Repository {
      readonly name: string;
    }

    const createRepo = (repoName: string) => {
      return new class implements Repository {
        constructor(private readonly data: { name: string }) {}
        get name() {
          return this.data.name;
        }
      }({ name: repoName });
    };
    `,

    // Getters in anonymous classes overriding base class members (Issue #1133)
    `
    abstract class BaseHandler {
      abstract get type(): string;
    }

    const handler = new class extends BaseHandler {
      constructor(private readonly config: { type: string }) {
        super();
      }
      get type() {
        return this.config.type;
      }
    }({ type: 'github' });
    `,

    // Getters in named class expressions satisfying interfaces (Issue #1133)
    `
    interface NamedInterface {
      readonly value: number;
    }

    const instance = new (class MyClass implements NamedInterface {
      constructor(private readonly props: { value: number }) {}
      get value() {
        return this.props.value;
      }
    })({ value: 42 });
    `,

    // A public getter over a PRIVATE constructor parameter property is the only
    // read path an external caller has (Issue #1834)
    `
    class TokenFormatter {
      constructor(private readonly props: { metadata: { ticker: string } }) {}

      public get ticker() {
        return this.props.metadata.ticker;
      }
    }
    `,

    // Same widening spelled with an unannotated (public by default) getter
    `
    class TokenFormatter {
      constructor(private readonly props: { metadata: { ticker: string } }) {}

      get ticker() {
        return this.props.metadata.ticker;
      }
    }
    `,

    // A protected getter over a private root: TypeScript rejects
    // `this.props.data` in any subclass, so the getter is the only read path
    `
    export abstract class UserStatusProcessor {
      constructor(private readonly props: UserStatusProcessorProps) {}

      protected get data() {
        return this.props.data;
      }
    }
    `,

    // A public getter over a protected root widens past the subclass audience
    `
    export class MatchAdmin {
      constructor(protected readonly settings: MatchAdminProps) {}

      public get uid() {
        return this.settings.uid;
      }
    }
    `,

    // The root is a separately declared field rather than a parameter property
    `
    export class MatchAdmin {
      private readonly settings: MatchAdminProps;

      constructor(settings: MatchAdminProps) {
        this.settings = settings;
      }

      public get uid() {
        return this.settings.uid;
      }
    }
    `,

    // The root is an ECMAScript private field, which carries no accessibility
    // modifier while being strictly more private than any getter
    `
    export class MatchAdmin {
      readonly #settings: MatchAdminProps;

      constructor(settings: MatchAdminProps) {
        this.#settings = settings;
      }

      public get uid() {
        return this.#settings.uid;
      }
    }
    `,

    // `#settings` and a sibling `settings` are separate members: forwarding the
    // ECMAScript private one still widens even though a public field shares the
    // name
    `
    export class MatchAdmin {
      public settings: MatchAdminProps;
      readonly #settings: MatchAdminProps;

      constructor(settings: MatchAdminProps) {
        this.settings = settings;
        this.#settings = settings;
      }

      public get uid() {
        return this.#settings.uid;
      }
    }
    `,

    // An unannotated (public by default) getter over an ECMAScript private root
    // widens for the same reason the explicitly public spelling does
    `
    export class MatchAdmin {
      readonly #settings: MatchAdminProps;

      constructor(settings: MatchAdminProps) {
        this.#settings = settings;
      }

      get uid() {
        return this.#settings.uid;
      }
    }
    `,

    // A protected getter over an ECMAScript private root is the boundary: a
    // subclass body cannot read `this.#settings` at all (Issue #1937)
    `
    export abstract class MatchAdmin {
      readonly #settings: MatchAdminProps;

      constructor(settings: MatchAdminProps) {
        this.#settings = settings;
      }

      protected get uid() {
        return this.#settings.uid;
      }
    }
    `,

    // An ECMAScript private getter that adds logic stays valid for the
    // pre-existing reason (the body is not a bare passthrough) (Issue #1937)
    `
    export class MatchAdmin {
      constructor(private readonly settings: MatchAdminProps) {}

      get #uid() {
        return this.settings.uid ?? ANONYMOUS_UID;
      }
    }
    `,

    // Bracket notation must reach the same root as dot notation
    `
    export class MatchAdmin {
      constructor(private readonly settings: MatchAdminProps) {}

      public get uid() {
        return this['settings'].uid;
      }
    }
    `,

    // The root is a private accessor rather than a field
    `
    export class MatchAdmin {
      constructor(private readonly props: MatchAdminProps) {}

      private get settings() {
        return this.props.settings ?? DEFAULT_SETTINGS;
      }

      public get uid() {
        return this.settings.uid;
      }
    }
    `,

    // The root is inherited: a subclass cannot read a base class's protected
    // field from outside, so a public getter over it is the boundary
    `
    abstract class BracketCreator {
      constructor(protected readonly props: BracketCreatorProps) {}
    }

    export class HeatsCreator extends BracketCreator {
      public get roundsCount() {
        return this.props.numberOfRounds;
      }
    }
    `,

    // A widening getter that also adds logic stays valid for the pre-existing
    // reason (the body is not a bare passthrough), independent of the carve-out
    `
    class TokenFormatter {
      constructor(private readonly props: { metadata: { ticker?: string } }) {}

      public get ticker() {
        return this.props.metadata.ticker ?? 'UNKNOWN';
      }
    }
    `,

    // Widening inside an anonymous class expression
    `
    const formatter = new class {
      constructor(private readonly props: { ticker: string }) {}

      public get ticker() {
        return this.props.ticker;
      }
    }({ ticker: 'GEMS' });
    `,

    // A parameter property carrying a default value still resolves its root
    `
    export class MatchAdmin {
      constructor(private readonly settings: MatchAdminProps = DEFAULTS) {}

      public get uid() {
        return this.settings.uid;
      }
    }
    `,
  ],
  invalid: [
    // Simple passthrough getter
    {
      code: `
      export class MatchAdmin {
        constructor(private readonly settings: MatchAdminProps) {}

        private get otherResults() {
          return this.settings.otherResults;
        }
      }
      `,
      errors: [error('otherResults', 'this.settings.otherResults')],
    },

    // Multiple passthrough getters
    {
      code: `
      export class MatchAdmin {
        constructor(private readonly settings: MatchAdminProps) {}

        private get otherResults() {
          return this.settings.otherResults;
        }

        private get uid() {
          return this.settings.uid;
        }
      }
      `,
      errors: [
        error('otherResults', 'this.settings.otherResults'),
        error('uid', 'this.settings.uid'),
      ],
    },

    // Public passthrough getter over an equally public injected object: every
    // caller that can reach the getter can reach `settings` itself
    {
      code: `
      export class MatchAdmin {
        constructor(public readonly settings: MatchAdminProps) {}

        public get userId() {
          return this.settings.uid;
        }
      }
      `,
      errors: [error('userId', 'this.settings.uid')],
    },

    // Protected passthrough getter over an equally protected injected object
    {
      code: `
      export class MatchAdmin {
        constructor(protected readonly settings: MatchAdminProps) {}

        protected get protectedValue() {
          return this.settings.value;
        }
      }
      `,
      errors: [error('protectedValue', 'this.settings.value')],
    },

    // Passthrough getter with extra whitespace
    {
      code: `
      export class MatchAdmin {
        constructor(private readonly settings: MatchAdminProps) {}

        private get spacedGetter() {
          return    this.settings.otherResults   ;
        }
      }
      `,
      errors: [error('spacedGetter', 'this.settings.otherResults')],
    },

    // Passthrough getter with parentheses around return expression
    {
      code: `
      export class MatchAdmin {
        constructor(private readonly settings: MatchAdminProps) {}

        private get parenthesizedReturn() {
          return (this.settings.otherResults);
        }
      }
      `,
      errors: [error('parenthesizedReturn', 'this.settings.otherResults')],
    },

    // Passthrough getter accessing deeply nested properties
    {
      code: `
      export class MatchAdmin {
        constructor(private readonly settings: MatchAdminProps) {}

        private get deepProperty() {
          return this.settings.nested.deep.property;
        }
      }
      `,
      errors: [error('deepProperty', 'this.settings.nested.deep.property')],
    },

    // Passthrough getter with different constructor parameter names
    {
      code: `
      export class MatchAdmin {
        constructor(private readonly config: MatchAdminProps) {}

        private get configValue() {
          return this.config.value;
        }
      }
      `,
      errors: [error('configValue', 'this.config.value')],
    },

    // Passthrough getter with bracket notation
    {
      code: `
      export class MatchAdmin {
        constructor(private readonly settings: MatchAdminProps) {}

        private get bracketAccess() {
          return this.settings['otherResults'];
        }
      }
      `,
      errors: [error('bracketAccess', 'this.settings["otherResults"]')],
    },

    // Passthrough getter accessing different property patterns
    {
      code: `
      export class MatchAdmin {
        constructor(private readonly data: DataProps) {}

        private get dataProperty() {
          return this.data.property;
        }
      }
      `,
      errors: [error('dataProperty', 'this.data.property')],
    },

    // Passthrough getter with readonly modifier
    {
      code: `
      export class MatchAdmin {
        constructor(public readonly settings: MatchAdminProps) {}

        readonly get readonlyGetter() {
          return this.settings.value;
        }
      }
      `,
      errors: [error('readonlyGetter', 'this.settings.value')],
    },

    // Passthrough getter in different class contexts
    {
      code: `
      class SimpleClass {
        constructor(public settings: Props) {}

        get simpleGetter() {
          return this.settings.prop;
        }
      }
      `,
      errors: [error('simpleGetter', 'this.settings.prop')],
    },

    // Passthrough getter with different access modifiers
    {
      code: `
      export class MatchAdmin {
        constructor(public readonly settings: MatchAdminProps) {}

        get defaultGetter() {
          return this.settings.defaultValue;
        }
      }
      `,
      errors: [error('defaultGetter', 'this.settings.defaultValue')],
    },

    // Passthrough getter with complex property names
    {
      code: `
      export class MatchAdmin {
        constructor(private readonly settings: MatchAdminProps) {}

        private get complexPropertyName() {
          return this.settings.veryLongPropertyNameThatIsStillJustAProperty;
        }
      }
      `,
      errors: [
        error(
          'complexPropertyName',
          'this.settings.veryLongPropertyNameThatIsStillJustAProperty',
        ),
      ],
    },

    // Passthrough getter with numeric property access
    {
      code: `
      export class MatchAdmin {
        constructor(private readonly settings: MatchAdminProps) {}

        private get numericProperty() {
          return this.settings[0];
        }
      }
      `,
      errors: [error('numericProperty', 'this.settings[0]')],
    },

    // Multiple passthrough getters with different patterns
    {
      code: `
      export class MatchAdmin {
        constructor(
          private readonly settings: MatchAdminProps,
          public readonly config: ConfigProps,
          protected readonly shared: SharedProps
        ) {}

        private get settingsValue() {
          return this.settings.value;
        }

        private get configValue() {
          return this.config.value;
        }

        protected get protectedSetting() {
          return this.shared.protectedProp;
        }

        public get publicConfig() {
          return this.config.publicProp;
        }
      }
      `,
      errors: [
        error('settingsValue', 'this.settings.value'),
        error('configValue', 'this.config.value'),
        error('protectedSetting', 'this.shared.protectedProp'),
        error('publicConfig', 'this.config.publicProp'),
      ],
    },

    // Passthrough getter in abstract class
    {
      code: `
      export abstract class AbstractAdmin {
        constructor(protected readonly settings: MatchAdminProps) {}

        protected get abstractPassthrough() {
          return this.settings.value;
        }
      }
      `,
      errors: [error('abstractPassthrough', 'this.settings.value')],
    },

    // Static getters should not be flagged as they don't access constructor parameters
    // This test case should be moved to valid section

    // Passthrough getter with comments
    {
      code: `
      export class MatchAdmin {
        constructor(private readonly settings: MatchAdminProps) {}

        // This is just a passthrough
        private get commentedGetter() {
          // Return the property
          return this.settings.otherResults; // Simple return
        }
      }
      `,
      errors: [error('commentedGetter', 'this.settings.otherResults')],
    },

    // Passthrough getter with different formatting (should still be flagged)
    {
      code: `
      export class MatchAdmin {
        constructor(private readonly settings: MatchAdminProps) {}

        private get formattedGetter() {
          return this.settings.otherResults;
        }
      }
      `,
      errors: [error('formattedGetter', 'this.settings.otherResults')],
    },

    // Passthrough getter accessing array elements
    {
      code: `
      export class MatchAdmin {
        constructor(private readonly settings: MatchAdminProps) {}

        private get firstResult() {
          return this.settings.otherResults[0];
        }
      }
      `,
      errors: [error('firstResult', 'this.settings.otherResults[0]')],
    },

    // Passthrough getter accessing different constructor parameters
    {
      code: `
      export class MatchAdmin {
        constructor(private readonly settings: MatchAdminProps, private readonly config: Config) {}

        private get configValue() {
          return this.config.value;
        }
      }
      `,
      errors: [error('configValue', 'this.config.value')],
    },

    // Control for Issue #1834: a PUBLIC injected object is readable directly by
    // every caller of the getter, so the getter is genuine indirection
    {
      code: `
      class TokenFormatter {
        constructor(public readonly props: { metadata: { ticker: string } }) {}

        public get ticker() {
          return this.props.metadata.ticker;
        }
      }
      `,
      errors: [error('ticker', 'this.props.metadata.ticker')],
    },

    // `readonly` alone declares a PUBLIC member, so this is the same control
    // spelled without an explicit accessibility modifier
    {
      code: `
      class TokenFormatter {
        constructor(readonly props: { metadata: { ticker: string } }) {}

        public get ticker() {
          return this.props.metadata.ticker;
        }
      }
      `,
      errors: [error('ticker', 'this.props.metadata.ticker')],
    },

    // A separately declared PUBLIC field is equally readable
    {
      code: `
      export class MatchAdmin {
        public readonly settings: MatchAdminProps;

        constructor(settings: MatchAdminProps) {
          this.settings = settings;
        }

        public get uid() {
          return this.settings.uid;
        }
      }
      `,
      errors: [error('uid', 'this.settings.uid')],
    },

    // A private getter NARROWS a public root, which is not an encapsulation
    // boundary: the getter's only callers already reach `settings` directly
    {
      code: `
      export class MatchAdmin {
        constructor(public readonly settings: MatchAdminProps) {}

        private get uid() {
          return this.settings.uid;
        }
      }
      `,
      errors: [error('uid', 'this.settings.uid')],
    },

    // A protected getter over a protected root reaches no further than the root
    {
      code: `
      export abstract class AbstractAdmin {
        constructor(protected readonly settings: MatchAdminProps) {}

        protected get uid() {
          return this.settings.uid;
        }
      }
      `,
      errors: [error('uid', 'this.settings.uid')],
    },

    // An inherited root at the SAME visibility as the getter still reports
    {
      code: `
      abstract class WebhookEventProcessor {
        constructor(protected readonly event: WebhookEvent) {}
      }

      export abstract class BaseEventProcessor extends WebhookEventProcessor {
        protected get channelType() {
          return this.event.channel_type;
        }
      }
      `,
      errors: [error('channelType', 'this.event.channel_type')],
    },

    // Bracket notation onto a public root is still indirection
    {
      code: `
      export class MatchAdmin {
        constructor(public readonly settings: MatchAdminProps) {}

        public get uid() {
          return this['settings'].uid;
        }
      }
      `,
      errors: [error('uid', 'this["settings"].uid')],
    },

    // An ECMAScript private getter reaches no further than a `private` root:
    // every caller of `#uid` sits in the class body, where `this.settings` is
    // readable, so the "read it directly" remedy exists (Issue #1937).
    // `private #uid` is illegal TypeScript (TS18010), so the `#` spelling is
    // the only way to write this member.
    {
      code: `
      export class MatchAdmin {
        constructor(private readonly settings: MatchAdminProps) {}

        get #uid() {
          return this.settings.uid;
        }
      }
      `,
      errors: [error('#uid', 'this.settings.uid')],
    },

    // Same, over a `protected` root: `#` reaches strictly less far than
    // `protected`, so it never qualifies as the encapsulation boundary
    {
      code: `
      export abstract class MatchAdmin {
        constructor(protected readonly settings: MatchAdminProps) {}

        get #uid() {
          return this.settings.uid;
        }
      }
      `,
      errors: [error('#uid', 'this.settings.uid')],
    },

    // Both sides spelled `#`: equal visibility keeps reporting, exactly as
    // `private get` over a `private` field does
    {
      code: `
      export class MatchAdmin {
        readonly #settings: MatchAdminProps;

        constructor(settings: MatchAdminProps) {
          this.#settings = settings;
        }

        get #uid() {
          return this.#settings.uid;
        }
      }
      `,
      errors: [error('#uid', 'this.#settings.uid')],
    },

    // A `private` getter over an ECMAScript private root: the forwarded path is
    // named in the message rather than falling back to the generic phrasing
    {
      code: `
      export class MatchAdmin {
        readonly #settings: MatchAdminProps;

        constructor(settings: MatchAdminProps) {
          this.#settings = settings;
        }

        private get uid() {
          return this.#settings.uid;
        }
      }
      `,
      errors: [error('uid', 'this.#settings.uid')],
    },

    // An ECMAScript private getter over a PUBLIC root already reported before
    // the ranking fix, but named itself `uid` rather than `#uid`
    {
      code: `
      export class MatchAdmin {
        constructor(public readonly settings: MatchAdminProps) {}

        get #uid() {
          return this.settings.uid;
        }
      }
      `,
      errors: [error('#uid', 'this.settings.uid')],
    },

    // An inherited `protected` root is readable throughout the subclass body,
    // which is the whole audience of an ECMAScript private getter
    {
      code: `
      abstract class WebhookEventProcessor {
        constructor(protected readonly event: WebhookEvent) {}
      }

      export abstract class BaseEventProcessor extends WebhookEventProcessor {
        get #channelType() {
          return this.event.channel_type;
        }
      }
      `,
      errors: [error('#channelType', 'this.event.channel_type')],
    },

    // A sibling `#settings` must not lend its privacy to the public `settings`
    // the getter actually forwards. Declaring the `#` field FIRST is the order
    // that used to win the name-only lookup and silence this report.
    {
      code: `
      export class MatchAdmin {
        readonly #settings: MatchAdminProps;
        public settings: MatchAdminProps;

        constructor(settings: MatchAdminProps) {
          this.#settings = settings;
          this.settings = settings;
        }

        public get uid() {
          return this.settings.uid;
        }
      }
      `,
      errors: [error('uid', 'this.settings.uid')],
    },

    // Declaration-order control: the same two members the other way round
    // reported before and must keep reporting
    {
      code: `
      export class MatchAdmin {
        public settings: MatchAdminProps;
        readonly #settings: MatchAdminProps;

        constructor(settings: MatchAdminProps) {
          this.#settings = settings;
          this.settings = settings;
        }

        public get uid() {
          return this.settings.uid;
        }
      }
      `,
      errors: [error('uid', 'this.settings.uid')],
    },

    // Isolation control for Issue #1937: renaming the getter while KEEPING the
    // `private` modifier must not move the verdict, so the delta above is the
    // privacy spelling rather than the member name
    {
      code: `
      export class MatchAdmin {
        constructor(private readonly settings: MatchAdminProps) {}

        private get uidRenamedZzz() {
          return this.settings.uid;
        }
      }
      `,
      errors: [error('uidRenamedZzz', 'this.settings.uid')],
    },
  ],
});
