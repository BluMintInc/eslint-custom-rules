import { Linter, Rule } from 'eslint';
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
      code: `class ShadowedVariable {
  get component() {
    const make = () => <div />;
    {
      const make = () => null;
      return make;
    }
  }
}`,
    },
    {
      filename: 'file.tsx',
      code: `class MultipleDeclarations {
  get component() {
    var make = () => <div />;
    var make = () => null;
    return make;
  }
}`,
    },
    {
      filename: 'file.tsx',
      code: `class MultipleDefinitionsValid {
  get component() {
    let make;
    if (Math.random() > 0.5) {
      make = () => <div />;
    } else {
      make = () => null;
    }
    return make;
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
    // Issue #1414: every violation suppressed inline leaves the file untouched
    {
      name: 'all violations disabled inline report nothing',
      filename: 'file.tsx',
      code: `class Widget {
  // eslint-disable-next-line require-memoize-jsx-returners
  get alpha() {
    return () => <div />;
  }
  // eslint-disable-next-line require-memoize-jsx-returners
  get beta() {
    return () => <span />;
  }
}`,
    },
    // Issue #1414: a block disable covering the class suppresses everything
    {
      name: 'block disable naming this rule suppresses the whole class',
      filename: 'file.tsx',
      code: `/* eslint-disable require-memoize-jsx-returners */
class Widget {
  get alpha() {
    return () => <div />;
  }
  get beta() {
    return () => <span />;
  }
}`,
    },
    // Issue #1414: a bare block disable suppresses every rule
    {
      name: 'bare block disable suppresses the whole class',
      filename: 'file.tsx',
      code: `/* eslint-disable */
class Widget {
  get alpha() {
    return () => <div />;
  }
  get beta() {
    return () => <span />;
  }
}`,
    },
    // Issue #1414: a bare line disable suppresses this rule too
    {
      name: 'bare eslint-disable-next-line suppresses this rule',
      filename: 'file.tsx',
      code: `class Widget {
  // eslint-disable-next-line
  get alpha() {
    return () => <div />;
  }
}`,
    },
  ],
  invalid: [
    {
      filename: 'file.tsx',
      code: `class ConditionalJsx {
  get component() {
    const make = () => <div />;
    const alt = () => null;
    return condition ? make : alt;
  }
}`,
      errors: [{ messageId: 'requireMemoizeJsxReturner' }],
      output: `import { Memoize } from '@blumintinc/typescript-memoize';
class ConditionalJsx {
  @Memoize()
  get component() {
    const make = () => <div />;
    const alt = () => null;
    return condition ? make : alt;
  }
}`,
    },
    {
      filename: 'file.tsx',
      code: `class ReassignedVariable {
  get component() {
    let make = () => <div />;
    make = () => <span>Actually Jsx</span>;
    return make;
  }
}`,
      errors: [{ messageId: 'requireMemoizeJsxReturner' }],
      output: `import { Memoize } from '@blumintinc/typescript-memoize';
class ReassignedVariable {
  @Memoize()
  get component() {
    let make = () => <div />;
    make = () => <span>Actually Jsx</span>;
    return make;
  }
}`,
    },
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
    {
      filename: 'file.tsx',
      code: `import { clear } from '@blumintinc/typescript-memoize';
class Example {
  get Component() {
    return () => <div />;
  }
}`,
      errors: [{ messageId: 'requireMemoizeJsxReturner' }],
      output: `import { clear, Memoize } from '@blumintinc/typescript-memoize';
class Example {
  @Memoize()
  get Component() {
    return () => <div />;
  }
}`,
    },
    // ------------------------------------------------------------------
    // Issue #1414: the import fix must ride on the first *surviving*
    // violation. A suppressed violation used to claim the carrier slot and
    // take the import down with it, emitting @Memoize() with no import.
    // ------------------------------------------------------------------
    {
      name: 'disable on the FIRST violation still lands the import',
      filename: 'file.tsx',
      code: `export class Widget {
  // eslint-disable-next-line require-memoize-jsx-returners
  get alpha() {
    const make = () => <div />;
    return make;
  }

  get beta() {
    const other = () => <span />;
    return other;
  }
}`,
      errors: [{ messageId: 'requireMemoizeJsxReturner' }],
      output: `import { Memoize } from '@blumintinc/typescript-memoize';
export class Widget {
  // eslint-disable-next-line require-memoize-jsx-returners
  get alpha() {
    const make = () => <div />;
    return make;
  }

  @Memoize()
  get beta() {
    const other = () => <span />;
    return other;
  }
}`,
    },
    {
      name: 'disable on a MIDDLE violation keeps one import and all other decorators',
      filename: 'file.tsx',
      code: `class Widget {
  get a() {
    return () => <div />;
  }
  // eslint-disable-next-line require-memoize-jsx-returners
  get b() {
    return () => <span />;
  }
  renderC() {
    return () => <section />;
  }
}`,
      errors: [
        { messageId: 'requireMemoizeJsxReturner' },
        { messageId: 'requireMemoizeJsxReturner' },
      ],
      output: `import { Memoize } from '@blumintinc/typescript-memoize';
class Widget {
  @Memoize()
  get a() {
    return () => <div />;
  }
  // eslint-disable-next-line require-memoize-jsx-returners
  get b() {
    return () => <span />;
  }
  @Memoize()
  renderC() {
    return () => <section />;
  }
}`,
    },
    {
      name: 'disable on the LAST violation keeps one import and all other decorators',
      filename: 'file.tsx',
      code: `class Widget {
  get a() {
    return () => <div />;
  }
  get b() {
    return () => <span />;
  }
  // eslint-disable-next-line require-memoize-jsx-returners
  get c() {
    return () => <section />;
  }
}`,
      errors: [
        { messageId: 'requireMemoizeJsxReturner' },
        { messageId: 'requireMemoizeJsxReturner' },
      ],
      output: `import { Memoize } from '@blumintinc/typescript-memoize';
class Widget {
  @Memoize()
  get a() {
    return () => <div />;
  }
  @Memoize()
  get b() {
    return () => <span />;
  }
  // eslint-disable-next-line require-memoize-jsx-returners
  get c() {
    return () => <section />;
  }
}`,
    },
    {
      name: 'bare disable on the FIRST violation still lands the import',
      filename: 'file.tsx',
      code: `class Widget {
  // eslint-disable-next-line
  get a() {
    return () => <div />;
  }
  get b() {
    return () => <span />;
  }
}`,
      errors: [{ messageId: 'requireMemoizeJsxReturner' }],
      output: `import { Memoize } from '@blumintinc/typescript-memoize';
class Widget {
  // eslint-disable-next-line
  get a() {
    return () => <div />;
  }
  @Memoize()
  get b() {
    return () => <span />;
  }
}`,
    },
    {
      name: 'a disable naming a DIFFERENT rule does not suppress this one',
      filename: 'file.tsx',
      code: `class Widget {
  // eslint-disable-next-line no-console
  get a() {
    return () => <div />;
  }
  get b() {
    return () => <span />;
  }
}`,
      errors: [
        { messageId: 'requireMemoizeJsxReturner' },
        { messageId: 'requireMemoizeJsxReturner' },
      ],
      output: `import { Memoize } from '@blumintinc/typescript-memoize';
class Widget {
  // eslint-disable-next-line no-console
  @Memoize()
  get a() {
    return () => <div />;
  }
  @Memoize()
  get b() {
    return () => <span />;
  }
}`,
    },
    {
      name: 'a disable with a -- description suffix suppresses this rule',
      filename: 'file.tsx',
      code: `class Widget {
  // eslint-disable-next-line require-memoize-jsx-returners -- rebuilt per access on purpose
  get a() {
    return () => <div />;
  }
  get b() {
    return () => <span />;
  }
}`,
      errors: [{ messageId: 'requireMemoizeJsxReturner' }],
      output: `import { Memoize } from '@blumintinc/typescript-memoize';
class Widget {
  // eslint-disable-next-line require-memoize-jsx-returners -- rebuilt per access on purpose
  get a() {
    return () => <div />;
  }
  @Memoize()
  get b() {
    return () => <span />;
  }
}`,
    },
    {
      name: 'eslint-disable-line suppresses the violation on its own line',
      filename: 'file.tsx',
      code: `class Widget {
  get a() { return () => <div />; } // eslint-disable-line require-memoize-jsx-returners
  get b() {
    return () => <span />;
  }
}`,
      errors: [{ messageId: 'requireMemoizeJsxReturner' }],
      output: `import { Memoize } from '@blumintinc/typescript-memoize';
class Widget {
  get a() { return () => <div />; } // eslint-disable-line require-memoize-jsx-returners
  @Memoize()
  get b() {
    return () => <span />;
  }
}`,
    },
    {
      name: 'violations after an eslint-enable are fixed and carry the import',
      filename: 'file.tsx',
      code: `class Widget {
  /* eslint-disable require-memoize-jsx-returners */
  get a() {
    return () => <div />;
  }
  /* eslint-enable require-memoize-jsx-returners */
  get b() {
    return () => <span />;
  }
  get c() {
    return () => <section />;
  }
}`,
      errors: [
        { messageId: 'requireMemoizeJsxReturner' },
        { messageId: 'requireMemoizeJsxReturner' },
      ],
      output: `import { Memoize } from '@blumintinc/typescript-memoize';
class Widget {
  /* eslint-disable require-memoize-jsx-returners */
  get a() {
    return () => <div />;
  }
  /* eslint-enable require-memoize-jsx-returners */
  @Memoize()
  get b() {
    return () => <span />;
  }
  @Memoize()
  get c() {
    return () => <section />;
  }
}`,
    },
    {
      name: 'suppressed first violation with Memoize already imported adds no duplicate import',
      filename: 'file.tsx',
      code: `import { Memoize } from '@blumintinc/typescript-memoize';
class Widget {
  // eslint-disable-next-line require-memoize-jsx-returners
  get a() {
    return () => <div />;
  }
  get b() {
    return () => <span />;
  }
}`,
      errors: [{ messageId: 'requireMemoizeJsxReturner' }],
      output: `import { Memoize } from '@blumintinc/typescript-memoize';
class Widget {
  // eslint-disable-next-line require-memoize-jsx-returners
  get a() {
    return () => <div />;
  }
  @Memoize()
  get b() {
    return () => <span />;
  }
}`,
    },
    {
      name: 'suppressed first violation still lets a survivor augment an existing memoize import',
      filename: 'file.tsx',
      code: `import { clear } from '@blumintinc/typescript-memoize';
class Widget {
  // eslint-disable-next-line require-memoize-jsx-returners
  get a() {
    return () => <div />;
  }
  get b() {
    return () => <span />;
  }
}`,
      errors: [{ messageId: 'requireMemoizeJsxReturner' }],
      output: `import { clear, Memoize } from '@blumintinc/typescript-memoize';
class Widget {
  // eslint-disable-next-line require-memoize-jsx-returners
  get a() {
    return () => <div />;
  }
  @Memoize()
  get b() {
    return () => <span />;
  }
}`,
    },
    {
      // MethodDefinition.range covers leading decorators, so the reported
      // location is the decorator's line. A disable above the decorator is
      // therefore the one that suppresses the report, matching real ESLint.
      name: 'disable above an existing decorator suppresses the decorated member',
      filename: 'file.tsx',
      code: `import { Custom } from './decorators';

class Widget {
  // eslint-disable-next-line require-memoize-jsx-returners
  @Custom()
  get a() {
    return () => <div />;
  }
  get b() {
    return () => <span />;
  }
}`,
      errors: [{ messageId: 'requireMemoizeJsxReturner' }],
      output: `import { Memoize } from '@blumintinc/typescript-memoize';
import { Custom } from './decorators';

class Widget {
  // eslint-disable-next-line require-memoize-jsx-returners
  @Custom()
  get a() {
    return () => <div />;
  }
  @Memoize()
  get b() {
    return () => <span />;
  }
}`,
    },
    {
      // Mirror of the above: a disable *between* the decorator and the
      // signature targets the signature line, not the reported location, so
      // ESLint does not suppress the report and the fix still applies.
      name: 'disable between a decorator and its member does not suppress',
      filename: 'file.tsx',
      code: `import { Custom } from './decorators';

class Widget {
  @Custom()
  // eslint-disable-next-line require-memoize-jsx-returners
  get a() {
    return () => <div />;
  }
}`,
      errors: [{ messageId: 'requireMemoizeJsxReturner' }],
      output: `import { Memoize } from '@blumintinc/typescript-memoize';
import { Custom } from './decorators';

class Widget {
  @Memoize()
  @Custom()
  // eslint-disable-next-line require-memoize-jsx-returners
  get a() {
    return () => <div />;
  }
}`,
    },
  ],
});

// Issue #1414: RuleTester applies a single fix pass and never shows the file
// that `eslint --fix` actually writes. These cases run the real multi-pass
// fixer and assert the invariant the bug violated: an emitted @Memoize()
// decorator is never left without its import.
describe('require-memoize-jsx-returners: inline disables and the import carrier (issue #1414)', () => {
  const RULE_ID = '@blumintinc/blumint/require-memoize-jsx-returners';

  const lint = (code: string) => {
    const linter = new Linter();
    linter.defineParser(
      '@typescript-eslint/parser',
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@typescript-eslint/parser'),
    );
    linter.defineRule(
      RULE_ID,
      requireMemoizeJsxReturners as unknown as Rule.RuleModule,
    );
    // A near-miss neighbour proves rule matching is exact rather than a
    // suffix/substring heuristic.
    linter.defineRule(
      '@blumintinc/blumint/require-memoize-jsx-returners-strict',
      {
        meta: { schema: [] },
        create: () => ({}),
      } as unknown as Rule.RuleModule,
    );
    const config = {
      parser: '@typescript-eslint/parser',
      parserOptions: {
        ecmaVersion: 2020 as const,
        sourceType: 'module' as const,
        ecmaFeatures: { jsx: true },
      },
      rules: { [RULE_ID]: 'error' as const },
    };
    const { output } = linter.verifyAndFix(code, config, 'f.tsx');
    return output;
  };

  const expectNoUnboundMemoize = (output: string) => {
    if (/@Memoize\(\)/.test(output)) {
      expect(output).toContain(
        "import { Memoize } from '@blumintinc/typescript-memoize';",
      );
    }
  };

  it('carries the import on the first surviving violation', () => {
    const output = lint(`export class Widget {
  // eslint-disable-next-line @blumintinc/blumint/require-memoize-jsx-returners
  get alpha() {
    const make = () => <div />;
    return make;
  }

  get beta() {
    const other = () => <span />;
    return other;
  }
}
`);

    expect(output)
      .toBe(`import { Memoize } from '@blumintinc/typescript-memoize';
export class Widget {
  // eslint-disable-next-line @blumintinc/blumint/require-memoize-jsx-returners
  get alpha() {
    const make = () => <div />;
    return make;
  }

  @Memoize()
  get beta() {
    const other = () => <span />;
    return other;
  }
}
`);
    expectNoUnboundMemoize(output);
  });

  it('adds neither import nor decorator when every violation is disabled', () => {
    const code = `export class Widget {
  // eslint-disable-next-line @blumintinc/blumint/require-memoize-jsx-returners
  get alpha() {
    return () => <div />;
  }

  // eslint-disable-next-line @blumintinc/blumint/require-memoize-jsx-returners
  get beta() {
    return () => <span />;
  }
}
`;

    const output = lint(code);

    expect(output).toBe(code);
    expect(output).not.toContain('Memoize }');
  });

  it('adds neither import nor decorator under a whole-file block disable', () => {
    const code = `/* eslint-disable @blumintinc/blumint/require-memoize-jsx-returners */
export class Widget {
  get alpha() {
    return () => <div />;
  }

  get beta() {
    return () => <span />;
  }
}
`;

    const output = lint(code);

    expect(output).toBe(code);
    expect(output).not.toContain('@Memoize');
  });

  it('does not treat a disable for a similarly named rule as its own', () => {
    const output = lint(`export class Widget {
  // eslint-disable-next-line @blumintinc/blumint/require-memoize-jsx-returners-strict
  get alpha() {
    return () => <div />;
  }
}
`);

    expect(output)
      .toBe(`import { Memoize } from '@blumintinc/typescript-memoize';
export class Widget {
  // eslint-disable-next-line @blumintinc/blumint/require-memoize-jsx-returners-strict
  @Memoize()
  get alpha() {
    return () => <div />;
  }
}
`);
    expectNoUnboundMemoize(output);
  });

  it('keeps the import when only the last violation survives a block disable', () => {
    const output = lint(`export class Widget {
  /* eslint-disable @blumintinc/blumint/require-memoize-jsx-returners */
  get alpha() {
    return () => <div />;
  }

  get beta() {
    return () => <span />;
  }
  /* eslint-enable @blumintinc/blumint/require-memoize-jsx-returners */

  get gamma() {
    return () => <section />;
  }
}
`);

    expect(output)
      .toBe(`import { Memoize } from '@blumintinc/typescript-memoize';
export class Widget {
  /* eslint-disable @blumintinc/blumint/require-memoize-jsx-returners */
  get alpha() {
    return () => <div />;
  }

  get beta() {
    return () => <span />;
  }
  /* eslint-enable @blumintinc/blumint/require-memoize-jsx-returners */

  @Memoize()
  get gamma() {
    return () => <section />;
  }
}
`);
    expectNoUnboundMemoize(output);
  });

  it('fixes every surviving violation across several passes with one import', () => {
    const output = lint(`export class Widget {
  // eslint-disable-next-line @blumintinc/blumint/require-memoize-jsx-returners
  get alpha() {
    return () => <div />;
  }

  get beta() {
    return () => <span />;
  }

  renderGamma() {
    return () => <section />;
  }
}
`);

    expect(output.match(/@Memoize\(\)/g)).toHaveLength(2);
    expect(
      output.match(
        /import \{ Memoize \} from '@blumintinc\/typescript-memoize';/g,
      ),
    ).toHaveLength(1);
    expectNoUnboundMemoize(output);
  });
});
