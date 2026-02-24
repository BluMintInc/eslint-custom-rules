import { ruleTesterJsx } from '../utils/ruleTester';
import { preferMemoizedProps } from '../rules/prefer-memoized-props';

ruleTesterJsx.run('prefer-memoized-props', preferMemoizedProps, {
  valid: [
    // ─── Deep-compared props exempt from the rule ────────────────────────────

    // Bug regression: sx prop on Stack/FormControlLabel inside memo component
    {
      code: `
import { memo } from '../../../util/memo';
const MyComponent = () => {
  return (
    <Stack
      sx={{
        backgroundColor: 'red',
        borderRadius: '4px',
      }}
    >
      <FormControlLabel
        control={<div />}
        label="Test"
        sx={{ textWrap: 'nowrap' }}
      />
    </Stack>
  );
};
export const MemoizedComponent = memo(MyComponent);
      `,
    },

    // style prop is exempt
    {
      code: `
import { memo } from 'react';
const MyComponent = () => <div style={{ color: 'red' }} />;
export const Memoized = memo(MyComponent);
      `,
    },

    // containerSx (ends with Sx) is exempt
    {
      code: `
import { memo } from 'react';
const MyComponent = () => <Child containerSx={{ padding: 8 }} />;
export const Memoized = memo(MyComponent);
      `,
    },

    // wrapperStyle (ends with Style) is exempt
    {
      code: `
import { memo } from 'react';
const MyComponent = () => <Child wrapperStyle={{ marginTop: 4 }} />;
export const Memoized = memo(MyComponent);
      `,
    },

    // iconSx (ends with Sx) is exempt
    {
      code: `
import { memo } from 'src/util/memo';
const Item = () => <Icon iconSx={{ fontSize: 24 }} />;
export const MemoItem = memo(Item);
      `,
    },

    // textStyle (ends with Style) is exempt
    {
      code: `
import { memo } from 'src/util/memo';
const MyComp = () => <Text textStyle={{ fontWeight: 'bold' }} />;
export const MemoComp = memo(MyComp);
      `,
    },

    // ─── Non-memo components: inline props are fine ──────────────────────────

    // Regular (non-memo) component with inline object prop
    {
      code: `
const MyComponent = () => <Child data={{ id: 1 }} />;
      `,
    },

    // Regular component with inline array prop
    {
      code: `
const MyComponent = () => <Child items={[1, 2, 3]} />;
      `,
    },

    // Regular component with inline function prop
    {
      code: `
const MyComponent = () => <Child onClick={() => console.log('click')} />;
      `,
    },

    // ─── Memo component with already-memoized or stable props ───────────────

    // useMemo object prop in memo component
    {
      code: `
import { memo } from 'react';
import { useMemo } from 'react';
const MyComponent = () => {
  const data = useMemo(() => ({ id: 1 }), []);
  return <Child data={data} />;
};
export const Memoized = memo(MyComponent);
      `,
    },

    // useCallback function prop in memo component
    {
      code: `
import { memo } from 'react';
import { useCallback } from 'react';
const MyComponent = ({ id }) => {
  const handleClick = useCallback(() => console.log(id), [id]);
  return <Child onClick={handleClick} />;
};
export const Memoized = memo(MyComponent);
      `,
    },

    // Module-level constant as prop value (not inline)
    {
      code: `
import { memo } from 'react';
const DEFAULT_OPTIONS = { timeout: 5000 };
const MyComponent = () => <Child options={DEFAULT_OPTIONS} />;
export const Memoized = memo(MyComponent);
      `,
    },

    // Variable reference (not inline literal) as prop
    {
      code: `
import { memo } from 'react';
const MyComponent = ({ options }) => <Child options={options} />;
export const Memoized = memo(MyComponent);
      `,
    },

    // Primitive prop values are fine
    {
      code: `
import { memo } from 'react';
const MyComponent = ({ count }) => <Child count={count} label="hello" disabled={false} />;
export const Memoized = memo(MyComponent);
      `,
    },

    // JSX attribute with no value (boolean shorthand)
    {
      code: `
import { memo } from 'react';
const MyComponent = () => <Child disabled />;
export const Memoized = memo(MyComponent);
      `,
    },

    // String literal JSX attribute value is fine
    {
      code: `
import { memo } from 'react';
const MyComponent = () => <Child label="hello world" />;
export const Memoized = memo(MyComponent);
      `,
    },

    // ─── Nested inner functions: enclosing scope is not memo'd ───────────────

    // Inline prop is inside an inner render function, not directly in memo comp
    {
      code: `
import { memo } from 'react';
const MyComponent = ({ items }) => {
  const renderItem = (item) => (
    <div data={{ id: item.id }} key={item.id} />
  );
  return <ul>{items.map(renderItem)}</ul>;
};
export const Memoized = memo(MyComponent);
      `,
    },

    // ─── No memo import: rule should not fire ───────────────────────────────

    // memo imported from somewhere else entirely
    {
      code: `
import { memo } from 'some-other-library';
const MyComponent = () => <Child data={{ id: 1 }} />;
export const Memoized = memo(MyComponent);
      `,
    },

    // Component not actually wrapped in memo
    {
      code: `
import { memo } from 'react';
const MyComponent = () => <Child data={{ id: 1 }} />;
export { MyComponent };
      `,
    },

    // ─── React.memo namespace variant ───────────────────────────────────────

    // React.memo with sx prop (exempt)
    {
      code: `
import React from 'react';
const MyComponent = () => <div sx={{ color: 'red' }} />;
export const Memoized = React.memo(MyComponent);
      `,
    },

    // Multiple exempt props in React.memo component
    {
      code: `
import React from 'react';
const MyComponent = () => (
  <Stack
    sx={{ padding: 2 }}
    style={{ overflow: 'hidden' }}
    containerSx={{ margin: 0 }}
    wrapperStyle={{ gap: 4 }}
  />
);
export const Memoized = React.memo(MyComponent);
      `,
    },
  ],

  invalid: [
    // ─── Core invalid: non-exempt inline props in memo components ────────────

    // Exact code from the issue but with non-exempt prop - inline object
    {
      code: `
import { memo } from '../../../util/memo';
const MyComponent = () => {
  return (
    <Child data={{ id: 1, name: 'test' }} />
  );
};
export const MemoizedComponent = memo(MyComponent);
      `,
      errors: [{ messageId: 'preferMemoizedProps' }],
    },

    // Inline array prop in memo component
    {
      code: `
import { memo } from 'react';
const MyComponent = () => <Child items={[1, 2, 3]} />;
export const Memoized = memo(MyComponent);
      `,
      errors: [{ messageId: 'preferMemoizedProps' }],
    },

    // Inline arrow function prop in memo component
    {
      code: `
import { memo } from 'react';
const MyComponent = () => <Child onClick={() => console.log('click')} />;
export const Memoized = memo(MyComponent);
      `,
      errors: [{ messageId: 'preferMemoizedProps' }],
    },

    // Inline function expression prop in memo component
    {
      code: `
import { memo } from 'react';
const MyComponent = () => (
  <Child
    onClick={function handleClick() { return true; }}
  />
);
export const Memoized = memo(MyComponent);
      `,
      errors: [{ messageId: 'preferMemoizedProps' }],
    },

    // Multiple non-exempt inline props in same memo component
    {
      code: `
import { memo } from 'react';
const MyComponent = () => (
  <Child
    data={{ id: 1 }}
    items={[1, 2]}
  />
);
export const Memoized = memo(MyComponent);
      `,
      errors: [
        { messageId: 'preferMemoizedProps' },
        { messageId: 'preferMemoizedProps' },
      ],
    },

    // Mixed exempt and non-exempt props: only non-exempt is flagged
    {
      code: `
import { memo } from 'react';
const MyComponent = () => (
  <Child
    sx={{ color: 'red' }}
    data={{ id: 1 }}
    style={{ margin: 0 }}
  />
);
export const Memoized = memo(MyComponent);
      `,
      errors: [{ messageId: 'preferMemoizedProps' }],
    },

    // memo from util/memo with non-exempt prop
    {
      code: `
import { memo } from 'src/util/memo';
const MyComponent = () => <Child options={{ timeout: 5000 }} />;
export const Memoized = memo(MyComponent);
      `,
      errors: [{ messageId: 'preferMemoizedProps' }],
    },

    // React.memo namespace with non-exempt prop
    {
      code: `
import React from 'react';
const MyComponent = () => <Child config={{ debug: true }} />;
export const Memoized = React.memo(MyComponent);
      `,
      errors: [{ messageId: 'preferMemoizedProps' }],
    },

    // Inline memo (component defined directly inside memo() call)
    {
      code: `
import { memo } from 'react';
export const MyComponent = memo(() => (
  <Child data={{ key: 'value' }} />
));
      `,
      errors: [{ messageId: 'preferMemoizedProps' }],
    },

    // Function declaration wrapped in memo
    {
      code: `
import { memo } from 'react';
function MyComponent() {
  return <Child data={{ id: 1 }} />;
}
export const Memoized = memo(MyComponent);
      `,
      errors: [{ messageId: 'preferMemoizedProps' }],
    },

    // TypeScript assertion on inline object (should still be flagged)
    {
      code: `
import { memo } from 'react';
type Options = { timeout: number };
const MyComponent = () => <Child options={{ timeout: 5000 } as Options} />;
export const Memoized = memo(MyComponent);
      `,
      errors: [{ messageId: 'preferMemoizedProps' }],
    },

    // Inline function with TypeScript return type assertion
    {
      code: `
import { memo } from 'react';
const MyComponent = () => (
  <Child
    getLabel={(() => 'hello') as () => string}
  />
);
export const Memoized = memo(MyComponent);
      `,
      errors: [{ messageId: 'preferMemoizedProps' }],
    },

    // Multiple JSX elements in render with inline props
    {
      code: `
import { memo } from 'react';
const MyComponent = () => (
  <div>
    <Child config={{ debug: true }} />
    <Other handler={() => doSomething()} />
  </div>
);
export const Memoized = memo(MyComponent);
      `,
      errors: [
        { messageId: 'preferMemoizedProps' },
        { messageId: 'preferMemoizedProps' },
      ],
    },

    // memo from util/memo with deep path import
    {
      code: `
import { memo } from '../util/memo';
const MyComponent = () => <Child data={{ value: 42 }} />;
export const Memoized = memo(MyComponent);
      `,
      errors: [{ messageId: 'preferMemoizedProps' }],
    },

    // Inline array of objects prop
    {
      code: `
import { memo } from 'react';
const MyComponent = () => <List columns={[{ key: 'id', label: 'ID' }]} />;
export const Memoized = memo(MyComponent);
      `,
      errors: [{ messageId: 'preferMemoizedProps' }],
    },
  ],
});
