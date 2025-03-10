## [1.11.1](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.11.0...v1.11.1) (2025-03-10)


### Bug Fixes

* **no-hungarian.ts:** remove "Type" ([854b749](https://github.com/BluMintInc/eslint-custom-rules/commit/854b749bce08f705acdfd0acc47fb47b89cfdaef))

# [1.11.0](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.10.0...v1.11.0) (2025-03-08)


### Bug Fixes

* **no-entire-object-hook-deps:** Improve object usage detection and add specific test case ([029792b](https://github.com/BluMintInc/eslint-custom-rules/commit/029792b79c243982ecbeae9db84ea2937d8bb7e7))
* **no-hungarian:** Remove 'Date' from common types to reduce false positives ([c9ac748](https://github.com/BluMintInc/eslint-custom-rules/commit/c9ac748fd51016e4e45fe3dc8cc373c8fccd5da1))
* **no-unnecessary-verb-suffix.test.ts:** remove prepositions that could be nouns ([f3d7c8c](https://github.com/BluMintInc/eslint-custom-rules/commit/f3d7c8cb51ebfac98be67fa77e35f4cc077e1b05))
* **no-unnecessary-verb-suffix.ts:** remove prepositions that could be nouns ([f9158f2](https://github.com/BluMintInc/eslint-custom-rules/commit/f9158f2c37c0418696e116cdd5a076416890683d))
* **openhands-resolver.yml:** revert to main. Issue was lib/ pushed in ([68532f1](https://github.com/BluMintInc/eslint-custom-rules/commit/68532f1539f90ca636f111e8865f71e6ca0d5c0a))
* **openhands-resolver.yml:** rollback further ([92f04ea](https://github.com/BluMintInc/eslint-custom-rules/commit/92f04eaa8af45d06407b136c78233155a3bd5cf7))
* **openhands-resolver.yml:** rollback to 3/3/25 until token limit error is resolved ([e6f8811](https://github.com/BluMintInc/eslint-custom-rules/commit/e6f88112b0cd9b99f7cb14825de91b3654be7e68))
* **src/rules/no-always-true-false-conditions.ts:** remove excessive shortcircuit ([11b5d5a](https://github.com/BluMintInc/eslint-custom-rules/commit/11b5d5a196fc90f1fac61bb7aa8f2b3e8d34d23b))
* **test-case/simple-test.ts:** delete claude3.7 phantom file ([35f9e80](https://github.com/BluMintInc/eslint-custom-rules/commit/35f9e80e2def8f8a0e6a8a1126909ff9f77efcc3))
* **test-case/test.ts:** remove claude3.7 phantom code ([9a91ebb](https://github.com/BluMintInc/eslint-custom-rules/commit/9a91ebb50e22b93e5d65cee47a236344a087b0c4))


### Features

* **docs:** Enhance rule documentation with improved headers and metadata ([fa251ce](https://github.com/BluMintInc/eslint-custom-rules/commit/fa251cecdf8344b4c827cd0cd33e03763aba87e1))

# [1.10.0](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.9.1...v1.10.0) (2025-03-05)


### Bug Fixes

* **docs/rules/prefer-usecallback-over-usememo-for-functions.md:** default allowComplexBodies to true ([ed9f6ca](https://github.com/BluMintInc/eslint-custom-rules/commit/ed9f6ca80dfe284066d302fd138848cc50a9e655))
* **src/rules/prefer-usecallback-over-usememo-for-functions.ts:** default true for allowComplexBodies ([9584277](https://github.com/BluMintInc/eslint-custom-rules/commit/9584277da66740b1ded13e85cf6efbd65faedb83))


### Features

* **enforce-dynamic-file-naming:** Add support for shortened disable directive 'ednl' ([caff6c3](https://github.com/BluMintInc/eslint-custom-rules/commit/caff6c3d4df76cf35864b797fd221beaa21ff7c0))

## [1.9.1](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.9.0...v1.9.1) (2025-03-03)


### Bug Fixes

* **enforce-id-capitalization:** fix rule to properly exclude type definitions ([#123](https://github.com/BluMintInc/eslint-custom-rules/pull/123))
* **.cursorrules:** force release version update ([3c72788](https://github.com/BluMintInc/eslint-custom-rules/commit/3c72788907630cfb4a84635f4aaa46f4f6a27073))

# [1.9.0](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.8.2...v1.9.0) (2025-03-03)


### Bug Fixes

* **src/rules/no-hungarian.ts:** remove completely unnecessary code ([81fb93f](https://github.com/BluMintInc/eslint-custom-rules/commit/81fb93fb653650d16888fce38a125e63504b3a25))
* **src/tests/no-uuidv4-base62-as-key.test.ts:** remove erroneous test case ([f4fba52](https://github.com/BluMintInc/eslint-custom-rules/commit/f4fba5289dc09560babccb8b8e1a82cf9c6c750a))


### Features

* **eslint-rule:** Enhance no-uuidv4-base62-as-key rule implementation ([bbda73e](https://github.com/BluMintInc/eslint-custom-rules/commit/bbda73e628571090091c6f2f686fa9fe55914246))

## [1.8.2](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.8.1...v1.8.2) (2025-02-28)


### Bug Fixes

* **enforce-singular-type-names.ts:** also allow "Options" and "Settings" ([0c6514a](https://github.com/BluMintInc/eslint-custom-rules/commit/0c6514a43151b7ca9cd5cf1031aed85b60419cdd))

## [1.8.1](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.8.0...v1.8.1) (2025-02-27)


### Bug Fixes

* **repo.md:** reduce indentation errors ([e27c611](https://github.com/BluMintInc/eslint-custom-rules/commit/e27c611b174cdbb94e52c753d3594f6bc15e65ea))
* **src/tests/no-unnecessary-destructuring.test.ts:** remove LLM comment for itself ([abbabcb](https://github.com/BluMintInc/eslint-custom-rules/commit/abbabcb44840e3bba626d7197186dc05abfc0a8d))
* **test-issue.ts:** delete ([fdf24c0](https://github.com/BluMintInc/eslint-custom-rules/commit/fdf24c0d7910b248122772506e68934b731e22f1))

# [1.8.0](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.7.3...v1.8.0) (2025-02-26)


### Bug Fixes

* **jest-config:** update test match pattern to include all test files ([2d332aa](https://github.com/BluMintInc/eslint-custom-rules/commit/2d332aa178cdb9c66858ff957384e591cef81e08))
* **openhands-resolver.yml:** use latest version of resolver ([7519d16](https://github.com/BluMintInc/eslint-custom-rules/commit/7519d16d579aff08972d0bc3db1bde1e2ef0dcd6))
* **src/rules/no-unnecessary-verb-suffix.ts:** preposition not verb ([00dc2df](https://github.com/BluMintInc/eslint-custom-rules/commit/00dc2dfe391cecdf74ad4eb8ef4159554235e842))
* **src/rules/no-unnecessary-verb-suffix.ts:** preposition not verb ([6c67b95](https://github.com/BluMintInc/eslint-custom-rules/commit/6c67b9595c78d2bc060ee65dfb7156363e056502))
* **src/tests/avatar-next-test.ts:** remove ([d3e7b46](https://github.com/BluMintInc/eslint-custom-rules/commit/d3e7b466eaebab136943b685d863a5384639fded))


### Features

* add new ESLint rules for various code quality improvements ([e51b27a](https://github.com/BluMintInc/eslint-custom-rules/commit/e51b27ad0d52165ab60bcd31cf6f5c1e9f7f8993))
* **enforce-render-hits-memoization:** enhance rule with improved memoization checks ([ef42251](https://github.com/BluMintInc/eslint-custom-rules/commit/ef42251a190827293ccf80acca359cdf12a9c4fc))
* **eslint-plugin:** Add new rules for React useMemo and verb suffix ([74c662e](https://github.com/BluMintInc/eslint-custom-rules/commit/74c662ebfb3eb953a7d62233722061baa1cfef3d))
* **eslint-plugin:** enhance enforce-assertSafe-object-key rule with more precise key access validation ([eea1ec7](https://github.com/BluMintInc/eslint-custom-rules/commit/eea1ec7e88aaa89813b30fbe673117ec52ebb0a0))
* **eslint-plugin:** improve prefer-fragment-component rule ([5a6f6ed](https://github.com/BluMintInc/eslint-custom-rules/commit/5a6f6ed612e16afe47274cc255ce6631011e9a6e))
* **eslint:** Enhance microdiff enforcement rule with more comprehensive checks ([5beeb2d](https://github.com/BluMintInc/eslint-custom-rules/commit/5beeb2d40f3d4178c766f5821a1c9d518227fb3c))

## [1.7.3](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.7.2...v1.7.3) (2025-02-16)


### Bug Fixes

* **enforce-render-hits-memoization:** force version update ([e66316a](https://github.com/BluMintInc/eslint-custom-rules/commit/e66316aedfdaa43481ef6d66ab09c3ec112f53dd))
* **enforce-verb-noun-naming.ts:** add "clean" for scripts like "cleanup" ([ec4852a](https://github.com/BluMintInc/eslint-custom-rules/commit/ec4852ac7a205fb93173df3587ddf2f9c61aa51c))
* **openhands-resolver.yml:** temporary rollback to v0.23.0 ([90b0164](https://github.com/BluMintInc/eslint-custom-rules/commit/90b0164d0355fb0b8166ba643d8625b698c6346b))

## [1.7.2](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.7.1...v1.7.2) (2025-02-12)


### Bug Fixes

* **index.ts:** turn off prefer-fragment-shorthand in recommended config ([aec89ff](https://github.com/BluMintInc/eslint-custom-rules/commit/aec89ff56b2940de5125bd51c4d62d85b1ebfa90))

## [1.7.1](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.7.0...v1.7.1) (2025-02-12)


### Bug Fixes

* **src/tests/require-hooks-default-params.test.ts:** add correct test that was causing the rule to fail ([e33901d](https://github.com/BluMintInc/eslint-custom-rules/commit/e33901ddc447c4ec14f9fa5166e202aa3c4184a4))

# [1.7.0](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.6.0...v1.7.0) (2025-02-10)


### Features

* **.openhands_instructions:** improve and add hard acceptance criteria ([d077615](https://github.com/BluMintInc/eslint-custom-rules/commit/d0776152c141480ba2c0658149eef2ca02abf766))
* **repo.md:** add in case openhands does not pick up .openhands_instructions ([769e644](https://github.com/BluMintInc/eslint-custom-rules/commit/769e64436bfcf576c5bcd0e1d02eb3e5f4b67610))

# [1.6.0](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.5.5...v1.6.0) (2025-02-05)


### Features

* **deploy-functions-changed.yml:** GitHub action to deploy only changed CFs ([375cdb4](https://github.com/BluMintInc/eslint-custom-rules/commit/375cdb47406dfeb3402aa4d249930879cccebb53))

## [1.5.5](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.5.4...v1.5.5) (2025-02-01)


### Bug Fixes

* force update ([fe8dfeb](https://github.com/BluMintInc/eslint-custom-rules/commit/fe8dfebe75459f727271c614f53902d71bedde51))

## [1.5.4](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.5.3...v1.5.4) (2025-02-01)


### Bug Fixes

* **forceUpdate:** force version update ([3814798](https://github.com/BluMintInc/eslint-custom-rules/commit/38147981212e114c9be5a01fde3210229b6628ef))

## [1.5.3](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.5.2...v1.5.3) (2025-02-01)


### Bug Fixes

* **.cursorrules:** force upgrade version ([02a87c2](https://github.com/BluMintInc/eslint-custom-rules/commit/02a87c25c80258d497452617e43a655103f26273))

## [1.5.2](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.5.1...v1.5.2) (2025-01-31)


### Bug Fixes

* **enforce-verb-noun-naming:** inline verbs.json ([8c4073e](https://github.com/BluMintInc/eslint-custom-rules/commit/8c4073e7070c6e44a29c5ce5eab0312e1121804b))

## [1.5.1](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.5.0...v1.5.1) (2025-01-31)


### Bug Fixes

* **verbs.json:** add programming terms ([fbbef84](https://github.com/BluMintInc/eslint-custom-rules/commit/fbbef84d6de97c1aed2f73149392e5653074597e))

# [1.5.0](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.4.0...v1.5.0) (2025-01-30)


### Bug Fixes

* **no-class-instance-destructuring:** Improve destructuring rule for class instances ([76a79d3](https://github.com/BluMintInc/eslint-custom-rules/commit/76a79d36080e5e956f31f3f4c3b3da697c3832de))
* **no-redundant-param-types:** Extract type annotation removal logic ([6fc3b24](https://github.com/BluMintInc/eslint-custom-rules/commit/6fc3b24ee0680c2e3be853329abbc57378a65b3b))


### Features

* **prefer-destructuring-no-class:** Enhance rule to handle object property destructuring ([dc5bfa9](https://github.com/BluMintInc/eslint-custom-rules/commit/dc5bfa926f893ff1d3eb9a52ec20203c6b82533a))

# [1.4.0](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.3.2...v1.4.0) (2025-01-30)


### Features

* **rules:** Add multiple new ESLint rules ([0685d7e](https://github.com/BluMintInc/eslint-custom-rules/commit/0685d7e002f729f0da0f83c50d6bea991d1489d8))

## [1.3.2](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.3.1...v1.3.2) (2025-01-29)


### Bug Fixes

* **.cursorrules:** trigger semantic patch upgrade ([f6133bc](https://github.com/BluMintInc/eslint-custom-rules/commit/f6133bca802ff066890cbf4747fda1c6ac3b51c7))

## [1.3.1](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.3.0...v1.3.1) (2025-01-29)


### Bug Fixes

* **.cursorrules:** trigger semantic version upgrade ([8a72248](https://github.com/BluMintInc/eslint-custom-rules/commit/8a72248f5ca5de9df4a3c795599125024a65b6c4))

# [1.3.0](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.2.1...v1.3.0) (2025-01-29)


### Bug Fixes

* **husky:** Remove commit-msg hook ([879f734](https://github.com/BluMintInc/eslint-custom-rules/commit/879f734979ef2ca097d4389430f8d579656b2127))


### Features

* **eslint-rules:** Add new rule and update README with type information and compositing layer props ([e047fb6](https://github.com/BluMintInc/eslint-custom-rules/commit/e047fb6ae03bd776ebbe079fbe8c7cd54a4f1323))

## [1.2.1](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.2.0...v1.2.1) (2025-01-27)


### Bug Fixes

* **.cursorrules:** trigger next release ([c9a34ad](https://github.com/BluMintInc/eslint-custom-rules/commit/c9a34ad941fb0a117a783134ab99f0ab91e435f6))
* **Add enforce-firestore-doc-ref-generic rule documentation and implementation:** add ([5b0f60f](https://github.com/BluMintInc/eslint-custom-rules/commit/5b0f60fda08544e954528b81625cc04b89195068))

# [1.2.0](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.1.9...v1.2.0) (2025-01-24)


### Features

* **eslint:** Add new rules and update documentation ([9f6afbd](https://github.com/BluMintInc/eslint-custom-rules/commit/9f6afbdffa763da7f5357f490784341a57c94669))
* **eslint:** Add rule to enforce using custom memo from src/util/memo ([bd223a0](https://github.com/BluMintInc/eslint-custom-rules/commit/bd223a0e95be3829a80ef03d35bb868b4e861d4b))

## [1.1.9](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.1.8...v1.1.9) (2025-01-20)


### Bug Fixes

* **.cursorrules:** force update patch version ([54dd68d](https://github.com/BluMintInc/eslint-custom-rules/commit/54dd68d10b554b0c9cff0cfbf58ba269450f613a))
* **.openhands_instructions:** force dummy release build ([b5eb40b](https://github.com/BluMintInc/eslint-custom-rules/commit/b5eb40b8626cc12ce8beec1a70402a2a353df65b))

## [1.1.8](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.1.7...v1.1.8) (2025-01-16)


### Bug Fixes

* **.cursorrules:** remove unnecessary commit message formatting instructions ([f96b4d5](https://github.com/BluMintInc/eslint-custom-rules/commit/f96b4d511fdae65461baf009441acd6ddc95fb94))

## [1.1.7](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.1.6...v1.1.7) (2025-01-16)


### Bug Fixes

* **.openhands_instructions:** instructions for commit messages WONT work ([fb9893b](https://github.com/BluMintInc/eslint-custom-rules/commit/fb9893b2eb4c9a969a440fe99a746e0f319a242b))

## [1.1.6](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.1.5...v1.1.6) (2025-01-15)


### Bug Fixes

* **.openhands_instructions:** mention `npx jest <filename>` ([08210ed](https://github.com/BluMintInc/eslint-custom-rules/commit/08210ed1ba6dbb929b2028256f259023238f8ef1))

## [1.1.5](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.1.4...v1.1.5) (2025-01-15)


### Bug Fixes

* **.openhands_instructions:** emphasize commit standard ([fb31b89](https://github.com/BluMintInc/eslint-custom-rules/commit/fb31b899256adf87024cef601557db25e20dab14))

## [1.1.4](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.1.3...v1.1.4) (2025-01-15)


### Bug Fixes

* **consistent-callback-naming rule:** resolve TS error ([355e95d](https://github.com/BluMintInc/eslint-custom-rules/commit/355e95dbe3dcfcee914982e5e24104732e3b904d))
* **extract-global-constants tests:** Migrate tests from __tests__ to tests directory and remove redundant cases. Consolidate valid and invalid test cases for improved clarity and maintainability. ([fa3bb54](https://github.com/BluMintInc/eslint-custom-rules/commit/fa3bb54d30b530b48433604f1dd1723248ce2383))

## [1.1.3](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.1.2...v1.1.3) (2025-01-09)


### Bug Fixes

* **consistent-callback-naming:** trigger npmjs release ([b742069](https://github.com/BluMintInc/eslint-custom-rules/commit/b742069dd22b0699d3bb2533a11182deb951a696))

## [1.1.2](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.1.1...v1.1.2) (2024-12-20)


### Bug Fixes

* **enforce-safe-stringify:** fix indentation ([08a288d](https://github.com/BluMintInc/eslint-custom-rules/commit/08a288d0a03b68092428effe526458d45e8a6b3f))

## [1.1.1](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.1.0...v1.1.1) (2024-12-19)


### Bug Fixes

* **consistent-callback-naming:** check that type of prop is a function ([9ce81e1](https://github.com/BluMintInc/eslint-custom-rules/commit/9ce81e1db2c949091260d3972a86b74860a9bec2))
* **extract-global-constants:** fix issue with functions misfiring ([72fd64b](https://github.com/BluMintInc/eslint-custom-rules/commit/72fd64b11f4bd0194396f3ce8148c87d0f32d850))

# [1.1.0](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.0.5...v1.1.0) (2024-12-19)


### Bug Fixes

* **enforce-callable-types:** pass missing generic arguments ([80b4615](https://github.com/BluMintInc/eslint-custom-rules/commit/80b46153f5090c7931986c0e0187ac3bf714d677))
* **enforce-identifiable-firestore-type:** fix type alias detection ([a50c99c](https://github.com/BluMintInc/eslint-custom-rules/commit/a50c99c7117033fe459f0a05743f8cc609dd798a))
* **enforce-serializable-params:** fix type alias detection, stop unnecessary testing dependency ([aa0f1a2](https://github.com/BluMintInc/eslint-custom-rules/commit/aa0f1a24b5bc625c95a803615f64a58c4c6f7a39))
* **no-jsx-whitespace-literal:** add missing generic arguments ([bb588ca](https://github.com/BluMintInc/eslint-custom-rules/commit/bb588cae42c830ed5b77c018fb80cc32e9ca7900))
* **openhands-resolver.yml:** remove concurrency queue ([4a63567](https://github.com/BluMintInc/eslint-custom-rules/commit/4a63567fb5c942971ea8604d6f3111944095e7af))
* **require-dynamic-firebase-imports:** fix alias import ([0eaab73](https://github.com/BluMintInc/eslint-custom-rules/commit/0eaab73b5ac5ae47192cb0ade19ac1fb4229f26c))
* **require-https-error:** cast befire comparison ([7280ac8](https://github.com/BluMintInc/eslint-custom-rules/commit/7280ac8823209d92aad79ef883d87f0af6db6b38))
* **require-https-error:** throw an error for Firebase HttpsError usage; enforce on frontend as well ([7919118](https://github.com/BluMintInc/eslint-custom-rules/commit/79191180987fe83ecf5a9e24ce872b14d6a82845))
* **use-custom-link:** use ruleTester correctly. Support default export ([fe2b0bd](https://github.com/BluMintInc/eslint-custom-rules/commit/fe2b0bd4bbae4bbbd18cea98717bdc46e9f1be84))
* **use-custom-router.test.ts:** use routing subdirectory ([838f63c](https://github.com/BluMintInc/eslint-custom-rules/commit/838f63c9cc5ea8585632654cb0080c8a85002db6))
* **use-custom-router.ts:** use routing subdirectory ([0eec277](https://github.com/BluMintInc/eslint-custom-rules/commit/0eec277f9669493c50ae0f28a963c15d936f7d49))


### Features

* **extract-global-constants:** add tests for direct template literals ([ccfa0da](https://github.com/BluMintInc/eslint-custom-rules/commit/ccfa0dac6cb4893bd64b17a46c1cab49770332c8))
* **no-unused-props:** support any name for props ending with "Props" ([130d4d5](https://github.com/BluMintInc/eslint-custom-rules/commit/130d4d5e0d6ccd6ed730d130aba4a81fa2d8bb80))
* **openhands-resolver.yml:** only run one at a time to reduce Anthropic API limit errors ([07d9fbd](https://github.com/BluMintInc/eslint-custom-rules/commit/07d9fbd02fbeda10e5d3ed99bd95c169ad02433d))

## [1.0.5](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.0.4...v1.0.5) (2024-12-05)


### Bug Fixes

* **.ts:** resolve eslint errors ([0e0af23](https://github.com/BluMintInc/eslint-custom-rules/commit/0e0af2361cfdc9e6b193fcdae2e6053160cdae98))


### Features

* **enforce-dynamic-file-naming:** add rule to enforce .dynamic.ts(x) naming convention when @blumintinc/blumint/enforce-dynamic-imports is disabled

## [1.0.4](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.0.3...v1.0.4) (2024-12-05)


### Bug Fixes

* **.gitignore:** ignore .env vars properly ([009b4e5](https://github.com/BluMintInc/eslint-custom-rules/commit/009b4e542e77d57e22d7dc035f366172c9dd442d))
* **devcontainer.json:** add postStartCommand, refactor extensions to customizations.vscode subdirectory ([90536a6](https://github.com/BluMintInc/eslint-custom-rules/commit/90536a67ff3b8a0caa2b12ce27056ee456946ba3))
* **devcontainer.json:** remove unnecessary firebase extension ([0a69b90](https://github.com/BluMintInc/eslint-custom-rules/commit/0a69b904fee183891349c213ed4e232bb24236a0))
* **Dockerfile:** remove git-flow ([e87d3ce](https://github.com/BluMintInc/eslint-custom-rules/commit/e87d3ce1714947a21351881ef421d4c990d49722))
* **package.json:** remove git-flow ([a9706a7](https://github.com/BluMintInc/eslint-custom-rules/commit/a9706a7aa8ecbe108f6b7f3dd0e02db9b6b1fa4e))

## [1.0.3](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.0.2...v1.0.3) (2024-11-13)


### Bug Fixes

* **.gitignore:** don't forget scripts ([8280b88](https://github.com/BluMintInc/eslint-custom-rules/commit/8280b88e935091a66c78c4d9c62f377e1c263268))
* **repo:** collapse plugin/ directory into root directory ([b698bbd](https://github.com/BluMintInc/eslint-custom-rules/commit/b698bbd6be96648ff29131f2870b4b56eb3d0b8e))
* **semantic-release.yml:** include build command ([fcc57e3](https://github.com/BluMintInc/eslint-custom-rules/commit/fcc57e38b8c127932a1d6b223b8f7368599f95f2))

## [1.0.2](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.0.1...v1.0.2) (2024-11-13)


### Bug Fixes

* **package.json:** use public access ([6d78460](https://github.com/BluMintInc/eslint-custom-rules/commit/6d78460c8b28cd852229b0b59759d48620ab483d))

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
