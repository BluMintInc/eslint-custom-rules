import { Linter, Rule } from 'eslint';
import { ruleTesterJsx } from '../utils/ruleTester';
import { noRenderFunctionComponents } from '../rules/no-render-function-components';

ruleTesterJsx.run('no-render-function-components', noRenderFunctionComponents, {
  valid: [
    // 1. Passed by reference into a `renderCell` object-property slot; the
    // function itself is not exported, so it stays valid.
    {
      filename: 'placementColumn.tsx',
      code: `
        const renderPlacementRankCell = ({ row }) => <PlacementRankCell hit={row} />;
        export const PLACEMENT_COLUMN = {
          field: 'placement',
          renderCell: renderPlacementRankCell,
        };
        `,
    },
    // 2. Passed into a JSX `renderCell` slot.
    {
      filename: 'grid.tsx',
      code: `
        const renderCell = ({ row }) => <span>{row.id}</span>;
        const Grid = () => <DataGrid renderCell={renderCell} />;
        `,
    },
    // 3. Slot name (renderValue) differs from the function name (renderTags);
    // the exemption anchors on the consumption site, not the function name.
    {
      filename: 'select.tsx',
      code: `
        const renderTags = (selected) => <Chip label={selected.join(', ')} />;
        const S = () => <Select renderValue={renderTags} />;
        `,
    },
    // 4. Returns a string, not JSX.
    {
      filename: 'buildStreamAlertEvent.ts',
      code: `
        const renderAlertCopy = (e) => e.actor + ' ' + e.verb + ' ' + e.target;
        export const build = (e) => ({ copy: renderAlertCopy(e) });
        `,
    },
    // 5. `render` with no trailing uppercase letter.
    {
      filename: 'x.tsx',
      code: `
        const render = () => <div />;
        const X = () => <div>{render()}</div>;
        `,
    },
    // 6. PascalCase component consumed as JSX (require-memo's domain).
    {
      filename: 'card.tsx',
      code: `
        const RenderCard = ({ x }) => <Card>{x}</Card>;
        const P = () => <RenderCard x={1} />;
        `,
    },
    // 7. Already converted to a real component.
    {
      filename: 'OverlayAlertPopup.tsx',
      code: `
        const P = ({ segments }) => <AlertCopySegments segments={segments} />;
        `,
    },
    // useRender* hook — no-jsx-in-hooks' domain, not this rule's.
    {
      filename: 'useRenderRow.tsx',
      code: `
        const useRenderRow = (row) => <Row {...row} />;
        const P = ({ rows }) => <div>{rows.map((r) => useRenderRow(r))}</div>;
        `,
    },
    // `renderer` — lowercase continuation, not render[A-Z].
    {
      filename: 'renderer.tsx',
      code: `
        const renderer = () => <div />;
        const P = () => <div>{renderer()}</div>;
        `,
    },
    // `rendered` — lowercase continuation, not render[A-Z].
    {
      filename: 'rendered.tsx',
      code: `
        const rendered = () => <div />;
        const P = () => <div>{rendered()}</div>;
        `,
    },
    // Returns an object literal, not JSX.
    {
      filename: 'renderConfig.ts',
      code: `
        const renderConfig = (item) => ({ id: item.id, label: item.label });
        export const build = (item) => renderConfig(item);
        `,
    },
    // Returns null only — no JSX path.
    {
      filename: 'renderMaybe.tsx',
      code: `
        const renderNothing = () => null;
        const P = () => <div>{renderNothing()}</div>;
        `,
    },
    // Returns an array of KeyedNode-like objects, not JSX.
    {
      filename: 'renderKeyedNodes.tsx',
      code: `
        const renderKeyedNodes = (items) => items.map((item) => ({ key: item.id, Node: item.node }));
        export const build = (items) => renderKeyedNodes(items);
        `,
    },
    // Declared but never consumed and never exported.
    {
      filename: 'unused.tsx',
      code: `
        const renderUnused = (x) => <div>{x}</div>;
        const P = () => <div>content</div>;
        `,
    },
    // Multiple render-prop slots on one element.
    {
      filename: 'autocomplete.tsx',
      code: `
        const renderInput = (params) => <TextField {...params} />;
        const renderOption = (props, option) => <li {...props}>{option.label}</li>;
        const A = () => <Autocomplete renderInput={renderInput} renderOption={renderOption} />;
        `,
    },
    // Algolia-style `render` object-property slot, exported and wired.
    {
      filename: 'hitWidget.tsx',
      code: `
        export const renderHit = (item) => <Hit item={item} />;
        export const widget = { render: renderHit };
        `,
    },
    // Column-def file: several exported render* adapters, all wired to
    // renderCell/renderHeader slots (Edge Case 9 scale).
    {
      filename: 'columns.tsx',
      code: `
        export const renderNameCell = ({ row }) => <span>{row.name}</span>;
        export const renderStatusCell = ({ row }) => <Chip label={row.status} />;
        export const renderNameHeader = () => <strong>Name</strong>;
        export const COLUMNS = [
          { field: 'name', renderCell: renderNameCell, renderHeader: renderNameHeader },
          { field: 'status', renderCell: renderStatusCell },
        ];
        `,
    },
    // allowNames regex suppresses the flag.
    {
      filename: 'allowed.tsx',
      code: `
        const renderMember = (member) => <UsernameAvatar id={member.id} />;
        const T = ({ members }) => <Stack>{members.map(renderMember)}</Stack>;
        `,
      options: [{ allowNames: ['^renderMember$'] }],
    },
    // custom renderPropNames adds a new exempt slot for an exported function.
    {
      filename: 'customSlot.tsx',
      code: `
        export const renderThing = (x) => <Foo value={x} />;
        export const config = { customSlot: renderThing };
        `,
      options: [{ renderPropNames: ['customSlot'] }],
    },
    // FunctionDeclaration form wired to a slot — not consumed as plain fn.
    {
      filename: 'fnDeclSlot.tsx',
      code: `
        function renderCell({ row }) {
          return <span>{row.id}</span>;
        }
        const Grid = () => <DataGrid renderCell={renderCell} />;
        `,
    },
  ],
  invalid: [
    // 1. Direct call inside a .map arrow.
    {
      filename: 'TeamMembersDisplay.tsx',
      code: `
        const renderMember = (member) => <UsernameAvatar id={member.id} />;
        const T = ({ members }) => <Stack>{members.map((m) => renderMember(m))}</Stack>;
        `,
      errors: [{ messageId: 'renderFunctionComponent' }],
    },
    // 2. By-reference pass into .map.
    {
      filename: 'NumberedStepsPanel.tsx',
      code: `
        const renderStep = ({ title }, index) => <li key={title}>{index}. {title}</li>;
        const P = ({ steps }) => <ol>{steps.map(renderStep)}</ol>;
        `,
      errors: [{ messageId: 'renderFunctionComponent' }],
    },
    // 3. By-reference pass into .map.
    {
      filename: 'CreateTokenTooltip.tsx',
      code: `
        const renderBlockerItem = (item) => <ListItem key={item}>{item}</ListItem>;
        const P = ({ items }) => <List>{items.map(renderBlockerItem)}</List>;
        `,
      errors: [{ messageId: 'renderFunctionComponent' }],
    },
    // 4. Direct call in render body.
    {
      filename: 'TwitchChatPreview.tsx',
      code: `
        const renderWithStyledLink = (copy, link) => <>{copy}<Box>{link}</Box></>;
        const P = ({ copy, link }) => <Typography>{renderWithStyledLink(copy, link)}</Typography>;
        `,
      errors: [{ messageId: 'renderFunctionComponent' }],
    },
    // 5. FunctionDeclaration form with conditional JSX returns, called directly.
    {
      filename: 'ChannelChoiceRow.tsx',
      code: `
        function renderLeading(icon, children) {
          if (children) return <Box>{children}</Box>;
          if (icon) return <Box>{icon}</Box>;
          return null;
        }
        const R = ({ icon, children }) => <li>{renderLeading(icon, children)}</li>;
        `,
      errors: [{ messageId: 'renderFunctionComponent' }],
    },
    // 6. Mixed: render-prop slot AND a direct call — the plain call is the violation.
    {
      filename: 'mixed.tsx',
      code: `
        const renderCellAdapter = ({ row }) => <Cell id={row.id} />;
        const col = { renderCell: renderCellAdapter };
        const Preview = ({ row }) => <div>{renderCellAdapter({ row })}</div>;
        `,
      errors: [{ messageId: 'renderFunctionComponent' }],
    },
    // 7. Exported render* function not wired to any slot.
    {
      filename: 'renderCohortMenuItem.tsx',
      code: `
        export const renderCohortMenuItem = (cohort) => <MenuItem>{cohort.name}</MenuItem>;
        `,
      errors: [{ messageId: 'renderFunctionComponent' }],
    },
    // 8. Nested in a component, invoked directly.
    {
      filename: 'panel.tsx',
      code: `
        const Panel = ({ rows }) => {
          const renderRow = (row) => <Row {...row} />;
          return <div>{rows.map((r) => renderRow(r))}</div>;
        };
        `,
      errors: [{ messageId: 'renderFunctionComponent' }],
    },
    // By-reference pass into .flatMap.
    {
      filename: 'flatMap.tsx',
      code: `
        const renderGroupItem = (item) => <Item key={item.id}>{item.label}</Item>;
        const P = ({ groups }) => <div>{groups.flatMap(renderGroupItem)}</div>;
        `,
      errors: [{ messageId: 'renderFunctionComponent' }],
    },
    // By-reference pass into .forEach.
    {
      filename: 'forEach.tsx',
      code: `
        const renderTile = (tile) => <Tile key={tile.id} />;
        const P = ({ tiles }) => {
          const out = [];
          tiles.forEach(renderTile);
          return <div>{out}</div>;
        };
        `,
      errors: [{ messageId: 'renderFunctionComponent' }],
    },
    // By-reference pass into .reduce.
    {
      filename: 'reduce.tsx',
      code: `
        const renderAccumulated = (acc, item) => <>{acc}<Row key={item.id} /></>;
        const P = ({ items }) => <div>{items.reduce(renderAccumulated, null)}</div>;
        `,
      errors: [{ messageId: 'renderFunctionComponent' }],
    },
    // By-reference pass into .filter.
    {
      filename: 'filter.tsx',
      code: `
        const renderVisible = (item) => <Badge visible={item.visible} />;
        const P = ({ items }) => <div>{items.filter(renderVisible)}</div>;
        `,
      errors: [{ messageId: 'renderFunctionComponent' }],
    },
    // Direct call to a FunctionExpression form assigned to a const.
    {
      filename: 'fnExpr.tsx',
      code: `
        const renderRow = function (row) {
          return <Row {...row} />;
        };
        const P = ({ rows }) => <div>{rows.map((r) => renderRow(r))}</div>;
        `,
      errors: [{ messageId: 'renderFunctionComponent' }],
    },
    // FunctionDeclaration passed by reference into .map.
    {
      filename: 'fnDeclMap.tsx',
      code: `
        function renderEntry(entry) {
          return <Entry key={entry.id} data={entry} />;
        }
        const P = ({ entries }) => <ul>{entries.map(renderEntry)}</ul>;
        `,
      errors: [{ messageId: 'renderFunctionComponent' }],
    },
    // Exported render* wired to a NON-listed slot is still flagged (the slot
    // name is not in renderPropNames), demonstrating the export smell.
    {
      filename: 'exportedUnlisted.tsx',
      code: `
        export const renderWidget = (x) => <Widget value={x} />;
        export const config = { customSlot: renderWidget };
        `,
      errors: [{ messageId: 'renderFunctionComponent' }],
    },
    // Block-body arrow with a JSX return, invoked directly.
    {
      filename: 'blockArrow.tsx',
      code: `
        const renderHeaderRow = (title) => {
          const label = title.toUpperCase();
          return <th>{label}</th>;
        };
        const P = ({ title }) => <thead><tr>{renderHeaderRow(title)}</tr></thead>;
        `,
      errors: [{ messageId: 'renderFunctionComponent' }],
    },
    // Conditional (ternary) JSX return, invoked directly.
    {
      filename: 'ternary.tsx',
      code: `
        const renderStatus = (ok) => ok ? <Ok /> : <Bad />;
        const P = ({ ok }) => <div>{renderStatus(ok)}</div>;
        `,
      errors: [{ messageId: 'renderFunctionComponent' }],
    },
  ],
});

// Issue #1536: `allowNames` entries are compiled with `new RegExp` inside
// `create()`, so a malformed source string used to escape as an opaque
// `Error while loading rule …` that aborts the whole lint run. RuleTester cannot
// express this — the throw happens at rule-load time, before a fixture is
// linted — so these cases drive the real `Linter`.
describe('no-render-function-components: allowNames validation (issue #1536)', () => {
  const RULE_ID = '@blumintinc/blumint/no-render-function-components';

  const lint = (code: string, options?: Record<string, unknown>) => {
    const linter = new Linter();
    linter.defineParser(
      '@typescript-eslint/parser',
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@typescript-eslint/parser'),
    );
    linter.defineRule(
      RULE_ID,
      noRenderFunctionComponents as unknown as Rule.RuleModule,
    );
    return linter.verify(
      code,
      {
        parser: '@typescript-eslint/parser',
        parserOptions: {
          ecmaVersion: 2020 as const,
          sourceType: 'module' as const,
          ecmaFeatures: { jsx: true },
        },
        rules: {
          [RULE_ID]: options ? ['error' as const, options] : ('error' as const),
        },
      },
      'Component.tsx',
    );
  };

  // A `render*` function passed by reference into `.map` — flagged unless its
  // name is exempted by `allowNames`.
  const LEGACY_ROW_SOURCE = `
const renderLegacyRow = (row) => <Row {...row} />;
const Panel = ({ rows }) => <div>{rows.map(renderLegacyRow)}</div>;
`;

  it('reports the offending value for a glob mistaken for a regex', () => {
    expect(() => lint(LEGACY_ROW_SOURCE, { allowNames: ['*Legacy'] })).toThrow(
      /invalid allowNames/i,
    );
    expect(() => lint(LEGACY_ROW_SOURCE, { allowNames: ['*Legacy'] })).toThrow(
      /\*Legacy/,
    );
  });

  it('names the rule and the underlying regex reason', () => {
    expect(() => lint(LEGACY_ROW_SOURCE, { allowNames: ['*Legacy'] })).toThrow(
      /no-render-function-components: invalid allowNames: \*Legacy \(.*Nothing to repeat.*\)/,
    );
  });

  it.each([['*Legacy'], ['['], ['(foo'], ['C++']])(
    'throws an actionable error for the malformed pattern %j',
    (pattern) => {
      let thrown: unknown;
      try {
        lint(LEGACY_ROW_SOURCE, { allowNames: [pattern] });
      } catch (error: unknown) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(Error);
      const message = (thrown as Error).message;
      expect(message).toMatch(/invalid allowNames/i);
      expect(message).toContain(pattern);
    },
  );

  it('reports every malformed pattern in a single error, not just the first', () => {
    let thrown: unknown;
    try {
      lint(LEGACY_ROW_SOURCE, {
        allowNames: ['*Legacy', '^renderLegacy', '(foo', 'C++'],
      });
    } catch (error: unknown) {
      thrown = error;
    }
    const message = (thrown as Error).message;
    expect(message).toContain('*Legacy');
    expect(message).toContain('(foo');
    expect(message).toContain('C++');
    // The well-formed neighbour is not accused.
    expect(message).not.toContain('^renderLegacy');
  });

  it('keeps compiling well-formed patterns and exempting the names they match', () => {
    // Falsifiability: the same source is reported when the pattern is absent,
    // so a fix that dropped `allowNames` entirely would fail here.
    expect(lint(LEGACY_ROW_SOURCE)).toHaveLength(1);
    expect(
      lint(LEGACY_ROW_SOURCE, { allowNames: ['^renderLegacy'] }),
    ).toHaveLength(0);
    // A well-formed pattern that does NOT match still leaves the report intact.
    expect(
      lint(LEGACY_ROW_SOURCE, { allowNames: ['^renderModern'] }),
    ).toHaveLength(1);
  });

  it('accepts an empty or absent allowNames list', () => {
    expect(() => lint(LEGACY_ROW_SOURCE, { allowNames: [] })).not.toThrow();
    expect(() => lint(LEGACY_ROW_SOURCE, {})).not.toThrow();
    expect(() => lint(LEGACY_ROW_SOURCE)).not.toThrow();
    // `allowNames` has no built-in defaults, so an absent list and an explicit
    // empty list are equivalent: neither exempts anything.
    expect(lint(LEGACY_ROW_SOURCE, { allowNames: [] })).toHaveLength(1);
    expect(lint(LEGACY_ROW_SOURCE, {})).toHaveLength(1);
    expect(lint(LEGACY_ROW_SOURCE)).toHaveLength(1);
  });
});
