import { ruleTesterTs } from '../utils/ruleTester';
import { noCompositingLayerProps } from '../rules/no-compositing-layer-props';

const message = (property: string) =>
  `CSS property "${property}" promotes this element to its own GPU compositing layer. On a component repeated in a list or scroll view, one layer per row exhausts GPU memory and tears during scroll. Animate transform/opacity under an interaction state ('&:hover', '&:active', '&:focus-visible'), or drive a state-dependent value with a 'transition'; both are exempt. Otherwise remove it, or keep it with an eslint-disable-next-line comment giving the reason.`;

const jsx = {
  ecmaFeatures: {
    jsx: true,
  },
};

// RuleTester accepts `message`, but its typings only expose `messageId`; cast to
// any so we can assert the full string.
const error = (property: string) =>
  ({
    message: message(property),
  } as any);

ruleTesterTs.run('no-compositing-layer-props', noCompositingLayerProps, {
  valid: [
    // Valid inline styles
    {
      code: `
        const style = {
          backgroundColor: 'blue',
          transition: '0.15s ease-out all',
        };
      `,
    },
    // Valid opacity values
    {
      code: `
        const style = {
          opacity: 1,
        };
      `,
    },
    {
      code: `
        const style = {
          opacity: 0,
        };
      `,
    },
    {
      code: `
        const style = {
          opacity: 'invalid',
        };
      `,
    },
    // Valid JSX styles
    {
      code: `
        const Component = () => (
          <div style={{
            backgroundColor: 'blue',
            marginTop: '10px',
          }} />
        );
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    // Non-style objects with matching property names should be ignored
    {
      code: `
        const config = {
          transform: 'module-alias',
          filter: ['src/**/*.ts'],
          opacity: 0.5,
          perspective: 'test',
        };
      `,
    },
    // TypeScript type definitions with filter property should be ignored
    {
      code: `
        export type ListNotificationsProps = {
          status: DisplayableNotificationStatus;
          limit?: number;
          filter?: NotificationKind;
          negativeFilter?: NotificationKind;
          initialNotifications?: Notification<Date>[];
        };
      `,
    },
    {
      code: `
        interface FilterableProps {
          filter: string;
          transform: string;
          opacity: number;
        }
      `,
    },
    {
      code: `
        const jestConfig = {
          transform: {
            '^.+\\.tsx?$': 'ts-jest',
          },
          filter: ['src/**/*.ts'],
          opacity: 0.5,
          perspective: 'test',
        };
      `,
    },
    // CSS reset/identity values can't promote a layer (issue #1228)
    {
      code: `
        const style = {
          transform: 'none',
          filter: 'none',
          backdropFilter: 'none',
          contain: 'none',
          perspective: 'none',
          willChange: 'auto',
          backfaceVisibility: 'visible',
        };
      `,
    },
    // mix-blend-mode's initial value creates no stacking context (issue #1570)
    {
      code: `
        const style = {
          mixBlendMode: 'normal',
        };
      `,
    },
    // mix-blend-mode is not inherited, so these all resolve to `normal`
    {
      code: `
        const style = {
          mixBlendMode: 'initial',
        };
      `,
    },
    {
      code: `
        const style = {
          mixBlendMode: 'unset',
        };
      `,
    },
    {
      code: `
        const style = {
          mixBlendMode: 'revert',
        };
      `,
    },
    {
      code: `
        const Component = () => <Box sx={{ mixBlendMode: 'normal' }} />;
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    // Casing and !important are normalized before the lookup
    {
      code: `
        const style = {
          mixBlendMode: 'NORMAL',
        };
      `,
    },
    {
      code: `
        const style = {
          mixBlendMode: 'normal !important',
        };
      `,
    },
    // will-change opt-out keywords are non-promoting (issue #1228)
    {
      code: `
        const style = {
          willChange: 'unset',
        };
      `,
    },
    {
      code: `
        const style = {
          willChange: 'initial',
        };
      `,
    },
    // Reset values remain valid with !important and casing variations (issue #1228)
    {
      code: `
        const style = {
          transform: 'none !important',
        };
      `,
    },
    {
      code: `
        const style = {
          transform: 'NONE',
        };
      `,
    },
    // Real-world MUI sx repro from issue #1228: transform:'none' suppresses the
    // determinate bar's layer-promoting movement so width drives the fill.
    {
      code: `
        const Component = ({ value }) => (
          <Box
            sx={{
              '& .MuiLinearProgress-bar': {
                transform: 'none !important',
                width: \`\${value}%\`,
              },
            }}
          />
        );
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    // @keyframes animation stops: animating transform is the web-standard
    // GPU-accelerated pattern and must not be flagged (canonical spinner). (#1288)
    {
      code: `
        const Component = () => (
          <Box
            sx={{
              animation: 'spin 1s linear infinite',
              '@keyframes spin': {
                '0%': { transform: 'rotate(0deg)' },
                '100%': { transform: 'rotate(360deg)' },
              },
            }}
          />
        );
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    // Fractional opacity inside @keyframes (real LiveBadge pulse repro). (#1288)
    {
      code: `
        const Component = () => (
          <Box
            sx={{
              animation: 'pulse 1600ms linear infinite',
              '@keyframes pulse': {
                '0%': { opacity: 1 },
                '50%': { opacity: 0.3 },
                '100%': { opacity: 1 },
              },
            }}
          />
        );
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    // Other compositing props (filter) inside @keyframes are exempt too. (#1288)
    {
      code: `
        const style = {
          '@keyframes glow': {
            '0%': { filter: 'blur(0px)' },
            '100%': { filter: 'blur(4px)' },
          },
        };
      `,
    },
    // Dynamically-named @keyframes via a computed template-literal key must
    // still exempt its animation stops. (#1288)
    {
      code: `
        const animationStyle = {
          [\`@keyframes \${name}\`]: {
            from: { transform: 'scale(1)' },
            to: { transform: 'scale(1.5)' },
          },
        };
      `,
    },
    // Issue #2353 repro: a non-JSX data module whose keys are not CSS
    // properties in any spelling. The value `transparent` must not select a
    // report, and `spotFill`/`desktop`/`mobile` must never be named as CSS
    // properties.
    {
      code: `
        export const TOUR_VARIANT_STYLES = {
          tour: {
            spotBorder: '2px solid #fff',
            spotFill: 'transparent',
            spotShade: { desktop: '#0009', mobile: '#000c' },
          },
          edit: {
            spotFill: 'transparent',
            spotShade: { desktop: 'transparent', mobile: '#0004' },
          },
          gate: {
            spotFill: '#ffffff14',
            spotShade: { desktop: 'transparent', mobile: 'transparent' },
          },
        };
      `,
    },
    // A key that is not a CSS property in any spelling is never named as one,
    // whatever its value reads. (#2353)
    {
      code: `
        const style = {
          spotFill: 'transparent',
        };
      `,
    },
    {
      code: `
        const TOUR_STYLES = {
          spotShade: { desktop: 'transparent', mobile: 'transparent' },
        };
      `,
    },
    // The narrowing applies to the transform functions too: a transform function
    // can only promote a layer through a property that accepts one, and
    // `spotTransform` is not such a property. (#2353)
    {
      code: `
        const style = {
          spotTransform: 'translate3d(0, 0, 0)',
        };
      `,
    },
    // A transparent paint allocates no texture and promotes no compositing
    // layer in any browser, so `transparent` never selects a report whatever
    // property it sits under — not even a genuine color property. Pinned at two
    // properties so the value cannot creep back for one of them. (#2353)
    {
      code: `
        const style = {
          backgroundColor: 'transparent',
        };
      `,
    },
    {
      code: `
        const style = {
          borderColor: 'transparent',
        };
      `,
    },
    // Same gate under an sx prop, where a non-CSS key is just as possible. (#2353)
    {
      code: `
        const Component = () => <Box sx={{ spotFill: 'transparent' }} />;
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },

    // --- Arm A: a singular interaction state (exemptInteractionStates) ---
    // A hover lift: `:hover` matches one element per pointer however many
    // siblings share the style, so it can never promote a whole list.
    {
      code: `
        const Card = () => (
          <Box sx={{ '&:hover': { transform: 'translateY(-2px)' } }} />
        );
      `,
      parserOptions: jsx,
    },
    // Pressed and keyboard-focused states are singular too.
    {
      code: `
        const Tile = () => (
          <Box
            sx={{
              '&:active': { transform: 'scale(0.98)' },
              '&:focus-visible': { opacity: 0.8 },
            }}
          />
        );
      `,
      parserOptions: jsx,
    },
    // A comma list qualifies when EVERY member carries an interaction state.
    {
      code: `
        const Chip = () => (
          <Box sx={{ '&:hover, &.Mui-focusVisible': { transform: 'scale(1.05)' } }} />
        );
      `,
      parserOptions: jsx,
    },
    // `@media`, `@supports` and `@container` are skipped when finding the
    // selector above the declaration, whichever side of it they sit on.
    {
      code: `
        const Card = () => (
          <Box
            sx={{
              '&:hover': {
                '@media (hover: hover)': { transform: 'translateY(-2px)' },
              },
              '@supports (translate: 0)': {
                '&:active': { translate: '0 1px' },
              },
              '@container (min-width: 400px)': {
                '&:focus-visible': { opacity: 0.9 },
              },
            }}
          />
        );
      `,
      parserOptions: jsx,
    },
    // The state sits on the styled element's own compound and the declaration
    // lands on a descendant: one hovered element's icon moves.
    {
      code: `
        const Row = () => (
          <Box sx={{ '&:hover .chevron': { transform: 'translateX(4px)' } }} />
        );
      `,
      parserOptions: jsx,
    },
    // A pseudo-class to the RIGHT of `&` qualifies: only the hovered row moves.
    {
      code: `
        const List = () => (
          <Box sx={{ '& .row:hover': { transform: 'translateX(2px)' } }} />
        );
      `,
      parserOptions: jsx,
    },
    // emotion attaches a key opening with `:` to the parent compound, so
    // `':hover'` is `'&:hover'`.
    {
      code: `
        const Link = () => <Box sx={{ ':hover': { opacity: 0.7 } }} />;
      `,
      parserOptions: jsx,
    },
    // Nested selector keys compose: `&:hover` then `& .icon` is `&:hover .icon`.
    {
      code: `
        const Button = () => (
          <Box
            sx={{
              '&:hover': {
                '& .icon': { transform: 'rotate(90deg)' },
              },
            }}
          />
        );
      `,
      parserOptions: jsx,
    },
    // Arm A needs no withholding inside iteration: a hover lift on every row
    // of a mapped list still promotes only the row under the pointer.
    {
      code: `
        const List = ({ items }) => (
          <>
            {items.map((item) => (
              <Box key={item.id} sx={{ '&:hover': { transform: 'scale(1.02)' } }} />
            ))}
          </>
        );
      `,
      parserOptions: jsx,
    },
    // The individual transform properties are exempt under the same states.
    {
      code: `
        const Fab = () => (
          <Box
            sx={{
              '&:hover': { scale: 1.05 },
              '&:active': { rotate: '90deg', translate: '0 -2px' },
            }}
          />
        );
      `,
      parserOptions: jsx,
    },
    // Their reset/identity values promote nothing at rest.
    {
      code: `
        const style = {
          scale: 'none',
          rotate: 'none',
          translate: 'none',
        };
      `,
    },
    {
      code: `
        const style = {
          scale: 1,
        };
      `,
    },
    // A template literal with no substitutions spells its literal exactly.
    {
      code: `
        const style = {
          transform: \`none\`,
        };
      `,
    },
    // With the state-transition arm switched off, the interaction arm still
    // stands on its own.
    {
      code: `
        const Card = () => (
          <Box sx={{ '&:hover': { transform: 'translateY(-2px)' } }} />
        );
      `,
      options: [{ exemptStateTransitions: false }],
      parserOptions: jsx,
    },

    // --- Arm B: a state-driven value paired with a covering transition
    // (exemptStateTransitions) ---
    // A non-literal value whose transition names the property. Transitions
    // never run on first paint, so only the element whose state flipped
    // animates, and only while it animates.
    {
      code: `
        const Chevron = ({ isOpen }) => (
          <Box
            sx={{
              transform: isOpen ? 'rotate(180deg)' : 'none',
              transition: 'transform 200ms ease',
            }}
          />
        );
      `,
      parserOptions: jsx,
    },
    // A conditionally spread object is state-driven, and the transition may
    // sit in an ancestor object.
    {
      code: `
        const Row = ({ isHidden }) => (
          <Box
            sx={{
              transition: 'opacity 150ms',
              ...(isHidden && { opacity: 0.4 }),
            }}
          />
        );
      `,
      parserOptions: jsx,
    },
    // A key under an `&`-qualified state selector is state-driven.
    {
      code: `
        const Summary = () => (
          <Box
            sx={{
              transition: 'transform 150ms',
              '&.Mui-expanded': { transform: 'rotate(180deg)' },
            }}
          />
        );
      `,
      parserOptions: jsx,
    },
    // `all` covers every property.
    {
      code: `
        const Zone = ({ isHovered }) => (
          <Box
            sx={{
              scale: isHovered ? 1.25 : 1,
              transition: 'all 0.2s ease-in-out',
            }}
          />
        );
      `,
      parserOptions: jsx,
    },
    // A transition item naming no property animates `all`, the shorthand's
    // initial transition-property.
    {
      code: `
        const Panel = ({ offset }) => (
          <Box
            sx={{
              transform: \`translateX(\${offset}px)\`,
              transition: '200ms ease-out',
            }}
          />
        );
      `,
      parserOptions: jsx,
    },
    // An expression the rule cannot read is trusted to cover the property.
    {
      code: `
        const Drawer = ({ isOpen, theme }) => (
          <Box
            sx={{
              transform: isOpen ? 'none' : 'translateX(-100%)',
              transition: theme.transitions.create('transform'),
            }}
          />
        );
      `,
      parserOptions: jsx,
    },
    {
      code: `
        const Drawer = ({ isOpen }) => (
          <Box
            sx={{
              transition: createTransition({ property: 'opacity' }),
              ...(isOpen ? {} : { opacity: 0.5 }),
            }}
          />
        );
      `,
      parserOptions: jsx,
    },
    // transitionProperty naming the property covers it, as does a state
    // attribute on the styled element.
    {
      code: `
        const Disclosure = () => (
          <Box
            sx={{
              transitionProperty: 'opacity, transform',
              transitionDuration: '200ms',
              '&[aria-expanded="true"]': { transform: 'rotate(90deg)' },
            }}
          />
        );
      `,
      parserOptions: jsx,
    },
    // MUI's array sx merges its entries onto one element, so a transition in a
    // sibling entry covers a conditional entry.
    {
      code: `
        const Chevron = ({ isOpen }) => (
          <Box
            sx={[
              { transition: 'transform 200ms' },
              isOpen && { transform: 'rotate(180deg)' },
            ]}
          />
        );
      `,
      parserOptions: jsx,
    },
    // A plain style object outside JSX takes the same arm.
    {
      code: `
        const chevronStyle = (isOpen) => ({
          transform: isOpen ? 'rotate(180deg)' : 'none',
          WebkitTransition: 'transform 0.2s',
        });
      `,
    },
    // A responsive value is state-driven when every breakpoint entry is either
    // state-driven or a reset.
    {
      code: `
        const Chevron = ({ isOpen }) => (
          <Box
            sx={{
              transform: { xs: 'none', md: isOpen ? 'rotate(180deg)' : 'none' },
              transition: 'transform 200ms',
            }}
          />
        );
      `,
      parserOptions: jsx,
    },
    // With the interaction arm switched off, the state-transition arm still
    // stands on its own.
    {
      code: `
        const Chevron = ({ isOpen }) => (
          <Box
            sx={{
              transform: isOpen ? 'rotate(180deg)' : 'none',
              transition: 'transform 200ms',
            }}
          />
        );
      `,
      options: [{ exemptInteractionStates: false }],
      parserOptions: jsx,
    },
    // A hover lift beside its transition token.
    {
      code: `
        const Card = () => (
          <Box
            sx={{
              transition: TRANSITIONS.transform,
              '&:hover': { transform: 'translateY(-2px)' },
            }}
          />
        );
      `,
      parserOptions: jsx,
    },
    {
      code: `
        const Card = () => (
          <Box sx={{ '&:hover, &:focus-visible': { transform: 'translateY(-1px)' } }} />
        );
      `,
      parserOptions: jsx,
    },
    {
      code: `
        const Card = () => (
          <Box
            sx={{
              '@media (hover: hover)': { '&:hover': { transform: 'scale(1.02)' } },
            }}
          />
        );
      `,
      parserOptions: jsx,
    },
    // MUI's singular interaction classes: keyboard focus, and the slider thumb
    // being dragged.
    {
      code: `
        const Thumb = () => (
          <Box
            sx={{
              '&.Mui-focusVisible': { transform: 'scale(1.02)' },
              '&.Mui-active': { scale: 1.2 },
            }}
          />
        );
      `,
      parserOptions: jsx,
    },
    // A template-literal selector key is read from its quasis.
    {
      code: `
        const Card = () => (
          <Box sx={{ [\`&:hover\`]: { transform: 'scale(1.05)' } }} />
        );
      `,
      parserOptions: jsx,
    },
    // A conditionally spread rotation beside an unreadable transition token.
    {
      code: `
        const Chevron = ({ isEditing }) => (
          <KeyboardArrowDownRoundedIcon
            sx={{
              transition: TRANSITIONS.transform,
              ...(isEditing && { transform: 'rotate(180deg)' }),
            }}
          />
        );
      `,
      parserOptions: jsx,
    },
    // A drawer sliding on a flag.
    {
      code: `
        const Drawer = ({ isChannelListVisible }) => (
          <Box
            sx={{
              transform: \`translateX(\${isChannelListVisible ? '0' : '-100%'})\`,
              transformOrigin: 'left center',
              transition: 'transform 0.3s ease-in-out',
            }}
          />
        );
      `,
      parserOptions: jsx,
    },
    // A conditional transition covers through the branch that animates.
    {
      code: `
        const Swipe = ({ translateX, isDragging }) => (
          <Box
            sx={{
              transform: \`translateX(\${translateX}px)\`,
              transition: isDragging ? 'none' : TRANSITIONS.transform,
            }}
          />
        );
      `,
      parserOptions: jsx,
    },
    {
      code: `
        const Disclosure = () => (
          <Box
            sx={{
              transition: 'all 150ms',
              '&[aria-expanded="true"]': { transform: 'rotate(180deg)' },
            }}
          />
        );
      `,
      parserOptions: jsx,
    },
    {
      code: `
        const Zone = ({ open }) => (
          <Box sx={{ scale: open ? 1.25 : 1, transition: 'scale 0.2s' }} />
        );
      `,
      parserOptions: jsx,
    },
    // The @keyframes exemption does not depend on either option.
    {
      code: `
        const Spinner = () => (
          <Box
            sx={{
              animation: 'spin 1s linear infinite',
              '@keyframes spin': {
                '0%': { transform: 'rotate(0deg)' },
                '100%': { transform: 'rotate(360deg)' },
              },
            }}
          />
        );
      `,
      options: [
        { exemptInteractionStates: false, exemptStateTransitions: false },
      ],
      parserOptions: jsx,
    },
  ],
  invalid: [
    // Invalid inline styles
    {
      code: `
        const style = {
          filter: 'brightness(110%)',
        };
      `,
      errors: [error('filter')],
    },
    {
      code: `
        const style = {
          backdropFilter: 'blur(10px)',
        };
      `,
      errors: [error('backdropFilter')],
    },
    {
      code: `
        const style = {
          transform: 'translate3d(0, 0, 0)',
        };
      `,
      errors: [error('transform')],
    },
    {
      code: `
        const style = {
          willChange: 'transform',
        };
      `,
      errors: [error('willChange')],
    },
    {
      code: `
        const style = {
          perspective: '1000px',
        };
      `,
      errors: [error('perspective')],
    },
    {
      code: `
        const style = {
          backfaceVisibility: 'hidden',
        };
      `,
      errors: [error('backfaceVisibility')],
    },
    {
      code: `
        const style = {
          mixBlendMode: 'multiply',
        };
      `,
      errors: [error('mixBlendMode')],
    },
    {
      code: `
        const style = {
          mixBlendMode: 'screen',
        };
      `,
      errors: [error('mixBlendMode')],
    },
    // `inherit` can resolve to a blending value set higher up, so it is not an
    // opt-out the way the other global keywords are (issue #1570)
    {
      code: `
        const style = {
          mixBlendMode: 'inherit',
        };
      `,
      errors: [error('mixBlendMode')],
    },
    // Invalid fractional opacity
    {
      code: `
        const style = {
          opacity: 0.99,
        };
      `,
      errors: [error('opacity')],
    },
    // Invalid JSX styles
    {
      code: `
        const Component = () => (
          <div style={{
            filter: 'brightness(110%)',
            transform: 'translate3d(0, 0, 0)',
          }} />
        );
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      errors: [error('filter'), error('transform')],
    },
    // Controls: real layer-promoting values still fire even though the same
    // property has a reset/identity allowlist entry (issue #1228).
    {
      code: `
        const style = {
          transform: 'rotate(45deg)',
        };
      `,
      errors: [error('transform')],
    },
    {
      code: `
        const style = {
          filter: 'blur(2px)',
        };
      `,
      errors: [error('filter')],
    },
    {
      code: `
        const style = {
          willChange: 'transform',
        };
      `,
      errors: [error('willChange')],
    },
    {
      code: `
        const style = {
          backfaceVisibility: 'hidden',
        };
      `,
      errors: [error('backfaceVisibility')],
    },
    {
      code: `
        const style = {
          contain: 'layout',
        };
      `,
      errors: [error('contain')],
    },
    {
      code: `
        const style = {
          perspective: '1000px',
        };
      `,
      errors: [error('perspective')],
    },
    // 'none' is non-promoting only for the property it resets — an unrelated
    // value like 'visible' on backface-visibility is its non-promoting default,
    // but 'visible' is NOT a valid no-op for transform, so transform still fires.
    {
      code: `
        const style = {
          transform: 'visible',
        };
      `,
      errors: [error('transform')],
    },
    // Regression control: the @keyframes exemption is scoped to descendants of
    // the @keyframes value object only. A STATIC compositing prop sitting as a
    // sibling of the @keyframes key is still flagged. (#1288)
    {
      code: `
        const Component = () => (
          <Box
            sx={{
              transform: 'rotate(45deg)',
              '@keyframes spin': {
                '0%': { transform: 'rotate(0deg)' },
                '100%': { transform: 'rotate(360deg)' },
              },
            }}
          />
        );
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      errors: [error('transform')],
    },
    // Controls for the value-driven arm's key gate: a vendor-prefixed transform
    // is a real CSS property, so a layer-promoting transform function under it
    // still reports even though COMPOSITING_PROPERTIES lists only `transform`.
    {
      code: `
        const style = {
          WebkitTransform: 'translate3d(0, 0, 0)',
        };
      `,
      errors: [error('WebkitTransform')],
    },
    {
      code: `
        const style = {
          '-webkit-transform': 'translate3d(0, 0, 0)',
        };
      `,
      errors: [error('-webkit-transform')],
    },
    {
      code: `
        const style = {
          MozTransform: 'scale3d(1, 1, 2)',
        };
      `,
      errors: [error('MozTransform')],
    },
    {
      code: `
        const style = {
          msTransform: 'translateZ(0)',
        };
      `,
      errors: [error('msTransform')],
    },
    // Controls that the property-driven arm is untouched by the key gate, in
    // both the plain-object and sx positions.
    {
      code: `
        const style = {
          willChange: 'transform',
          backdropFilter: 'blur(10px)',
          transform: 'scale3d(1, 1, 2)',
        };
      `,
      errors: [
        error('willChange'),
        error('backdropFilter'),
        error('transform'),
      ],
    },
    {
      code: `
        const Component = () => (
          <Box sx={{ willChange: 'transform', filter: 'blur(2px)' }} />
        );
      `,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      errors: [error('willChange'), error('filter')],
    },

    // --- Arm A boundaries ---
    // An ancestor pseudo-class left of `&` matches every child at once, so it
    // never qualifies.
    {
      code: `
        const Item = () => (
          <Box sx={{ '.MuiList-root:hover &': { transform: 'translateX(4px)' } }} />
        );
      `,
      parserOptions: jsx,
      errors: [error('transform')],
    },
    // One unqualified member of a comma list applies the value at rest.
    {
      code: `
        const Chip = () => (
          <Box sx={{ '&:hover, & .label': { transform: 'scale(1.05)' } }} />
        );
      `,
      parserOptions: jsx,
      errors: [error('transform')],
    },
    // A negated state matches every element NOT in it.
    {
      code: `
        const Row = () => (
          <Box sx={{ '&:not(:hover)': { opacity: 0.6 } }} />
        );
      `,
      parserOptions: jsx,
      errors: [error('opacity')],
    },
    // An at-rule alone is not a state: the declaration applies at rest.
    {
      code: `
        const Card = () => (
          <Box sx={{ '@media (hover: hover)': { transform: 'translateY(-2px)' } }} />
        );
      `,
      parserOptions: jsx,
      errors: [error('transform')],
    },
    // The never-exempt set stays reported under an interaction state: a hover
    // brighten is a lighter color, not a filter.
    {
      code: `
        const Card = () => (
          <Box
            sx={{
              '&:hover': {
                filter: 'brightness(1.1)',
                backdropFilter: 'blur(4px)',
                willChange: 'transform',
                mixBlendMode: 'multiply',
              },
            }}
          />
        );
      `,
      parserOptions: jsx,
      errors: [
        error('filter'),
        error('backdropFilter'),
        error('willChange'),
        error('mixBlendMode'),
      ],
    },
    {
      code: `
        const Card = () => (
          <Box
            sx={{
              '&:hover': {
                perspective: '800px',
                backfaceVisibility: 'hidden',
                contain: 'paint',
              },
            }}
          />
        );
      `,
      parserOptions: jsx,
      errors: [
        error('perspective'),
        error('backfaceVisibility'),
        error('contain'),
      ],
    },
    // A 3D transform promotes a layer in every state, as a function or as the
    // 3D form of an individual transform property.
    {
      code: `
        const Card = () => (
          <Box
            sx={{
              '&:hover': { transform: 'translate3d(0, -2px, 0)' },
              '&:active': { transform: 'rotateY(180deg)' },
              '&:focus-visible': { translate: '0 0 10px', rotate: 'x 45deg' },
            }}
          />
        );
      `,
      parserOptions: jsx,
      errors: [
        error('transform'),
        error('transform'),
        error('translate'),
        error('rotate'),
      ],
    },
    {
      code: `
        const Flip = ({ isFlipped }) => (
          <Box
            sx={{
              transform: isFlipped ? 'rotateY(180deg)' : 'none',
              transition: 'transform 300ms',
            }}
          />
        );
      `,
      parserOptions: jsx,
      errors: [error('transform')],
    },
    // The interaction arm switched off reports the hover lift.
    {
      code: `
        const Card = () => (
          <Box sx={{ '&:hover': { transform: 'translateY(-2px)' } }} />
        );
      `,
      options: [{ exemptInteractionStates: false }],
      parserOptions: jsx,
      errors: [error('transform')],
    },

    // --- Arm B boundaries ---
    // A transform or fractional opacity at rest stays reported even beside a
    // transition: nothing flips, so the layer is permanent.
    {
      code: `
        const Badge = () => (
          <Box
            sx={{
              transform: 'rotate(45deg)',
              opacity: 0.6,
              transition: 'transform 200ms, opacity 200ms',
            }}
          />
        );
      `,
      parserOptions: jsx,
      errors: [error('transform'), error('opacity')],
    },
    // A responsive object or array varies by breakpoint, not by state: one
    // resting entry keeps the report beside a transition, as does a literal
    // behind a type assertion.
    {
      code: `
        const Tile = () => (
          <Box
            sx={{
              transform: { xs: 'none', md: 'scale(1.05)' },
              transition: 'transform 200ms',
            }}
          />
        );
      `,
      parserOptions: jsx,
      errors: [error('transform')],
    },
    {
      code: `
        const Tile = () => (
          <Box
            sx={{
              transform: ['none', 'translateY(-4px)'],
              transition: 'transform 200ms',
            }}
          />
        );
      `,
      parserOptions: jsx,
      errors: [error('transform')],
    },
    {
      code: `
        const tileStyle = {
          transform: 'scale(1.05)' as const,
          transition: 'transform 200ms',
        };
      `,
      errors: [error('transform')],
    },
    // State-driven with no transition at all.
    {
      code: `
        const Chevron = ({ isOpen }) => (
          <Box sx={{ transform: isOpen ? 'rotate(180deg)' : 'none' }} />
        );
      `,
      parserOptions: jsx,
      errors: [error('transform')],
    },
    // A transition that does not name the property, or animates nothing.
    {
      code: `
        const Chevron = ({ isOpen }) => (
          <Box
            sx={{
              transform: isOpen ? 'rotate(180deg)' : 'none',
              transition: 'background-color 150ms',
            }}
          />
        );
      `,
      parserOptions: jsx,
      errors: [error('transform')],
    },
    {
      code: `
        const Chevron = ({ isOpen }) => (
          <Box
            sx={{
              transform: isOpen ? 'rotate(180deg)' : 'none',
              transition: 'none',
            }}
          />
        );
      `,
      parserOptions: jsx,
      errors: [error('transform')],
    },
    {
      code: `
        const Chevron = ({ isOpen }) => (
          <Box
            sx={{
              transitionProperty: 'opacity',
              '&.Mui-expanded': { transform: 'rotate(180deg)' },
            }}
          />
        );
      `,
      parserOptions: jsx,
      errors: [error('transform')],
    },
    // `transform` and `scale` are separate animatable properties, so a
    // transform transition never covers `scale`.
    {
      code: `
        const Zone = ({ isHovered }) => (
          <Box
            sx={{
              scale: isHovered ? 1.25 : 1,
              transition: 'transform 0.2s',
            }}
          />
        );
      `,
      parserOptions: jsx,
      errors: [error('scale')],
    },
    // An ancestor state flips every child together, and a static variant
    // class never flips.
    {
      code: `
        const Icon = () => (
          <Box
            sx={{
              transition: 'transform 200ms',
              '.Mui-expanded &': { transform: 'rotate(180deg)' },
              '&.MuiButton-sizeSmall': { transform: 'scale(0.9)' },
            }}
          />
        );
      `,
      parserOptions: jsx,
      errors: [error('transform'), error('transform')],
    },
    // Withheld inside lexical iteration, where many siblings can be "on" at
    // once: .map, .flatMap, .forEach and Array.from callbacks.
    {
      code: `
        const List = ({ rows }) => (
          <>
            {rows.map((row) => (
              <Box
                key={row.id}
                sx={{
                  transform: row.isOpen ? 'rotate(180deg)' : 'none',
                  transition: 'transform 200ms',
                }}
              />
            ))}
          </>
        );
      `,
      parserOptions: jsx,
      errors: [error('transform')],
    },
    {
      code: `
        const Grid = ({ groups }) => (
          <>
            {groups.flatMap((group) =>
              group.cells.map((cell) => (
                <Box
                  key={cell.id}
                  sx={{ transition: 'opacity 120ms', ...(cell.isDimmed && { opacity: 0.5 }) }}
                />
              )),
            )}
          </>
        );
      `,
      parserOptions: jsx,
      errors: [error('opacity')],
    },
    {
      code: `
        const Dots = ({ count, active }) => (
          <>
            {Array.from({ length: count }, (_, index) => (
              <Box
                key={index}
                sx={{
                  scale: index === active ? 1.4 : 1,
                  transition: 'scale 150ms',
                }}
              />
            ))}
          </>
        );
      `,
      parserOptions: jsx,
      errors: [error('scale')],
    },
    {
      code: `
        items.forEach((item) => {
          const rowStyle = {
            transform: item.isOpen ? 'rotate(90deg)' : 'none',
            transition: 'transform 200ms',
          };
          register(rowStyle);
        });
      `,
      errors: [error('transform')],
    },
    // A renderItem-style render prop is called once per item.
    {
      code: `
        const Feed = ({ items }) => (
          <VirtualList
            items={items}
            renderItem={(item) => (
              <Box
                sx={{
                  transform: item.isNew ? 'translateY(-4px)' : 'none',
                  transition: 'transform 200ms',
                }}
              />
            )}
          />
        );
      `,
      parserOptions: jsx,
      errors: [error('transform')],
    },
    // The state-transition arm switched off reports the chevron.
    {
      code: `
        const Chevron = ({ isOpen }) => (
          <Box
            sx={{
              transform: isOpen ? 'rotate(180deg)' : 'none',
              transition: 'transform 200ms',
            }}
          />
        );
      `,
      options: [{ exemptStateTransitions: false }],
      parserOptions: jsx,
      errors: [error('transform')],
    },
    // Both arms switched off restores the unconditional report.
    {
      code: `
        const Card = ({ isOpen }) => (
          <Box
            sx={{
              '&:hover': { transform: 'translateY(-2px)' },
              ...(isOpen && { opacity: 0.5 }),
              transition: 'all 200ms',
            }}
          />
        );
      `,
      options: [
        { exemptInteractionStates: false, exemptStateTransitions: false },
      ],
      parserOptions: jsx,
      errors: [error('transform'), error('opacity')],
    },

    // --- The individual transform properties join the property set ---
    {
      code: `
        const style = {
          scale: 1.1,
          rotate: '45deg',
          translate: '4px 0',
        };
      `,
      errors: [error('scale'), error('rotate'), error('translate')],
    },
    {
      code: `
        const Zone = () => <Box sx={{ scale: 1.2 }} />;
      `,
      parserOptions: jsx,
      errors: [error('scale')],
    },
    {
      code: `
        const Card = () => (
          <Box sx={{ '&:hover': { transform: 'translateZ(0)' } }} />
        );
      `,
      parserOptions: jsx,
      errors: [error('transform')],
    },
    {
      code: `
        const Chip = () => (
          <Box sx={{ '&:hover, &.selected': { transform: 'scale(1.02)' } }} />
        );
      `,
      parserOptions: jsx,
      errors: [error('transform')],
    },
    // An ancestor state attribute flips every child together.
    {
      code: `
        const Icon = () => (
          <Box
            sx={{
              transition: 'transform 200ms',
              '[aria-expanded="true"] &': { transform: 'rotate(180deg)' },
            }}
          />
        );
      `,
      parserOptions: jsx,
      errors: [error('transform')],
    },
    // Only the declaration at rest reports; its hovered twin is exempt.
    {
      code: `
        const Row = () => (
          <Box
            sx={{
              '&:hover': { opacity: 0.5 },
              opacity: 0.5,
            }}
          />
        );
      `,
      parserOptions: jsx,
      errors: [{ ...error('opacity'), line: 6 }],
    },
    // A conditional transition with no animating branch covers nothing.
    {
      code: `
        const Swipe = ({ translateX, isDragging }) => (
          <Box
            sx={{
              transform: \`translateX(\${translateX}px)\`,
              transition: isDragging ? 'none' : 'color 150ms',
            }}
          />
        );
      `,
      parserOptions: jsx,
      errors: [error('transform')],
    },
  ],
});
