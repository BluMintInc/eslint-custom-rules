import { Linter } from 'eslint';
import * as tsParser from '@typescript-eslint/parser';
import { ruleTesterTs } from '../utils/ruleTester';
import { ensurePointerEventsNone } from '../rules/ensure-pointer-events-none';

const pointerEventsError = (selector = '::before') => ({
  messageId: 'missingPointerEventsNone' as const,
  data: { selector },
});

ruleTesterTs.run('ensure-pointer-events-none', ensurePointerEventsNone, {
  valid: [
    // Valid case: hit-slop touch-target extension — negative offsets only EXTEND
    // beyond the origin element's box; pointer events on a pseudo-element are
    // attributed to the origin element, so it cannot block the control
    `
      const buttonStyles = {
        position: 'relative',
        '&::before': {
          content: '""',
          position: 'absolute',
          top: '-6px',
          bottom: '-6px',
          left: 0,
          right: 0,
        },
      };
    `,
    // Valid case: hit-slop with negative numeric offsets (no unit)
    `
      const style = {
        '&::before': {
          content: '""',
          position: 'absolute',
          top: -6,
          bottom: -6,
          left: 0,
          right: 0,
        },
      };
    `,
    // Valid case: hit-slop with a single negative offset present (others absent)
    `
      const style = {
        '&::after': {
          content: '""',
          position: 'absolute',
          top: '-8px',
        },
      };
    `,
    // Valid case: horizontal hit-slop — negative on left/right only
    `
      const style = {
        '&::before': {
          content: '""',
          position: 'absolute',
          left: '-4px',
          right: '-4px',
        },
      };
    `,
    // Valid case: '&::after' hit-slop with negative offsets
    `
      const style = {
        '&::after': {
          content: '""',
          position: 'fixed',
          top: '-10px',
          bottom: '-10px',
          left: '-10px',
          right: '-10px',
        },
      };
    `,
    // Valid case: hit-slop mixing negative + zero + unknown non-inset props
    `
      const style = {
        '&::before': {
          content: '""',
          position: 'absolute',
          top: '-6px',
          bottom: 0,
          left: 0,
          right: 0,
          width: '100%',
        },
      };
    `,
    // Valid case: hit-slop written with the `inset` shorthand — the same overlay
    // as the longhand cases above, so it earns the same exemption
    `
      const style = {
        '&::before': { content: '""', position: 'absolute', inset: '-8px' },
      };
    `,
    // Valid case: hit-slop derived from a named constant — the leading literal
    // '-' fixes the direction whatever the interpolation resolves to
    `
      const HIT_SLOP = 8;
      const style = {
        '&::before': { content: '""', position: 'absolute', inset: \`-\${HIT_SLOP}px\` },
      };
    `,
    // Valid case: negative numeric shorthand
    `
      const style = {
        '&::before': { content: '""', position: 'absolute', inset: -8 },
      };
    `,
    // Valid case: two-value shorthand where both components extend outward
    `
      const style = {
        '&::after': { content: '""', position: 'absolute', inset: '-8px -4px' },
      };
    `,
    // Valid case: logical-property spellings carry the same sign semantics
    `
      const style = {
        '&::before': {
          content: '""',
          position: 'absolute',
          insetInline: '-8px',
          insetBlock: '-4px',
        },
      };
    `,
    // Valid case: a CSS function is not statically classifiable, so it neither
    // grants nor revokes the exemption the negative offset earns
    `
      const style = {
        '&::before': {
          content: '""',
          position: 'absolute',
          top: '-8px',
          bottom: 'calc(100% - 8px)',
        },
      };
    `,
    // Valid case: pseudo-element with position: absolute and pointer-events: none
    {
      code: `
        const style = {
          '&::before': {
            content: '""',
            position: 'absolute',
            width: '100%',
            height: '100%',
            pointerEvents: 'none'
          }
        };
      `,
    },
    // Valid case: pseudo-element with position: fixed and pointer-events: none
    {
      code: `
        const style = {
          '&::after': {
            content: '""',
            position: 'fixed',
            top: 0,
            left: 0,
            pointerEvents: 'none'
          }
        };
      `,
    },
    // Valid case: pseudo-element with position: relative (not absolute/fixed)
    {
      code: `
        const style = {
          '&::before': {
            content: '""',
            position: 'relative',
            width: '100%',
            height: '100%'
          }
        };
      `,
    },
    // Valid case: pseudo-element with position: static (default)
    {
      code: `
        const style = {
          '&::after': {
            content: '""',
            width: '100%',
            height: '100%'
          }
        };
      `,
    },
    // Valid case: pseudo-element with position: absolute and pointer-events: auto (intentional)
    {
      code: `
        const style = {
          '&::before': {
            content: '""',
            position: 'absolute',
            width: '100%',
            height: '100%',
            pointerEvents: 'auto' // Intentionally interactive
          }
        };
      `,
    },
    // Valid case: not a pseudo-element
    {
      code: `
        const style = {
          button: {
            position: 'absolute',
            width: '100%',
            height: '100%'
          }
        };
      `,
    },
    // Valid case: styled-components with pointer-events: none
    {
      code: `
        const Button = styled.button\`
          &::before {
            content: '';
            position: absolute;
            width: 100%;
            height: 100%;
            pointer-events: none;
          }
        \`;
      `,
    },
    // Valid case: JSX style with pointer-events: none
    {
      code: `
        const Component = () => (
          <div style={{
            '&::before': {
              content: '""',
              position: 'absolute',
              width: '100%',
              height: '100%',
              pointerEvents: 'none'
            }
          }} />
        );
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    // Valid case: pseudo-element with kebab-case pointer-events property
    {
      code: `
        const style = {
          '&::before': {
            content: '""',
            position: 'absolute',
            width: '100%',
            height: '100%',
            'pointer-events': 'none'
          }
        };
      `,
    },
    // Valid case: pseudo-element with position set via variable but not absolute/fixed
    {
      code: `
        const positionType = 'relative';
        const style = {
          '&::before': {
            content: '""',
            position: positionType,
            width: '100%',
            height: '100%'
          }
        };
      `,
    },
    // Valid case: pseudo-element with position: absolute but in a non-style object
    {
      code: `
        const config = {
          '&::before': {
            content: '""',
            position: 'absolute',
            width: '100%',
            height: '100%',
            pointerEvents: 'none'
          }
        };
      `,
    },
    // Valid case: emotion css with pointer-events: none
    {
      code: `
        const styles = css({
          '&::before': {
            content: '""',
            position: 'absolute',
            width: '100%',
            height: '100%',
            pointerEvents: 'none'
          }
        });
      `,
    },
    // Valid case: pseudo-element with position: absolute and pointer-events: inherit
    {
      code: `
        const style = {
          '&::before': {
            content: '""',
            position: 'absolute',
            width: '100%',
            height: '100%',
            pointerEvents: 'inherit'
          }
        };
      `,
    },
    // Valid case: pseudo-element with position: absolute and pointer-events set to a variable
    {
      code: `
        const pointerEventsValue = 'none';
        const style = {
          '&::before': {
            content: '""',
            position: 'absolute',
            width: '100%',
            height: '100%',
            pointerEvents: pointerEventsValue
          }
        };
      `,
    },
    // Valid case: pseudo-element with position: absolute in a nested structure
    {
      code: `
        const styles = {
          container: {
            '&::before': {
              content: '""',
              position: 'absolute',
              width: '100%',
              height: '100%',
              pointerEvents: 'none'
            }
          }
        };
      `,
    },
    // Valid case: pseudo-element with position: absolute in a dynamic property name
    {
      code: `
        const pseudoElement = '&::before';
        const style = {
          [pseudoElement]: {
            content: '""',
            position: 'absolute',
            width: '100%',
            height: '100%',
            pointerEvents: 'none'
          }
        };
      `,
    },
    // Valid case: styled-components with no position specified (defaults to static)
    {
      code: `
        const Button = styled.button\`
          &::before {
            content: '';
            width: 100%;
            height: 100%;
          }
        \`;
      `,
    },
    // Valid case: pseudo-element with position: absolute in a complex nested structure
    {
      code: `
        const theme = {
          components: {
            Button: {
              variants: {
                primary: {
                  '&::before': {
                    content: '""',
                    position: 'absolute',
                    width: '100%',
                    height: '100%',
                    pointerEvents: 'none'
                  }
                }
              }
            }
          }
        };
      `,
    },
    // Valid case: pseudo-element with position: absolute and pointer-events: none with comments in between
    {
      code: `
        const style = {
          '&::before': {
            content: '""',
            position: 'absolute',
            width: '100%',
            height: '100%',
            // This is important for accessibility
            pointerEvents: 'none'
          }
        };
      `,
    },
    // Note: The rule doesn't detect position values from variables
    {
      code: `
        const positionType = 'absolute';
        const style = {
          '&::before': {
            content: '""',
            position: positionType,
            width: '100%',
            height: '100%'
          }
        };
      `,
    },
    // Note: The rule doesn't detect pseudo-elements in computed property names
    {
      code: `
        const pseudoElement = '&::before';
        const style = {
          [pseudoElement]: {
            content: '""',
            position: 'absolute',
            width: '100%',
            height: '100%'
          }
        };
      `,
    },
    // Note: The rule allows any pointer-events value, not just 'none' or 'auto'
    {
      code: `
        const style = {
          '&::before': {
            content: '""',
            position: 'absolute',
            width: '100%',
            height: '100%',
            pointerEvents: 'all'
          }
        };
      `,
    },
    // Valid case: pseudo-element with position: absolute and pointer-events: none in a different order
    {
      code: `
        const style = {
          '&::before': {
            pointerEvents: 'none',
            content: '""',
            position: 'absolute',
            width: '100%',
            height: '100%'
          }
        };
      `,
    },
    // Note: The rule doesn't support spread operators, ternary expressions, or conditional expressions
    // These would be valid in a more advanced implementation

    // Valid case: pseudo-element with position: absolute and pointer-events: none in uppercase
    {
      code: `
        const style = {
          '&::before': {
            content: '""',
            position: 'absolute',
            width: '100%',
            height: '100%',
            pointerEvents: 'NONE'
          }
        };
      `,
    },

    // Valid case: pseudo-element with position: absolute and pointer-events: none in mixed case
    {
      code: `
        const style = {
          '&::before': {
            content: '""',
            position: 'absolute',
            width: '100%',
            height: '100%',
            pointerEvents: 'NoNe'
          }
        };
      `,
    },

    // Valid case: pseudo-element with position: absolute and pointer-events: none with extra whitespace
    {
      code: `
        const style = {
          '&::before': {
            content: '""',
            position: 'absolute',
            width: '100%',
            height: '100%',
            pointerEvents:    'none'
          }
        };
      `,
    },

    // Valid case: the exemption is spelled as a no-substitution template
    // literal. It is the same static string as 'none', so the object is already
    // exempt; reporting here would append a SECOND pointerEvents key and produce
    // output that does not compile (TS1117).
    {
      code: `
        const style = {
          '&::before': {
            content: '""',
            position: 'absolute',
            width: '100%',
            pointerEvents: \`none\`
          }
        };
      `,
    },

    // Valid case: the pointer-events: auto opt-out spelled as a template literal
    {
      code: `
        const style = {
          '&::before': {
            content: '""',
            position: \`absolute\`,
            pointerEvents: \`auto\`
          }
        };
      `,
    },

    // Valid case: the exemption's KEY is a computed template literal — still the
    // same static property name, so the object is exempt
    {
      code: `
        const style = {
          '&::before': {
            content: '""',
            position: 'absolute',
            [\`pointerEvents\`]: 'none'
          }
        };
      `,
    },

    // Valid case: an INTERPOLATED position value stays opaque. Only a
    // zero-expression template is a notation-only rewrite of a string literal;
    // anything substituted keeps the rule's conservative silence.
    {
      code: `
        const POSITION = 'absolute';
        const style = {
          '&::before': {
            content: '""',
            position: \`\${POSITION}\`,
            width: '100%'
          }
        };
      `,
    },

    // Valid case: the hit-slop carve-out survives the broadened position read —
    // both the position and the outward offset are template literals
    {
      code: `
        const style = {
          '&::before': {
            content: '""',
            position: \`absolute\`,
            top: \`-6px\`,
            bottom: \`-6px\`
          }
        };
      `,
    },
  ],
  invalid: [
    // Invalid case: pseudo-element with position: absolute but no pointer-events
    {
      code: `
        const style = {
          '&::before': {
            content: '""',
            position: 'absolute',
            width: '100%',
            height: '100%'
          }
        };
      `,
      errors: [pointerEventsError('::before')],
      output: `
        const style = {
          '&::before': {
            content: '""',
            position: 'absolute',
            width: '100%',
            height: '100%', pointerEvents: 'none'
          }
        };
      `,
    },
    // Invalid case: pseudo-element with position: fixed but no pointer-events
    {
      code: `
        const style = {
          '&::after': {
            content: '""',
            position: 'fixed',
            top: 0,
            left: 0
          }
        };
      `,
      errors: [pointerEventsError('::after')],
      output: `
        const style = {
          '&::after': {
            content: '""',
            position: 'fixed',
            top: 0,
            left: 0, pointerEvents: 'none'
          }
        };
      `,
    },
    // Invalid case: styled-components without pointer-events
    {
      code: `
        const Button = styled.button\`
          &::before {
            content: '';
            position: absolute;
            width: 100%;
            height: 100%;
          }
        \`;
      `,
      errors: [pointerEventsError('::before')],
    },
    // Invalid case: JSX style without pointer-events
    {
      code: `
        const Component = () => (
          <div style={{
            '&::before': {
              content: '""',
              position: 'absolute',
              width: '100%',
              height: '100%'
            }
          }} />
        );
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      errors: [pointerEventsError('::before')],
      output: `
        const Component = () => (
          <div style={{
            '&::before': {
              content: '""',
              position: 'absolute',
              width: '100%',
              height: '100%', pointerEvents: 'none'
            }
          }} />
        );
      `,
    },
    // Invalid case: pseudo-element with position: absolute in a style object with 'style' in the name
    {
      code: `
        const buttonStyle = {
          '&::before': {
            content: '""',
            position: 'absolute',
            width: '100%',
            height: '100%'
          }
        };
      `,
      errors: [pointerEventsError('::before')],
      output: `
        const buttonStyle = {
          '&::before': {
            content: '""',
            position: 'absolute',
            width: '100%',
            height: '100%', pointerEvents: 'none'
          }
        };
      `,
    },
    // Invalid case: emotion css without pointer-events
    {
      code: `
        const styles = css({
          '&::before': {
            content: '""',
            position: 'absolute',
            width: '100%',
            height: '100%'
          }
        });
      `,
      errors: [pointerEventsError('::before')],
      output: `
        const styles = css({
          '&::before': {
            content: '""',
            position: 'absolute',
            width: '100%',
            height: '100%', pointerEvents: 'none'
          }
        });
      `,
    },
    // Invalid case: pseudo-element with position: absolute in a nested structure
    {
      code: `
        const styles = {
          container: {
            '&::before': {
              content: '""',
              position: 'absolute',
              width: '100%',
              height: '100%'
            }
          }
        };
      `,
      errors: [pointerEventsError('::before')],
      output: `
        const styles = {
          container: {
            '&::before': {
              content: '""',
              position: 'absolute',
              width: '100%',
              height: '100%', pointerEvents: 'none'
            }
          }
        };
      `,
    },
    // Invalid case: pseudo-element with position: absolute in a complex nested structure
    {
      code: `
        const theme = {
          components: {
            Button: {
              variants: {
                primary: {
                  '&::before': {
                    content: '""',
                    position: 'absolute',
                    width: '100%',
                    height: '100%'
                  }
                }
              }
            }
          }
        };
      `,
      errors: [pointerEventsError('::before')],
      output: `
        const theme = {
          components: {
            Button: {
              variants: {
                primary: {
                  '&::before': {
                    content: '""',
                    position: 'absolute',
                    width: '100%',
                    height: '100%', pointerEvents: 'none'
                  }
                }
              }
            }
          }
        };
      `,
    },
    // Invalid case: pseudo-element with position: absolute and empty object
    {
      code: `
        const style = {
          '&::before': {
            position: 'absolute',
          }
        };
      `,
      errors: [pointerEventsError('::before')],
      output: `
        const style = {
          '&::before': {
            position: 'absolute', pointerEvents: 'none',
          }
        };
      `,
    },
    // Invalid case: pseudo-element with position: absolute in a style object with multiple properties
    {
      code: `
        const styles = {
          container: { display: 'flex' },
          '&::before': {
            content: '""',
            position: 'absolute',
            width: '100%',
            height: '100%'
          },
          '&:hover': { color: 'red' }
        };
      `,
      errors: [pointerEventsError('::before')],
      output: `
        const styles = {
          container: { display: 'flex' },
          '&::before': {
            content: '""',
            position: 'absolute',
            width: '100%',
            height: '100%', pointerEvents: 'none'
          },
          '&:hover': { color: 'red' }
        };
      `,
    },
    // Invalid case: pseudo-element with both ::before and ::after in styled-components
    {
      code: `
        const Button = styled.button\`
          &::before, &::after {
            content: '';
            position: absolute;
            width: 100%;
            height: 100%;
          }
        \`;
      `,
      errors: [pointerEventsError('::before')],
    },
    // Invalid case: pseudo-element with old single-colon syntax
    {
      code: `
        const style = {
          '&:before': {
            content: '""',
            position: 'absolute',
            width: '100%',
            height: '100%'
          }
        };
      `,
      errors: [pointerEventsError('::before')],
      output: `
        const style = {
          '&:before': {
            content: '""',
            position: 'absolute',
            width: '100%',
            height: '100%', pointerEvents: 'none'
          }
        };
      `,
    },
    // Invalid case: pseudo-element with position: absolute in a JSX spread attribute
    {
      code: `
        const pseudoStyles = {
          '&::before': {
            content: '""',
            position: 'absolute',
            width: '100%',
            height: '100%'
          }
        };
        const Component = () => (
          <div style={{...pseudoStyles}} />
        );
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      errors: [pointerEventsError('::before')],
      output: `
        const pseudoStyles = {
          '&::before': {
            content: '""',
            position: 'absolute',
            width: '100%',
            height: '100%', pointerEvents: 'none'
          }
        };
        const Component = () => (
          <div style={{...pseudoStyles}} />
        );
      `,
    },
    // Invalid case: pseudo-element with position: absolute in a deeply nested object
    {
      code: `
        const styles = {
          level1: {
            level2: {
              level3: {
                level4: {
                  '&::before': {
                    content: '""',
                    position: 'absolute',
                    width: '100%',
                    height: '100%'
                  }
                }
              }
            }
          }
        };
      `,
      errors: [pointerEventsError('::before')],
      output: `
        const styles = {
          level1: {
            level2: {
              level3: {
                level4: {
                  '&::before': {
                    content: '""',
                    position: 'absolute',
                    width: '100%',
                    height: '100%', pointerEvents: 'none'
                  }
                }
              }
            }
          }
        };
      `,
    },
    // Invalid case: pseudo-element with position: absolute in an array of styles
    {
      code: `
        const styleArray = [
          {
            '&::before': {
              content: '""',
              position: 'absolute',
              width: '100%',
              height: '100%'
            }
          }
        ];
      `,
      errors: [pointerEventsError('::before')],
      output: `
        const styleArray = [
          {
            '&::before': {
              content: '""',
              position: 'absolute',
              width: '100%',
              height: '100%', pointerEvents: 'none'
            }
          }
        ];
      `,
    },
    // Invalid case: pseudo-element with position: absolute in a function that returns styles
    {
      code: `
        function getStyles() {
          return {
            '&::before': {
              content: '""',
              position: 'absolute',
              width: '100%',
              height: '100%'
            }
          };
        }
      `,
      errors: [pointerEventsError('::before')],
      output: `
        function getStyles() {
          return {
            '&::before': {
              content: '""',
              position: 'absolute',
              width: '100%',
              height: '100%', pointerEvents: 'none'
            }
          };
        }
      `,
    },
    // Invalid case: pseudo-element with position: absolute in a style with comments
    {
      code: `
        const style = {
          '&::before': {
            content: '""',
            position: 'absolute', // This is absolute positioning
            width: '100%', // Full width
            height: '100%' // Full height
            // Missing pointer-events: none
          }
        };
      `,
      errors: [pointerEventsError('::before')],
      output: `
        const style = {
          '&::before': {
            content: '""',
            position: 'absolute', // This is absolute positioning
            width: '100%', // Full width
            height: '100%', pointerEvents: 'none' // Full height
            // Missing pointer-events: none
          }
        };
      `,
    },

    // Note: The rule doesn't detect pseudo-elements in template literals outside of styled-components
    // This would be an invalid case in a more advanced implementation

    // Invalid case: pseudo-element with position: absolute in a style with unusual formatting
    {
      code: `
        const style={
          '&::before':{
            content:'""',position:'absolute',
            width:'100%',height:'100%'
          }
        };
      `,
      errors: [pointerEventsError('::before')],
      output: `
        const style={
          '&::before':{
            content:'""',position:'absolute',
            width:'100%',height:'100%', pointerEvents: 'none'
          }
        };
      `,
    },

    // Note: The rule doesn't detect position values with different casing
    // These would be invalid cases in a more advanced implementation

    // Invalid case: full-cover overlay — all inset offsets zero (no negative),
    // so it is not a hit-slop extension and must still be flagged
    {
      code: `
        const style = {
          '&::before': {
            content: '""',
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0
          }
        };
      `,
      errors: [pointerEventsError('::before')],
      output: `
        const style = {
          '&::before': {
            content: '""',
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0, pointerEvents: 'none'
          }
        };
      `,
    },
    // Invalid case: positive-offset overlay — a positive inset is not hit-slop
    {
      code: `
        const style = {
          '&::before': {
            content: '""',
            position: 'absolute',
            top: '10px',
            left: 0
          }
        };
      `,
      errors: [pointerEventsError('::before')],
      output: `
        const style = {
          '&::before': {
            content: '""',
            position: 'absolute',
            top: '10px',
            left: 0, pointerEvents: 'none'
          }
        };
      `,
    },
    // Invalid case: mixed offsets — one negative but one positive, so it is not
    // a pure hit-slop extension and must still be flagged
    {
      code: `
        const style = {
          '&::before': {
            content: '""',
            position: 'absolute',
            top: '-6px',
            bottom: '10px'
          }
        };
      `,
      errors: [pointerEventsError('::before')],
      output: `
        const style = {
          '&::before': {
            content: '""',
            position: 'absolute',
            top: '-6px',
            bottom: '10px', pointerEvents: 'none'
          }
        };
      `,
    },
    // Invalid case: absolute overlay sized to cover with no inset offsets at all
    {
      code: `
        const style = {
          '&::after': {
            content: '""',
            position: 'absolute',
            width: '100%',
            height: '100%'
          }
        };
      `,
      errors: [pointerEventsError('::after')],
      output: `
        const style = {
          '&::after': {
            content: '""',
            position: 'absolute',
            width: '100%',
            height: '100%', pointerEvents: 'none'
          }
        };
      `,
    },
    // Invalid case: full-cover overlay via the shorthand — zero is not outward,
    // so the deliberately interactive stretched-link pattern stays flagged and
    // keeps the inline disable as its escape hatch
    {
      code: `
        const style = {
          '&::after': { content: '""', position: 'absolute', inset: 0, zIndex: 0 }
        };
      `,
      errors: [pointerEventsError('::after')],
      output: `
        const style = {
          '&::after': { content: '""', position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none' }
        };
      `,
    },
    // Invalid case: mixed shorthand — the positive component reaches inside the
    // origin box horizontally, so the overlay can occlude the control
    {
      code: `
        const style = {
          '&::before': { content: '""', position: 'absolute', inset: '-8px 4px' }
        };
      `,
      errors: [pointerEventsError('::before')],
      output: `
        const style = {
          '&::before': { content: '""', position: 'absolute', inset: '-8px 4px', pointerEvents: 'none' }
        };
      `,
    },
    // Invalid case: a positive shorthand pulls every edge inside the origin box
    {
      code: `
        const style = {
          '&::before': { content: '""', position: 'absolute', inset: '8px' }
        };
      `,
      errors: [pointerEventsError('::before')],
      output: `
        const style = {
          '&::before': { content: '""', position: 'absolute', inset: '8px', pointerEvents: 'none' }
        };
      `,
    },
    // Invalid case: a positive logical-property offset outranks a negative one
    {
      code: `
        const style = {
          '&::before': {
            content: '""',
            position: 'absolute',
            insetInline: '-8px',
            insetBlock: '8px'
          }
        };
      `,
      errors: [pointerEventsError('::before')],
      output: `
        const style = {
          '&::before': {
            content: '""',
            position: 'absolute',
            insetInline: '-8px',
            insetBlock: '8px', pointerEvents: 'none'
          }
        };
      `,
    },
    // Invalid case: an opaque interpolation does not buy the exemption
    {
      code: `
        const X = 4;
        const style = {
          '&::before': { content: '""', position: 'absolute', inset: \`\${X}px\` }
        };
      `,
      errors: [pointerEventsError('::before')],
      output: `
        const X = 4;
        const style = {
          '&::before': { content: '""', position: 'absolute', inset: \`\${X}px\`, pointerEvents: 'none' }
        };
      `,
    },
    // Invalid case: the triggering value is a no-substitution template literal —
    // a notation-only rewrite of 'absolute' that must not change the verdict
    {
      code: `
        const style = {
          '&::before': {
            content: '""',
            position: \`absolute\`,
            width: '100%',
            height: '100%'
          }
        };
      `,
      errors: [pointerEventsError('::before')],
      output: `
        const style = {
          '&::before': {
            content: '""',
            position: \`absolute\`,
            width: '100%',
            height: '100%', pointerEvents: 'none'
          }
        };
      `,
    },
    // Invalid case: the same for position: fixed, with string-literal siblings
    {
      code: `
        const style = {
          '&::after': { content: '""', position: \`fixed\`, width: '100%' }
        };
      `,
      errors: [pointerEventsError('::after')],
      output: `
        const style = {
          '&::after': { content: '""', position: \`fixed\`, width: '100%', pointerEvents: 'none' }
        };
      `,
    },
    // Invalid case: the pseudo-element SELECTOR key is a computed template
    // literal — the same static selector as '&::after'
    {
      code: `
        const style = {
          [\`&::after\`]: { content: '""', position: 'absolute', width: '100%' }
        };
      `,
      errors: [pointerEventsError('::after')],
      output: `
        const style = {
          [\`&::after\`]: { content: '""', position: 'absolute', width: '100%', pointerEvents: 'none' }
        };
      `,
    },
    // Invalid case: the position KEY is a computed template literal
    {
      code: `
        const style = {
          '&::before': { content: '""', [\`position\`]: 'absolute', width: '100%' }
        };
      `,
      errors: [pointerEventsError('::before')],
      output: `
        const style = {
          '&::before': { content: '""', [\`position\`]: 'absolute', width: '100%', pointerEvents: 'none' }
        };
      `,
    },
  ],
});

/**
 * The exemption and the fixer are two halves of one decision: whenever the rule
 * fails to SEE an existing `pointerEvents` key, it appends a second one, and an
 * object literal with two identical keys does not compile (TS1117). A
 * RuleTester `valid` case proves only that nothing was reported; this guard
 * additionally runs the fixer and inspects the text, so a future value-read that
 * misses a spelling is caught as a broken emission rather than a silent
 * behaviour change.
 */
describe('ensure-pointer-events-none autofix never duplicates pointerEvents', () => {
  const RULE_ID = 'blumint/ensure-pointer-events-none';
  const linter = new Linter();
  linter.defineParser('ts', tsParser as never);
  linter.defineRule(RULE_ID, ensurePointerEventsNone as never);

  const CONFIG = {
    parser: 'ts',
    parserOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      ecmaFeatures: { jsx: true },
    },
    rules: { [RULE_ID]: 'error' },
  } as unknown as Linter.Config;

  // Counts both the camelCase and the kebab-case spelling of the property.
  const countPointerEventsKeys = (code: string) =>
    (code.match(/pointer-?[eE]vents/g) ?? []).length;

  // Every spelling of an already-exempt overlay. Each declares exactly one
  // `pointerEvents` key, so a fix on any of them is by construction a duplicate.
  const EXEMPT_SPELLINGS: [string, string][] = [
    [
      'string-literal value',
      `const style = { '&::before': { position: 'absolute', pointerEvents: 'none' } };`,
    ],
    [
      'template-literal value',
      "const style = { '&::before': { position: 'absolute', pointerEvents: `none` } };",
    ],
    [
      'template-literal value and template-literal position',
      "const style = { '&::before': { position: `absolute`, pointerEvents: `none` } };",
    ],
    [
      'computed template-literal key',
      "const style = { '&::before': { position: 'absolute', [`pointerEvents`]: 'none' } };",
    ],
    [
      'kebab-case string key',
      `const style = { '&::before': { position: 'absolute', 'pointer-events': 'none' } };`,
    ],
    [
      'template selector key with template exemption',
      'const style = { [`&::after`]: { position: `fixed`, pointerEvents: `none` } };',
    ],
  ];

  it.each(EXEMPT_SPELLINGS)(
    'leaves an overlay exempted via %s untouched',
    (_label, code) => {
      const messages = linter.verify(code, CONFIG, 'probe.tsx');
      expect(messages.filter((m) => m.ruleId === RULE_ID)).toHaveLength(0);

      const { output } = linter.verifyAndFix(code, CONFIG, 'probe.tsx');
      expect(output).toBe(code);
      expect(countPointerEventsKeys(output)).toBe(1);
    },
  );

  // Non-vacuity: the harness must actually lint and fix something, otherwise the
  // assertions above would hold for a rule that never runs.
  it('still appends exactly one pointerEvents key when none is present', () => {
    const code = `const style = { '&::before': { position: \`absolute\` } };`;
    const messages = linter.verify(code, CONFIG, 'probe.tsx');
    expect(messages.filter((m) => m.ruleId === RULE_ID)).toHaveLength(1);

    const { output } = linter.verifyAndFix(code, CONFIG, 'probe.tsx');
    expect(output).not.toBe(code);
    expect(countPointerEventsKeys(output)).toBe(1);
  });

  // Non-vacuity: the counter must be able to see a duplicate. This is the exact
  // text the rule emitted before the template-literal read was widened.
  it('counts the duplicate key that the pre-fix rule emitted', () => {
    const brokenOutput =
      "const style = { '&::before': { position: 'absolute', pointerEvents: `none`, pointerEvents: 'none' } };";
    expect(countPointerEventsKeys(brokenOutput)).toBe(2);
  });
});
