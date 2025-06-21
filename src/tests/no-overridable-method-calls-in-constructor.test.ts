import { ruleTesterTs } from '../utils/ruleTester';
import { noOverridableMethodCallsInConstructor } from '../rules/no-overridable-method-calls-in-constructor';

ruleTesterTs.run(
  'no-overridable-method-calls-in-constructor',
  noOverridableMethodCallsInConstructor,
  {
    valid: [
      // Empty constructor
      {
        code: `
        class Vehicle {
          constructor() {
            // Empty constructor
          }

          displayType() {
            console.log("Vehicle");
          }
        }
        `,
      },

      // Constructor with no method calls
      {
        code: `
        class Vehicle {
          private name: string;

          constructor(name: string) {
            this.name = name;
            console.log("Creating vehicle");
          }

          displayType() {
            console.log("Vehicle");
          }
        }
        `,
      },

      // Constructor calling private methods (not overridable)
      {
        code: `
        class Vehicle {
          constructor() {
            this.setupInternals();
          }

          private setupInternals() {
            console.log("Setting up internals");
          }

          displayType() {
            console.log("Vehicle");
          }
        }
        `,
      },

      // Constructor calling static methods (not overridable)
      {
        code: `
        class Vehicle {
          constructor() {
            Vehicle.logCreation();
          }

          static logCreation() {
            console.log("Vehicle created");
          }

          displayType() {
            console.log("Vehicle");
          }
        }
        `,
      },

      // Constructor calling methods on other objects
      {
        code: `
        class Vehicle {
          private logger: any;

          constructor(logger: any) {
            this.logger = logger;
            this.logger.log("Vehicle constructed");
          }

          displayType() {
            console.log("Vehicle");
          }
        }
        `,
      },

      // Constructor calling built-in methods
      {
        code: `
        class Vehicle {
          constructor() {
            console.log("Creating vehicle");
            Object.freeze(this);
          }

          displayType() {
            console.log("Vehicle");
          }
        }
        `,
      },

      // Constructor with computed property access (ignored by rule)
      {
        code: `
        class Vehicle {
          constructor() {
            const methodName = 'displayType';
            this[methodName]();
          }

          displayType() {
            console.log("Vehicle");
          }
        }
        `,
      },

      // Constructor calling super() constructor
      {
        code: `
        class Car extends Vehicle {
          constructor() {
            super();
          }
        }

        class Vehicle {
          displayType() {
            console.log("Vehicle");
          }
        }
        `,
      },

      // Constructor with arrow functions (indirect calls - not caught by current rule)
      {
        code: `
        class Vehicle {
          constructor() {
            const callback = () => this.displayType();
            // Not calling the callback, just defining it
          }

          displayType() {
            console.log("Vehicle");
          }
        }
        `,
      },

      // Class expression with valid constructor
      {
        code: `
        const Vehicle = class {
          constructor() {
            this.setupPrivate();
          }

          private setupPrivate() {
            console.log("Private setup");
          }

          displayType() {
            console.log("Vehicle");
          }
        };
        `,
      },

      // Constructor with multiple private method calls
      {
        code: `
        class Vehicle {
          constructor() {
            this.initializeA();
            this.initializeB();
          }

          private initializeA() {
            console.log("Init A");
          }

          private initializeB() {
            console.log("Init B");
          }

          displayType() {
            console.log("Vehicle");
          }
        }
        `,
      },

      // Constructor calling static methods with this context
      {
        code: `
        class Vehicle {
          constructor() {
            this.constructor.logCreation();
          }

          static logCreation() {
            console.log("Vehicle created");
          }

          displayType() {
            console.log("Vehicle");
          }
        }
        `,
      },

      // Constructor with external function calls
      {
        code: `
        function externalFunction() {
          console.log("External");
        }

        class Vehicle {
          constructor() {
            externalFunction();
          }

          displayType() {
            console.log("Vehicle");
          }
        }
        `,
      },

      // Constructor with method calls on parameters
      {
        code: `
        class Vehicle {
          constructor(config: any) {
            config.validate();
          }

          displayType() {
            console.log("Vehicle");
          }
        }
        `,
      },

      // Constructor with nested private method calls in control structures
      {
        code: `
        class Vehicle {
          constructor(shouldInit: boolean) {
            if (shouldInit) {
              this.privateInit();
            }
          }

          private privateInit() {
            console.log("Private init");
          }

          displayType() {
            console.log("Vehicle");
          }
        }
        `,
      },

      // Constructor with nested function calling overridable method (not flagged - new scope)
      {
        code: `
        class Vehicle {
          constructor() {
            function nested() {
              this.displayType();
            }
            nested.call(this);
          }

          displayType() {
            console.log("Vehicle");
          }
        }
        `,
      },

      // Constructor calling method inside arrow function that's immediately invoked (not flagged - new scope)
      {
        code: `
        class Vehicle {
          constructor() {
            (() => {
              this.displayType();
            })();
          }

          displayType() {
            console.log("Vehicle");
          }
        }
        `,
      },

      // Constructor calling method inside callback (not flagged - new scope)
      {
        code: `
        class Vehicle {
          constructor() {
            setTimeout(() => {
              this.displayType();
            }, 0);
          }

          displayType() {
            console.log("Vehicle");
          }
        }
        `,
      },
    ],

    invalid: [
      // Basic case: Constructor calling public instance method
      {
        code: `
        class Vehicle {
          constructor() {
            this.displayType();
          }

          displayType() {
            console.log("Vehicle");
          }
        }
        `,
        errors: [{ messageId: 'noOverridableMethodCallsInConstructor' }],
      },

      // Constructor calling protected instance method
      {
        code: `
        class Vehicle {
          constructor() {
            this.displayType();
          }

          protected displayType() {
            console.log("Vehicle");
          }
        }
        `,
        errors: [{ messageId: 'noOverridableMethodCallsInConstructor' }],
      },

      // Constructor calling abstract method
      {
        code: `
        abstract class Vehicle {
          constructor() {
            this.getDetails();
          }

          abstract getDetails(): string;
        }
        `,
        errors: [{ messageId: 'noOverridableMethodCallsInConstructor' }],
      },

      // Constructor calling abstract method on super (same method declared in current class)
      {
        code: `
        abstract class Vehicle {
          abstract getDetails(): string;
        }

        abstract class Car extends Vehicle {
          constructor() {
            super();
            super.getDetails();
          }

          abstract getDetails(): string;
        }
        `,
        errors: [{ messageId: 'noOverridableMethodCallsInConstructor' }],
      },

      // Constructor with multiple overridable method calls
      {
        code: `
        class Vehicle {
          constructor() {
            this.displayType();
            this.showDetails();
          }

          displayType() {
            console.log("Vehicle");
          }

          showDetails() {
            console.log("Details");
          }
        }
        `,
        errors: [
          { messageId: 'noOverridableMethodCallsInConstructor' },
          { messageId: 'noOverridableMethodCallsInConstructor' },
        ],
      },

      // Constructor calling method inside if statement
      {
        code: `
        class Vehicle {
          constructor(shouldDisplay: boolean) {
            if (shouldDisplay) {
              this.displayType();
            }
          }

          displayType() {
            console.log("Vehicle");
          }
        }
        `,
        errors: [{ messageId: 'noOverridableMethodCallsInConstructor' }],
      },

      // Constructor calling method inside try-catch
      {
        code: `
        class Vehicle {
          constructor() {
            try {
              this.displayType();
            } catch (e) {
              console.error(e);
            }
          }

          displayType() {
            console.log("Vehicle");
          }
        }
        `,
        errors: [{ messageId: 'noOverridableMethodCallsInConstructor' }],
      },

      // Constructor calling method inside loop
      {
        code: `
        class Vehicle {
          constructor() {
            for (let i = 0; i < 1; i++) {
              this.displayType();
            }
          }

          displayType() {
            console.log("Vehicle");
          }
        }
        `,
        errors: [{ messageId: 'noOverridableMethodCallsInConstructor' }],
      },

      // Constructor calling method with parameters
      {
        code: `
        class Vehicle {
          constructor() {
            this.displayType("test");
          }

          displayType(message: string) {
            console.log(message);
          }
        }
        `,
        errors: [{ messageId: 'noOverridableMethodCallsInConstructor' }],
      },

      // Constructor calling method with complex expressions
      {
        code: `
        class Vehicle {
          constructor() {
            this.displayType(this.getName() + " vehicle");
          }

          displayType(message: string) {
            console.log(message);
          }

          getName(): string {
            return "Generic";
          }
        }
        `,
        errors: [
          { messageId: 'noOverridableMethodCallsInConstructor' },
          { messageId: 'noOverridableMethodCallsInConstructor' },
        ],
      },

      // Class expression with invalid constructor
      {
        code: `
        const Vehicle = class {
          constructor() {
            this.displayType();
          }

          displayType() {
            console.log("Vehicle");
          }
        };
        `,
        errors: [{ messageId: 'noOverridableMethodCallsInConstructor' }],
      },

      // Constructor calling getter (overridable)
      {
        code: `
        class Vehicle {
          constructor() {
            console.log(this.type);
          }

          get type(): string {
            return "vehicle";
          }
        }
        `,
        errors: [{ messageId: 'noOverridableMethodCallsInConstructor' }],
      },

      // Constructor calling setter (overridable)
      {
        code: `
        class Vehicle {
          private _type: string = "";

          constructor() {
            this.type = "vehicle";
          }

          set type(value: string) {
            this._type = value;
          }
        }
        `,
        errors: [{ messageId: 'noOverridableMethodCallsInConstructor' }],
      },

      // Constructor calling method with method chaining
      {
        code: `
        class Vehicle {
          constructor() {
            this.displayType().toString();
          }

          displayType(): any {
            console.log("Vehicle");
            return this;
          }
        }
        `,
        errors: [{ messageId: 'noOverridableMethodCallsInConstructor' }],
      },

      // Constructor calling async method
      {
        code: `
        class Vehicle {
          constructor() {
            this.initAsync();
          }

          async initAsync() {
            console.log("Async init");
          }
        }
        `,
        errors: [{ messageId: 'noOverridableMethodCallsInConstructor' }],
      },

      // Constructor calling generator method
      {
        code: `
        class Vehicle {
          constructor() {
            this.generateData();
          }

          *generateData() {
            yield "data";
          }
        }
        `,
        errors: [{ messageId: 'noOverridableMethodCallsInConstructor' }],
      },

      // Constructor with switch statement calling methods
      {
        code: `
        class Vehicle {
          constructor(type: string) {
            switch (type) {
              case "car":
                this.displayType();
                break;
              default:
                this.showDefault();
            }
          }

          displayType() {
            console.log("Car");
          }

          showDefault() {
            console.log("Default");
          }
        }
        `,
        errors: [
          { messageId: 'noOverridableMethodCallsInConstructor' },
          { messageId: 'noOverridableMethodCallsInConstructor' },
        ],
      },

      // Constructor calling method with destructuring assignment
      {
        code: `
        class Vehicle {
          constructor() {
            const { result } = this.getConfig();
          }

          getConfig() {
            return { result: "config" };
          }
        }
        `,
        errors: [{ messageId: 'noOverridableMethodCallsInConstructor' }],
      },

      // Constructor calling method in template literal
      {
        code: `
        class Vehicle {
          constructor() {
            console.log(\`Type: \${this.getType()}\`);
          }

          getType(): string {
            return "vehicle";
          }
        }
        `,
        errors: [{ messageId: 'noOverridableMethodCallsInConstructor' }],
      },

      // Constructor calling method with spread operator
      {
        code: `
        class Vehicle {
          constructor() {
            const args = this.getArgs();
            console.log(...args);
          }

          getArgs(): string[] {
            return ["arg1", "arg2"];
          }
        }
        `,
        errors: [{ messageId: 'noOverridableMethodCallsInConstructor' }],
      },

      // Constructor calling method in conditional expression
      {
        code: `
        class Vehicle {
          constructor(condition: boolean) {
            const result = condition ? this.getTrue() : this.getFalse();
          }

          getTrue(): string {
            return "true";
          }

          getFalse(): string {
            return "false";
          }
        }
        `,
        errors: [
          { messageId: 'noOverridableMethodCallsInConstructor' },
          { messageId: 'noOverridableMethodCallsInConstructor' },
        ],
      },

      // Constructor calling method in logical expression
      {
        code: `
        class Vehicle {
          constructor() {
            const result = this.getValue() || this.getDefault();
          }

          getValue(): string | null {
            return null;
          }

          getDefault(): string {
            return "default";
          }
        }
        `,
        errors: [
          { messageId: 'noOverridableMethodCallsInConstructor' },
          { messageId: 'noOverridableMethodCallsInConstructor' },
        ],
      },

      // Constructor calling method in array expression
      {
        code: `
        class Vehicle {
          constructor() {
            const array = [this.getValue(), "other"];
          }

          getValue(): string {
            return "value";
          }
        }
        `,
        errors: [{ messageId: 'noOverridableMethodCallsInConstructor' }],
      },

      // Constructor calling method in object expression
      {
        code: `
        class Vehicle {
          constructor() {
            const obj = {
              value: this.getValue(),
              other: "test"
            };
          }

          getValue(): string {
            return "value";
          }
        }
        `,
        errors: [{ messageId: 'noOverridableMethodCallsInConstructor' }],
      },
    ],
  },
);
