import { noUnnecessaryMemo } from '../rules/no-unnecessary-memo';
import { ruleTesterJsx } from '../utils/ruleTester';

ruleTesterJsx.run('no-unnecessary-memo', noUnnecessaryMemo, {
  valid: [
    // Valid cases: Components with props should be memoized
    {
      code: `
import { memo } from '../../../util/memo';

export function BracketAdWithPropsUnmemoized({ id, size }) {
  return (
    <Stack
      alignItems={'center'}
      display={STACK_DISPLAY}
      justifyContent={'center'}
      pt={4}
    >
      <Ad id={id} {...size} />
    </Stack>
  );
}

export const BracketAdWithProps = memo(BracketAdWithPropsUnmemoized);
      `,
    },
    // Valid case: Component without Unmemoized suffix
    {
      code: `
export function BracketAd() {
  return (
    <Stack
      alignItems={'center'}
      display={STACK_DISPLAY}
      justifyContent={'center'}
      pt={4}
    >
      <Ad id={BRACKET_AD} {...LARGE_RECTANGLE} />
    </Stack>
  );
}
      `,
    },
    // Valid case: Component with rest props
    {
      code: `
import { memo } from '../../../util/memo';

export function GenericWrapperUnmemoized({...rest}) {
  return <div {...rest}>Content</div>;
}

export const GenericWrapper = memo(GenericWrapperUnmemoized);
      `,
    },
    // Valid case: Arrow function with props
    {
      code: `
import { memo } from '../../../util/memo';

export const BracketAdUnmemoized = ({ id, size }) => {
  return (
    <Stack
      alignItems={'center'}
      display={STACK_DISPLAY}
      justifyContent={'center'}
      pt={4}
    >
      <Ad id={id} {...size} />
    </Stack>
  );
};

export const BracketAd = memo(BracketAdUnmemoized);
      `,
    },
  ],
  invalid: [
    // Invalid case: Function component with no props
    {
      code: `
import { memo } from '../../../util/memo';

export function BracketAdUnmemoized() {
  return (
    <Stack
      alignItems={'center'}
      display={STACK_DISPLAY}
      justifyContent={'center'}
      pt={4}
    >
      <Ad id={BRACKET_AD} {...LARGE_RECTANGLE} />
    </Stack>
  );
}

export const BracketAd = memo(BracketAdUnmemoized);
      `,
      output: `
import { memo } from '../../../util/memo';

export function BracketAdUnmemoized() {
  return (
    <Stack
      alignItems={'center'}
      display={STACK_DISPLAY}
      justifyContent={'center'}
      pt={4}
    >
      <Ad id={BRACKET_AD} {...LARGE_RECTANGLE} />
    </Stack>
  );
}

export const BracketAd = // This component doesn't have props and doesn't need memo
// Suggested fix: export function BracketAd() { ... }
memo(BracketAdUnmemoized);
      `,
      errors: [{ messageId: 'noUnnecessaryMemo' }],
    },
    // Invalid case: Arrow function with no props
    {
      code: `
import { memo } from '../../../util/memo';

export const HeaderUnmemoized = () => {
  return (
    <header>
      <Logo />
      <Navigation />
    </header>
  );
};

export const Header = memo(HeaderUnmemoized);
      `,
      output: `
import { memo } from '../../../util/memo';

export const HeaderUnmemoized = () => {
  return (
    <header>
      <Logo />
      <Navigation />
    </header>
  );
};

export const Header = // This component doesn't have props and doesn't need memo
// Suggested fix: export function Header() { ... }
memo(HeaderUnmemoized);
      `,
      errors: [{ messageId: 'noUnnecessaryMemo' }],
    },
    // Invalid case: Empty parameter object
    {
      code: `
import { memo } from '../../../util/memo';

export function EmptyPropsUnmemoized({}) {
  return <div>No props needed</div>;
}

export const EmptyProps = memo(EmptyPropsUnmemoized);
      `,
      output: `
import { memo } from '../../../util/memo';

export function EmptyPropsUnmemoized({}) {
  return <div>No props needed</div>;
}

export const EmptyProps = // This component doesn't have props and doesn't need memo
// Suggested fix: export function EmptyProps() { ... }
memo(EmptyPropsUnmemoized);
      `,
      errors: [{ messageId: 'noUnnecessaryMemo' }],
    },
    // Invalid case: Function expression with no props
    {
      code: `
import { memo } from '../../../util/memo';

export const FooterUnmemoized = function() {
  return (
    <footer>
      <Copyright />
      <SocialLinks />
    </footer>
  );
};

export const Footer = memo(FooterUnmemoized);
      `,
      output: `
import { memo } from '../../../util/memo';

export const FooterUnmemoized = function() {
  return (
    <footer>
      <Copyright />
      <SocialLinks />
    </footer>
  );
};

export const Footer = // This component doesn't have props and doesn't need memo
// Suggested fix: export function Footer() { ... }
memo(FooterUnmemoized);
      `,
      errors: [{ messageId: 'noUnnecessaryMemo' }],
    },
  ],
});
