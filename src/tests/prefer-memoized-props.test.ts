import { ruleTesterJsx } from '../utils/ruleTester';
import { preferMemoizedProps } from '../rules/prefer-memoized-props';

ruleTesterJsx.run('prefer-memoized-props', preferMemoizedProps, {
  valid: [
    `
      import React, { useMemo, useCallback } from 'react';
      const MyComponent = React.memo(({ onClick }) => {
        const payload = useMemo(() => ({ active: true }), []);
        const handleClick = useCallback(() => onClick(payload), [onClick, payload]);
        return <button onClick={handleClick}>Click</button>;
      });
    `,
    `
      import React from 'react';
      const Label = React.memo(({ text }) => <span>{text}</span>);
    `,
    `
      const Plain = ({ onClick }: { onClick: () => void }) => (
        <button onClick={() => onClick()}>Click</button>
      );
    `,
    `
      import React, { memo, useCallback } from 'react';
      const CONFIG = { color: 'red' } as const;
      const Wrapper = memo(() => <Child config={CONFIG} />);
    `,
    `
      import { memo, useCallback } from 'react';
      const Comp = memo(function Comp({ save }: { save: () => void }) {
        const handleSave = useCallback(() => save(), [save]);
        return <Child onSave={handleSave} />;
      });
    `,
    `
      import { memo, useMemo } from 'react';
      const ListComp = memo(() => {
        const items = useMemo(() => [1, 2, 3], []);
        return <List items={items} />;
      });
    `,
    `
      import React, { memo, useMemo } from 'react';
      const Handler = memo(({ compute }: { compute: () => number }) => {
        const handler = useMemo(() => () => compute(), [compute]);
        return <Child onCompute={handler} />;
      });
    `,
    `
      import React, { memo } from 'react';
      function Button({ onClick }: { onClick: () => void }) {
        return <button onClick={onClick}>Click</button>;
      }
      const MemoButton = memo(Button);
    `,
    `
      import React, { memo, useMemo } from 'react';
      const Component = memo(({ rows }: { rows: number[] }) => {
        const deduped = useMemo(() => new Set(rows), [rows]);
        return <Table rows={Array.from(deduped)} />;
      });
    `,
    `
      import React, { memo, useCallback } from 'react';
      const Hoverable = memo(({ onHover }: { onHover: () => void }) => {
        const handleHover = useCallback(onHover, [onHover]);
        return <div onMouseEnter={handleHover} />;
      });
    `,
    `
      import React, { memo } from 'react';
      const Mixed = memo(({ value }: { value: string }) => (
        <Child label={value} count={value.length} />
      ));
    `,
    `
      import { memo, useMemo } from 'react';
      const SkipsReturn = memo(() => {
        const label = useMemo(() => {
          const hint = 'noop';
        }, []);
        return <span>{label}</span>;
      });
    `,
    `
      import { memo, useMemo } from 'react';
      const NonFunctionMemo = memo(({ text }) => {
        const memoized = useMemo(text, [text]);
        return <span>{memoized}</span>;
      });
    `,
    `
      import { memo, useMemo } from 'react';
      const Shadowing = memo(() => {
        const stable = useMemo(() => ({ ready: true }), []);
        function renderRow() {
          const stable = { shadowed: true };
          return stable;
        }
        renderRow();
        return <Child config={stable} />;
      });
    `,
    `
      import { memo, useMemo } from 'react';
      const compute = (value: number) => value * 2;
      const FancyResult = memo(({ value }: { value: number }) => {
        const label = useMemo(() => \`Result: \${compute(value)}\`, [value]);
        return <span>{label}</span>;
      });
    `,
    `
      import { memo, useMemo } from 'react';
      const InitialOnly = memo(({ value }: { value: string }) => {
        const initial = useMemo(() => value, []);
        return <span>{initial}</span>;
      });
    `,
    `
      import { memo } from 'react';
      function Button({ label }: { label: string }) {
        return <span>{label}</span>;
      }
      const MemoButton = memo(Button);
      function Wrapper({ label }: { label: string }) {
        function Button() {
          const payload = { text: label };
          return <span>{payload.text}</span>;
        }
        return <Button />;
      }
    `,
  ],
  invalid: [
    {
      code: `
        import React from 'react';
        const MyComponent = React.memo(({ onClick }) => (
          <button onClick={() => onClick({ active: true })}>Click</button>
        ));
      `,
      errors: [{ messageId: 'memoizeReferenceProp' }],
    },
    {
      code: `
        import { memo } from 'react';
        const InlineObject = memo(() => <Child config={{ enabled: true }} />);
      `,
      errors: [{ messageId: 'memoizeReferenceProp' }],
    },
    {
      code: `
        import { memo } from 'react';
        const AssertedInlineObject = memo(() => (
          <Child config={{ enabled: true } as const} />
        ));
      `,
      errors: [{ messageId: 'memoizeReferenceProp' }],
    },
    {
      code: `
        import { memo } from 'react';
        const InlineArray = memo(() => <Chart data={[1, 2, 3]} />);
      `,
      errors: [{ messageId: 'memoizeReferenceProp' }],
    },
    {
      code: `
        import { memo } from 'react';
        const PayloadComp = memo(() => {
          const payload = { value: 1 };
          return <Child payload={payload} />;
        });
      `,
      errors: [{ messageId: 'memoizeReferenceProp' }],
    },
    {
      code: `
        import { memo } from 'react';
        const ArrayProp = memo(() => {
          const items = [1, 2, 3];
          return <List items={items} />;
        });
      `,
      errors: [{ messageId: 'memoizeReferenceProp' }],
    },
    {
      code: `
        import { memo } from 'react';
        const FnProp = memo(({ save }) => {
          const handleSave = () => save();
          return <Button onClick={handleSave} />;
        });
      `,
      errors: [{ messageId: 'memoizeReferenceProp' }],
    },
    {
      code: `
        import { memo, useMemo } from 'react';
        const Label = memo(({ text }) => {
          const label = useMemo(() => text, [text]);
          return <span>{label}</span>;
        });
      `,
      errors: [{ messageId: 'avoidPrimitiveMemo' }],
    },
    {
      code: `
        import { memo, useMemo } from 'react';
        const StaticLabel = memo(() => {
          const label = useMemo(() => 'Hello', []);
          return <span>{label}</span>;
        });
      `,
      errors: [{ messageId: 'avoidPrimitiveMemo' }],
    },
    {
      code: `
        import { memo } from 'react';
        function Section({ title }) {
          const style = { color: 'red' };
          return <Header style={style} title={title} />;
        }
        const MemoSection = memo(Section);
      `,
      errors: [{ messageId: 'memoizeReferenceProp' }],
    },
    {
      code: `
        import React from 'react';
        const Todo = React.memo(({ onRemove }) => {
          const actions = { remove: onRemove };
          return <Child actions={actions} />;
        });
      `,
      errors: [{ messageId: 'memoizeReferenceProp' }],
    },
    {
      code: `
        import { memo } from 'react';
        const WithInlineHandler = memo(() => (
          <Widget onChange={(value) => value + 1} />
        ));
      `,
      errors: [{ messageId: 'memoizeReferenceProp' }],
    },
    {
      code: `
        import { memo } from 'react';
        const Plain = ({ onClick }: { onClick: () => void }) => (
          <button onClick={() => onClick()}>Click</button>
        );
        memo(Plain);
      `,
      errors: [{ messageId: 'memoizeReferenceProp' }],
    },
    {
      code: `
        import { memo, useMemo } from 'react';
        const FancyLabel = memo(({ first, last }) => {
          const display = useMemo(() => \`\${first} \${last}\`, [first, last]);
          return <span>{display}</span>;
        });
      `,
      errors: [{ messageId: 'avoidPrimitiveMemo' }],
    },
    {
      code: `
        import { memo, useMemo } from 'react';
        const MemberPassThrough = memo((props) => {
          const value = useMemo(() => props.value, [props.value]);
          return <span>{value}</span>;
        });
      `,
      errors: [{ messageId: 'avoidPrimitiveMemo' }],
    },
    {
      code: `
        import { memo } from 'react';
        const Alias = memo(({ onClick }) => {
          const handler = () => onClick();
          const forwarded = handler;
          return <Button onClick={forwarded} />;
        });
      `,
      errors: [{ messageId: 'memoizeReferenceProp' }],
    },
    {
      code: `
        import { memo, useMemo } from 'react';
        const ChainValue = memo(({ payload }) => {
          const value = useMemo(() => payload?.value, [payload]);
          return <div>{value}</div>;
        });
      `,
      errors: [{ messageId: 'avoidPrimitiveMemo' }],
    },
    {
      code: `
        import React, { memo } from 'react';
        const Icon = memo(({ href }) => (
          <svg xlink:href={{ url: href }} />
        ));
      `,
      errors: [{ messageId: 'memoizeReferenceProp' }],
    },
    {
      code: `
        import { memo } from 'react';
        const AssertedPayload = memo(() => {
          const payload = { id: '1' } as const;
          return <Item payload={payload} />;
        });
      `,
      errors: [{ messageId: 'memoizeReferenceProp' }],
    },
    {
      code: `
        import { memo } from 'react';
        const SatisfiesArray = memo(() => {
          const items = [1, 2, 3] satisfies number[];
          return <List items={items} />;
        });
      `,
      errors: [{ messageId: 'memoizeReferenceProp' }],
    },
    {
      code: `
        import { memo } from 'react';
        const DeclaredHandler = memo(({ save }) => {
          function handleSave() {
            save();
          }
          return <Button onClick={handleSave} />;
        });
      `,
      errors: [{ messageId: 'memoizeReferenceProp' }],
    },
    {
      code: `
        import { memo } from 'react';
        const NestedRenderer = memo(() => {
          function renderItem() {
            const payload = { id: '1' };
            return <Item payload={payload} />;
          }
          return renderItem();
        });
      `,
      errors: [{ messageId: 'memoizeReferenceProp' }],
    },
  ],
});
