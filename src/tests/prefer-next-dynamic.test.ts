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
  { ssr: false }
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
  { ssr: false }
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
  { ssr: false }
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
  { ssr: false }
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
  { ssr: false }
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
  { ssr: false }
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
  { ssr: false }
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
  { ssr: false }
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
