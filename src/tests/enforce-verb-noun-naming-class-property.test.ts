import { ruleTesterTs } from '../utils/ruleTester';
import { enforceVerbNounNaming } from '../rules/enforce-verb-noun-naming';

/**
 * Issue #2160: a callable class field — `data = () => {}` — is the same member
 * as `data() {}` with one token changed, and `this.data()` reads identically at
 * every call site, so writing `=` must not be a way to opt out of the naming
 * rule. These fixtures pin both halves: the field spelling is judged exactly as
 * the method spelling is, and a field that holds DATA rather than an action
 * stays a noun phrase.
 */
const jsx = { ecmaFeatures: { jsx: true } };

ruleTesterTs.run(
  'enforce-verb-noun-naming-class-property',
  enforceVerbNounNaming,
  {
    valid: [
      // Verb-phrased callable fields, across the modifiers a class member takes.
      {
        name: 'a verb-phrased field arrow',
        code: `class Service {
  fetchData = () => {};
}`,
      },
      {
        name: 'a verb-phrased async field arrow',
        code: `class Service {
  processQueue = async () => {};
}`,
      },
      {
        name: 'a verb-phrased field holding a function expression',
        code: `class Service {
  buildReport = function () { return null; };
}`,
      },
      {
        name: 'a verb-phrased private static field arrow',
        code: `class Service {
  private static syncCache = () => {};
}`,
      },
      {
        name: 'a verb-phrased field of a class expression',
        code: `const Service = class {
  fetchData = () => {};
};`,
      },
      {
        name: 'an event handler field, whose leading word is allowlisted',
        code: `class Widget {
  handleClick = () => {};
  onSelect = () => {};
}`,
      },
      {
        name: 'an entry-point field named by the domain allowlist',
        code: `class App {
  main = () => {};
  toString = () => '';
}`,
      },

      // Fields that hold DATA keep noun phrases: the value gate is the whole
      // difference between a member that names an action and one that does not.
      {
        name: 'a numeric data field',
        code: `class Service {
  data = 42;
}`,
      },
      {
        name: 'an object data field',
        code: `class Service {
  userProfile = { name: 'John' };
}`,
      },
      {
        name: 'a data field holding a constructed value',
        code: `class Service {
  valueListeners = new Map();
}`,
      },
      {
        name: 'a data field initialized from a call',
        code: `class Service {
  data = loadData();
}`,
      },
      {
        name: 'a data field initialized from a conditional',
        code: `class Service {
  data = isEnabled ? primary : fallback;
}`,
      },
      {
        name: 'an uninitialized field',
        code: `class Service {
  data: () => void;
}`,
      },

      // Keys that are not plain identifiers carry no name to judge or rename.
      {
        name: 'a computed key',
        code: `const key = 'data';
class Service {
  [key] = () => {};
}`,
      },
      {
        name: 'a string-literal key',
        code: `class Service {
  'data' = () => {};
}`,
      },
      {
        name: 'a declare field, which restates a member initialized elsewhere',
        code: `class Service {
  declare data: () => void;
}`,
      },
      {
        name: 'an abstract field declaration',
        code: `abstract class Service {
  abstract data: () => void;
}`,
      },

      // React components are nouns by convention, and a class holds one in a
      // field precisely so it can close over `this`.
      {
        name: 'a component field in a .tsx file',
        filename: 'Centralizer.tsx',
        code: `class Centralizer {
  public EditableArray = (props) => {
    return <div {...props} />;
  };
}`,
        parserOptions: jsx,
      },
      {
        name: 'a generic component field in a .tsx file',
        filename: 'Centralizer.tsx',
        code: `class Centralizer {
  public EditableArray = <TValue,>({ path }: Props<TValue>) => {
    return <div id={path} />;
  };
}`,
        parserOptions: jsx,
      },
      {
        name: 'a component field that renders nothing',
        filename: 'Centralizer.tsx',
        code: `class Centralizer {
  public Panel = () => {
    return null;
  };
}`,
        parserOptions: jsx,
      },
      {
        name: 'a component field annotated React.FC in a .ts file',
        code: `class Centralizer {
  public Panel: React.FC = () => {
    return null;
  };
}`,
      },
      {
        name: 'a lowercase field annotated FC in a .ts file',
        code: `class Centralizer {
  public panel: FC<Props> = (props) => {
    return null;
  };
}`,
      },
      {
        name: 'a lowercase field taking props and returning JSX',
        filename: 'Widget.tsx',
        code: `class Widget {
  widget = (props) => {
    return <div {...props} />;
  };
}`,
        parserOptions: jsx,
      },
      {
        name: 'an Unmemoized component field',
        filename: 'Widget.tsx',
        code: `class Widget {
  WidgetUnmemoized = (props) => {
    return <div {...props} />;
  };
}`,
        parserOptions: jsx,
      },

      // The neighbouring member kinds keep the behaviour they had: a getter
      // represents a property, and a constructor is not a named action.
      {
        name: 'a getter beside a callable field',
        code: `class Service {
  get data() { return null; }
  fetchData = () => {};
}`,
      },
      {
        name: 'a constructor assigning a data property',
        code: `class Service {
  constructor(name) {
    this.name = name;
  }
}`,
      },
    ],
    invalid: [
      {
        name: 'a noun-named class field holding an arrow reports once',
        code: `class Service {
  data = () => {};
}`,
        errors: [
          {
            messageId: 'functionVerbPhrase',
            data: { name: 'data' },
            line: 2,
            column: 3,
          },
        ],
      },
      {
        name: 'a public noun-named field arrow',
        code: `class Service {
  public data = () => {};
}`,
        errors: [{ messageId: 'functionVerbPhrase', data: { name: 'data' } }],
      },
      {
        name: 'a private noun-named field arrow',
        code: `class Service {
  private data = () => {};
}`,
        errors: [{ messageId: 'functionVerbPhrase', data: { name: 'data' } }],
      },
      {
        name: 'a protected noun-named field arrow',
        code: `class Service {
  protected data = () => {};
}`,
        errors: [{ messageId: 'functionVerbPhrase', data: { name: 'data' } }],
      },
      {
        name: 'a static noun-named field arrow',
        code: `class Service {
  static data = () => {};
}`,
        errors: [{ messageId: 'functionVerbPhrase', data: { name: 'data' } }],
      },
      {
        name: 'a public readonly noun-named field arrow',
        code: `class Service {
  public readonly data = () => {};
}`,
        errors: [{ messageId: 'functionVerbPhrase', data: { name: 'data' } }],
      },
      {
        name: 'a noun-named async field arrow',
        code: `class Service {
  data = async () => {};
}`,
        errors: [{ messageId: 'functionVerbPhrase', data: { name: 'data' } }],
      },
      {
        name: 'a noun-named field holding a function expression',
        code: `class Service {
  data = function () { return null; };
}`,
        errors: [{ messageId: 'functionVerbPhrase', data: { name: 'data' } }],
      },
      {
        name: 'a noun-named field annotated with a function type',
        code: `class Service {
  data: () => void = () => {};
}`,
        errors: [{ messageId: 'functionVerbPhrase', data: { name: 'data' } }],
      },
      {
        name: 'a decorated noun-named field arrow',
        code: `class Service {
  @bound
  data = () => {};
}`,
        errors: [{ messageId: 'functionVerbPhrase', data: { name: 'data' } }],
      },
      {
        name: 'a noun-named field of a class expression',
        code: `const Service = class {
  data = () => {};
};`,
        errors: [{ messageId: 'functionVerbPhrase', data: { name: 'data' } }],
      },
      {
        name: 'a noun-named field of a class declared inside a function',
        code: `function buildService() {
  class Service {
    data = () => {};
  }
  return Service;
}`,
        errors: [{ messageId: 'functionVerbPhrase', data: { name: 'data' } }],
      },
      {
        name: 'the field spelling of a real agora member',
        code: `class FirebaseRegistryMock {
  public readonly ref = (database, path) => {
    return { path };
  };
}`,
        errors: [{ messageId: 'functionVerbPhrase', data: { name: 'ref' } }],
      },
      {
        // Both spellings of the same member draw exactly one report each, which
        // is what pins that neither arm double-reports on the other's node.
        name: 'the method and field spellings each report once',
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
        name: 'two noun-named fields report once each',
        code: `class Service {
  data = () => {};
  info = () => {};
}`,
        errors: [
          { messageId: 'functionVerbPhrase', data: { name: 'data' } },
          { messageId: 'functionVerbPhrase', data: { name: 'info' } },
        ],
      },
      {
        // A nested declaration is its own name: the field arm reports the
        // member and the variable arm reports the local, with no overlap.
        name: 'a nested arrow inside a field body reports separately',
        code: `class Service {
  data = () => {
    const info = () => null;
    return info;
  };
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
            column: 11,
          },
        ],
      },
      {
        // Negative control for the component carve-out: the same PascalCase
        // name in a .ts file with nothing React about it still reports, so the
        // silence above is the exemption doing the work rather than the name.
        name: 'a PascalCase field with no component evidence still reports',
        code: `class Centralizer {
  public EditableArray = () => {
    return 1;
  };
}`,
        errors: [
          {
            messageId: 'functionVerbPhrase',
            data: { name: 'EditableArray' },
          },
        ],
      },
      {
        name: 'a PascalCase field returning data still reports',
        code: `class Registry {
  public UserRecord = (row) => {
    return { row };
  };
}`,
        errors: [
          { messageId: 'functionVerbPhrase', data: { name: 'UserRecord' } },
        ],
      },
      {
        // Scope pin for #2160: the object-method spelling stays unreachable and
        // that gap is deliberate rather than forgotten. It rides in an invalid
        // case so the exact report count witnesses the silence — a `valid`
        // fixture would assert the same thing while moving a composition
        // guard's baseline.
        name: 'an object method beside a reporting field stays silent',
        code: `class Service {
  data = () => {};
}
const helper = {
  data() {},
};`,
        errors: [
          {
            messageId: 'functionVerbPhrase',
            data: { name: 'data' },
            line: 2,
            column: 3,
          },
        ],
      },
      {
        // The neighbouring surface the docs do not promise: an object property
        // holding an arrow is not a method, and stays out of scope too.
        name: 'an object property arrow beside a reporting field stays silent',
        code: `class Service {
  data = () => {};
}
const helper = {
  data: () => {},
};`,
        errors: [
          {
            messageId: 'functionVerbPhrase',
            data: { name: 'data' },
            line: 2,
            column: 3,
          },
        ],
      },
      {
        // A data field beside a callable one: exactly one report, proving the
        // value gate discriminates rather than the class doing so.
        name: 'only the callable field of a mixed class reports',
        code: `class Service {
  data = 42;
  info = () => {};
  listeners = new Map();
}`,
        errors: [
          {
            messageId: 'functionVerbPhrase',
            data: { name: 'info' },
            line: 3,
            column: 3,
          },
        ],
      },
      {
        // The component carve-out is per member, not per class.
        name: 'a noun-named field beside a component field in a .tsx file',
        filename: 'Centralizer.tsx',
        code: `class Centralizer {
  public EditableArray = (props) => {
    return <div {...props} />;
  };

  public data = () => {
    return 1;
  };
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
    ],
  },
);
