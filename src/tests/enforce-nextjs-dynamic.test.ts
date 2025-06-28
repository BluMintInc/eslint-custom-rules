import { ruleTesterTs } from '../utils/ruleTester';
import rule, { RULE_NAME } from '../rules/enforce-nextjs-dynamic';

const ruleTester = ruleTesterTs;

ruleTester.run(RULE_NAME, rule, {
  valid: [
    // Already using Next.js dynamic
    {
      code: `
import dynamic from 'next/dynamic';

const EmojiPicker = dynamic(
  async () => {
    const mod = await import('@emoji-mart/react');
    return mod.default;
  },
  { ssr: false }
);
      `,
    },
    // Regular imports (not using useDynamic)
    {
      code: `
import { useState } from 'react';
import EmojiPicker from '@emoji-mart/react';
      `,
    },
    // useDynamic with non-import expression (should not trigger)
    {
      code: `
import { useDynamic } from '../../hooks/useDynamic';

const result = useDynamic(Promise.resolve({}));
      `,
    },
    // useDynamic with function call instead of import (should not trigger)
    {
      code: `
import { useDynamic } from '../../hooks/useDynamic';

const result = useDynamic(loadComponent());
      `,
    },
    // useDynamic with variable instead of import (should not trigger)
    {
      code: `
import { useDynamic } from '../../hooks/useDynamic';

const importPromise = import('./Component');
const component = useDynamic(importPromise);
      `,
    },
    // useDynamic with additional options parameter (should not trigger)
    {
      code: `
import { useDynamic } from '../../hooks/useDynamic';

const component = useDynamic(import('./Component'), { ssr: false });
      `,
    },
    // useDynamic from different import source (should not trigger)
    {
      code: `
import { useDynamic } from 'some-other-library';

const component = useDynamic(import('./Component'));
      `,
    },
    // useDynamic from relative path not matching pattern (should not trigger)
    {
      code: `
import { useDynamic } from './customHooks';

const component = useDynamic(import('./Component'));
      `,
    },

    // useDynamic with assertion type annotation (should not trigger - not a simple call expression)
    {
      code: `
import { useDynamic } from '../../hooks/useDynamic';

const Component = useDynamic(import('./Component')) as React.ComponentType;
      `,
    },
    // useDynamic with non-null assertion (should not trigger - not a simple call expression)
    {
      code: `
import { useDynamic } from '../../hooks/useDynamic';

const Component = useDynamic(import('./Component'))!;
      `,
    },
    // useDynamic with satisfies operator (should not trigger - not a simple call expression)
    {
      code: `
import { useDynamic } from '../../hooks/useDynamic';

const Component = useDynamic(import('./Component')) satisfies React.ComponentType;
      `,
    },
    // useDynamic in conditional expression (should not trigger)
    {
      code: `
import { useDynamic } from '../../hooks/useDynamic';

const condition = true;
const component = condition ? useDynamic(import('./Component')) : null;
      `,
    },
    // useDynamic in JSX context (should not trigger)
    {
      code: `
import { useDynamic } from '../../hooks/useDynamic';

const element = React.createElement('div', null, useDynamic(import('./Component')));
      `,
    },
    // useDynamic in template literal (should not trigger)
    {
      code: `
import { useDynamic } from '../../hooks/useDynamic';

const message = \`Component: \${useDynamic(import('./Component'))}\`;
      `,
    },
    // useDynamic in array (should not trigger)
    {
      code: `
import { useDynamic } from '../../hooks/useDynamic';

const components = [useDynamic(import('./Component'))];
      `,
    },
    // useDynamic in object property (should not trigger)
    {
      code: `
import { useDynamic } from '../../hooks/useDynamic';

const obj = {
  component: useDynamic(import('./Component'))
};
      `,
    },
    // useDynamic in function parameter (should not trigger)
    {
      code: `
import { useDynamic } from '../../hooks/useDynamic';

function test(comp = useDynamic(import('./Component'))) {
  return comp;
}
      `,
    },
    // useDynamic in return statement (should not trigger)
    {
      code: `
import { useDynamic } from '../../hooks/useDynamic';

function getComponent() {
  return useDynamic(import('./Component'));
}
      `,
    },
    // useDynamic with console.log (should not trigger)
    {
      code: `
import { useDynamic } from '../../hooks/useDynamic';

console.log(useDynamic(import('./Component')));
      `,
    },
  ],
  invalid: [
    // Basic case: useDynamic with default import
    {
      code: `
import { useDynamic } from '../../hooks/useDynamic';

const EmojiPicker = useDynamic(import('@emoji-mart/react'));
      `,
      errors: [{ messageId: 'useNextjsDynamic' }],
      output: `
import dynamic from 'next/dynamic';


const EmojiPicker = dynamic(
  async () => {
    const mod = await import('@emoji-mart/react');
    return mod.default;
  },
  { ssr: false }
);
      `,
    },
    // Case with dynamic already imported
    {
      code: `
import dynamic from 'next/dynamic';
import { useDynamic } from '../../hooks/useDynamic';

const EmojiPicker = useDynamic(import('@emoji-mart/react'));
      `,
      errors: [{ messageId: 'useNextjsDynamic' }],
      output: `
import dynamic from 'next/dynamic';


const EmojiPicker = dynamic(
  async () => {
    const mod = await import('@emoji-mart/react');
    return mod.default;
  },
  { ssr: false }
);
      `,
    },
    // Case with destructuring pattern
    {
      code: `
import { useDynamic } from '../../hooks/useDynamic';

const { Picker } = useDynamic(import('@emoji-mart/react'));
      `,
      errors: [{ messageId: 'useNextjsDynamic' }],
      output: `
import dynamic from 'next/dynamic';


const Picker = dynamic(
  async () => {
    const mod = await import('@emoji-mart/react');
    return mod.Picker;
  },
  { ssr: false }
);
      `,
    },
    // Case with multiple destructured components
    {
      code: `
import { useDynamic } from '../../hooks/useDynamic';

const { Picker, EmojiData } = useDynamic(import('@emoji-mart/react'));
      `,
      errors: [{ messageId: 'useNextjsDynamic' }],
      output: `
import dynamic from 'next/dynamic';


const Picker = dynamic(
  async () => {
    const mod = await import('@emoji-mart/react');
    return mod.Picker;
  },
  { ssr: false }
);

const EmojiData = dynamic(
  async () => {
    const mod = await import('@emoji-mart/react');
    return mod.EmojiData;
  },
  { ssr: false }
);
      `,
    },
    // Case with default import of useDynamic
    {
      code: `
import useDynamic from '../../hooks/useDynamic';

const EmojiPicker = useDynamic(import('@emoji-mart/react'));
      `,
      errors: [{ messageId: 'useNextjsDynamic' }],
      output: `
import dynamic from 'next/dynamic';


const EmojiPicker = dynamic(
  async () => {
    const mod = await import('@emoji-mart/react');
    return mod.default;
  },
  { ssr: false }
);
      `,
    },
    // useDynamic with let declaration
    {
      code: `
import { useDynamic } from '../../hooks/useDynamic';

let Component = useDynamic(import('./Component'));
      `,
      errors: [{ messageId: 'useNextjsDynamic' }],
      output: `
import dynamic from 'next/dynamic';


let Component = dynamic(
  async () => {
    const mod = await import('./Component');
    return mod.default;
  },
  { ssr: false }
);
      `,
    },
    // useDynamic with var declaration
    {
      code: `
import { useDynamic } from '../../hooks/useDynamic';

var Component = useDynamic(import('./Component'));
      `,
      errors: [{ messageId: 'useNextjsDynamic' }],
      output: `
import dynamic from 'next/dynamic';


var Component = dynamic(
  async () => {
    const mod = await import('./Component');
    return mod.default;
  },
  { ssr: false }
);
      `,
    },
    // Multiple useDynamic calls in same file
    {
      code: `
import { useDynamic } from '../../hooks/useDynamic';

const Component1 = useDynamic(import('./Component1'));
const Component2 = useDynamic(import('./Component2'));
      `,
      errors: [
        { messageId: 'useNextjsDynamic' },
        { messageId: 'useNextjsDynamic' }
      ],
      output: `
import dynamic from 'next/dynamic';


const Component1 = dynamic(
  async () => {
    const mod = await import('./Component1');
    return mod.default;
  },
  { ssr: false }
);
const Component2 = useDynamic(import('./Component2'));
      `,
    },
    // useDynamic with aliased import
    {
      code: `
import { useDynamic as useDyn } from '../../hooks/useDynamic';

const Component = useDyn(import('./Component'));
      `,
      errors: [{ messageId: 'useNextjsDynamic' }],
      output: `
import dynamic from 'next/dynamic';


const Component = dynamic(
  async () => {
    const mod = await import('./Component');
    return mod.default;
  },
  { ssr: false }
);
      `,
    },
    // useDynamic with TypeScript type annotation
    {
      code: `
import { useDynamic } from '../../hooks/useDynamic';

const Component: React.ComponentType<any> = useDynamic(import('./Component'));
      `,
      errors: [{ messageId: 'useNextjsDynamic' }],
      output: `
import dynamic from 'next/dynamic';


const Component: React.ComponentType<any> = dynamic(
  async () => {
    const mod = await import('./Component');
    return mod.default;
  },
  { ssr: false }
);
      `,
    },
    // useDynamic with complex destructuring with renaming
    {
      code: `
import { useDynamic } from '../../hooks/useDynamic';

const { Component: RenamedComponent } = useDynamic(import('./Component'));
      `,
      errors: [{ messageId: 'useNextjsDynamic' }],
      output: `
import dynamic from 'next/dynamic';


const RenamedComponent = dynamic(
  async () => {
    const mod = await import('./Component');
    return mod.Component;
  },
  { ssr: false }
);
      `,
    },
    // useDynamic with destructuring default export
    {
      code: `
import { useDynamic } from '../../hooks/useDynamic';

const { default: Component } = useDynamic(import('./Module'));
      `,
      errors: [{ messageId: 'useNextjsDynamic' }],
      output: `
import dynamic from 'next/dynamic';


const Component = dynamic(
  async () => {
    const mod = await import('./Module');
    return mod.default;
  },
  { ssr: false }
);
      `,
    },
    // useDynamic with multiple variable declarations in one statement
    {
      code: `
import { useDynamic } from '../../hooks/useDynamic';

const Component1 = useDynamic(import('./Component1')), Component2 = useDynamic(import('./Component2'));
      `,
      errors: [
        { messageId: 'useNextjsDynamic' },
        { messageId: 'useNextjsDynamic' }
      ],
      output: `
import dynamic from 'next/dynamic';


const Component1 = dynamic(
  async () => {
    const mod = await import('./Component1');
    return mod.default;
  },
  { ssr: false }
);
      `,
    },
    // Edge case: useDynamic in try-catch (should trigger - variable declarations trigger regardless of scope)
    {
      code: `
import { useDynamic } from '../../hooks/useDynamic';

try {
  const component = useDynamic(import('./Component'));
} catch (error) {
  console.error(error);
}
      `,
      errors: [{ messageId: 'useNextjsDynamic' }],
      output: `
import dynamic from 'next/dynamic';


try {
  const component = dynamic(
  async () => {
    const mod = await import('./Component');
    return mod.default;
  },
  { ssr: false }
);
} catch (error) {
  console.error(error);
}
      `,
    },
    // Edge case: useDynamic in if statement (should trigger - variable declarations trigger regardless of scope)
    {
      code: `
import { useDynamic } from '../../hooks/useDynamic';

if (condition) {
  const component = useDynamic(import('./Component'));
}
      `,
      errors: [{ messageId: 'useNextjsDynamic' }],
      output: `
import dynamic from 'next/dynamic';


if (condition) {
  const component = dynamic(
  async () => {
    const mod = await import('./Component');
    return mod.default;
  },
  { ssr: false }
);
}
      `,
    },
    // Edge case: useDynamic in function scope (should trigger - variable declarations trigger regardless of scope)
    {
      code: `
import { useDynamic } from '../../hooks/useDynamic';

function loadComponent() {
  const component = useDynamic(import('./Component'));
  return component;
}
      `,
      errors: [{ messageId: 'useNextjsDynamic' }],
      output: `
import dynamic from 'next/dynamic';


function loadComponent() {
  const component = dynamic(
  async () => {
    const mod = await import('./Component');
    return mod.default;
  },
  { ssr: false }
);
  return component;
}
      `,
    },
    // Edge case: useDynamic with whitespace around import
    {
      code: `
import { useDynamic } from '../../hooks/useDynamic';

const Component = useDynamic( import('./Component') );
      `,
      errors: [{ messageId: 'useNextjsDynamic' }],
      output: `
import dynamic from 'next/dynamic';


const Component = dynamic(
  async () => {
    const mod = await import('./Component');
    return mod.default;
  },
  { ssr: false }
);
      `,
    },
    // Edge case: useDynamic with newlines in import
    {
      code: `
import { useDynamic } from '../../hooks/useDynamic';

const Component = useDynamic(
  import('./Component')
);
      `,
      errors: [{ messageId: 'useNextjsDynamic' }],
      output: `
import dynamic from 'next/dynamic';


const Component = dynamic(
  async () => {
    const mod = await import('./Component');
    return mod.default;
  },
  { ssr: false }
);
      `,
    },
    // Edge case: useDynamic with template literal import path
    {
      code: `
import { useDynamic } from '../../hooks/useDynamic';

const path = './Component';
const Component = useDynamic(import(\`\${path}\`));
      `,
      errors: [{ messageId: 'useNextjsDynamic' }],
      output: `
import dynamic from 'next/dynamic';


const path = './Component';
const Component = dynamic(
  async () => {
    const mod = await import(\`\${path}\`);
    return mod.default;
  },
  { ssr: false }
);
      `,
    },
    // Edge case: useDynamic with scoped package import
    {
      code: `
import { useDynamic } from '../../hooks/useDynamic';

const Component = useDynamic(import('@company/ui-components'));
      `,
      errors: [{ messageId: 'useNextjsDynamic' }],
      output: `
import dynamic from 'next/dynamic';


const Component = dynamic(
  async () => {
    const mod = await import('@company/ui-components');
    return mod.default;
  },
  { ssr: false }
);
      `,
    },

  ],
});
