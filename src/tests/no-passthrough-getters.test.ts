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

    // Public passthrough getter
    {
      code: `
      export class MatchAdmin {
        constructor(private readonly settings: MatchAdminProps) {}

        public get userId() {
          return this.settings.uid;
        }
      }
      `,
      errors: [error('userId', 'this.settings.uid')],
    },

    // Protected passthrough getter
    {
      code: `
      export class MatchAdmin {
        constructor(private readonly settings: MatchAdminProps) {}

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
        constructor(private readonly settings: MatchAdminProps) {}

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
        constructor(private settings: Props) {}

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
        constructor(private readonly settings: MatchAdminProps) {}

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
          private readonly config: ConfigProps
        ) {}

        private get settingsValue() {
          return this.settings.value;
        }

        private get configValue() {
          return this.config.value;
        }

        protected get protectedSetting() {
          return this.settings.protectedProp;
        }

        public get publicConfig() {
          return this.config.publicProp;
        }
      }
      `,
      errors: [
        error('settingsValue', 'this.settings.value'),
        error('configValue', 'this.config.value'),
        error('protectedSetting', 'this.settings.protectedProp'),
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
  ],
});
