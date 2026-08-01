import { Linter, Rule } from 'eslint';
import { ruleTesterJsx } from '../utils/ruleTester';
import { optimizeObjectBooleanConditions } from '../rules/optimize-object-boolean-conditions';
import { enforceBooleanNamingPrefixes } from '../rules/enforce-boolean-naming-prefixes';

const buildMessage = (
  expression: string,
  objectName: string,
  suggestedName: string,
) =>
  `Dependency array includes boolean condition "${expression}" derived from object "${objectName}". Hook re-runs every time the object reference changes even when the boolean outcome stays the same, leading to wasted renders and unstable memoization. Extract the condition into a stable boolean like "${suggestedName}" and depend on that variable instead.`;

const buildError = (
  expression: string,
  objectName: string,
  suggestedName: string,
) => ({
  messageId: 'extractBooleanCondition' as const,
  data: {
    expression,
    suggestedName,
    objectName,
  },
});

// enforce-boolean-naming-prefixes *requires* booleans to be named is*/has*/can*
// /should*, so a name it mandates must never be reported as an object here.
// Both rules ship as 'error' in the recommended config, which makes any overlap
// an unresolvable conflict for consumers (issue #1569).
describe('optimize-object-boolean-conditions vs enforce-boolean-naming-prefixes', () => {
  const lintWithBothRules = (code: string) => {
    const linter = new Linter();
    linter.defineParser(
      '@typescript-eslint/parser',
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@typescript-eslint/parser'),
    );
    linter.defineRule(
      'test/optimize-object-boolean-conditions',
      optimizeObjectBooleanConditions as unknown as Rule.RuleModule,
    );
    linter.defineRule(
      'test/enforce-boolean-naming-prefixes',
      enforceBooleanNamingPrefixes as unknown as Rule.RuleModule,
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
          'test/optimize-object-boolean-conditions': 'error' as const,
          'test/enforce-boolean-naming-prefixes': 'error' as const,
        },
      },
      'Panel.tsx',
    );
  };

  it('leaves a mandated boolean prop name clean under both rules', () => {
    const messages = lintWithBothRules(
      `type PanelProps = { isCollapsed: boolean; onToggle: () => void };
const PanelUnmemoized = ({ isCollapsed, onToggle }: PanelProps) => {
  useEffect(() => {
    onToggle();
  }, [!isCollapsed, onToggle]);
  return null;
};`,
    );

    expect(messages).toEqual([]);
  });

  it('still reports the object dependency it was written for', () => {
    const messages = lintWithBothRules(
      `useEffect(() => {
  hydrate(roundPreviews);
}, [!roundPreviews]);`,
    );

    expect(messages.map((message) => message.ruleId)).toEqual([
      'test/optimize-object-boolean-conditions',
    ]);
  });
});

describe('optimize-object-boolean-conditions messages', () => {
  it('explains the risk and how to resolve it', () => {
    expect(
      optimizeObjectBooleanConditions.meta.messages.extractBooleanCondition,
    ).toBe(
      'Dependency array includes boolean condition "{{expression}}" derived from object "{{objectName}}". Hook re-runs every time the object reference changes even when the boolean outcome stays the same, leading to wasted renders and unstable memoization. Extract the condition into a stable boolean like "{{suggestedName}}" and depend on that variable instead.',
    );
  });

  it('renders a specific message with provided data', () => {
    const template =
      optimizeObjectBooleanConditions.meta.messages.extractBooleanCondition;
    const rendered = template
      .replace('{{expression}}', '!data')
      .replace('{{objectName}}', 'data')
      .replace('{{suggestedName}}', 'hasData');

    expect(rendered).toBe(buildMessage('!data', 'data', 'hasData'));
  });
});

ruleTesterJsx.run(
  'optimize-object-boolean-conditions',
  optimizeObjectBooleanConditions,
  {
    valid: [
      // Already optimized with boolean variables
      {
        code: `
        const hasData = data && Object.keys(data).length > 0;
        const result = useMemo(() => {
          return hasData ? processData() : [];
        }, [hasData, mode]);
      `,
      },
      // Boolean variables with proper naming
      {
        code: `
        const isDataEmpty = !data || Object.keys(data).length === 0;
        const result = useCallback(() => {
          return isDataEmpty ? 'No data' : 'Has data';
        }, [isDataEmpty]);
      `,
      },
      // Primitive dependencies (not objects)
      {
        code: `
        const result = useMemo(() => {
          return count > 0 ? 'positive' : 'zero or negative';
        }, [count > 0]);
      `,
      },
      // String dependencies
      {
        code: `
        const result = useMemo(() => {
          return name.length > 0 ? 'has name' : 'no name';
        }, [name.length > 0]);
      `,
      },
      // Array dependencies (should be allowed)
      {
        code: `
        const result = useMemo(() => {
          return items.length > 0 ? 'has items' : 'no items';
        }, [items.length > 0]);
      `,
      },
      // Hook without dependency array
      {
        code: `
        const result = useMemo(() => {
          return !data || Object.keys(data).length === 0 ? [] : processData();
        });
      `,
      },
      // Non-hook function calls
      {
        code: `
        const result = someFunction(() => {
          return !data || Object.keys(data).length === 0 ? [] : processData();
        }, [!data || Object.keys(data).length === 0]);
      `,
      },
      // Already boolean-named variables
      {
        code: `
        const hasRoundPreviews = roundPreviews && Object.keys(roundPreviews).length > 0;
        const result = useMemo(() => {
          return hasRoundPreviews ? 'has data' : 'no data';
        }, [hasRoundPreviews]);
      `,
      },
      // Variables starting with boolean prefixes
      {
        code: `
        const canProcess = data && data.ready;
        const result = useMemo(() => {
          return canProcess ? processData() : null;
        }, [canProcess]);
      `,
      },
      // Variables starting with 'should'
      {
        code: `
        const shouldRender = items && items.length > 0;
        const result = useMemo(() => {
          return shouldRender ? renderItems() : null;
        }, [shouldRender]);
      `,
      },
      // Variables starting with 'will'
      {
        code: `
        const willUpdate = config && config.autoUpdate;
        const result = useEffect(() => {
          if (willUpdate) startUpdates();
        }, [willUpdate]);
      `,
      },
      // Variables starting with 'was'
      {
        code: `
        const wasLoaded = data && data.loaded;
        const result = useMemo(() => {
          return wasLoaded ? data.content : 'Loading...';
        }, [wasLoaded]);
      `,
      },
      // Variables starting with 'were'
      {
        code: `
        const wereProcessed = items && items.processed;
        const result = useMemo(() => {
          return wereProcessed ? 'Done' : 'Processing...';
        }, [wereProcessed]);
      `,
      },
      // Simple identifier dependencies (not boolean expressions)
      {
        code: `
        const result = useMemo(() => {
          return data ? processData(data) : null;
        }, [data]);
      `,
      },
      // Property access dependencies
      {
        code: `
        const result = useMemo(() => {
          return user.name ? 'Hello ' + user.name : 'Hello Guest';
        }, [user.name]);
      `,
      },
      // Method call dependencies
      {
        code: `
        const result = useMemo(() => {
          return items.map(item => item.id);
        }, [items.map]);
      `,
      },
      // Computed property access
      {
        code: `
        const result = useMemo(() => {
          return obj[key] ? 'found' : 'not found';
        }, [obj[key]]);
      `,
      },
      // Function call dependencies
      {
        code: `
        const result = useMemo(() => {
          return getValue() > 0 ? 'positive' : 'non-positive';
        }, [getValue()]);
      `,
      },
      // Nested object access
      {
        code: `
        const result = useMemo(() => {
          return user.profile.name || 'Anonymous';
        }, [user.profile.name]);
      `,
      },
      // Multiple simple dependencies
      {
        code: `
        const result = useMemo(() => {
          return a + b;
        }, [a, b]);
      `,
      },

      // === EDGE CASES FOR FALSE POSITIVES (should NOT trigger) ===

      // Legitimate object dependency - needs full object reference
      {
        code: `
        const result = useMemo(() => {
          return processEntireObject(obj);
        }, [obj]);
      `,
      },
      // Object spread operation - needs full object
      {
        code: `
        const result = useMemo(() => {
          return { ...obj, newProp: 'value' };
        }, [obj]);
      `,
      },
      // Object serialization - needs full object
      {
        code: `
        const result = useMemo(() => {
          return JSON.stringify(obj);
        }, [obj]);
      `,
      },
      // Object comparison - needs full object reference
      {
        code: `
        const result = useMemo(() => {
          return deepEqual(obj, previousObj);
        }, [obj]);
      `,
      },
      // Object iteration - needs full object
      {
        code: `
        const result = useMemo(() => {
          return Object.entries(obj).map(([key, value]) => ({ key, value }));
        }, [obj]);
      `,
      },
      // Array methods on arrays (not objects)
      {
        code: `
        const result = useMemo(() => {
          return items.filter(item => item.active);
        }, [items]);
      `,
      },
      // String methods
      {
        code: `
        const result = useMemo(() => {
          return text.split(' ').length;
        }, [text]);
      `,
      },
      // Number comparisons
      {
        code: `
        const result = useMemo(() => {
          return count > 0 ? 'positive' : 'zero or negative';
        }, [count]);
      `,
      },
      // Boolean dependencies
      {
        code: `
        const result = useMemo(() => {
          return isActive ? 'active' : 'inactive';
        }, [isActive]);
      `,
      },
      // Date objects
      {
        code: `
        const result = useMemo(() => {
          return date.getTime();
        }, [date]);
      `,
      },
      // Function references
      {
        code: `
        const result = useMemo(() => {
          return callback();
        }, [callback]);
      `,
      },
      // Class instances
      {
        code: `
        const result = useMemo(() => {
          return instance.method();
        }, [instance]);
      `,
      },
      // Map/Set objects
      {
        code: `
        const result = useMemo(() => {
          return map.size > 0;
        }, [map]);
      `,
      },
      // RegExp objects
      {
        code: `
        const result = useMemo(() => {
          return regex.test(input);
        }, [regex]);
      `,
      },
      // Promise objects
      {
        code: `
        const result = useMemo(() => {
          return promise.then(handleResult);
        }, [promise]);
      `,
      },
      // Complex expressions that aren't object boolean conditions
      {
        code: `
        const result = useMemo(() => {
          return a + b > c ? 'greater' : 'lesser';
        }, [a + b > c]);
      `,
      },
      // Ternary expressions with non-object conditions
      {
        code: `
        const result = useMemo(() => {
          return count > 0 ? 'positive' : 'zero or negative';
        }, [count > 0 ? 'positive' : 'zero or negative']);
      `,
      },
      // Logical expressions with primitives
      {
        code: `
        const result = useMemo(() => {
          return (a && b) || c;
        }, [a && b || c]);
      `,
      },
      // Array length checks (not object key counts)
      {
        code: `
        const result = useMemo(() => {
          return items.length === 0 ? 'empty' : 'not empty';
        }, [items.length === 0]);
      `,
      },
      // String length checks
      {
        code: `
        const result = useMemo(() => {
          return text.length > 0 ? 'has text' : 'no text';
        }, [text.length > 0]);
      `,
      },
      // Property access on non-objects
      {
        code: `
        const result = useMemo(() => {
          return array[0] ? 'has first item' : 'no first item';
        }, [array[0]]);
      `,
      },
      // Method calls on primitives
      {
        code: `
        const result = useMemo(() => {
          return number.toString();
        }, [number.toString()]);
      `,
      },
      // Null/undefined checks on primitives
      {
        code: `
        const result = useMemo(() => {
          return value != null ? 'has value' : 'no value';
        }, [value != null]);
      `,
      },
      // Type checks
      {
        code: `
        const result = useMemo(() => {
          return typeof value === 'string' ? 'is string' : 'not string';
        }, [typeof value === 'string']);
      `,
      },
      // instanceof checks
      {
        code: `
        const result = useMemo(() => {
          return value instanceof Date ? 'is date' : 'not date';
        }, [value instanceof Date]);
      `,
      },
      // Array.isArray checks
      {
        code: `
        const result = useMemo(() => {
          return Array.isArray(value) ? 'is array' : 'not array';
        }, [Array.isArray(value)]);
      `,
      },
      // Complex nested property access
      {
        code: `
        const result = useMemo(() => {
          return user.profile.settings.theme;
        }, [user.profile.settings.theme]);
      `,
      },
      // Optional chaining on non-objects
      {
        code: `
        const result = useMemo(() => {
          return array?.[0]?.name;
        }, [array?.[0]?.name]);
      `,
      },
      // Nullish coalescing with primitives
      {
        code: `
        const result = useMemo(() => {
          return value ?? 'default';
        }, [value ?? 'default']);
      `,
      },
      // Bitwise operations
      {
        code: `
        const result = useMemo(() => {
          return flags & FLAG_ACTIVE ? 'active' : 'inactive';
        }, [flags & FLAG_ACTIVE]);
      `,
      },
      // Mathematical operations
      {
        code: `
        const result = useMemo(() => {
          return Math.max(a, b);
        }, [Math.max(a, b)]);
      `,
      },
      // Template literals
      {
        code: `
        const result = useMemo(() => {
          return \`Hello \${name}\`;
        }, [\`Hello \${name}\`]);
      `,
      },
      // Regular expressions
      {
        code: `
        const result = useMemo(() => {
          return /pattern/.test(input);
        }, [/pattern/.test(input)]);
      `,
      },
      // Object methods that don't check existence/count
      {
        code: `
        const result = useMemo(() => {
          return Object.freeze(obj);
        }, [Object.freeze(obj)]);
      `,
      },
      // Object.assign operations
      {
        code: `
        const result = useMemo(() => {
          return Object.assign({}, obj, updates);
        }, [Object.assign({}, obj, updates)]);
      `,
      },
      // Destructuring assignments
      {
        code: `
        const result = useMemo(() => {
          const { prop } = obj;
          return prop;
        }, [obj]);
      `,
      },
      // Array destructuring
      {
        code: `
        const result = useMemo(() => {
          const [first] = items;
          return first;
        }, [items]);
      `,
      },
      // Object property assignment
      {
        code: `
        const result = useMemo(() => {
          obj.newProp = 'value';
          return obj;
        }, [obj]);
      `,
      },
      // Delete operations
      {
        code: `
        const result = useMemo(() => {
          delete obj.prop;
          return obj;
        }, [obj]);
      `,
      },
      // for...in loops
      {
        code: `
        const result = useMemo(() => {
          for (const key in obj) {
            console.log(key);
          }
          return obj;
        }, [obj]);
      `,
      },
      // for...of loops
      {
        code: `
        const result = useMemo(() => {
          for (const item of items) {
            console.log(item);
          }
          return items;
        }, [items]);
      `,
      },
      // Object.getOwnPropertyNames
      {
        code: `
        const result = useMemo(() => {
          return Object.getOwnPropertyNames(obj);
        }, [obj]);
      `,
      },
      // Object.getPrototypeOf
      {
        code: `
        const result = useMemo(() => {
          return Object.getPrototypeOf(obj);
        }, [obj]);
      `,
      },
      // Proxy objects
      {
        code: `
        const result = useMemo(() => {
          return new Proxy(obj, handler);
        }, [obj]);
      `,
      },
      // WeakMap/WeakSet operations
      {
        code: `
        const result = useMemo(() => {
          return weakMap.has(obj);
        }, [obj]);
      `,
      },
      // Symbol operations
      {
        code: `
        const result = useMemo(() => {
          return obj[Symbol.iterator];
        }, [obj]);
      `,
      },
      // Generator functions
      {
        code: `
        const result = useMemo(() => {
          return generator.next();
        }, [generator]);
      `,
      },
      // Async/await operations
      {
        code: `
        const result = useMemo(() => {
          return async () => await promise;
        }, [promise]);
      `,
      },
      // Error objects
      {
        code: `
        const result = useMemo(() => {
          return error.message;
        }, [error]);
      `,
      },
      // URL objects
      {
        code: `
        const result = useMemo(() => {
          return url.pathname;
        }, [url]);
      `,
      },
      // FormData objects
      {
        code: `
        const result = useMemo(() => {
          return formData.get('field');
        }, [formData]);
      `,
      },
      // ArrayBuffer objects
      {
        code: `
        const result = useMemo(() => {
          return buffer.byteLength;
        }, [buffer]);
      `,
      },
      // DataView objects
      {
        code: `
        const result = useMemo(() => {
          return dataView.getInt32(0);
        }, [dataView]);
      `,
      },
      // Typed arrays
      {
        code: `
        const result = useMemo(() => {
          return uint8Array.length;
        }, [uint8Array]);
      `,
      },
      // Intl objects
      {
        code: `
        const result = useMemo(() => {
          return formatter.format(value);
        }, [formatter]);
      `,
      },
      // Performance objects
      {
        code: `
        const result = useMemo(() => {
          return performance.now();
        }, [performance]);
      `,
      },
      // Console objects
      {
        code: `
        const result = useMemo(() => {
          console.log(obj);
          return obj;
        }, [obj]);
      `,
      },
      // Window/global objects
      {
        code: `
        const result = useMemo(() => {
          return window.location.href;
        }, [window]);
      `,
      },
      // Document objects
      {
        code: `
        const result = useMemo(() => {
          return document.title;
        }, [document]);
      `,
      },
      // Element objects
      {
        code: `
        const result = useMemo(() => {
          return element.innerHTML;
        }, [element]);
      `,
      },
      // Event objects
      {
        code: `
        const result = useMemo(() => {
          return event.target;
        }, [event]);
      `,
      },
      // Request/Response objects
      {
        code: `
        const result = useMemo(() => {
          return response.json();
        }, [response]);
      `,
      },
      // File objects
      {
        code: `
        const result = useMemo(() => {
          return file.size;
        }, [file]);
      `,
      },
      // Blob objects
      {
        code: `
        const result = useMemo(() => {
          return blob.type;
        }, [blob]);
      `,
      },
      // ImageData objects
      {
        code: `
        const result = useMemo(() => {
          return imageData.width;
        }, [imageData]);
      `,
      },
      // Canvas context objects
      {
        code: `
        const result = useMemo(() => {
          return ctx.canvas;
        }, [ctx]);
      `,
      },
      // Audio context objects
      {
        code: `
        const result = useMemo(() => {
          return audioCtx.sampleRate;
        }, [audioCtx]);
      `,
      },
      // WebGL context objects
      {
        code: `
        const result = useMemo(() => {
          return gl.drawingBufferWidth;
        }, [gl]);
      `,
      },
      // MediaStream objects
      {
        code: `
        const result = useMemo(() => {
          return stream.getTracks();
        }, [stream]);
      `,
      },
      // RTCPeerConnection objects
      {
        code: `
        const result = useMemo(() => {
          return connection.connectionState;
        }, [connection]);
      `,
      },
      // WebSocket objects
      {
        code: `
        const result = useMemo(() => {
          return socket.readyState;
        }, [socket]);
      `,
      },
      // Worker objects
      {
        code: `
        const result = useMemo(() => {
          return worker.postMessage(data);
        }, [worker]);
      `,
      },
      // ServiceWorker objects
      {
        code: `
        const result = useMemo(() => {
          return sw.state;
        }, [sw]);
      `,
      },
      // Notification objects
      {
        code: `
        const result = useMemo(() => {
          return notification.title;
        }, [notification]);
      `,
      },
      // Geolocation objects
      {
        code: `
        const result = useMemo(() => {
          return position.coords;
        }, [position]);
      `,
      },
      // Battery objects
      {
        code: `
        const result = useMemo(() => {
          return battery.level;
        }, [battery]);
      `,
      },
      // Gamepad objects
      {
        code: `
        const result = useMemo(() => {
          return gamepad.buttons;
        }, [gamepad]);
      `,
      },
      // Crypto objects
      {
        code: `
        const result = useMemo(() => {
          return crypto.getRandomValues(array);
        }, [crypto]);
      `,
      },
      // Storage objects
      {
        code: `
        const result = useMemo(() => {
          return localStorage.getItem('key');
        }, [localStorage]);
      `,
      },
      // History objects
      {
        code: `
        const result = useMemo(() => {
          return history.length;
        }, [history]);
      `,
      },
      // Location objects
      {
        code: `
        const result = useMemo(() => {
          return location.pathname;
        }, [location]);
      `,
      },
      // Navigator objects
      {
        code: `
        const result = useMemo(() => {
          return navigator.userAgent;
        }, [navigator]);
      `,
      },
      // Screen objects
      {
        code: `
        const result = useMemo(() => {
          return screen.width;
        }, [screen]);
      `,
      },
      // Issue #1569 repro: a boolean-annotated destructured prop is a
      // primitive, so negating it cannot churn an object reference.
      {
        code: `
        const PanelUnmemoized = ({ isCollapsed }: { isCollapsed: boolean }) => {
          useEffect(() => {
            onToggle(!isCollapsed);
          }, [!isCollapsed, onToggle]);
          return null;
        };
      `,
      },

      // === ISSUE #1569: NEGATED BOOLEANS AND PRIMITIVES ARE NOT OBJECTS ===

      // Approved boolean prefixes from enforce-boolean-naming-prefixes
      {
        code: `
        const result = useMemo(() => {
          return isVisible ? 'shown' : 'hidden';
        }, [!isVisible]);
      `,
      },
      {
        code: `
        const result = useMemo(() => {
          return hasAccess ? 'allowed' : 'denied';
        }, [!hasAccess]);
      `,
      },
      {
        code: `
        const result = useMemo(() => {
          return canEdit ? 'editable' : 'readonly';
        }, [!canEdit]);
      `,
      },
      {
        code: `
        const result = useMemo(() => {
          return shouldRefresh ? refresh() : null;
        }, [!shouldRefresh]);
      `,
      },
      {
        code: `
        useEffect(() => {
          if (willExpire) scheduleRenewal();
        }, [!willExpire]);
      `,
      },
      {
        code: `
        const result = useMemo(() => {
          return wasLoaded ? 'ready' : 'pending';
        }, [!wasLoaded]);
      `,
      },
      // Remaining approved prefixes, including the plural forms
      {
        code: `
        const result = useMemo(() => {
          return compute();
        }, [
          !doesMatch,
          !didRender,
          !hadErrors,
          !wouldOverflow,
          !mustConfirm,
          !allowsRetry,
          !supportsWebgl,
          !needsUpgrade,
          !assertsOwnership,
          !includesTax,
          !areTabsReady,
          !haveUsersVoted,
          !wereTracksLoaded,
        ]);
      `,
      },
      // Underscore-prefixed private boolean
      {
        code: `
        const result = useMemo(() => {
          return _isMounted ? 'mounted' : 'unmounted';
        }, [!_isMounted]);
      `,
      },
      // SCREAMING_SNAKE_CASE boolean constant
      {
        code: `
        const result = useMemo(() => {
          return IS_ENABLED ? 'on' : 'off';
        }, [!IS_ENABLED]);
      `,
      },
      // number-annotated destructured prop
      {
        code: `
        const ListUnmemoized = ({ count }: { count: number }) => {
          const label = useMemo(() => {
            return count === 0 ? 'empty' : 'filled';
          }, [!count]);
          return label;
        };
      `,
      },
      // Destructured prop typed through a same-file type alias
      {
        code: `
        type PanelProps = { collapsed: boolean; onToggle: () => void };
        const PanelUnmemoized = ({ collapsed, onToggle }: PanelProps) => {
          useEffect(() => {
            onToggle();
          }, [!collapsed, onToggle]);
          return null;
        };
      `,
      },
      // Destructured prop typed through a same-file interface
      {
        code: `
        interface CounterProps { total: number }
        const CounterUnmemoized = ({ total }: CounterProps) => {
          const label = useMemo(() => {
            return String(total);
          }, [!total]);
          return label;
        };
      `,
      },
      // Renamed destructured prop keeps the annotation of its source key
      {
        code: `
        const PanelUnmemoized = ({ collapsed: panelState }: { collapsed: boolean }) => {
          useEffect(() => {
            render(panelState);
          }, [!panelState]);
          return null;
        };
      `,
      },
      // Optional destructured prop with a default value
      {
        code: `
        const ListUnmemoized = ({ count = 0 }: { count?: number }) => {
          const label = useMemo(() => {
            return String(count);
          }, [!count]);
          return label;
        };
      `,
      },
      // Optional primitive union annotation
      {
        code: `
        const HeaderUnmemoized = ({ title }: { title: string | undefined }) => {
          const label = useMemo(() => {
            return title ?? 'Untitled';
          }, [!title]);
          return label;
        };
      `,
      },
      // Annotated local variable
      {
        code: `
        const label: string = resolveLabel();
        const result = useMemo(() => {
          return label;
        }, [!label]);
      `,
      },
      // useState with a primitive literal initializer
      {
        code: `
        const [name, setName] = useState('');
        const result = useMemo(() => {
          return name;
        }, [!name]);
      `,
      },
      // useState with an explicit primitive type argument
      {
        code: `
        const [expanded, setExpanded] = React.useState<boolean>();
        const result = useMemo(() => {
          return expanded;
        }, [!expanded]);
      `,
      },
      // Primitive literal initializers
      {
        code: `
        let loading = true;
        const result = useMemo(() => {
          return loading;
        }, [!loading]);
      `,
      },
      {
        code: `
        const total = 0;
        const result = useMemo(() => {
          return total;
        }, [!total]);
      `,
      },
      // Comparison initializers always produce primitives
      {
        code: `
        const overflow = width > maxWidth;
        const result = useMemo(() => {
          return overflow;
        }, [!overflow]);
      `,
      },
      // A primitive negation inside a larger expression is not an object condition
      {
        code: `
        const ListUnmemoized = ({ count }: { count: number }) => {
          const result = useMemo(() => {
            return count === 0 ? 'empty' : mode;
          }, [!count || mode === 'grid']);
          return result;
        };
      `,
      },
    ],
    invalid: [
      // Object existence check in useMemo
      {
        code: `
        const result = useMemo(() => {
          return !data ? [] : processData();
        }, [!data]);
      `,
        errors: [
          {
            messageId: 'extractBooleanCondition',
            data: {
              expression: '!data',
              suggestedName: 'isDataMissing',
              objectName: 'data',
            },
          },
        ],
      },
      // Object key count check in useCallback
      {
        code: `
        const callback = useCallback(() => {
          return Object.keys(items).length === 0 ? 'empty' : 'not empty';
        }, [Object.keys(items).length === 0]);
      `,
        errors: [
          {
            messageId: 'extractBooleanCondition',
            data: {
              expression: 'Object.keys(items).length === 0',
              suggestedName: 'isItemsEmpty',
              objectName: 'items',
            },
          },
        ],
      },
      // Object key count check with greater than
      {
        code: `
        const result = useMemo(() => {
          return Object.keys(data).length > 0 ? 'has data' : 'no data';
        }, [Object.keys(data).length > 0]);
      `,
        errors: [buildError('Object.keys(data).length > 0', 'data', 'hasData')],
      },
      // Object key count check with not equal
      {
        code: `
        const result = useMemo(() => {
          return Object.keys(config).length !== 0 ? 'configured' : 'not configured';
        }, [Object.keys(config).length !== 0]);
      `,
        errors: [
          buildError('Object.keys(config).length !== 0', 'config', 'hasConfig'),
        ],
      },
      // Complex boolean expression with logical OR
      {
        code: `
        const result = useMemo(() => {
          return !data || Object.keys(data).length === 0 ? [] : processData();
        }, [!data || Object.keys(data).length === 0]);
      `,
        errors: [
          buildError(
            '!data || Object.keys(data).length === 0',
            'data',
            'hasData',
          ),
        ],
      },
      // Complex boolean expression with logical AND
      {
        code: `
        const result = useMemo(() => {
          return data && Object.keys(data).length > 0 ? processData() : [];
        }, [data && Object.keys(data).length > 0]);
      `,
        errors: [
          buildError('data && Object.keys(data).length > 0', 'data', 'hasData'),
        ],
      },
      // useEffect with object existence check
      {
        code: `
        useEffect(() => {
          if (!user) return;
          updateProfile();
        }, [!user]);
      `,
        errors: [
          {
            messageId: 'extractBooleanCondition',
            data: {
              expression: '!user',
              suggestedName: 'isUserMissing',
              objectName: 'user',
            },
          },
        ],
      },
      // Multiple boolean conditions in same dependency array
      {
        code: `
        const result = useMemo(() => {
          return (!data || Object.keys(data).length === 0) && (!config || Object.keys(config).length === 0);
        }, [!data || Object.keys(data).length === 0, !config || Object.keys(config).length === 0]);
      `,
        errors: [
          buildError(
            '!data || Object.keys(data).length === 0',
            'data',
            'hasData',
          ),
          buildError(
            '!config || Object.keys(config).length === 0',
            'config',
            'hasConfig',
          ),
        ],
      },
      // Object existence check with different variable name
      {
        code: `
        const result = useMemo(() => {
          return !roundPreviews ? 'loading' : 'loaded';
        }, [!roundPreviews]);
      `,
        errors: [
          {
            messageId: 'extractBooleanCondition',
            data: {
              expression: '!roundPreviews',
              suggestedName: 'isRoundPreviewsMissing',
              objectName: 'roundPreviews',
            },
          },
        ],
      },
      // Object key count with less than
      {
        code: `
        const result = useMemo(() => {
          return Object.keys(items).length < 1 ? 'empty' : 'not empty';
        }, [Object.keys(items).length < 1]);
      `,
        errors: [
          buildError('Object.keys(items).length < 1', 'items', 'hasItems'),
        ],
      },
      // Object key count with greater than or equal
      {
        code: `
        const result = useMemo(() => {
          return Object.keys(data).length >= 1 ? 'has data' : 'no data';
        }, [Object.keys(data).length >= 1]);
      `,
        errors: [
          buildError('Object.keys(data).length >= 1', 'data', 'hasData'),
        ],
      },
      // Object key count with less than or equal
      {
        code: `
        const result = useMemo(() => {
          return Object.keys(settings).length <= 0 ? 'no settings' : 'has settings';
        }, [Object.keys(settings).length <= 0]);
      `,
        errors: [
          {
            messageId: 'extractBooleanCondition',
            data: {
              expression: 'Object.keys(settings).length <= 0',
              suggestedName: 'isSettingsEmpty',
              objectName: 'settings',
            },
          },
        ],
      },
      // Mixed dependencies with boolean condition
      {
        code: `
        const result = useMemo(() => {
          return !data || mode === 'test' ? [] : processData();
        }, [!data, mode]);
      `,
        errors: [
          {
            messageId: 'extractBooleanCondition',
            data: {
              expression: '!data',
              suggestedName: 'isDataMissing',
              objectName: 'data',
            },
          },
        ],
      },
      // Complex expression with multiple objects
      {
        code: `
        const result = useMemo(() => {
          return !user || !user.profile ? 'no profile' : user.profile.name;
        }, [!user || !user.profile]);
      `,
        errors: [buildError('!user || !user.profile', 'user', 'hasUser')],
      },
      // Object existence in useCallback with arrow function
      {
        code: `
        const handleClick = useCallback(() => {
          if (!data) return;
          processData();
        }, [!data]);
      `,
        errors: [
          {
            messageId: 'extractBooleanCondition',
            data: {
              expression: '!data',
              suggestedName: 'isDataMissing',
              objectName: 'data',
            },
          },
        ],
      },
      // Object key count in useEffect
      {
        code: `
        useEffect(() => {
          if (Object.keys(cache).length === 0) {
            loadCache();
          }
        }, [Object.keys(cache).length === 0]);
      `,
        errors: [
          {
            messageId: 'extractBooleanCondition',
            data: {
              expression: 'Object.keys(cache).length === 0',
              suggestedName: 'isCacheEmpty',
              objectName: 'cache',
            },
          },
        ],
      },
      // Nested complex expression
      {
        code: `
        const result = useMemo(() => {
          return (data && Object.keys(data).length > 0) || fallback ? 'show' : 'hide';
        }, [(data && Object.keys(data).length > 0) || fallback]);
      `,
        errors: [
          buildError(
            '(data && Object.keys(data).length > 0) || fallback',
            'data',
            'hasData',
          ),
        ],
      },
      // Object existence with camelCase variable
      {
        code: `
        const result = useMemo(() => {
          return !userProfile ? 'no profile' : userProfile.name;
        }, [!userProfile]);
      `,
        errors: [
          {
            messageId: 'extractBooleanCondition',
            data: {
              expression: '!userProfile',
              suggestedName: 'isUserProfileMissing',
              objectName: 'userProfile',
            },
          },
        ],
      },
      // Object key count with camelCase variable
      {
        code: `
        const result = useMemo(() => {
          return Object.keys(apiResponse).length > 0 ? 'success' : 'empty';
        }, [Object.keys(apiResponse).length > 0]);
      `,
        errors: [
          buildError(
            'Object.keys(apiResponse).length > 0',
            'apiResponse',
            'hasApiResponse',
          ),
        ],
      },
      // Multiple conditions with different objects
      {
        code: `
        const result = useMemo(() => {
          return (!user || Object.keys(user).length === 0) && (!settings || Object.keys(settings).length === 0);
        }, [!user || Object.keys(user).length === 0, !settings || Object.keys(settings).length === 0]);
      `,
        errors: [
          buildError(
            '!user || Object.keys(user).length === 0',
            'user',
            'hasUser',
          ),
          buildError(
            '!settings || Object.keys(settings).length === 0',
            'settings',
            'hasSettings',
          ),
        ],
      },

      // === EDGE CASES FOR FALSE NEGATIVES (should trigger but might not) ===

      // Object existence check with extra parentheses
      {
        code: `
        const result = useMemo(() => {
          return (!data) ? [] : processData();
        }, [(!data)]);
      `,
        errors: [
          {
            messageId: 'extractBooleanCondition',
            data: {
              expression: '!data',
              suggestedName: 'isDataMissing',
              objectName: 'data',
            },
          },
        ],
      },
      // Object key count check with extra parentheses
      {
        code: `
        const result = useMemo(() => {
          return (Object.keys(items).length === 0) ? 'empty' : 'not empty';
        }, [(Object.keys(items).length === 0)]);
      `,
        errors: [
          {
            messageId: 'extractBooleanCondition',
            data: {
              expression: 'Object.keys(items).length === 0',
              suggestedName: 'isItemsEmpty',
              objectName: 'items',
            },
          },
        ],
      },
      // Complex boolean expression with extra parentheses
      {
        code: `
        const result = useMemo(() => {
          return (!data || Object.keys(data).length === 0) ? [] : processData();
        }, [(!data || Object.keys(data).length === 0)]);
      `,
        errors: [
          buildError(
            '!data || Object.keys(data).length === 0',
            'data',
            'hasData',
          ),
        ],
      },
      // Object existence check with whitespace variations
      {
        code: `
        const result = useMemo(() => {
          return ! data ? [] : processData();
        }, [! data]);
      `,
        errors: [
          {
            messageId: 'extractBooleanCondition',
            data: {
              expression: '! data',
              suggestedName: 'isDataMissing',
              objectName: 'data',
            },
          },
        ],
      },
      // Object key count with whitespace variations
      {
        code: `
        const result = useMemo(() => {
          return Object . keys ( data ) . length === 0 ? 'empty' : 'not empty';
        }, [Object . keys ( data ) . length === 0]);
      `,
        errors: [
          {
            messageId: 'extractBooleanCondition',
            data: {
              expression: 'Object . keys ( data ) . length === 0',
              suggestedName: 'isDataEmpty',
              objectName: 'data',
            },
          },
        ],
      },
      // Object existence with underscore variable names
      {
        code: `
        const result = useMemo(() => {
          return !user_data ? 'no data' : 'has data';
        }, [!user_data]);
      `,
        errors: [
          {
            messageId: 'extractBooleanCondition',
            data: {
              expression: '!user_data',
              suggestedName: 'isUser_dataMissing',
              objectName: 'user_data',
            },
          },
        ],
      },
      // Object existence with camelCase variable names
      {
        code: `
        const result = useMemo(() => {
          return !userData ? 'no data' : 'has data';
        }, [!userData]);
      `,
        errors: [
          {
            messageId: 'extractBooleanCondition',
            data: {
              expression: '!userData',
              suggestedName: 'isUserDataMissing',
              objectName: 'userData',
            },
          },
        ],
      },
      // Object existence with PascalCase variable names
      {
        code: `
        const result = useMemo(() => {
          return !UserData ? 'no data' : 'has data';
        }, [!UserData]);
      `,
        errors: [
          {
            messageId: 'extractBooleanCondition',
            data: {
              expression: '!UserData',
              suggestedName: 'isUserDataMissing',
              objectName: 'UserData',
            },
          },
        ],
      },
      // Object existence with numbers in variable names
      {
        code: `
        const result = useMemo(() => {
          return !data2 ? 'no data' : 'has data';
        }, [!data2]);
      `,
        errors: [
          {
            messageId: 'extractBooleanCondition',
            data: {
              expression: '!data2',
              suggestedName: 'isData2Missing',
              objectName: 'data2',
            },
          },
        ],
      },
      // Object key count with different number comparisons
      {
        code: `
        const result = useMemo(() => {
          return Object.keys(data).length < 1 ? 'empty' : 'not empty';
        }, [Object.keys(data).length < 1]);
      `,
        errors: [buildError('Object.keys(data).length < 1', 'data', 'hasData')],
      },
      // Object key count with different number comparisons (>= 1)
      {
        code: `
        const result = useMemo(() => {
          return Object.keys(data).length >= 1 ? 'not empty' : 'empty';
        }, [Object.keys(data).length >= 1]);
      `,
        errors: [
          buildError('Object.keys(data).length >= 1', 'data', 'hasData'),
        ],
      },
      // Object key count with different number comparisons (<= 0)
      {
        code: `
        const result = useMemo(() => {
          return Object.keys(data).length <= 0 ? 'empty' : 'not empty';
        }, [Object.keys(data).length <= 0]);
      `,
        errors: [
          {
            messageId: 'extractBooleanCondition',
            data: {
              expression: 'Object.keys(data).length <= 0',
              suggestedName: 'isDataEmpty',
              objectName: 'data',
            },
          },
        ],
      },
      // Complex expression with nested parentheses
      {
        code: `
        const result = useMemo(() => {
          return ((data && Object.keys(data).length > 0)) ? 'has data' : 'no data';
        }, [((data && Object.keys(data).length > 0))]);
      `,
        errors: [
          buildError('data && Object.keys(data).length > 0', 'data', 'hasData'),
        ],
      },
      // Complex expression with mixed logical operators
      {
        code: `
        const result = useMemo(() => {
          return !data || Object.keys(data).length === 0 ? 'empty' : 'not empty';
        }, [!data || Object.keys(data).length === 0]);
      `,
        errors: [
          buildError(
            '!data || Object.keys(data).length === 0',
            'data',
            'hasData',
          ),
        ],
      },
      // Complex expression with AND operator
      {
        code: `
        const result = useMemo(() => {
          return data && Object.keys(data).length > 0 ? 'has data' : 'no data';
        }, [data && Object.keys(data).length > 0]);
      `,
        errors: [
          buildError('data && Object.keys(data).length > 0', 'data', 'hasData'),
        ],
      },
      // Object existence check in different hook types
      {
        code: `
        const callback = useCallback(() => {
          return !data ? 'no data' : 'has data';
        }, [!data]);
      `,
        errors: [
          {
            messageId: 'extractBooleanCondition',
            data: {
              expression: '!data',
              suggestedName: 'isDataMissing',
              objectName: 'data',
            },
          },
        ],
      },
      // Object existence check in useEffect
      {
        code: `
        useEffect(() => {
          if (!data) return;
          processData();
        }, [!data]);
      `,
        errors: [
          {
            messageId: 'extractBooleanCondition',
            data: {
              expression: '!data',
              suggestedName: 'isDataMissing',
              objectName: 'data',
            },
          },
        ],
      },
      // Multiple object checks in same dependency array
      {
        code: `
        const result = useMemo(() => {
          return processData();
        }, [!data, Object.keys(config).length === 0]);
      `,
        errors: [
          {
            messageId: 'extractBooleanCondition',
            data: {
              expression: '!data',
              suggestedName: 'isDataMissing',
              objectName: 'data',
            },
          },
          {
            messageId: 'extractBooleanCondition',
            data: {
              expression: 'Object.keys(config).length === 0',
              suggestedName: 'isConfigEmpty',
              objectName: 'config',
            },
          },
        ],
      },
      // Object existence check with very long variable names
      {
        code: `
        const result = useMemo(() => {
          return !veryLongVariableNameForUserData ? 'no data' : 'has data';
        }, [!veryLongVariableNameForUserData]);
      `,
        errors: [
          {
            messageId: 'extractBooleanCondition',
            data: {
              expression: '!veryLongVariableNameForUserData',
              suggestedName: 'isVeryLongVariableNameForUserDataMissing',
              objectName: 'veryLongVariableNameForUserData',
            },
          },
        ],
      },
      // Object key count with very long variable names
      {
        code: `
        const result = useMemo(() => {
          return Object.keys(veryLongVariableNameForConfig).length > 0 ? 'configured' : 'not configured';
        }, [Object.keys(veryLongVariableNameForConfig).length > 0]);
      `,
        errors: [
          buildError(
            'Object.keys(veryLongVariableNameForConfig).length > 0',
            'veryLongVariableNameForConfig',
            'hasVeryLongVariableNameForConfig',
          ),
        ],
      },

      // === ISSUE #1569 GUARDS: REAL OBJECTS MUST STILL REPORT ===

      // Object literal binding in the same file
      {
        code: `
        const user = { id: 1, name: 'Ada' };
        useEffect(() => {
          if (!user) return;
          updateProfile();
        }, [!user]);
      `,
        errors: [buildError('!user', 'user', 'isUserMissing')],
      },
      // Object type annotation on a destructured prop
      {
        code: `
        const ProfileUnmemoized = ({ user }: { user: User }) => {
          useEffect(() => {
            render(user);
          }, [!user]);
          return null;
        };
      `,
        errors: [buildError('!user', 'user', 'isUserMissing')],
      },
      // Type alias resolving to an object type
      {
        code: `
        type ProfileProps = { profile: { name: string } };
        const ProfileUnmemoized = ({ profile }: ProfileProps) => {
          useEffect(() => {
            render(profile);
          }, [!profile]);
          return null;
        };
      `,
        errors: [buildError('!profile', 'profile', 'isProfileMissing')],
      },
      // useState holding an object
      {
        code: `
        const [settings, setSettings] = useState({});
        useEffect(() => {
          load(settings);
        }, [!settings]);
      `,
        errors: [buildError('!settings', 'settings', 'isSettingsMissing')],
      },
      // Imported bindings stay unresolved, so they keep reporting
      {
        code: `
        import { globalConfig } from './config';
        useEffect(() => {
          apply(globalConfig);
        }, [!globalConfig]);
      `,
        errors: [
          buildError('!globalConfig', 'globalConfig', 'isGlobalConfigMissing'),
        ],
      },
      // Names that merely start with the letters of a boolean prefix are not
      // boolean-prefixed: the prefix must end on a word boundary.
      {
        code: `
        useEffect(() => {
          setup(isolatedConfig);
        }, [!isolatedConfig]);
      `,
        errors: [
          buildError(
            '!isolatedConfig',
            'isolatedConfig',
            'isIsolatedConfigMissing',
          ),
        ],
      },
      {
        code: `
        useEffect(() => {
          draw(canvasContext);
        }, [!canvasContext]);
      `,
        errors: [
          buildError(
            '!canvasContext',
            'canvasContext',
            'isCanvasContextMissing',
          ),
        ],
      },
      // A primitive negation next to a real object check reports the object,
      // never the primitive.
      {
        code: `
        const ListUnmemoized = ({ count }: { count: number }) => {
          const result = useMemo(() => {
            return count === 0 ? [] : processData();
          }, [!count || Object.keys(data).length === 0]);
          return result;
        };
      `,
        errors: [
          buildError(
            '!count || Object.keys(data).length === 0',
            'data',
            'hasData',
          ),
        ],
      },
    ],
  },
);
