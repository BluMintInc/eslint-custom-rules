import { ruleTesterTs } from '../utils/ruleTester';
import { preferNullishCoalescingOverride } from '../rules/prefer-nullish-coalescing-override';

ruleTesterTs.run(
  'prefer-nullish-coalescing-override',
  preferNullishCoalescingOverride,
  {
    valid: [
      // Boolean contexts (should not suggest nullish coalescing)
      {
        code: 'if (isMatchMember || isTournamentAdmin) { console.log("Has access"); }',
      },
      {
        code: 'const element = (isMatchMember || isTournamentAdmin) && renderButton();',
      },
      {
        code: 'const canEdit = isOwner || hasEditPermission;',
      },
      {
        code: 'while (retryCount < 3 || !success) { retry(); }',
      },
      {
        code: 'const isValid = !!(value || defaultValue);',
      },
      {
        code: 'return condition1 || condition2 ? valueA : valueB;',
      },

      // Default values for strings (should not suggest nullish coalescing)
      {
        code: 'const displayName = username || "Anonymous";',
      },
      {
        code: 'const greeting = (firstName || "Guest") + " " + (lastName || "");',
      },
      {
        code: 'function greet(name) { return "Hello, " + (name || "Anonymous"); }',
      },

      // JSX-like contexts (should not suggest nullish coalescing)
      {
        code: 'const element = renderElement(message || "No message available");',
      },
      {
        code: 'const button = renderButton({ disabled: isLoading || isDisabled });',
      },

      // Function parameters (should not suggest nullish coalescing)
      {
        code: 'function process(options = {}) { const config = options.config || defaultConfig; }',
      },

      // Array methods with callbacks (should not suggest nullish coalescing)
      {
        code: 'items.filter(item => item.isActive || item.isPending)',
      },
      {
        code: 'users.map(user => user.fullName || user.username)',
      },

      // Nullish coalescing is already used correctly
      {
        code: 'const value = maybeNull ?? defaultValue;',
      },
      {
        code: 'const config = options?.advanced?.timeout ?? 1000;',
      },

      // Complex boolean expressions
      {
        code: 'if ((isAdmin || isModerator) && (hasPermission || isOwner)) { doSomething(); }',
      },
      {
        code: 'const result = (condition1 || condition2) && (condition3 || condition4);',
      },
      {
        code: 'while ((retries < maxRetries) || (timeout > 0 && !cancelled)) { continue; }',
      },

      // Nested logical expressions
      {
        code: 'const complex = (a || b) && (c || d) || (e || f);',
      },
      {
        code: 'const nested = ((x || y) || z) && w;',
      },
      {
        code: 'if (((isValid || isTest) && enabled) || force) { execute(); }',
      },

      // Boolean variable names (should not suggest nullish coalescing)
      {
        code: 'const isEnabled = isActive || isPending;',
      },
      {
        code: 'const hasAccess = hasPermission || isAdmin;',
      },
      {
        code: 'const canProceed = shouldContinue || willRetry;',
      },
      {
        code: 'const wasSuccessful = wasCompleted || wasApproved;',
      },
      {
        code: 'const areValid = areEnabled || areActive;',
      },

      // Comparison expressions (should not suggest nullish coalescing)
      {
        code: 'const result = (x > 5) || (y < 10);',
      },
      {
        code: 'const valid = (count === 0) || (status !== "error");',
      },
      {
        code: 'const check = (value >= min) || (value <= max);',
      },

      // String default values with empty string handling
      {
        code: 'const title = pageTitle || "Untitled";',
      },
      {
        code: 'const description = metaDescription || "";',
      },
      {
        code: 'const label = buttonText || "Click me";',
      },
      {
        code: 'const placeholder = inputPlaceholder || "Enter text...";',
      },

      // Number default values (should not suggest nullish coalescing)
      {
        code: 'const count = itemCount || 0;',
      },
      {
        code: 'const timeout = requestTimeout || 5000;',
      },
      {
        code: 'const limit = maxItems || 100;',
      },

      // Boolean default values (should not suggest nullish coalescing)
      {
        code: 'const enabled = userEnabled || false;',
      },
      {
        code: 'const visible = isVisible || true;',
      },

      // Object property access with defaults
      {
        code: 'const config = options.config || defaultConfig;',
      },
      {
        code: 'const theme = user.preferences.theme || "light";',
      },
      {
        code: 'const lang = settings.language || "en";',
      },

      // Array access with defaults
      {
        code: 'const first = items[0] || defaultItem;',
      },
      {
        code: 'const last = array[array.length - 1] || fallback;',
      },

      // Function call results with defaults
      {
        code: 'const result = getValue() || defaultValue;',
      },
      {
        code: 'const data = fetchData() || [];',
      },
      {
        code: 'const user = getCurrentUser() || guestUser;',
      },

      // Conditional rendering patterns
      {
        code: 'const component = (showModal || forceShow) && renderModal();',
      },
      {
        code: 'const element = (hasData || isLoading) ? renderContent() : renderEmpty();',
      },

      // Assignment expressions
      {
        code: 'this.name = userName || "Guest";',
      },
      {
        code: 'obj.property = value || defaultValue;',
      },
      {
        code: 'state.isActive = currentState || false;',
      },

      // Return statements with logical OR
      {
        code: 'function getName() { return firstName || lastName || "Unknown"; }',
      },
      {
        code: 'const getStatus = () => currentStatus || "pending";',
      },

      // Template literals
      {
        code: 'const message = `Hello ${name || "Guest"}!`;',
      },
      {
        code: 'const url = `${baseUrl || "localhost"}:${port || 3000}`;',
      },

      // Destructuring with defaults
      {
        code: 'const { title = name || "Untitled" } = options;',
      },
      {
        code: 'const [first = items[0] || defaultItem] = array;',
      },

      // Switch case contexts
      {
        code: 'switch (type || "default") { case "a": break; default: break; }',
      },

      // For loop conditions
      {
        code: 'for (let i = 0; i < (max || 10); i++) { process(i); }',
      },
      {
        code: 'for (const item of items || []) { handle(item); }',
      },

      // Try-catch contexts
      {
        code: 'try { process(data || defaultData); } catch (e) { handle(e); }',
      },

      // Arrow function expressions
      {
        code: 'const handler = (event) => process(event.data || {});',
      },
      {
        code: 'const mapper = item => item.value || 0;',
      },

      // Class method contexts
      {
        code: 'class Test { method() { return this.value || "default"; } }',
      },
      {
        code: 'class Component { render() { return this.props.children || null; } }',
      },

      // Async/await contexts
      {
        code: 'async function load() { const data = await fetch() || []; return data; }',
      },

      // Generator functions
      {
        code: 'function* gen() { yield value || defaultValue; }',
      },

      // Spread operator contexts
      {
        code: 'const merged = { ...defaults, ...(options || {}) };',
      },
      {
        code: 'const combined = [...items, ...(additional || [])];',
      },

      // Computed property names
      {
        code: 'const obj = { [key || "default"]: value };',
      },

      // Regular expression contexts
      {
        code: 'const pattern = new RegExp(regex || ".*");',
      },

      // Date and time contexts
      {
        code: 'const date = new Date(timestamp || Date.now());',
      },

      // Error handling
      {
        code: 'throw new Error(message || "Unknown error");',
      },

      // Promise contexts
      {
        code: 'Promise.resolve(value || defaultValue).then(handle);',
      },

      // Event handler contexts
      {
        code: 'element.addEventListener("click", handler || defaultHandler);',
      },

      // JSON operations
      {
        code: 'const parsed = JSON.parse(json || "{}");',
      },

      // Math operations
      {
        code: 'const result = Math.max(value || 0, minimum);',
      },

      // String operations
      {
        code: 'const trimmed = (text || "").trim();',
      },
      {
        code: 'const upper = (input || "").toUpperCase();',
      },

      // Array operations
      {
        code: 'const length = (array || []).length;',
      },
      {
        code: 'const joined = (items || []).join(", ");',
      },

      // Complex nested scenarios
      {
        code: 'const complex = ((a || b) && c) || ((d || e) && f);',
      },
      {
        code: 'const nested = obj?.prop?.value || fallback || "default";',
      },

      // Type assertion contexts
      {
        code: 'const typed = (value || defaultValue) as string;',
      },

      // Nullish coalescing already used (should remain unchanged)
      {
        code: 'const value = maybeNull ?? defaultValue;',
      },
      {
        code: 'const config = options?.advanced?.timeout ?? 1000;',
      },
      {
        code: 'const result = data?.items?.[0] ?? fallback;',
      },

      // Mixed operators (should not suggest changes)
      {
        code: 'const mixed = (a ?? b) || (c ?? d);',
      },
      {
        code: 'const combined = (value || defaultValue) ?? fallback;',
      },

      // Edge case: empty string as valid value
      {
        code: 'const display = text || "";',
      },
      {
        code: 'const content = message || " ";',
      },

      // Edge case: zero as valid value
      {
        code: 'const count = number || 0;',
      },
      {
        code: 'const index = position || -1;',
      },

      // Edge case: false as valid value
      {
        code: 'const flag = condition || false;',
      },
      {
        code: 'const state = active || true;',
      },

      // Performance-sensitive contexts
      {
        code: 'for (let i = 0; i < 1000000; i++) { const val = items[i] || defaultValue; }',
      },

      // Memory-sensitive contexts
      {
        code: 'const large = bigArray || [];',
      },

      // Recursive contexts
      {
        code: 'function recursive(node) { return node.child || recursive(node.parent); }',
      },

      // Additional edge cases for comprehensive coverage

      // Chained logical OR expressions
      {
        code: 'const result = a || b || c || d || "fallback";',
      },
      {
        code: 'const value = first || second || third || fourth || fifth;',
      },

      // Logical OR with function calls
      {
        code: 'const data = getFromCache() || fetchFromAPI() || getDefault();',
      },
      {
        code: 'const user = getCurrentUser() || getGuestUser() || createAnonymous();',
      },

      // Logical OR in object methods
      {
        code: 'const obj = { getValue: () => this.value || this.defaultValue };',
      },
      {
        code: 'const service = { process: (input) => input.data || input.fallback };',
      },

      // Logical OR with array destructuring
      {
        code: 'const [first, second = items[1] || defaultSecond] = array;',
      },
      {
        code: 'const [head, ...rest] = list || [];',
      },

      // Logical OR with object destructuring
      {
        code: 'const { name = firstName || "Unknown", age = 0 } = person || {};',
      },
      {
        code: 'const { config = settings || defaults } = options;',
      },

      // Logical OR in function default parameters
      {
        code: 'function process(data = input || defaultInput) { return data; }',
      },
      {
        code: 'const handler = (event = e || {}) => process(event);',
      },

      // Logical OR with typeof checks
      {
        code: 'const value = (typeof input === "string") || (typeof input === "number");',
      },
      {
        code: 'const isValid = (typeof data === "object") || Array.isArray(data);',
      },

      // Logical OR with instanceof checks
      {
        code: 'const check = (obj instanceof Array) || (obj instanceof Object);',
      },
      {
        code: 'const valid = (error instanceof Error) || (error instanceof TypeError);',
      },

      // Logical OR with in operator
      {
        code: 'const hasProperty = ("prop" in obj) || ("fallback" in obj);',
      },
      {
        code: 'const exists = ("key" in data) || ("defaultKey" in data);',
      },

      // Logical OR with regular expressions
      {
        code: 'const matches = /pattern1/.test(text) || /pattern2/.test(text);',
      },
      {
        code: 'const valid = /email/.test(input) || /phone/.test(input);',
      },

      // Logical OR with array methods
      {
        code: 'const found = items.find(x => x.id === id) || items[0];',
      },
      {
        code: 'const result = array.some(predicate) || array.length > 0;',
      },

      // Logical OR with string methods
      {
        code: 'const trimmed = text.trim() || text.replace(/\\s+/g, "");',
      },
      {
        code: 'const normalized = str.toLowerCase() || str.toUpperCase();',
      },

      // Logical OR with number operations
      {
        code: 'const result = Math.floor(value) || Math.ceil(value) || 0;',
      },
      {
        code: 'const calculated = (a + b) || (a * b) || 1;',
      },

      // Logical OR with date operations
      {
        code: 'const timestamp = date.getTime() || Date.now() || 0;',
      },
      {
        code: 'const formatted = date.toISOString() || date.toString();',
      },

      // Logical OR with promise-like patterns
      {
        code: 'const result = promise.then(success) || promise.catch(error);',
      },
      {
        code: 'const data = await fetch().catch(() => null) || defaultData;',
      },

      // Logical OR with complex member expressions
      {
        code: 'const value = obj.deep.nested.prop || obj.deep.fallback || obj.default;',
      },
      {
        code: 'const config = app.settings.user.preferences || app.settings.defaults;',
      },

      // Logical OR with computed properties
      {
        code: 'const value = obj[key] || obj[fallbackKey] || obj["default"];',
      },
      {
        code: 'const data = cache[id] || storage[id] || defaults[id];',
      },

      // Logical OR with this context
      {
        code: 'class Component { getValue() { return this.value || this.props.value; } }',
      },
      {
        code: 'const method = function() { return this.data || this.fallback; };',
      },

      // Logical OR with super context
      {
        code: 'class Child extends Parent { getValue() { return super.getValue() || this.defaultValue; } }',
      },

      // Logical OR with new expressions
      {
        code: 'const instance = new Constructor(args) || new DefaultConstructor();',
      },
      {
        code: 'const obj = new Map(entries) || new Map();',
      },

      // Logical OR with yield expressions
      {
        code: 'function* generator() { yield value || defaultValue; }',
      },
      {
        code: 'function* process() { const result = yield input || fallback; }',
      },

      // Logical OR with await expressions
      {
        code: 'async function load() { return await fetch(url) || await getCache(); }',
      },
      {
        code: 'const data = await promise || await fallbackPromise || defaultValue;',
      },

      // Logical OR with delete expressions
      {
        code: 'const success = delete obj.prop || delete obj.fallback;',
      },

      // Logical OR with void expressions
      {
        code: 'const result = void 0 || undefined || null;',
      },

      // Logical OR with sequence expressions
      {
        code: 'const value = (a++, b) || (c++, d);',
      },

      // Logical OR with conditional expressions
      {
        code: 'const result = condition ? (a || b) : (c || d);',
      },
      {
        code: 'const value = test ? first || second : third || fourth;',
      },

      // Logical OR with assignment expressions
      {
        code: 'const result = (x = a) || (x = b);',
      },
      {
        code: 'const value = (obj.prop = data) || (obj.prop = fallback);',
      },

      // Logical OR with update expressions
      {
        code: 'const result = ++counter || --counter;',
      },
      {
        code: 'const value = items[index++] || items[index--];',
      },

      // Logical OR with tagged template literals
      {
        code: 'const result = tag`template ${value}` || tag`fallback`;',
      },

      // Logical OR with import expressions
      {
        code: 'const module = import("./module") || import("./fallback");',
      },

      // Logical OR with meta properties
      {
        code: 'const target = new.target || this.constructor;',
      },

      // Logical OR with class expressions
      {
        code: 'const MyClass = class extends Base {} || class DefaultClass {};',
      },

      // Logical OR with function expressions
      {
        code: 'const fn = function named() {} || function() {};',
      },

      // Logical OR with arrow functions
      {
        code: 'const handler = (x) => x.process() || (() => defaultProcess());',
      },

      // Logical OR with rest parameters
      {
        code: 'function process(...args) { return args[0] || args[1] || defaultValue; }',
      },

      // Logical OR with spread in calls
      {
        code: 'const result = fn(...args) || fn(...fallbackArgs);',
      },

      // Logical OR with optional chaining
      {
        code: 'const value = obj?.prop?.value || obj?.fallback?.value;',
      },
      {
        code: 'const result = data?.items?.[0] || data?.fallback?.[0];',
      },

      // Logical OR with nullish coalescing (mixed)
      {
        code: 'const mixed = (a ?? b) || (c ?? d) || fallback;',
      },
      {
        code: 'const complex = value || (fallback ?? defaultFallback);',
      },

      // Logical OR in complex nested structures
      {
        code: 'const result = ((a || b) && (c || d)) || ((e || f) && (g || h));',
      },
      {
        code: 'const value = (x || y) ? (a || b) : (c || d) || fallback;',
      },

      // Logical OR with Symbol operations
      {
        code: 'const sym = Symbol.for("key") || Symbol("fallback");',
      },

      // Logical OR with BigInt operations
      {
        code: 'const big = BigInt(value) || BigInt(0);',
      },

      // Logical OR with Proxy operations
      {
        code: 'const proxy = new Proxy(target, handler) || new Proxy({}, {});',
      },

      // Logical OR with WeakMap/WeakSet
      {
        code: 'const weak = new WeakMap(entries) || new WeakMap();',
      },

      // Logical OR with Set/Map operations
      {
        code: 'const collection = new Set(items) || new Set();',
      },
      {
        code: 'const mapping = new Map(pairs) || new Map();',
      },

      // Logical OR with ArrayBuffer operations
      {
        code: 'const buffer = new ArrayBuffer(size) || new ArrayBuffer(0);',
      },

      // Logical OR with TypedArray operations
      {
        code: 'const typed = new Uint8Array(buffer) || new Uint8Array(0);',
      },

      // Logical OR with DataView operations
      {
        code: 'const view = new DataView(buffer) || new DataView(new ArrayBuffer(0));',
      },

      // Logical OR with Intl operations
      {
        code: 'const formatter = new Intl.DateTimeFormat(locale) || new Intl.DateTimeFormat();',
      },

      // Logical OR with URL operations
      {
        code: 'const url = new URL(input, base) || new URL("about:blank");',
      },

      // Logical OR with FormData operations
      {
        code: 'const form = new FormData(element) || new FormData();',
      },

      // Logical OR with AbortController operations
      {
        code: 'const controller = new AbortController() || { signal: null };',
      },
    ],

    invalid: [
      // This rule doesn't report any issues itself, it just overrides the TypeScript ESLint rule
      // The rule is designed to be conservative and prevent false positives from the original rule
    ],
  },
);
