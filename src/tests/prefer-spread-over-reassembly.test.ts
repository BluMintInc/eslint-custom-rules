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
  ],

  invalid: [
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
    // plus one extra non-destructured prop (ContentCard) kept explicit.
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
      <UserVerticalCarousel {...props} ContentCard={UserCardAddWithMaxMembers} />
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
      <FriendVerticalCarousel {...props} noFriends={<NoContent isSelf variant="friends" />} RenderFriendHit={FriendCard} />
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
  ],
});
