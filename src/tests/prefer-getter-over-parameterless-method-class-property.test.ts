import { preferGetterOverParameterlessMethod } from '../rules/prefer-getter-over-parameterless-method';
import { ruleTesterTs } from '../utils/ruleTester';

/**
 * The class-FIELD spelling of a member function (#2158). `fullName() { ... }`
 * and `fullName = () => { ... }` are invoked identically — `instance.fullName()`
 * — so writing `=` must not silence the rule. Every gate the method arm applies
 * applies here too; the field arm adds two of its own (a concise body that could
 * equally be a command, and a member handed around as a detached function) and
 * never offers a fixer, which is why every invalid case pins `output: null`.
 */
ruleTesterTs.run(
  'prefer-getter-over-parameterless-method (class property)',
  preferGetterOverParameterlessMethod,
  {
    valid: [
      // A data field is not a member function at all.
      `
      class Counter {
        count = 0;
      }
      `,

      // A field whose function takes parameters stays a function.
      `
      class Calculator {
        sum = (a: number, b: number) => {
          return a + b;
        };
      }
      `,

      // No return value: the field is an action, exactly as its method twin is.
      `
      class Logger {
        log = () => {
          console.log('log');
        };
      }
      `,

      // The field's own annotation says void, so nothing is handed back.
      `
      class Painter {
        render: () => void = () => {
          return this.draw();
        };
      }
      `,

      // Async fields are actions.
      `
      class TokenStore {
        fetchToken = async () => {
          return 'token';
        };
      }
      `,

      // A promise without the async keyword is still asynchronous.
      `
      class Session {
        readEpoch = () => {
          return Promise.resolve('epoch');
        };
      }
      `,

      // The field's annotation carries the promise contract.
      `
      class Session {
        readEpoch: () => Promise<string> = () => {
          return this.load();
        };
      }
      `,

      // A generator hands back an iterator through a protocol getters lack.
      `
      class Sequence {
        iterate = function* () {
          yield 1;
        };
      }
      `,

      // Type parameters cannot be written on a getter.
      `
      class Registry {
        derive = <T>() => {
          return [] as T[];
        };
      }
      `,

      // A computed key's name is not statically known.
      `
      class Dynamic {
        ['fullName'] = () => {
          return this.first;
        };
      }
      `,

      // A declaration-only field restates a member declared elsewhere.
      `
      class Ambient {
        declare fullName: () => string;
      }
      `,

      // An optional field with no initializer carries no function to judge.
      `
      class Partial {
        fullName?: () => string;
      }
      `,

      // An abstract field declares no body, so there is nothing to convert.
      `
      abstract class BaseParser {
        abstract parse: () => string;
      }
      `,

      // Ignore-listed names are exempt in either spelling.
      `
      class Model {
        toJSON = () => {
          return this.data;
        };
      }
      `,

      // Factory/builder terminals are imperative actions.
      `
      class ThingBuilder {
        build = () => {
          return new Thing(this.parts);
        };
      }
      `,

      // A top-level throw makes the member an assertion, not a property read.
      `
      class ConfigHolder {
        getConfig = () => {
          if (!this.config) {
            throw new Error('missing config');
          }
          return this.config;
        };
      }
      `,

      // A declared side effect is honoured in the field spelling too.
      `
      class Counter {
        count = 0;

        /**
         * @sideEffect increments internal counter
         */
        getNextId = () => {
          return ++this.count;
        };
      }
      `,

      // An in-file contract that declares the member as a method binds the
      // field: a getter would not satisfy the interface.
      `
      interface Countable {
        count(): number;
      }

      class Counter implements Countable {
        count = () => {
          return 1;
        };
      }
      `,

      // An in-file contract declaring a function-typed member binds too.
      `
      type Handler = {
        handle: () => number;
      };

      class Worker implements Handler {
        handle = () => {
          return 1;
        };
      }
      `,

      // Heritage that leaves the file makes every member of the class
      // unprovable, so none of them is reported.
      `
      import { Base } from './base';

      class Derived extends Base {
        compute = () => {
          return 1;
        };
      }
      `,

      // The arrow spelling exists to be detached: handing the member to another
      // API as a function reference is exactly what a getter would break.
      `
      class Watcher {
        private getSnapshot = () => {
          return this.state;
        };

        attach(store: Store) {
          store.on('change', this.getSnapshot);
        }
      }
      `,

      // Reading the member off `this` without calling it is the same detachment.
      `
      class Watcher {
        private getSnapshot = () => {
          return this.state;
        };

        attach(store: Store) {
          const snapshot = this.getSnapshot;
          store.register(snapshot);
        }
      }
      `,

      // JSX takes the function value too — `<this.Panel />` invokes the
      // component itself — through a node the member trackers never see.
      {
        code: `
class Screen {
  private Panel = () => {
    return <div />;
  };

  mountInto(host: Host) {
    host.render(<this.Panel />);
  }
}
`,
        filename: 'Screen.tsx',
        parserOptions: { ecmaFeatures: { jsx: true } },
      },

      // A body shorter than minBodyLines is below the configured threshold.
      {
        code: `
      class Small {
        getValue = () => {
          return this.value;
        };
      }
      `,
        options: [{ minBodyLines: 5 }],
      },

      // An explicitly ignored name is exempt in the field spelling.
      {
        code: `
      class Report {
        getSummary = () => {
          return this.summary;
        };
      }
      `,
        options: [{ ignoredMethods: ['getSummary'] }],
      },
    ],

    invalid: [
      // The reproduction from #2158: the byte-equivalent of a reported method.
      {
        code: `
class UserB {
  public fullName = () => {
    return this.first + this.last;
  };
}
`,
        output: null,
        errors: [
          {
            messageId: 'preferGetter',
            data: { name: 'fullName', suggestedName: 'fullName' },
          },
        ],
      },

      // A concise body whose expression can only be a value.
      {
        code: `
class UserC {
  public fullName = () => this.first + this.last;
}
`,
        output: null,
        errors: [{ messageId: 'preferGetter' }],
      },

      // A body that hands back a CALL is judged the same whichever way the
      // body is spelled. Reading the concise spelling as a command and the
      // block spelling as a value would split one member in two, and the
      // distinction has no basis: `hash(this.json)` and `this.reload()` are
      // the same syntax, so only the rule's own side-effect gates (JSDoc,
      // top-level throw, mutation analysis) can tell a command from a value.
      {
        code: `
class Feed {
  refresh = () => this.reload();
}
`,
        output: null,
        errors: [{ messageId: 'preferGetter' }],
      },

      // The block spelling of the member above, pinned beside it so the two
      // cannot drift apart again (#2158).
      {
        code: `
class FeedBlock {
  refresh = () => {
    return this.reload();
  };
}
`,
        output: null,
        errors: [{ messageId: 'preferGetter' }],
      },

      // The function-expression spelling of the same member.
      {
        code: `
class UserD {
  public fullName = function () {
    return this.first + this.last;
  };
}
`,
        output: null,
        errors: [{ messageId: 'preferGetter' }],
      },

      // No accessibility modifier at all.
      {
        code: `
class UserE {
  fullName = () => {
    return this.first + this.last;
  };
}
`,
        output: null,
        errors: [{ messageId: 'preferGetter' }],
      },

      // `private` does NOT unlock the fixer for a field: converting an own
      // enumerable property into a prototype accessor is not a change this
      // rule can prove safe from one file.
      {
        code: `
class Canonicalizer {
  private computeFingerprint = () => {
    return hash(this.json);
  };
}
`,
        output: null,
        errors: [
          {
            messageId: 'preferGetter',
            data: {
              name: 'computeFingerprint',
              suggestedName: 'fingerprint',
            },
          },
        ],
      },

      // `protected` members are reported like any other.
      {
        code: `
class Protected {
  protected computeTotal = () => {
    return this.items.length;
  };
}
`,
        output: null,
        errors: [{ messageId: 'preferGetter' }],
      },

      // A static field converts to a static getter.
      {
        code: `
class MatchPreviewer {
  static computeBase = () => {
    return { mode: 'ranked' };
  };
}
`,
        output: null,
        errors: [{ messageId: 'preferGetter' }],
      },

      // `readonly` is not a reason to stay a field: a getter without a setter
      // is read-only by construction, so the remedy remains legal.
      {
        code: `
class Frozen {
  private readonly computeKey = () => {
    return this.parts.join('/');
  };
}
`,
        output: null,
        errors: [{ messageId: 'preferGetter' }],
      },

      // An ECMA private name keeps its sigil in the suggestion.
      {
        code: `
class Canonicalizer {
  #computeFingerprint = () => {
    return this.#json;
  };
}
`,
        output: null,
        errors: [
          {
            messageId: 'preferGetter',
            data: {
              name: '#computeFingerprint',
              suggestedName: '#fingerprint',
            },
          },
        ],
      },

      // A non-thenable return annotation keeps the member reportable.
      {
        code: `
class Named {
  public fetchName = (): string => {
    return this.name;
  };
}
`,
        output: null,
        errors: [{ messageId: 'preferGetter' }],
      },

      // Mutation in the body downgrades to the side-effect message.
      {
        code: `
class Counter {
  private count = 0;

  getNextId = () => {
    return ++this.count;
  };
}
`,
        output: null,
        errors: [{ messageId: 'preferGetterSideEffect' }],
      },

      // Calling the member on `this` is not detachment: the call site reads
      // `this.fullName()` exactly as the method spelling does.
      {
        code: `
class UserF {
  fullName = () => {
    return this.first + this.last;
  };

  describe(prefix: string) {
    return prefix + this.fullName();
  }
}
`,
        output: null,
        errors: [{ messageId: 'preferGetter' }],
      },

      // Two fields in one class report exactly twice — no visitor sees either
      // member more than once.
      {
        code: `
class Pair {
  computeLeft = () => {
    return this.left;
  };

  computeRight = () => {
    return this.right;
  };
}
`,
        output: null,
        errors: [{ messageId: 'preferGetter' }, { messageId: 'preferGetter' }],
      },

      // A method and a field in one class report once each.
      {
        code: `
class Mixed {
  public computeLeft() {
    return this.left;
  }

  public computeRight = () => {
    return this.right;
  };
}
`,
        output: null,
        errors: [{ messageId: 'preferGetter' }, { messageId: 'preferGetter' }],
      },

      // An in-file contract that does NOT declare the member leaves it
      // reportable, exactly as for a method.
      {
        code: `
interface Countable {
  count(): number;
}

class Counter implements Countable {
  count() {
    return 1;
  }

  computeLabel = () => {
    return String(this.count());
  };
}
`,
        output: null,
        errors: [{ messageId: 'preferGetter' }],
      },

      // `override` spares the derived member (the base declares it), while the
      // base's own field is an ordinary candidate.
      {
        code: `
class Base {
  compute = () => {
    return 1;
  };
}

class Derived extends Base {
  override compute = () => {
    return 2;
  };
}
`,
        output: null,
        errors: [{ messageId: 'preferGetter' }],
      },

      // A concise object-literal body is a value in any reading.
      {
        code: `
class MatchPreviewer {
  public buildBase = () => ({ mode: 'ranked' });
}
`,
        output: null,
        errors: [{ messageId: 'preferGetter' }],
      },

      // A concise member-expression body.
      {
        code: `
class Wrapper {
  public getInner = () => this.inner;
}
`,
        output: null,
        errors: [
          {
            messageId: 'preferGetter',
            data: { name: 'getInner', suggestedName: 'inner' },
          },
        ],
      },

      // A concise conditional body.
      {
        code: `
class Label {
  public deriveLabel = () => (this.short ? this.abbr : this.full);
}
`,
        output: null,
        errors: [{ messageId: 'preferGetter' }],
      },

      // A JSX-returning field nothing renders as a component is judged like any
      // other value-returning member, exactly as its method twin is.
      {
        code: `
class Screen {
  private buildPanel = () => {
    return <div />;
  };
}
`,
        filename: 'Screen.tsx',
        parserOptions: { ecmaFeatures: { jsx: true } },
        output: null,
        errors: [{ messageId: 'preferGetter' }],
      },

      // JSDoc that mentions no side effect does not exempt the field.
      {
        code: `
class Documented {
  /**
   * The canonical identifier.
   */
  computeId = () => {
    return this.parts.join('-');
  };
}
`,
        output: null,
        errors: [{ messageId: 'preferGetter' }],
      },

      // A body long enough to clear an explicit minBodyLines threshold.
      {
        code: `
class Long {
  getValue = () => {
    const first = this.a;
    const second = this.b;
    const third = this.c;
    return first + second + third;
  };
}
`,
        options: [{ minBodyLines: 3 }],
        output: null,
        errors: [{ messageId: 'preferGetter' }],
      },

      // Custom stripPrefixes reach the field spelling too.
      {
        code: `
class Custom {
  assembleReport = () => {
    return this.rows.join('');
  };
}
`,
        options: [{ stripPrefixes: ['assemble'] }],
        output: null,
        errors: [
          {
            messageId: 'preferGetter',
            data: { name: 'assembleReport', suggestedName: 'report' },
          },
        ],
      },

      // With ignoreAsync disabled, an async field is reported like an async
      // method — and still never fixed.
      {
        code: `
class TokenStore {
  private fetchToken = async () => {
    return 'token';
  };
}
`,
        options: [{ ignoreAsync: false }],
        output: null,
        errors: [{ messageId: 'preferGetter' }],
      },

      // Detaching a DIFFERENT member does not spare this one: the withholding
      // is keyed on the member's own name.
      {
        code: `
class Holder {
  computeSize = () => {
    return this.items.length;
  };

  onChange = (event: Event) => {
    this.refresh(event);
  };

  attach(store: Store) {
    store.on('change', this.onChange);
  }
}
`,
        output: null,
        errors: [{ messageId: 'preferGetter' }],
      },
    ],
  },
);
