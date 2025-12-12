import { ruleTesterTs } from '../utils/ruleTester';
import { requireMemoizeJsxReturners } from '../rules/require-memoize-jsx-returners';

ruleTesterTs.run('require-memoize-jsx-returners', requireMemoizeJsxReturners, {
  valid: [
    {
      filename: 'file.tsx',
      code: `import { Memoize } from '@blumintinc/typescript-memoize';

class ExampleProvider {
  @Memoize()
  public get Component() {
    return () => <div>Cached</div>;
  }
}`,
    },
    {
      filename: 'file.tsx',
      code: `class StringsOnly {
  get label() {
    return 'not jsx';
  }
}`,
    },
    {
      filename: 'file.tsx',
      code: `class ObjectFactory {
  build() {
    return { type: 'config', value: 42 };
  }
}`,
    },
    {
      filename: 'file.tsx',
      code: `class StaticFactory {
  static get Renderer() {
    return () => <span>Static JSX</span>;
  }
}`,
    },
    {
      filename: 'file.tsx',
      code: `import ExternalComponent from './MyComponent';

class Example {
  public get Component() {
    return ExternalComponent;
  }
}`,
    },
    {
      filename: 'file.tsx',
      code: `import { Memoize as Cache } from 'typescript-memoize';

class AliasUsage {
  @Cache()
  get Renderer() {
    return () => <div>Alias</div>;
  }
}`,
    },
    {
      filename: 'file.tsx',
      code: `import * as memoize from 'typescript-memoize';

class NamespaceUsage {
  @memoize.Memoize()
  public get Component() {
    return () => <div>Namespaced</div>;
  }
}`,
    },
    {
      filename: 'file.tsx',
      code: `import { memo } from './memo';

class LocalMemoHelper {
  get ProviderComponent() {
    const Inner = () => <div>Wrapped</div>;
    return memo(Inner);
  }
}`,
    },
    {
      filename: 'file.tsx',
      code: `class NoJsxFactory {
  build() {
    return () => 42;
  }
}`,
    },
    {
      filename: 'file.tsx',
      code: `import { useCallback } from 'react';

function MyComponent() {
  const renderHeader = useCallback(() => <h1>Header</h1>, []);
  return renderHeader();
}`,
    },
    {
      filename: 'file.tsx',
      code: `class VoidReturn {
  clear() {
    return;
  }
}`,
    },
    {
      filename: 'file.tsx',
      code: `import { Memoize } from '@blumintinc/typescript-memoize';

class AlreadyDecorated {
  @AnotherDecorator()
  @Memoize()
  get Component() {
    return () => <div />;
  }
}`,
    },
    {
      filename: 'file.tsx',
      code: `class SequenceIgnoresInitialJsx {
  get value() {
    return (<span />, null);
  }
}`,
    },
    {
      filename: 'file.tsx',
      code: `function logComponent(component: JSX.Element) {
  console.log(component);
  return null;
}

class UsesJsxArgumentOnly {
  get handler() {
    return () => logComponent(<div />);
  }
}`,
    },
    {
      filename: 'file.tsx',
      code: `class MutuallyRecursiveLocals {
  get handler() {
    function a() {
      return b();
    }
    function b() {
      return a();
    }
    return a;
  }
}`,
    },
    {
      filename: 'file.tsx',
      code: `class FunctionMethodCall {
  render() {
    const makeComponent = () => () => <div />;
    return makeComponent.version();
  }
}`,
    },
  ],
  invalid: [
    {
      filename: 'file.tsx',
      code: `class ExampleProvider {
  public get Component() {
    return () => <div>Expensive Component</div>;
  }
}`,
      errors: [{ messageId: 'requireMemoizeJsxReturner' }],
      output: `import { Memoize } from '@blumintinc/typescript-memoize';
class ExampleProvider {
  @Memoize()
  public get Component() {
    return () => <div>Expensive Component</div>;
  }
}`,
    },
    {
      filename: 'file.tsx',
      code: `class CallInvoke {
  render() {
    const makeComponent = () => <div />;
    return makeComponent.call(this);
  }
}`,
      errors: [{ messageId: 'requireMemoizeJsxReturner' }],
      output: `import { Memoize } from '@blumintinc/typescript-memoize';
class CallInvoke {
  @Memoize()
  render() {
    const makeComponent = () => <div />;
    return makeComponent.call(this);
  }
}`,
    },
    {
      filename: 'file.tsx',
      code: `import foo from './foo';

class ComponentFactory {
  createComponent() {
    return () => <div>Created</div>;
  }
}`,
      errors: [{ messageId: 'requireMemoizeJsxReturner' }],
      output: `import { Memoize } from '@blumintinc/typescript-memoize';
import foo from './foo';

class ComponentFactory {
  @Memoize()
  createComponent() {
    return () => <div>Created</div>;
  }
}`,
    },
    {
      filename: 'file.tsx',
      code: `class RendererFactory {
  public get Renderer() {
    return () => () => <div>Double Wrapped</div>;
  }
}`,
      errors: [{ messageId: 'requireMemoizeJsxReturner' }],
      output: `import { Memoize } from '@blumintinc/typescript-memoize';
class RendererFactory {
  @Memoize()
  public get Renderer() {
    return () => () => <div>Double Wrapped</div>;
  }
}`,
    },
    {
      filename: 'file.tsx',
      code: `import { memo } from 'react';

class Provider {
  public get ProviderComponent() {
    const UnmemoizedProvider = () => <div>Wrapped</div>;
    return memo(UnmemoizedProvider);
  }
}`,
      errors: [{ messageId: 'requireMemoizeJsxReturner' }],
      output: `import { Memoize } from '@blumintinc/typescript-memoize';
import { memo } from 'react';

class Provider {
  @Memoize()
  public get ProviderComponent() {
    const UnmemoizedProvider = () => <div>Wrapped</div>;
    return memo(UnmemoizedProvider);
  }
}`,
    },
    {
      filename: 'file.tsx',
      code: `import React from 'react';

class NamespacedMemo {
  get Component() {
    return React.memo(() => <div>Namespaced</div>);
  }
}`,
      errors: [{ messageId: 'requireMemoizeJsxReturner' }],
      output: `import { Memoize } from '@blumintinc/typescript-memoize';
import React from 'react';

class NamespacedMemo {
  @Memoize()
  get Component() {
    return React.memo(() => <div>Namespaced</div>);
  }
}`,
    },
    {
      filename: 'file.tsx',
      code: `class ListRenderer {
  render() {
    const renderRow = () => <li>Row</li>;
    return renderRow();
  }
}`,
      errors: [{ messageId: 'requireMemoizeJsxReturner' }],
      output: `import { Memoize } from '@blumintinc/typescript-memoize';
class ListRenderer {
  @Memoize()
  render() {
    const renderRow = () => <li>Row</li>;
    return renderRow();
  }
}`,
    },
    {
      filename: 'file.tsx',
      code: `class ConditionalRenderer {
  get element() {
    return condition ? <div>One</div> : <span>Two</span>;
  }
}`,
      errors: [{ messageId: 'requireMemoizeJsxReturner' }],
      output: `import { Memoize } from '@blumintinc/typescript-memoize';
class ConditionalRenderer {
  @Memoize()
  get element() {
    return condition ? <div>One</div> : <span>Two</span>;
  }
}`,
    },
    {
      filename: 'file.tsx',
      code: `import React from 'react';

class ElementFactory {
  get element() {
    return React.createElement('div', null, 'hi');
  }
}`,
      errors: [{ messageId: 'requireMemoizeJsxReturner' }],
      output: `import { Memoize } from '@blumintinc/typescript-memoize';
import React from 'react';

class ElementFactory {
  @Memoize()
  get element() {
    return React.createElement('div', null, 'hi');
  }
}`,
    },
    {
      filename: 'file.tsx',
      code: `import { createElement } from 'react';

class NamedFactory {
  get element() {
    return createElement('div', null, 'hi');
  }
}`,
      errors: [{ messageId: 'requireMemoizeJsxReturner' }],
      output: `import { Memoize } from '@blumintinc/typescript-memoize';
import { createElement } from 'react';

class NamedFactory {
  @Memoize()
  get element() {
    return createElement('div', null, 'hi');
  }
}`,
    },
    {
      filename: 'file.tsx',
      code: `import { Custom } from './decorators';

class DecoratedExample {
  @Custom()
  public get Component() {
    return () => <div />;
  }
}`,
      errors: [{ messageId: 'requireMemoizeJsxReturner' }],
      output: `import { Memoize } from '@blumintinc/typescript-memoize';
import { Custom } from './decorators';

class DecoratedExample {
  @Memoize()
  @Custom()
  public get Component() {
    return () => <div />;
  }
}`,
    },
    {
      filename: 'file.tsx',
      code: `import { Memoize as Cache } from '@blumintinc/typescript-memoize';

class AliasMissing {
  renderComponent() {
    return () => <section />;
  }
}`,
      errors: [{ messageId: 'requireMemoizeJsxReturner' }],
      output: `import { Memoize as Cache } from '@blumintinc/typescript-memoize';

class AliasMissing {
  @Cache()
  renderComponent() {
    return () => <section />;
  }
}`,
    },
    {
      filename: 'file.tsx',
      code: `import * as memoize from 'typescript-memoize';

class NamespaceMissing {
  get Widget() {
    return () => <aside />;
  }
}`,
      errors: [{ messageId: 'requireMemoizeJsxReturner' }],
      output: `import * as memoize from 'typescript-memoize';

class NamespaceMissing {
  @memoize.Memoize()
  get Widget() {
    return () => <aside />;
  }
}`,
    },
    {
      filename: 'file.tsx',
      code: `class Multi {
  get One() {
    return () => <div>One</div>;
  }
  methodTwo() {
    return () => <span>Two</span>;
  }
}`,
      errors: [
        { messageId: 'requireMemoizeJsxReturner' },
        { messageId: 'requireMemoizeJsxReturner' },
      ],
      output: `import { Memoize } from '@blumintinc/typescript-memoize';
class Multi {
  @Memoize()
  get One() {
    return () => <div>One</div>;
  }
  @Memoize()
  methodTwo() {
    return () => <span>Two</span>;
  }
}`,
    },
    {
      filename: 'file.tsx',
      code: `class NestedReturn {
  get Renderer() {
    if (shouldRender) {
      return () => <div>Nested</div>;
    }
    return () => null;
  }
}`,
      errors: [{ messageId: 'requireMemoizeJsxReturner' }],
      output: `import { Memoize } from '@blumintinc/typescript-memoize';
class NestedReturn {
  @Memoize()
  get Renderer() {
    if (shouldRender) {
      return () => <div>Nested</div>;
    }
    return () => null;
  }
}`,
    },
    {
      filename: 'file.tsx',
      code: `class SequenceLastJsx {
  render() {
    return (doSomething(), <section />);
  }
}`,
      errors: [{ messageId: 'requireMemoizeJsxReturner' }],
      output: `import { Memoize } from '@blumintinc/typescript-memoize';
class SequenceLastJsx {
  @Memoize()
  render() {
    return (doSomething(), <section />);
  }
}`,
    },
    {
      filename: 'file.tsx',
      code: `class WrongDecorator {
  @foo.Memoize()
  get Component() {
    return () => <div />;
  }
}`,
      errors: [{ messageId: 'requireMemoizeJsxReturner' }],
      output: `import { Memoize } from '@blumintinc/typescript-memoize';
class WrongDecorator {
  @Memoize()
  @foo.Memoize()
  get Component() {
    return () => <div />;
  }
}`,
    },
    {
      filename: 'file.tsx',
      code: `class NestedFactory {
  get renderer() {
    if (enableNested) {
      const build = () => () => <div>Nested</div>;
      return build;
    }
    function makeInner() {
      return <span>Alt</span>;
    }
    return makeInner;
  }
}`,
      errors: [{ messageId: 'requireMemoizeJsxReturner' }],
      output: `import { Memoize } from '@blumintinc/typescript-memoize';
class NestedFactory {
  @Memoize()
  get renderer() {
    if (enableNested) {
      const build = () => () => <div>Nested</div>;
      return build;
    }
    function makeInner() {
      return <span>Alt</span>;
    }
    return makeInner;
  }
}`,
    },
  ],
});
