## [1.0.1](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.0.0...v1.0.1) (2024-11-13)


### Bug Fixes

* **package.json:** change package name ([8a44bd7](https://github.com/BluMintInc/eslint-custom-rules/commit/8a44bd74c8f4c908fea404a69a02c6ac8f1df407))
* **package.json:** remove np char ([39ec15d](https://github.com/BluMintInc/eslint-custom-rules/commit/39ec15d21b76f79086dc245d487ee9f605fbf839))

# 1.0.0 (2024-11-13)


### Bug Fixes

* **.releaserc.json:** update repo url to current repo ([e9b9139](https://github.com/BluMintInc/eslint-custom-rules/commit/e9b913904909639dd0faf44b1f210d4a2ae64f73))
* **husky:** remove husky ([ad7ecb3](https://github.com/BluMintInc/eslint-custom-rules/commit/ad7ecb33522a991d026af04c3f19beb96c4fd5dc))
* **package.json:** add back iun remove-hooks for github actions ([41b5ea1](https://github.com/BluMintInc/eslint-custom-rules/commit/41b5ea1d7d269d8568ddf23465e6cc8589ae91c5))
* **package.json:** use plugin/src instead of src ([1d9d2f6](https://github.com/BluMintInc/eslint-custom-rules/commit/1d9d2f6410094a8a7402a2ca51645f7746c8c369))
* **plugin/package-lock.json): only lint /src; fix(package.json:** upgrade engine to node v20 ([c654c8e](https://github.com/BluMintInc/eslint-custom-rules/commit/c654c8e6f0546e4f133fdca463b86f0d22e75c81))
* **plugin:** typo for rule definition ([a1d33b9](https://github.com/BluMintInc/eslint-custom-rules/commit/a1d33b90428a989a56244218bc4115c2ba479327))
* **release:** version to 0.1.24 ([78f4e28](https://github.com/BluMintInc/eslint-custom-rules/commit/78f4e281d2bc82e64403c053d514e75c23920915))
* **require-memo:** detect exported functions ([06f19b4](https://github.com/BluMintInc/eslint-custom-rules/commit/06f19b48f7dbedf83d84b31a64ffdd3f05a8b41a))
* **require-memo:** edge cases + additional tests ([908587b](https://github.com/BluMintInc/eslint-custom-rules/commit/908587beaf9020d60558f2b48916cf0bca140a34))
* **require-memo:** use src/util/memo instead of React memo ([3a1de04](https://github.com/BluMintInc/eslint-custom-rules/commit/3a1de0416a2a2833a3c23220d7616063ff2ea493))
* **setting.json:** codeActionsOnSave value change ([5557d2f](https://github.com/BluMintInc/eslint-custom-rules/commit/5557d2f2bdee222a03b4b4330d39f5a12b5e8684))


### Features

* **0.1.16:** release v0.1.16 ([bfe4b1a](https://github.com/BluMintInc/eslint-custom-rules/commit/bfe4b1a8d815c2367fad83e50e4245ddce0d95fc))
* **0.1.17:** bump version ([eca598f](https://github.com/BluMintInc/eslint-custom-rules/commit/eca598fd863b48a4c4a1cd4a7770f3bf63c86669))
* **actions:** upgrade actions to node v20 ([e3417fa](https://github.com/BluMintInc/eslint-custom-rules/commit/e3417faee3b2b0badffb58a041a5d01fe550d83d))
* **array-methods-this-context:** implement rule + docs ([4db3cfb](https://github.com/BluMintInc/eslint-custom-rules/commit/4db3cfb74fc801e55af3009a547585afc462432a))
* **ASTHelpers:** class with helpers for AST traversal ([e0c02ea](https://github.com/BluMintInc/eslint-custom-rules/commit/e0c02ea3f629ec06f8834d4ba88ed53610cf19f7))
* **BLU-2402:** implement no-async-foreach ([1901988](https://github.com/BluMintInc/eslint-custom-rules/commit/1901988dbfec805fb8b9e99b88c1cd050a67e616))
* **BLU-2406:** implement no-useless-fragment ([559ecea](https://github.com/BluMintInc/eslint-custom-rules/commit/559ecea7d4e37d24c194065eb07f625c4bd5c59c))
* **class-methods-read-top-to-bottom:** implement rule ([80c5a37](https://github.com/BluMintInc/eslint-custom-rules/commit/80c5a37f5af0fac04ff847f463edb6999ce9ed5e))
* **ClassGraphBuilder:** builds a graph of class member nodes & their dependencies ([cff1588](https://github.com/BluMintInc/eslint-custom-rules/commit/cff15884688893af253ecaa7fe246134b484f59a))
* **ClassGraphSorter:** base class + configurable readability sorter ([536abd9](https://github.com/BluMintInc/eslint-custom-rules/commit/536abd930e8702698f725d98379445912818c4fd))
* **Dockerfile:** upgrade to node v20 and npm 10.4.0 ([e936c60](https://github.com/BluMintInc/eslint-custom-rules/commit/e936c60850449269062322c96319b88a67fa9fab))
* **dynamic-https-errors:** implement rule file & test suite ([c7e2266](https://github.com/BluMintInc/eslint-custom-rules/commit/c7e2266a2dedb6b8661fbdba1cf938c5753c67d4))
* **dynamic-https-errors:** include in index ([85fd0ed](https://github.com/BluMintInc/eslint-custom-rules/commit/85fd0ed34b443d9c5deee02daf96003ff4c9f6c7))
* **export-if-in-doubt:** implement rule, tests, docs ([3985661](https://github.com/BluMintInc/eslint-custom-rules/commit/39856610ca0089bf8aef3a14f4c506f0844176da))
* **extract-global-constants:** implement rule, tests, docs ([96f425a](https://github.com/BluMintInc/eslint-custom-rules/commit/96f425a52bdbd2672a2cb0ac68b8964583784df5))
* **generic-starts-with-t:** implement rule + docs ([2f5c8f3](https://github.com/BluMintInc/eslint-custom-rules/commit/2f5c8f360365c4e3a65b0bdc1b4eb4a49ef06fe5))
* **no-async-array-filter:** implement rule ([47f77a4](https://github.com/BluMintInc/eslint-custom-rules/commit/47f77a43f779f58540ca4b382afa2a839f1a35b4))
* **no-async-array-filter:** implement rule + docs ([9b67bc7](https://github.com/BluMintInc/eslint-custom-rules/commit/9b67bc7e29ebe4b75e7a9e71f5c4cf16f475778c))
* **no-conditional-literals-in-jsx.ts:** implement new rule for conditional text ([9638f37](https://github.com/BluMintInc/eslint-custom-rules/commit/9638f376f593a1122c7e29d011e14d7b9a036292))
* **no-filter-without-return:** implement rule + docs ([3106714](https://github.com/BluMintInc/eslint-custom-rules/commit/3106714e9413b0ba4080cacf8387e10de7325e26))
* **no-misused-switch-case:** implement rule, tests, docs ([06c9768](https://github.com/BluMintInc/eslint-custom-rules/commit/06c9768bc560b88a6f125157c3bfd8ec8ff012f2))
* **no-unpinned-dependencies:** implement rule ([b4f2f47](https://github.com/BluMintInc/eslint-custom-rules/commit/b4f2f47b597aeee6d76f338d8327d52b36a43948))
* **prefer-fragment-shorthand:** implement rule + docs ([6088af1](https://github.com/BluMintInc/eslint-custom-rules/commit/6088af155fa0f65606db67da0b6f3f2c2bb10b31))
* **prefer-type-over-interface:** implement rule + docs ([71c9f6e](https://github.com/BluMintInc/eslint-custom-rules/commit/71c9f6e32c56fdbb5c5eec9dcfa4c1c03d45547e))
* **require-memo:** add autofix for `function` ([485c278](https://github.com/BluMintInc/eslint-custom-rules/commit/485c2784ff6c620173ddcf5f3ec431346ccaacd6))
* **scripts:** implement make-docs util script ([4ad01ef](https://github.com/BluMintInc/eslint-custom-rules/commit/4ad01eff771baa1487957b22f12e253b71a948e0))
* **v0.1.15:** include require-memo rule ([84abe13](https://github.com/BluMintInc/eslint-custom-rules/commit/84abe136bf05e1a98878f3b24b086638c4bf823e))
* **v0.1.1:** update readme for release ([1e1df2a](https://github.com/BluMintInc/eslint-custom-rules/commit/1e1df2a5e969a2a86353e74c641b8e484b2aa7cf))
