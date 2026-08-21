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

    // Valid case: the exemption carries an `as const` assertion. An expression
    // assertion states a type and contributes no value of its own, so the
    // property still denotes 'none' and the object is already compliant.
    {
      code: `
        const style = {
          '&::before': {
            content: '""',
            position: 'absolute',
            pointerEvents: 'none' as const
          }
        };
      `,
    },

    // Valid case: the same exemption under `satisfies`
    {
      code: `
        const style = {
          '&::before': {
            content: '""',
            position: 'absolute',
            pointerEvents: 'none' satisfies string
          }
        };
      `,
    },

    // Valid case: the same exemption under a non-null assertion
    {
      code: `
        const style = {
          '&::before': {
            content: '""',
            position: 'absolute',
            pointerEvents: ('none')!
          }
        };
      `,
    },

    // Valid case: the same exemption under the angle-bracket assertion syntax
    {
      code: `
        const style = {
          '&::before': {
            content: '""',
            position: 'absolute',
            pointerEvents: <const>'none'
          }
        };
      `,
    },

    // Valid case: a CHAIN of assertions peels fully — reading only the outermost
    // wrapper would still leave the exemption unrecognised
    {
      code: `
        const style = {
          '&::before': {
            content: '""',
            position: 'absolute',
            pointerEvents: 'none' as const satisfies string
          }
        };
      `,
    },

    // Valid case: an assertion-wrapped no-substitution template still denotes
    // the same static string
    {
      code: `
        const style = {
          '&::before': {
            content: '""',
            position: 'absolute',
            pointerEvents: \`none\` as const
          }
        };
      `,
    },

    // Valid case: the pointer-events: auto opt-out is equally an assertion's to
    // carry — the assertion decides nothing about the value
    {
      code: `
        const style = {
          '&::before': {
            content: '""',
            position: 'absolute',
            pointerEvents: 'auto' as const
          }
        };
      `,
    },

    // Valid case: the assertion sits on the computed KEY rather than the value
    {
      code: `
        const style = {
          '&::before': {
            content: '""',
            position: 'absolute',
            ['pointerEvents' as const]: 'none'
          }
        };
      `,
    },

    // Valid case: an assertion-wrapped position value keeps the hit-slop
    // carve-out — widening the read must not cost an overlay its exemption
    {
      code: `
        const style = {
          '&::before': {
            content: '""',
            position: 'absolute' as const,
            top: '-6px',
            bottom: '-6px'
          }
        };
      `,
    },

    // Valid case: the OFFSETS carry the assertions too. Reading the position
    // through an assertion while leaving the offsets opaque would hand this
    // hit-slop overlay the tap-target-shrinking autofix.
    {
      code: `
        const style = {
          '&::before': {
            content: '""',
            position: 'absolute' as const,
            top: '-6px' as const,
            bottom: '-6px' as const,
            left: 0 as const,
            right: 0 as const
          }
        };
      `,
    },

    // Valid case: an interpolated template under an assertion stays opaque, so
    // the position is never recognised and the rule keeps its silence
    {
      code: `
        const POSITION = 'absolute';
        const style = {
          '&::before': {
            content: '""',
            position: \`\${POSITION}\` as const,
            width: '100%'
          }
        };
      `,
    },

    // Valid case: an empty pseudo-element object declares no position, so there
    // is nothing to report — and, by construction, nothing for the fixer's
    // empty-object guard to write a property into.
    `
const style = {
  '&::before': {},
};
`,
    // Valid case: the same object written on one line
    `
const style = { '&::after': {} };
`,
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
            height: '100%',
            pointerEvents: 'none'
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
            left: 0,
            pointerEvents: 'none'
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
              height: '100%',
              pointerEvents: 'none'
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
            height: '100%',
            pointerEvents: 'none'
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
            height: '100%',
            pointerEvents: 'none'
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
              height: '100%',
              pointerEvents: 'none'
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
            position: 'absolute',
            pointerEvents: 'none',
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
            height: '100%',
            pointerEvents: 'none'
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
            height: '100%',
            pointerEvents: 'none'
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
            height: '100%',
            pointerEvents: 'none'
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
              height: '100%',
              pointerEvents: 'none'
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
              height: '100%',
              pointerEvents: 'none'
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
            height: '100%', // Full height
            pointerEvents: 'none'
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
            width:'100%',height:'100%',
            pointerEvents: 'none'
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
            bottom: 0,
            pointerEvents: 'none'
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
            left: 0,
            pointerEvents: 'none'
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
            bottom: '10px',
            pointerEvents: 'none'
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
            height: '100%',
            pointerEvents: 'none'
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
          '&::after': {
            content: '""',
            position: 'absolute',
            inset: 0,
            zIndex: 0,
            pointerEvents: 'none',
          }
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
          '&::before': {
            content: '""',
            position: 'absolute',
            inset: '-8px 4px',
            pointerEvents: 'none',
          }
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
          '&::before': {
            content: '""',
            position: 'absolute',
            inset: '8px',
            pointerEvents: 'none',
          }
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
            insetBlock: '8px',
            pointerEvents: 'none'
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
          '&::before': {
            content: '""',
            position: 'absolute',
            inset: \`\${X}px\`,
            pointerEvents: 'none',
          }
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
            height: '100%',
            pointerEvents: 'none'
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
          '&::after': {
            content: '""',
            position: \`fixed\`,
            width: '100%',
            pointerEvents: 'none',
          }
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
          [\`&::after\`]: {
            content: '""',
            position: 'absolute',
            width: '100%',
            pointerEvents: 'none',
          }
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
          '&::before': {
            content: '""',
            [\`position\`]: 'absolute',
            width: '100%',
            pointerEvents: 'none',
          }
        };
      `,
    },
    // Invalid case: the existing pointerEvents value is a member expression, so
    // the rule cannot prove it is 'none' and the report stands. The fixer must
    // decline: the object already declares the key, and a second one is TS1117.
    {
      code: `
        const style = {
          '&::before': { content: '""', position: 'absolute', pointerEvents: theme.pointerEvents }
        };
      `,
      errors: [pointerEventsError('::before')],
      output: null,
    },
    // Invalid case: the value comes from a call
    {
      code: `
        const style = {
          '&::before': { content: '""', position: 'absolute', pointerEvents: resolvePointerEvents() }
        };
      `,
      errors: [pointerEventsError('::before')],
      output: null,
    },
    // Invalid case: the value is a ternary — one branch is 'none', the other is
    // not, so neither guessing nor appending is sound
    {
      code: `
        const style = {
          '&::before': { content: '""', position: 'absolute', pointerEvents: isDecorative ? 'none' : 'auto' }
        };
      `,
      errors: [pointerEventsError('::before')],
      output: null,
    },
    // Invalid case: the value is an INTERPOLATED template — opaque, unlike the
    // no-substitution spelling that reads as its static text
    {
      code: `
        const style = {
          '&::before': { content: '""', position: 'absolute', pointerEvents: \`\${mode}\` }
        };
      `,
      errors: [pointerEventsError('::before')],
      output: null,
    },
    // Invalid case: an unreadable value under the kebab-case key spelling
    {
      code: `
        const style = {
          '&::before': { content: '""', position: 'absolute', 'pointer-events': theme.pointerEvents }
        };
      `,
      errors: [pointerEventsError('::before')],
      output: null,
    },
    // Invalid case: an unreadable value under a computed template-literal key
    {
      code: `
        const style = {
          '&::before': { content: '""', position: 'absolute', [\`pointerEvents\`]: theme.pointerEvents }
        };
      `,
      errors: [pointerEventsError('::before')],
      output: null,
    },
    // Invalid case: the same decline inside a JSX style object
    {
      code: `
        const Component = () => (
          <div style={{
            '&::before': {
              content: '""',
              position: 'absolute',
              pointerEvents: theme.pointerEvents
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
      output: null,
    },
    // Invalid case: the same decline inside an emotion css() object
    {
      code: `
        const styles = css({
          '&::after': { content: '""', position: 'fixed', pointerEvents: getPointerEvents(theme) }
        });
      `,
      errors: [pointerEventsError('::after')],
      output: null,
    },
    // Invalid case: the same decline for an object nested under a container key
    {
      code: `
        const styles = {
          container: {
            '&::before': { content: '""', position: 'absolute', pointerEvents: theme?.overlay }
          }
        };
      `,
      errors: [pointerEventsError('::before')],
      output: null,
    },
    // Invalid case: a non-null assertion over a member expression. Peeling the
    // assertion reaches the member expression, which is still unreadable, so the
    // report stands and the fixer must still decline — appending a second
    // `pointerEvents` key would not compile.
    {
      code: `
        const style = {
          '&::before': { content: '""', position: 'absolute', pointerEvents: theme.overlay! }
        };
      `,
      errors: [pointerEventsError('::before')],
      output: null,
    },
    // Invalid case: an `as` assertion over a call — the assertion names a type,
    // it does not make the call's result knowable
    {
      code: `
        const style = {
          '&::before': { content: '""', position: 'absolute', pointerEvents: resolveEvents() as string }
        };
      `,
      errors: [pointerEventsError('::before')],
      output: null,
    },
    // Invalid case: an assertion over a ternary whose branches disagree
    {
      code: `
        const style = {
          '&::before': { content: '""', position: 'absolute', pointerEvents: (isDecorative ? 'none' : 'auto') as const }
        };
      `,
      errors: [pointerEventsError('::before')],
      output: null,
    },
    // Invalid case: an assertion over an INTERPOLATED template — the assertion
    // peels away to a template whose text is still not known statically
    {
      code: `
        const style = {
          '&::before': { content: '""', position: 'absolute', pointerEvents: \`\${mode}\` as const }
        };
      `,
      errors: [pointerEventsError('::before')],
      output: null,
    },
    // Invalid case: reading the POSITION through an assertion widens detection —
    // an overlay written `'absolute' as const` is as absolutely positioned as one
    // written 'absolute', and it does get its fix
    {
      code: `
        const style = {
          '&::before': { content: '""', position: 'absolute' as const, width: '100%' }
        };
      `,
      errors: [pointerEventsError('::before')],
      output: `
        const style = {
          '&::before': {
            content: '""',
            position: 'absolute' as const,
            width: '100%',
            pointerEvents: 'none',
          }
        };
      `,
    },
    // Invalid case: the same for the angle-bracket assertion syntax
    {
      code: `
        const style = {
          '&::after': { content: '""', position: <const>'fixed', width: '100%' }
        };
      `,
      errors: [pointerEventsError('::after')],
      output: `
        const style = {
          '&::after': {
            content: '""',
            position: <const>'fixed',
            width: '100%',
            pointerEvents: 'none',
          }
        };
      `,
    },
    // Invalid case: the assertion sits on the pseudo-element SELECTOR key, which
    // is read through the same accessor
    {
      code: `
        const style = {
          ['&::before' as const]: { content: '""', position: 'absolute', width: '100%' }
        };
      `,
      errors: [pointerEventsError('::before')],
      output: `
        const style = {
          ['&::before' as const]: {
            content: '""',
            position: 'absolute',
            width: '100%',
            pointerEvents: 'none',
          }
        };
      `,
    },
    // Invalid case: an assertion-wrapped POSITIVE offset is classified, so a
    // full-cover overlay does not slip into the hit-slop carve-out through one
    {
      code: `
        const style = {
          '&::before': { content: '""', position: 'absolute', inset: '8px' as const }
        };
      `,
      errors: [pointerEventsError('::before')],
      output: `
        const style = {
          '&::before': {
            content: '""',
            position: 'absolute',
            inset: '8px' as const,
            pointerEvents: 'none',
          }
        };
      `,
    },

    // Invalid case (#2085): the inserted property goes on a line of its own, at
    // the column the object's other properties sit at. Spliced onto the end of
    // `position: 'absolute',` instead, it puts two properties on one line of an
    // otherwise one-property-per-line object — a layout Prettier immediately
    // undoes, so the fix lands non-canonical source in the consumer's repo.
    {
      code: `
const style = {
  '&::before': {
    position: 'absolute',
  },
};
`,
      errors: [pointerEventsError('::before')],
      output: `
const style = {
  '&::before': {
    position: 'absolute',
    pointerEvents: 'none',
  },
};
`,
    },
    // Invalid case: an object written without a trailing comma keeps that style
    // — the comma the insertion needs goes on the property before it, and the
    // appended property is left bare.
    {
      code: `
const style = {
  '&::before': {
    content: '""',
    position: 'absolute'
  }
};
`,
      errors: [pointerEventsError('::before')],
      output: `
const style = {
  '&::before': {
    content: '""',
    position: 'absolute',
    pointerEvents: 'none'
  }
};
`,
    },
    // Invalid case: a comment trailing the last property documents THAT
    // property, so the insertion goes after it rather than between the property
    // and its comment.
    {
      code: `
const style = {
  '&::before': {
    position: 'absolute', // anchored to the tile
  },
};
`,
      errors: [pointerEventsError('::before')],
      output: `
const style = {
  '&::before': {
    position: 'absolute', // anchored to the tile
    pointerEvents: 'none',
  },
};
`,
    },
    // Invalid case: the same with no trailing comma — the comma is written
    // before the comment, where the layout puts it.
    {
      code: `
const style = {
  '&::after': {
    position: 'fixed' // pinned to the viewport
  }
};
`,
      errors: [pointerEventsError('::after')],
      output: `
const style = {
  '&::after': {
    position: 'fixed', // pinned to the viewport
    pointerEvents: 'none'
  }
};
`,
    },
    // Invalid case: the last property shares a line with the one before it, so
    // the column comes from the line the properties are laid out on rather than
    // from the last property's own column.
    {
      code: `
const style = {
  '&::before': {
    content: '""', position: 'absolute',
  },
};
`,
      errors: [pointerEventsError('::before')],
      output: `
const style = {
  '&::before': {
    content: '""', position: 'absolute',
    pointerEvents: 'none',
  },
};
`,
    },
    // Invalid case: the indentation is read from the file, not assumed — a
    // four-space file gets four spaces.
    {
      code: `
const style = {
    '&::before': {
        position: 'absolute',
    },
};
`,
      errors: [pointerEventsError('::before')],
      output: `
const style = {
    '&::before': {
        position: 'absolute',
        pointerEvents: 'none',
    },
};
`,
    },
    // Invalid case: a tab-indented file gets tabs, for the same reason.
    {
      code: "const style = {\n\t'&::after': {\n\t\tposition: 'fixed',\n\t},\n};\n",
      errors: [pointerEventsError('::after')],
      output:
        "const style = {\n\t'&::after': {\n\t\tposition: 'fixed',\n\t\tpointerEvents: 'none',\n\t},\n};\n",
    },
    // Invalid case: depth changes nothing — the column still comes from the
    // properties of the object being fixed.
    {
      code: `
const theme = {
  components: {
    Overlay: {
      styleOverrides: {
        root: {
          '&::after': {
            content: '""',
            position: 'absolute',
          },
        },
      },
    },
  },
};
`,
      errors: [pointerEventsError('::after')],
      output: `
const theme = {
  components: {
    Overlay: {
      styleOverrides: {
        root: {
          '&::after': {
            content: '""',
            position: 'absolute',
            pointerEvents: 'none',
          },
        },
      },
    },
  },
};
`,
    },
    // Invalid case: an object genuinely written on one line keeps both
    // properties there — Prettier leaves such an object alone while it fits, so
    // breaking it would be churn of the fixer's own making.
    {
      code: `
const style = {
  '&::after': { content: '""', position: 'fixed' },
};
`,
      errors: [pointerEventsError('::after')],
      output: `
const style = {
  '&::after': { content: '""', position: 'fixed', pointerEvents: 'none' },
};
`,
    },
    // Invalid case: past the print width the one-line layout is no longer one a
    // formatter would keep, so the object is laid out one property per line —
    // which is what the formatter would otherwise do to the emitted line.
    {
      code: `
const style = {
  '&::before': { content: '""', position: 'absolute', width: '100%', top: 0 },
};
`,
      errors: [pointerEventsError('::before')],
      output: `
const style = {
  '&::before': {
    content: '""',
    position: 'absolute',
    width: '100%',
    top: 0,
    pointerEvents: 'none',
  },
};
`,
    },
    // Invalid case: the same object under a wider `printWidth` stays on its
    // line, because that is what a formatter configured that way prints.
    {
      code: `
const style = {
  '&::before': { content: '""', position: 'absolute', width: '100%', top: 0 },
};
`,
      options: [{ printWidth: 120 }],
      errors: [pointerEventsError('::before')],
      output: `
const style = {
  '&::before': { content: '""', position: 'absolute', width: '100%', top: 0, pointerEvents: 'none' },
};
`,
    },
    // Invalid case: the mirror — an object that fits at the default width is
    // broken under a narrower `printWidth`.
    {
      code: `
const style = {
  '&::after': { content: '""', position: 'fixed' },
};
`,
      options: [{ printWidth: 40 }],
      errors: [pointerEventsError('::after')],
      output: `
const style = {
  '&::after': {
    content: '""',
    position: 'fixed',
    pointerEvents: 'none',
  },
};
`,
    },
    // Invalid case: a comment trailing the object's line is not counted toward
    // the width, so the object is appended in place exactly as it is without
    // the comment. Counting it would make the same input fix two different
    // ways depending on whether a comment happens to sit next to it.
    {
      code: `
const style = {
  '&::after': { content: '""', position: 'fixed' }, // anchored overlay
};
`,
      errors: [pointerEventsError('::after')],
      output: `
const style = {
  '&::after': { content: '""', position: 'fixed', pointerEvents: 'none' }, // anchored overlay
};
`,
    },
    // Invalid case: an unbroken container opens on the object's own line, so
    // breaking the object would drag the container with it and the formatter
    // would re-lay out both. The property is appended in place instead and the
    // layout is left to the formatter.
    {
      code: `
const style = { '&::before': { content: '""', position: 'absolute', width: '100%' } };
`,
      errors: [pointerEventsError('::before')],
      output: `
const style = { '&::before': { content: '""', position: 'absolute', width: '100%', pointerEvents: 'none' } };
`,
    },
    // Invalid case: a comment inside a one-line object has no unambiguous home
    // once the properties are spread over several lines, so the re-layout stands
    // down there too and the comment is left exactly where its author put it.
    {
      code: `
const style = {
  '&::before': { content: '""', /* full bleed */ position: 'absolute', width: '100%' },
};
`,
      errors: [pointerEventsError('::before')],
      output: `
const style = {
  '&::before': { content: '""', /* full bleed */ position: 'absolute', width: '100%', pointerEvents: 'none' },
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

  // `<const>x` and JSX cannot coexist in one parse, so the angle-bracket
  // assertion needs a configuration with JSX switched off.
  const TS_ONLY_CONFIG = {
    ...CONFIG,
    parserOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
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
    [
      'as-const value',
      `const style = { '&::before': { position: 'absolute', pointerEvents: 'none' as const } };`,
    ],
    [
      'satisfies value',
      `const style = { '&::before': { position: 'absolute', pointerEvents: 'none' satisfies string } };`,
    ],
    [
      'non-null-asserted value',
      `const style = { '&::before': { position: 'absolute', pointerEvents: ('none')! } };`,
    ],
    [
      'chained as-const satisfies value',
      `const style = { '&::before': { position: 'absolute', pointerEvents: 'none' as const satisfies string } };`,
    ],
    [
      'as-const template value under an as-const position',
      "const style = { '&::before': { position: `absolute` as const, pointerEvents: `none` as const } };",
    ],
    [
      'computed key carrying the assertion',
      `const style = { '&::before': { position: 'absolute', ['pointerEvents' as const]: 'none' } };`,
    ],
    [
      'as-const kebab-case value',
      `const style = { '&::before': { position: 'absolute', 'pointer-events': 'none' as const } };`,
    ],
    [
      'assertion on the selector key and on the exemption',
      `const style = { ['&::after' as const]: { position: 'fixed' as const, pointerEvents: 'none' as const } };`,
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

  // The angle-bracket assertion is unavailable under JSX, where `<const>` opens
  // an element. It needs a JSX-free parse to be exercised at all.
  it('leaves an overlay exempted via an angle-bracket assertion untouched', () => {
    const code = `const style = { '&::before': { position: 'absolute', pointerEvents: <const>'none' } };`;
    const messages = linter.verify(code, TS_ONLY_CONFIG, 'probe.ts');
    expect(messages.filter((m) => m.ruleId === RULE_ID)).toHaveLength(0);

    const { output } = linter.verifyAndFix(code, TS_ONLY_CONFIG, 'probe.ts');
    expect(output).toBe(code);
    expect(countPointerEventsKeys(output)).toBe(1);
  });

  // Every spelling of a `pointerEvents` value the rule cannot read. Detection
  // stays: an unreadable value might be 'auto', so the report is still useful.
  // The FIX is what must stand down — the key is already there, and appending a
  // second one emits an object literal that does not compile.
  const UNREADABLE_VALUES: [string, string][] = [
    [
      'member expression',
      `const style = { '&::before': { position: 'absolute', pointerEvents: theme.overlay } };`,
    ],
    [
      'optional-chained member expression',
      `const style = { '&::before': { position: 'absolute', pointerEvents: theme?.overlay } };`,
    ],
    [
      'call expression',
      `const style = { '&::before': { position: 'absolute', pointerEvents: resolveEvents() } };`,
    ],
    [
      'ternary',
      `const style = { '&::before': { position: 'absolute', pointerEvents: isDecorative ? 'none' : 'auto' } };`,
    ],
    [
      'interpolated template literal',
      "const style = { '&::before': { position: `absolute`, pointerEvents: `${mode}` } };",
    ],
    [
      'logical fallback',
      `const style = { '&::before': { position: 'absolute', pointerEvents: theme.overlay || 'none' } };`,
    ],
    [
      'kebab-case key with an unreadable value',
      `const style = { '&::before': { position: 'absolute', 'pointer-events': theme.overlay } };`,
    ],
    [
      'computed template-literal key with an unreadable value',
      "const style = { '&::before': { position: 'absolute', [`pointerEvents`]: theme.overlay } };",
    ],
    [
      'JSX style object',
      `const C = () => (<div style={{ '&::before': { position: 'absolute', pointerEvents: theme.overlay } }} />);`,
    ],
    [
      'emotion css() object',
      `const style = css({ '&::after': { position: 'fixed', pointerEvents: theme.overlay } });`,
    ],
    // An assertion peels away to the expression underneath, and that expression
    // is what decides readability. Wrapping an opaque value does not make it
    // readable, so these keep the #1810 decline rather than joining the exempt
    // list above.
    [
      'non-null-asserted member expression',
      `const style = { '&::before': { position: 'absolute', pointerEvents: theme.overlay! } };`,
    ],
    [
      'as-typed call expression',
      `const style = { '&::before': { position: 'absolute', pointerEvents: resolveEvents() as string } };`,
    ],
    [
      'as-const ternary',
      `const style = { '&::before': { position: 'absolute', pointerEvents: (isDecorative ? 'none' : 'auto') as const } };`,
    ],
    [
      'as-const interpolated template literal',
      "const style = { '&::before': { position: 'absolute', pointerEvents: `${mode}` as const } };",
    ],
    [
      'as-const logical fallback',
      `const style = { '&::before': { position: 'absolute', pointerEvents: (theme.overlay || 'none') as const } };`,
    ],
    [
      'chained assertions over a member expression',
      `const style = { '&::before': { position: 'absolute', pointerEvents: theme.overlay! as const satisfies string } };`,
    ],
  ];

  it.each(UNREADABLE_VALUES)(
    'declines to fix an overlay whose pointerEvents value is a %s',
    (_label, code) => {
      // Non-vacuity for the decline: a rule that stopped reporting would satisfy
      // the unchanged-output assertion below without ever reaching the fixer.
      const messages = linter.verify(code, CONFIG, 'probe.tsx');
      expect(messages.filter((m) => m.ruleId === RULE_ID)).toHaveLength(1);

      const { output } = linter.verifyAndFix(code, CONFIG, 'probe.tsx');
      expect(output).toBe(code);
      expect(countPointerEventsKeys(output)).toBe(1);
    },
  );

  // Negative control: the decline is keyed on an unreadable value under the
  // `pointerEvents` key, not on unreadable values in general. An overlay with no
  // `pointerEvents` key still gets its fix even when other values are opaque.
  it('still fixes when only a non-pointerEvents value is unreadable', () => {
    const code = `const style = { '&::before': { content: theme.content, position: 'absolute', top: unknownOffset() } };`;
    const messages = linter.verify(code, CONFIG, 'probe.tsx');
    expect(messages.filter((m) => m.ruleId === RULE_ID)).toHaveLength(1);

    const { output } = linter.verifyAndFix(code, CONFIG, 'probe.tsx');
    expect(output).not.toBe(code);
    expect(countPointerEventsKeys(output)).toBe(1);
  });

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

  // Non-vacuity for the assertion cases: the same counter must see the duplicate
  // the rule emitted before assertions were read through.
  it('counts the duplicate key an assertion-wrapped exemption used to produce', () => {
    const brokenOutput =
      "const style = { '&::before': { position: 'absolute', pointerEvents: 'none' as const, pointerEvents: 'none' } };";
    expect(countPointerEventsKeys(brokenOutput)).toBe(2);
  });

  // Non-vacuity for the unreadable-value cases: the same counter must see the
  // duplicate the rule emitted before the fixer learned to decline.
  it('counts the duplicate key an unreadable value used to produce', () => {
    const brokenOutput =
      "const style = { '&::before': { position: 'absolute', pointerEvents: theme.overlay, pointerEvents: 'none' } };";
    expect(countPointerEventsKeys(brokenOutput)).toBe(2);
  });
});
