import { Linter, Rule } from 'eslint';
import * as ts from 'typescript';
import { ruleTesterJsx, ruleTesterTs } from '../utils/ruleTester';
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
    {
      // A pre-existing `Memoize` binding makes the import unsafe to insert:
      // writing it would declare the name twice (TS2440/TS2300). The violation
      // is still reported so the author resolves the conflict deliberately.
      name: 'declines the fix when Memoize is bound to an unrelated value',
      filename: 'file.tsx',
      code: `const Memoize = undefined as unknown as never;
class SequenceLastJsx {
  render() {
    return (doSomething(), <section />);
  }
}`,
      errors: [{ messageId: 'requireMemoizeJsxReturner' }],
      output: `const Memoize = undefined as unknown as never;
class SequenceLastJsx {
  render() {
    return (doSomething(), <section />);
  }
}`,
    },
    {
      // Every violation in the file consults the same binding, so none of them
      // may carry the import.
      name: 'declines the fix for every violation when Memoize is bound',
      filename: 'file.tsx',
      code: `const Memoize = createLocalMemoize();
class Widget {
  get alpha() {
    return () => <div />;
  }
  renderBeta() {
    return () => <span />;
  }
}`,
      errors: [
        { messageId: 'requireMemoizeJsxReturner' },
        { messageId: 'requireMemoizeJsxReturner' },
      ],
      output: `const Memoize = createLocalMemoize();
class Widget {
  get alpha() {
    return () => <div />;
  }
  renderBeta() {
    return () => <span />;
  }
}`,
    },
    {
      // A narrower shadow raises no TypeScript diagnostic: the emitted
      // `@Memoize()` would silently resolve to the local binding instead of the
      // decorator factory.
      name: 'declines the fix when a narrower scope shadows the import',
      filename: 'file.tsx',
      code: `import { Memoize } from '@blumintinc/typescript-memoize';

export function makeWidget() {
  const Memoize = () => () => undefined;
  class Widget {
    get alpha() {
      return () => <div />;
    }
  }
  return Widget;
}`,
      errors: [{ messageId: 'requireMemoizeJsxReturner' }],
      output: `import { Memoize } from '@blumintinc/typescript-memoize';

export function makeWidget() {
  const Memoize = () => () => undefined;
  class Widget {
    get alpha() {
      return () => <div />;
    }
  }
  return Widget;
}`,
    },
    {
      // Same name, different module: the inserted import would collide with the
      // local one rather than reuse it.
      name: 'declines the fix when Memoize is imported from another module',
      filename: 'file.tsx',
      code: `import { Memoize } from './decorators';

class Widget {
  get alpha() {
    return () => <div />;
  }
}`,
      errors: [{ messageId: 'requireMemoizeJsxReturner' }],
      output: `import { Memoize } from './decorators';

class Widget {
  get alpha() {
    return () => <div />;
  }
}`,
    },
    {
      // Import state is read from the program body when the fix is computed, so
      // an import that follows the class — the shape `eslint --fix` itself
      // produces between passes — is reused instead of duplicated.
      name: 'reuses an import that follows the class in source order',
      filename: 'file.tsx',
      code: `class Widget {
  get alpha() {
    return () => <div />;
  }
}
import { Memoize } from '@blumintinc/typescript-memoize';`,
      errors: [{ messageId: 'requireMemoizeJsxReturner' }],
      output: `class Widget {
  @Memoize()
  get alpha() {
    return () => <div />;
  }
}
import { Memoize } from '@blumintinc/typescript-memoize';`,
    },
    {
      // A default specifier binds `Memoize` without exporting it as a named
      // specifier, so the fixer can neither augment that import nor add a
      // second one.
      name: 'declines the fix for a default memoize import named Memoize',
      filename: 'file.tsx',
      code: `import Memoize from '@blumintinc/typescript-memoize';

class Widget {
  get alpha() {
    return () => <div />;
  }
}`,
      errors: [{ messageId: 'requireMemoizeJsxReturner' }],
      output: `import Memoize from '@blumintinc/typescript-memoize';

class Widget {
  get alpha() {
    return () => <div />;
  }
}`,
    },
    // Issue #1648: a file with no import to anchor to must not have its
    // prologue displaced by the inserted import.
    {
      name: "keeps 'use client' the first statement in a file with no imports",
      filename: 'file.tsx',
      code: `'use client';
class ConditionalJsx {
  get component() {
    const make = () => <div />;
    const alt = () => null;
    return condition ? make : alt;
  }
}`,
      errors: [{ messageId: 'requireMemoizeJsxReturner' }],
      output: `'use client';
import { Memoize } from '@blumintinc/typescript-memoize';
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
      // A shebang that stops being the first characters of the file makes the
      // whole file unparseable.
      name: 'keeps a shebang at character zero in a file with no imports',
      filename: 'file.tsx',
      code: `#!/usr/bin/env node
class ConditionalJsx {
  get component() {
    const make = () => <div />;
    const alt = () => null;
    return condition ? make : alt;
  }
}`,
      errors: [{ messageId: 'requireMemoizeJsxReturner' }],
      output: `#!/usr/bin/env node
import { Memoize } from '@blumintinc/typescript-memoize';
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
      // A header comment governs the code below it, so the import belongs
      // under it rather than above it.
      name: 'keeps a // @ts-nocheck header above the inserted import',
      filename: 'file.tsx',
      code: `// @ts-nocheck
class ConditionalJsx {
  get component() {
    const make = () => <div />;
    const alt = () => null;
    return condition ? make : alt;
  }
}`,
      errors: [{ messageId: 'requireMemoizeJsxReturner' }],
      output: `// @ts-nocheck
import { Memoize } from '@blumintinc/typescript-memoize';
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
      // The control for the three cases above: an existing import is still the
      // anchor, so the prologue fix cannot pass by refusing to anchor at all.
      name: "inserts below 'use client' and above an existing import",
      filename: 'file.tsx',
      code: `'use client';
import foo from './foo';
class ConditionalJsx {
  get component() {
    const make = () => <div />;
    const alt = () => null;
    return condition ? make : alt;
  }
}`,
      errors: [{ messageId: 'requireMemoizeJsxReturner' }],
      output: `'use client';
import { Memoize } from '@blumintinc/typescript-memoize';
import foo from './foo';
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
      // Widening the anchor to its line start is what demoted the directive:
      // a directive sharing the anchor's line put the line start at character
      // 0, above the prologue.
      name: 'keeps a directive that shares a line with the anchor first',
      filename: 'file.tsx',
      code: `'use client';import foo from './foo';
class ConditionalJsx {
  get component() {
    const make = () => <div />;
    const alt = () => null;
    return condition ? make : alt;
  }
}`,
      errors: [{ messageId: 'requireMemoizeJsxReturner' }],
      output: `'use client';import { Memoize } from '@blumintinc/typescript-memoize';
import foo from './foo';
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
      // An indented anchor keeps its own indentation: the import takes the
      // anchor's position and re-emits the whitespace it displaced.
      name: 'preserves the indentation of an indented anchor statement',
      filename: 'file.tsx',
      code: `  class ConditionalJsx {
    get component() {
      const make = () => <div />;
      const alt = () => null;
      return condition ? make : alt;
    }
  }`,
      errors: [{ messageId: 'requireMemoizeJsxReturner' }],
      output: `  import { Memoize } from '@blumintinc/typescript-memoize';
  class ConditionalJsx {
    @Memoize()
    get component() {
      const make = () => <div />;
      const alt = () => null;
      return condition ? make : alt;
    }
  }`,
    },
  ],
});

// Issue #1950: under `experimentalDecorators` — the mode this plugin's
// consumers compile in — TypeScript rejects a decorator on EVERY member of a
// class EXPRESSION with TS1206, "Decorators are not valid here." The
// `@Memoize()` this rule prescribes therefore cannot be written on such a
// member at all, so the report is withheld along with its fix rather than
// naming a remedy the author cannot apply. Measured against a real
// `ts.Program` below: each valid shape here gained TS1206 the moment `--fix`
// inserted the decorator.
//
// Declared under `ruleTesterJsx` because every fixture is JSX: the shared TS
// tester enables JSX only through a `.tsx` filename, and a JSX fixture that
// fails to parse reports nothing — silence indistinguishable from the carve-out
// under test. Each case carries the filename too, since the rule itself is
// gated on a `.ts`/`.tsx` path.
ruleTesterJsx.run(
  'require-memoize-jsx-returners (class expressions, issue #1950)',
  requireMemoizeJsxReturners,
  {
    valid: [
      {
        name: 'a getter in an anonymous class expression is not reported',
        filename: 'file.tsx',
        code: `export const Widget = class {
  public get view() {
    return <div />;
  }
};`,
      },
      {
        name: 'a method in an anonymous class expression is not reported',
        filename: 'file.tsx',
        code: `export const Widget = class {
  public render() {
    return <div />;
  }
};`,
      },
      {
        name: 'a getter returning a JSX factory in a class expression is not reported',
        filename: 'file.tsx',
        code: `export const Widget = class {
  get Component() {
    return () => <div />;
  }
};`,
      },
      {
        name: 'a getter in a named class expression is not reported',
        filename: 'file.tsx',
        code: `export const Widget = class Inner {
  get view() {
    return <div />;
  }
};`,
      },
      {
        name: 'a method in a named class expression is not reported',
        filename: 'file.tsx',
        code: `export const Widget = class Inner {
  render() {
    return <div />;
  }
};`,
      },
      {
        name: 'a class expression returned from a factory function is not reported',
        filename: 'file.tsx',
        code: `export function build() {
  return class {
    get view() {
      return <div />;
    }
  };
}`,
      },
      {
        name: "a class expression in an arrow function's concise body is not reported",
        filename: 'file.tsx',
        code: `export const build = () =>
  class {
    get view() {
      return <div />;
    }
  };`,
      },
      {
        name: 'a class expression held in an object property is not reported',
        filename: 'file.tsx',
        code: `export const registry = {
  Widget: class {
    render() {
      return <div />;
    }
  },
};`,
      },
      {
        name: 'a class expression passed as a call argument is not reported',
        filename: 'file.tsx',
        code: `declare function register(constructor: unknown): void;

register(
  class {
    render() {
      return <div />;
    }
  },
);`,
      },
      {
        name: 'a class expression in a default parameter is not reported',
        filename: 'file.tsx',
        code: `export function build(
  Widget = class {
    render() {
      return <div />;
    }
  },
) {
  return Widget;
}`,
      },
      {
        name: 'a class expression held in a class property is not reported',
        filename: 'file.tsx',
        code: `export class Registry {
  static Widget = class {
    get view() {
      return <div />;
    }
  };
}`,
      },
      {
        name: 'a class expression written on a single line is not reported',
        filename: 'file.tsx',
        code: `export const Widget = class { get view() { return <div />; } };`,
      },
      {
        name: 'a class expression extending a base class is not reported',
        filename: 'file.tsx',
        code: `import { Base } from './Base';

export const Widget = class extends Base {
  get view() {
    return <div />;
  }
};`,
      },
      {
        name: 'an immediately instantiated class expression is not reported',
        filename: 'file.tsx',
        code: `export const widget = new (class {
  get view() {
    return <div />;
  }
})();`,
      },
      {
        name: 'a class expression is silent even where the Memoize import exists',
        filename: 'file.tsx',
        code: `import { Memoize } from '@blumintinc/typescript-memoize';

export const Widget = class {
  get view() {
    return <div />;
  }
};`,
      },
      {
        name: 'a createElement call in a class expression is not reported',
        filename: 'file.tsx',
        code: `import React from 'react';

export const Widget = class {
  render() {
    return React.createElement('div', null);
  }
};`,
      },
      {
        name: "a class expression inside a class declaration's method is not reported",
        filename: 'file.tsx',
        code: `export class Outer {
  build() {
    return class {
      get view() {
        return <div />;
      }
    };
  }
}`,
      },
      {
        name: 'a nested JSX factory in a class expression is not reported',
        filename: 'file.tsx',
        code: `export const Widget = class {
  get Component() {
    return () => () => <div />;
  }
};`,
      },
      {
        // `export default class { … }` is a DECLARATION and still reports (see
        // below); parenthesizing it makes it an expression, and only then does
        // the carve-out apply.
        name: 'a parenthesized default-exported class expression is not reported',
        filename: 'file.tsx',
        code: `export default (class {
  render() {
    return <div />;
  }
});`,
      },
      {
        name: 'a class expression nested in another class expression is not reported',
        filename: 'file.tsx',
        code: `export const Outer = class {
  build() {
    return class {
      render() {
        return <span />;
      }
    };
  }
};`,
      },
    ],
    invalid: [
      // The boundary the carve-out must not cross: a class DECLARATION takes
      // decorators in every position TypeScript accepts a class in, so each of
      // these still reports and is still fixed. Reading the member's OWN
      // enclosing class rather than walking ancestors is what keeps the nested
      // cases here instead of among the silent ones above.
      {
        name: 'a getter in a class declaration is still reported and fixed',
        filename: 'file.tsx',
        code: `export class Widget {
  public get view() {
    return <div />;
  }
}`,
        errors: [{ messageId: 'requireMemoizeJsxReturner' }],
        output: `import { Memoize } from '@blumintinc/typescript-memoize';
export class Widget {
  @Memoize()
  public get view() {
    return <div />;
  }
}`,
      },
      {
        name: 'a method in a class declaration is still reported and fixed',
        filename: 'file.tsx',
        code: `export class Widget {
  public render() {
    return <div />;
  }
}`,
        errors: [{ messageId: 'requireMemoizeJsxReturner' }],
        output: `import { Memoize } from '@blumintinc/typescript-memoize';
export class Widget {
  @Memoize()
  public render() {
    return <div />;
  }
}`,
      },
      {
        // The case the whole design rests on: walking ancestors for a class
        // expression would silence this inner class, whose members take
        // decorators perfectly well.
        name: "a class declaration inside a class expression's method is still fixed",
        filename: 'file.tsx',
        code: `export const Outer = class {
  public build() {
    class Widget {
      get view() {
        return <div />;
      }
    }
    return Widget;
  }
};`,
        errors: [{ messageId: 'requireMemoizeJsxReturner' }],
        output: `import { Memoize } from '@blumintinc/typescript-memoize';
export const Outer = class {
  public build() {
    class Widget {
      @Memoize()
      get view() {
        return <div />;
      }
    }
    return Widget;
  }
};`,
      },
      {
        // Both members return JSX, and exactly one of them can carry a
        // decorator: the count pins that the carve-out is per MEMBER rather
        // than per file.
        name: 'only the nested declaration reports when both members return JSX',
        filename: 'file.tsx',
        code: `export const Outer = class {
  public render() {
    return <div />;
  }
  public build() {
    class Widget {
      renderInner() {
        return <span />;
      }
    }
    return Widget;
  }
};`,
        errors: [{ messageId: 'requireMemoizeJsxReturner' }],
        output: `import { Memoize } from '@blumintinc/typescript-memoize';
export const Outer = class {
  public render() {
    return <div />;
  }
  public build() {
    class Widget {
      @Memoize()
      renderInner() {
        return <span />;
      }
    }
    return Widget;
  }
};`,
      },
      {
        // An anonymous default export is a ClassDeclaration despite having no
        // name, so nothing about it is out of a decorator's reach.
        name: 'a getter in an anonymous default-exported class is still fixed',
        filename: 'file.tsx',
        code: `export default class {
  public get view() {
    return <div />;
  }
}`,
        errors: [{ messageId: 'requireMemoizeJsxReturner' }],
        output: `import { Memoize } from '@blumintinc/typescript-memoize';
export default class {
  @Memoize()
  public get view() {
    return <div />;
  }
}`,
      },
      {
        name: 'a method in an anonymous default-exported class is still fixed',
        filename: 'file.tsx',
        code: `export default class {
  public render() {
    return <div />;
  }
}`,
        errors: [{ messageId: 'requireMemoizeJsxReturner' }],
        output: `import { Memoize } from '@blumintinc/typescript-memoize';
export default class {
  @Memoize()
  public render() {
    return <div />;
  }
}`,
      },
      {
        name: 'a class declaration nested in a function is still fixed',
        filename: 'file.tsx',
        code: `export function build() {
  class Widget {
    get view() {
      return <div />;
    }
  }
  return Widget;
}`,
        errors: [{ messageId: 'requireMemoizeJsxReturner' }],
        output: `import { Memoize } from '@blumintinc/typescript-memoize';
export function build() {
  class Widget {
    @Memoize()
    get view() {
      return <div />;
    }
  }
  return Widget;
}`,
      },
      {
        name: 'a class declaration inside a block is still fixed',
        filename: 'file.tsx',
        code: `{
  class Widget {
    render() {
      return <div />;
    }
  }
}`,
        errors: [{ messageId: 'requireMemoizeJsxReturner' }],
        output: `import { Memoize } from '@blumintinc/typescript-memoize';
{
  class Widget {
    @Memoize()
    render() {
      return <div />;
    }
  }
}`,
      },
      {
        name: 'a declaration is fixed while a sibling class expression stays silent',
        filename: 'file.tsx',
        code: `export class Widget {
  get view() {
    return <div />;
  }
}
export const Inner = class {
  get other() {
    return <span />;
  }
};`,
        errors: [{ messageId: 'requireMemoizeJsxReturner' }],
        output: `import { Memoize } from '@blumintinc/typescript-memoize';
export class Widget {
  @Memoize()
  get view() {
    return <div />;
  }
}
export const Inner = class {
  get other() {
    return <span />;
  }
};`,
      },
      {
        name: "a class declaration inside a class expression's getter is still fixed",
        filename: 'file.tsx',
        code: `export const Outer = class {
  get factory() {
    class Widget {
      get view() {
        return <div />;
      }
    }
    return Widget;
  }
};`,
        errors: [{ messageId: 'requireMemoizeJsxReturner' }],
        output: `import { Memoize } from '@blumintinc/typescript-memoize';
export const Outer = class {
  get factory() {
    class Widget {
      @Memoize()
      get view() {
        return <div />;
      }
    }
    return Widget;
  }
};`,
      },
      {
        name: 'a nested declaration returning a JSX factory is still fixed',
        filename: 'file.tsx',
        code: `export const Outer = class {
  public build() {
    class Widget {
      get Component() {
        return () => <div />;
      }
    }
    return Widget;
  }
};`,
        errors: [{ messageId: 'requireMemoizeJsxReturner' }],
        output: `import { Memoize } from '@blumintinc/typescript-memoize';
export const Outer = class {
  public build() {
    class Widget {
      @Memoize()
      get Component() {
        return () => <div />;
      }
    }
    return Widget;
  }
};`,
      },
      {
        // The report survives the carve-out; the FIX is declined for the
        // unrelated reason that the emitted `@Memoize()` would resolve to the
        // parameter. `output: null` asserts that decline — an omitted `output`
        // would assert nothing at all.
        name: 'a nested declaration reports without a fix when Memoize is shadowed',
        filename: 'file.tsx',
        code: `export const Outer = class {
  public build(Memoize) {
    class Widget {
      get view() {
        return <div />;
      }
    }
    return Widget;
  }
};`,
        errors: [{ messageId: 'requireMemoizeJsxReturner' }],
        output: null,
      },
    ],
  },
);

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

  // Issue #1434: the fixer used to insert its import next to an existing
  // `Memoize` binding, writing a file with the name declared twice (TS2440).
  it('leaves a file that already binds Memoize untouched across passes', () => {
    const code = `const Memoize = createLocalMemoize();
export class Widget {
  get alpha() {
    return () => <div />;
  }

  renderBeta() {
    return () => <span />;
  }
}
`;

    const output = lint(code);

    expect(output).toBe(code);
    expect(output).not.toContain('@Memoize');
    expect(output).not.toContain('typescript-memoize');
  });
});

// Issue #1950: the class-expression carve-out is a claim about the COMPILER,
// and no ESLint-level assertion can check it. `RuleTester` never type-checks,
// and the class-expression cases above are `valid`, so they produce no fix pair
// for `fixer-type-safety` to compile — the whole suite would stay green with
// the carve-out removed and `--fix` emitting TS1206 again. These cases compile
// each shape under a real `ts.Program` with `experimentalDecorators: true` and
// assert differentially: the fixed text must carry no diagnostic its input did
// not already carry. An absolute count would only measure how many identifiers
// a JSX fragment leaves undefined.
describe('require-memoize-jsx-returners: `--fix` leaves every class shape compiling (issue #1950)', () => {
  const RULE_ID = '@blumintinc/blumint/require-memoize-jsx-returners';
  const FILENAME = '/memoize/Widget.tsx';
  const MEMOIZE_STUB = '/memoize/typescript-memoize.d.ts';
  const MEMOIZE_STUB_TEXT =
    'export declare function Memoize(...args: unknown[]): MethodDecorator;\n';

  const createLinter = () => {
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
    return linter;
  };

  const LINT_CONFIG = {
    parser: '@typescript-eslint/parser',
    parserOptions: {
      ecmaVersion: 2022 as const,
      sourceType: 'module' as const,
      ecmaFeatures: { jsx: true },
    },
    rules: { [RULE_ID]: 'error' as const },
  };

  const fix = (code: string) =>
    createLinter().verifyAndFix(code, LINT_CONFIG, FILENAME);

  /**
   * `noLib` keeps each program to two source files, which is what makes a
   * per-shape compile affordable here; the lib and React types are absent from
   * the input and the output alike, so the diagnostics they cost (TS2304 for
   * the JSX factory, TS7026 for the intrinsic element) cancel in the
   * differential. The memoize package resolves to an in-memory stub so that the
   * import the fixer injects cannot manufacture a TS2307 the input lacked and
   * mask the diagnostic actually under test.
   */
  const compilerOptions: ts.CompilerOptions = {
    experimentalDecorators: true,
    strict: true,
    target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.React,
    noEmit: true,
    noLib: true,
    types: [],
  };

  const diagnosticsOf = (source: string): string[] => {
    const files = new Map<string, string>([
      [FILENAME, source],
      [MEMOIZE_STUB, MEMOIZE_STUB_TEXT],
    ]);
    const sourceFiles = new Map(
      [...files].map(([name, text]) => [
        name,
        ts.createSourceFile(
          name,
          text,
          ts.ScriptTarget.ES2022,
          true,
          // A `.tsx` source parsed as `.ts` makes every fixture a syntax
          // error, which would read as "no new diagnostic" on both sides.
          name.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
        ),
      ]),
    );
    const host: ts.CompilerHost = {
      getSourceFile: (name) => sourceFiles.get(name),
      getDefaultLibFileName: () => 'lib.d.ts',
      writeFile: () => undefined,
      getCurrentDirectory: () => '/memoize',
      getCanonicalFileName: (name) => name,
      useCaseSensitiveFileNames: () => true,
      getNewLine: () => '\n',
      fileExists: (name) => files.has(name),
      readFile: (name) => files.get(name),
      resolveModuleNames: (moduleNames) =>
        moduleNames.map((name) =>
          name === '@blumintinc/typescript-memoize' ||
          name === 'typescript-memoize'
            ? {
                resolvedFileName: MEMOIZE_STUB,
                extension: ts.Extension.Dts,
                isExternalLibraryImport: true,
              }
            : undefined,
        ),
    };
    const program = ts.createProgram([FILENAME], compilerOptions, host);
    const file = program.getSourceFile(FILENAME);
    if (!file) {
      throw new Error('the source under test is missing from the program');
    }
    // TS1206 is a grammar check the CHECKER runs, so it reaches neither
    // `getSyntacticDiagnostics` nor a `transpileModule` round trip; reading
    // both buckets is what makes it visible.
    return [
      ...program.getSyntacticDiagnostics(file),
      ...program.getSemanticDiagnostics(file),
    ].map((diagnostic) => `TS${diagnostic.code}`);
  };

  const introducedBy = (before: string, after: string): string[] => {
    const carried = diagnosticsOf(before);
    return diagnosticsOf(after).filter((code, index, all) => {
      const seenBefore = carried.filter((entry) => entry === code).length;
      const seenHere = all.slice(0, index + 1).filter((e) => e === code).length;
      return seenHere > seenBefore;
    });
  };

  it('proves the premise: a decorator inside a class expression is TS1206', () => {
    // The harness itself needs a control, or a compile step that silently saw
    // nothing would certify every shape below as clean. Written by hand, the
    // very edit the fixer used to make is rejected — and the same decorator on
    // the same member of a class DECLARATION is accepted.
    expect(
      diagnosticsOf(`import { Memoize } from '@blumintinc/typescript-memoize';
export const Widget = class {
  @Memoize()
  public get view() { return <div />; }
};
`),
    ).toContain('TS1206');

    expect(
      diagnosticsOf(`import { Memoize } from '@blumintinc/typescript-memoize';
export class Widget {
  @Memoize()
  public get view() { return <div />; }
}
`),
    ).not.toContain('TS1206');
  });

  // Spelled out rather than composed from a shared body: a mismatched brace
  // would make the fixture a parse error, and an unparseable fixture reports
  // nothing — which is indistinguishable from the silence under test. The
  // `verify` assertion below counts the parse error too, so this cannot pass
  // vacuously.
  const CLASS_EXPRESSIONS: [string, string][] = [
    [
      'anonymous, bound to a const',
      'export const Widget = class {\n  public get view() { return <div />; }\n};\n',
    ],
    [
      'anonymous, with a method',
      'export const Widget = class {\n  public render() { return <div />; }\n};\n',
    ],
    [
      'named',
      'export const Widget = class Inner {\n  public get view() { return <div />; }\n};\n',
    ],
    [
      'returned from a factory',
      'export function build() {\n  return class {\n    public get view() { return <div />; }\n  };\n}\n',
    ],
    [
      'passed as an argument',
      'declare function register(c: unknown): void;\nregister(class {\n  public render() { return <div />; }\n});\n',
    ],
    [
      'held in an object property',
      'export const registry = {\n  Widget: class {\n    public render() { return <div />; }\n  },\n};\n',
    ],
    [
      'held in a class property',
      'export class Registry {\n  static Widget = class {\n    public get view() { return <div />; }\n  };\n}\n',
    ],
    [
      'in a default parameter',
      'export function build(Widget = class {\n  public render() { return <div />; }\n}) {\n  return Widget;\n}\n',
    ],
    [
      'returning a JSX factory',
      'export const Widget = class {\n  public get Component() { return () => <div />; }\n};\n',
    ],
    [
      'written on a single line',
      'export const Widget = class { public get view() { return <div />; } };\n',
    ],
  ];

  it.each(CLASS_EXPRESSIONS)(
    'a class expression %s is silent and left byte-for-byte alone',
    (_name, code) => {
      expect(createLinter().verify(code, LINT_CONFIG, FILENAME)).toHaveLength(
        0,
      );

      const first = fix(code);

      expect(first.fixed).toBe(false);
      expect(first.output).toBe(code);
      expect(introducedBy(code, first.output)).toEqual([]);
    },
  );

  const CLASS_DECLARATIONS: [string, string][] = [
    [
      'at the top level',
      'export class Widget {\n  public get view() { return <div />; }\n}\n',
    ],
    [
      'with a method',
      'export class Widget {\n  public render() { return <div />; }\n}\n',
    ],
    [
      'nested in a function',
      'export function build() {\n  class Widget {\n    public get view() { return <div />; }\n  }\n  return Widget;\n}\n',
    ],
    [
      'nested in a class expression method',
      'export const Outer = class {\n  public build() {\n    class Widget {\n      public get view() { return <div />; }\n    }\n    return Widget;\n  }\n};\n',
    ],
    [
      'anonymous and default-exported',
      'export default class {\n  public get view() { return <div />; }\n}\n',
    ],
    // A DECLARATION whose member shares the class's own line is absent
    // deliberately. The decorator is inserted at the member's LINE START, which
    // for a one-line class is the line the class opens on, so the edit lands
    // before `export class` and the member is still undecorated on the next
    // pass — the fixer re-fires until ESLint's pass limit stops it. That is a
    // defect of the insertion point rather than of the class-expression
    // carve-out this guard exists for, and asserting it here would make one
    // rule's fix converge only by fixing the other. The single-line EXPRESSION
    // row above stays, since silence is the whole claim there.
  ];

  it.each(CLASS_DECLARATIONS)(
    'a class declaration %s is still decorated, converges, and still compiles',
    (_name, code) => {
      const first = fix(code);

      expect(first.fixed).toBe(true);
      expect(first.output).toContain('@Memoize()');
      // Re-running the fixer on its own output is the convergence detector:
      // comparing the two strings would call an even-length cycle converged.
      expect(fix(first.output).fixed).toBe(false);
      expect(introducedBy(code, first.output)).toEqual([]);
    },
  );

  it('would have caught the bug: the pre-fix edit introduces TS1206', () => {
    // The mutation this guard exists to detect, applied by hand: had the rule
    // kept decorating a class expression, `introducedBy` would have returned
    // exactly this, so the assertions above are not vacuous.
    const before = `export const Widget = class {
  public get view() { return <div />; }
};
`;
    const after = `import { Memoize } from '@blumintinc/typescript-memoize';
export const Widget = class {
  @Memoize()
  public get view() { return <div />; }
};
`;

    expect(introducedBy(before, after)).toEqual(['TS1206']);
  });
});
