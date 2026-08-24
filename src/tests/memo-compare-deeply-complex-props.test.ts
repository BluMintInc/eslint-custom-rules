import path from 'path';
import { ruleTesterJsx, withParserOptions } from '../utils/ruleTester';
import { memoCompareDeeplyComplexProps } from '../rules/memo-compare-deeply-complex-props';

const callSignatureMissingFile = 'src/components/CallSignatureMissing.tsx';

/**
 * A real on-disk stub, so cases using it land in the tsconfig PROJECT program
 * rather than the single-file default program. Only the project program loads
 * `src/tests/fixtures/lib-props.d.ts`, which is what makes the library-declared
 * props of bug #2037 resolve at all.
 */
const libraryPropsFile = 'src/tests/fixtures/memo-component.tsx';

jest.mock('typescript', () => {
  const actual = jest.requireActual<typeof import('typescript')>('typescript');
  const originalCreateProgram = actual.createProgram;

  return {
    ...actual,
    createProgram(...args: Parameters<typeof originalCreateProgram>) {
      const program = originalCreateProgram(...args);
      const checker = program.getTypeChecker();
      const originalGetTypeAtLocation = checker.getTypeAtLocation.bind(checker);

      // Simulate a type without getCallSignatures to ensure the rule handles it safely.
      checker.getTypeAtLocation = ((node: import('typescript').Node) => {
        const type = originalGetTypeAtLocation(node);
        if (node.getSourceFile().fileName.includes(callSignatureMissingFile)) {
          const clonedType = Object.assign(
            Object.create(Object.getPrototypeOf(type)),
            type,
          );
          delete (clonedType as { getCallSignatures?: unknown })
            .getCallSignatures;
          return clonedType as import('typescript').Type;
        }
        return type;
      }) as typeof checker.getTypeAtLocation;

      return program;
    },
  };
});

// This rule is type-aware, so the cases carry the full typed-program parser
// configuration the shared JSX tester does not declare.
const parserOptions = {
  ecmaVersion: 2018,
  sourceType: 'module',
  project: './tsconfig.json',
  tsconfigRootDir: path.join(__dirname, '..', '..'),
  createDefaultProgram: true,
} as const;

ruleTesterJsx.run(
  'memo-compare-deeply-complex-props',
  memoCompareDeeplyComplexProps,
  {
    valid: withParserOptions(parserOptions, [
      {
        filename: 'src/components/Primitives.tsx',
        code: `
import { memo } from 'react';
type Props = { userId: string; count: number; active: boolean; onClick: () => void };
const Comp = ({ userId, count, active, onClick }: Props) => (
  <button onClick={onClick}>{userId}{count}{active ? 'yes' : 'no'}</button>
);
export const Wrapped = memo(Comp);
`,
      },
      {
        filename: 'src/components/Comparator.tsx',
        code: `
import { memo } from 'react';
type Settings = { theme: string };
const Comp = ({ settings }: { settings: Settings }) => <div>{settings.theme}</div>;
export const Wrapped = memo(
  Comp,
  (prev, next) => prev.settings.theme === next.settings.theme,
);
`,
      },
      {
        filename: 'src/components/CompareDeeply.tsx',
        code: `
import { memo, compareDeeply } from 'src/util/memo';
type Props = { settings: { theme: string } };
const Comp = ({ settings }: Props) => <div>{settings.theme}</div>;
export const Wrapped = memo(Comp, compareDeeply('settings'));
`,
      },
      {
        filename: 'src/components/NoProps.tsx',
        code: `
import { memo } from 'react';
const Comp = () => <div>Hello</div>;
export const Wrapped = memo(Comp);
`,
      },
      {
        filename: 'src/components/UnionPrimitive.tsx',
        code: `
import { memo } from 'react';
type Props = { id: string | number };
const Comp = ({ id }: Props) => <div>{id}</div>;
export const Wrapped = memo(Comp);
`,
      },
      {
        filename: 'src/components/Children.tsx',
        code: `
import React, { memo } from 'react';
type Props = { children: React.ReactNode };
const Comp = ({ children }: Props) => <section>{children}</section>;
export const Wrapped = memo(Comp);
`,
      },
      {
        filename: 'src/components/ArrayWithComparator.tsx',
        code: `
import { memo } from 'react';
type Props = { items: string[] };
const Comp = ({ items }: Props) => <div>{items.join(',')}</div>;
const eq = (a: Props, b: Props) => a.items.length === b.items.length;
export const Wrapped = memo(Comp, eq);
`,
      },
      {
        filename: 'src/components/AnyProp.tsx',
        code: `
import { memo } from 'react';
type Props = { config: any };
const Comp = ({ config }: Props) => <div>{String(config)}</div>;
export const Wrapped = memo(Comp);
`,
      },
      {
        filename: 'src/components/ReactNamespaceComparator.tsx',
        code: `
import React from 'react';
type Props = { settings: { theme: string } };
const Comp = ({ settings }: Props) => <div>{settings.theme}</div>;
export const Wrapped = React.memo(Comp, () => true);
`,
      },
      {
        filename: 'src/components/ShadowedUndefinedComparator.tsx',
        code: `
import { memo } from 'react';
const undefined = (prev: unknown, next: unknown) => prev === next;
type Props = { config: { theme: string } };
const Comp = ({ config }: Props) => <div>{config.theme}</div>;
export const Wrapped = memo(Comp, undefined);
`,
      },
      {
        filename: 'src/components/CustomMemoCompareDeeply.tsx',
        code: `
import { memo as customMemo, compareDeeply } from 'src/util/memo';
type Props = { profile: { name: string } };
const Comp = ({ profile }: Props) => <div>{profile.name}</div>;
export const Wrapped = customMemo(Comp, compareDeeply('profile'));
`,
      },
      {
        filename: 'src/components/ArrowNoProps.tsx',
        code: `
import { memo } from 'react';
export const Wrapped = memo(() => <div>hi</div>);
`,
      },
      {
        filename: 'src/components/ExternalMemo.tsx',
        code: `
declare module 'some-other-lib' {
  export function memo<T>(component: T, comparator?: (a: T, b: T) => boolean): T;
}
import { memo } from 'some-other-lib';
type Props = { config: { theme: string } };
const Comp = ({ config }: Props) => <div>{config.theme}</div>;
export const Wrapped = memo(Comp);
`,
      },
      {
        filename: 'src/components/SxStyleOnly.tsx',
        code: `
import { memo } from 'src/util/memo';

type MyComponentProps = {
  name: string;
  sx?: { color: string };
  style?: { margin: number };
  containerSx?: { padding: number };
  wrapperStyle?: { border: string };
};

export const MyComponent = memo(({ name, sx, style, containerSx, wrapperStyle }: MyComponentProps) => {
  return <div style={style}>{name}</div>;
});
`,
      },
      // Bug #1179: React render types (ReactNode, ReactElement, ComponentType, FC, render-prop
      // function types) must NOT be flagged as complex props.
      {
        filename: 'src/components/ReactNodeProp.tsx',
        code: `
import React, { memo } from 'react';
type Props = { icon: React.ReactNode; label: string };
const Comp = ({ icon, label }: Props) => <div>{icon}{label}</div>;
export const Wrapped = memo(Comp);
`,
      },
      {
        filename: 'src/components/ReactElementProp.tsx',
        code: `
import React, { memo } from 'react';
type Props = { header: React.ReactElement; title: string };
const Comp = ({ header, title }: Props) => <div>{header}<h1>{title}</h1></div>;
export const Wrapped = memo(Comp);
`,
      },
      {
        filename: 'src/components/ReactComponentTypeProp.tsx',
        code: `
import React, { memo } from 'react';
type Props = { Avatar: React.ComponentType; name: string };
const Comp = ({ Avatar, name }: Props) => <div><Avatar />{name}</div>;
export const Wrapped = memo(Comp);
`,
      },
      {
        filename: 'src/components/ReactFCProp.tsx',
        code: `
import React, { memo } from 'react';
type Props = { Preview: React.FC<{ id: string }>; count: number };
const Comp = ({ Preview, count }: Props) => <div><Preview id="x" />{count}</div>;
export const Wrapped = memo(Comp);
`,
      },
      {
        filename: 'src/components/MixedReactAndData.tsx',
        code: `
import React, { memo } from 'react';

// Reproduces issue #1179: Avatar/Preview (render types) mixed with data objects.
// Only the data objects should be flagged — Avatar and Preview must be excluded.
type ChannelProps = {
  Avatar: React.ComponentType;
  Preview: React.FC<{ id: string }>;
  activeChannel: { id: string; name: string };
  watchers: { userId: string }[];
};

const ChannelPreview = ({ Avatar, Preview, activeChannel, watchers }: ChannelProps) => (
  <div>{activeChannel.name}</div>
);

import { compareDeeply } from 'src/util/memo';
export const Wrapped = memo(ChannelPreview, compareDeeply('activeChannel', 'watchers'));
`,
      },
      {
        filename: 'src/components/ReactNodeUnionNullable.tsx',
        code: `
import React, { memo } from 'react';
// ReactNode already includes null/undefined; a nullable variant must also be excluded.
type Props = { icon: React.ReactNode | null; label: string };
const Comp = ({ icon, label }: Props) => <div>{icon}{label}</div>;
export const Wrapped = memo(Comp);
`,
      },
      {
        filename: 'src/components/MemoExoticProp.tsx',
        code: `
import React, { memo } from 'react';
type Props = {
  Inner: React.MemoExoticComponent<React.FC<{ id: string }>>;
  title: string;
};
const Comp = ({ Inner, title }: Props) => <div><Inner id="x" />{title}</div>;
export const Wrapped = memo(Comp);
`,
      },
      {
        filename: 'src/components/ForwardRefExoticProp.tsx',
        code: `
import React, { memo } from 'react';
type Props = {
  Inner: React.ForwardRefExoticComponent<{ id: string }>;
  title: string;
};
const Comp = ({ Inner, title }: Props) => <div><Inner id="x" />{title}</div>;
export const Wrapped = memo(Comp);
`,
      },
      {
        filename: 'src/components/RenderPropFunction.tsx',
        code: `
import React, { memo } from 'react';
// A render-prop typed as a function returning ReactNode is a stable reference — not complex.
type Props = {
  renderHeader: (props: { title: string }) => React.ReactNode;
  count: number;
};
const Comp = ({ renderHeader, count }: Props) => (
  <div>{renderHeader({ title: 'hi' })}{count}</div>
);
export const Wrapped = memo(Comp);
`,
      },
      {
        filename: 'src/components/JSXElementProp.tsx',
        code: `
import React, { memo } from 'react';
type Props = { node: JSX.Element; label: string };
const Comp = ({ node, label }: Props) => <div>{node}{label}</div>;
export const Wrapped = memo(Comp);
`,
      },
      // Bug #1224 regression: a props type carrying React's reserved `ref` slot
      // (object-typed, exactly as RefAttributes<T> = { ref?: { current: T } }
      // injects into a resolved forwardRef signature) must NOT be flagged. React
      // strips `ref` before the memo equality fn runs, so compareDeeply('ref')
      // would be dead code. Skipped the same way `children` is.
      {
        filename: 'src/components/RefSlotOnly.tsx',
        code: `
import { memo } from 'react';
type Props = { ref?: { current: HTMLButtonElement | null }; onClick?: () => void };
const Comp = ({ onClick }: Props) => <button onClick={onClick} />;
export const Wrapped = memo(Comp);
`,
      },
      // `key` is likewise a reserved React slot that never reaches the props
      // object; an object-typed `key` member must also be skipped.
      {
        filename: 'src/components/KeySlotOnly.tsx',
        code: `
import { memo } from 'react';
type Props = { key?: { id: string }; label: string };
const Comp = ({ label }: Props) => <span>{label}</span>;
export const Wrapped = memo(Comp);
`,
      },
      // The reserved-slot exclusion must also apply on the component-signature
      // analysis path (the fallback path the bug report traces through): a value
      // typed as a render function whose first param carries a synthetic `ref`
      // object member resolves via getCallSignatures, not the function-param
      // path. Only genuine data props — none here — would be flagged.
      {
        filename: 'src/components/RefSlotViaSignature.tsx',
        code: `
import { memo } from 'react';
type Props = { ref?: { current: HTMLDivElement | null }; title: string };
declare const Comp: (props: Props) => JSX.Element;
export const Wrapped = memo(Comp);
`,
      },
      // Bug #1327: DOM-element props (MUI Popper/Popover `anchorEl`, containers,
      // etc.) are stable references, not recreated literals, and deep-comparing
      // them walks React's circular fiber back-references. They must NOT be
      // flagged as complex props — mirroring the ReactElement carve-out.
      {
        filename: 'src/components/DomAnchorElProp.tsx',
        code: `
import { memo } from 'src/util/memo';
type Props = { anchorEl: HTMLElement | null; open: boolean };
const Comp = ({ anchorEl, open }: Props) => (
  <div>{open && anchorEl ? 'open' : 'closed'}</div>
);
export const Wrapped = memo(Comp);
`,
      },
      {
        filename: 'src/components/DomElementNonNull.tsx',
        code: `
import { memo } from 'react';
type Props = { container: HTMLElement; label: string };
const Comp = ({ container, label }: Props) => <div>{label}</div>;
export const Wrapped = memo(Comp);
`,
      },
      {
        filename: 'src/components/DomSubclassProp.tsx',
        code: `
import { memo } from 'react';
type Props = { target: HTMLDivElement | null; count: number };
const Comp = ({ target, count }: Props) => <div>{count}</div>;
export const Wrapped = memo(Comp);
`,
      },
      {
        filename: 'src/components/DomElementBaseProp.tsx',
        code: `
import { memo } from 'react';
type Props = { root: Element | null; node: Node | null; id: string };
const Comp = ({ root, node, id }: Props) => <div>{id}</div>;
export const Wrapped = memo(Comp);
`,
      },
      // Bug #1656: the open-ended literal union idiom — a primitive intersected
      // with an object type (`'alert' | 'button' | (string & {})`) — is a
      // PRIMITIVE at runtime. The `& {}` only defeats TypeScript's literal-union
      // widening so editors keep offering autocomplete on the named members. The
      // cases below start from the characterization table in the report: the
      // plain-primitive rows already passed, and are pinned here so the carve-out
      // cannot regress them.
      {
        filename: 'src/components/PlainStringProp.tsx',
        code: `
import { memo } from 'src/util/memo';
type Props = { kind?: string; label: string };
const Comp = ({ kind, label }: Props) => <div data-kind={kind}>{label}</div>;
export const Wrapped = memo(Comp);
`,
      },
      {
        filename: 'src/components/LiteralUnionProp.tsx',
        code: `
import { memo } from 'src/util/memo';
type Props = { kind?: 'alert' | 'button'; label: string };
const Comp = ({ kind, label }: Props) => <div data-kind={kind}>{label}</div>;
export const Wrapped = memo(Comp);
`,
      },
      {
        filename: 'src/components/LiteralUnionWidenedProp.tsx',
        code: `
import { memo } from 'src/util/memo';
// TypeScript collapses this to plain \`string\` before the rule sees it.
type Props = { kind?: 'alert' | 'button' | string; label: string };
const Comp = ({ kind, label }: Props) => <div data-kind={kind}>{label}</div>;
export const Wrapped = memo(Comp);
`,
      },
      {
        filename: 'src/components/StringAliasProp.tsx',
        code: `
import { memo } from 'src/util/memo';
type MyStringAlias = string;
type Props = { kind?: MyStringAlias; label: string };
const Comp = ({ kind, label }: Props) => <div data-kind={kind}>{label}</div>;
export const Wrapped = memo(Comp);
`,
      },
      {
        filename: 'src/components/OpenStringUnionProp.tsx',
        code: `
import { memo } from 'src/util/memo';
type Props = { kind?: 'alert' | 'button' | (string & {}); label: string };
const Comp = ({ kind, label }: Props) => <div data-kind={kind}>{label}</div>;
export const Wrapped = memo(Comp);
`,
      },
      // The bare intersection, standalone rather than a union constituent.
      {
        filename: 'src/components/BareStringIntersectionProp.tsx',
        code: `
import { memo } from 'src/util/memo';
type Props = { kind?: string & {}; label: string };
const Comp = ({ kind, label }: Props) => <div data-kind={kind}>{label}</div>;
export const Wrapped = memo(Comp);
`,
      },
      // The reduction keys on "any member is a runtime primitive", so every
      // primitive flavour of the idiom is covered, not just `string`.
      {
        filename: 'src/components/OpenNumberUnionProp.tsx',
        code: `
import { memo } from 'src/util/memo';
type Props = { size?: 1 | 2 | (number & {}); label: string };
const Comp = ({ size, label }: Props) => <div data-size={size}>{label}</div>;
export const Wrapped = memo(Comp);
`,
      },
      {
        filename: 'src/components/OpenBooleanIntersectionProp.tsx',
        code: `
import { memo } from 'src/util/memo';
type Props = { flag?: boolean & {}; label: string };
const Comp = ({ flag, label }: Props) => <div>{flag ? label : ''}</div>;
export const Wrapped = memo(Comp);
`,
      },
      {
        filename: 'src/components/OpenBigIntIntersectionProp.tsx',
        code: `
import { memo } from 'src/util/memo';
type Props = { total?: bigint & {}; label: string };
const Comp = ({ total, label }: Props) => <div>{String(total)}{label}</div>;
export const Wrapped = memo(Comp);
`,
      },
      {
        filename: 'src/components/OpenSymbolIntersectionProp.tsx',
        code: `
import { memo } from 'src/util/memo';
type Props = { token?: symbol & {}; label: string };
const Comp = ({ token, label }: Props) => <div>{String(token)}{label}</div>;
export const Wrapped = memo(Comp);
`,
      },
      // The widener is spelled several ways in the wild; keying on the primitive
      // member rather than on the object member being an empty literal covers
      // all of them.
      {
        filename: 'src/components/RecordWidenedUnionProp.tsx',
        code: `
import { memo } from 'src/util/memo';
type Props = { kind?: 'alert' | (string & Record<never, never>); label: string };
const Comp = ({ kind, label }: Props) => <div data-kind={kind}>{label}</div>;
export const Wrapped = memo(Comp);
`,
      },
      {
        filename: 'src/components/RecordNeverWidenedProp.tsx',
        code: `
import { memo } from 'src/util/memo';
// The \`Record<string, never>\` spelling carries an index signature rather than
// being structurally empty, so only the primitive member can carve it out.
type Props = { kind?: 'alert' | (string & Record<string, never>); label: string };
const Comp = ({ kind, label }: Props) => <div data-kind={kind}>{label}</div>;
export const Wrapped = memo(Comp);
`,
      },
      // The idiom as it actually reaches real code: React's `AriaRole`, inherited
      // by every component whose props extend HTML attributes. Declared locally
      // rather than imported from `react` because this repo has no @types/react —
      // an imported `AriaRole` resolves to `any` here, which exercises the
      // unrelated any-annotation path instead of the union classifier.
      {
        filename: 'src/components/AriaRoleProp.tsx',
        code: `
import { memo } from 'src/util/memo';
type AriaRole = 'alert' | 'alertdialog' | 'button' | 'dialog' | (string & {});
type Props = { role?: AriaRole; label: string };
const Comp = ({ role, label }: Props) => <div role={role}>{label}</div>;
export const Wrapped = memo(Comp);
`,
      },
      // The report's real-world shape: the props type reaches the component
      // through a `Readonly<...>` wrapper.
      {
        filename: 'src/components/AriaRoleReadonlyProp.tsx',
        code: `
import { memo } from 'src/util/memo';
type AriaRole = 'alert' | 'button' | (string & {});
const Comp = ({ role, label }: Readonly<{ role?: AriaRole; label: string }>) => (
  <div role={role}>{label}</div>
);
export const Wrapped = memo(Comp);
`,
      },
      // A union nesting the idiom several levels deep (TypeScript flattens the
      // constituents, so the intersection still arrives as a union member).
      {
        filename: 'src/components/NestedOpenUnionProp.tsx',
        code: `
import { memo } from 'src/util/memo';
type Inner = 'b' | (string & {});
type Outer = 'a' | Inner | null;
type Props = { kind?: Outer; label: string };
const Comp = ({ kind, label }: Props) => <div data-kind={kind}>{label}</div>;
export const Wrapped = memo(Comp);
`,
      },
      // An intersection of two primitives reduces to `never`, which the primitive
      // early-out already handles — pinned so the intersection branch is not the
      // thing keeping it quiet.
      {
        filename: 'src/components/PrimitiveIntersectionProp.tsx',
        code: `
import { memo } from 'src/util/memo';
type Props = { impossible?: string & number; label: string };
const Comp = ({ impossible, label }: Props) => <div>{String(impossible)}{label}</div>;
export const Wrapped = memo(Comp);
`,
      },
      // Bug #1656 decision: a BRANDED primitive (`string & { __brand: 'UserId' }`)
      // is exempt too. Its runtime value is a string — a branded type is a
      // compile-time phantom, never materialised — so `isEqual` on two of them
      // is `===`, and `blumintAreEqual` never even reaches the deep branch
      // because it is gated on `typeof value === 'object'`. Flagging it
      // prescribes provably dead code, which is what the rule's own "props that
      // are only primitives are not reported" contract rules out. This case was
      // previously pinned as `invalid`; that pin was the same intersection
      // blind spot #1656 reports, captured rather than intended.
      {
        filename: 'src/components/BrandedTypeProp.tsx',
        code: `
import { memo } from 'react';
type UserId = string & { readonly __brand: 'UserId' };
type Props = { userId: UserId };
const Comp = ({ userId }: Props) => <div>{userId}</div>;
export const Wrapped = memo(Comp);
`,
      },
      // Bug #2037: `getPropertiesOfType` returns INHERITED members, so a props
      // type that intersects a third-party interface surfaces that library's
      // whole surface. The author declares `title` only; `classes` and
      // `variantMapping` are declared in a `.d.ts` nobody here owns, so naming
      // them in `compareDeeply` is advice the author cannot act on.
      //
      // The `libraryPropsFile` filename is load-bearing. It names a file that
      // really exists under the tsconfig `include`, which is what puts the case
      // in the PROJECT program; an invented path falls back to a single-file
      // default program that never loads `lib-props.d.ts`, so `LibBaseProps`
      // resolves to an error type, contributes no members, and the case passes
      // vacuously whatever the rule does.
      {
        filename: libraryPropsFile,
        code: `
import { memo } from 'react';
import type { LibBaseProps } from 'fake-ui-lib';
type PanelProps = LibBaseProps & { title: string };
const PanelUnmemoized = ({ title }: PanelProps) => {
  return <div>{title}</div>;
};
export const Panel = memo(PanelUnmemoized);
`,
      },
      // The same carve-out through an `interface … extends` heritage clause
      // rather than an intersection: inheritance is the shape MUI components
      // actually use, and it reaches `getPropertiesOfType` by a different route.
      {
        filename: libraryPropsFile,
        code: `
import { memo } from 'react';
import type { LibBaseProps } from 'fake-ui-lib';
interface CardProps extends LibBaseProps {
  heading: string;
}
const CardUnmemoized = ({ heading }: CardProps) => <div>{heading}</div>;
export const Card = memo(CardUnmemoized);
`,
      },
      // `Pick` builds its members by mapping over the source type without an
      // `as` clause, so each synthesized symbol carries the ORIGINAL property's
      // declarations — which still point into the library `.d.ts`. Measured:
      // exempt. That is the intended reading: selecting a subset of a library's
      // props does not make the author the declarer of their shape.
      {
        filename: libraryPropsFile,
        code: `
import { memo } from 'react';
import type { LibBaseProps } from 'fake-ui-lib';
type Props = Pick<LibBaseProps, 'classes'>;
const Comp = ({ classes }: Props) => <div>{String(classes)}</div>;
export const Wrapped = memo(Comp);
`,
      },
      // Bug #2039: a LIBRARY's non-homomorphic mapped type (`SystemProps` here,
      // MUI's `SystemProps<Theme>` in the field) synthesizes members with ZERO
      // declarations, so the #2037 carve-out — which keys on every declaration
      // site being a dependency — let the library's ~100 style shorthands back
      // into the report. Case A is the shape the rule's own docs promise is
      // exempt: an interface the library owns extending its own mapped type.
      {
        filename: libraryPropsFile,
        code: `
import { memo } from 'react';
import type { LibTypographyProps } from 'fake-system-lib';
type Props = LibTypographyProps & { title: string };
const Comp = ({ title }: Props) => <div>{title}</div>;
export const Wrapped = memo(Comp);
`,
      },
      // B: the shape a real consumer writes — the library surface narrowed by
      // `Omit` and frozen by `Readonly`. Both wrappers re-synthesize the mapped
      // members, so the carrier search has to see through a lib alias to reach
      // the library type underneath.
      {
        filename: libraryPropsFile,
        code: `
import { memo } from 'react';
import type { LibTypographyProps } from 'fake-system-lib';
type Props = Readonly<Omit<LibTypographyProps, 'variant'> & { title: string }>;
const Comp = ({ title }: Props) => <div>{title}</div>;
export const Wrapped = memo(Comp);
`,
      },
      // C: intersecting the library's mapped type DIRECTLY, with no interface
      // in between — the members reach `getPropertiesOfType` without ever
      // passing through a declared heritage clause.
      {
        filename: libraryPropsFile,
        code: `
import { memo } from 'react';
import type { SystemProps } from 'fake-system-lib';
type Props = SystemProps & { title: string };
const Comp = ({ title }: Props) => <div>{title}</div>;
export const Wrapped = memo(Comp);
`,
      },
      // Bug #2099: an error instance has NO enumerable own properties, so a deep
      // comparison rates any two same-class errors equal whatever they report.
      // `compareDeeply('err')` would swallow the re-render that carries a fresh
      // failure — the shape the `/_error` page is built on, where the error
      // object's identity IS the signal. Exempt for the same reason DOM nodes
      // are (#1327): deep equality says nothing about a non-plain object.
      {
        filename: 'src/components/ErrorPageContent.tsx',
        code: `
import { memo } from 'src/util/memo';
type Props = { err: Error; statusCode: number };
const Comp = ({ err, statusCode }: Props) => (
  <div>{statusCode}{err.message}</div>
);
export const Wrapped = memo(Comp);
`,
      },
      // The spelling an error prop almost always has: nullable, because there is
      // no error until something fails.
      {
        filename: 'src/components/ErrorNullableProp.tsx',
        code: `
import { memo } from 'src/util/memo';
type Props = { err: Error | null; statusCode: number };
const Comp = ({ err, statusCode }: Props) => <div>{statusCode}</div>;
export const Wrapped = memo(Comp);
`,
      },
      {
        filename: 'src/components/ErrorOptionalProp.tsx',
        code: `
import { memo } from 'react';
type Props = { err?: Error; statusCode: number };
const Comp = ({ err, statusCode }: Props) => <div>{statusCode}</div>;
export const Wrapped = memo(Comp);
`,
      },
      {
        filename: 'src/components/ErrorNullUndefinedProp.tsx',
        code: `
import { memo } from 'react';
type Props = { err: Error | null | undefined; statusCode: number };
const Comp = ({ err, statusCode }: Props) => <div>{statusCode}</div>;
export const Wrapped = memo(Comp);
`,
      },
      // The other global error constructors carve out on the same terms: their
      // instances are just as opaque to a structural comparison.
      {
        filename: 'src/components/ErrorSubtypeProps.tsx',
        code: `
import { memo } from 'react';
type Props = { parseError: SyntaxError; typeError: TypeError; id: string };
const Comp = ({ parseError, typeError, id }: Props) => <div>{id}</div>;
export const Wrapped = memo(Comp);
`,
      },
      {
        filename: 'src/components/AggregateErrorProp.tsx',
        code: `
import { memo } from 'react';
type Props = { err: AggregateError; id: string };
const Comp = ({ err, id }: Props) => <div>{id}</div>;
export const Wrapped = memo(Comp);
`,
      },
      // A qualified name reaches the carve-out through its heritage rather than
      // through its own spelling: `ErrnoException` is not a global error name.
      {
        filename: 'src/components/ErrnoExceptionProp.tsx',
        code: `
import { memo } from 'react';
type Props = { err: NodeJS.ErrnoException | null; path: string };
const Comp = ({ err, path }: Props) => <div>{path}</div>;
export const Wrapped = memo(Comp);
`,
      },
      // An authored subclass is an error too — the heritage walk finds the base
      // the name alone would miss.
      {
        filename: 'src/components/ErrorSubclassProp.tsx',
        code: `
import { memo } from 'react';
class RecoveryFailure extends Error {}
type Props = { err: RecoveryFailure; id: string };
const Comp = ({ err, id }: Props) => <div>{id}</div>;
export const Wrapped = memo(Comp);
`,
      },
      {
        filename: 'src/components/ErrorInterfaceExtendsProp.tsx',
        code: `
import { memo } from 'react';
interface HttpFailure extends Error { status: number }
type Props = { err: HttpFailure; id: string };
const Comp = ({ err, id }: Props) => <div>{id}</div>;
export const Wrapped = memo(Comp);
`,
      },
      // A container of errors compares just as degenerately as a lone one: two
      // same-length lists of DIFFERENT errors are structurally equal element by
      // element. Each container spelling is a different AST node, so each is
      // pinned.
      {
        filename: 'src/components/ErrorArrayProp.tsx',
        code: `
import { memo } from 'react';
type Props = { errs: Error[]; id: string };
const Comp = ({ errs, id }: Props) => <div>{id}{errs.length}</div>;
export const Wrapped = memo(Comp);
`,
      },
      {
        filename: 'src/components/ErrorReadonlyArrayProp.tsx',
        code: `
import { memo } from 'react';
type Props = { errs: readonly Error[]; id: string };
const Comp = ({ errs, id }: Props) => <div>{id}{errs.length}</div>;
export const Wrapped = memo(Comp);
`,
      },
      {
        filename: 'src/components/ErrorGenericArrayProp.tsx',
        code: `
import { memo } from 'react';
type Props = { errs: Array<Error>; id: string };
const Comp = ({ errs, id }: Props) => <div>{id}{errs.length}</div>;
export const Wrapped = memo(Comp);
`,
      },
      {
        filename: 'src/components/ErrorTupleProp.tsx',
        code: `
import { memo } from 'react';
type Props = { errs: [Error, TypeError]; id: string };
const Comp = ({ errs, id }: Props) => <div>{id}</div>;
export const Wrapped = memo(Comp);
`,
      },
      {
        filename: 'src/components/NullableErrorArrayProp.tsx',
        code: `
import { memo } from 'react';
type Props = { errs: (Error | null)[]; id: string };
const Comp = ({ errs, id }: Props) => <div>{id}</div>;
export const Wrapped = memo(Comp);
`,
      },
      // A parameter constrained to an error holds one at every instantiation.
      {
        filename: 'src/components/ErrorTypeParameterProp.tsx',
        code: `
import { memo } from 'react';
type Props<E extends Error> = { err: E; id: string };
const Comp = <E extends Error,>(props: Props<E>) => <div>{props.id}</div>;
export const Wrapped = memo(Comp);
`,
      },
      // The annotation fallback: an unresolvable import leaves the prop as
      // `any`, and only the written name is left to answer with.
      {
        filename: 'src/components/UnresolvedErrorImportProp.tsx',
        code: `
import { memo } from 'react';
import type { HttpError } from 'totally-nonexistent-error-lib';
type Props = { err: HttpError; id: string };
const Comp = ({ err, id }: Props) => <div>{id}</div>;
export const Wrapped = memo(Comp);
`,
      },
      // The carve-out is a property of the prop, not of the analysis path: the
      // component-signature and forwardRef type-argument paths reach
      // `isPropertyComplex` through different callers.
      {
        filename: 'src/components/ErrorPropViaSignature.tsx',
        code: `
import { memo } from 'react';
type Props = { err: Error; id: string };
declare const Comp: (props: Props) => JSX.Element;
export const Wrapped = memo(Comp);
`,
      },
      {
        filename: 'src/components/ErrorPropViaForwardRef.tsx',
        code: `
import { forwardRef, memo } from 'react';
type Props = { err: Error | null; id: string };
const Comp = forwardRef<HTMLDivElement, Props>((props, ref) => (
  <div ref={ref}>{props.id}</div>
));
export const Wrapped = memo(Comp);
`,
      },
      // The deliberate removal the report describes is stable: with the error
      // prop exempt there is nothing left to demand, so `eslint --fix` has no
      // report to re-insert `compareDeeply('err')` from.
      {
        filename: 'src/components/ErrorOnlyComponent.tsx',
        code: `
import { memo } from 'src/util/memo';
type Props = { err: Error };
const Comp = ({ err }: Props) => <div>{err.message}</div>;
export const Wrapped = memo(Comp);
`,
      },
      // Fix fixpoint: the emitted comparator names only the surviving prop, and
      // the output it produces reports nothing on a second pass.
      {
        filename: 'src/components/ErrorBesideDataFixed.tsx',
        code: `
import { memo, compareDeeply } from 'src/util/memo';
type Props = { err: Error | null; settings: { theme: string } };
const Comp = ({ err, settings }: Props) => <div>{settings.theme}</div>;
export const Wrapped = memo(Comp, compareDeeply('settings'));
`,
      },
    ]),
    invalid: withParserOptions(parserOptions, [
      // Bug #2039 control (NEG-1): the AUTHOR's own non-homomorphic mapped type
      // synthesizes declaration-less members too. Ownership, not the absence of
      // a declaration, decides — so these are still demanded. A fix that
      // exempted zero-declaration symbols outright would disable the rule here
      // rather than narrow it.
      {
        filename: libraryPropsFile,
        code: `
import { memo } from 'react';
type Keys = 'header' | 'footer';
type Props = { [K in Keys]: { label: string } } & { title: string };
const Comp = ({ title }: Props) => <div>{title}</div>;
export const Wrapped = memo(Comp);
`,
        output: `
import { compareDeeply } from 'src/util/memo';
import { memo } from 'react';
type Keys = 'header' | 'footer';
type Props = { [K in Keys]: { label: string } } & { title: string };
const Comp = ({ title }: Props) => <div>{title}</div>;
export const Wrapped = memo(Comp, compareDeeply('footer', 'header'));
`,
        errors: [
          {
            messageId: 'useCompareDeeply',
            data: {
              componentName: 'Comp',
              propsList: '[footer, header]',
              propsCall: "'footer', 'header'",
            },
          },
        ],
      },
      // Bug #2039 control (NEG-2): the author's mapped type wrapped in a LIBRARY
      // alias. The outermost alias (`Readonly`, declared in `lib.es5.d.ts`) is a
      // dependency's, yet the type that carries `header`/`footer` is the
      // author's — so classifying by the outermost wrapper, or by the symbol's
      // re-synthesized `mappedType`, would wrongly exempt this. The search must
      // reach the CARRIER.
      {
        filename: libraryPropsFile,
        code: `
import { memo } from 'react';
type Keys = 'header' | 'footer';
type Props = Readonly<{ [K in Keys]: { label: string } } & { title: string }>;
const Comp = ({ title }: Props) => <div>{title}</div>;
export const Wrapped = memo(Comp);
`,
        output: `
import { compareDeeply } from 'src/util/memo';
import { memo } from 'react';
type Keys = 'header' | 'footer';
type Props = Readonly<{ [K in Keys]: { label: string } } & { title: string }>;
const Comp = ({ title }: Props) => <div>{title}</div>;
export const Wrapped = memo(Comp, compareDeeply('footer', 'header'));
`,
        errors: [
          {
            messageId: 'useCompareDeeply',
            data: {
              componentName: 'Comp',
              propsList: '[footer, header]',
              propsCall: "'footer', 'header'",
            },
          },
        ],
      },
      // Bug #2039 control (NEG-3): the mixed case, pinned on the interpolated
      // prop list rather than the bare messageId. Both the buggy and the fixed
      // rule report `useCompareDeeply` here — only the NAMES tell them apart,
      // and only naming `meta` while omitting `bgcolor` distinguishes "the
      // library carve-out worked" from "the library type never resolved and
      // contributed no members at all".
      {
        filename: libraryPropsFile,
        code: `
import { memo } from 'react';
import type { LibTypographyProps } from 'fake-system-lib';
type Props = LibTypographyProps & { meta: { id: string } };
const Comp = ({ meta }: Props) => <div>{meta.id}</div>;
export const Wrapped = memo(Comp);
`,
        output: `
import { compareDeeply } from 'src/util/memo';
import { memo } from 'react';
import type { LibTypographyProps } from 'fake-system-lib';
type Props = LibTypographyProps & { meta: { id: string } };
const Comp = ({ meta }: Props) => <div>{meta.id}</div>;
export const Wrapped = memo(Comp, compareDeeply('meta'));
`,
        errors: [
          {
            messageId: 'useCompareDeeply',
            data: {
              componentName: 'Comp',
              propsList: '[meta]',
              propsCall: "'meta'",
            },
          },
        ],
      },
      // Bug #2037 control: the carve-out is scoped to library DECLARATION sites,
      // so a complex prop the author declares is still reported. A fix that
      // silenced this would have disabled the rule rather than narrowed it.
      {
        filename: libraryPropsFile,
        code: `
import { memo } from 'react';
type LocalProps = { title: string; options: Record<string, unknown> };
const LocalThingUnmemoized = ({ title, options }: LocalProps) => (
  <div>{title}{String(options)}</div>
);
export const LocalThing = memo(LocalThingUnmemoized);
`,
        output: `
import { compareDeeply } from 'src/util/memo';
import { memo } from 'react';
type LocalProps = { title: string; options: Record<string, unknown> };
const LocalThingUnmemoized = ({ title, options }: LocalProps) => (
  <div>{title}{String(options)}</div>
);
export const LocalThing = memo(LocalThingUnmemoized, compareDeeply('options'));
`,
        errors: [
          {
            messageId: 'useCompareDeeply',
            data: {
              componentName: 'LocalThingUnmemoized',
              propsList: '[options]',
              propsCall: "'options'",
            },
          },
        ],
      },
      // Bug #2037 mixed case: a props type intersecting a library base with an
      // author-declared complex prop. Only the author's prop may be demanded, so
      // the expectation pins the interpolated prop list rather than the bare
      // messageId — the pre-fix report also carried `useCompareDeeply`, naming
      // `[classes, rows, variantMapping]`, which a messageId check cannot tell
      // apart from the fixed one.
      {
        filename: libraryPropsFile,
        code: `
import { memo } from 'react';
import type { LibBaseProps } from 'fake-ui-lib';
type MixedProps = LibBaseProps & { title: string; rows: { id: string }[] };
const MixedUnmemoized = ({ title, rows }: MixedProps) => (
  <div>{title}{rows.length}</div>
);
export const Mixed = memo(MixedUnmemoized);
`,
        output: `
import { compareDeeply } from 'src/util/memo';
import { memo } from 'react';
import type { LibBaseProps } from 'fake-ui-lib';
type MixedProps = LibBaseProps & { title: string; rows: { id: string }[] };
const MixedUnmemoized = ({ title, rows }: MixedProps) => (
  <div>{title}{rows.length}</div>
);
export const Mixed = memo(MixedUnmemoized, compareDeeply('rows'));
`,
        errors: [
          {
            messageId: 'useCompareDeeply',
            data: {
              componentName: 'MixedUnmemoized',
              propsList: '[rows]',
              propsCall: "'rows'",
            },
          },
        ],
      },
      // The carve-out keys on the declaration FILE, not on "the prop arrived
      // from another module": a base type the author owns in a plain `.ts` is
      // authored code, so its complex members are still demanded.
      {
        filename: libraryPropsFile,
        code: `
import { memo } from 'react';
import type { AuthoredBaseProps } from './memo-authored-props';
type Props = AuthoredBaseProps & { title: string };
const Comp = ({ title }: Props) => <div>{title}</div>;
export const Wrapped = memo(Comp);
`,
        output: `
import { compareDeeply } from 'src/util/memo';
import { memo } from 'react';
import type { AuthoredBaseProps } from './memo-authored-props';
type Props = AuthoredBaseProps & { title: string };
const Comp = ({ title }: Props) => <div>{title}</div>;
export const Wrapped = memo(Comp, compareDeeply('settings'));
`,
        errors: [
          {
            messageId: 'useCompareDeeply',
            data: {
              componentName: 'Comp',
              propsList: '[settings]',
              propsCall: "'settings'",
            },
          },
        ],
      },
      // A prop the author redeclares alongside the library's own yields ONE
      // symbol carrying both declaration sites. The author declared it, so it is
      // still demanded — while `variantMapping`, which they did not, is not.
      {
        filename: libraryPropsFile,
        code: `
import { memo } from 'react';
import type { LibBaseProps } from 'fake-ui-lib';
type Props = LibBaseProps & { classes: { root: string }; title: string };
const Comp = ({ classes, title }: Props) => <div>{title}{classes.root}</div>;
export const Wrapped = memo(Comp);
`,
        output: `
import { compareDeeply } from 'src/util/memo';
import { memo } from 'react';
import type { LibBaseProps } from 'fake-ui-lib';
type Props = LibBaseProps & { classes: { root: string }; title: string };
const Comp = ({ classes, title }: Props) => <div>{title}{classes.root}</div>;
export const Wrapped = memo(Comp, compareDeeply('classes'));
`,
        errors: [
          {
            messageId: 'useCompareDeeply',
            data: {
              componentName: 'Comp',
              propsList: '[classes]',
              propsCall: "'classes'",
            },
          },
        ],
      },
      // A mapped type over the author's OWN props (`Readonly<…>`) carries the
      // original declarations through, so the carve-out must not swallow it.
      {
        filename: libraryPropsFile,
        code: `
import { memo } from 'react';
const Comp = ({ data, label }: Readonly<{ data: { a: string }; label: string }>) => (
  <div>{label}{data.a}</div>
);
export const Wrapped = memo(Comp);
`,
        output: `
import { compareDeeply } from 'src/util/memo';
import { memo } from 'react';
const Comp = ({ data, label }: Readonly<{ data: { a: string }; label: string }>) => (
  <div>{label}{data.a}</div>
);
export const Wrapped = memo(Comp, compareDeeply('data'));
`,
        errors: [
          {
            messageId: 'useCompareDeeply',
            data: {
              componentName: 'Comp',
              propsList: '[data]',
              propsCall: "'data'",
            },
          },
        ],
      },
      // Bug #1179 regression: mixed React render types + data objects — only data props flagged.
      {
        filename: 'src/components/MixedReactAndDataInvalid.tsx',
        code: `
import React, { memo } from 'react';

type ChannelProps = {
  Avatar: React.ComponentType;
  Preview: React.FC<{ id: string }>;
  activeChannel: { id: string; name: string };
  watchers: { userId: string }[];
};

const ChannelPreview = ({ Avatar, Preview, activeChannel, watchers }: ChannelProps) => (
  <div>{activeChannel.name}</div>
);

export const Wrapped = memo(ChannelPreview);
`,
        output: `
import { compareDeeply } from 'src/util/memo';
import React, { memo } from 'react';

type ChannelProps = {
  Avatar: React.ComponentType;
  Preview: React.FC<{ id: string }>;
  activeChannel: { id: string; name: string };
  watchers: { userId: string }[];
};

const ChannelPreview = ({ Avatar, Preview, activeChannel, watchers }: ChannelProps) => (
  <div>{activeChannel.name}</div>
);

export const Wrapped = memo(
  ChannelPreview,
  compareDeeply('activeChannel', 'watchers'),
);
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      // A user-defined interface coincidentally named ReactNode (not from react) must still be flagged.
      {
        filename: 'src/components/FakeReactNodeProp.tsx',
        code: `
import { memo } from 'react';
// This ReactNode is locally defined, not from @types/react — must still be flagged.
interface ReactNode { value: string }
type Props = { icon: ReactNode; label: string };
const Comp = ({ icon, label }: Props) => <div>{label}</div>;
export const Wrapped = memo(Comp);
`,
        output: `
import { compareDeeply } from 'src/util/memo';
import { memo } from 'react';
// This ReactNode is locally defined, not from @types/react — must still be flagged.
interface ReactNode { value: string }
type Props = { icon: ReactNode; label: string };
const Comp = ({ icon, label }: Props) => <div>{label}</div>;
export const Wrapped = memo(Comp, compareDeeply('icon'));
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      {
        filename: 'src/components/MixedComplexProps.tsx',
        code: `
import { memo } from 'src/util/memo';

type MixedProps = {
  name: string;
  sx?: { color: string };
  otherComplex: { foo: string };
};

export const MyComponent = memo(({ name, sx, otherComplex }: MixedProps) => {
  return <div sx={sx}>{name}</div>;
});
`,
        output: `
import { memo, compareDeeply } from 'src/util/memo';

type MixedProps = {
  name: string;
  sx?: { color: string };
  otherComplex: { foo: string };
};

export const MyComponent = memo(({ name, sx, otherComplex }: MixedProps) => {
  return <div sx={sx}>{name}</div>;
}, compareDeeply('otherComplex'));
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      {
        filename: 'src/components/UserProfileCard.tsx',
        code: `
import { memo } from 'react';

interface UserSettings {
  theme: string;
  notifications: {
    email: boolean;
    sms: boolean;
  };
  preferences: string[];
}

interface UserProfileCardProps {
  userId: string;
  userSettings: UserSettings;
  onUpdate: () => void;
}

const UserProfileCardUnmemoized = ({
  userId,
  userSettings,
  onUpdate,
}: UserProfileCardProps) => {
  return (
    <div onClick={onUpdate}>
      <p>User ID: {userId}</p>
      <p>Theme: {userSettings.theme}</p>
    </div>
  );
};

export const UserProfileCard = memo(UserProfileCardUnmemoized);
`,
        output: `
import { compareDeeply } from 'src/util/memo';
import { memo } from 'react';

interface UserSettings {
  theme: string;
  notifications: {
    email: boolean;
    sms: boolean;
  };
  preferences: string[];
}

interface UserProfileCardProps {
  userId: string;
  userSettings: UserSettings;
  onUpdate: () => void;
}

const UserProfileCardUnmemoized = ({
  userId,
  userSettings,
  onUpdate,
}: UserProfileCardProps) => {
  return (
    <div onClick={onUpdate}>
      <p>User ID: {userId}</p>
      <p>Theme: {userSettings.theme}</p>
    </div>
  );
};

export const UserProfileCard = memo(
  UserProfileCardUnmemoized,
  compareDeeply('userSettings'),
);
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      {
        filename: 'src/components/MultiComplexProps.tsx',
        code: `
import { memo } from 'react';
type Props = { filters: string[]; settings: { theme: string }; id: string };
const Comp = ({ filters, settings, id }: Props) => (
  <div>{id}{filters.join(',')}{settings.theme}</div>
);
export const Wrapped = memo(Comp);
`,
        output: `
import { compareDeeply } from 'src/util/memo';
import { memo } from 'react';
type Props = { filters: string[]; settings: { theme: string }; id: string };
const Comp = ({ filters, settings, id }: Props) => (
  <div>{id}{filters.join(',')}{settings.theme}</div>
);
export const Wrapped = memo(Comp, compareDeeply('filters', 'settings'));
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      {
        filename: 'src/components/PropOrderConsistency.tsx',
        code: `
import { memo } from 'react';
type Props = { beta: { value: number }; alpha: { value: number } };
const Named = ({ beta, alpha }: Props) => <div>{beta.value}{alpha.value}</div>;
export const WrappedNamed = memo(Named);
export const WrappedInline = memo(({ beta, alpha }: Props) => <section>{beta.value}{alpha.value}</section>);
`,
        output: `
import { compareDeeply } from 'src/util/memo';
import { memo } from 'react';
type Props = { beta: { value: number }; alpha: { value: number } };
const Named = ({ beta, alpha }: Props) => <div>{beta.value}{alpha.value}</div>;
export const WrappedNamed = memo(Named, compareDeeply('alpha', 'beta'));
export const WrappedInline = memo(
  ({ beta, alpha }: Props) => <section>{beta.value}{alpha.value}</section>,
  compareDeeply('alpha', 'beta'),
);
`,
        errors: [
          { messageId: 'useCompareDeeply' },
          { messageId: 'useCompareDeeply' },
        ],
      },
      {
        filename: 'src/components/TypeArgsAny.tsx',
        code: `
import { memo } from 'react';
type Props = { beta: { value: number }; alpha: { value: number } };
export const Wrapped = memo<any, Props>(
  ({ beta, alpha }: any) => <div>{beta.value}{alpha.value}</div>,
);
`,
        output: `
import { compareDeeply } from 'src/util/memo';
import { memo } from 'react';
type Props = { beta: { value: number }; alpha: { value: number } };
export const Wrapped = memo<any, Props>(
  ({ beta, alpha }: any) => <div>{beta.value}{alpha.value}</div>,
  compareDeeply('alpha', 'beta'),
);
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      {
        filename: 'src/components/ArrayOnly.tsx',
        code: `
import { memo } from 'react';
type Props = { items: string[] };
const Comp = ({ items }: Props) => <div>{items.length}</div>;
export const Wrapped = memo(Comp);
`,
        output: `
import { compareDeeply } from 'src/util/memo';
import { memo } from 'react';
type Props = { items: string[] };
const Comp = ({ items }: Props) => <div>{items.length}</div>;
export const Wrapped = memo(Comp, compareDeeply('items'));
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      {
        filename: 'src/components/CustomMemoAlias.tsx',
        code: `
import { memo as customMemo } from 'src/util/memo';
type Props = { options: string[] };
const Comp = ({ options }: Props) => <div>{options.join(',')}</div>;
export const Wrapped = customMemo(Comp);
`,
        output: `
import { memo as customMemo, compareDeeply } from 'src/util/memo';
type Props = { options: string[] };
const Comp = ({ options }: Props) => <div>{options.join(',')}</div>;
export const Wrapped = customMemo(Comp, compareDeeply('options'));
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      {
        filename: 'src/components/CustomMemoDefault.tsx',
        code: `
import memoUtil from 'src/util/memo';
type Props = { config: { dark: boolean } };
const Comp = ({ config }: Props) => <div>{String(config.dark)}</div>;
export const Wrapped = memoUtil(Comp);
`,
        output: `
import memoUtil, { compareDeeply } from 'src/util/memo';
type Props = { config: { dark: boolean } };
const Comp = ({ config }: Props) => <div>{String(config.dark)}</div>;
export const Wrapped = memoUtil(Comp, compareDeeply('config'));
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      {
        filename: 'src/components/ReactNamespace.tsx',
        code: `
import React from 'react';
type Props = { config: { theme: string } };
const Comp = ({ config }: Props) => <div>{config.theme}</div>;
export const Wrapped = React.memo(Comp);
`,
        output: `
import { compareDeeply } from 'src/util/memo';
import React from 'react';
type Props = { config: { theme: string } };
const Comp = ({ config }: Props) => <div>{config.theme}</div>;
export const Wrapped = React.memo(Comp, compareDeeply('config'));
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      {
        filename: 'src/components/InlineArrow.tsx',
        code: `
import { memo } from 'react';
type Props = { data: { id: string } };
export const Wrapped = memo(({ data }: Props) => <span>{data.id}</span>);
`,
        output: `
import { compareDeeply } from 'src/util/memo';
import { memo } from 'react';
type Props = { data: { id: string } };
export const Wrapped = memo(
  ({ data }: Props) => <span>{data.id}</span>,
  compareDeeply('data'),
);
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      {
        filename: 'src/components/SatisfiesExpression.tsx',
        code: `
import React, { memo } from 'react';
type Props = { settings: { theme: string } };
const Comp: React.FC<Props> = ({ settings }) => <div>{settings.theme}</div>;
export const Wrapped = memo((Comp satisfies React.FC<Props>));
`,
        output: `
import { compareDeeply } from 'src/util/memo';
import React, { memo } from 'react';
type Props = { settings: { theme: string } };
const Comp: React.FC<Props> = ({ settings }) => <div>{settings.theme}</div>;
export const Wrapped = memo(
  (Comp satisfies React.FC<Props>),
  compareDeeply('settings'),
);
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      {
        filename: 'src/components/ExistingImport.tsx',
        code: `
import { memo } from 'react';
import { compareDeeply } from 'src/util/memo';
type Props = { settings: { mode: string } };
const Comp = ({ settings }: Props) => <div>{settings.mode}</div>;
export const Wrapped = memo(Comp);
`,
        output: `
import { memo } from 'react';
import { compareDeeply } from 'src/util/memo';
type Props = { settings: { mode: string } };
const Comp = ({ settings }: Props) => <div>{settings.mode}</div>;
export const Wrapped = memo(Comp, compareDeeply('settings'));
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      {
        filename: 'src/components/NamespaceMemoUtil.tsx',
        code: `
import * as memoUtil from 'src/util/memo';
type Props = { payload: { value: string } };
const Comp = ({ payload }: Props) => <div>{payload.value}</div>;
export const Wrapped = memoUtil.memo(Comp);
`,
        output: `
import * as memoUtil from 'src/util/memo';
import { compareDeeply } from 'src/util/memo';
type Props = { payload: { value: string } };
const Comp = ({ payload }: Props) => <div>{payload.value}</div>;
export const Wrapped = memoUtil.memo(Comp, compareDeeply('payload'));
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      {
        filename: 'src/components/AliasedCompareDeeply.tsx',
        code: `
import { memo } from 'react';
import { compareDeeply as cd } from 'src/util/memo';
type Props = { info: { id: string } };
const Comp = ({ info }: Props) => <div>{info.id}</div>;
export const Wrapped = memo(Comp);
`,
        output: `
import { memo } from 'react';
import { compareDeeply as cd } from 'src/util/memo';
type Props = { info: { id: string } };
const Comp = ({ info }: Props) => <div>{info.id}</div>;
export const Wrapped = memo(Comp, cd('info'));
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      {
        filename: 'src/components/RecordProp.tsx',
        code: `
import { memo } from 'react';
type Props = { mapping: Record<string, number> };
const Comp = ({ mapping }: Props) => <div>{Object.keys(mapping).length}</div>;
export const Wrapped = memo(Comp);
`,
        output: `
import { compareDeeply } from 'src/util/memo';
import { memo } from 'react';
type Props = { mapping: Record<string, number> };
const Comp = ({ mapping }: Props) => <div>{Object.keys(mapping).length}</div>;
export const Wrapped = memo(Comp, compareDeeply('mapping'));
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      {
        filename: 'src/components/ReadonlyArrayProp.tsx',
        code: `
import { memo } from 'react';
type Props = { ids: readonly string[] };
const Comp = ({ ids }: Props) => <div>{ids.length}</div>;
export const Wrapped = memo(Comp);
`,
        output: `
import { compareDeeply } from 'src/util/memo';
import { memo } from 'react';
type Props = { ids: readonly string[] };
const Comp = ({ ids }: Props) => <div>{ids.length}</div>;
export const Wrapped = memo(Comp, compareDeeply('ids'));
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      {
        filename: 'src/components/QuotedProp.tsx',
        code: `
import { memo } from 'react';
type Props = { "user'sData": { id: string } };
const Comp = ({ ["user'sData"]: usersData }: Props) => <div>{usersData.id}</div>;
export const Wrapped = memo(Comp);
`,
        output: `
import { compareDeeply } from 'src/util/memo';
import { memo } from 'react';
type Props = { "user'sData": { id: string } };
const Comp = ({ ["user'sData"]: usersData }: Props) => <div>{usersData.id}</div>;
export const Wrapped = memo(Comp, compareDeeply('user\\'sData'));
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      {
        filename: 'src/components/DuplicateImport.tsx',
        code: `
import { memo } from 'src/util/memo';
import { compareDeeply } from 'src/util/memo';
type Props = { config: { theme: string } };
const Comp = ({ config }: Props) => <div>{config.theme}</div>;
export const Wrapped = memo(Comp);
`,
        output: `
import { memo } from 'src/util/memo';
import { compareDeeply } from 'src/util/memo';
type Props = { config: { theme: string } };
const Comp = ({ config }: Props) => <div>{config.theme}</div>;
export const Wrapped = memo(Comp, compareDeeply('config'));
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      {
        filename: 'src/components/UndefinedComparator.tsx',
        code: `
import { memo } from 'react';
type Props = { config: { theme: string } };
const Comp = ({ config }: Props) => <div>{config.theme}</div>;
export const Wrapped = memo(Comp, undefined);
`,
        output: `
import { compareDeeply } from 'src/util/memo';
import { memo } from 'react';
type Props = { config: { theme: string } };
const Comp = ({ config }: Props) => <div>{config.theme}</div>;
export const Wrapped = memo(Comp, compareDeeply('config'));
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      {
        filename: 'src/components/UndefinedAsAnyComparator.tsx',
        code: `
import { memo } from 'react';
type Props = { config: { theme: string } };
const Comp = ({ config }: Props) => <div>{config.theme}</div>;
export const Wrapped = memo(Comp, (undefined as any));
`,
        output: `
import { compareDeeply } from 'src/util/memo';
import { memo } from 'react';
type Props = { config: { theme: string } };
const Comp = ({ config }: Props) => <div>{config.theme}</div>;
export const Wrapped = memo(Comp, compareDeeply('config'));
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      {
        filename: 'src/components/TrailingCommaMemo.tsx',
        code: `
import { memo } from 'react';
type Props = { config: { theme: string } };
const Comp = ({ config }: Props) => <div>{config.theme}</div>;
export const Wrapped = memo(Comp,);
`,
        output: `
import { compareDeeply } from 'src/util/memo';
import { memo } from 'react';
type Props = { config: { theme: string } };
const Comp = ({ config }: Props) => <div>{config.theme}</div>;
export const Wrapped = memo(Comp, compareDeeply('config'));
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      {
        filename: 'src/components/ParenthesizedNullComparator.tsx',
        code: `
import { memo } from 'react';
type Props = { config: { theme: string } };
const Comp = ({ config }: Props) => <div>{config.theme}</div>;
export const Wrapped = memo(Comp, (null));
`,
        output: `
import { compareDeeply } from 'src/util/memo';
import { memo } from 'react';
type Props = { config: { theme: string } };
const Comp = ({ config }: Props) => <div>{config.theme}</div>;
export const Wrapped = memo(Comp, compareDeeply('config'));
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      {
        filename: 'src/components/InnerScopeCompareDeeplyShadow.tsx',
        code: `
import { memo } from 'react';
type Props = { config: { theme: string } };
function makeWrapper() {
  const compareDeeply = () => false;
  return memo(function Comp({ config }: Props) {
    return <div>{config.theme}</div>;
  });
}
export const Wrapped = makeWrapper();
`,
        output: `
import { compareDeeply as compareDeeply2 } from 'src/util/memo';
import { memo } from 'react';
type Props = { config: { theme: string } };
function makeWrapper() {
  const compareDeeply = () => false;
  return memo(function Comp({ config }: Props) {
    return <div>{config.theme}</div>;
  }, compareDeeply2('config'));
}
export const Wrapped = makeWrapper();
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      {
        filename: 'src/components/CompareDeeplyNameCollision.tsx',
        code: `
import { memo } from 'react';
const compareDeeply = () => false;
type Props = { config: { theme: string } };
const Comp = ({ config }: Props) => <div>{config.theme}</div>;
export const Wrapped = memo(Comp);
`,
        output: `
import { compareDeeply as compareDeeply2 } from 'src/util/memo';
import { memo } from 'react';
const compareDeeply = () => false;
type Props = { config: { theme: string } };
const Comp = ({ config }: Props) => <div>{config.theme}</div>;
export const Wrapped = memo(Comp, compareDeeply2('config'));
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      {
        filename: 'src/components/ForwardRefWrapper.tsx',
        code: `
import React, { memo } from 'react';
type Props = { settings: { theme: string } };
const Base = React.forwardRef<HTMLDivElement, Props>(({ settings }, ref) => (
  <div ref={ref}>{settings.theme}</div>
));
export const Wrapped = memo(Base);
`,
        output: `
import { compareDeeply } from 'src/util/memo';
import React, { memo } from 'react';
type Props = { settings: { theme: string } };
const Base = React.forwardRef<HTMLDivElement, Props>(({ settings }, ref) => (
  <div ref={ref}>{settings.theme}</div>
));
export const Wrapped = memo(Base, compareDeeply('settings'));
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      // Bug #1224 control: a props type carrying BOTH the reserved `ref`/`key`
      // slots and a genuine object prop must STILL fire — only `settings` is
      // flagged. Proves the skip-list does not suppress true positives sitting
      // alongside reserved slots.
      {
        filename: 'src/components/RefSlotWithComplexInvalid.tsx',
        code: `
import { memo } from 'react';
type Props = {
  ref?: { current: HTMLDivElement | null };
  key?: { id: string };
  settings: { theme: string };
};
const Comp = ({ settings }: Props) => <div>{settings.theme}</div>;
export const Wrapped = memo(Comp);
`,
        output: `
import { compareDeeply } from 'src/util/memo';
import { memo } from 'react';
type Props = {
  ref?: { current: HTMLDivElement | null };
  key?: { id: string };
  settings: { theme: string };
};
const Comp = ({ settings }: Props) => <div>{settings.theme}</div>;
export const Wrapped = memo(Comp, compareDeeply('settings'));
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      {
        filename: 'src/components/ClassInstanceProp.tsx',
        code: `
import { memo } from 'react';
class Config {
  mode = 'dark';
}
type Props = { config: Config };
const Comp = ({ config }: Props) => <div>{config.mode}</div>;
export const Wrapped = memo(Comp);
`,
        output: `
import { compareDeeply } from 'src/util/memo';
import { memo } from 'react';
class Config {
  mode = 'dark';
}
type Props = { config: Config };
const Comp = ({ config }: Props) => <div>{config.mode}</div>;
export const Wrapped = memo(Comp, compareDeeply('config'));
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      {
        filename: 'src/components/UnionMixedProp.tsx',
        code: `
import { memo } from 'react';
type Props = { payload: { value: number } | string };
const Comp = ({ payload }: Props) => <div>{String(payload)}</div>;
export const Wrapped = memo(Comp);
`,
        output: `
import { compareDeeply } from 'src/util/memo';
import { memo } from 'react';
type Props = { payload: { value: number } | string };
const Comp = ({ payload }: Props) => <div>{String(payload)}</div>;
export const Wrapped = memo(Comp, compareDeeply('payload'));
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      {
        filename: 'src/components/MultipleMemoImports.tsx',
        code: `
import { memo } from '../util/memo';
import { memo as memoFromSrc } from 'src/util/memo';
type Props = { config: { theme: string } };
const Comp = ({ config }: Props) => <div>{config.theme}</div>;
export const Wrapped = memo(Comp);
`,
        output: `
import { memo, compareDeeply } from '../util/memo';
import { memo as memoFromSrc } from 'src/util/memo';
type Props = { config: { theme: string } };
const Comp = ({ config }: Props) => <div>{config.theme}</div>;
export const Wrapped = memo(Comp, compareDeeply('config'));
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      {
        filename: 'src/components/MultipleMemoCalls.tsx',
        code: `
import { memo } from 'react';
type Props = { config: { theme: string } };
const First = ({ config }: Props) => <div>{config.theme}</div>;
const Second = ({ config }: Props) => <span>{config.theme}</span>;
export const Wrapped = memo(First);
export const WrappedAgain = memo(Second);
`,
        output: `
import { compareDeeply } from 'src/util/memo';
import { memo } from 'react';
type Props = { config: { theme: string } };
const First = ({ config }: Props) => <div>{config.theme}</div>;
const Second = ({ config }: Props) => <span>{config.theme}</span>;
export const Wrapped = memo(First, compareDeeply('config'));
export const WrappedAgain = memo(Second, compareDeeply('config'));
`,
        errors: [
          { messageId: 'useCompareDeeply' },
          { messageId: 'useCompareDeeply' },
        ],
      },
      {
        filename: 'src/components/MultipleCallsWithShadow.tsx',
        code: `
import { memo } from 'react';
type Props = { config: { theme: string } };
const One = ({ config }: Props) => <div>{config.theme}</div>;
export const WrappedOne = memo(One);
function makeWrapper() {
  const compareDeeply = () => false;
  const Two = ({ config }: Props) => <span>{config.theme}</span>;
  return memo(Two);
}
export const WrappedTwo = makeWrapper();
`,
        output: `
import { compareDeeply as compareDeeply2 } from 'src/util/memo';
import { memo } from 'react';
type Props = { config: { theme: string } };
const One = ({ config }: Props) => <div>{config.theme}</div>;
export const WrappedOne = memo(One, compareDeeply2('config'));
function makeWrapper() {
  const compareDeeply = () => false;
  const Two = ({ config }: Props) => <span>{config.theme}</span>;
  return memo(Two, compareDeeply2('config'));
}
export const WrappedTwo = makeWrapper();
`,
        errors: [
          { messageId: 'useCompareDeeply' },
          { messageId: 'useCompareDeeply' },
        ],
      },
      {
        filename: callSignatureMissingFile,
        code: `
import { memo } from 'react';
type Props = { payload: { value: number } };
const Comp = ({ payload }: Props) => <div>{payload.value}</div>;
export const Wrapped = memo(Comp);
`,
        output: `
import { compareDeeply } from 'src/util/memo';
import { memo } from 'react';
type Props = { payload: { value: number } };
const Comp = ({ payload }: Props) => <div>{payload.value}</div>;
export const Wrapped = memo(Comp, compareDeeply('payload'));
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      {
        filename: 'src/components/ShadowedInitializer.tsx',
        code: `
import { memo } from 'react';
type Props = { settings: { theme: string } };
const Comp = ({ settings }: Props) => <div>{settings.theme}</div>;

function makeInner() {
  const Comp = ({ flag }: { flag: boolean }) => <span>{flag}</span>;
  return Comp;
}

export const Wrapped = memo(Comp);
`,
        output: `
import { compareDeeply } from 'src/util/memo';
import { memo } from 'react';
type Props = { settings: { theme: string } };
const Comp = ({ settings }: Props) => <div>{settings.theme}</div>;

function makeInner() {
  const Comp = ({ flag }: { flag: boolean }) => <span>{flag}</span>;
  return Comp;
}

export const Wrapped = memo(Comp, compareDeeply('settings'));
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      // Bug #1327 regression guard: the DOM carve-out must NOT over-suppress a
      // genuine object prop sitting alongside a DOM-element prop. Only `settings`
      // is flagged — `anchorEl` (HTMLElement | null) is excluded.
      {
        filename: 'src/components/DomElementMixedInvalid.tsx',
        code: `
import { memo } from 'react';
type Props = { anchorEl: HTMLElement | null; settings: { theme: string } };
const Comp = ({ anchorEl, settings }: Props) => <div>{settings.theme}</div>;
export const Wrapped = memo(Comp);
`,
        output: `
import { compareDeeply } from 'src/util/memo';
import { memo } from 'react';
type Props = { anchorEl: HTMLElement | null; settings: { theme: string } };
const Comp = ({ anchorEl, settings }: Props) => <div>{settings.theme}</div>;
export const Wrapped = memo(Comp, compareDeeply('settings'));
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      // Bug #1656 regression guard: the open-ended-union carve-out must NOT
      // over-suppress a genuine data object sitting alongside one. Only
      // `viewSize` is named — `kind` is excluded.
      {
        filename: 'src/components/OpenUnionMixedInvalid.tsx',
        code: `
import { memo } from 'src/util/memo';
type Props = { kind?: 'alert' | (string & {}); viewSize?: { width: number } };
const Comp = ({ kind, viewSize }: Props) => <div data-kind={kind}>{viewSize?.width}</div>;
export const Wrapped = memo(Comp);
`,
        output: `
import { memo, compareDeeply } from 'src/util/memo';
type Props = { kind?: 'alert' | (string & {}); viewSize?: { width: number } };
const Comp = ({ kind, viewSize }: Props) => <div data-kind={kind}>{viewSize?.width}</div>;
export const Wrapped = memo(Comp, compareDeeply('viewSize'));
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      // An ARRAY of the open-ended union is a genuine object at runtime; the
      // element type's exemption must not propagate to the container.
      {
        filename: 'src/components/OpenUnionArrayInvalid.tsx',
        code: `
import { memo } from 'src/util/memo';
type Props = { kinds: ('alert' | (string & {}))[]; label: string };
const Comp = ({ kinds, label }: Props) => <div>{kinds.join(',')}{label}</div>;
export const Wrapped = memo(Comp);
`,
        output: `
import { memo, compareDeeply } from 'src/util/memo';
type Props = { kinds: ('alert' | (string & {}))[]; label: string };
const Comp = ({ kinds, label }: Props) => <div>{kinds.join(',')}{label}</div>;
export const Wrapped = memo(Comp, compareDeeply('kinds'));
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      // A nested data object reached through an open-ended union sibling still
      // reports, and an intersection with NO primitive member (two object types)
      // stays complex — the reduction is keyed on the primitive member, not on
      // the type being an intersection.
      {
        filename: 'src/components/ObjectIntersectionInvalid.tsx',
        code: `
import { memo } from 'src/util/memo';
type Props = {
  kind?: 'alert' | (string & {});
  config: { nested: { depth: number } } & { extra: string };
};
const Comp = ({ kind, config }: Props) => <div data-kind={kind}>{config.extra}</div>;
export const Wrapped = memo(Comp);
`,
        output: `
import { memo, compareDeeply } from 'src/util/memo';
type Props = {
  kind?: 'alert' | (string & {});
  config: { nested: { depth: number } } & { extra: string };
};
const Comp = ({ kind, config }: Props) => <div data-kind={kind}>{config.extra}</div>;
export const Wrapped = memo(Comp, compareDeeply('config'));
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      // Print width (#2043). The comparator's text grows with the component's
      // complex-prop count, so the emitted argument list has no length bound.
      // The fixer measures the line each emission lands on and only breaks the
      // argument list open past the print width, because a formatter collapses
      // a short argument list back onto one line — the opposite failure.
      {
        filename: 'src/components/PrintWidthRepro.tsx',
        code: `
import { memo } from 'react';
type P = {
  activeChannel: { id: string };
  watchers: string[];
  participants: { id: string }[];
  metadata: { k: string };
};
const C = (p: P) => <div>{p.activeChannel.id}</div>;
export const M = memo(C);
`,
        output: `
import { compareDeeply } from 'src/util/memo';
import { memo } from 'react';
type P = {
  activeChannel: { id: string };
  watchers: string[];
  participants: { id: string }[];
  metadata: { k: string };
};
const C = (p: P) => <div>{p.activeChannel.id}</div>;
export const M = memo(
  C,
  compareDeeply('activeChannel', 'metadata', 'participants', 'watchers'),
);
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      // Exactly at the print width: the emitted line is 80 columns, which a
      // formatter keeps on one line — and collapses back onto one line if it is
      // split — so the fixer must not break it.
      {
        filename: 'src/components/PrintWidthBoundaryFit.tsx',
        code: `
import { memo } from 'react';
type Props = { alphaProps: { id: string }; betaProp: string[] };
const FitUnmemoized = ({ alphaProps, betaProp }: Props) => (
  <div>{alphaProps.id}{betaProp.length}</div>
);
export const Fit = memo(FitUnmemoized);
`,
        output: `
import { compareDeeply } from 'src/util/memo';
import { memo } from 'react';
type Props = { alphaProps: { id: string }; betaProp: string[] };
const FitUnmemoized = ({ alphaProps, betaProp }: Props) => (
  <div>{alphaProps.id}{betaProp.length}</div>
);
export const Fit = memo(FitUnmemoized, compareDeeply('alphaProps', 'betaProp'));
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      // One column past the print width — the same shape as the fixture above
      // with a single extra character — breaks open.
      {
        filename: 'src/components/PrintWidthBoundaryOverflow.tsx',
        code: `
import { memo } from 'react';
type Props = { alphaPropsX: { id: string }; betaProp: string[] };
const FitUnmemoized = ({ alphaPropsX, betaProp }: Props) => (
  <div>{alphaPropsX.id}{betaProp.length}</div>
);
export const Fit = memo(FitUnmemoized);
`,
        output: `
import { compareDeeply } from 'src/util/memo';
import { memo } from 'react';
type Props = { alphaPropsX: { id: string }; betaProp: string[] };
const FitUnmemoized = ({ alphaPropsX, betaProp }: Props) => (
  <div>{alphaPropsX.id}{betaProp.length}</div>
);
export const Fit = memo(
  FitUnmemoized,
  compareDeeply('alphaPropsX', 'betaProp'),
);
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      // A prop list too long even on a line of its own breaks one prop per
      // line, which is where a formatter takes it next.
      {
        filename: 'src/components/PrintWidthPropListBreak.tsx',
        code: `
import { memo } from 'react';
type Props = {
  activeChannelData: { id: string };
  metadataRecords: { k: string };
  participantsCollection: { id: string }[];
  watchersListing: string[];
  somethingElseEntirely: { flag: boolean };
};
const SomeVeryLongComponentNameUnmemoized = (props: Props) => (
  <div>{props.activeChannelData.id}</div>
);
export const SomeVeryLongComponentName = memo(
  SomeVeryLongComponentNameUnmemoized,
);
`,
        output: `
import { compareDeeply } from 'src/util/memo';
import { memo } from 'react';
type Props = {
  activeChannelData: { id: string };
  metadataRecords: { k: string };
  participantsCollection: { id: string }[];
  watchersListing: string[];
  somethingElseEntirely: { flag: boolean };
};
const SomeVeryLongComponentNameUnmemoized = (props: Props) => (
  <div>{props.activeChannelData.id}</div>
);
export const SomeVeryLongComponentName = memo(
  SomeVeryLongComponentNameUnmemoized,
  compareDeeply(
    'activeChannelData',
    'metadataRecords',
    'participantsCollection',
    'somethingElseEntirely',
    'watchersListing',
  ),
);
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      // The call is measured at its own indentation, not at column zero.
      {
        filename: 'src/components/PrintWidthNestedIndent.tsx',
        code: `
import { memo } from 'react';
type Props = { activeChannel: { id: string }; watchers: string[] };
const ChannelPreviewUnmemoized = (props: Props) => (
  <div>{props.activeChannel.id}</div>
);
export function makeChannel() {
  const Channel = memo(ChannelPreviewUnmemoized);
  return Channel;
}
`,
        output: `
import { compareDeeply } from 'src/util/memo';
import { memo } from 'react';
type Props = { activeChannel: { id: string }; watchers: string[] };
const ChannelPreviewUnmemoized = (props: Props) => (
  <div>{props.activeChannel.id}</div>
);
export function makeChannel() {
  const Channel = memo(
    ChannelPreviewUnmemoized,
    compareDeeply('activeChannel', 'watchers'),
  );
  return Channel;
}
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      // The nullish-comparator branch emits the same unbounded text, so it is
      // measured the same way.
      {
        filename: 'src/components/PrintWidthNullishComparator.tsx',
        code: `
import { memo } from 'react';
type Props = {
  activeChannel: { id: string };
  watchers: string[];
  participants: { id: string }[];
};
const Comp = (props: Props) => <div>{props.activeChannel.id}</div>;
export const Wrapped = memo(Comp, undefined);
`,
        output: `
import { compareDeeply } from 'src/util/memo';
import { memo } from 'react';
type Props = {
  activeChannel: { id: string };
  watchers: string[];
  participants: { id: string }[];
};
const Comp = (props: Props) => <div>{props.activeChannel.id}</div>;
export const Wrapped = memo(
  Comp,
  compareDeeply('activeChannel', 'participants', 'watchers'),
);
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      // A narrower configured width breaks a list the default width keeps
      // inline, so the option is live.
      {
        filename: 'src/components/PrintWidthOptionNarrow.tsx',
        options: [{ printWidth: 40 }],
        code: `
import { memo } from 'react';
type Props = { items: string[] };
const Comp = ({ items }: Props) => <div>{items.length}</div>;
export const Wrapped = memo(Comp);
`,
        output: `
import { compareDeeply } from 'src/util/memo';
import { memo } from 'react';
type Props = { items: string[] };
const Comp = ({ items }: Props) => <div>{items.length}</div>;
export const Wrapped = memo(
  Comp,
  compareDeeply('items'),
);
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      // A wider configured width keeps inline the very list the default width
      // breaks, pinning the option in both directions.
      {
        filename: 'src/components/PrintWidthOptionWide.tsx',
        options: [{ printWidth: 200 }],
        code: `
import { memo } from 'react';
type P = {
  activeChannel: { id: string };
  watchers: string[];
  participants: { id: string }[];
  metadata: { k: string };
};
const C = (p: P) => <div>{p.activeChannel.id}</div>;
export const M = memo(C);
`,
        output: `
import { compareDeeply } from 'src/util/memo';
import { memo } from 'react';
type P = {
  activeChannel: { id: string };
  watchers: string[];
  participants: { id: string }[];
  metadata: { k: string };
};
const C = (p: P) => <div>{p.activeChannel.id}</div>;
export const M = memo(C, compareDeeply('activeChannel', 'metadata', 'participants', 'watchers'));
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      // A block-bodied arrow first argument is hugged by the formatter, which
      // prints the remaining argument after its closing brace whatever the
      // resulting width. The inline form is therefore the formatter's own
      // output, so the fix stands rather than breaking a shape a formatter
      // would put straight back.
      {
        filename: 'src/components/PrintWidthHuggedComponent.tsx',
        code: `
import { memo } from 'react';
type Props = {
  activeChannelData: { id: string };
  metadataRecords: { k: string };
  participantsCollection: { id: string }[];
};
export const Wrapped = memo((props: Props) => {
  return <div>{props.activeChannelData.id}</div>;
});
`,
        output: `
import { compareDeeply } from 'src/util/memo';
import { memo } from 'react';
type Props = {
  activeChannelData: { id: string };
  metadataRecords: { k: string };
  participantsCollection: { id: string }[];
};
export const Wrapped = memo((props: Props) => {
  return <div>{props.activeChannelData.id}</div>;
}, compareDeeply('activeChannelData', 'metadataRecords', 'participantsCollection'));
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      // A component written across lines that the formatter does NOT hug
      // cannot be re-emitted one step in without misaligning its interior, so
      // the fix is declined rather than written over the print width.
      {
        filename: 'src/components/PrintWidthMultilineComponent.tsx',
        code: `
import { memo } from 'react';
type Props = {
  activeChannelData: { id: string };
  metadataRecords: { k: string };
  participantsCollection: { id: string }[];
};
export const Wrapped = memo(function Impl(props: Props) {
  return <div>{props.activeChannelData.id}</div>;
});
`,
        output: null,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      // A component name too long to sit on its own line would send the
      // formatter looking for a break this fixer cannot place, so the fix is
      // declined there too.
      {
        filename: 'src/components/PrintWidthLongComponentName.tsx',
        code: `
import { memo } from 'react';
type Props = { activeChannelData: { id: string } };
const AComponentNameSoLongThatItAloneOverflowsTheWholePrintWidthOnItsOwnLineUnmemoized = (
  props: Props,
) => <div>{props.activeChannelData.id}</div>;
export const Wrapped = memo(
  AComponentNameSoLongThatItAloneOverflowsTheWholePrintWidthOnItsOwnLineUnmemoized,
);
`,
        output: null,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      // A comment inside the argument list would be dropped by rebuilding it,
      // so an overflowing call carrying one is declined too.
      {
        filename: 'src/components/PrintWidthCommentInArguments.tsx',
        code: `
import { memo } from 'react';
type Props = {
  activeChannelData: { id: string };
  metadataRecords: { k: string };
  participantsCollection: { id: string }[];
};
const ChannelPreviewUnmemoized = (props: Props) => (
  <div>{props.activeChannelData.id}</div>
);
export const Wrapped = memo(ChannelPreviewUnmemoized /* keep */);
`,
        output: null,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
      // Bug #2099 control (NEG-1): the error carve-out must not swallow the
      // genuine data prop sitting beside it. Pinned on the interpolated prop
      // list rather than the bare messageId — only the NAMES separate "the
      // carve-out narrowed the report" from "the carve-out disabled the rule
      // for this component". The autofix is the second half of the report: it
      // emits `compareDeeply('settings')` and never re-inserts `'err'`.
      {
        filename: 'src/components/ErrorBesideDataProp.tsx',
        code: `
import { memo } from 'src/util/memo';
type Props = { err: Error | null; settings: { theme: string } };
const Comp = ({ err, settings }: Props) => <div>{settings.theme}</div>;
export const Wrapped = memo(Comp);
`,
        output: `
import { memo, compareDeeply } from 'src/util/memo';
type Props = { err: Error | null; settings: { theme: string } };
const Comp = ({ err, settings }: Props) => <div>{settings.theme}</div>;
export const Wrapped = memo(Comp, compareDeeply('settings'));
`,
        errors: [
          {
            messageId: 'useCompareDeeply',
            data: {
              componentName: 'Comp',
              propsList: '[settings]',
              propsCall: "'settings'",
            },
          },
        ],
      },
      // NEG-2: a union that only PARTLY holds errors still carries a plain-data
      // member, whose deep comparison is meaningful. `every`, not `some`.
      {
        filename: 'src/components/ErrorMixedUnionProp.tsx',
        code: `
import { memo } from 'src/util/memo';
type Props = { err: Error | { theme: string }; id: string };
const Comp = ({ err, id }: Props) => <div>{id}</div>;
export const Wrapped = memo(Comp);
`,
        output: `
import { memo, compareDeeply } from 'src/util/memo';
type Props = { err: Error | { theme: string }; id: string };
const Comp = ({ err, id }: Props) => <div>{id}</div>;
export const Wrapped = memo(Comp, compareDeeply('err'));
`,
        errors: [
          {
            messageId: 'useCompareDeeply',
            data: {
              componentName: 'Comp',
              propsList: '[err]',
              propsCall: "'err'",
            },
          },
        ],
      },
      // NEG-3: the origin gate. A project-authored type that reuses the name
      // `Error` is a plain-data shape whose deep comparison is exactly what the
      // rule is for, so it keeps its report.
      {
        filename: 'src/components/AuthoredErrorNameProp.tsx',
        code: `
import { memo } from 'src/util/memo';
type Error = { field: string; text: string };
type Props = { err: Error; id: string };
const Comp = ({ err, id }: Props) => <div>{id}</div>;
export const Wrapped = memo(Comp);
`,
        output: `
import { memo, compareDeeply } from 'src/util/memo';
type Error = { field: string; text: string };
type Props = { err: Error; id: string };
const Comp = ({ err, id }: Props) => <div>{id}</div>;
export const Wrapped = memo(Comp, compareDeeply('err'));
`,
        errors: [
          {
            messageId: 'useCompareDeeply',
            data: {
              componentName: 'Comp',
              propsList: '[err]',
              propsCall: "'err'",
            },
          },
        ],
      },
      // NEG-4: the error naming convention decides nothing on its own. A
      // resolvable annotation is answered structurally, so a plain-data
      // `ValidationError` is reported however it is spelled.
      {
        filename: 'src/components/ErrorNamedDataProp.tsx',
        code: `
import { memo } from 'src/util/memo';
type ValidationError = { field: string; text: string };
type Props = { err: ValidationError; errs: ValidationError[]; id: string };
const Comp = ({ err, errs, id }: Props) => <div>{id}</div>;
export const Wrapped = memo(Comp);
`,
        output: `
import { memo, compareDeeply } from 'src/util/memo';
type ValidationError = { field: string; text: string };
type Props = { err: ValidationError; errs: ValidationError[]; id: string };
const Comp = ({ err, errs, id }: Props) => <div>{id}</div>;
export const Wrapped = memo(Comp, compareDeeply('err', 'errs'));
`,
        errors: [
          {
            messageId: 'useCompareDeeply',
            data: {
              componentName: 'Comp',
              propsList: '[err, errs]',
              propsCall: "'err', 'errs'",
            },
          },
        ],
      },
      // NEG-5: an error-SHAPED plain object is not an error. Its `message` is an
      // enumerable own property, so a deep comparison reads it.
      {
        filename: 'src/components/ErrorShapedObjectProp.tsx',
        code: `
import { memo } from 'src/util/memo';
type Props = { err: { message: string }; id: string };
const Comp = ({ err, id }: Props) => <div>{id}</div>;
export const Wrapped = memo(Comp);
`,
        output: `
import { memo, compareDeeply } from 'src/util/memo';
type Props = { err: { message: string }; id: string };
const Comp = ({ err, id }: Props) => <div>{id}</div>;
export const Wrapped = memo(Comp, compareDeeply('err'));
`,
        errors: [
          {
            messageId: 'useCompareDeeply',
            data: {
              componentName: 'Comp',
              propsList: '[err]',
              propsCall: "'err'",
            },
          },
        ],
      },
      // A bare `{}` prop type has no primitive member, so it keeps reporting: it
      // admits any non-nullish value, including a freshly built object.
      {
        filename: 'src/components/EmptyObjectProp.tsx',
        code: `
import { memo } from 'src/util/memo';
type Props = { data: {}; label: string };
const Comp = ({ data, label }: Props) => <div>{label}{String(data)}</div>;
export const Wrapped = memo(Comp);
`,
        output: `
import { memo, compareDeeply } from 'src/util/memo';
type Props = { data: {}; label: string };
const Comp = ({ data, label }: Props) => <div>{label}{String(data)}</div>;
export const Wrapped = memo(Comp, compareDeeply('data'));
`,
        errors: [{ messageId: 'useCompareDeeply' }],
      },
    ]),
  },
);
