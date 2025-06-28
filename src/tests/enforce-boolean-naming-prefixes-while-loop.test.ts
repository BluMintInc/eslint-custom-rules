import { ruleTesterTs } from '../utils/ruleTester';
import { enforceBooleanNamingPrefixes } from '../rules/enforce-boolean-naming-prefixes';

ruleTesterTs.run(
  'enforce-boolean-naming-prefixes-while-loop',
  enforceBooleanNamingPrefixes,
  {
    valid: [
      // Test case from the bug report - should not flag 'parent' as needing a boolean prefix
      `
      const findTargetNode = () => {
        let parent = imageRef.current && imageRef.current.parentElement;
        while (parent) {
          const isSlide = parent.className.includes('glider-slide');
          if (isSlide) {
            return parent;
          }
          parent = parent.parentElement;
        }
        return null;
      };
      `,
      // Additional test cases with similar patterns
      `
      function traverseDOM() {
        let element = document.getElementById('root');
        while (element) {
          console.log(element.tagName);
          element = element.parentElement;
        }
      }
      `,
      `
      const findAncestor = (node) => {
        let ancestor = node.parentNode;
        while (ancestor) {
          if (ancestor.matches('.container')) {
            return ancestor;
          }
          ancestor = ancestor.parentNode;
        }
        return null;
      };
      `,
    ],
    invalid: [
      // Should still flag actual boolean variables in while loops
      {
        code: `
        function checkPermissions() {
          let authorized = user.isLoggedIn;
          while (authorized) {
            authorized = checkNextPermission();
          }
        }
        `,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'variable',
              name: 'authorized',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },
    ],
  },
);
