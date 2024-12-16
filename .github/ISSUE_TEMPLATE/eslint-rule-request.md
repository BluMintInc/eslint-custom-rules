---
name: ESLint Rule Request
about: Propose a new custom ESLint rule
title: "[RULE] [ESLint]"
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

**Relevant Code Files & Directories**
List all files and directories in the eslint-plugin repo that are relevant for implementing this rule. If unsure, include likely candidates.

Example:
- `plugin/src/rules/`  
- `plugin/src/index.ts`  
- `plugin/tests/rules/`

**Acceptance Criteria**
Clearly define what success looks like. When is the implementation complete? Use checkboxes to make this actionable and testable.

Example:
- [ ] Rule identifies bad code examples listed above.
- [ ] Rule suggests or auto-fixes code to align with good examples.
- [ ] Includes complete test cases for valid and invalid code samples.
- [ ] Documentation in `README.md` explains the rule, including rationale and examples.
- [ ] Rule is integrated into `plugin/src/index.ts` and tested with existing rules.

**Additional Notes**
Include any specific guidance, edge cases, or known limitations for this rule. If the rule ties into other BluMint coding standards, mention them here.
```
