import { ruleTesterTs } from '../utils/ruleTester';
import { enforceBooleanNamingPrefixes } from '../rules/enforce-boolean-naming-prefixes';

// Comprehensive test suite to ensure the bug fix is robust and covers all edge cases
ruleTesterTs.run(
  'enforce-boolean-naming-prefixes-comprehensive-edge-cases',
  enforceBooleanNamingPrefixes,
  {
    valid: [
      // Original bug case - DOM traversal with parentElement
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

      // Tree traversal with generic parent property
      `
      function processTree() {
        let parent = tree && tree.root;
        while (parent) {
          process(parent);
          parent = parent.parent;
        }
      }
      `,

      // DOM traversal with querySelector
      `
      function findContainer() {
        let element = document.querySelector('.item');
        while (element) {
          if (element.classList.contains('container')) {
            return element;
          }
          element = element.parentElement;
        }
        return null;
      }
      `,

      // Node traversal with firstChild/nextSibling
      `
      function walkNodes() {
        let node = startNode && startNode.firstChild;
        while (node) {
          processNode(node);
          node = node.nextSibling;
        }
      }
      `,

      // Tree traversal with left/right properties
      `
      function traverseBinaryTree() {
        let node = root && root.left;
        while (node) {
          visit(node);
          node = node.right;
        }
      }
      `,

      // Multiple DOM traversal patterns
      `
      function complexTraversal() {
        let ancestor = element && element.parentNode;
        while (ancestor) {
          if (ancestor.matches('.target')) {
            break;
          }
          ancestor = ancestor.parentNode;
        }

        let descendant = element && element.firstElementChild;
        while (descendant) {
          process(descendant);
          descendant = descendant.nextElementSibling;
        }
      }
      `,

      // Edge case: parent variable with DOM method initialization
      `
      function findParentByClass() {
        let parent = element.closest('.container');
        while (parent) {
          if (parent.hasAttribute('data-target')) {
            return parent;
          }
          parent = parent.parentElement;
        }
        return null;
      }
      `,

      // Edge case: element variable with getElementById
      `
      function processElements() {
        let element = document.getElementById('start');
        while (element) {
          processElement(element);
          element = element.nextElementSibling;
        }
      }
      `,

      // Edge case: node variable with tree structure
      `
      function processLinkedList() {
        let node = head && head.next;
        while (node) {
          processNode(node);
          node = node.next;
        }
      }
      `,

      // Edge case: child variable with DOM traversal
      `
      function processChildren() {
        let child = parent && parent.firstChild;
        while (child) {
          if (child.nodeType === Node.ELEMENT_NODE) {
            processChild(child);
          }
          child = child.nextSibling;
        }
      }
      `,

      // Edge case: sibling variable with DOM traversal
      `
      function processSiblings() {
        let sibling = element && element.previousElementSibling;
        while (sibling) {
          processSibling(sibling);
          sibling = sibling.previousElementSibling;
        }
      }
      `,

      // Edge case: ancestor variable with DOM traversal
      `
      function findAncestor() {
        let ancestor = element && element.parentElement;
        while (ancestor) {
          if (ancestor.classList.contains('target')) {
            return ancestor;
          }
          ancestor = ancestor.parentElement;
        }
        return null;
      }
      `,

      // Edge case: descendant variable with DOM traversal
      `
      function processDescendants() {
        let descendant = root && root.firstElementChild;
        while (descendant) {
          processDescendant(descendant);
          descendant = descendant.nextElementSibling;
        }
      }
      `,

      // Complex nested structure
      `
      function complexDOMTraversal() {
        const processLevel = (startElement) => {
          let element = startElement && startElement.firstElementChild;
          while (element) {
            if (element.matches('.process')) {
              let child = element.firstElementChild;
              while (child) {
                processChild(child);
                child = child.nextElementSibling;
              }
            }
            element = element.nextElementSibling;
          }
        };
        processLevel(document.body);
      }
      `,

      // Edge case: Variables that look like traversal but aren't in while loops should still be checked normally
      `
      function normalFunction() {
        const isParentValid = checkParent();
        const hasChildElements = element.children.length > 0;
        return isParentValid && hasChildElements;
      }
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

      // Should flag boolean variables that aren't in while loops
      {
        code: `
        function regularFunction() {
          let valid = true;
          let enabled = false;
          return valid && enabled;
        }
        `,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'variable',
              name: 'valid',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'variable',
              name: 'enabled',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },

      // Should flag variables with traversal names but no traversal pattern
      {
        code: `
        function nonTraversalFunction() {
          let parent = true;
          let element = false;
          let node = isConditionMet();
          return parent && element && node;
        }
        `,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'variable',
              name: 'parent',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'variable',
              name: 'element',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'variable',
              name: 'node',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },

      // Should flag variables with traversal names used in while loops but without proper initialization
      {
        code: `
        function improperTraversal() {
          let parent = isReady();
          while (parent) {
            parent = isStillReady();
          }
        }
        `,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'variable',
              name: 'parent',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },

      // Should flag boolean variables with logical expressions that don't suggest DOM/tree traversal
      {
        code: `
        function logicalExpressions() {
          let active = user && user.isActive;
          let ready = system && system.isReady;
          while (active && ready) {
            active = checkUserStatus();
            ready = checkSystemStatus();
          }
        }
        `,
        errors: [
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'variable',
              name: 'active',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
          {
            messageId: 'missingBooleanPrefix',
            data: {
              type: 'variable',
              name: 'ready',
              prefixes:
                'is, has, does, can, should, will, was, had, did, would, must, allows, supports, needs, asserts',
            },
          },
        ],
      },
    ],
  },
);
