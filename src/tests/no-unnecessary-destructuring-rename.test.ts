import { ruleTesterTs } from '../utils/ruleTester';
import { noUnnecessaryDestructuringRename } from '../rules/no-unnecessary-destructuring-rename';

ruleTesterTs.run('no-unnecessary-destructuring-rename', noUnnecessaryDestructuringRename, {
  valid: [
    // No destructuring
    'const nextId = afterData?.nextMatchId;',

    // No renaming in destructuring
    'const { nextMatchId } = afterData ?? {}; const update = { nextMatchId };',

    // Legitimate renaming for clarity
    'const { id: userId } = user; const { id: productId } = product; console.log(userId, productId);',

    // Multiple uses of renamed variable
    `const { nextMatchId: nextId } = afterData ?? {};
console.log(nextId);
const update = { nextMatchId: nextId };`,

    // Renamed variable used for different property
    'const { nextMatchId: nextId } = afterData ?? {}; const update = { differentProperty: nextId };',

    // Complex destructuring patterns
    'const { user: { name: userName } } = data; const update = { name: userName };',

    // Array destructuring
    'const [first, second] = array; const update = { first, second };',

    // Destructuring with default values - legitimate use
    'const { nextMatchId: nextId = "default" } = afterData ?? {}; console.log(nextId); const update = { nextMatchId: nextId };',

    // Computed property names
    'const { [dynamicKey]: renamedValue } = data; const update = { [dynamicKey]: renamedValue };',

    // Function parameters
    'function getValue({ nextMatchId: nextId }) { return { nextMatchId: nextId }; }',

    // Arrow function parameters
    'const getValue = ({ nextMatchId: nextId }) => ({ nextMatchId: nextId });',

    // Destructuring in for-of loop
    'for (const { nextMatchId: nextId } of items) { console.log(nextId); }',

    // Nested object creation - valid because it's nested
    'const { nextMatchId: nextId } = data; const update = { nested: { nextMatchId: nextId } };',

    // Variable used in different scope - valid because it's in a different function scope
    `const { nextMatchId: nextId } = data;
function createUpdate() {
  return { nextMatchId: nextId };
}`,

    // Variable used in conditional - valid because it's conditional
    'const { nextMatchId: nextId } = data; const update = condition ? { nextMatchId: nextId } : {};',

    // Variable used in array
    'const { nextMatchId: nextId } = data; const array = [nextId];',

    // Variable used in function call
    'const { nextMatchId: nextId } = data; someFunction(nextId);',

    // Variable used in template literal
    'const { nextMatchId: nextId } = data; const message = `ID: ${nextId}`;',

    // Variable used in arithmetic
    'const { count: countValue } = data; const total = countValue + 1;',

    // Variable used in comparison
    'const { nextMatchId: nextId } = data; if (nextId === "test") { console.log("match"); }',

    // Variable used in logical expression
    'const { nextMatchId: nextId } = data; const result = nextId || "default";',

    // Variable used in return statement
    'const { nextMatchId: nextId } = data; return nextId;',

    // Variable used in assignment to different variable
    'const { nextMatchId: nextId } = data; const otherId = nextId;',

    // TypeScript type annotations
    'const { nextMatchId: nextId }: { nextMatchId: string } = data; console.log(nextId);',

    // TypeScript as assertion
    'const { nextMatchId: nextId } = data as SomeType; console.log(nextId);',

    // Variable not used at all (different rule should handle this)
    'const { nextMatchId: nextId } = data;',



    // Variable used in object method
    'const { nextMatchId: nextId } = data; const obj = { method() { return nextId; } };',

    // Variable used in class property
    'const { nextMatchId: nextId } = data; class MyClass { prop = nextId; }',

    // Variable used in switch statement
    'const { type: typeValue } = data; switch (typeValue) { case "test": break; }',

    // Variable used in try-catch
    'const { nextMatchId: nextId } = data; try { console.log(nextId); } catch (e) {}',

    // Variable used in while loop
    'const { count: countValue } = data; while (countValue > 0) { countValue--; }',

    // Variable used in for loop
    'const { count: countValue } = data; for (let i = 0; i < countValue; i++) {}',

    // Variable used in ternary operator
    'const { nextMatchId: nextId } = data; const result = nextId ? "yes" : "no";',

    // Variable used in destructuring assignment
    'const { nextMatchId: nextId } = data; const [first] = [nextId];',

    // Variable used in spread operator
    'const { items: itemsArray } = data; const newArray = [...itemsArray];',

    // Variable used in object spread
    'const { config: configObj } = data; const newConfig = { ...configObj };',

    // Variable used in function expression
    'const { nextMatchId: nextId } = data; const fn = function() { return nextId; };',

    // Variable used in generator function
    'const { nextMatchId: nextId } = data; function* gen() { yield nextId; }',

    // Variable used in async function
    'const { nextMatchId: nextId } = data; async function fn() { return nextId; }',

    // Variable used in await expression
    'const { promise: promiseValue } = data; const result = await promiseValue;',

    // Variable used in yield expression
    'const { nextMatchId: nextId } = data; function* gen() { yield nextId; }',

    // Variable used in new expression
    'const { Constructor: ConstructorClass } = data; const instance = new ConstructorClass();',

    // Variable used in typeof expression
    'const { nextMatchId: nextId } = data; const type = typeof nextId;',

    // Variable used in instanceof expression
    'const { obj: objValue } = data; const isInstance = objValue instanceof Array;',

    // Variable used in delete expression
    'const { obj: objValue } = data; delete objValue.prop;',

    // Variable used in void expression
    'const { nextMatchId: nextId } = data; void nextId;',

    // Variable used in unary expression
    'const { count: countValue } = data; const negative = -countValue;',

    // Variable used in update expression
    'const { count: countValue } = data; countValue++;',

    // Variable used in sequence expression
    'const { nextMatchId: nextId } = data; const result = (console.log("test"), nextId);',

    // Variable used in conditional expression
    'const { nextMatchId: nextId } = data; const result = condition ? nextId : "default";',

    // Variable used in assignment expression
    'const { nextMatchId: nextId } = data; let other; other = nextId;',

    // Variable used in binary expression
    'const { count: countValue } = data; const sum = countValue + 10;',

    // Variable used in logical expression
    'const { nextMatchId: nextId } = data; const result = nextId && "valid";',

    // Variable used in member expression
    'const { obj: objValue } = data; const prop = objValue.property;',

    // Variable used in call expression
    'const { fn: fnValue } = data; const result = fnValue();',

    // Variable used in tagged template literal
    'const { nextMatchId: nextId } = data; const result = tag`ID: ${nextId}`;',
  ],
  invalid: [
    // Basic case - the main pattern we want to catch
    {
      code: `const { nextMatchId: nextId } = afterData ?? {};
const resultSummaryUpdate = {
  nextMatchId: nextId,
};`,
      errors: [{ messageId: 'unnecessaryDestructuringRename' }],
      output: `const { nextMatchId } = afterData ?? {};
const resultSummaryUpdate = {
  nextMatchId,
};`,
    },

    // With let declaration
    {
      code: `let { nextMatchId: nextId } = afterData ?? {};
const update = { nextMatchId: nextId };`,
      errors: [{ messageId: 'unnecessaryDestructuringRename' }],
      output: `let { nextMatchId } = afterData ?? {};
const update = { nextMatchId };`,
    },

    // With var declaration
    {
      code: `var { nextMatchId: nextId } = afterData ?? {};
const update = { nextMatchId: nextId };`,
      errors: [{ messageId: 'unnecessaryDestructuringRename' }],
      output: `var { nextMatchId } = afterData ?? {};
const update = { nextMatchId };`,
    },

    // With function call source
    {
      code: `const { nextMatchId: nextId } = getData();
const update = { nextMatchId: nextId };`,
      errors: [{ messageId: 'unnecessaryDestructuringRename' }],
      output: `const { nextMatchId } = getData();
const update = { nextMatchId };`,
    },

    // With property access source
    {
      code: `const { nextMatchId: nextId } = user.preferences;
const update = { nextMatchId: nextId };`,
      errors: [{ messageId: 'unnecessaryDestructuringRename' }],
      output: `const { nextMatchId } = user.preferences;
const update = { nextMatchId };`,
    },

    // With conditional source
    {
      code: `const { nextMatchId: nextId } = condition ? objA : objB;
const update = { nextMatchId: nextId };`,
      errors: [{ messageId: 'unnecessaryDestructuringRename' }],
      output: `const { nextMatchId } = condition ? objA : objB;
const update = { nextMatchId };`,
    },

    // With nested member expression source
    {
      code: `const { nextMatchId: nextId } = response.body.data;
const update = { nextMatchId: nextId };`,
      errors: [{ messageId: 'unnecessaryDestructuringRename' }],
      output: `const { nextMatchId } = response.body.data;
const update = { nextMatchId };`,
    },

    // With array index source
    {
      code: `const { nextMatchId: nextId } = items[0];
const update = { nextMatchId: nextId };`,
      errors: [{ messageId: 'unnecessaryDestructuringRename' }],
      output: `const { nextMatchId } = items[0];
const update = { nextMatchId };`,
    },

    // With computed property source
    {
      code: `const { nextMatchId: nextId } = obj[propName];
const update = { nextMatchId: nextId };`,
      errors: [{ messageId: 'unnecessaryDestructuringRename' }],
      output: `const { nextMatchId } = obj[propName];
const update = { nextMatchId };`,
    },

    // With template literal source
    {
      code: `const { nextMatchId: nextId } = configs[\`\${env}-settings\`];
const update = { nextMatchId: nextId };`,
      errors: [{ messageId: 'unnecessaryDestructuringRename' }],
      output: `const { nextMatchId } = configs[\`\${env}-settings\`];
const update = { nextMatchId };`,
    },

    // With new expression source
    {
      code: `const { nextMatchId: nextId } = new MyClass();
const update = { nextMatchId: nextId };`,
      errors: [{ messageId: 'unnecessaryDestructuringRename' }],
      output: `const { nextMatchId } = new MyClass();
const update = { nextMatchId };`,
    },

    // With TypeScript cast source
    {
      code: `const { nextMatchId: nextId } = obj as SomeType;
const update = { nextMatchId: nextId };`,
      errors: [{ messageId: 'unnecessaryDestructuringRename' }],
      output: `const { nextMatchId } = obj as SomeType;
const update = { nextMatchId };`,
    },

    // With TypeScript generic source
    {
      code: `const { nextMatchId: nextId } = getData<User>();
const update = { nextMatchId: nextId };`,
      errors: [{ messageId: 'unnecessaryDestructuringRename' }],
      output: `const { nextMatchId } = getData<User>();
const update = { nextMatchId };`,
    },

    // Multiple properties, one unnecessary
    {
      code: `const { nextMatchId: nextId, otherId } = data;
const update = { nextMatchId: nextId, otherId };`,
      errors: [{ messageId: 'unnecessaryDestructuringRename' }],
      output: `const { nextMatchId, otherId } = data;
const update = { nextMatchId, otherId };`,
    },

    // With default value
    {
      code: `const { nextMatchId: nextId = "default" } = afterData ?? {};
const update = { nextMatchId: nextId };`,
      errors: [{ messageId: 'unnecessaryDestructuringRename' }],
      output: `const { nextMatchId = "default" } = afterData ?? {};
const update = { nextMatchId };`,
    },

    // With complex default value
    {
      code: `const { nextMatchId: nextId = getDefaultId() } = afterData ?? {};
const update = { nextMatchId: nextId };`,
      errors: [{ messageId: 'unnecessaryDestructuringRename' }],
      output: `const { nextMatchId = getDefaultId() } = afterData ?? {};
const update = { nextMatchId };`,
    },

    // With object spread in target
    {
      code: `const { nextMatchId: nextId } = data;
const update = { ...otherData, nextMatchId: nextId };`,
      errors: [{ messageId: 'unnecessaryDestructuringRename' }],
      output: `const { nextMatchId } = data;
const update = { ...otherData, nextMatchId };`,
    },

    // In function scope
    {
      code: `function createUpdate() {
  const { nextMatchId: nextId } = data;
  return { nextMatchId: nextId };
}`,
      errors: [{ messageId: 'unnecessaryDestructuringRename' }],
      output: `function createUpdate() {
  const { nextMatchId } = data;
  return { nextMatchId };
}`,
    },

    // In arrow function
    {
      code: `const createUpdate = () => {
  const { nextMatchId: nextId } = data;
  return { nextMatchId: nextId };
};`,
      errors: [{ messageId: 'unnecessaryDestructuringRename' }],
      output: `const createUpdate = () => {
  const { nextMatchId } = data;
  return { nextMatchId };
};`,
    },

    // In class method
    {
      code: `class MyClass {
  createUpdate() {
    const { nextMatchId: nextId } = data;
    return { nextMatchId: nextId };
  }
}`,
      errors: [{ messageId: 'unnecessaryDestructuringRename' }],
      output: `class MyClass {
  createUpdate() {
    const { nextMatchId } = data;
    return { nextMatchId };
  }
}`,
    },

    // In if statement
    {
      code: `if (condition) {
  const { nextMatchId: nextId } = data;
  const update = { nextMatchId: nextId };
}`,
      errors: [{ messageId: 'unnecessaryDestructuringRename' }],
      output: `if (condition) {
  const { nextMatchId } = data;
  const update = { nextMatchId };
}`,
    },

    // In for loop
    {
      code: `for (let i = 0; i < 10; i++) {
  const { nextMatchId: nextId } = data[i];
  const update = { nextMatchId: nextId };
}`,
      errors: [{ messageId: 'unnecessaryDestructuringRename' }],
      output: `for (let i = 0; i < 10; i++) {
  const { nextMatchId } = data[i];
  const update = { nextMatchId };
}`,
    },

    // In while loop
    {
      code: `while (condition) {
  const { nextMatchId: nextId } = getData();
  const update = { nextMatchId: nextId };
}`,
      errors: [{ messageId: 'unnecessaryDestructuringRename' }],
      output: `while (condition) {
  const { nextMatchId } = getData();
  const update = { nextMatchId };
}`,
    },

    // In try-catch
    {
      code: `try {
  const { nextMatchId: nextId } = data;
  const update = { nextMatchId: nextId };
} catch (e) {}`,
      errors: [{ messageId: 'unnecessaryDestructuringRename' }],
      output: `try {
  const { nextMatchId } = data;
  const update = { nextMatchId };
} catch (e) {}`,
    },

    // In switch case
    {
      code: `switch (type) {
  case 'test':
    const { nextMatchId: nextId } = data;
    const update = { nextMatchId: nextId };
    break;
}`,
      errors: [{ messageId: 'unnecessaryDestructuringRename' }],
      output: `switch (type) {
  case 'test':
    const { nextMatchId } = data;
    const update = { nextMatchId };
    break;
}`,
    },

    // With TypeScript type annotation on destructuring
    {
      code: `const { nextMatchId: nextId }: { nextMatchId: string } = data;
const update = { nextMatchId: nextId };`,
      errors: [{ messageId: 'unnecessaryDestructuringRename' }],
      output: `const { nextMatchId }: { nextMatchId: string } = data;
const update = { nextMatchId };`,
    },

    // Different variable names
    {
      code: `const { userId: id } = user;
const update = { userId: id };`,
      errors: [{ messageId: 'unnecessaryDestructuringRename' }],
      output: `const { userId } = user;
const update = { userId };`,
    },

    // Camel case to snake case and back
    {
      code: `const { firstName: first_name } = person;
const update = { firstName: first_name };`,
      errors: [{ messageId: 'unnecessaryDestructuringRename' }],
      output: `const { firstName } = person;
const update = { firstName };`,
    },

    // Numbers in property names
    {
      code: `const { item1: firstItem } = data;
const update = { item1: firstItem };`,
      errors: [{ messageId: 'unnecessaryDestructuringRename' }],
      output: `const { item1 } = data;
const update = { item1 };`,
    },

    // With underscore in names
    {
      code: `const { next_match_id: nextMatchId } = data;
const update = { next_match_id: nextMatchId };`,
      errors: [{ messageId: 'unnecessaryDestructuringRename' }],
      output: `const { next_match_id } = data;
const update = { next_match_id };`,
    },

    // Destructuring with rest operator - still unnecessary rename
    {
      code: `const { nextMatchId: nextId, ...rest } = data;
const update = { nextMatchId: nextId, ...rest };`,
      errors: [{ messageId: 'unnecessaryDestructuringRename' }],
      output: `const { nextMatchId, ...rest } = data;
const update = { nextMatchId, ...rest };`,
    },

    // Multiple properties destructured - still unnecessary rename
    {
      code: `const { nextMatchId: nextId, otherId: otherId } = data;
const update = { nextMatchId: nextId, otherId: otherId };`,
      errors: [{ messageId: 'unnecessaryDestructuringRename' }],
      output: `const { nextMatchId, otherId: otherId } = data;
const update = { nextMatchId, otherId: otherId };`,
    },

    // Multiple destructuring statements
    {
      code: `const { nextMatchId: nextId } = data1;
const { otherId: otherId } = data2;
const update = { nextMatchId: nextId, otherId: otherId };`,
      errors: [{ messageId: 'unnecessaryDestructuringRename' }],
      output: `const { nextMatchId } = data1;
const { otherId: otherId } = data2;
const update = { nextMatchId, otherId: otherId };`,
    },

    // Destructuring with spread in assignment
    {
      code: `const { nextMatchId: nextId } = data;
const update = { ...otherData, nextMatchId: nextId };`,
      errors: [{ messageId: 'unnecessaryDestructuringRename' }],
      output: `const { nextMatchId } = data;
const update = { ...otherData, nextMatchId };`,
    },
  ],
});
