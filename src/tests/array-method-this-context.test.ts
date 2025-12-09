import { arrayMethodsThisContext } from '../rules/array-methods-this-context';
import { ruleTesterTs } from '../utils/ruleTester';

ruleTesterTs.run('array-method-this-content', arrayMethodsThisContext, {
  valid: [
    // Arrow function used in array method
    "['a', 'b', 'c'].map((item) => this.processItem(item))",

    // Class method used in array method, but not as a this reference
    "['a', 'b', 'c'].map(processItem)",
  ],
  invalid: [
    ...[
      // Class method reference used in array method
      "['a', 'b', 'c'].map(this.processItem)",

      // Class method reference used in array method with other arguments
      "['a', 'b', 'c'].map(this.processItem, otherArgument)",

      // Class method reference used in other array methods
      "['a', 'b', 'c'].filter(this.checkItem)",
      "['a', 'b', 'c'].forEach(this.printItem)",
      "['a', 'b', 'c'].some(this.testItem)",
      "['a', 'b', 'c'].every(this.validateItem)",
      "['a', 'b', 'c'].reduce(this.combineItems)",
    ].map((testCase) => {
      const arrayMethod = testCase.match(/\.(\w+)\(/)?.[1] ?? '';
      const methodName = testCase.match(/this\.(\w+)/)?.[1] ?? '';

      return {
        code: testCase,
        errors: [
          {
            messageId: 'unexpected' as const,
            data: {
              arrayMethod,
              methodName,
            },
          },
        ],
      };
    }),
    {
      code: "['a', 'b', 'c'].map(function(item) { return this.processItem(item) }.bind(this))",
      errors: [
        {
          messageId: 'preferArrow' as const,
          data: {
            arrayMethod: 'map',
          },
        },
      ],
    },
  ],
});
