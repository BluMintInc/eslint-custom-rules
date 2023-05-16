import { ESLintUtils } from '@typescript-eslint/utils';
import { arrayMethodsThisContext } from '../rules/array-methods-this-context';

const ruleTester = new ESLintUtils.RuleTester({
    parser: '@typescript-eslint/parser',
});

ruleTester.run('array-method-this-content', arrayMethodsThisContext, {
    valid: [
        // Arrow function used in array method
        "['a', 'b', 'c'].map((item) => this.processItem(item))",
      
        // Class method used in array method, but not as a this reference
        "['a', 'b', 'c'].map(processItem)"
      ],
    invalid: [...[
        // Class method reference used in array method
        "['a', 'b', 'c'].map(this.processItem)",
      
        // Class method reference used in array method with other arguments
        "['a', 'b', 'c'].map(this.processItem, otherArgument)",
      
        // Class method reference used in other array methods
        "['a', 'b', 'c'].filter(this.checkItem)",
        "['a', 'b', 'c'].forEach(this.printItem)",
        "['a', 'b', 'c'].some(this.testItem)",
        "['a', 'b', 'c'].every(this.validateItem)",
        "['a', 'b', 'c'].reduce(this.combineItems)"
      ].map(testCase => {
        return {
            code: testCase,
            errors: [{messageId: 'unexpected' as const}]
        }
      }),{
        code: 
        "['a', 'b', 'c'].map(function(item) { return this.processItem(item) }.bind(this))",
        errors: [{messageId:'preferArrow' as const}]
      }]
});
