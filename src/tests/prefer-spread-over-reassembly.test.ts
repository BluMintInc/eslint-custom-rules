import path from 'path';
import { ruleTesterJsx } from '../utils/ruleTester';
import { preferSpreadOverReassembly } from '../rules/prefer-spread-over-reassembly';

// Issue #1644: proving an imported pick narrowing requires reading the sibling
// module off disk, so these cases need a filename that really sits next to the
// fixture modules under `fixtures/prefer-spread-over-reassembly/`.
const FIXTURE_DIR = path.join(
  __dirname,
  'fixtures/prefer-spread-over-reassembly',
);
const FIXTURE_FILE = path.join(FIXTURE_DIR, 'consumer.ts');
const FIXTURE_FILE_TSX = path.join(FIXTURE_DIR, 'consumer.tsx');
const FIXTURE_FILE_NESTED = path.join(FIXTURE_DIR, 'nested/consumer.ts');

ruleTesterJsx.run('prefer-spread-over-reassembly', preferSpreadOverReassembly, {
  valid: [
    // Already using spread — no violation.
    `
const GameCatalogWrapperStable = memo(
  (props) => <GameDropdownSearch {...props} />,
);
`,

    // Field used in conditional logic, not just forwarded.
    `
const Wrapper = ({ hits, isLoading, onNearEnd }) => {
  if (isLoading) {
    return <Spinner />;
  }
  return (
    <Child
      hits={hits}
      isLoading={isLoading}
      onNearEnd={onNearEnd}
    />
  );
};
`,

    // Field used in side effect (console.log), not just forwarded.
    `
const Wrapper = ({ hits, isLoading, header }) => {
  console.log('Rendering with header:', header);
  return (
    <Child
      header={header}
      hits={hits}
      isLoading={isLoading}
    />
  );
};
`,

    // Renamed destructuring — cannot use spread directly.
    `
const Wrapper = ({ items, loading }) => {
  return (
    <Child
      data={items}
      isLoading={loading}
    />
  );
};
`,

    // Rest spread already present in destructuring.
    `
const Wrapper = ({ hits, isLoading, ...rest }) => {
  return (
    <Child
      {...rest}
      hits={hits}
      isLoading={isLoading}
    />
  );
};
`,

    // Fields sent to multiple different targets.
    `
const Wrapper = ({ header, hits, isLoading, footer }) => {
  return (
    <>
      <Header content={header} />
      <List
        hits={hits}
        isLoading={isLoading}
      />
      <Footer content={footer} />
    </>
  );
};
`,

    // Only one field forwarded (below minFields=2).
    `
const Wrapper = ({ hits }) => {
  return <Child hits={hits} />;
};
`,

    // Nested destructuring — should not flag.
    `
const Wrapper = ({ data: { hits, isLoading }, onNearEnd }) => {
  return (
    <Child
      hits={hits}
      isLoading={isLoading}
      onNearEnd={onNearEnd}
    />
  );
};
`,

    // Transformed value — not an identical forward.
    `
const Wrapper = ({ hits, isLoading }) => {
  return (
    <Child
      hits={hits.slice(0, 10)}
      isLoading={isLoading}
    />
  );
};
`,

    // Negated value — not an identical forward.
    `
const Wrapper = ({ isEnabled, data }) => {
  return (
    <Child
      data={data}
      disabled={!isEnabled}
    />
  );
};
`,

    // Conditional spread uses a destructured field — unsafe.
    `
const Wrapper = ({ hits, isLoading, onNearEnd }) => {
  return (
    <Child
      hits={hits}
      {...(isLoading && { isLoading })}
      onNearEnd={onNearEnd}
    />
  );
};
`,

    // Default values in destructuring — do not flag.
    `
const Wrapper = ({ hits = [], isLoading = false, onNearEnd }) => {
  return (
    <Child
      hits={hits}
      isLoading={isLoading}
      onNearEnd={onNearEnd}
    />
  );
};
`,

    // Multiple return statements — body is not a single-return block.
    `
const Wrapper = ({ hits, isLoading, onNearEnd }) => {
  if (!hits) return null;
  return (
    <Child
      hits={hits}
      isLoading={isLoading}
      onNearEnd={onNearEnd}
    />
  );
};
`,

    // Only one of two fields is an identical forward; the other is transformed.
    `
const Wrapper = ({ hits, isLoading }) => {
  return (
    <Child
      hits={hits}
      loading={isLoading}
    />
  );
};
`,

    // A destructured parameter with a default value is an AssignmentPattern,
    // not an ObjectPattern, so the rule declines to report it (#1356). Spread
    // over a defaulted parameter would need the default preserved verbatim, so
    // the conservative choice is to leave the shape alone entirely.
    `
type FooProps = { a: string; b: string };
const Bar = ({ a, b }: FooProps = {} as FooProps) => {
  return <Foo a={a} b={b} />;
};
`,

    // Same defaulted shape without an annotation.
    `
const Bar = ({ a, b } = {}) => {
  return <Foo a={a} b={b} />;
};
`,

    // Regression (#1610): stripping the type-only wrapper must not turn every
    // wrapped literal into a report. A renamed forward is still a renamed
    // forward behind `as const` — the wrapper changes nothing either way.
    `
const wrap = ({ items, loading }) => {
  return { data: items, isLoading: loading } as const;
};
`,

    // Regression (#1610): a genuinely narrowing projection stays valid. `c` is
    // dropped, so spreading the parameter would smuggle it back into the result.
    `
const pick = ({ a, b, c }) => ({ a, b } as const);
`,

    // Regression (#1610): the same narrowing behind a block return.
    `
const pickBlock = ({ a, b, c }) => {
  return { a, b } satisfies Pair;
};
`,

    // Regression (#1610): a wrapper does not relax the single-statement rule —
    // a field consumed by a side effect is still consumed.
    `
const logged = ({ a, b }) => {
  console.log(a);
  return { a, b } as const;
};
`,

    // Regression (#1610): a wrapper around something that is neither a JSX
    // element nor an object literal remains unclassifiable.
    `
const computed = ({ a, b }) => compute(a, b) as const;
`,

    // Regression (#1610): a rest element still opts out, wrapper or not.
    `
const withRest = ({ a, b, ...rest }) => ({ a, b, ...rest } as const);
`,

    // Regression (#1610): a conditional spread consuming a destructured field
    // is still unsafe behind a wrapper.
    `
const conditional = ({ a, b }) => ({ ...(a && { a }), b } as const);
`,

    // Regression (#1610): one field is below minFields even when wrapped.
    `
const single = ({ a }) => ({ a } as const);
`,

    // Regression (#1610): a lone expression statement is not a return, so there
    // is no target to unwrap however the literal is wrapped.
    `
const send = ({ a, b }) => {
  post({ a, b } as const);
};
`,

    // Regression (#1610): the wrapper's own type references count as uses of
    // the binding. Replacing the parameter with `props` would strand the
    // `typeof id` query, so the conservative decline is the correct answer.
    `
const keyed = ({ data, id }) => ({ data, id } as Record<typeof id, string>);
`,

    // Regression (#1642): the reported agora shape. `Unit` carries five
    // members and the callback picks four, so `{ ...props }` would put the
    // fifth on the produced object.
    {
      // A narrowing pick: the target has fewer fields than the source type.
      // Spreading here would widen the result and change behavior.
      code: `
        type Unit = { path: string; line: number; side: string; body: string; findings: unknown[] };
        function build(units: Unit[]) {
          return units.map(({ path, line, side, body }) => {
            return { path, line, side, body } as const;
          });
        }
      `,
      parserOptions: { ecmaVersion: 2020, sourceType: 'module' },
    },

    // Regression (#1642): an interface is as enumerable as an alias.
    `
interface Unit {
  a: string;
  b: string;
  c: string;
}
const build = (units: Unit[]) => units.map(({ a, b }) => ({ a, b }));
`,

    // Regression (#1642): \`Array<Unit>\` spells the same receiver type.
    `
type Unit = { a: string; b: string; c: string };
const build = (units: Array<Unit>) => units.map(({ a, b }) => ({ a, b }));
`,

    // Regression (#1642): so does \`ReadonlyArray<Unit>\`.
    `
type Unit = { a: string; b: string; c: string };
const build = (units: ReadonlyArray<Unit>) => units.map(({ a, b }) => ({ a, b }));
`,

    // Regression (#1642): and \`readonly Unit[]\`, which is a type operator over
    // the array type.
    `
type Unit = { a: string; b: string; c: string };
const build = (units: readonly Unit[]) => units.map(({ a, b }) => ({ a, b }));
`,

    // Regression (#1642): the parameter's own annotation names the source type
    // directly, so no call-site context is needed.
    `
type Wide = { a: string; b: string; c: string };
const pick = ({ a, b }: Wide) => ({ a, b });
`,

    // Regression (#1642): an inline object type is enumerable too.
    `
const pick = ({ a, b }: { a: string; b: string; c: string }) => ({ a, b });
`,

    // Regression (#1642): a JSX target widens exactly as an object literal
    // does — the extra members would reach the child as unwanted props.
    `
type Wide = { a: string; b: string; c: string };
const W = ({ a, b }: Wide) => <Child a={a} b={b} />;
`,

    // Regression (#1642): forEach hands the callback an element too.
    `
type Unit = { a: string; b: string; c: string };
const build = (units: Unit[]) => units.forEach(({ a, b }) => ({ a, b }));
`,

    // Regression (#1642): filter.
    `
type Unit = { a: string; b: string; c: string };
const build = (units: Unit[]) => units.filter(({ a, b }) => ({ a, b }));
`,

    // Regression (#1642): flatMap.
    `
type Unit = { a: string; b: string; c: string };
const build = (units: Unit[]) => units.flatMap(({ a, b }) => ({ a, b }));
`,

    // Regression (#1642): an annotated \`const\` receiver.
    `
type Unit = { a: string; b: string; c: string };
const units: Unit[] = load();
const build = () => units.map(({ a, b }) => ({ a, b }));
`,

    // Regression (#1642): an annotation binds every assignment, so it proves
    // the element type on a \`let\` as well as on a \`const\`.
    `
type Unit = { a: string; b: string; c: string };
let units: Unit[] = [];
const build = () => units.map(({ a, b }) => ({ a, b }));
`,

    // Regression (#1642): an unannotated \`const\` still resolves through its
    // initializer, here the declared return type of a local helper.
    `
type Unit = { a: string; b: string; c: string };
function loadUnits(): Unit[] {
  return [];
}
const units = loadUnits();
const build = () => units.map(({ a, b }) => ({ a, b }));
`,

    // Regression (#1642): the receiver is the call result itself.
    `
type Unit = { a: string; b: string; c: string };
const loadUnits = (): Unit[] => [];
const build = () => loadUnits().map(({ a, b }) => ({ a, b }));
`,

    // Regression (#1642): an assertion on the receiver states the element type
    // outright.
    `
type Unit = { a: string; b: string; c: string };
const build = (raw) => (raw as Unit[]).map(({ a, b }) => ({ a, b }));
`,

    // Regression (#1642): \`await\` unwraps the declared Promise.
    `
type Unit = { a: string; b: string; c: string };
async function loadUnits(): Promise<Unit[]> {
  return [];
}
const build = async () => (await loadUnits()).map(({ a, b }) => ({ a, b }));
`,

    // Regression (#1642): optional members count as members — spreading would
    // carry \`c\` through whenever the source happens to have it.
    `
type Wide = { a: string; b?: number; c?: string };
const pick = ({ a, b }: Wide) => ({ a, b });
`,

    // Regression (#1642): a method signature is a named member like any other.
    `
interface Wide {
  a: string;
  b: string;
  run(): void;
}
const pick = ({ a, b }: Wide) => ({ a, b });
`,

    // Regression (#1642): an exported alias is declared in this file too.
    `
export type Wide = { a: string; b: string; c: string };
const pick = ({ a, b }: Wide) => ({ a, b });
`,

    // Regression (#1642): a quoted key is still a written-down member name.
    `
type Wide = { a: string; b: string; 'c-d': string };
const pick = ({ a, b }: Wide) => ({ a, b });
`,

    // Regression (#1642): the source type is reached through an alias chain.
    `
type Wide = { a: string; b: string; c: string };
type Alias = Wide;
const pick = ({ a, b }: Alias) => ({ a, b });
`,

    // Regression (#1642): a retained extra property does not make the rewrite
    // safe — the spread still adds \`c\` alongside \`label\`.
    `
type Wide = { a: string; b: string; c: string };
const pick = ({ a, b }: Wide) => ({ a, b, label: 'x' });
`,

    // Regression (#1643): the reported agora declaration verbatim. A
    // \`Readonly<{...}>\` record is the idiomatic spelling there, and reading
    // through it is what makes the #1642 proof reach the reported site.
    `
type ReviewCommentUnit = Readonly<{
  path: string;
  line: number;
  side: 'RIGHT';
  body: string;
  findings: readonly unknown[];
}>;
function build(units: readonly ReviewCommentUnit[]) {
  return units.map(({ path, line, side, body }) => {
    return { path, line, side, body } as const;
  });
}
`,

    // Regression (#1643): \`Partial\` rewrites optionality, never the key set.
    `
type Wide = Partial<{ a: string; b: string; c: string }>;
const pick = ({ a, b }: Wide) => ({ a, b });
`,

    // Regression (#1643): \`Required\` likewise.
    `
type Wide = Required<{ a?: string; b?: string; c?: string }>;
const pick = ({ a, b }: Wide) => ({ a, b });
`,

    // Regression (#1643): the operator's argument may be an alias, whose own
    // member list is resolved exactly as an unwrapped one is.
    `
type Inner = { a: string; b: string; c: string };
type Wide = Readonly<Inner>;
const pick = ({ a, b }: Wide) => ({ a, b });
`,

    // Regression (#1643): the argument may be an interface.
    `
interface Inner {
  a: string;
  b: string;
  c: string;
}
type Wide = Readonly<Inner>;
const pick = ({ a, b }: Wide) => ({ a, b });
`,

    // Regression (#1643): key-preserving operators nest, and each one leaves
    // the key set of what it wraps alone.
    `
type Wide = Readonly<Partial<{ a: string; b: string; c: string }>>;
const pick = ({ a, b }: Wide) => ({ a, b });
`,

    // Regression (#1643): nesting through an alias as well.
    `
type Inner = { a: string; b: string; c: string };
type Wide = Readonly<Readonly<Inner>>;
const pick = ({ a, b }: Wide) => ({ a, b });
`,

    // Regression (#1643): the parameter's own annotation may spell the
    // operator directly.
    `
type Inner = { a: string; b: string; c: string };
const pick = ({ a, b }: Readonly<Inner>) => ({ a, b });
`,

    // Regression (#1643): an inline object type behind the operator.
    `
const pick = ({ a, b }: Readonly<{ a: string; b: string; c: string }>) => ({
  a,
  b,
});
`,

    // Regression (#1643): \`readonly Readonly<Unit>[]\` — a type operator over
    // an array of wrapped elements, which is how agora annotates a batch.
    `
type Unit = { a: string; b: string; c: string };
const build = (units: readonly Readonly<Unit>[]) =>
  units.map(({ a, b }) => ({ a, b }));
`,

    // Regression (#1643): \`ReadonlyArray<Readonly<Unit>>\` spells the same.
    `
type Unit = { a: string; b: string; c: string };
const build = (units: ReadonlyArray<Readonly<Unit>>) =>
  units.map(({ a, b }) => ({ a, b }));
`,

    // Regression (#1643): the JSX target narrows through the operator too.
    `
type Wide = Readonly<{ a: string; b: string; c: string }>;
const Narrowed = ({ a, b }: Wide) => <Child a={a} b={b} />;
`,

    // Regression (#1644): the reported agora site verbatim. `LinkedPullRequest`
    // lives in the sibling `types.ts` and carries four members; the callback
    // picks three and keeps a literal `state`, so the collapse would inject
    // `closesIssue` into a GraphQL fixture. The partial shape — a retained
    // non-shorthand property alongside the forwarded ones — is exactly what the
    // proof has to run on.
    {
      filename: FIXTURE_FILE,
      code: `
import { ExecFn, LinkedPullRequest, QueueIssue } from './types';
function linkageSelections(linkedPrs: readonly LinkedPullRequest[]) {
  const asNode = ({ number, headRefName, updatedAt }: LinkedPullRequest) => {
    return { number, state: 'OPEN', headRefName, updatedAt } as const;
  };
  return asNode;
}
`,
    },

    // Regression (#1644): a type-only import of a wider sibling type.
    {
      filename: FIXTURE_FILE,
      code: `
import type { Wide } from './types';
const pick = ({ a, b }: Wide) => ({ a, b });
`,
    },

    // Regression (#1644): the value-import spelling reaches the same
    // declaration, so it proves the same thing.
    {
      filename: FIXTURE_FILE,
      code: `
import { Wide } from './types';
const pick = ({ a, b }: Wide) => ({ a, b });
`,
    },

    // Regression (#1644): an import alias renames the local binding, never the
    // export the sibling declares.
    {
      filename: FIXTURE_FILE,
      code: `
import type { Wide as Renamed } from './types';
const pick = ({ a, b }: Renamed) => ({ a, b });
`,
    },

    // Regression (#1644): the sibling spells its record \`Readonly<{...}>\`, and
    // #1643's unwrapping applies inside the sibling's own scope.
    {
      filename: FIXTURE_FILE,
      code: `
import type { WideReadonly } from './types';
const pick = ({ a, b }: WideReadonly) => ({ a, b });
`,
    },

    // Regression (#1644): an interface is as enumerable across the hop as it is
    // in the file under lint.
    {
      filename: FIXTURE_FILE,
      code: `
import type { WideInterface } from './types';
const pick = ({ a, b }: WideInterface) => ({ a, b });
`,
    },

    // Regression (#1644): an alias chain confined to the sibling stays within
    // the single hop, so it resolves.
    {
      filename: FIXTURE_FILE,
      code: `
import type { WideViaLocalAlias } from './types';
const pick = ({ a, b }: WideViaLocalAlias) => ({ a, b });
`,
    },

    // Regression (#1644): a \`../\` specifier resolves against the file's own
    // directory, not the process cwd.
    {
      filename: FIXTURE_FILE_NESTED,
      code: `
import type { Wide } from '../types';
const pick = ({ a, b }: Wide) => ({ a, b });
`,
    },

    // Regression (#1644): a directory specifier resolves to its index module.
    {
      filename: FIXTURE_FILE,
      code: `
import type { NestedWide } from './nested';
const pick = ({ a, b }: NestedWide) => ({ a, b });
`,
    },

    // Regression (#1644): the extension search reaches a \`.tsx\` sibling.
    {
      filename: FIXTURE_FILE,
      code: `
import type { WidgetProps } from './widget';
const pick = ({ a, b }: WidgetProps) => ({ a, b });
`,
    },

    // Regression (#1644): the contextual route reads the element type through
    // the same enumerator, so an imported element type resolves too.
    {
      filename: FIXTURE_FILE,
      code: `
import type { Wide } from './types';
const build = (units: Wide[]) => units.map(({ a, b }) => ({ a, b }));
`,
    },

    // Regression (#1644): a JSX target widens exactly as an object literal
    // does, imported source type included.
    {
      filename: FIXTURE_FILE_TSX,
      code: `
import type { Wide } from './types';
const Narrowed = ({ a, b }: Wide) => <Child a={a} b={b} />;
`,
    },

    // Regression (#1644): a key-preserving operator at the use site wraps an
    // imported argument, whose member list the hop supplies.
    {
      filename: FIXTURE_FILE,
      code: `
import type { Wide } from './types';
const pick = ({ a, b }: Readonly<Wide>) => ({ a, b });
`,
    },

    // Regression (#1769): a type declared in a function body binds its name
    // exactly as a top-level one does, so the narrowing proof must reach it.
    // Resolving only \`Program.body\` killed the carve-out here and autofixed the
    // pick into a spread that re-adds \`c\` — the #1642 widening itself.
    `
function outer() {
  type Wide = { a: string; b: string; c: string };
  const pick = ({ a, b }: Wide) => ({ a, b });
  return pick;
}
`,

    // Regression (#1769): the arrow-bodied spelling of the same shape.
    `
const build = () => {
  type Wide = { a: string; b: string; c: string };
  const pick = ({ a, b }: Wide) => ({ a, b });
  return pick;
};
`,

    // Regression (#1769): a bare block binds a type declaration too.
    `
{
  type Wide = { a: string; b: string; c: string };
  const pick = ({ a, b }: Wide) => ({ a, b });
  void pick;
}
`,

    // Regression (#1769): a \`namespace\` body is a statement container of its
    // own, a route the \`Program.body\` scan never reached.
    `
namespace Shapes {
  type Wide = { a: string; b: string; c: string };
  export const pick = ({ a, b }: Wide) => ({ a, b });
}
`,

    // Regression (#1769): a type exported from inside a namespace is the same
    // declaration one node deeper, so the \`export\` unwrap applies at every
    // depth rather than only at the top level.
    `
namespace Shapes {
  export type Wide = { a: string; b: string; c: string };
  export const pick = ({ a, b }: Wide) => ({ a, b });
}
`,

    // Regression (#1769): a \`switch\` case holds statements without a block.
    `
function outer(kind: string) {
  switch (kind) {
    case 'wide': {
      type Wide = { a: string; b: string; c: string };
      return ({ a, b }: Wide) => ({ a, b });
    }
  }
  return null;
}
`,

    // Regression (#1769): a class static block is a statement container as well.
    `
class Registry {
  static {
    type Wide = { a: string; b: string; c: string };
    const pick = ({ a, b }: Wide) => ({ a, b });
    void pick;
  }
}
`,

    // Regression (#1769): an interface nested in a function body enumerates the
    // same way an alias does.
    `
function outer() {
  interface Wide {
    a: string;
    b: string;
    c: string;
  }
  const pick = ({ a, b }: Wide) => ({ a, b });
  return pick;
}
`,

    // Regression (#1769): the contextual route reads the receiver's element
    // type through the same resolver, so a nested declaration reaches it too.
    `
function outer() {
  type Unit = { a: string; b: string; c: string };
  const units: Unit[] = [];
  return units.map(({ a, b }) => ({ a, b }));
}
`,

    // Regression (#1769): \`Array<Unit>\` spells the same nested receiver type.
    `
function outer() {
  type Unit = { a: string; b: string; c: string };
  const units: Array<Unit> = [];
  return units.map(({ a, b }) => ({ a, b }));
}
`,

    // Regression (#1769): so does \`readonly Unit[]\`.
    `
function outer() {
  type Unit = { a: string; b: string; c: string };
  const units: readonly Unit[] = [];
  return units.map(({ a, b }) => ({ a, b }));
}
`,

    // Regression (#1769): a JSX target widens the same way, so the nested
    // declaration must silence it identically.
    `
function outer() {
  type Wide = { a: string; b: string; c: string };
  const Narrowed = ({ a, b }: Wide) => <Child a={a} b={b} />;
  return Narrowed;
}
`,

    // Regression (#1769): an alias chain confined to the nested scope resolves
    // link by link, each from the scope that writes it.
    `
function outer() {
  type Base = { a: string; b: string; c: string };
  type Wide = Base;
  const pick = ({ a, b }: Wide) => ({ a, b });
  return pick;
}
`,

    // Regression (#1769): a nested alias whose target is declared at the top
    // level resolves outward through the scope chain.
    `
type Base = { a: string; b: string; c: string };
function outer() {
  type Wide = Base;
  const pick = ({ a, b }: Wide) => ({ a, b });
  return pick;
}
`,

    // Regression (#1769): type declarations hoist, so an alias written below
    // its own reference still resolves.
    `
function outer() {
  const pick = ({ a, b }: Wide) => ({ a, b });
  type Wide = { a: string; b: string; c: string };
  return pick;
}
`,

    // Regression (#1769): key-preserving unwrapping applies to a nested
    // declaration exactly as it does to a top-level one.
    `
function outer() {
  type Wide = { a: string; b: string; c: string };
  const pick = ({ a, b }: Readonly<Wide>) => ({ a, b });
  return pick;
}
`,

    // Regression (#1769): the innermost declaration wins, so an inner WIDE type
    // shadows an outer exhaustive one and the pick stays a narrowing.
    `
type Wide = { a: string; b: string };
function outer() {
  type Wide = { a: string; b: string; c: string };
  const pick = ({ a, b }: Wide) => ({ a, b });
  return pick;
}
`,

    // Regression (#1769): a declaration two containers out is still in scope.
    `
function outer() {
  type Wide = { a: string; b: string; c: string };
  return () => {
    const pick = ({ a, b }: Wide) => ({ a, b });
    return pick;
  };
}
`,

    // ---------------------------------------------------------------------
    // Regression (#1908): the FunctionDeclaration spelling. Every carve-out
    // below is the declaration twin of an arrow fixture above it, pinned so the
    // widened visitor cannot buy its reports at the cost of a false positive.
    // ---------------------------------------------------------------------

    // A declaration with no parameter has nothing to reassemble.
    `
function Wrapper() {
  return <Child hits={hits} isLoading={isLoading} />;
}
`,

    // A field consumed by conditional logic is not merely forwarded.
    `
function Wrapper({ hits, isLoading, onNearEnd }) {
  if (isLoading) {
    return <Spinner />;
  }
  return <Child hits={hits} isLoading={isLoading} onNearEnd={onNearEnd} />;
}
`,

    // Renamed forwards cannot become a spread.
    `
function Wrapper({ items, loading }) {
  return <Child data={items} isLoading={loading} />;
}
`,

    // A rest element is an explicit decision to separate props.
    `
function Wrapper({ hits, isLoading, ...rest }) {
  return <Child {...rest} hits={hits} isLoading={isLoading} />;
}
`,

    // Defaults would be bypassed by a spread.
    `
function Wrapper({ hits = [], isLoading = false, onNearEnd }) {
  return <Child hits={hits} isLoading={isLoading} onNearEnd={onNearEnd} />;
}
`,

    // Nested destructuring binds names the parameter does not carry.
    `
function Wrapper({ data: { hits, isLoading }, onNearEnd }) {
  return <Child hits={hits} isLoading={isLoading} onNearEnd={onNearEnd} />;
}
`,

    // One forwarded field sits below minFields.
    `
function Wrapper({ hits }) {
  return <Child hits={hits} />;
}
`,

    // Fields split across several targets have no single spread destination.
    `
function Wrapper({ header, hits, isLoading, footer }) {
  return (
    <>
      <Header content={header} />
      <List hits={hits} isLoading={isLoading} />
      <Footer content={footer} />
    </>
  );
}
`,

    // A second parameter means the destructuring is not the whole signature.
    `
function Wrapper({ a, b }, extra) {
  return <X a={a} b={b} />;
}
`,

    // A defaulted parameter is an AssignmentPattern, not an ObjectPattern
    // (#1356), in the declaration spelling as much as in the arrow one.
    `
function Bar({ a, b } = {}) {
  return <Foo a={a} b={b} />;
}
`,

    // Regression (#1610): a narrowing projection behind a type-only wrapper
    // drops \`c\`, so the spread would smuggle it back in.
    `
function pickBlock({ a, b, c }) {
  return { a, b } as const;
}
`,

    // Regression (#1610): a wrapper around something that is neither JSX nor an
    // object literal remains unclassifiable.
    `
function computed({ a, b }) {
  return compute(a, b) as const;
}
`,

    // Regression (#1610): a side-effect statement means the body is not a lone
    // return, wrapper or not.
    `
function logged({ a, b }) {
  console.log(a);
  return { a, b } as const;
}
`,

    // Regression (#1610): a conditional spread consuming a destructured field
    // is unsafe here too.
    `
function conditional({ a, b }) {
  return { ...(a && { a }), b } as const;
}
`,

    // Regression (#1642): the narrowing-pick proof reads the parameter's own
    // annotation, which a declaration carries identically.
    `
type Wide = { a: string; b: string; c: string };
function pick({ a, b }: Wide) {
  return { a, b };
}
`,

    // Regression (#1643): so does the key-preserving unwrap.
    `
type Wide = Readonly<{ a: string; b: string; c: string }>;
function pick({ a, b }: Wide) {
  return { a, b };
}
`,

    // Regression (#1644): and the single hop into a relative sibling module.
    {
      filename: FIXTURE_FILE,
      code: `
import type { Wide } from './types';
function pick({ a, b }: Wide) {
  return { a, b };
}
`,
    },

    // Regression (#1769): and lexical resolution of a type declared in an
    // enclosing function body.
    `
function outer() {
  type Wide = { a: string; b: string; c: string };
  function pick({ a, b }: Wide) {
    return { a, b };
  }
  return pick;
}
`,

    // An overload signature parses as TSDeclareFunction and carries no body, so
    // the widened visitor never receives one.
    `
function pick({ a, b }: Wide): Pair;
function pick(input) {
  return input;
}
`,

    // \`declare function\` is the other body-less spelling.
    `
declare function pick({ a, b }: Wide): Pair;
`,

    // An empty body holds no return to classify.
    `
function Wrapper({ a, b }) {}
`,

    // A bare \`return\` produces no target.
    `
function Wrapper({ a, b }) {
  return;
}
`,

    // A transformed forward is not an identical one, exported or not.
    `
export function Wrapper({ hits, isLoading }) {
  return <Child hits={hits.slice(0, 10)} isLoading={isLoading} />;
}
`,

    // A field read in the element's children is used outside the forwarding.
    `
function Wrapper({ hits, isLoading }) {
  return (
    <Child hits={hits} isLoading={isLoading}>
      {isLoading}
    </Child>
  );
}
`,

    // The remedy itself: a declaration already spreading its parameter.
    `
function Wrapper(props) {
  return <Child {...props} />;
}
`,

    // Over-decline control for #2259: a shadow is namespace-specific. `Wide` is
    // bound here as a VALUE — an enclosing parameter — which leaves the outer
    // `type Wide` in scope for every type position inside, so `{ a, b }` still
    // reads against three known members and stays a deliberate narrowing pick.
    // Treating any same-named binder as a shadow would make the members opaque
    // and report this, trading the missed report for a false positive. The
    // return carries `as const` (read through by unwrapTransparent) so this
    // blessed text stays out of the enforce-object-literal-as-const
    // disagreement the contradiction guard baselines at 5.
    `
type Wide = { a: string; b: string; c: string };

function wrap(Wide: string) {
  return function pick({ a, b }: Wide) {
    return { a, b } as const;
  };
}
`,

    // Regression (#2298): the parameter is contextually typed by the DECLARED
    // type of the binding the object literal is written into, not by an
    // annotation of its own. `SampleInput` carries three members and the pick
    // takes two, so spreading would forward `otherEvents` and change what the
    // function returns.
    `
type SampleInput = Readonly<{
  title: string;
  position: number;
  otherEvents: readonly string[] | undefined;
}>;
type QueuePositionProps = Readonly<{ title: string; position: number }>;
type CaseEntry = Readonly<{
  sample: (input: SampleInput) => QueuePositionProps;
}>;
const CASE_ENTRY: CaseEntry = {
  sample: ({ title, position }) => ({ title, position }),
};
`,

    // Regression (#2298): the same contextual route through an array of typed
    // entries, which is how a catalog spells it.
    `
type SampleInput = Readonly<{
  title: string;
  position: number;
  otherEvents: readonly string[] | undefined;
}>;
type CaseEntry = Readonly<{
  sample: (input: SampleInput) => Readonly<{ title: string; position: number }>;
}>;
const CASES: readonly CaseEntry[] = [
  { sample: ({ title, position }) => ({ title, position }) },
];
`,

    // Regression (#2298): the entry type is reached through an alias chain and
    // an `as const` assertion, both of which sit between the literal and the
    // annotation that states its shape.
    `
type SampleInput = Readonly<{ title: string; position: number; extra: string }>;
type CaseEntry = { sample: (input: SampleInput) => unknown };
type CaseList = readonly CaseEntry[];
const CASES: CaseList = [
  { sample: ({ title, position }) => ({ title, position }) },
] as const;
`,
  ],

  invalid: [
    // Regression (#1356): the parameter's type annotation must survive the fix.
    {
      code: `
type FooProps = { a: string; b: string };
const Foo = (p: FooProps) => null;
const Bar = ({ a, b }: FooProps) => {
  return <Foo a={a} b={b} />;
};
`,
      errors: [{ messageId: 'preferSpread' }],
      output: `
type FooProps = { a: string; b: string };
const Foo = (p: FooProps) => null;
const Bar = (props: FooProps) => {
  return <Foo {...props} />;
};
`,
    },

    // Issue example 1: SelectGame — all fields forwarded identically.
    {
      code: `
const GameCatalogWrapperStable = memo(
  ({ hits, isLoading, onNearEnd, onGameSelect }) => {
    return (
      <GameDropdownSearch
        hits={hits}
        isLoading={isLoading}
        onGameSelect={onGameSelect}
        onNearEnd={onNearEnd}
      />
    );
  },
  compareDeeply('hits'),
);
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
const GameCatalogWrapperStable = memo(
  (props) => {
    return (
      <GameDropdownSearch {...props} />
    );
  },
  compareDeeply('hits'),
);
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Issue example 2: ChannelManager — all destructured fields forwarded,
    // plus one extra non-destructured prop (ContentCard) kept explicit. The
    // retained attribute keeps its own line (#1443) so anything attached to it
    // — comments, directives — survives the collapse.
    {
      code: `
const ChannelManagerCatalogWrapperStable = memo(
  ({ hits, isLoading, onNearEnd, header }) => {
    return (
      <UserVerticalCarousel
        ContentCard={UserCardAddWithMaxMembers}
        header={header}
        hits={hits}
        isLoading={isLoading}
        onNearEnd={onNearEnd}
      />
    );
  },
  compareDeeply('hits'),
);
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
const ChannelManagerCatalogWrapperStable = memo(
  (props) => {
    return (
      <UserVerticalCarousel
        {...props}
        ContentCard={UserCardAddWithMaxMembers}
      />
    );
  },
  compareDeeply('hits'),
);
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Issue example 3: FriendsView — destructured fields interspersed with extra non-destructured props.
    {
      code: `
const FriendsViewCatalogWrapperStable = memo(
  ({ hits, isLoading, onNearEnd, containerSx, header }) => {
    return (
      <FriendVerticalCarousel
        containerSx={containerSx}
        header={header}
        hits={hits}
        isLoading={isLoading}
        noFriends={<NoContent isSelf variant="friends" />}
        RenderFriendHit={FriendCard}
        onNearEnd={onNearEnd}
      />
    );
  },
  compareDeeply('hits', 'containerSx'),
);
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
const FriendsViewCatalogWrapperStable = memo(
  (props) => {
    return (
      <FriendVerticalCarousel
        {...props}
        noFriends={<NoContent isSelf variant="friends" />}
        RenderFriendHit={FriendCard}
      />
    );
  },
  compareDeeply('hits', 'containerSx'),
);
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Object literal reassembly via function parameter destructuring.
    {
      code: `
const transform = ({ a, b, c }) => {
  return { a, b, c };
};
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
const transform = (props) => {
  return { ...props };
};
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Simple concise arrow — self-closing JSX.
    {
      code: `
const Wrapper = ({ hits, isLoading }) => <Child hits={hits} isLoading={isLoading} />;
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
const Wrapper = (props) => <Child {...props} />;
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Extra non-destructured prop after spread (self-closing JSX).
    {
      code: `
const Wrapper = ({ hits, isLoading }) => <Child hits={hits} isLoading={isLoading} extra="x" />;
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
const Wrapper = (props) => <Child {...props} extra="x" />;
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Three fields all forwarded.
    {
      code: `
const Wrapper = ({ a, b, c }) => {
  return <X a={a} b={b} c={c} />;
};
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
const Wrapper = (props) => {
  return <X {...props} />;
};
`,
            },
          ],
        },
      ],
      output: null,
    },

    // FunctionExpression (not arrow) as argument.
    {
      code: `
const Wrapper = memo(function({ hits, isLoading, onNearEnd }) {
  return <Child hits={hits} isLoading={isLoading} onNearEnd={onNearEnd} />;
});
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
const Wrapper = memo(function(props) {
  return <Child {...props} />;
});
`,
            },
          ],
        },
      ],
      output: null,
    },

    // minFields option respected — 3 fields, minFields=3 should flag.
    {
      code: `
const Wrapper = ({ a, b, c }) => <X a={a} b={b} c={c} />;
`,
      options: [{ minFields: 3 }],
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
const Wrapper = (props) => <X {...props} />;
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Object literal with extra prop.
    {
      code: `
const wrap = ({ x, y }) => ({ x, y, label: 'Origin' });
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
const wrap = (props) => ({ ...props, label: 'Origin' });
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Return object literal — non-concise (block body).
    {
      code: `
const makePoint = ({ x, y, z }) => {
  return { x, y, z };
};
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
const makePoint = (props) => {
  return { ...props };
};
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Annotated concise arrow (#1356) — annotation survives on a one-liner.
    {
      code: `
const Wrapper = ({ hits, isLoading }: ChildProps) => <Child hits={hits} isLoading={isLoading} />;
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
const Wrapper = (props: ChildProps) => <Child {...props} />;
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Generic annotation (#1356) — `Readonly<...>` survives verbatim.
    {
      code: `
const Wrapper = ({ hits, isLoading }: Readonly<{ hits: Hit[]; isLoading: boolean }>) => {
  return <Child hits={hits} isLoading={isLoading} />;
};
`,
      errors: [{ messageId: 'preferSpread' }],
      output: `
const Wrapper = (props: Readonly<{ hits: Hit[]; isLoading: boolean }>) => {
  return <Child {...props} />;
};
`,
    },

    // Union annotation (#1356) — every member survives verbatim.
    {
      code: `
const Wrapper = ({ hits, isLoading }: LoadedProps | EmptyProps) => {
  return <Child hits={hits} isLoading={isLoading} />;
};
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
const Wrapper = (props: LoadedProps | EmptyProps) => {
  return <Child {...props} />;
};
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Imported type alias (#1356) — a qualified name survives verbatim.
    {
      code: `
import type { ChildProps } from './Child';
const Wrapper = ({ hits, isLoading }: ChildProps) => {
  return <Child hits={hits} isLoading={isLoading} />;
};
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
import type { ChildProps } from './Child';
const Wrapper = (props: ChildProps) => {
  return <Child {...props} />;
};
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Multi-line annotation (#1356) — inline object type keeps its formatting.
    {
      code: `
const Wrapper = ({ hits, isLoading }: {
  hits: Hit[];
  isLoading: boolean;
}) => {
  return <Child hits={hits} isLoading={isLoading} />;
};
`,
      errors: [{ messageId: 'preferSpread' }],
      output: `
const Wrapper = (props: {
  hits: Hit[];
  isLoading: boolean;
}) => {
  return <Child {...props} />;
};
`,
    },

    // Whitespace between the pattern and the annotation (#1356) — only the
    // pattern's own span is replaced, so the spacing is left untouched.
    {
      code: `
const Wrapper = ({ hits, isLoading } : ChildProps) => <Child hits={hits} isLoading={isLoading} />;
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
const Wrapper = (props : ChildProps) => <Child {...props} />;
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Object-literal branch with an annotation (#1356) — the non-JSX target.
    {
      code: `
const transform = ({ a, b, c }: TransformInput) => {
  return { a, b, c };
};
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
const transform = (props: TransformInput) => {
  return { ...props };
};
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Object-literal branch, concise arrow with a generic annotation (#1356).
    {
      code: `
const wrap = ({ x, y }: Readonly<Point>) => ({ x, y, label: 'Origin' });
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
const wrap = (props: Readonly<Point>) => ({ ...props, label: 'Origin' });
`,
            },
          ],
        },
      ],
      output: null,
    },

    // FunctionExpression inside memo with an annotation (#1356).
    {
      code: `
const Wrapper = memo(function({ hits, isLoading, onNearEnd }: ChildProps) {
  return <Child hits={hits} isLoading={isLoading} onNearEnd={onNearEnd} />;
});
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
const Wrapper = memo(function(props: ChildProps) {
  return <Child {...props} />;
});
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Annotated arrow inside memo with a comparator argument (#1356).
    {
      code: `
const GameCatalogWrapperStable = memo(
  ({ hits, isLoading, onNearEnd, onGameSelect }: GameDropdownSearchProps) => {
    return (
      <GameDropdownSearch
        hits={hits}
        isLoading={isLoading}
        onGameSelect={onGameSelect}
        onNearEnd={onNearEnd}
      />
    );
  },
  compareDeeply('hits'),
);
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
const GameCatalogWrapperStable = memo(
  (props: GameDropdownSearchProps) => {
    return (
      <GameDropdownSearch {...props} />
    );
  },
  compareDeeply('hits'),
);
`,
            },
          ],
        },
      ],
      output: null,
    },

    // A destructured field named `props` forces a fresh parameter name; the
    // annotation still survives (#1356).
    {
      code: `
const Wrapper = ({ props, isLoading }: ChildProps) => <Child props={props} isLoading={isLoading} />;
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
const Wrapper = (props0: ChildProps) => <Child {...props0} />;
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Regression (#1443): a directive comment attached to a RETAINED attribute
    // must survive the fix. Destroying it silently re-enables the rule it
    // suppresses (here `no-console` on the kept `ContentCard` attribute).
    {
      code: `
const Wrapper = memo(
  ({ hits, isLoading, onNearEnd, header }) => {
    return (
      <UserVerticalCarousel
        // eslint-disable-next-line no-console
        ContentCard={console.log('x')}
        header={header}
        hits={hits}
        isLoading={isLoading}
        onNearEnd={onNearEnd}
      />
    );
  },
  compareDeeply('hits'),
);
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
const Wrapper = memo(
  (props) => {
    return (
      <UserVerticalCarousel
        {...props}
        // eslint-disable-next-line no-console
        ContentCard={console.log('x')}
      />
    );
  },
  compareDeeply('hits'),
);
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Regression (#1443): a comment attached to a COLLAPSED attribute goes away
    // with the attribute it annotates, while the retained attribute's own
    // comment stays put.
    {
      code: `
const Wrapper = ({ hits, isLoading }) => {
  return (
    <Child
      // this one is forwarded verbatim
      hits={hits}
      isLoading={isLoading}
      // keep me: describes extra
      extra="x"
    />
  );
};
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
const Wrapper = (props) => {
  return (
    <Child
      {...props}
      // keep me: describes extra
      extra="x"
    />
  );
};
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Regression (#1443): a block comment above a retained attribute survives.
    {
      code: `
const Wrapper = ({ hits, isLoading }) => {
  return (
    <Child
      hits={hits}
      isLoading={isLoading}
      /* documents the render prop */
      renderRow={RowCard}
    />
  );
};
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
const Wrapper = (props) => {
  return (
    <Child
      {...props}
      /* documents the render prop */
      renderRow={RowCard}
    />
  );
};
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Regression (#1443): a trailing line comment on a retained attribute stays
    // on that attribute's line.
    {
      code: `
const Wrapper = ({ hits, isLoading }) => {
  return (
    <Child
      hits={hits}
      isLoading={isLoading}
      extra="x" // eslint-disable-line no-magic-numbers
    />
  );
};
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
const Wrapper = (props) => {
  return (
    <Child
      {...props}
      extra="x" // eslint-disable-line no-magic-numbers
    />
  );
};
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Regression (#1443): a multiline attribute value keeps its own formatting
    // because only the collapsed attributes' ranges are spliced out.
    {
      code: `
const Wrapper = ({ hits, isLoading }) => {
  return (
    <Child
      hits={hits}
      isLoading={isLoading}
      sx={{
        color: 'red',
        display: 'flex',
      }}
    />
  );
};
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
const Wrapper = (props) => {
  return (
    <Child
      {...props}
      sx={{
        color: 'red',
        display: 'flex',
      }}
    />
  );
};
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Regression (#1443): when EVERY attribute collapses the element still
    // shrinks to a single spread, and comments belonging to those collapsed
    // attributes go away with them.
    {
      code: `
const Wrapper = ({ hits, isLoading, onNearEnd }) => {
  return (
    <Child
      hits={hits}
      // forwarded verbatim
      isLoading={isLoading}
      onNearEnd={onNearEnd}
    />
  );
};
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
const Wrapper = (props) => {
  return (
    <Child {...props} />
  );
};
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Regression (#1443): a comment after the last collapsed attribute belongs
    // to no attribute, so it survives the collapse.
    {
      code: `
const Wrapper = ({ hits, isLoading }) => {
  return (
    <Child
      hits={hits}
      isLoading={isLoading}
      // TODO: pass a fallback too
    />
  );
};
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
const Wrapper = (props) => {
  return (
    <Child
      {...props}
      // TODO: pass a fallback too
    />
  );
};
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Regression (#1443): a retained spread attribute keeps its position after
    // the inserted props spread.
    {
      code: `
const Wrapper = ({ hits, isLoading }) => {
  return (
    <Child
      hits={hits}
      isLoading={isLoading}
      // the caller's overrides must stay last
      {...rest}
    />
  );
};
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
const Wrapper = (props) => {
  return (
    <Child
      {...props}
      // the caller's overrides must stay last
      {...rest}
    />
  );
};
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Regression (#1443): a non-self-closing element keeps its children and the
    // comment on its retained attribute.
    {
      code: `
const Wrapper = ({ hits, isLoading }) => {
  return (
    <Child
      hits={hits}
      isLoading={isLoading}
      // eslint-disable-next-line no-console
      onClick={() => console.log('x')}
    >
      <Inner />
    </Child>
  );
};
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
const Wrapper = (props) => {
  return (
    <Child
      {...props}
      // eslint-disable-next-line no-console
      onClick={() => console.log('x')}
    >
      <Inner />
    </Child>
  );
};
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Regression (#1443): the object-literal branch splices too, so a directive
    // on a retained property survives.
    {
      code: `
const transform = ({ a, b }) => {
  return {
    a,
    b,
    // eslint-disable-next-line no-console
    label: console.log('x'),
  };
};
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
const transform = (props) => {
  return {
    ...props,
    // eslint-disable-next-line no-console
    label: console.log('x'),
  };
};
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Regression (#1443): object-literal splice with the retained property
    // first and no trailing comma on the last collapsed property.
    {
      code: `
const transform = ({ a, b }) => {
  return {
    // eslint-disable-next-line no-console
    label: console.log('x'),
    a,
    b
  };
};
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
const transform = (props) => {
  return {
    ...props,
    // eslint-disable-next-line no-console
    label: console.log('x')
  };
};
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Regression (#1610): a type-only wrapper on the reassembled literal has no
    // runtime effect and removes no reassembly, so it must not silence the rule.
    // The fixer edits the literal in place and leaves the wrapper verbatim.
    {
      code: `const g = ({ a, b }) => ({ a, b } as const);`,
      output: null,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `const g = (props) => ({ ...props } as const);`,
            },
          ],
        },
      ],
    },
    {
      code: `const h = (items) => items.map(({ id, name }) => { return { id, name } as const; });`,
      output: null,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `const h = (items) => items.map((props) => { return { ...props } as const; });`,
            },
          ],
        },
      ],
    },
    {
      code: `const s = ({ a, b }) => { return { a, b } satisfies Pair; };`,
      output: null,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `const s = (props) => { return { ...props } satisfies Pair; };`,
            },
          ],
        },
      ],
    },

    // Regression (#1610): block return, one row per wrapper form.
    {
      code: `
const t = ({ a, b }) => {
  return { a, b } as const;
};
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
const t = (props) => {
  return { ...props } as const;
};
`,
            },
          ],
        },
      ],
      output: null,
    },
    {
      code: `
const t = ({ a, b }) => {
  return { a, b } as Pair;
};
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
const t = (props) => {
  return { ...props } as Pair;
};
`,
            },
          ],
        },
      ],
      output: null,
    },
    {
      code: `
const t = ({ a, b }) => {
  return ({ a, b })!;
};
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
const t = (props) => {
  return ({ ...props })!;
};
`,
            },
          ],
        },
      ],
      output: null,
    },
    // A chain unwinds fully: `as unknown as T` is two wrappers deep.
    {
      code: `
const t = ({ a, b }) => {
  return { a, b } as unknown as Pair;
};
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
const t = (props) => {
  return { ...props } as unknown as Pair;
};
`,
            },
          ],
        },
      ],
      output: null,
    },
    {
      code: `
const t = ({ a, b }) => {
  return { a, b } satisfies Pair as Pair;
};
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
const t = (props) => {
  return { ...props } satisfies Pair as Pair;
};
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Regression (#1610): concise arrow, one row per wrapper form. Before the
    // fix these reached neither branch of the target classifier, because the
    // body was not a BlockStatement/ObjectExpression/JSXElement.
    {
      code: `const c = ({ x, y }) => ({ x, y } satisfies Point);`,
      output: null,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `const c = (props) => ({ ...props } satisfies Point);`,
            },
          ],
        },
      ],
    },
    {
      code: `const c = ({ x, y }) => ({ x, y } as Point);`,
      output: null,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `const c = (props) => ({ ...props } as Point);`,
            },
          ],
        },
      ],
    },
    {
      code: `const c = ({ x, y }) => ({ x, y })!;`,
      output: null,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `const c = (props) => ({ ...props })!;`,
            },
          ],
        },
      ],
    },
    {
      code: `const c = ({ x, y }) => ({ x, y } as unknown as Point);`,
      output: null,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `const c = (props) => ({ ...props } as unknown as Point);`,
            },
          ],
        },
      ],
    },

    // Regression (#1610): a retained property survives the collapse behind a
    // wrapper exactly as it does without one.
    {
      code: `const c = ({ x, y }) => ({ x, y, label: 'Origin' } as const);`,
      output: null,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `const c = (props) => ({ ...props, label: 'Origin' } as const);`,
            },
          ],
        },
      ],
    },

    // Regression (#1610): the parameter's type annotation and the return
    // wrapper coexist; both survive the fix untouched.
    {
      code: `
const transform = ({ a, b, c }: TransformInput) => {
  return { a, b, c } as const;
};
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
const transform = (props: TransformInput) => {
  return { ...props } as const;
};
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Regression (#1610): a directive on a retained property still survives when
    // the literal is wrapped.
    {
      code: `
const transform = ({ a, b }) => {
  return {
    a,
    b,
    // eslint-disable-next-line no-console
    label: console.log('x'),
  } as const;
};
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
const transform = (props) => {
  return {
    ...props,
    // eslint-disable-next-line no-console
    label: console.log('x'),
  } as const;
};
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Regression (#1610): the live agora shape (useGroupSubgroups.tsx) — a
    // wrapped reassembly inside a `.map` callback.
    {
      code: `
const toPreviews = (subgroups) => {
  return subgroups.map(({ username, id }) => {
    return {
      username,
      id,
    } as const;
  });
};
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
const toPreviews = (subgroups) => {
  return subgroups.map((props) => {
    return { ...props } as const;
  });
};
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Regression (#1610): a FunctionExpression body is unwrapped too.
    {
      code: `
const make = memo(function({ a, b }) {
  return { a, b } as const;
});
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
const make = memo(function(props) {
  return { ...props } as const;
});
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Regression (#1610): the minFields option still gates the wrapped shape.
    {
      code: `const c = ({ a, b, d }) => ({ a, b, d } as const);`,
      options: [{ minFields: 3 }],
      output: null,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `const c = (props) => ({ ...props } as const);`,
            },
          ],
        },
      ],
    },

    // Control (#1610): the JSX block-return path already unwrapped one level
    // before the fix. Pinned so the previously-working path cannot regress.
    {
      code: `
const W = ({ a, b }) => {
  return <X a={a} b={b} /> as const;
};
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
const W = (props) => {
  return <X {...props} /> as const;
};
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Regression (#1610): the concise-arrow JSX counterpart, which the
    // block-only unwrap never reached.
    {
      code: `const W = ({ a, b }) => (<X a={a} b={b} /> as const);`,
      output: null,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `const W = (props) => (<X {...props} /> as const);`,
            },
          ],
        },
      ],
    },
    {
      code: `const W = ({ a, b }) => (<X a={a} b={b} /> satisfies Element);`,
      output: null,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `const W = (props) => (<X {...props} /> satisfies Element);`,
            },
          ],
        },
      ],
    },

    // Regression (#1610): a JSX return behind a chain of wrappers.
    {
      code: `
const W = ({ a, b }) => {
  return <X a={a} b={b} /> as unknown as JSX.Element;
};
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
const W = (props) => {
  return <X {...props} /> as unknown as JSX.Element;
};
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Regression (#1610): a retained JSX attribute keeps its position and its
    // comment behind a wrapper.
    {
      code: `
const W = ({ hits, isLoading }) => {
  return (
    <Child
      hits={hits}
      isLoading={isLoading}
      // keep me
      extra="x"
    />
  ) as const;
};
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
const W = (props) => {
  return (
    <Child
      {...props}
      // keep me
      extra="x"
    />
  ) as const;
};
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Regression (#1642): a member set EQUAL to the pick is exhaustive, so the
    // spread produces the very same object and the rule works as intended.
    {
      code: `
type Pair = { a: string; b: string };
const build = (units: Pair[]) => units.map(({ a, b }) => ({ a, b }));
`,
      errors: [{ messageId: 'preferSpread' }],
      output: `
type Pair = { a: string; b: string };
const build = (units: Pair[]) => units.map((props) => ({ ...props }));
`,
    },

    // Regression (#1642): the same exhaustive set through the parameter's own
    // annotation.
    {
      code: `
type Pair = { a: string; b: string };
const pick = ({ a, b }: Pair) => ({ a, b });
`,
      errors: [{ messageId: 'preferSpread' }],
      output: `
type Pair = { a: string; b: string };
const pick = (props: Pair) => ({ ...props });
`,
    },

    // Regression (#1642): an exhaustive inline annotation.
    {
      code: `
const pick = ({ a, b }: { a: string; b: string }) => ({ a, b });
`,
      errors: [{ messageId: 'preferSpread' }],
      output: `
const pick = (props: { a: string; b: string }) => ({ ...props });
`,
    },

    // Regression (#1642): an exhaustive interface behind a JSX target.
    {
      code: `
interface Pair {
  a: string;
  b: string;
}
const W = ({ a, b }: Pair) => <Child a={a} b={b} />;
`,
      errors: [{ messageId: 'preferSpread' }],
      output: `
interface Pair {
  a: string;
  b: string;
}
const W = (props: Pair) => <Child {...props} />;
`,
    },

    // Regression (#1642): the specifier resolves to no module on disk beside
    // this file, so the element type's members stay unknown and the report
    // stands. #1644 reads a sibling that does resolve.
    {
      code: `
import type { Unit } from './unit';
const build = (units: Unit[]) => units.map(({ a, b }) => ({ a, b }));
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
import type { Unit } from './unit';
const build = (units: Unit[]) => units.map((props) => ({ ...props }));
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Regression (#1642): a union assembles its members elsewhere.
    {
      code: `
type Wide = { a: string; b: string; c: string } | { a: string; b: string };
const pick = ({ a, b }: Wide) => ({ a, b });
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
type Wide = { a: string; b: string; c: string } | { a: string; b: string };
const pick = (props: Wide) => ({ ...props });
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Regression (#1642): so does an intersection.
    {
      code: `
type Wide = { a: string; b: string } & Extra;
const pick = ({ a, b }: Wide) => ({ a, b });
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
type Wide = { a: string; b: string } & Extra;
const pick = (props: Wide) => ({ ...props });
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Regression (#1642): a mapped type's members are computed from a key set.
    {
      code: `
type Wide = { [K in Keys]: string };
const pick = ({ a, b }: Wide) => ({ a, b });
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
type Wide = { [K in Keys]: string };
const pick = (props: Wide) => ({ ...props });
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Regression (#1642): a conditional type resolves to a member list only
    // once the checker runs.
    {
      code: `
type Wide = Source extends object ? Source : never;
const pick = ({ a, b }: Wide) => ({ a, b });
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
type Wide = Source extends object ? Source : never;
const pick = (props: Wide) => ({ ...props });
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Regression (#1642): an index signature admits members that are never
    // written down, so the list cannot be enumerated.
    {
      code: `
type Wide = { a: string; b: string; [key: string]: string };
const pick = ({ a, b }: Wide) => ({ a, b });
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
type Wide = { a: string; b: string; [key: string]: string };
const pick = (props: Wide) => ({ ...props });
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Regression (#1642): an interface's \`extends\` clause carries members from
    // a declaration this rule may not even be able to see.
    {
      code: `
interface Wide extends Base {
  a: string;
  b: string;
  c: string;
}
const pick = ({ a, b }: Wide) => ({ a, b });
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
interface Wide extends Base {
  a: string;
  b: string;
  c: string;
}
const pick = (props: Wide) => ({ ...props });
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Regression (#1642): a generic instantiation's members depend on the type
    // argument.
    {
      code: `
type Wide<T> = { a: string; b: string; c: T };
const pick = ({ a, b }: Wide<string>) => ({ a, b });
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
type Wide<T> = { a: string; b: string; c: T };
const pick = (props: Wide<string>) => ({ ...props });
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Regression (#1642): a member expression receiver — the property's type
    // lives in the type of its object, which syntax alone does not supply.
    {
      code: `
type Unit = { a: string; b: string; c: string };
const build = (state) => state.units.map(({ a, b }) => ({ a, b }));
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
type Unit = { a: string; b: string; c: string };
const build = (state) => state.units.map((props) => ({ ...props }));
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Regression (#1642): an unannotated reassignable receiver can hold
    // anything by the time the callback runs.
    {
      code: `
type Unit = { a: string; b: string; c: string };
let units = [];
const build = () => units.map(({ a, b }) => ({ a, b }));
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
type Unit = { a: string; b: string; c: string };
let units = [];
const build = () => units.map((props) => ({ ...props }));
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Regression (#1642): an inferred return type is not written down.
    {
      code: `
type Unit = { a: string; b: string; c: string };
const loadUnits = () => [];
const build = () => loadUnits().map(({ a, b }) => ({ a, b }));
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
type Unit = { a: string; b: string; c: string };
const loadUnits = () => [];
const build = () => loadUnits().map((props) => ({ ...props }));
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Regression (#1642): the binding in scope at the call site is the inner
    // one, whose type the pick covers exhaustively. Reading the outer (wider)
    // annotation instead would silence a report the rule owes.
    {
      code: `
type Unit = { a: string; b: string; c: string };
type Pair = { a: string; b: string };
const outer = (units: Unit[]) => {
  const inner = (units: Pair[]) => units.map(({ a, b }) => ({ a, b }));
  return inner([]);
};
`,
      errors: [{ messageId: 'preferSpread' }],
      output: `
type Unit = { a: string; b: string; c: string };
type Pair = { a: string; b: string };
const outer = (units: Unit[]) => {
  const inner = (units: Pair[]) => units.map((props) => ({ ...props }));
  return inner([]);
};
`,
    },

    // Regression (#1642): a callback to a method that is not an element
    // iterator says nothing about its parameter's type.
    {
      code: `
type Unit = { a: string; b: string; c: string };
const build = (units: Unit[]) => wrap(({ a, b }) => ({ a, b }));
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
type Unit = { a: string; b: string; c: string };
const build = (units: Unit[]) => wrap((props) => ({ ...props }));
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Regression (#1642): a self-referential alias terminates without proving
    // anything.
    {
      code: `
type Wide = Wide;
const pick = ({ a, b }: Wide) => ({ a, b });
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
type Wide = Wide;
const pick = (props: Wide) => ({ ...props });
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Regression (#1642): a pick naming a member the source type does not
    // declare proves no subset relation, so today's behavior stands.
    {
      code: `
type Wide = { a: string; c: string; d: string };
const pick = ({ a, b }: Wide) => ({ a, b });
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
type Wide = { a: string; c: string; d: string };
const pick = (props: Wide) => ({ ...props });
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Regression (#1642): the callback is not the first argument, so the
    // element type belongs to some other parameter.
    {
      code: `
type Unit = { a: string; b: string; c: string };
const build = (units: Unit[]) => units.map(identity, ({ a, b }) => ({ a, b }));
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
type Unit = { a: string; b: string; c: string };
const build = (units: Unit[]) => units.map(identity, (props) => ({ ...props }));
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Regression (#1643): reading through \`Readonly\` widens what can be
    // proven, never what is silenced — an exhaustive pick still reports.
    {
      code: `
type Wide = Readonly<{ a: string; b: string }>;
const pick = ({ a, b }: Wide) => ({ a, b });
`,
      errors: [{ messageId: 'preferSpread' }],
      output: `
type Wide = Readonly<{ a: string; b: string }>;
const pick = (props: Wide) => ({ ...props });
`,
    },

    // Regression (#1643): an exhaustive pick through \`Partial\`.
    {
      code: `
type Wide = Partial<{ a: string; b: string }>;
const pick = ({ a, b }: Wide) => ({ a, b });
`,
      errors: [{ messageId: 'preferSpread' }],
      output: `
type Wide = Partial<{ a: string; b: string }>;
const pick = (props: Wide) => ({ ...props });
`,
    },

    // Regression (#1643): an exhaustive pick through \`Required\`.
    {
      code: `
type Wide = Required<{ a?: string; b?: string }>;
const pick = ({ a, b }: Wide) => ({ a, b });
`,
      errors: [{ messageId: 'preferSpread' }],
      output: `
type Wide = Required<{ a?: string; b?: string }>;
const pick = (props: Wide) => ({ ...props });
`,
    },

    // Regression (#1643): \`Pick\` rewrites the key set, so its argument's
    // member list says nothing about the instantiation. Reading through it
    // would silence this exhaustive reassembly.
    {
      code: `
type Big = { a: string; b: string; c: string };
type Wide = Pick<Big, 'a' | 'b'>;
const pick = ({ a, b }: Wide) => ({ a, b });
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
type Big = { a: string; b: string; c: string };
type Wide = Pick<Big, 'a' | 'b'>;
const pick = (props: Wide) => ({ ...props });
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Regression (#1643): \`Omit\` removes keys.
    {
      code: `
type Big = { a: string; b: string; c: string };
type Wide = Omit<Big, 'c'>;
const pick = ({ a, b }: Wide) => ({ a, b });
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
type Big = { a: string; b: string; c: string };
type Wide = Omit<Big, 'c'>;
const pick = (props: Wide) => ({ ...props });
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Regression (#1643): \`Record\` names no members at all.
    {
      code: `
type Wide = Record<string, number>;
const pick = ({ a, b }: Wide) => ({ a, b });
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
type Wide = Record<string, number>;
const pick = (props: Wide) => ({ ...props });
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Regression (#1643): only the three key-preserving operators are read
    // through, so a single-argument instantiation of anything else proves
    // nothing.
    {
      code: `
type Big = { a: string; b: string; c: string };
type Wide = NonNullable<Big>;
const pick = ({ a, b }: Wide) => ({ a, b });
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
type Big = { a: string; b: string; c: string };
type Wide = NonNullable<Big>;
const pick = (props: Wide) => ({ ...props });
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Regression (#1643): a file declaring its own \`Readonly\` is not talking
    // about the lib utility, and this one drops a key — reading through it
    // would silence an exhaustive reassembly.
    {
      code: `
type Readonly<T> = Pick<T, 'a' | 'b'>;
type Big = { a: string; b: string; c: string };
const pick = ({ a, b }: Readonly<Big>) => ({ a, b });
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
type Readonly<T> = Pick<T, 'a' | 'b'>;
type Big = { a: string; b: string; c: string };
const pick = (props: Readonly<Big>) => ({ ...props });
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Regression (#1643): an imported \`Partial\` shadows the global just as a
    // local declaration does.
    {
      code: `
import { Partial } from './types';
type Big = { a: string; b: string; c: string };
const pick = ({ a, b }: Partial<Big>) => ({ a, b });
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
import { Partial } from './types';
type Big = { a: string; b: string; c: string };
const pick = (props: Partial<Big>) => ({ ...props });
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Regression (#1643): a nested declaration shadows too, so the whole file
    // is scanned rather than its top level alone.
    {
      code: `
type Big = { a: string; b: string; c: string };
const build = () => {
  interface Required {
    a: string;
    b: string;
  }
  return ({ a, b }: Required<Big>) => ({ a, b });
};
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
type Big = { a: string; b: string; c: string };
const build = () => {
  interface Required {
    a: string;
    b: string;
  }
  return (props: Required<Big>) => ({ ...props });
};
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Regression (#1643): an arity other than one is malformed for these
    // operators, so the instantiation is not the utility it spells.
    {
      code: `
type Big = { a: string; b: string; c: string };
const pick = ({ a, b }: Readonly<Big, Big>) => ({ a, b });
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
type Big = { a: string; b: string; c: string };
const pick = (props: Readonly<Big, Big>) => ({ ...props });
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Regression (#1643): the operator preserves keys, but the argument's own
    // keys live in a module that does not resolve beside this file.
    {
      code: `
import type { Big } from './types';
const pick = ({ a, b }: Readonly<Big>) => ({ a, b });
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
import type { Big } from './types';
const pick = (props: Readonly<Big>) => ({ ...props });
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Regression (#1643): a generic alias behind the operator resolves to a
    // member list only once its type argument is known.
    {
      code: `
type Big<T> = { a: string; b: string; c: T };
const pick = ({ a, b }: Readonly<Big<string>>) => ({ a, b });
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
type Big<T> = { a: string; b: string; c: T };
const pick = (props: Readonly<Big<string>>) => ({ ...props });
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Regression (#1644): an imported member set that matches the pick exactly
    // is exhaustive, so reading the sibling confirms the report rather than
    // silencing it.
    {
      filename: FIXTURE_FILE,
      code: `
import type { Exact } from './types';
const pick = ({ a, b }: Exact) => ({ a, b });
`,
      errors: [{ messageId: 'preferSpread' }],
      output: `
import type { Exact } from './types';
const pick = (props: Exact) => ({ ...props });
`,
    },

    // Regression (#1644): a bare package specifier names a module whose
    // location depends on resolution settings this rule does not read.
    {
      filename: FIXTURE_FILE,
      code: `
import type { Wide } from 'shared-types';
const pick = ({ a, b }: Wide) => ({ a, b });
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
import type { Wide } from 'shared-types';
const pick = (props: Wide) => ({ ...props });
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Regression (#1644): a relative specifier that resolves to nothing on disk
    // proves nothing.
    {
      filename: FIXTURE_FILE,
      code: `
import type { Wide } from './missing-module';
const pick = ({ a, b }: Wide) => ({ a, b });
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
import type { Wide } from './missing-module';
const pick = (props: Wide) => ({ ...props });
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Regression (#1644): the sibling re-exports the name from a third module,
    // which is past the single hop.
    {
      filename: FIXTURE_FILE,
      code: `
import type { Relayed } from './types';
const pick = ({ a, b }: Relayed) => ({ a, b });
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
import type { Relayed } from './types';
const pick = (props: Relayed) => ({ ...props });
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Regression (#1644): the sibling's own declaration is a \`Pick\`, which
    // rewrites the key set.
    {
      filename: FIXTURE_FILE,
      code: `
import type { NarrowPick } from './types';
const pick = ({ a, b }: NarrowPick) => ({ a, b });
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
import type { NarrowPick } from './types';
const pick = (props: NarrowPick) => ({ ...props });
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Regression (#1644): the sibling's declaration aliases a type it imports
    // itself, so the member list is two hops out.
    {
      filename: FIXTURE_FILE,
      code: `
import type { ViaThird } from './types';
const pick = ({ a, b }: ViaThird) => ({ a, b });
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
import type { ViaThird } from './types';
const pick = (props: ViaThird) => ({ ...props });
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Regression (#1644): a barrel names no declaration of its own.
    {
      filename: FIXTURE_FILE,
      code: `
import type { Wide } from './barrel';
const pick = ({ a, b }: Wide) => ({ a, b });
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
import type { Wide } from './barrel';
const pick = (props: Wide) => ({ ...props });
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Regression (#1644): the sibling resolves but exports no such name.
    {
      filename: FIXTURE_FILE,
      code: `
import type { Missing } from './types';
const pick = ({ a, b }: Missing) => ({ a, b });
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
import type { Missing } from './types';
const pick = (props: Missing) => ({ ...props });
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Regression (#1644): a specifier export is indistinguishable from a
    // re-export at the specifier, so only \`export type X = …\` is followed.
    {
      filename: FIXTURE_FILE,
      code: `
import type { SpecifierExported } from './types';
const pick = ({ a, b }: SpecifierExported) => ({ a, b });
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
import type { SpecifierExported } from './types';
const pick = (props: SpecifierExported) => ({ ...props });
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Regression (#1644): a namespace import is referenced as a qualified name,
    // which the enumerator does not read.
    {
      filename: FIXTURE_FILE,
      code: `
import * as Types from './types';
const pick = ({ a, b }: Types.Wide) => ({ a, b });
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
import * as Types from './types';
const pick = (props: Types.Wide) => ({ ...props });
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Regression (#1644): a default import carries no exported name to look up
    // in the sibling.
    {
      filename: FIXTURE_FILE,
      code: `
import Wide from './types';
const pick = ({ a, b }: Wide) => ({ a, b });
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
import Wide from './types';
const pick = (props: Wide) => ({ ...props });
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Regression (#1769): widening resolution must not disable the rule. A
    // nested declaration the pick covers exhaustively is a behavior-preserving
    // rewrite, so it still reports at the depth the resolver newly reaches.
    {
      code: `
function outer() {
  type Exact = { a: string; b: string };
  const pick = ({ a, b }: Exact) => ({ a, b });
  return pick;
}
`,
      errors: [{ messageId: 'preferSpread' }],
      output: `
function outer() {
  type Exact = { a: string; b: string };
  const pick = (props: Exact) => ({ ...props });
  return pick;
}
`,
    },

    // Regression (#1769): the same at namespace depth.
    {
      code: `
namespace Shapes {
  type Exact = { a: string; b: string };
  export const pick = ({ a, b }: Exact) => ({ a, b });
}
`,
      errors: [{ messageId: 'preferSpread' }],
      output: `
namespace Shapes {
  type Exact = { a: string; b: string };
  export const pick = (props: Exact) => ({ ...props });
}
`,
    },

    // Regression (#1769): and inside a bare block.
    {
      code: `
{
  type Exact = { a: string; b: string };
  const pick = ({ a, b }: Exact) => ({ a, b });
  void pick;
}
`,
      errors: [{ messageId: 'preferSpread' }],
      output: `
{
  type Exact = { a: string; b: string };
  const pick = (props: Exact) => ({ ...props });
  void pick;
}
`,
    },

    // Regression (#1769): a declaration in a SIBLING scope is not in scope at
    // the reference, so it proves nothing and the rule reports — the walk goes
    // outward only, never sideways.
    {
      code: `
function other() {
  type Wide = { a: string; b: string; c: string };
  return null as unknown as Wide;
}
function outer() {
  const pick = ({ a, b }: Wide) => ({ a, b });
  return pick;
}
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
function other() {
  type Wide = { a: string; b: string; c: string };
  return null as unknown as Wide;
}
function outer() {
  const pick = (props: Wide) => ({ ...props });
  return pick;
}
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Regression (#1769): the innermost declaration wins in the reporting
    // direction too — an inner EXHAUSTIVE type shadows an outer wide one, and
    // reading the outer member list instead would silence a report the rule
    // owes.
    {
      code: `
type Wide = { a: string; b: string; c: string };
function outer() {
  type Wide = { a: string; b: string };
  const pick = ({ a, b }: Wide) => ({ a, b });
  return pick;
}
`,
      errors: [{ messageId: 'preferSpread' }],
      output: `
type Wide = { a: string; b: string; c: string };
function outer() {
  type Wide = { a: string; b: string };
  const pick = (props: Wide) => ({ ...props });
  return pick;
}
`,
    },

    // Regression (#1769): a self-referential alias in a nested scope terminates
    // without proving anything rather than recurring forever.
    {
      code: `
function outer() {
  type Wide = Wide;
  const pick = ({ a, b }: Wide) => ({ a, b });
  return pick;
}
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
function outer() {
  type Wide = Wide;
  const pick = (props: Wide) => ({ ...props });
  return pick;
}
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Regression (#1769): a two-link cycle across scopes terminates as well.
    {
      code: `
type Wide = Inner;
function outer() {
  type Inner = Wide;
  const pick = ({ a, b }: Inner) => ({ a, b });
  return pick;
}
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
type Wide = Inner;
function outer() {
  type Inner = Wide;
  const pick = (props: Inner) => ({ ...props });
  return pick;
}
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Regression (#1769): a nested declaration that enumerates nothing — an
    // index signature admits members that are never written down — still leaves
    // the pick unproven.
    {
      code: `
function outer() {
  type Wide = { a: string; b: string; [key: string]: string };
  const pick = ({ a, b }: Wide) => ({ a, b });
  return pick;
}
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
function outer() {
  type Wide = { a: string; b: string; [key: string]: string };
  const pick = (props: Wide) => ({ ...props });
  return pick;
}
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Regression (#1769): a nested declaration of \`Readonly\` shadows the lib
    // utility, and this one drops a key, so reading through it would silence an
    // exhaustive reassembly.
    {
      code: `
function outer() {
  type Readonly<T> = Pick<T, 'a' | 'b'>;
  type Big = { a: string; b: string; c: string };
  const pick = ({ a, b }: Readonly<Big>) => ({ a, b });
  return pick;
}
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
function outer() {
  type Readonly<T> = Pick<T, 'a' | 'b'>;
  type Big = { a: string; b: string; c: string };
  const pick = (props: Readonly<Big>) => ({ ...props });
  return pick;
}
`,
            },
          ],
        },
      ],
      output: null,
    },

    // ---------------------------------------------------------------------
    // Regression (#1908): a `function` declaration is an ordinary spelling of a
    // component, and the reassembly it holds is the same reassembly an arrow
    // holds. Each case below is the declaration twin of an arrow fixture above,
    // pinning the report AND the exact fix so the two spellings cannot drift.
    // ---------------------------------------------------------------------

    // The reported shape verbatim: identical to the three-field arrow above.
    {
      code: `
function Wrapper({ a, b, c }) {
  return <X a={a} b={b} c={c} />;
}
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
function Wrapper(props) {
  return <X {...props} />;
}
`,
            },
          ],
        },
      ],
      output: null,
    },

    // The multi-attribute element collapses to a lone spread.
    {
      code: `
function Wrapper({ hits, isLoading, onNearEnd }) {
  return (
    <Child
      hits={hits}
      isLoading={isLoading}
      onNearEnd={onNearEnd}
    />
  );
}
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
function Wrapper(props) {
  return (
    <Child {...props} />
  );
}
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Regression (#1356): the annotation survives on a declaration too. The
    // sibling `Foo` takes a single non-destructured parameter, so it is left
    // alone — only the reassembling declaration is rewritten.
    {
      code: `
type FooProps = { a: string; b: string };
function Foo(p: FooProps) {
  return null;
}
function Bar({ a, b }: FooProps) {
  return <Foo a={a} b={b} />;
}
`,
      errors: [{ messageId: 'preferSpread' }],
      output: `
type FooProps = { a: string; b: string };
function Foo(p: FooProps) {
  return null;
}
function Bar(props: FooProps) {
  return <Foo {...props} />;
}
`,
    },

    // An `export` keyword in front of the declaration changes nothing.
    {
      code: `
export function Wrapper({ hits, isLoading }) {
  return <Child hits={hits} isLoading={isLoading} />;
}
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
export function Wrapper(props) {
  return <Child {...props} />;
}
`,
            },
          ],
        },
      ],
      output: null,
    },

    // `export default function` is the same declaration one node deeper.
    {
      code: `
export default function Wrapper({ a, b }) {
  return <X a={a} b={b} />;
}
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
export default function Wrapper(props) {
  return <X {...props} />;
}
`,
            },
          ],
        },
      ],
      output: null,
    },

    // A default export may omit the name entirely; the fix edits the parameter
    // list, which is present either way.
    {
      code: `
export default function ({ a, b }) {
  return <X a={a} b={b} />;
}
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
export default function (props) {
  return <X {...props} />;
}
`,
            },
          ],
        },
      ],
      output: null,
    },

    // A declaration nested in another function body.
    {
      code: `
function outer() {
  function Wrapper({ a, b }) {
    return <X a={a} b={b} />;
  }
  return Wrapper;
}
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
function outer() {
  function Wrapper(props) {
    return <X {...props} />;
  }
  return Wrapper;
}
`,
            },
          ],
        },
      ],
      output: null,
    },

    // A declaration exported from inside a namespace.
    {
      code: `
namespace Shapes {
  export function pick({ a, b }) {
    return { a, b };
  }
}
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
namespace Shapes {
  export function pick(props) {
    return { ...props };
  }
}
`,
            },
          ],
        },
      ],
      output: null,
    },

    // The object-literal target branch.
    {
      code: `
function transform({ a, b, c }) {
  return { a, b, c };
}
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
function transform(props) {
  return { ...props };
}
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Regression (#1443): a directive on a retained property survives the
    // object-literal splice under the declaration spelling as well.
    {
      code: `
function transform({ a, b }) {
  return {
    a,
    b,
    // eslint-disable-next-line no-console
    label: console.log('x'),
  };
}
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
function transform(props) {
  return {
    ...props,
    // eslint-disable-next-line no-console
    label: console.log('x'),
  };
}
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Regression (#1443): a retained JSX attribute keeps its comment and line.
    {
      code: `
function Wrapper({ hits, isLoading }) {
  return (
    <Child
      hits={hits}
      isLoading={isLoading}
      // keep me: describes extra
      extra="x"
    />
  );
}
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
function Wrapper(props) {
  return (
    <Child
      {...props}
      // keep me: describes extra
      extra="x"
    />
  );
}
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Regression (#1443): a non-self-closing element keeps its children.
    {
      code: `
function Wrapper({ hits, isLoading }) {
  return (
    <Child
      hits={hits}
      isLoading={isLoading}
      // eslint-disable-next-line no-console
      onClick={() => console.log('x')}
    >
      <Inner />
    </Child>
  );
}
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
function Wrapper(props) {
  return (
    <Child
      {...props}
      // eslint-disable-next-line no-console
      onClick={() => console.log('x')}
    >
      <Inner />
    </Child>
  );
}
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Regression (#1610): the type-only wrapper is left verbatim and only the
    // reassembly collapses.
    {
      code: `
function t({ a, b }) {
  return { a, b } as const;
}
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
function t(props) {
  return { ...props } as const;
}
`,
            },
          ],
        },
      ],
      output: null,
    },

    // A destructured field named `props` forces a fresh parameter name.
    {
      code: `
function W({ props, isLoading }: ChildProps) {
  return <Child props={props} isLoading={isLoading} />;
}
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
function W(props0: ChildProps) {
  return <Child {...props0} />;
}
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Regression (#1356): a multi-line inline annotation keeps its formatting.
    {
      code: `
function Wrapper({ hits, isLoading }: {
  hits: Hit[];
  isLoading: boolean;
}) {
  return <Child hits={hits} isLoading={isLoading} />;
}
`,
      errors: [{ messageId: 'preferSpread' }],
      output: `
function Wrapper(props: {
  hits: Hit[];
  isLoading: boolean;
}) {
  return <Child {...props} />;
}
`,
    },

    // The `minFields` option gates the declaration spelling identically.
    {
      code: `
function W({ a, b, c }) {
  return <X a={a} b={b} c={c} />;
}
`,
      options: [{ minFields: 3 }],
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
function W(props) {
  return <X {...props} />;
}
`,
            },
          ],
        },
      ],
      output: null,
    },

    // `async` and `function*` are still declarations carrying a reassembly.
    {
      code: `
async function build({ a, b }) {
  return { a, b };
}
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
async function build(props) {
  return { ...props };
}
`,
            },
          ],
        },
      ],
      output: null,
    },
    {
      code: `
function* build({ a, b }) {
  return { a, b };
}
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
function* build(props) {
  return { ...props };
}
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Regression (#1642): the narrowing proof runs in the safe direction on a
    // declaration too — an EXHAUSTIVE member set still reports.
    {
      code: `
type Pair = { a: string; b: string };
function pick({ a, b }: Pair) {
  return { a, b };
}
`,
      errors: [{ messageId: 'preferSpread' }],
      output: `
type Pair = { a: string; b: string };
function pick(props: Pair) {
  return { ...props };
}
`,
    },

    // Regression (#1643): exhaustive through a key-preserving operator.
    {
      code: `
type Wide = Readonly<{ a: string; b: string }>;
function pick({ a, b }: Wide) {
  return { a, b };
}
`,
      errors: [{ messageId: 'preferSpread' }],
      output: `
type Wide = Readonly<{ a: string; b: string }>;
function pick(props: Wide) {
  return { ...props };
}
`,
    },

    // Regression (#1644): exhaustive across the single hop into a sibling.
    {
      filename: FIXTURE_FILE,
      code: `
import type { Exact } from './types';
function pick({ a, b }: Exact) {
  return { a, b };
}
`,
      errors: [{ messageId: 'preferSpread' }],
      output: `
import type { Exact } from './types';
function pick(props: Exact) {
  return { ...props };
}
`,
    },

    // Regression (#1769): exhaustive through a lexically nested declaration.
    {
      code: `
function outer() {
  type Exact = { a: string; b: string };
  function pick({ a, b }: Exact) {
    return { a, b };
  }
  return pick;
}
`,
      errors: [{ messageId: 'preferSpread' }],
      output: `
function outer() {
  type Exact = { a: string; b: string };
  function pick(props: Exact) {
    return { ...props };
  }
  return pick;
}
`,
    },

    // Regression (#2259): `Wide` inside `pick` is the function's OWN type
    // parameter, so its members are unknown and no narrowing-pick proof is
    // possible. Resolving the annotation by statement containers alone steps
    // straight past the type parameter, letting the outer three-member `Wide`
    // answer — and `{ a, b }` reads as a deliberate narrowing pick, which is
    // the rule's carve-out, so the report is suppressed entirely.
    {
      code: `
type Wide = { a: string; b: string; c: string };

function pick<Wide>({ a, b }: Wide) {
  return { a, b };
}
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
type Wide = { a: string; b: string; c: string };

function pick<Wide>(props: Wide) {
  return { ...props };
}
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Regression (#2298): the production shape. `sample`'s type is assembled by
    // a conditional over `Parameters<>`, which no syntactic reader will ever
    // enumerate, so the pick stays unproven. The finding still stands — the
    // author may well want the spread — but the rewrite is OFFERED rather than
    // applied, because applying it would forward `otherEvents` to a consumer
    // whose `'otherEvents' in props` check reads it.
    {
      code: `
type SampleInput = Readonly<{ title: string; position: number; otherEvents: string[] }>;
type Sampler = (input: SampleInput) => unknown;
type CaseEntry = { sample: Parameters<Sampler>[0] extends object ? Sampler : never };
const CASE_ENTRY: CaseEntry = {
  sample: ({ title, position }) => ({ title, position }),
};
`,
      errors: [
        {
          messageId: 'preferSpread',
          suggestions: [
            {
              messageId: 'applySpread',
              output: `
type SampleInput = Readonly<{ title: string; position: number; otherEvents: string[] }>;
type Sampler = (input: SampleInput) => unknown;
type CaseEntry = { sample: Parameters<Sampler>[0] extends object ? Sampler : never };
const CASE_ENTRY: CaseEntry = {
  sample: (props) => ({ ...props }),
};
`,
            },
          ],
        },
      ],
      output: null,
    },

    // Over-decline control for #2298: the contextual binding route resolves an
    // EXHAUSTIVE member set, which is a proof that the spread forwards exactly
    // what the pick did. The route must still autofix there — a route that only
    // ever silences would be indistinguishable from not reading the binding at
    // all.
    {
      code: `
type SampleInput = Readonly<{ title: string; position: number }>;
type CaseEntry = Readonly<{ sample: (input: SampleInput) => unknown }>;
const CASES: readonly CaseEntry[] = [
  { sample: ({ title, position }) => ({ title, position }) },
];
`,
      errors: [{ messageId: 'preferSpread' }],
      output: `
type SampleInput = Readonly<{ title: string; position: number }>;
type CaseEntry = Readonly<{ sample: (input: SampleInput) => unknown }>;
const CASES: readonly CaseEntry[] = [
  { sample: (props) => ({ ...props }) },
];
`,
    },
  ],
});
