---
name: ESLint Rule Bug Report
about: Report a bug in an ESLint rule
title: "[BUG]"
labels: fix-me
assignees: ''

---

**Affected ESLint Rule**  
Specify the name of the ESLint rule where the bug occurs.  
Example: `global-const-uppercase-as-const`

---

**Bug Description**  
Provide a clear and concise description of the bug. Include details about what the rule does incorrectly and how it affects your codebase.

Example:  
The rule incorrectly flags a variable inside a function as needing `UPPER_SNAKE_CASE` and `as const`, even though it is not in the global scope.

---

**Code That Triggers the Bug**  
Provide a code snippet that reproduces the issue.  

Example:  
```javascript
function getData() {
  const apiEndpoint = 'https://api.bluemint.com';
  return apiEndpoint;
}
```

---

**Erroneous Auto-Fix Output (if applicable)**  
If the rule has an auto-fix and it produces incorrect output, provide the erroneous result.  

Example:  
```javascript
function getData() {
  const API_ENDPOINT = 'https://api.bluemint.com' as const;
  return API_ENDPOINT;
}
```

---

**Desired Auto-Fix Output (if applicable)**  
If the rule has an auto-fix, provide the output you expect to see instead.  

Example:  
```javascript
function getData() {
  const apiEndpoint = 'https://api.bluemint.com';
  return apiEndpoint;
}
```

---

**Additional Context**  
Add any other details, edge cases, or relevant files (e.g., configurations) that could help us understand and resolve the bug. If the issue is intermittent or tied to specific environments, mention that here.  

Example:  
- The issue only occurs when running ESLint with `--fix`.  
- Our ESLint configuration includes:  
  ```json
  {
    "rules": {
      "global-const-uppercase-as-const": "error"
    }
  }
  ```
