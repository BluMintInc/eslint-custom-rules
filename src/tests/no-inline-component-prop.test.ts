import { ruleTesterJsx } from '../utils/ruleTester';
import { noInlineComponentProp } from '../rules/no-inline-component-prop';

ruleTesterJsx.run('no-inline-component-prop', noInlineComponentProp, {
  valid: [
    `
    const StableWrapper = (props: { children: unknown }) => (
      <div>{props.children}</div>
    );

    function Page() {
      return <AlgoliaLayout CatalogWrapper={StableWrapper} />;
    }
    `,
    `
    function List({ items }: { items: string[] }) {
      return (
        <VirtualizedList
          items={items}
          renderItem={(row) => <Row row={row} />}
        />
      );
    }
    `,
    `
    type Props = { CatalogWrapper: (props: { id: string }) => JSX.Element };
    const Page = ({ CatalogWrapper }: Props) => (
      <AlgoliaLayout CatalogWrapper={CatalogWrapper} />
    );
    `,
    `
    const makeWrapper = (header: JSX.Element) => (props: { children: JSX.Element }) =>
      <Wrapper {...props} header={header} />;

    function Page({ header }: { header: JSX.Element }) {
      return <AlgoliaLayout CatalogWrapper={makeWrapper(header)} />;
    }
    `,
    `
    function Page() {
      const Local = () => <div>safe</div>;
      return <Local />;
    }
    `,
    `
    const Boxed = () => {
      return <Box component={(props) => <div {...props} />} />;
    };
    `,
    `
    const Grid = ({ rows }: { rows: string[] }) => (
      <GridView rows={rows} renderRow={(row) => <Row row={row} />} />
    );
    `,
    `
    import React from 'react';
    const Stable = React.memo(function Stable(props: { children: React.ReactNode }) {
      return <Wrapper {...props} />;
    });

    function Page() {
      return <AlgoliaLayout CatalogWrapper={Stable} />;
    }
    `,
    `
    const wrappers = {
      CatalogWrapper: (props: { children: JSX.Element }) => <div>{props.children}</div>,
    };

    function Page() {
      return <AlgoliaLayout CatalogWrapper={wrappers.CatalogWrapper} />;
    }
    `,
    `
    const Inline = (props: { title: string }) => <div>{props.title}</div>;
    function Page() {
      return <Layout PanelComponent={Inline} />;
    }
    `,
    `
    function Page() {
      return <List renderComponent={(row) => <Row row={row} />} />;
    }
    `,
    {
      code: `
      function Page() {
        return (
          <Layout
            custom={(props: { children: JSX.Element }) => <div {...props} />}
          />
        );
      }
      `,
      options: [{ props: ['*a*b*c*'] }],
    },
  ],
  invalid: [
    {
      code: `
      function Page() {
        return <AlgoliaLayout CatalogWrapper={(props) => <div {...props} />} />;
      }
      `,
      errors: [{ messageId: 'inlineComponentProp' }],
    },
    {
      code: `
      function Page() {
        const CatalogWrapper = (props: { children: JSX.Element }) => (
          <Wrapper {...props} />
        );
        return <AlgoliaLayout CatalogWrapper={CatalogWrapper} />;
      }
      `,
      errors: [{ messageId: 'inlineComponentProp' }],
    },
    {
      code: `
      import { useCallback } from 'react';
      function Page({ header }: { header: JSX.Element }) {
        const CatalogWrapper = useCallback(
          (props: { children: JSX.Element }) => (
            <Wrapper {...props} header={header} />
          ),
          [header],
        );
        return <AlgoliaLayout CatalogWrapper={CatalogWrapper} />;
      }
      `,
      errors: [{ messageId: 'inlineComponentProp' }],
    },
    {
      code: `
      import { useMemo } from 'react';
      function Page({ header }: { header: JSX.Element }) {
        const CatalogWrapper = useMemo(
          function CatalogWrapper(props: { children: JSX.Element }) {
            return <Wrapper {...props} header={header} />;
          },
          [header],
        );
        return <AlgoliaLayout CatalogWrapper={CatalogWrapper} />;
      }
      `,
      errors: [{ messageId: 'inlineComponentProp' }],
    },
    {
      code: `
      function Page() {
        function ItemComponent(props: { value: string }) {
          return <Row {...props} />;
        }
        return <List ItemComponent={ItemComponent} />;
      }
      `,
      errors: [{ messageId: 'inlineComponentProp' }],
    },
    {
      code: `
      import React from 'react';
      function Page() {
        const WrapperComponent = React.memo((props: { children: JSX.Element }) => (
          <Wrapper {...props} />
        ));
        return <AlgoliaLayout CatalogWrapper={WrapperComponent} />;
      }
      `,
      errors: [{ messageId: 'inlineComponentProp' }],
    },
    {
      code: `
      function Page() {
        const rowWrapper = (props: { children: JSX.Element }) => <div {...props} />;
        return <AlgoliaLayout RowWrapper={rowWrapper} />;
      }
      `,
      errors: [{ messageId: 'inlineComponentProp' }],
    },
    {
      code: `
      function Page() {
        const wrappers = {
          CatalogWrapper: (props: { children: JSX.Element }) => <div {...props} />,
        };
        return <AlgoliaLayout CatalogWrapper={wrappers.CatalogWrapper} />;
      }
      `,
      errors: [{ messageId: 'inlineComponentProp' }],
    },
    {
      code: `
      function Page() {
        return (
          <List
            renderComponent={(row) => <Row row={row} />}
          />
        );
      }
      `,
      options: [{ allowRenderProps: false }],
      errors: [{ messageId: 'inlineComponentProp' }],
    },
    {
      code: `
      import React from 'react';
      function Page() {
        const Forward = React.forwardRef<HTMLDivElement, { children: JSX.Element }>(
          (props, ref) => <div ref={ref}>{props.children}</div>,
        );
        return <AlgoliaLayout CatalogWrapper={Forward} />;
      }
      `,
      errors: [{ messageId: 'inlineComponentProp' }],
    },
    {
      code: `
      function Page() {
        const SlotComponent = (props: { value: string }) => <div>{props.value}</div>;
        return <Widget SlotComponent={SlotComponent} />;
      }
      `,
      options: [{ props: ['SlotComponent'] }],
      errors: [{ messageId: 'inlineComponentProp' }],
    },
    {
      code: `
      import { useCallback } from 'react';
      function Page() {
        return (
          <AlgoliaLayout
            CatalogWrapper={useCallback(
              (props: { children: JSX.Element }) => <div {...props} />,
              [],
            )}
          />
        );
      }
      `,
      errors: [{ messageId: 'inlineComponentProp' }],
    },
    {
      code: `
      function Page() {
        return (
          <Widget
            customProp={(props: { value: string }) => <div>{props.value}</div>}
          />
        );
      }
      `,
      options: [{ props: ['customProp'] }],
      errors: [{ messageId: 'inlineComponentProp' }],
    },
  ],
});
