import { ruleTesterJsx } from '../utils/ruleTester';
import { preferSpreadOverReassembly } from '../rules/prefer-spread-over-reassembly';

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

    // Function declaration (not arrow/expression) — not checked by this rule.
    `
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
      errors: [{ messageId: 'preferSpread' }],
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
      errors: [{ messageId: 'preferSpread' }],
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
      errors: [{ messageId: 'preferSpread' }],
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

    // Object literal reassembly via function parameter destructuring.
    {
      code: `
const transform = ({ a, b, c }) => {
  return { a, b, c };
};
`,
      errors: [{ messageId: 'preferSpread' }],
      output: `
const transform = (props) => {
  return { ...props };
};
`,
    },

    // Simple concise arrow — self-closing JSX.
    {
      code: `
const Wrapper = ({ hits, isLoading }) => <Child hits={hits} isLoading={isLoading} />;
`,
      errors: [{ messageId: 'preferSpread' }],
      output: `
const Wrapper = (props) => <Child {...props} />;
`,
    },

    // Extra non-destructured prop after spread (self-closing JSX).
    {
      code: `
const Wrapper = ({ hits, isLoading }) => <Child hits={hits} isLoading={isLoading} extra="x" />;
`,
      errors: [{ messageId: 'preferSpread' }],
      output: `
const Wrapper = (props) => <Child {...props} extra="x" />;
`,
    },

    // Three fields all forwarded.
    {
      code: `
const Wrapper = ({ a, b, c }) => {
  return <X a={a} b={b} c={c} />;
};
`,
      errors: [{ messageId: 'preferSpread' }],
      output: `
const Wrapper = (props) => {
  return <X {...props} />;
};
`,
    },

    // FunctionExpression (not arrow) as argument.
    {
      code: `
const Wrapper = memo(function({ hits, isLoading, onNearEnd }) {
  return <Child hits={hits} isLoading={isLoading} onNearEnd={onNearEnd} />;
});
`,
      errors: [{ messageId: 'preferSpread' }],
      output: `
const Wrapper = memo(function(props) {
  return <Child {...props} />;
});
`,
    },

    // minFields option respected — 3 fields, minFields=3 should flag.
    {
      code: `
const Wrapper = ({ a, b, c }) => <X a={a} b={b} c={c} />;
`,
      options: [{ minFields: 3 }],
      errors: [{ messageId: 'preferSpread' }],
      output: `
const Wrapper = (props) => <X {...props} />;
`,
    },

    // Object literal with extra prop.
    {
      code: `
const wrap = ({ x, y }) => ({ x, y, label: 'Origin' });
`,
      errors: [{ messageId: 'preferSpread' }],
      output: `
const wrap = (props) => ({ ...props, label: 'Origin' });
`,
    },

    // Return object literal — non-concise (block body).
    {
      code: `
const makePoint = ({ x, y, z }) => {
  return { x, y, z };
};
`,
      errors: [{ messageId: 'preferSpread' }],
      output: `
const makePoint = (props) => {
  return { ...props };
};
`,
    },

    // Annotated concise arrow (#1356) — annotation survives on a one-liner.
    {
      code: `
const Wrapper = ({ hits, isLoading }: ChildProps) => <Child hits={hits} isLoading={isLoading} />;
`,
      errors: [{ messageId: 'preferSpread' }],
      output: `
const Wrapper = (props: ChildProps) => <Child {...props} />;
`,
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
      errors: [{ messageId: 'preferSpread' }],
      output: `
const Wrapper = (props: LoadedProps | EmptyProps) => {
  return <Child {...props} />;
};
`,
    },

    // Imported type alias (#1356) — a qualified name survives verbatim.
    {
      code: `
import type { ChildProps } from './Child';
const Wrapper = ({ hits, isLoading }: ChildProps) => {
  return <Child hits={hits} isLoading={isLoading} />;
};
`,
      errors: [{ messageId: 'preferSpread' }],
      output: `
import type { ChildProps } from './Child';
const Wrapper = (props: ChildProps) => {
  return <Child {...props} />;
};
`,
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
      errors: [{ messageId: 'preferSpread' }],
      output: `
const Wrapper = (props : ChildProps) => <Child {...props} />;
`,
    },

    // Object-literal branch with an annotation (#1356) — the non-JSX target.
    {
      code: `
const transform = ({ a, b, c }: TransformInput) => {
  return { a, b, c };
};
`,
      errors: [{ messageId: 'preferSpread' }],
      output: `
const transform = (props: TransformInput) => {
  return { ...props };
};
`,
    },

    // Object-literal branch, concise arrow with a generic annotation (#1356).
    {
      code: `
const wrap = ({ x, y }: Readonly<Point>) => ({ x, y, label: 'Origin' });
`,
      errors: [{ messageId: 'preferSpread' }],
      output: `
const wrap = (props: Readonly<Point>) => ({ ...props, label: 'Origin' });
`,
    },

    // FunctionExpression inside memo with an annotation (#1356).
    {
      code: `
const Wrapper = memo(function({ hits, isLoading, onNearEnd }: ChildProps) {
  return <Child hits={hits} isLoading={isLoading} onNearEnd={onNearEnd} />;
});
`,
      errors: [{ messageId: 'preferSpread' }],
      output: `
const Wrapper = memo(function(props: ChildProps) {
  return <Child {...props} />;
});
`,
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
      errors: [{ messageId: 'preferSpread' }],
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

    // A destructured field named `props` forces a fresh parameter name; the
    // annotation still survives (#1356).
    {
      code: `
const Wrapper = ({ props, isLoading }: ChildProps) => <Child props={props} isLoading={isLoading} />;
`,
      errors: [{ messageId: 'preferSpread' }],
      output: `
const Wrapper = (props0: ChildProps) => <Child {...props0} />;
`,
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
      errors: [{ messageId: 'preferSpread' }],
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
      errors: [{ messageId: 'preferSpread' }],
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
      errors: [{ messageId: 'preferSpread' }],
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
      errors: [{ messageId: 'preferSpread' }],
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
      errors: [{ messageId: 'preferSpread' }],
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
      errors: [{ messageId: 'preferSpread' }],
      output: `
const Wrapper = (props) => {
  return (
    <Child {...props} />
  );
};
`,
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
      errors: [{ messageId: 'preferSpread' }],
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
      errors: [{ messageId: 'preferSpread' }],
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
      errors: [{ messageId: 'preferSpread' }],
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
      errors: [{ messageId: 'preferSpread' }],
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
      errors: [{ messageId: 'preferSpread' }],
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

    // Regression (#1610): a type-only wrapper on the reassembled literal has no
    // runtime effect and removes no reassembly, so it must not silence the rule.
    // The fixer edits the literal in place and leaves the wrapper verbatim.
    {
      code: `const g = ({ a, b }) => ({ a, b } as const);`,
      output: `const g = (props) => ({ ...props } as const);`,
      errors: [{ messageId: 'preferSpread' }],
    },
    {
      code: `const h = (items) => items.map(({ id, name }) => { return { id, name } as const; });`,
      output: `const h = (items) => items.map((props) => { return { ...props } as const; });`,
      errors: [{ messageId: 'preferSpread' }],
    },
    {
      code: `const s = ({ a, b }) => { return { a, b } satisfies Pair; };`,
      output: `const s = (props) => { return { ...props } satisfies Pair; };`,
      errors: [{ messageId: 'preferSpread' }],
    },

    // Regression (#1610): block return, one row per wrapper form.
    {
      code: `
const t = ({ a, b }) => {
  return { a, b } as const;
};
`,
      errors: [{ messageId: 'preferSpread' }],
      output: `
const t = (props) => {
  return { ...props } as const;
};
`,
    },
    {
      code: `
const t = ({ a, b }) => {
  return { a, b } as Pair;
};
`,
      errors: [{ messageId: 'preferSpread' }],
      output: `
const t = (props) => {
  return { ...props } as Pair;
};
`,
    },
    {
      code: `
const t = ({ a, b }) => {
  return ({ a, b })!;
};
`,
      errors: [{ messageId: 'preferSpread' }],
      output: `
const t = (props) => {
  return ({ ...props })!;
};
`,
    },
    // A chain unwinds fully: `as unknown as T` is two wrappers deep.
    {
      code: `
const t = ({ a, b }) => {
  return { a, b } as unknown as Pair;
};
`,
      errors: [{ messageId: 'preferSpread' }],
      output: `
const t = (props) => {
  return { ...props } as unknown as Pair;
};
`,
    },
    {
      code: `
const t = ({ a, b }) => {
  return { a, b } satisfies Pair as Pair;
};
`,
      errors: [{ messageId: 'preferSpread' }],
      output: `
const t = (props) => {
  return { ...props } satisfies Pair as Pair;
};
`,
    },

    // Regression (#1610): concise arrow, one row per wrapper form. Before the
    // fix these reached neither branch of the target classifier, because the
    // body was not a BlockStatement/ObjectExpression/JSXElement.
    {
      code: `const c = ({ x, y }) => ({ x, y } satisfies Point);`,
      output: `const c = (props) => ({ ...props } satisfies Point);`,
      errors: [{ messageId: 'preferSpread' }],
    },
    {
      code: `const c = ({ x, y }) => ({ x, y } as Point);`,
      output: `const c = (props) => ({ ...props } as Point);`,
      errors: [{ messageId: 'preferSpread' }],
    },
    {
      code: `const c = ({ x, y }) => ({ x, y })!;`,
      output: `const c = (props) => ({ ...props })!;`,
      errors: [{ messageId: 'preferSpread' }],
    },
    {
      code: `const c = ({ x, y }) => ({ x, y } as unknown as Point);`,
      output: `const c = (props) => ({ ...props } as unknown as Point);`,
      errors: [{ messageId: 'preferSpread' }],
    },

    // Regression (#1610): a retained property survives the collapse behind a
    // wrapper exactly as it does without one.
    {
      code: `const c = ({ x, y }) => ({ x, y, label: 'Origin' } as const);`,
      output: `const c = (props) => ({ ...props, label: 'Origin' } as const);`,
      errors: [{ messageId: 'preferSpread' }],
    },

    // Regression (#1610): the parameter's type annotation and the return
    // wrapper coexist; both survive the fix untouched.
    {
      code: `
const transform = ({ a, b, c }: TransformInput) => {
  return { a, b, c } as const;
};
`,
      errors: [{ messageId: 'preferSpread' }],
      output: `
const transform = (props: TransformInput) => {
  return { ...props } as const;
};
`,
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
      errors: [{ messageId: 'preferSpread' }],
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
      errors: [{ messageId: 'preferSpread' }],
      output: `
const toPreviews = (subgroups) => {
  return subgroups.map((props) => {
    return { ...props } as const;
  });
};
`,
    },

    // Regression (#1610): a FunctionExpression body is unwrapped too.
    {
      code: `
const make = memo(function({ a, b }) {
  return { a, b } as const;
});
`,
      errors: [{ messageId: 'preferSpread' }],
      output: `
const make = memo(function(props) {
  return { ...props } as const;
});
`,
    },

    // Regression (#1610): the minFields option still gates the wrapped shape.
    {
      code: `const c = ({ a, b, d }) => ({ a, b, d } as const);`,
      options: [{ minFields: 3 }],
      output: `const c = (props) => ({ ...props } as const);`,
      errors: [{ messageId: 'preferSpread' }],
    },

    // Control (#1610): the JSX block-return path already unwrapped one level
    // before the fix. Pinned so the previously-working path cannot regress.
    {
      code: `
const W = ({ a, b }) => {
  return <X a={a} b={b} /> as const;
};
`,
      errors: [{ messageId: 'preferSpread' }],
      output: `
const W = (props) => {
  return <X {...props} /> as const;
};
`,
    },

    // Regression (#1610): the concise-arrow JSX counterpart, which the
    // block-only unwrap never reached.
    {
      code: `const W = ({ a, b }) => (<X a={a} b={b} /> as const);`,
      output: `const W = (props) => (<X {...props} /> as const);`,
      errors: [{ messageId: 'preferSpread' }],
    },
    {
      code: `const W = ({ a, b }) => (<X a={a} b={b} /> satisfies Element);`,
      output: `const W = (props) => (<X {...props} /> satisfies Element);`,
      errors: [{ messageId: 'preferSpread' }],
    },

    // Regression (#1610): a JSX return behind a chain of wrappers.
    {
      code: `
const W = ({ a, b }) => {
  return <X a={a} b={b} /> as unknown as JSX.Element;
};
`,
      errors: [{ messageId: 'preferSpread' }],
      output: `
const W = (props) => {
  return <X {...props} /> as unknown as JSX.Element;
};
`,
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
      errors: [{ messageId: 'preferSpread' }],
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

    // Regression (#1642): an imported element type lives in a module this rule
    // cannot read, so nothing is proven and the report stands.
    {
      code: `
import type { Unit } from './unit';
const build = (units: Unit[]) => units.map(({ a, b }) => ({ a, b }));
`,
      errors: [{ messageId: 'preferSpread' }],
      output: `
import type { Unit } from './unit';
const build = (units: Unit[]) => units.map((props) => ({ ...props }));
`,
    },

    // Regression (#1642): a union assembles its members elsewhere.
    {
      code: `
type Wide = { a: string; b: string; c: string } | { a: string; b: string };
const pick = ({ a, b }: Wide) => ({ a, b });
`,
      errors: [{ messageId: 'preferSpread' }],
      output: `
type Wide = { a: string; b: string; c: string } | { a: string; b: string };
const pick = (props: Wide) => ({ ...props });
`,
    },

    // Regression (#1642): so does an intersection.
    {
      code: `
type Wide = { a: string; b: string } & Extra;
const pick = ({ a, b }: Wide) => ({ a, b });
`,
      errors: [{ messageId: 'preferSpread' }],
      output: `
type Wide = { a: string; b: string } & Extra;
const pick = (props: Wide) => ({ ...props });
`,
    },

    // Regression (#1642): a mapped type's members are computed from a key set.
    {
      code: `
type Wide = { [K in Keys]: string };
const pick = ({ a, b }: Wide) => ({ a, b });
`,
      errors: [{ messageId: 'preferSpread' }],
      output: `
type Wide = { [K in Keys]: string };
const pick = (props: Wide) => ({ ...props });
`,
    },

    // Regression (#1642): a conditional type resolves to a member list only
    // once the checker runs.
    {
      code: `
type Wide = Source extends object ? Source : never;
const pick = ({ a, b }: Wide) => ({ a, b });
`,
      errors: [{ messageId: 'preferSpread' }],
      output: `
type Wide = Source extends object ? Source : never;
const pick = (props: Wide) => ({ ...props });
`,
    },

    // Regression (#1642): an index signature admits members that are never
    // written down, so the list cannot be enumerated.
    {
      code: `
type Wide = { a: string; b: string; [key: string]: string };
const pick = ({ a, b }: Wide) => ({ a, b });
`,
      errors: [{ messageId: 'preferSpread' }],
      output: `
type Wide = { a: string; b: string; [key: string]: string };
const pick = (props: Wide) => ({ ...props });
`,
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
      errors: [{ messageId: 'preferSpread' }],
      output: `
interface Wide extends Base {
  a: string;
  b: string;
  c: string;
}
const pick = (props: Wide) => ({ ...props });
`,
    },

    // Regression (#1642): a generic instantiation's members depend on the type
    // argument.
    {
      code: `
type Wide<T> = { a: string; b: string; c: T };
const pick = ({ a, b }: Wide<string>) => ({ a, b });
`,
      errors: [{ messageId: 'preferSpread' }],
      output: `
type Wide<T> = { a: string; b: string; c: T };
const pick = (props: Wide<string>) => ({ ...props });
`,
    },

    // Regression (#1642): a member expression receiver — the property's type
    // lives in the type of its object, which syntax alone does not supply.
    {
      code: `
type Unit = { a: string; b: string; c: string };
const build = (state) => state.units.map(({ a, b }) => ({ a, b }));
`,
      errors: [{ messageId: 'preferSpread' }],
      output: `
type Unit = { a: string; b: string; c: string };
const build = (state) => state.units.map((props) => ({ ...props }));
`,
    },

    // Regression (#1642): an unannotated reassignable receiver can hold
    // anything by the time the callback runs.
    {
      code: `
type Unit = { a: string; b: string; c: string };
let units = [];
const build = () => units.map(({ a, b }) => ({ a, b }));
`,
      errors: [{ messageId: 'preferSpread' }],
      output: `
type Unit = { a: string; b: string; c: string };
let units = [];
const build = () => units.map((props) => ({ ...props }));
`,
    },

    // Regression (#1642): an inferred return type is not written down.
    {
      code: `
type Unit = { a: string; b: string; c: string };
const loadUnits = () => [];
const build = () => loadUnits().map(({ a, b }) => ({ a, b }));
`,
      errors: [{ messageId: 'preferSpread' }],
      output: `
type Unit = { a: string; b: string; c: string };
const loadUnits = () => [];
const build = () => loadUnits().map((props) => ({ ...props }));
`,
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
      errors: [{ messageId: 'preferSpread' }],
      output: `
type Unit = { a: string; b: string; c: string };
const build = (units: Unit[]) => wrap((props) => ({ ...props }));
`,
    },

    // Regression (#1642): a self-referential alias terminates without proving
    // anything.
    {
      code: `
type Wide = Wide;
const pick = ({ a, b }: Wide) => ({ a, b });
`,
      errors: [{ messageId: 'preferSpread' }],
      output: `
type Wide = Wide;
const pick = (props: Wide) => ({ ...props });
`,
    },

    // Regression (#1642): only top-level declarations are resolved, so a type
    // declared inside a function body proves nothing.
    {
      code: `
const build = () => {
  type Wide = { a: string; b: string; c: string };
  const pick = ({ a, b }: Wide) => ({ a, b });
  return pick;
};
`,
      errors: [{ messageId: 'preferSpread' }],
      output: `
const build = () => {
  type Wide = { a: string; b: string; c: string };
  const pick = (props: Wide) => ({ ...props });
  return pick;
};
`,
    },

    // Regression (#1642): a pick naming a member the source type does not
    // declare proves no subset relation, so today's behavior stands.
    {
      code: `
type Wide = { a: string; c: string; d: string };
const pick = ({ a, b }: Wide) => ({ a, b });
`,
      errors: [{ messageId: 'preferSpread' }],
      output: `
type Wide = { a: string; c: string; d: string };
const pick = (props: Wide) => ({ ...props });
`,
    },

    // Regression (#1642): the callback is not the first argument, so the
    // element type belongs to some other parameter.
    {
      code: `
type Unit = { a: string; b: string; c: string };
const build = (units: Unit[]) => units.map(identity, ({ a, b }) => ({ a, b }));
`,
      errors: [{ messageId: 'preferSpread' }],
      output: `
type Unit = { a: string; b: string; c: string };
const build = (units: Unit[]) => units.map(identity, (props) => ({ ...props }));
`,
    },
  ],
});
