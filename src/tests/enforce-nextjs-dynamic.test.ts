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
    // Using dynamic with named export
    {
      code: `
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
    // Regular imports (not using useDynamic)
    {
      code: `
import { useState } from 'react';
import EmojiPicker from '@emoji-mart/react';
      `,
    },
    // Dynamic import without useDynamic (should not trigger)
    {
      code: `
const loadModule = async () => {
  const mod = await import('./utils');
  return mod.default;
};
      `,
    },
    // Other hook usage (should not trigger)
    {
      code: `
import { useCallback } from 'react';
const callback = useCallback(() => {}, []);
      `,
    },
    // Function named useDynamic but not imported (should not trigger)
    {
      code: `
function useDynamic(importFn) {
  return importFn;
}
const component = useDynamic(import('./Component'));
      `,
    },
    // Variable named useDynamic but not a function call
    {
      code: `
const useDynamic = 'some string';
const component = useDynamic;
      `,
    },
    // Dynamic with different options
    {
      code: `
import dynamic from 'next/dynamic';

const Component = dynamic(() => import('./Component'), {
  ssr: true
});
      `,
    },
    // Multiple dynamic imports (valid)
    {
      code: `
import dynamic from 'next/dynamic';

const Component1 = dynamic(() => import('./Component1'));
const Component2 = dynamic(() => import('./Component2'));
      `,
    },
    // Dynamic in different scopes
    {
      code: `
import dynamic from 'next/dynamic';

function createComponent() {
  return dynamic(() => import('./Component'));
}
      `,
    },
    // useDynamic not imported (should not trigger)
    {
      code: `
const useDynamic = require('./useDynamic');
const component = useDynamic(import('./Component'));
      `,
    },
    // useDynamic with different argument types (should not trigger)
    {
      code: `
import { useDynamic } from '../../hooks/useDynamic';

const component = useDynamic('not an import');
      `,
    },
    // useDynamic with no arguments (should not trigger)
    {
      code: `
import { useDynamic } from '../../hooks/useDynamic';

const component = useDynamic();
      `,
    },
    // useDynamic with multiple arguments (should not trigger)
    {
      code: `
import { useDynamic } from '../../hooks/useDynamic';

const component = useDynamic(import('./Component'), { ssr: false });
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
    // useDynamic in array (should not trigger)
    {
      code: `
import { useDynamic } from '../../hooks/useDynamic';

const components = [useDynamic(import('./Component'))];
      `,
    },
    // useDynamic as function parameter (should not trigger)
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
    // useDynamic with conditional import (should not trigger)
    {
      code: `
import { useDynamic } from '../../hooks/useDynamic';

const condition = true;
const component = condition ? useDynamic(import('./Component')) : null;
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
    // Different import paths for useDynamic
    {
      code: `
import { useDynamic } from '../hooks/useDynamic';

const Component = useDynamic(import('./Component'));
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
    // useDynamic from hooks directory
    {
      code: `
import { useDynamic } from 'hooks/useDynamic';

const Component = useDynamic(import('./Component'));
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
    // useDynamic with complex destructuring
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
    // useDynamic with mixed destructuring
    {
      code: `
import { useDynamic } from '../../hooks/useDynamic';

const { default: DefaultComponent, NamedComponent } = useDynamic(import('./Component'));
      `,
      errors: [{ messageId: 'useNextjsDynamic' }],
      output: `
import dynamic from 'next/dynamic';


const DefaultComponent = dynamic(
  async () => {
    const mod = await import('./Component');
    return mod.default;
  },
  { ssr: false }
);

const NamedComponent = dynamic(
  async () => {
    const mod = await import('./Component');
    return mod.NamedComponent;
  },
  { ssr: false }
);
      `,
    },
    // useDynamic with string literal import
    {
      code: `
import { useDynamic } from '../../hooks/useDynamic';

const Component = useDynamic(import("./Component"));
      `,
      errors: [{ messageId: 'useNextjsDynamic' }],
      output: `
import dynamic from 'next/dynamic';


const Component = dynamic(
  async () => {
    const mod = await import("./Component");
    return mod.default;
  },
  { ssr: false }
);
      `,
    },
    // useDynamic with template literal import
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
    // useDynamic with scoped package import
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
    // useDynamic in nested scope
    {
      code: `
import { useDynamic } from '../../hooks/useDynamic';

function createComponent() {
  const Component = useDynamic(import('./Component'));
  return Component;
}
      `,
      errors: [{ messageId: 'useNextjsDynamic' }],
      output: `
import dynamic from 'next/dynamic';


function createComponent() {
  const Component = dynamic(
  async () => {
    const mod = await import('./Component');
    return mod.default;
  },
  { ssr: false }
);
  return Component;
}
      `,
    },
    // useDynamic with existing other imports
    {
      code: `
import React from 'react';
import { useDynamic } from '../../hooks/useDynamic';
import { useState } from 'react';

const Component = useDynamic(import('./Component'));
      `,
      errors: [{ messageId: 'useNextjsDynamic' }],
      output: `
import dynamic from 'next/dynamic';
import React from 'react';

import { useState } from 'react';

const Component = dynamic(
  async () => {
    const mod = await import('./Component');
    return mod.default;
  },
  { ssr: false }
);
      `,
    },
    // useDynamic with comments
    {
      code: `
import { useDynamic } from '../../hooks/useDynamic';

// Load component dynamically
const Component = useDynamic(import('./Component'));
      `,
      errors: [{ messageId: 'useNextjsDynamic' }],
      output: `
import dynamic from 'next/dynamic';


// Load component dynamically
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

const Component: React.ComponentType = useDynamic(import('./Component'));
      `,
      errors: [{ messageId: 'useNextjsDynamic' }],
      output: `
import dynamic from 'next/dynamic';


const Component: React.ComponentType = dynamic(
  async () => {
    const mod = await import('./Component');
    return mod.default;
  },
  { ssr: false }
);
      `,
    },
    // useDynamic with absolute path import
    {
      code: `
import { useDynamic } from '/src/hooks/useDynamic';

const Component = useDynamic(import('./Component'));
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
    // useDynamic with node_modules import
    {
      code: `
import { useDynamic } from 'node_modules/some-package/useDynamic';

const Component = useDynamic(import('./Component'));
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
    // useDynamic with three destructured components
    {
      code: `
import { useDynamic } from '../../hooks/useDynamic';

const { ComponentA, ComponentB, ComponentC } = useDynamic(import('./Components'));
      `,
      errors: [{ messageId: 'useNextjsDynamic' }],
      output: `
import dynamic from 'next/dynamic';


const ComponentA = dynamic(
  async () => {
    const mod = await import('./Components');
    return mod.ComponentA;
  },
  { ssr: false }
);

const ComponentB = dynamic(
  async () => {
    const mod = await import('./Components');
    return mod.ComponentB;
  },
  { ssr: false }
);

const ComponentC = dynamic(
  async () => {
    const mod = await import('./Components');
    return mod.ComponentC;
  },
  { ssr: false }
);
      `,
    },
    // useDynamic with mixed import styles in same file
    {
      code: `
import { useDynamic } from '../../hooks/useDynamic';
import useDyn from '../../hooks/useDynamic';

const Component1 = useDynamic(import('./Component1'));
const Component2 = useDyn(import('./Component2'));
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
const Component2 = useDyn(import('./Component2'));
      `,
    },
    // useDynamic with deeply nested destructuring (fallback handling)
    {
      code: `
import { useDynamic } from '../../hooks/useDynamic';

const { nested: { Component } } = useDynamic(import('./Component'));
      `,
      errors: [{ messageId: 'useNextjsDynamic' }],
      output: `
import dynamic from 'next/dynamic';


const { nested: { Component } } = dynamic(
  async () => {
    const mod = await import('./Component');
    return mod.default;
  },
  { ssr: false }
);
      `,
    },
    // useDynamic with rest pattern in destructuring (fallback handling)
    {
      code: `
import { useDynamic } from '../../hooks/useDynamic';

const { Component, ...rest } = useDynamic(import('./Component'));
      `,
      errors: [{ messageId: 'useNextjsDynamic' }],
      output: `
import dynamic from 'next/dynamic';


const { Component, ...rest } = dynamic(
  async () => {
    const mod = await import('./Component');
    return mod.default;
  },
  { ssr: false }
);
      `,
    },
    // useDynamic with computed property names (fallback handling)
    {
      code: `
import { useDynamic } from '../../hooks/useDynamic';

const key = 'Component';
const { [key]: DynamicComponent } = useDynamic(import('./Component'));
      `,
      errors: [{ messageId: 'useNextjsDynamic' }],
      output: `
import dynamic from 'next/dynamic';


const key = 'Component';
const DynamicComponent = dynamic(
  async () => {
    const mod = await import('./Component');
    return mod.key;
  },
  { ssr: false }
);
      `,
    },
    // useDynamic with very long import path
    {
      code: `
import { useDynamic } from '../../hooks/useDynamic';

const Component = useDynamic(import('./very/long/path/to/some/deeply/nested/component/Component'));
      `,
      errors: [{ messageId: 'useNextjsDynamic' }],
      output: `
import dynamic from 'next/dynamic';


const Component = dynamic(
  async () => {
    const mod = await import('./very/long/path/to/some/deeply/nested/component/Component');
    return mod.default;
  },
  { ssr: false }
);
      `,
    },
    // useDynamic with import from index file
    {
      code: `
import { useDynamic } from '../../hooks/useDynamic';

const Component = useDynamic(import('./components/'));
      `,
      errors: [{ messageId: 'useNextjsDynamic' }],
      output: `
import dynamic from 'next/dynamic';


const Component = dynamic(
  async () => {
    const mod = await import('./components/');
    return mod.default;
  },
  { ssr: false }
);
      `,
    },
    // useDynamic with relative parent directory import
    {
      code: `
import { useDynamic } from '../../hooks/useDynamic';

const Component = useDynamic(import('../../../shared/Component'));
      `,
      errors: [{ messageId: 'useNextjsDynamic' }],
      output: `
import dynamic from 'next/dynamic';


const Component = dynamic(
  async () => {
    const mod = await import('../../../shared/Component');
    return mod.default;
  },
  { ssr: false }
);
      `,
    },
    // useDynamic with file extension
    {
      code: `
import { useDynamic } from '../../hooks/useDynamic';

const Component = useDynamic(import('./Component.tsx'));
      `,
      errors: [{ messageId: 'useNextjsDynamic' }],
      output: `
import dynamic from 'next/dynamic';


const Component = dynamic(
  async () => {
    const mod = await import('./Component.tsx');
    return mod.default;
  },
  { ssr: false }
);
      `,
    },
    // useDynamic with numeric import path
    {
      code: `
import { useDynamic } from '../../hooks/useDynamic';

const Component = useDynamic(import('./components/123'));
      `,
      errors: [{ messageId: 'useNextjsDynamic' }],
      output: `
import dynamic from 'next/dynamic';


const Component = dynamic(
  async () => {
    const mod = await import('./components/123');
    return mod.default;
  },
  { ssr: false }
);
      `,
    },
    // useDynamic with special characters in import path
    {
      code: `
import { useDynamic } from '../../hooks/useDynamic';

const Component = useDynamic(import('./components/special-component_v2'));
      `,
      errors: [{ messageId: 'useNextjsDynamic' }],
      output: `
import dynamic from 'next/dynamic';


const Component = dynamic(
  async () => {
    const mod = await import('./components/special-component_v2');
    return mod.default;
  },
  { ssr: false }
);
      `,
    },
    // useDynamic with mixed quotes in import path
    {
      code: `
import { useDynamic } from "../../hooks/useDynamic";

const Component = useDynamic(import("./Component"));
      `,
      errors: [{ messageId: 'useNextjsDynamic' }],
      output: `
import dynamic from 'next/dynamic';


const Component = dynamic(
  async () => {
    const mod = await import("./Component");
    return mod.default;
  },
  { ssr: false }
);
      `,
    },
    // useDynamic with complex template literal
    {
      code: `
import { useDynamic } from '../../hooks/useDynamic';

const basePath = './components';
const componentName = 'Component';
const Component = useDynamic(import(\`\${basePath}/\${componentName}\`));
      `,
      errors: [{ messageId: 'useNextjsDynamic' }],
      output: `
import dynamic from 'next/dynamic';


const basePath = './components';
const componentName = 'Component';
const Component = dynamic(
  async () => {
    const mod = await import(\`\${basePath}/\${componentName}\`);
    return mod.default;
  },
  { ssr: false }
);
      `,
    },
    // useDynamic with whitespace and comments in variable declaration
    {
      code: `
import { useDynamic } from '../../hooks/useDynamic';

const /* comment */ Component /* another comment */ = useDynamic(import('./Component'));
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
    // useDynamic with multiple imports from different useDynamic sources
    {
      code: `
import { useDynamic } from '../../hooks/useDynamic';
import { useDynamic as useDyn2 } from '../../../utils/useDynamic';

const Component1 = useDynamic(import('./Component1'));
const Component2 = useDyn2(import('./Component2'));
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
const Component2 = useDyn2(import('./Component2'));
      `,
    },
    // useDynamic with very complex destructuring pattern (fallback handling)
    {
      code: `
import { useDynamic } from '../../hooks/useDynamic';

const {
  Component1,
  Component2: RenamedComponent2,
  default: DefaultComponent,
  utils: { helper1, helper2 }
} = useDynamic(import('./Components'));
      `,
      errors: [{ messageId: 'useNextjsDynamic' }],
      output: `
import dynamic from 'next/dynamic';


const {
  Component1,
  Component2: RenamedComponent2,
  default: DefaultComponent,
  utils: { helper1, helper2 }
} = dynamic(
  async () => {
    const mod = await import('./Components');
    return mod.default;
  },
  { ssr: false }
);
      `,
    },
  ],
});
