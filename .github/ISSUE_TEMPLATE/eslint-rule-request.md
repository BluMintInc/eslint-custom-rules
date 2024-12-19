---
name: ESLint Rule Request
about: Propose a new custom ESLint rule
title: "[RULE]"
labels: enhancement, fix-me
assignees: ''

---

**High-Level Overview**
Provide a clear, high-level description of the proposed ESLint rule. Start by explaining the overall coding standard or anti-pattern the rule addresses. Then add why it’s important for BluMint’s codebase. Assume the reader has general JavaScript knowledge but no prior exposure to our coding practices.

**Example Code (Bad vs. Good)**
Give at least one clear example of **bad code** that the new rule should flag and fix, alongside the **refactored version** of that code. Be as specific as possible.

Example:  
_Bad Code:_  
```javascript
function getData() {
  return axios.get('/api/data');
}
```

_Good Code:_  
```javascript
import apiClient from '@/utils/apiClient';

function getData() {
  return apiClient.get('/data');
}
```

**Additional Notes**
Include any specific guidance, edge cases, or known limitations for this rule. If the rule ties into other BluMint coding standards, mention them here.


## **Edge Cases**
List out any edge cases you can think of. Help the LLM think traps to avoid.

**Example**
### **1. Variables That Cannot Use `as const`**
#### Issue:
`as const` is only applicable to literals or objects/arrays with constant values. If the variable's value doesn't meet these criteria, appending `as const` will result in a TypeScript error.

#### Examples:
- Variables with dynamically computed values:
  ```javascript
  const API_VERSION = getApiVersion(); // Dynamic function call; `as const` cannot be added.
  ```
- Variables using non-literal expressions:
  ```javascript
  const DEFAULT_TIMEOUT = 1000 * 60; // Computed number; `as const` is invalid here.
  ```

#### Solution:
The rule should not enforce `as const`**, focusing only on the UPPER_SNAKE_CASE enforcement.

### **2. Constants Imported From Other Modules**
#### Issue:
Constants declared in one module and imported into another cannot be modified locally to add `as const`. The rule should not flag these imports.

#### Example:
_File A:_
```javascript
export const BASE_URL = 'https://api.bluemint.com';
```
_File B:_
```javascript
import { BASE_URL } from './fileA'; // Cannot enforce `as const` on imports.
```

#### Solution:
The rule should:
- **Ignore imported constants.**

---

### **3. Constants That Are Already `UPPER_CASE` But Lack `as const`**
#### Issue:
The rule needs to handle partial compliance gracefully. For example:
```javascript
const API_URL = 'https://api.bluemint.com'; // Correct casing but missing `as const`.
```

#### Solution:
The rule should:
- Treat these cases as partially valid and enforce only the missing aspect (`as const`).

---

### **4. Mixed Declarations (Destructuring or Multi-Line Constants)**
#### Issue:
Destructured declarations or multi-line assignments can be tricky to handle, especially when some variables are constants and others are not.

#### Example:
```javascript
const { API_URL, MAX_RETRIES } = getConfig(); // Dynamic values cannot use `as const`.
const [FIRST_VALUE, SECOND_VALUE] = ['one', 'two']; // Literals can use `as const`.
```

#### Solution:
- For destructuring, the rule should **skip enforcement entirely**, as it's challenging to enforce individual immutability in this syntax.
- For multi-line assignments, apply the rule only if the entire structure qualifies for `as const`.

---

### **5. Global Variables That Aren’t Constants**
#### Issue:
The rule might mistakenly flag non-constant global variables (e.g., `let` or `var`) or constants intended for mutation.

#### Example:
```javascript
let globalCount = 0; // Variable is not constant and shouldn't be flagged.
```

#### Solution:
- The rule should target only `const` declarations at the top level.

---

### **6. Framework-Specific Global Declarations**
#### Issue:
Some frameworks (e.g., Next.js) use global variables that do not follow typical conventions. For instance, `const` declarations in `next.config.js` or `env` files might not follow `UPPER_CASE` or use `as const`.

#### Example:
```javascript
const nextConfig = { reactStrictMode: true }; // Not a constant in the usual sense.
```

#### Solution:
- The rule should ignore files with known framework-specific conventions (e.g., configuration files) or allow exceptions via configuration.
