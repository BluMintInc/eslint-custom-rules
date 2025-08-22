import { ruleTesterTs } from '../utils/ruleTester';
import { preferUrlToStringOverToJson } from '../rules/prefer-url-tostring-over-tojson';

ruleTesterTs.run(
	'prefer-url-tostring-over-tojson',
	preferUrlToStringOverToJson,
	{
		valid: [
			// Basic toString usage
			`const u = new URL('https://example.com'); u.toString();`,
			// Passing URL directly into JSON.stringify (toJSON auto-invoked)
			`const u = new URL('https://example.com'); JSON.stringify({ link: u });`,
			// Using template literal coercion to string
			"const u = new URL('https://example.com'); const s = `${u}`;",
			// Calling toString inside expressions
			`const u = new URL('https://example.com'); console.log('' + u.toString());`,
			// Different constructor reference patterns
			`const u = new globalThis.URL('https://example.com'); u.toString();`,
			`const u = new (window as any).URL('https://example.com'); u.toString();`,
			// Not URL receivers
			`const obj = { toJSON(){return 1}, toString(){return 'x'} }; obj.toJSON();`,
			// Optional chaining on non-URL
			`declare const x: any; x?.toJSON();`,
			// Unrelated stringify
			`JSON.stringify({ a: 1 });`,
			// URL in array serialization
			`const u = new URL('https://example.com'); JSON.stringify([u]);`,
		],
		invalid: [
			// Basic misuse
			{
				code: `const url = new URL('https://example.com/path'); console.log(url.toJSON());`,
				errors: [{ messageId: 'preferToString' }],
				output:
					`const url = new URL('https://example.com/path'); console.log(url.toString());`,
			},
			// In JSON building context: prefer passing object directly
			{
				code: `const url = new URL('https://e.com'); const payload = { link: url.toJSON() }; JSON.stringify(payload);`,
				errors: [{ messageId: 'preferToString' }],
				output:
					`const url = new URL('https://e.com'); const payload = { link: url.toString() }; JSON.stringify(payload);`,
			},
			// When directly inside JSON.stringify, replace call with object expression
			{
				code: `const u = new URL('https://e.com'); JSON.stringify({ link: u.toJSON() });`,
				errors: [{ messageId: 'preferToString' }],
				output: `const u = new URL('https://e.com'); JSON.stringify({ link: u });`,
			},
			// Nested object in stringify
			{
				code: `const u = new URL('https://e.com'); JSON.stringify({ data: { link: u.toJSON() } });`,
				errors: [{ messageId: 'preferToString' }],
				output: `const u = new URL('https://e.com'); JSON.stringify({ data: { link: u } });`,
			},
			// New expression inline
			{
				code: `console.log(new URL('https://e.com').toJSON());`,
				errors: [{ messageId: 'preferToString' }],
				output: `console.log(new URL('https://e.com').toString());`,
			},
			// Assigned identifiers still recognized
			{
				code: `let u = new URL('https://e.com'); function f(){ return u.toJSON(); }`,
				errors: [{ messageId: 'preferToString' }],
				output: `let u = new URL('https://e.com'); function f(){ return u.toString(); }`,
			},
			// Assignment after declaration
			{
				code: `let u:any; u = new URL('https://e.com'); u.toJSON();`,
				errors: [{ messageId: 'preferToString' }],
				output: `let u:any; u = new URL('https://e.com'); u.toString();`,
			},
			// Optional chaining should still flag but fix to .toString() (since cannot drop call safely inside stringify only)
			{
				code: `const u = new URL('https://e.com'); u?.toJSON();`,
				errors: [{ messageId: 'preferToString' }],
				output: `const u = new URL('https://e.com'); u?.toString();`,
			},
			// Multiple occurrences
			{
				code: `const u = new URL('https://e.com'); console.log(u.toJSON(), JSON.stringify({ u: u.toJSON() }));`,
				errors: [{ messageId: 'preferToString' }, { messageId: 'preferToString' }],
				output:
					`const u = new URL('https://e.com'); console.log(u.toString(), JSON.stringify({ u: u }));`,
			},
			// Member access path like globalThis.URL
			{
				code: `const u = new globalThis.URL('https://e.com'); u.toJSON();`,
				errors: [{ messageId: 'preferToString' }],
				output: `const u = new globalThis.URL('https://e.com'); u.toString();`,
			},
		],
	},
);