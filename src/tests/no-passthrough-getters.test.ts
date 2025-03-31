import { noPassthroughGetters } from '../rules/no-passthrough-getters';
import { ruleTesterTs } from '../utils/ruleTester';

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

    // Getters that handle null/undefined values
    `
    export class MatchAdmin {
      constructor(private readonly settings: MatchAdminProps) {}

      private get otherResults() {
        return this.settings.otherResults || [];
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

    // Getters with type refinement
    `
    export class MatchAdmin {
      constructor(private readonly settings: MatchAdminProps) {}

      private get typedResults(): ValidResult[] {
        return this.settings.otherResults as ValidResult[];
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
      errors: [{ messageId: 'noPassthroughGetter' }],
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
        { messageId: 'noPassthroughGetter' },
        { messageId: 'noPassthroughGetter' },
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
      errors: [{ messageId: 'noPassthroughGetter' }],
    },
  ],
});
