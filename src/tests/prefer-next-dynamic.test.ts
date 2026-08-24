import { ruleTesterJsx, ruleTesterTs } from '../utils/ruleTester';
import { preferNextDynamic } from '../rules/prefer-next-dynamic';

const ts = ruleTesterTs;
const jsx = ruleTesterJsx;

jsx.run('prefer-next-dynamic (JSX scenarios)', preferNextDynamic, {
  valid: [
    // Already using dynamic with async and ssr:false
    {
      code: `import dynamic from 'next/dynamic';
const EmojiPicker = dynamic(async () => { const mod = await import('@emoji-mart/react'); return mod.default }, { ssr: false });
const App = () => <EmojiPicker/>;`,
    },
    // useDynamic but not used as a component (no JSX usage) => should be ignored
    {
      code: `import { useDynamic } from '../../hooks/useDynamic';
const someUtility = useDynamic(import('../utils/someUtility'));
function fn(){ console.log(someUtility); }`,
    },
    // useDynamic from an unapproved source should be ignored
    {
      code: `import { useDynamic } from 'some-library';
const Widget = useDynamic(import('widget'));
const App = () => <Widget/>;`,
    },
    // Custom allowed sources should disable default paths
    {
      code: `import { useDynamic } from '../../hooks/useDynamic';
const EmojiPicker = useDynamic(import('@emoji-mart/react'));
const App = () => <EmojiPicker/>;`,
      options: [{ useDynamicSources: ['@org/useDynamic'] }],
    },
    // The fix's own output at a nested landing depth is a fixed point of this
    // rule: re-linting it reports nothing, so a second `--fix` pass cannot
    // re-indent what the first pass emitted.
    {
      code: `import dynamic from 'next/dynamic';

const A = 1,
  EmojiPicker = dynamic(
    async () => {
      const mod = await import('@emoji-mart/react');
      return mod.default;
    },
    { ssr: false },
  );
const App = () => <EmojiPicker />;`,
    },
  ],
  invalid: [
    // Basic bad case: default export
    {
      code: `import { useDynamic } from '../../hooks/useDynamic';
const EmojiPicker = useDynamic(import('@emoji-mart/react'));
const App = () => <EmojiPicker/>;`,
      errors: [
        {
          messageId: 'preferNextDynamic',
          data: { componentName: 'EmojiPicker' },
        },
      ],
      output: `import dynamic from 'next/dynamic';

const EmojiPicker = dynamic(
  async () => {
    const mod = await import('@emoji-mart/react');
    return mod.default;
  },
  { ssr: false },
);
const App = () => <EmojiPicker/>;`,
    },
    // Remove unused useDynamic import if it was the only specifier
    {
      code: `import { useDynamic } from '../../hooks/useDynamic';
const { Picker } = useDynamic(import('@emoji-mart/react'));
const App = () => <Picker/>;`,
      errors: [
        {
          messageId: 'preferNextDynamic',
          data: { componentName: 'Picker' },
        },
      ],
      output: `import dynamic from 'next/dynamic';

const Picker = dynamic(
  async () => {
    const mod = await import('@emoji-mart/react');
    return mod.Picker;
  },
  { ssr: false },
);
const App = () => <Picker/>;`,
    },
    // Keep other specifiers on the original import when removing useDynamic
    {
      code: `import { useDynamic, somethingElse } from '../../hooks/useDynamic';
const EmojiPicker = useDynamic(import('@emoji-mart/react'));
const App = () => <EmojiPicker/>;`,
      errors: [
        {
          messageId: 'preferNextDynamic',
          data: { componentName: 'EmojiPicker' },
        },
      ],
      output: `import dynamic from 'next/dynamic';
import { somethingElse } from '../../hooks/useDynamic';
const EmojiPicker = dynamic(
  async () => {
    const mod = await import('@emoji-mart/react');
    return mod.default;
  },
  { ssr: false },
);
const App = () => <EmojiPicker/>;`,
    },
    // Multiple declarators: only transform the target declarator
    {
      code: `import { useDynamic } from '../../hooks/useDynamic';
const A = 1, EmojiPicker = useDynamic(import('@emoji-mart/react'));
const App = () => <EmojiPicker/>;`,
      errors: [
        {
          messageId: 'preferNextDynamic',
          data: { componentName: 'EmojiPicker' },
        },
      ],
      output: `import dynamic from 'next/dynamic';

const A = 1, EmojiPicker = dynamic(
  async () => {
    const mod = await import('@emoji-mart/react');
    return mod.default;
  },
  { ssr: false },
);
const App = () => <EmojiPicker/>;`,
    },
    // Default import alias of useDynamic
    {
      code: `import useDynamic from '../../hooks/useDynamic';
const EmojiPicker = useDynamic(import('@emoji-mart/react'));
const App = () => <EmojiPicker/>;`,
      errors: [
        {
          messageId: 'preferNextDynamic',
          data: { componentName: 'EmojiPicker' },
        },
      ],
      output: `import dynamic from 'next/dynamic';

const EmojiPicker = dynamic(
  async () => {
    const mod = await import('@emoji-mart/react');
    return mod.default;
  },
  { ssr: false },
);
const App = () => <EmojiPicker/>;`,
    },
    // Named export destructuring to component variable name
    {
      code: `import { useDynamic } from '../../hooks/useDynamic';
const { Picker } = useDynamic(import('@emoji-mart/react'));
const App = () => <Picker/>;`,
      errors: [
        {
          messageId: 'preferNextDynamic',
          data: { componentName: 'Picker' },
        },
      ],
      output: `import dynamic from 'next/dynamic';

const Picker = dynamic(
  async () => {
    const mod = await import('@emoji-mart/react');
    return mod.Picker;
  },
  { ssr: false },
);
const App = () => <Picker/>;`,
    },
    // Ensure dynamic import line is not duplicated if already present
    {
      code: `import dynamic from 'next/dynamic';
import { useDynamic } from '../../hooks/useDynamic';
const EmojiPicker = useDynamic(import('@emoji-mart/react'));
const App = () => <EmojiPicker/>;`,
      errors: [
        {
          messageId: 'preferNextDynamic',
          data: { componentName: 'EmojiPicker' },
        },
      ],
      output: `import dynamic from 'next/dynamic';
const EmojiPicker = dynamic(
  async () => {
    const mod = await import('@emoji-mart/react');
    return mod.default;
  },
  { ssr: false },
);
const App = () => <EmojiPicker/>;`,
    },
    // Reuse existing dynamic alias when already imported
    {
      code: `import dyn from 'next/dynamic';
import { useDynamic } from '../../hooks/useDynamic';
const EmojiPicker = useDynamic(import('@emoji-mart/react'));
const App = () => <EmojiPicker/>;`,
      errors: [{ messageId: 'preferNextDynamic' }],
      output: `import dyn from 'next/dynamic';
const EmojiPicker = dyn(
  async () => {
    const mod = await import('@emoji-mart/react');
    return mod.default;
  },
  { ssr: false },
);
const App = () => <EmojiPicker/>;`,
    },
    // Preserve let/var kind
    {
      code: `import { useDynamic } from '../../hooks/useDynamic';
let EmojiPicker = useDynamic(import('@emoji-mart/react'));
const App = () => <EmojiPicker/>;`,
      errors: [
        {
          messageId: 'preferNextDynamic',
          data: { componentName: 'EmojiPicker' },
        },
      ],
      output: `import dynamic from 'next/dynamic';

let EmojiPicker = dynamic(
  async () => {
    const mod = await import('@emoji-mart/react');
    return mod.default;
  },
  { ssr: false },
);
const App = () => <EmojiPicker/>;`,
    },
    // Respect custom allowed sources option
    {
      code: `import { useDynamic } from '@org/useDynamic';
const EmojiPicker = useDynamic(import('@emoji-mart/react'));
const App = () => <EmojiPicker/>;`,
      options: [{ useDynamicSources: ['@org/useDynamic'] }],
      errors: [{ messageId: 'preferNextDynamic' }],
      output: `import dynamic from 'next/dynamic';

const EmojiPicker = dynamic(
  async () => {
    const mod = await import('@emoji-mart/react');
    return mod.default;
  },
  { ssr: false },
);
const App = () => <EmojiPicker/>;`,
    },
    // A pre-existing `dynamic` binding makes the import unsafe to insert, so the
    // violation is reported without an autofix.
    {
      code: `
const dynamic = undefined as unknown as never;
import { useDynamic } from '@org/useDynamic';
const EmojiPicker = useDynamic(import('@emoji-mart/react'));
const App = () => <EmojiPicker/>;
`,
      output: `
const dynamic = undefined as unknown as never;
import { useDynamic } from '@org/useDynamic';
const EmojiPicker = useDynamic(import('@emoji-mart/react'));
const App = () => <EmojiPicker/>;
`,
      errors: [{ messageId: 'preferNextDynamic' }],
    },
    // A `dynamic` function declaration collides with the inserted import too
    {
      code: `import { useDynamic } from '../../hooks/useDynamic';
function dynamic() { return null; }
const EmojiPicker = useDynamic(import('@emoji-mart/react'));
const App = () => <EmojiPicker/>;`,
      output: `import { useDynamic } from '../../hooks/useDynamic';
function dynamic() { return null; }
const EmojiPicker = useDynamic(import('@emoji-mart/react'));
const App = () => <EmojiPicker/>;`,
      errors: [{ messageId: 'preferNextDynamic' }],
    },
    // A `dynamic` bound by an import from another module collides as well
    {
      code: `import dynamic from './dynamic';
import { useDynamic } from '../../hooks/useDynamic';
const EmojiPicker = useDynamic(import('@emoji-mart/react'));
const App = () => <EmojiPicker/>;`,
      output: `import dynamic from './dynamic';
import { useDynamic } from '../../hooks/useDynamic';
const EmojiPicker = useDynamic(import('@emoji-mart/react'));
const App = () => <EmojiPicker/>;`,
      errors: [{ messageId: 'preferNextDynamic' }],
    },
    // A narrower-scope shadow raises no TypeScript diagnostic, yet the emitted
    // bare `dynamic` would call the parameter instead of the import
    {
      code: `import { useDynamic } from '../../hooks/useDynamic';
function Wrapper(dynamic: unknown) {
  const EmojiPicker = useDynamic(import('@emoji-mart/react'));
  return <EmojiPicker data-x={dynamic}/>;
}`,
      output: `import { useDynamic } from '../../hooks/useDynamic';
function Wrapper(dynamic: unknown) {
  const EmojiPicker = useDynamic(import('@emoji-mart/react'));
  return <EmojiPicker data-x={dynamic}/>;
}`,
      errors: [{ messageId: 'preferNextDynamic' }],
    },
    // A shadow of the existing `next/dynamic` alias is equally unsafe to emit
    {
      code: `import dyn from 'next/dynamic';
import { useDynamic } from '../../hooks/useDynamic';
function Wrapper(dyn: unknown) {
  const EmojiPicker = useDynamic(import('@emoji-mart/react'));
  return <EmojiPicker data-x={dyn}/>;
}`,
      output: `import dyn from 'next/dynamic';
import { useDynamic } from '../../hooks/useDynamic';
function Wrapper(dyn: unknown) {
  const EmojiPicker = useDynamic(import('@emoji-mart/react'));
  return <EmojiPicker data-x={dyn}/>;
}`,
      errors: [{ messageId: 'preferNextDynamic' }],
    },
    // A `dynamic` binding in a sibling scope cannot capture the module-level
    // insertion, so the fix still applies
    {
      code: `import { useDynamic } from '../../hooks/useDynamic';
const EmojiPicker = useDynamic(import('@emoji-mart/react'));
function unrelated() { const dynamic = 1; return dynamic; }
const App = () => <EmojiPicker/>;`,
      errors: [{ messageId: 'preferNextDynamic' }],
      output: `import dynamic from 'next/dynamic';

const EmojiPicker = dynamic(
  async () => {
    const mod = await import('@emoji-mart/react');
    return mod.default;
  },
  { ssr: false },
);
function unrelated() { const dynamic = 1; return dynamic; }
const App = () => <EmojiPicker/>;`,
    },
    // Aliased destructure binds the local name to the named export, and the
    // emitted argument list carries the trailing comma `trailingComma: 'all'`
    // requires of a multi-line call, so the fix survives a reformat unchanged.
    {
      code: `import { useDynamic } from '../../hooks/useDynamic';
const { Picker: Emoji } = useDynamic(import('@emoji-mart/react'));
const App = () => <Emoji/>;`,
      errors: [
        {
          messageId: 'preferNextDynamic',
          data: { componentName: 'Emoji' },
        },
      ],
      output: `import dynamic from 'next/dynamic';

const Emoji = dynamic(
  async () => {
    const mod = await import('@emoji-mart/react');
    return mod.Picker;
  },
  { ssr: false },
);
const App = () => <Emoji/>;`,
    },
    // A declarator on a continuation line of a multi-declarator `const` lands
    // two columns deeper than statement depth, and the emitted call follows it
    // there rather than staying at a depth prettier would re-indent.
    {
      code: `import { useDynamic } from '../../hooks/useDynamic';
const A = 1,
  EmojiPicker = useDynamic(import('@emoji-mart/react'));
const App = () => <EmojiPicker />;`,
      errors: [
        {
          messageId: 'preferNextDynamic',
          data: { componentName: 'EmojiPicker' },
        },
      ],
      output: `import dynamic from 'next/dynamic';

const A = 1,
  EmojiPicker = dynamic(
    async () => {
      const mod = await import('@emoji-mart/react');
      return mod.default;
    },
    { ssr: false },
  );
const App = () => <EmojiPicker />;`,
    },
    // A destructured declarator on a continuation line lands at that same depth
    {
      code: `import { useDynamic } from '../../hooks/useDynamic';
const A = 1,
  { Picker } = useDynamic(import('@emoji-mart/react'));
const App = () => <Picker />;`,
      errors: [
        {
          messageId: 'preferNextDynamic',
          data: { componentName: 'Picker' },
        },
      ],
      output: `import dynamic from 'next/dynamic';

const A = 1,
  Picker = dynamic(
    async () => {
      const mod = await import('@emoji-mart/react');
      return mod.Picker;
    },
    { ssr: false },
  );
const App = () => <Picker />;`,
    },
    // A declaration nested in a function body lands one indentation step in
    {
      code: `import { useDynamic } from '../../hooks/useDynamic';
function Wrapper() {
  const EmojiPicker = useDynamic(import('@emoji-mart/react'));
  return <EmojiPicker />;
}`,
      errors: [
        {
          messageId: 'preferNextDynamic',
          data: { componentName: 'EmojiPicker' },
        },
      ],
      output: `import dynamic from 'next/dynamic';

function Wrapper() {
  const EmojiPicker = dynamic(
    async () => {
      const mod = await import('@emoji-mart/react');
      return mod.default;
    },
    { ssr: false },
  );
  return <EmojiPicker />;
}`,
    },
    // Nested inside an arrow function body, with `dynamic` already imported
    {
      code: `import dynamic from 'next/dynamic';
import { useDynamic } from '../../hooks/useDynamic';
const App = () => {
  const EmojiPicker = useDynamic(import('@emoji-mart/react'));
  return <EmojiPicker />;
};`,
      errors: [
        {
          messageId: 'preferNextDynamic',
          data: { componentName: 'EmojiPicker' },
        },
      ],
      output: `import dynamic from 'next/dynamic';
const App = () => {
  const EmojiPicker = dynamic(
    async () => {
      const mod = await import('@emoji-mart/react');
      return mod.default;
    },
    { ssr: false },
  );
  return <EmojiPicker />;
};`,
    },
    // A multi-declarator inside a function body stacks both depths: the
    // continuation line sits four columns in
    {
      code: `import { useDynamic } from '../../hooks/useDynamic';
function Wrapper() {
  const A = 1,
    EmojiPicker = useDynamic(import('@emoji-mart/react'));
  return <EmojiPicker data-a={A} />;
}`,
      errors: [
        {
          messageId: 'preferNextDynamic',
          data: { componentName: 'EmojiPicker' },
        },
      ],
      output: `import dynamic from 'next/dynamic';

function Wrapper() {
  const A = 1,
    EmojiPicker = dynamic(
      async () => {
        const mod = await import('@emoji-mart/react');
        return mod.default;
      },
      { ssr: false },
    );
  return <EmojiPicker data-a={A} />;
}`,
    },
    // The inserted import lands after a directive prologue, and the emitted
    // call still carries its trailing comma
    {
      code: `'use client';
import { useDynamic } from '../../hooks/useDynamic';
const EmojiPicker = useDynamic(import('@emoji-mart/react'));
const App = () => <EmojiPicker/>;`,
      errors: [
        {
          messageId: 'preferNextDynamic',
          data: { componentName: 'EmojiPicker' },
        },
      ],
      output: `'use client';
import dynamic from 'next/dynamic';

const EmojiPicker = dynamic(
  async () => {
    const mod = await import('@emoji-mart/react');
    return mod.default;
  },
  { ssr: false },
);
const App = () => <EmojiPicker/>;`,
    },
  ],
});

// Non-JSX tests to ensure non-component imports are not flagged
// using TS runner for non-JSX code
// Note: these are valid cases

ts.run('prefer-next-dynamic (non-JSX safe cases)', preferNextDynamic, {
  valid: [
    {
      code: `import { useDynamic } from '../../hooks/useDynamic';
const x = useDynamic(import('../utils/file'));
console.log(x);`,
    },
    {
      code: `import useDynamic from '../../hooks/useDynamic';
const x = useDynamic(import('@emoji-mart/react'));
function fn(){ return x; }`,
    },
  ],
  invalid: [],
});
