import { ruleTesterTs } from '../utils/ruleTester';
import { enforceVerbNounNaming } from '../rules/enforce-verb-noun-naming';

/**
 * Issue #2165: the React-component carve-out reached every spelling of a
 * function except a class method. `Panel = () => <div />` was exempt while
 * `Panel() { return <div />; }` — the same member with one token changed —
 * was told to rename itself to a verb phrase, which would break every JSX
 * call site. These fixtures pin the parity, and pin just as hard that the
 * carve-out did not widen into a blanket skip for class methods: an ordinary
 * noun-named method is still reported.
 */
const jsx = { ecmaFeatures: { jsx: true } };

ruleTesterTs.run(
  'enforce-verb-noun-naming-class-method',
  enforceVerbNounNaming,
  {
    valid: [
      // A component method, across the shapes a component takes.
      {
        name: 'a parameterless component method in a .tsx file',
        filename: 'Centralizer.tsx',
        code: `class Centralizer {
  public Panel() {
    return <div />;
  }
}`,
        parserOptions: jsx,
      },
      {
        name: 'a component method taking props',
        filename: 'Widget.tsx',
        code: `class Widget {
  public Panel(props) {
    return <div {...props} />;
  }
}`,
        parserOptions: jsx,
      },
      {
        name: 'a component method taking destructured props',
        filename: 'Centralizer.tsx',
        code: `class Centralizer {
  public Panel({ path }) {
    return <div id={path} />;
  }
}`,
        parserOptions: jsx,
      },
      {
        name: 'a generic component method',
        filename: 'Centralizer.tsx',
        code: `class Centralizer {
  public EditableArray<TValue>({ path }: Props<TValue>) {
    return <div id={path} />;
  }
}`,
        parserOptions: jsx,
      },
      {
        name: 'a private component method',
        filename: 'Centralizer.tsx',
        code: `class Centralizer {
  private Panel() {
    return <div />;
  }
}`,
        parserOptions: jsx,
      },
      {
        name: 'a protected component method',
        filename: 'Centralizer.tsx',
        code: `class Centralizer {
  protected Panel() {
    return <div />;
  }
}`,
        parserOptions: jsx,
      },
      {
        name: 'a static component method',
        filename: 'Centralizer.tsx',
        code: `class Centralizer {
  public static Panel() {
    return <div />;
  }
}`,
        parserOptions: jsx,
      },
      {
        name: 'an async component method',
        filename: 'Centralizer.tsx',
        code: `class Centralizer {
  public async Panel() {
    return <div />;
  }
}`,
        parserOptions: jsx,
      },
      {
        name: 'a component method returning a fragment',
        filename: 'Centralizer.tsx',
        code: `class Centralizer {
  public Panel() {
    return <></>;
  }
}`,
        parserOptions: jsx,
      },
      {
        name: 'a component method that renders nothing on one branch',
        filename: 'Centralizer.tsx',
        code: `class Centralizer {
  public Panel(props) {
    if (!props) {
      return null;
    }
    return <div {...props} />;
  }
}`,
        parserOptions: jsx,
      },
      {
        name: 'a component method that renders nothing at all',
        filename: 'Centralizer.tsx',
        code: `class Centralizer {
  public Panel() {
    return null;
  }
}`,
        parserOptions: jsx,
      },
      {
        name: 'a decorated component method',
        filename: 'Centralizer.tsx',
        code: `class Centralizer {
  @bound
  public Panel() {
    return <div />;
  }
}`,
        parserOptions: jsx,
      },
      {
        name: 'a component method of a class expression',
        filename: 'Centralizer.tsx',
        code: `const Centralizer = class {
  public Panel() {
    return <div />;
  }
};`,
        parserOptions: jsx,
      },
      {
        name: 'an Unmemoized component method',
        filename: 'Widget.tsx',
        code: `class Widget {
  WidgetUnmemoized(props) {
    return <div {...props} />;
  }
}`,
        parserOptions: jsx,
      },
      {
        name: 'a lowercase method taking props and returning JSX',
        filename: 'Widget.tsx',
        code: `class Widget {
  widget(props) {
    return <div {...props} />;
  }
}`,
        parserOptions: jsx,
      },

      // A `.ts` file holds no JSX syntax, so a component there is recognised by
      // its React type, by what it renders, or by the hooks it calls.
      {
        // The annotation rides beside a renderable return on purpose. A method
        // carries its React type as a RETURN type, and `no-explicit-return-type`
        // — shipped in the same recommended config — strips return annotations
        // on `--fix`, so an annotation that were the sole carrier would promise
        // a silence the config itself breaks. That is the documented reason the
        // rule recognises a component by what it renders as well.
        name: 'a component method annotated React.JSX.Element in a .ts file',
        code: `class Centralizer {
  public Panel(): React.JSX.Element {
    return null;
  }
}`,
      },
      {
        name: 'a component method annotated React.FC in a .ts file',
        code: `class Centralizer {
  public Panel(): React.FC {
    return null as any;
  }
}`,
      },
      {
        name: 'a component method rendering through createElement in a .ts file',
        code: `class Centralizer {
  public Panel() {
    return React.createElement('div');
  }
}`,
      },
      {
        // The hook call is spelled `useState` rather than a primitive-valued
        // `useMemo`, whose `--fix` from `no-useless-usememo-primitives` would
        // delete the very carrier this exemption reads.
        name: 'a component method calling a React hook in a .ts file',
        code: `class Centralizer {
  public Panel() {
    const [value] = useState(0);
    return value;
  }
}`,
      },

      // Member kinds that carry no callable to judge, or that the rule has
      // always left alone.
      {
        name: 'a getter beside a component method',
        filename: 'Centralizer.tsx',
        code: `class Centralizer {
  get data() {
    return null;
  }
  public Panel() {
    return <div />;
  }
}`,
        parserOptions: jsx,
      },
      {
        name: 'a constructor beside a component method',
        filename: 'Centralizer.tsx',
        code: `class Centralizer {
  constructor(name) {
    this.name = name;
  }
  public Panel() {
    return <div />;
  }
}`,
        parserOptions: jsx,
      },
      {
        name: 'a string-literal key, which carries no identifier to rename',
        code: `class Service {
  'data'() {}
}`,
      },
      {
        name: 'an abstract method declaration, which has no body to inspect',
        code: `abstract class Service {
  abstract data(): void;
}`,
      },
      {
        name: 'a verb-phrased method keeps passing',
        code: `class Service {
  public fetchData() {
    return null;
  }
  public static buildReport(text: string) {
    return text;
  }
}`,
      },

      // Parity pairs: the whole point of the fix is that the two spellings of
      // one member are judged identically, so each valid method rides beside
      // the field spelling it is interchangeable with.
      {
        name: 'parity: parameterless component, both spellings',
        filename: 'Centralizer.tsx',
        code: `class Centralizer {
  public Panel() {
    return <div />;
  }
  public PanelField = () => {
    return <div />;
  };
}`,
        parserOptions: jsx,
      },
      {
        name: 'parity: component taking props, both spellings',
        filename: 'Widget.tsx',
        code: `class Widget {
  public Panel(props) {
    return <div {...props} />;
  }
  public PanelField = (props) => {
    return <div {...props} />;
  };
}`,
        parserOptions: jsx,
      },
      {
        name: 'parity: generic component, both spellings',
        filename: 'Centralizer.tsx',
        code: `class Centralizer {
  public EditableArray<TValue>({ path }: Props<TValue>) {
    return <div id={path} />;
  }
  public EditableArrayField = <TValue,>({ path }: Props<TValue>) => {
    return <div id={path} />;
  };
}`,
        parserOptions: jsx,
      },
      {
        name: 'parity: component rendering nothing, both spellings',
        filename: 'Centralizer.tsx',
        code: `class Centralizer {
  public Panel() {
    return null;
  }
  public PanelField = () => {
    return null;
  };
}`,
        parserOptions: jsx,
      },
      {
        name: 'parity: Unmemoized component, both spellings',
        filename: 'Widget.tsx',
        code: `class Widget {
  WidgetUnmemoized(props) {
    return <div {...props} />;
  }
  OtherUnmemoized = (props) => {
    return <div {...props} />;
  };
}`,
        parserOptions: jsx,
      },
      {
        name: 'parity: React-typed component in a .ts file, both spellings',
        code: `class Centralizer {
  public Panel(): React.JSX.Element {
    return null;
  }
  public PanelField: React.FC = () => {
    return null;
  };
}`,
      },
      {
        name: 'parity: a static component, both spellings',
        filename: 'Centralizer.tsx',
        code: `class Centralizer {
  public static Panel() {
    return <div />;
  }
  public static PanelField = () => {
    return <div />;
  };
}`,
        parserOptions: jsx,
      },

      // A type-only overload signature declares the same member as the
      // implementation beside it. Adding one changes no runtime semantics, so
      // it cannot change the answer either: the whole set speaks with the voice
      // of the declaration that carries the body (#2168).
      {
        name: 'an overloaded component method, signature and implementation',
        filename: 'Centralizer.tsx',
        code: `class Centralizer {
  Panel(): JSX.Element;
  Panel(props?: { id: string }) {
    return <div />;
  }
}`,
        parserOptions: jsx,
      },
      {
        name: 'several overload signatures on one component member',
        filename: 'Centralizer.tsx',
        code: `class Centralizer {
  Panel(): JSX.Element;
  Panel(props: { id: string }): JSX.Element;
  Panel(props?: { id: string }) {
    return <div />;
  }
}`,
        parserOptions: jsx,
      },
      {
        name: 'an overload signature on a static component method',
        filename: 'Centralizer.tsx',
        code: `class Centralizer {
  public static Panel(): JSX.Element;
  public static Panel(props?: { id: string }) {
    return <div />;
  }
}`,
        parserOptions: jsx,
      },
      {
        // The implementation owns the evidence in a `.ts` file too, where the
        // exemption is earned by rendering rather than by the file extension.
        name: 'an overloaded component method rendering through createElement in a .ts file',
        code: `class Centralizer {
  Panel(): React.JSX.Element;
  Panel(props?: Props) {
    return React.createElement('div');
  }
}`,
      },
      {
        name: 'a verb-phrased overload set keeps passing',
        code: `class Service {
  fetchUser(): User;
  fetchUser(id?: string) {
    return this.users[id];
  }
}`,
      },
    ],
    invalid: [
      // The load-bearing controls: real agora methods that must keep reporting.
      {
        name: 'a parameterless data accessor method in a .ts file',
        code: `class DocumentSnapshotAdapter {
  public data(): TData | undefined {
    return undefined;
  }
}`,
        errors: [
          {
            messageId: 'functionVerbPhrase',
            data: { name: 'data' },
            line: 2,
            column: 10,
          },
        ],
      },
      {
        name: 'a parameterless collection accessor method in a .ts file',
        code: `class SubgroupFactory {
  public all() {
    return this.subgroups;
  }
}`,
        errors: [{ messageId: 'functionVerbPhrase', data: { name: 'all' } }],
      },
      {
        name: 'a noun-named method returning a string',
        code: `class CryptoChain {
  public explorerAddressLink(address: string): string {
    return address;
  }
}`,
        errors: [
          {
            messageId: 'functionVerbPhrase',
            data: { name: 'explorerAddressLink' },
          },
        ],
      },
      {
        name: 'a noun-named static builder method',
        code: `class SlackBlockBuilder {
  public static markdown(text: string): MarkdownBlock {
    return { text };
  }
}`,
        errors: [
          { messageId: 'functionVerbPhrase', data: { name: 'markdown' } },
        ],
      },
      {
        name: 'a second noun-named static builder method',
        code: `class SlackBlockBuilder {
  public static bold(text: string) {
    return text;
  }
}`,
        errors: [{ messageId: 'functionVerbPhrase', data: { name: 'bold' } }],
      },

      // The `.ts` vs `.tsx` asymmetry survives: PascalCase alone is not
      // component evidence in a file that cannot hold JSX.
      {
        name: 'a PascalCase method with no component evidence in a .ts file',
        code: `class Centralizer {
  public Panel() {
    return 1;
  }
}`,
        errors: [{ messageId: 'functionVerbPhrase', data: { name: 'Panel' } }],
      },
      {
        name: 'a PascalCase method returning a string in a .ts file',
        code: `class CryptoChain {
  public ExplorerLink(address: string): string {
    return address;
  }
}`,
        errors: [
          { messageId: 'functionVerbPhrase', data: { name: 'ExplorerLink' } },
        ],
      },
      {
        name: 'a PascalCase method returning data in a .ts file',
        code: `class Registry {
  public UserRecord(row) {
    return { row };
  }
}`,
        errors: [
          { messageId: 'functionVerbPhrase', data: { name: 'UserRecord' } },
        ],
      },
      {
        // A generator cannot be a component, so PascalCase does not buy it the
        // carve-out even where the other evidence would.
        name: 'a PascalCase generator method',
        code: `class Centralizer {
  *Panel() {
    yield 1;
  }
}`,
        errors: [{ messageId: 'functionVerbPhrase', data: { name: 'Panel' } }],
      },
      {
        name: 'an async PascalCase method with no JSX in a .ts file',
        code: `class Centralizer {
  async Panel() {
    return 1;
  }
}`,
        errors: [{ messageId: 'functionVerbPhrase', data: { name: 'Panel' } }],
      },
      {
        // A computed key is an expression, not a member name, so it carries no
        // name for the carve-out to read — the identifier inside it is judged
        // exactly as it was before the carve-out reached methods.
        name: 'a computed-key method',
        code: `const data = 'x';
class Service {
  [data]() {
    return 1;
  }
}`,
        errors: [
          {
            messageId: 'functionVerbPhrase',
            data: { name: 'data' },
            line: 3,
            column: 4,
          },
        ],
      },
      {
        name: 'a computed-key method in a .tsx file returning JSX',
        filename: 'Centralizer.tsx',
        code: `const Panel = 'x';
class Centralizer {
  [Panel]() {
    return <div />;
  }
}`,
        parserOptions: jsx,
        errors: [{ messageId: 'functionVerbPhrase', data: { name: 'Panel' } }],
      },
      {
        name: 'a noun-named method with no JSX in a .tsx file',
        filename: 'Widget.tsx',
        code: `class Widget {
  public userProfile() {
    return { name: 'John' };
  }
}`,
        parserOptions: jsx,
        errors: [
          { messageId: 'functionVerbPhrase', data: { name: 'userProfile' } },
        ],
      },
      {
        name: 'an empty-bodied noun-named method',
        code: `class Service {
  data() {}
}`,
        errors: [{ messageId: 'functionVerbPhrase', data: { name: 'data' } }],
      },
      {
        // Each overload signature is its own `MethodDefinition`, so a member
        // whose implementation is no component draws a report on every line
        // that spells its name.
        name: 'overload signatures each report',
        code: `class Service {
  data(a: string): void;
  data(a: number): void;
  data(a: any) {}
}`,
        errors: [
          { messageId: 'functionVerbPhrase', data: { name: 'data' }, line: 2 },
          { messageId: 'functionVerbPhrase', data: { name: 'data' }, line: 3 },
          { messageId: 'functionVerbPhrase', data: { name: 'data' }, line: 4 },
        ],
      },
      {
        name: 'a method of an ambient class declaration',
        code: `declare class Service {
  data(): void;
}`,
        errors: [{ messageId: 'functionVerbPhrase', data: { name: 'data' } }],
      },
      {
        // A `set` accessor is an assignment target rather than a callable, so
        // it can never be a component. Its PascalCase spelling in a `.tsx`
        // file is the exact shape a blanket method skip would have swallowed.
        name: 'a noun-named setter still reports',
        code: `class Service {
  set data(value) {}
}`,
        errors: [{ messageId: 'functionVerbPhrase', data: { name: 'data' } }],
      },
      {
        name: 'a PascalCase setter in a .tsx file still reports',
        filename: 'Centralizer.tsx',
        code: `class Centralizer {
  set Panel(value) {}
}`,
        parserOptions: jsx,
        errors: [{ messageId: 'functionVerbPhrase', data: { name: 'Panel' } }],
      },
      {
        // The carve-out is per member, not per class.
        name: 'a noun-named method beside a component method in a .tsx file',
        filename: 'Centralizer.tsx',
        code: `class Centralizer {
  public Panel() {
    return <div />;
  }

  public data() {
    return 1;
  }
}`,
        parserOptions: jsx,
        errors: [
          {
            messageId: 'functionVerbPhrase',
            data: { name: 'data' },
            line: 6,
            column: 10,
          },
        ],
      },
      {
        // A nested declaration is its own name: exempting the enclosing
        // component does not exempt what it declares inside.
        name: 'a nested arrow inside a component method still reports',
        filename: 'Centralizer.tsx',
        code: `class Centralizer {
  public Panel() {
    const data = () => 1;
    return <div>{data()}</div>;
  }
}`,
        parserOptions: jsx,
        errors: [
          {
            messageId: 'functionVerbPhrase',
            data: { name: 'data' },
            line: 3,
            column: 11,
          },
        ],
      },
      {
        // Parity in the reporting direction too: both spellings of one
        // noun-named member draw exactly one report each.
        name: 'the method and field spellings of a noun each report once',
        code: `class Service {
  data() {}
  info = () => {};
}`,
        errors: [
          {
            messageId: 'functionVerbPhrase',
            data: { name: 'data' },
            line: 2,
            column: 3,
          },
          {
            messageId: 'functionVerbPhrase',
            data: { name: 'info' },
            line: 3,
            column: 3,
          },
        ],
      },
      {
        // The `.ts` asymmetry, held against both spellings at once.
        name: 'a PascalCase method and field with no evidence both report',
        code: `class Centralizer {
  public Panel() {
    return 1;
  }
  public PanelField = () => {
    return 1;
  };
}`,
        errors: [
          {
            messageId: 'functionVerbPhrase',
            data: { name: 'Panel' },
            line: 2,
            column: 10,
          },
          {
            messageId: 'functionVerbPhrase',
            data: { name: 'PanelField' },
            line: 5,
            column: 10,
          },
        ],
      },
      {
        // The negative controls for #2168. Deferring a signature to its
        // implementation buys an exemption only where the implementation earns
        // one; anything less would make "carries an overload" a way to opt out
        // of the rule.
        name: 'an overloaded non-component method reports on every declaration',
        code: `class Service {
  data(): string;
  data(x?: number) {
    return 'x';
  }
}`,
        errors: [
          { messageId: 'functionVerbPhrase', data: { name: 'data' }, line: 2 },
          { messageId: 'functionVerbPhrase', data: { name: 'data' }, line: 3 },
        ],
      },
      {
        // The implementation owns the answer, and a lowercase name taking no
        // props is no component however much JSX it returns — the React type
        // on the signature does not rescue it.
        name: 'an overloaded lowercase method returning JSX still reports',
        filename: 'Widget.tsx',
        code: `class Widget {
  panel(): JSX.Element;
  panel(id?: string) {
    return <div id={id} />;
  }
}`,
        parserOptions: jsx,
        errors: [
          { messageId: 'functionVerbPhrase', data: { name: 'panel' }, line: 2 },
          { messageId: 'functionVerbPhrase', data: { name: 'panel' }, line: 3 },
        ],
      },
      {
        // The `.ts` asymmetry survives the overload set: an annotation that
        // names no React type is no evidence, on a signature or anywhere else.
        name: 'an overloaded PascalCase method with no render evidence in a .ts file',
        code: `class Centralizer {
  Panel(): number;
  Panel(x?: number) {
    return this.value;
  }
}`,
        errors: [
          { messageId: 'functionVerbPhrase', data: { name: 'Panel' }, line: 2 },
          { messageId: 'functionVerbPhrase', data: { name: 'Panel' }, line: 3 },
        ],
      },
      {
        // A signature resolves to the implementation of its own member, keyed
        // on staticness as well as on name, so the static set cannot inherit
        // the exemption the instance set earns.
        name: 'a static overload set beside an instance component of the same name',
        code: `class Centralizer {
  Panel(): React.JSX.Element;
  Panel(props?: Props) {
    return React.createElement('div');
  }
  public static Panel(): number;
  public static Panel(x?: number) {
    return 1;
  }
}`,
        errors: [
          {
            messageId: 'functionVerbPhrase',
            data: { name: 'Panel' },
            line: 6,
            column: 17,
          },
          {
            messageId: 'functionVerbPhrase',
            data: { name: 'Panel' },
            line: 7,
            column: 17,
          },
        ],
      },
      {
        // A method's name is a member rather than a lexical binding, so an
        // unrelated module-level `Panel` used as a component says nothing about
        // it. Without this the carve-out would leak across symbols.
        name: 'a method sharing a name with a module-level component reports',
        code: `const Panel = () => null;
export default memo(Panel);
class Centralizer {
  public Panel() {
    return 1;
  }
}`,
        errors: [
          {
            messageId: 'functionVerbPhrase',
            data: { name: 'Panel' },
            line: 4,
            column: 10,
          },
        ],
      },
    ],
  },
);
