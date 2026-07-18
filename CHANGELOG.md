## [1.19.19](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.19.18...v1.19.19) (2026-07-18)


### Bug Fixes

* **enforce-assert-safe-object-key:** compute assertSafe import specifier relative to the fixed file (closes [#1321](https://github.com/BluMintInc/eslint-custom-rules/issues/1321)) ([543137d](https://github.com/BluMintInc/eslint-custom-rules/commit/543137d4299616521912856e530b4882500b8832))

## [1.19.18](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.19.17...v1.19.18) (2026-07-18)


### Bug Fixes

* **vertically-group-related-functions:** decline reorder that hoists a function above its interleaved type/const dependency (closes [#1320](https://github.com/BluMintInc/eslint-custom-rules/issues/1320)) ([79c1fa9](https://github.com/BluMintInc/eslint-custom-rules/commit/79c1fa9a54530e205c7f574cd3bf82a2a6849698))

## [1.19.17](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.19.16...v1.19.17) (2026-07-18)


### Bug Fixes

* **react-memoize-literals:** exempt literals inside iteration-method callbacks (closes [#1319](https://github.com/BluMintInc/eslint-custom-rules/issues/1319)) ([da30dc4](https://github.com/BluMintInc/eslint-custom-rules/commit/da30dc46578f0a4fc8caac8ec7c158d1d2025c25)), closes [#1290](https://github.com/BluMintInc/eslint-custom-rules/issues/1290)

## [1.19.16](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.19.15...v1.19.16) (2026-07-18)


### Bug Fixes

* **prefer-getter-over-parameterless-method:** withhold autofix for non-private methods (closes [#1318](https://github.com/BluMintInc/eslint-custom-rules/issues/1318)) ([721e945](https://github.com/BluMintInc/eslint-custom-rules/commit/721e945365601d31daec02d2fdbef5eb96458350))

## [1.19.15](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.19.14...v1.19.15) (2026-07-17)


### Bug Fixes

* **no-hungarian:** exempt PascalCase domain-qualifier names using built-in type words (closes [#1317](https://github.com/BluMintInc/eslint-custom-rules/issues/1317)) ([087e9f5](https://github.com/BluMintInc/eslint-custom-rules/commit/087e9f5da933f4c6bacd644f4a36f4cde1a6b30b))

## [1.19.14](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.19.13...v1.19.14) (2026-07-17)


### Bug Fixes

* **require-props-composition:** recognize direct whole-props refs and skip zero-prop children (closes [#1316](https://github.com/BluMintInc/eslint-custom-rules/issues/1316)) ([50edb74](https://github.com/BluMintInc/eslint-custom-rules/commit/50edb74e4388b1705d6a378a6666cfac84fd0e3a))

## [1.19.13](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.19.12...v1.19.13) (2026-07-17)


### Bug Fixes

* **ensure-pointer-events-none:** exempt hit-slop touch-target pseudo-elements (closes [#1315](https://github.com/BluMintInc/eslint-custom-rules/issues/1315)) ([e907eec](https://github.com/BluMintInc/eslint-custom-rules/commit/e907eec08644617c4f3fd840725f3b2f732df6b0))

## [1.19.12](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.19.11...v1.19.12) (2026-07-17)


### Bug Fixes

* **test-file-location-enforcement:** add opt-in additionalSubjectExtensions for non-JS/TS subjects (closes [#1314](https://github.com/BluMintInc/eslint-custom-rules/issues/1314)) ([4cc29ef](https://github.com/BluMintInc/eslint-custom-rules/commit/4cc29efae6224ae373b8095d025aa195a7ee78a8))

## [1.19.11](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.19.10...v1.19.11) (2026-07-17)


### Bug Fixes

* **global-const-style:** keep rename autofix reference-safe for shorthand props and re-exports (refs [#1313](https://github.com/BluMintInc/eslint-custom-rules/issues/1313)) ([3a78f39](https://github.com/BluMintInc/eslint-custom-rules/commit/3a78f395f2a3d360cfb75e533f5acb75b31a6c21))

## [1.19.10](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.19.9...v1.19.10) (2026-07-17)


### Bug Fixes

* **global-const-style:** scope-aware upperSnakeCase autofix + exempt jest mock handles (closes [#1313](https://github.com/BluMintInc/eslint-custom-rules/issues/1313)) ([6953a64](https://github.com/BluMintInc/eslint-custom-rules/commit/6953a6439f88101fb944539003394c59f90e4e58)), closes [#1256](https://github.com/BluMintInc/eslint-custom-rules/issues/1256)

## [1.19.9](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.19.8...v1.19.9) (2026-07-17)


### Bug Fixes

* **no-harness-coupled-disables:** only merge preceding comment when directive defers to it (closes [#1312](https://github.com/BluMintInc/eslint-custom-rules/issues/1312)) ([b799c18](https://github.com/BluMintInc/eslint-custom-rules/commit/b799c18f0718da347a01ea26880ffccb8af5ff89))

## [1.19.8](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.19.7...v1.19.8) (2026-07-17)


### Bug Fixes

* **prefer-utility-function-own-file:** exempt Next.js reserved page exports (closes [#1311](https://github.com/BluMintInc/eslint-custom-rules/issues/1311)) ([1ca842e](https://github.com/BluMintInc/eslint-custom-rules/commit/1ca842eb6780c65502dc94e9fd1a321f96393271)), closes [#333](https://github.com/BluMintInc/eslint-custom-rules/issues/333)
* **vertically-group-related-functions:** carry leading JSDoc with reordered functions across interleaved statements (closes [#1310](https://github.com/BluMintInc/eslint-custom-rules/issues/1310)) ([0998a47](https://github.com/BluMintInc/eslint-custom-rules/commit/0998a4760e8ae87e9681d00efd91025393739f21))
* **vertically-group-related-functions:** keep interleaved statements' own comments in place when reordering (refs [#1310](https://github.com/BluMintInc/eslint-custom-rules/issues/1310)) ([fa2a624](https://github.com/BluMintInc/eslint-custom-rules/commit/fa2a624b3a9b0ffbcc49dd8081e40ffb57b6d18f))

## [1.19.7](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.19.6...v1.19.7) (2026-07-16)


### Bug Fixes

* **no-redundant-this-params:** treat trailing-export classes as reachable ([6255cee](https://github.com/BluMintInc/eslint-custom-rules/commit/6255cee9e46e2372aacd884ad8c9fa2737e8644e)), closes [#1309](https://github.com/BluMintInc/eslint-custom-rules/issues/1309)

## [1.19.6](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.19.5...v1.19.6) (2026-07-16)


### Bug Fixes

* **no-redundant-this-params:** skip externally-reachable methods (closes [#1309](https://github.com/BluMintInc/eslint-custom-rules/issues/1309)) ([a7d4425](https://github.com/BluMintInc/eslint-custom-rules/commit/a7d4425affc585642442e3068bd7b2559c47fbe6))

## [1.19.5](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.19.4...v1.19.5) (2026-07-15)


### Bug Fixes

* **no-redundant-this-params:** skip get/set accessors when resolving callees (closes [#1308](https://github.com/BluMintInc/eslint-custom-rules/issues/1308)) ([1fe11b4](https://github.com/BluMintInc/eslint-custom-rules/commit/1fe11b4cbcdd06ae0d7ce67c5e6c802d459290ea))

## [1.19.4](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.19.3...v1.19.4) (2026-07-14)


### Bug Fixes

* **require-props-composition:** exclude decorative *Icon leaf components (closes [#1307](https://github.com/BluMintInc/eslint-custom-rules/issues/1307)) ([a6ad3a0](https://github.com/BluMintInc/eslint-custom-rules/commit/a6ad3a08263ab650268ae1af4a05a8889aa862d9))

## [1.19.3](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.19.2...v1.19.3) (2026-07-14)


### Bug Fixes

* **prefer-utility-function-own-file:** exempt factory consumed only by sibling const initializer literal (closes [#1305](https://github.com/BluMintInc/eslint-custom-rules/issues/1305)) ([22643c4](https://github.com/BluMintInc/eslint-custom-rules/commit/22643c40f40f969033ba8657bd0ff9ae1c451a80)), closes [#1303](https://github.com/BluMintInc/eslint-custom-rules/issues/1303)

## [1.19.2](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.19.1...v1.19.2) (2026-07-14)


### Bug Fixes

* **prefer-utility-function-own-file:** exempt shared primitive of cohesive multi-export utility modules (closes [#1303](https://github.com/BluMintInc/eslint-custom-rules/issues/1303)) ([323b121](https://github.com/BluMintInc/eslint-custom-rules/commit/323b121342ed1cc35717706b83bc58c158543c66)), closes [#2](https://github.com/BluMintInc/eslint-custom-rules/issues/2)
* **vertically-group-related-functions:** defer shared callees until all callers emitted (closes [#1304](https://github.com/BluMintInc/eslint-custom-rules/issues/1304)) ([3b7bacd](https://github.com/BluMintInc/eslint-custom-rules/commit/3b7bacd37d961e2d04ff9673f7e1fc04aabe9aef))

## [1.19.1](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.19.0...v1.19.1) (2026-07-14)


### Bug Fixes

* **consistent-callback-naming:** require uppercase after "handle" so past-participle identifiers aren't stripped (closes [#1301](https://github.com/BluMintInc/eslint-custom-rules/issues/1301)) ([ab1cb76](https://github.com/BluMintInc/eslint-custom-rules/commit/ab1cb7686642c2314ce70fb769da4722c4c8c7a4))
* **consistent-callback-naming:** skip files without TS project services instead of aborting the run (closes [#1302](https://github.com/BluMintInc/eslint-custom-rules/issues/1302)) ([bc51cd9](https://github.com/BluMintInc/eslint-custom-rules/commit/bc51cd9bd2f21cc49e4790fc4abe57d9ed744331))

# [1.19.0](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.18.16...v1.19.0) (2026-07-13)


### Bug Fixes

* **prefer-clone-deep:** stop flagging top-level spread beside a sibling nested object (closes [#1299](https://github.com/BluMintInc/eslint-custom-rules/issues/1299)) ([685cb93](https://github.com/BluMintInc/eslint-custom-rules/commit/685cb93f19f5989c25dba7dd8354faaede1e53d7))


### Features

* **enforce-single-exported-unit-per-file:** limit each file to one exported component/class (closes [#1295](https://github.com/BluMintInc/eslint-custom-rules/issues/1295)) ([47b4bc3](https://github.com/BluMintInc/eslint-custom-rules/commit/47b4bc31a4794df57f6f3fc06d6dcb09b35db5b6))
* **no-harness-coupled-disables:** flag eslint-disable justifications coupled to the dev harness (closes [#1296](https://github.com/BluMintInc/eslint-custom-rules/issues/1296)) ([8b9110f](https://github.com/BluMintInc/eslint-custom-rules/commit/8b9110f8389536834a487e0098a342773de22338))
* **prefer-map-over-conditional-dispatch:** flag literal-union dispatch that should be a Record lookup (closes [#1298](https://github.com/BluMintInc/eslint-custom-rules/issues/1298)) ([09b1225](https://github.com/BluMintInc/eslint-custom-rules/commit/09b1225a95ce4158d709ae66805c758de42a6454))
* **prefer-union-from-const-array:** derive string-literal union types from an as-const array (closes [#1297](https://github.com/BluMintInc/eslint-custom-rules/issues/1297)) ([8c8d5e9](https://github.com/BluMintInc/eslint-custom-rules/commit/8c8d5e99e408fec0fbebca835c22aa1ffe97d3b7))

## [1.18.16](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.18.15...v1.18.16) (2026-07-13)


### Bug Fixes

* **memo-nested-react-components:** recognize project-local memo/forwardRef re-exports in HOC-factory escape hatch (closes [#1293](https://github.com/BluMintInc/eslint-custom-rules/issues/1293)) ([cd549b7](https://github.com/BluMintInc/eslint-custom-rules/commit/cd549b7b1f301e469954eeab84b457bf0b39f3bf))
* **no-hungarian:** exempt interior type-word segments in SCREAMING_SNAKE_CASE constants (closes [#1294](https://github.com/BluMintInc/eslint-custom-rules/issues/1294)) ([3513403](https://github.com/BluMintInc/eslint-custom-rules/commit/3513403327a0d343c82faa74571c9f0848a9a27b))

## [1.18.15](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.18.14...v1.18.15) (2026-07-13)


### Bug Fixes

* **react-memoize-literals:** exclude SCREAMING_SNAKE_CASE constants from component detection (closes [#1292](https://github.com/BluMintInc/eslint-custom-rules/issues/1292)) ([967f781](https://github.com/BluMintInc/eslint-custom-rules/commit/967f781d2b681967477e0902fe7e32c83a44c11f))

## [1.18.14](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.18.13...v1.18.14) (2026-07-13)


### Bug Fixes

* **no-entire-object-hook-deps:** treat non-literal computed keys as whole-object access (closes [#1291](https://github.com/BluMintInc/eslint-custom-rules/issues/1291)) ([412adda](https://github.com/BluMintInc/eslint-custom-rules/commit/412adda209be8201ca58c2495430a2cbe767c03f))

## [1.18.13](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.18.12...v1.18.13) (2026-07-13)


### Bug Fixes

* **no-compositing-layer-props:** exempt transform/opacity inside [@keyframes](https://github.com/keyframes) (closes [#1288](https://github.com/BluMintInc/eslint-custom-rules/issues/1288)) ([bdea3e5](https://github.com/BluMintInc/eslint-custom-rules/commit/bdea3e58889abfc99437e3e27698d4ae1a367332)), closes [#182](https://github.com/BluMintInc/eslint-custom-rules/issues/182)
* **parallelize-async-operations:** don't flag write-then-read on the same receiver (closes [#1287](https://github.com/BluMintInc/eslint-custom-rules/issues/1287)) ([bef96c5](https://github.com/BluMintInc/eslint-custom-rules/commit/bef96c55b44fc7ab7138debc644d6cfe6ca979fc))
* **react-memoize-literals:** exempt Array iteration callbacks (.map/.filter/...) (closes [#1290](https://github.com/BluMintInc/eslint-custom-rules/issues/1290)) ([1a24edc](https://github.com/BluMintInc/eslint-custom-rules/commit/1a24edc32e17f25442257811fdd75fcae83c84b9)), closes [#1093](https://github.com/BluMintInc/eslint-custom-rules/issues/1093)
* **require-props-composition:** recognize inverse composition (child derives from parent) (closes [#1289](https://github.com/BluMintInc/eslint-custom-rules/issues/1289)) ([cada7a9](https://github.com/BluMintInc/eslint-custom-rules/commit/cada7a93d46294c59a14a6ceffc255141eee4883))

## [1.18.12](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.18.11...v1.18.12) (2026-07-12)


### Bug Fixes

* **prefer-utility-function-own-file:** exempt CLI entry-point and registry modules (closes [#1285](https://github.com/BluMintInc/eslint-custom-rules/issues/1285)) ([f07eae1](https://github.com/BluMintInc/eslint-custom-rules/commit/f07eae134e1a533401f1b699b7abf91e56f77cad))
* **vertically-group-related-functions:** make call graph primary over name-prefix groups (closes [#1286](https://github.com/BluMintInc/eslint-custom-rules/issues/1286)) ([c26280c](https://github.com/BluMintInc/eslint-custom-rules/commit/c26280c2e6be336e92bbffc4c4a28d382691489c))

## [1.18.11](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.18.10...v1.18.11) (2026-07-11)


### Bug Fixes

* **parallelize-async-operations:** treat throw-gated guard awaits as a sequencing barrier (closes [#1284](https://github.com/BluMintInc/eslint-custom-rules/issues/1284)) ([d5c257e](https://github.com/BluMintInc/eslint-custom-rules/commit/d5c257ed4f72934c7a5a3eca5ce5ac44eab5270a))

## [1.18.10](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.18.9...v1.18.10) (2026-07-11)


### Bug Fixes

* **parallelize-async-operations:** restore coordinator to COORDINATOR_PATTERN (closes [#1283](https://github.com/BluMintInc/eslint-custom-rules/issues/1283)) ([a9ae52d](https://github.com/BluMintInc/eslint-custom-rules/commit/a9ae52d2601b606fb4b751e8168a8e8091499659))

## [1.18.9](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.18.8...v1.18.9) (2026-07-11)


### Bug Fixes

* **class-methods-read-top-to-bottom:** align recommended meta with error config (closes [#1282](https://github.com/BluMintInc/eslint-custom-rules/issues/1282)) ([ec174c0](https://github.com/BluMintInc/eslint-custom-rules/commit/ec174c026c17fa4281d5c6713a662f63fa0474d1))
* **enforce-m3-sentence-case:** bump recommended severity to error (closes [#1282](https://github.com/BluMintInc/eslint-custom-rules/issues/1282)) ([6ae43c4](https://github.com/BluMintInc/eslint-custom-rules/commit/6ae43c4f87cae316a0e1bf3d0db9dfa3ee1ba492))
* **enforce-props-naming-consistency:** align recommended meta with error config (closes [#1282](https://github.com/BluMintInc/eslint-custom-rules/issues/1282)) ([37d4e88](https://github.com/BluMintInc/eslint-custom-rules/commit/37d4e88a93e5d3da9f7450350d653b074b90a6bf))
* **no-console-error:** bump recommended severity to error (closes [#1282](https://github.com/BluMintInc/eslint-custom-rules/issues/1282)) ([3790adb](https://github.com/BluMintInc/eslint-custom-rules/commit/3790adb51d6f9c0c9471fc760945891087952587))
* **no-firestore-object-arrays:** align recommended meta with error config (closes [#1282](https://github.com/BluMintInc/eslint-custom-rules/issues/1282)) ([4956ec7](https://github.com/BluMintInc/eslint-custom-rules/commit/4956ec7539aa2710fe2b44ce1e5a419838d861b1))
* **no-margin-properties:** align recommended meta with error config (closes [#1282](https://github.com/BluMintInc/eslint-custom-rules/issues/1282)) ([f74c803](https://github.com/BluMintInc/eslint-custom-rules/commit/f74c80321dd9591f9557d3b75a29242bd9ca867a))
* **prefer-field-paths-in-transforms:** bump recommended severity to error (closes [#1282](https://github.com/BluMintInc/eslint-custom-rules/issues/1282)) ([3579437](https://github.com/BluMintInc/eslint-custom-rules/commit/3579437cc4cbdb93b37474d1fd8ff4e1df12b69d))
* **prefer-flat-transform-each-keys:** bump recommended severity to error (closes [#1282](https://github.com/BluMintInc/eslint-custom-rules/issues/1282)) ([8f11c34](https://github.com/BluMintInc/eslint-custom-rules/commit/8f11c34f787a991f68bf8a46ce90f3f8349d73de))
* **prefer-utility-function-own-file:** bump recommended severity to error (closes [#1282](https://github.com/BluMintInc/eslint-custom-rules/issues/1282)) ([81eba99](https://github.com/BluMintInc/eslint-custom-rules/commit/81eba999f9d8b7f6cc87a7849c8e5b63ad9d7c80)), closes [#43365](https://github.com/BluMintInc/eslint-custom-rules/issues/43365)
* **require-props-composition:** bump recommended severity to error (closes [#1282](https://github.com/BluMintInc/eslint-custom-rules/issues/1282)) ([5fb8051](https://github.com/BluMintInc/eslint-custom-rules/commit/5fb80518b44c94d9611f841d9b127defe586ccf3)), closes [#1181](https://github.com/BluMintInc/eslint-custom-rules/issues/1181)
* **warn-https-error-message-user-friendly:** bump recommended severity to error (closes [#1282](https://github.com/BluMintInc/eslint-custom-rules/issues/1282)) ([a124211](https://github.com/BluMintInc/eslint-custom-rules/commit/a1242110e912e81bc84c8ff7822d0cc2720c0eec))

## [1.18.8](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.18.7...v1.18.8) (2026-07-10)


### Bug Fixes

* **enforce-positive-naming:** whitelist "unknown" and derive real suggestions for non-is prefixes (closes [#1281](https://github.com/BluMintInc/eslint-custom-rules/issues/1281)) ([f5741b2](https://github.com/BluMintInc/eslint-custom-rules/commit/f5741b288e0806539dce3e9187b85d6d4a1249ac))
* **react-memoize-literals:** exempt nested object literals inside sx/style values (closes [#1280](https://github.com/BluMintInc/eslint-custom-rules/issues/1280)) ([d283b99](https://github.com/BluMintInc/eslint-custom-rules/commit/d283b99a88e90b093e14a91175b39a81c5a43017))

## [1.18.7](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.18.6...v1.18.7) (2026-07-10)


### Bug Fixes

* **class-methods-read-top-to-bottom:** preserve abstract members during autofix (closes [#1279](https://github.com/BluMintInc/eslint-custom-rules/issues/1279)) ([24b694c](https://github.com/BluMintInc/eslint-custom-rules/commit/24b694c71234ae5532f9370c6492263640c045ce))

## [1.18.6](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.18.5...v1.18.6) (2026-07-09)


### Bug Fixes

* **no-hungarian:** exempt domain-entity <noun>Number compounds (closes [#1277](https://github.com/BluMintInc/eslint-custom-rules/issues/1277)) ([7ad5e6e](https://github.com/BluMintInc/eslint-custom-rules/commit/7ad5e6e3f0697ea684eae7b827799a9e62e47147)), closes [#640](https://github.com/BluMintInc/eslint-custom-rules/issues/640)
* **no-unnecessary-verb-suffix:** bail autofix on rename collision (closes [#1278](https://github.com/BluMintInc/eslint-custom-rules/issues/1278)) ([aa096d1](https://github.com/BluMintInc/eslint-custom-rules/commit/aa096d150b6d8d3dee5b9624e0c32537070eaab7))

## [1.18.5](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.18.4...v1.18.5) (2026-07-09)


### Bug Fixes

* **enforce-props-argument-name:** exempt subclass parameter properties to avoid TS2415/TS2304 (closes [#1276](https://github.com/BluMintInc/eslint-custom-rules/issues/1276)) ([b70a1df](https://github.com/BluMintInc/eslint-custom-rules/commit/b70a1dfb90fc4846acac389ceb47d4140f3cb0bf))

## [1.18.4](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.18.3...v1.18.4) (2026-07-08)


### Bug Fixes

* **enforce-singular-type-names:** exempt container (array/tuple) type aliases (closes [#1275](https://github.com/BluMintInc/eslint-custom-rules/issues/1275)) ([d357e2f](https://github.com/BluMintInc/eslint-custom-rules/commit/d357e2f372b6c136a020945e8a28f8ea34c04adc))
* **prefer-sx-prop-over-system-props:** exempt semantic `color` on Button/IconButton/Chip/Badge (closes [#1273](https://github.com/BluMintInc/eslint-custom-rules/issues/1273)) ([531c2ef](https://github.com/BluMintInc/eslint-custom-rules/commit/531c2ef8c316a3b45e4d2b43c3534fe9c8780999))
* **react-memoize-literals:** follow sx/style exemption through variable-mediated values (closes [#1274](https://github.com/BluMintInc/eslint-custom-rules/issues/1274)) ([54e02c2](https://github.com/BluMintInc/eslint-custom-rules/commit/54e02c28a8dd9b050d105bb6a74f085e4680ff90)), closes [#1169](https://github.com/BluMintInc/eslint-custom-rules/issues/1169)
* **require-server-timestamp-for-firestore-dates:** exempt local render seeds passed to React state setters (closes [#1272](https://github.com/BluMintInc/eslint-custom-rules/issues/1272)) ([c7a2af0](https://github.com/BluMintInc/eslint-custom-rules/commit/c7a2af07f4d507c43760d2639e60f68256365799))

## [1.18.3](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.18.2...v1.18.3) (2026-07-06)


### Bug Fixes

* **avoid-utils-directory:** normalize Windows path separators before regex match (closes [#1270](https://github.com/BluMintInc/eslint-custom-rules/issues/1270)) ([d5f7251](https://github.com/BluMintInc/eslint-custom-rules/commit/d5f7251a14aa5148cb42557010d6499fef64dbbb)), closes [#1259](https://github.com/BluMintInc/eslint-custom-rules/issues/1259)
* **enforce-identifiable-firestore-type:** normalize Windows path separators before regex match (closes [#1271](https://github.com/BluMintInc/eslint-custom-rules/issues/1271)) ([d42a742](https://github.com/BluMintInc/eslint-custom-rules/commit/d42a74201a5473f2fd36ac42267c05327f2f87ae)), closes [#1259](https://github.com/BluMintInc/eslint-custom-rules/issues/1259)

## [1.18.2](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.18.1...v1.18.2) (2026-07-06)


### Bug Fixes

* **enforce-callable-types:** normalize Windows path separators before path check (closes [#1265](https://github.com/BluMintInc/eslint-custom-rules/issues/1265)) ([3c4333c](https://github.com/BluMintInc/eslint-custom-rules/commit/3c4333c1bc15c5815b934742d57127eb7c658d14))
* **enforce-is-prefix-validators:** normalize Windows path separators before matching (closes [#1269](https://github.com/BluMintInc/eslint-custom-rules/issues/1269)) ([4f72935](https://github.com/BluMintInc/eslint-custom-rules/commit/4f729351512a8fbfb53561c5e659d7ac19b1fb20))
* **enforce-timestamp-now:** normalize Windows path separators before path check (closes [#1266](https://github.com/BluMintInc/eslint-custom-rules/issues/1266)) ([8d165df](https://github.com/BluMintInc/eslint-custom-rules/commit/8d165df0d9651704f8b7d8dbe063b74e9f55e281))
* **prefer-use-base62-id:** resolve absolute filenames against target path globs (closes [#1267](https://github.com/BluMintInc/eslint-custom-rules/issues/1267)) ([5450019](https://github.com/BluMintInc/eslint-custom-rules/commit/54500193841cacc9d7b17e6f9ce78dcab34bbd47)), closes [#1259](https://github.com/BluMintInc/eslint-custom-rules/issues/1259)
* **require-https-error:** normalize Windows path separators before path check (closes [#1264](https://github.com/BluMintInc/eslint-custom-rules/issues/1264)) ([5f2184a](https://github.com/BluMintInc/eslint-custom-rules/commit/5f2184a8a8df52a5d01232b3f37ec37484d286b7))
* **require-props-composition:** resolve absolute filenames against target path globs (closes [#1268](https://github.com/BluMintInc/eslint-custom-rules/issues/1268)) ([91b793b](https://github.com/BluMintInc/eslint-custom-rules/commit/91b793b18c7132c4b74b1a7e7d2be39b931ddcfd)), closes [#1267](https://github.com/BluMintInc/eslint-custom-rules/issues/1267) [#1259](https://github.com/BluMintInc/eslint-custom-rules/issues/1259)

## [1.18.1](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.18.0...v1.18.1) (2026-07-06)


### Bug Fixes

* **consistent-callback-naming:** exempt value-returning accessor props (closes [#1262](https://github.com/BluMintInc/eslint-custom-rules/issues/1262)) ([d92a1c6](https://github.com/BluMintInc/eslint-custom-rules/commit/d92a1c64320e95d6aeca967b8a14e0c381868f29)), closes [#1182](https://github.com/BluMintInc/eslint-custom-rules/issues/1182)
* **enforce-positive-naming:** treat the "disabled" word family as valid (closes [#1261](https://github.com/BluMintInc/eslint-custom-rules/issues/1261)) ([17a8866](https://github.com/BluMintInc/eslint-custom-rules/commit/17a8866d4b12fb6dfe96c1c16d4f4e47f4c989e0)), closes [#772](https://github.com/BluMintInc/eslint-custom-rules/issues/772) [#634](https://github.com/BluMintInc/eslint-custom-rules/issues/634) [#859](https://github.com/BluMintInc/eslint-custom-rules/issues/859) [#569](https://github.com/BluMintInc/eslint-custom-rules/issues/569)
* **enforce-types-directory-placement:** exempt frontend-coupled type files (closes [#1263](https://github.com/BluMintInc/eslint-custom-rules/issues/1263)) ([53cd837](https://github.com/BluMintInc/eslint-custom-rules/commit/53cd837ab5f4985c1d669134707ab8ac03d7a08a))
* **global-const-style:** exempt Next.js reserved exports from autofix rename (closes [#1257](https://github.com/BluMintInc/eslint-custom-rules/issues/1257)) ([5664ba3](https://github.com/BluMintInc/eslint-custom-rules/commit/5664ba33e3f5b7db530b0f44953c78c69cda7796))
* **no-hungarian:** don't flag words ending in an abbreviation marker (closes [#1258](https://github.com/BluMintInc/eslint-custom-rules/issues/1258)) ([fe08209](https://github.com/BluMintInc/eslint-custom-rules/commit/fe0820999e4792231deaf8eb8b4a9f7e022806a1))
* **prefer-use-theme:** normalize Windows path separators before path checks (closes [#1259](https://github.com/BluMintInc/eslint-custom-rules/issues/1259)) ([d1cb8ff](https://github.com/BluMintInc/eslint-custom-rules/commit/d1cb8ff447269a7e5519069815c04e0661785a44))
* **prefer-use-theme:** stop pointing BORDER_RADIUS/CONTAINER_WIDTH at absent theme paths (closes [#1260](https://github.com/BluMintInc/eslint-custom-rules/issues/1260)) ([6521d20](https://github.com/BluMintInc/eslint-custom-rules/commit/6521d20d0c90fe97a5342608851ab0d5d7fc8f43))

# [1.18.0](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.17.3...v1.18.0) (2026-07-02)


### Features

* **no-inline-component-prop:** register the orphaned rule in the plugin ([#1233](https://github.com/BluMintInc/eslint-custom-rules/issues/1233)) ([76b4be5](https://github.com/BluMintInc/eslint-custom-rules/commit/76b4be55b17959c4546797daa9f588f7f62ec12b)), closes [#833](https://github.com/BluMintInc/eslint-custom-rules/issues/833) [#833](https://github.com/BluMintInc/eslint-custom-rules/issues/833)

## [1.17.3](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.17.2...v1.17.3) (2026-07-02)


### Bug Fixes

* **no-unnecessary-verb-suffix:** make autofix reference-safe (closes [#1256](https://github.com/BluMintInc/eslint-custom-rules/issues/1256)) ([2cadde0](https://github.com/BluMintInc/eslint-custom-rules/commit/2cadde08d9d968c3f8db9bed4bec1eb8d370a651))

## [1.17.2](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.17.1...v1.17.2) (2026-07-02)


### Bug Fixes

* **no-explicit-return-type:** exempt read-only widening return types from removal (closes [#1253](https://github.com/BluMintInc/eslint-custom-rules/issues/1253)) ([9c50fc5](https://github.com/BluMintInc/eslint-custom-rules/commit/9c50fc59d8f666d1d04a81cf68bedfb877659ed3)), closes [#1216](https://github.com/BluMintInc/eslint-custom-rules/issues/1216)
* **no-hungarian:** treat Fn/Func/Function as function-role designators, not type tags (closes [#1255](https://github.com/BluMintInc/eslint-custom-rules/issues/1255)) ([f4b7956](https://github.com/BluMintInc/eslint-custom-rules/commit/f4b7956f8f1b9f02d3b72b32619b51c896b4e9d2))
* **no-type-assertion-returns:** allow type assertions as call/new arguments in return position (closes [#1254](https://github.com/BluMintInc/eslint-custom-rules/issues/1254)) ([883cbc1](https://github.com/BluMintInc/eslint-custom-rules/commit/883cbc1bdc351787ed0a6741bde197074c8e34ea)), closes [530/#565](https://github.com/BluMintInc/eslint-custom-rules/issues/565)
* **no-unnecessary-verb-suffix:** stop flagging Async/Sync execution-model suffixes (closes [#1252](https://github.com/BluMintInc/eslint-custom-rules/issues/1252)) ([6c46e08](https://github.com/BluMintInc/eslint-custom-rules/commit/6c46e08c79e5b21d7d9208098a219ff1c02c9ea9))

## [1.17.1](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.17.0...v1.17.1) (2026-07-01)


### Bug Fixes

* **no-hungarian:** exempt middle-segment full-type-words from Hungarian detection (closes [#1250](https://github.com/BluMintInc/eslint-custom-rules/issues/1250)) ([021e1fd](https://github.com/BluMintInc/eslint-custom-rules/commit/021e1fd8ac85dae46c54061cc7af160a2fa3f548)), closes [#1246](https://github.com/BluMintInc/eslint-custom-rules/issues/1246)
* **react-memoize-literals:** exempt hook returns containing JSX-valued members (closes [#1251](https://github.com/BluMintInc/eslint-custom-rules/issues/1251)) ([c53db0b](https://github.com/BluMintInc/eslint-custom-rules/commit/c53db0b37cdd0746cfd1de1f9dcebdf6bafa2a22))

# [1.17.0](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.16.2...v1.17.0) (2026-07-01)


### Bug Fixes

* **enforce-boolean-naming-prefixes:** require boolean prefix at a name boundary in callExpressionLooksBoolean (closes [#1249](https://github.com/BluMintInc/eslint-custom-rules/issues/1249)) ([0112e0d](https://github.com/BluMintInc/eslint-custom-rules/commit/0112e0dd31d674b1bd0a606d0265dcc17216c257))
* **prefer-getter-over-parameterless-method:** exempt throwing and builder/factory methods (closes [#1248](https://github.com/BluMintInc/eslint-custom-rules/issues/1248)) ([c9d800d](https://github.com/BluMintInc/eslint-custom-rules/commit/c9d800d807534d9ce8ecb5d5345a5cbc0f15994b)), closes [#990](https://github.com/BluMintInc/eslint-custom-rules/issues/990) [#4](https://github.com/BluMintInc/eslint-custom-rules/issues/4)


### Features

* **enforce-cloud-function-id-length:** flag .f.ts paths deriving Firebase IDs over 62 chars (closes [#1222](https://github.com/BluMintInc/eslint-custom-rules/issues/1222)) ([238908f](https://github.com/BluMintInc/eslint-custom-rules/commit/238908fdf488322e83ce0b58403f026d39ce6400))
* **enforce-is-prefix-validators:** require is-prefix on exported validators (closes [#1193](https://github.com/BluMintInc/eslint-custom-rules/issues/1193)) ([9088ff7](https://github.com/BluMintInc/eslint-custom-rules/commit/9088ff7192fba974db86973dec9bac3b5c80433b))
* **enforce-m3-sentence-case:** warn on Title Case / ALL CAPS user-facing text (closes [#1190](https://github.com/BluMintInc/eslint-custom-rules/issues/1190)) ([94e0c95](https://github.com/BluMintInc/eslint-custom-rules/commit/94e0c95542210afaf5ab2f7db367d135a58ddd65))
* **enforce-snapshot-state-narrowing:** require isSnapshotReady over falsy/typeof checks (closes [#1210](https://github.com/BluMintInc/eslint-custom-rules/issues/1210)) ([31e9d4d](https://github.com/BluMintInc/eslint-custom-rules/commit/31e9d4d507d7728201ba8a37d322d366402b6815))
* **enforce-types-directory-placement:** flag type-only files outside functions/src/types (closes [#1194](https://github.com/BluMintInc/eslint-custom-rules/issues/1194)) ([529b599](https://github.com/BluMintInc/eslint-custom-rules/commit/529b5998030189f5c3e93ff87e6a02009edd2e4d))
* **no-direct-function-state:** flag functions passed directly to useState setters (closes [#1208](https://github.com/BluMintInc/eslint-custom-rules/issues/1208)) ([934c5fa](https://github.com/BluMintInc/eslint-custom-rules/commit/934c5fac203817848b06312584e1b39b29202361))
* **no-fill-template-mutation:** forbid mutating fillTemplate() results (closes [#1209](https://github.com/BluMintInc/eslint-custom-rules/issues/1209)) ([473890e](https://github.com/BluMintInc/eslint-custom-rules/commit/473890e4c5a463535342407a9f4ebc4abefc7384))
* **no-portal-inside-tooltip:** flag portals nested in tooltip wrappers (closes [#1223](https://github.com/BluMintInc/eslint-custom-rules/issues/1223)) ([85e7a73](https://github.com/BluMintInc/eslint-custom-rules/commit/85e7a73d5d023e4d7f879473fca209277f3798c1))
* **no-redundant-boolean-callback-props:** flag boolean props redundant with a callback's presence (closes [#1192](https://github.com/BluMintInc/eslint-custom-rules/issues/1192)) ([ba9dfe4](https://github.com/BluMintInc/eslint-custom-rules/commit/ba9dfe4f9f6a4dda198de7b91f146d8de9926864))
* **no-satisfies-in-frontend-bundle:** ban satisfies in webpack-bundled files (closes [#1226](https://github.com/BluMintInc/eslint-custom-rules/issues/1226)) ([0719960](https://github.com/BluMintInc/eslint-custom-rules/commit/071996089fd8f81455570b32db4970d14358f22b))
* **no-single-dismiss-dialog-button:** flag lone dismiss button in dialog buttons array (closes [#1221](https://github.com/BluMintInc/eslint-custom-rules/issues/1221)) ([9c5eacf](https://github.com/BluMintInc/eslint-custom-rules/commit/9c5eacfdde72dbb0dc311dd2ab0da0c128128f8c))
* **no-stablehash-react-nodes:** flag stableHash() on ReactNodes/KeyedNodes (closes [#1134](https://github.com/BluMintInc/eslint-custom-rules/issues/1134)) ([256f96d](https://github.com/BluMintInc/eslint-custom-rules/commit/256f96dd84aa03e3b69be1de94b7cc7b48453f58))
* **parallelize-loop-awaits:** flag sequential await in loops parallelizable via Promise.all (closes [#1184](https://github.com/BluMintInc/eslint-custom-rules/issues/1184)) ([c8206e7](https://github.com/BluMintInc/eslint-custom-rules/commit/c8206e71a02b42caaa4f57c768b7f4cd6fccbf2f))
* **prefer-flat-transform-each-keys:** flag nested objects in propagation transformEach returns (closes [#1212](https://github.com/BluMintInc/eslint-custom-rules/issues/1212)) ([a4d0957](https://github.com/BluMintInc/eslint-custom-rules/commit/a4d09578409829ffe99e7754854bd7a9da3df570))
* **prefer-spread-over-reassembly:** flag destructure-then-reassemble prop forwarding (closes [#1188](https://github.com/BluMintInc/eslint-custom-rules/issues/1188)) ([b3b99c8](https://github.com/BluMintInc/eslint-custom-rules/commit/b3b99c8aa3c1b8ed7c086ab3167e53b033905df1))
* **prefer-sx-prop-over-system-props:** migrate deprecated MUI system props into sx (closes [#1189](https://github.com/BluMintInc/eslint-custom-rules/issues/1189)) ([a9556f2](https://github.com/BluMintInc/eslint-custom-rules/commit/a9556f26575ce3c7cc29a7e771fd0ae7afce5aca))
* **prefer-use-base62-id:** prefer useBase62Id() over useState/useRef/useMemo + uuidv4Base62() (closes [#1206](https://github.com/BluMintInc/eslint-custom-rules/issues/1206)) ([7b10eb4](https://github.com/BluMintInc/eslint-custom-rules/commit/7b10eb459173bffe994deaaeaab848dd0dc163ee))
* **prefer-use-theme:** flag direct theme-constant imports over useTheme() (closes [#1213](https://github.com/BluMintInc/eslint-custom-rules/issues/1213)) ([b88b833](https://github.com/BluMintInc/eslint-custom-rules/commit/b88b8338b81c9297c169b2babd7246d80f6d8d3e))
* **prefer-utility-function-own-file:** flag sizable co-located utility functions (closes [#1234](https://github.com/BluMintInc/eslint-custom-rules/issues/1234)) ([8e6b41e](https://github.com/BluMintInc/eslint-custom-rules/commit/8e6b41e0933dd6c52f73444ee9ebd8a06d1c487d))
* **require-props-composition:** flag component Props that don't compose with rendered children (closes [#1181](https://github.com/BluMintInc/eslint-custom-rules/issues/1181)) ([88cd675](https://github.com/BluMintInc/eslint-custom-rules/commit/88cd675feb3fa182a1a2c4169e10dc7533429594))
* **require-server-timestamp-for-firestore-dates:** flag new Date() in Firestore-typed objects (closes [#1183](https://github.com/BluMintInc/eslint-custom-rules/issues/1183)) ([81beda6](https://github.com/BluMintInc/eslint-custom-rules/commit/81beda6fee708e7590824a9a3ba5b8ca10ac3a31))

## [1.16.2](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.16.1...v1.16.2) (2026-06-30)


### Bug Fixes

* **logical-top-to-bottom-grouping:** restore loop-mutation guard and indentation-preserving idempotent autofix (closes [#1247](https://github.com/BluMintInc/eslint-custom-rules/issues/1247)) ([96102e5](https://github.com/BluMintInc/eslint-custom-rules/commit/96102e5891f6b27b4807d8bf1e6a23b04e123dff)), closes [1113/#1121](https://github.com/BluMintInc/eslint-custom-rules/issues/1121)
* **no-hungarian:** only flag abbreviation markers at camelCase token boundaries (closes [#1246](https://github.com/BluMintInc/eslint-custom-rules/issues/1246)) ([7dcff09](https://github.com/BluMintInc/eslint-custom-rules/commit/7dcff09f1b6b3995a2c72c085c30efd30b1e9f0e))

## [1.16.1](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.16.0...v1.16.1) (2026-06-30)


### Bug Fixes

* **enforce-assert-safe-object-key:** treat assertSafe-cached variables as validated (closes [#1245](https://github.com/BluMintInc/eslint-custom-rules/issues/1245)) ([1b94c7c](https://github.com/BluMintInc/eslint-custom-rules/commit/1b94c7cfa5b9e488f49b11d6caf999e885adaaf9))
* **enforce-dynamic-imports:** restore libraries whitelist mode and exempt builtins/internal paths (closes [#1244](https://github.com/BluMintInc/eslint-custom-rules/issues/1244)) ([dcc22a5](https://github.com/BluMintInc/eslint-custom-rules/commit/dcc22a570252c81cc2ba25f0955a8ecc350be7c5))
* **require-memo:** exempt camelCase render-prop callbacks (closes [#1243](https://github.com/BluMintInc/eslint-custom-rules/issues/1243)) ([46f05fa](https://github.com/BluMintInc/eslint-custom-rules/commit/46f05fa3636a3bb15ab44265ba65956dcd6552d3))

# [1.16.0](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.15.0...v1.16.0) (2026-06-29)


### Bug Fixes

* address PR review comments for no-circular-references rule ([a91de29](https://github.com/BluMintInc/eslint-custom-rules/commit/a91de29b0151ebec8aeed2f3b1a429ddb33e6c52))
* address PR review comments for no-circular-references rule ([431fee8](https://github.com/BluMintInc/eslint-custom-rules/commit/431fee800cd8ecac86b586cce1e62720568a8ed5))
* address PR review comments for no-circular-references rule ([ce2dc38](https://github.com/BluMintInc/eslint-custom-rules/commit/ce2dc38c919d7b8eba4210e29dd2b75d583e5318))
* address PR review comments for react-memoize-literals rule ([7a36138](https://github.com/BluMintInc/eslint-custom-rules/commit/7a36138adf6f87a2120ca991a418f44e3855b3c7))
* address PR review comments for require-migration-script-metadata rule ([a611879](https://github.com/BluMintInc/eslint-custom-rules/commit/a611879ab29ff2342f1129fe70a5d0e967825064))
* address PR review comments for require-migration-script-metadata rule ([edde444](https://github.com/BluMintInc/eslint-custom-rules/commit/edde444a4d40b3c63d391526b7384077a36e0974))
* address PR review comments for warn-https-error-message-user-friendly rule ([8f86661](https://github.com/BluMintInc/eslint-custom-rules/commit/8f86661bbf5f245305cb3b0cdb8d52fd13a25b17))
* address review comments for boolean naming rule ([31185ab](https://github.com/BluMintInc/eslint-custom-rules/commit/31185ab8222b02ccbe870e51f94912c4fd89b646))
* address review comments for no-circular-references rule ([2adbeb5](https://github.com/BluMintInc/eslint-custom-rules/commit/2adbeb5455a51ab40ed431d53c752a1a61ae0de9))
* address review comments for warn-https-error-message-user-friendly rule ([f59422a](https://github.com/BluMintInc/eslint-custom-rules/commit/f59422a0a6ca237563f3c6e4005e003f957994ac))
* **consistent-callback-naming:** skip union props with non-function members (closes [#1182](https://github.com/BluMintInc/eslint-custom-rules/issues/1182)) ([12ac63c](https://github.com/BluMintInc/eslint-custom-rules/commit/12ac63cfe7e1cabc9693bddff418bb1872a75579))
* correct indentation in no-entire-object-hook-deps rule ([1cdd488](https://github.com/BluMintInc/eslint-custom-rules/commit/1cdd48822a023024d6abf60480e2dbf1a545bd4e))
* correctly identify usages in object literal properties and handle intermediate member expressions in no-entire-object-hook-deps rule ([ca6b627](https://github.com/BluMintInc/eslint-custom-rules/commit/ca6b627a7ed50791aae76487f8fd22a42fc2d632))
* **enforce-boolean-naming-prefixes:** make property-signature checks opt-in (closes [#1219](https://github.com/BluMintInc/eslint-custom-rules/issues/1219)) ([5a05af7](https://github.com/BluMintInc/eslint-custom-rules/commit/5a05af7a5fa9198195a6421c20e7c4670fb4eaeb))
* **enforce-mui-rounded-icons:** strip variant suffix in fix and skip brand icons (closes [#1218](https://github.com/BluMintInc/eslint-custom-rules/issues/1218)) ([1f14d07](https://github.com/BluMintInc/eslint-custom-rules/commit/1f14d0741e900ae92af2ac06057024e592924b61))
* **enforce-verb-noun-naming:** add 'bucket'/'bucketize' to verbs allowlist (closes [#1225](https://github.com/BluMintInc/eslint-custom-rules/issues/1225)) ([ea4ee83](https://github.com/BluMintInc/eslint-custom-rules/commit/ea4ee839173b85be3a68ed13761ab2d57c8a8c19))
* **enforce-verb-noun-naming:** allow `main` as a function name (closes [#1177](https://github.com/BluMintInc/eslint-custom-rules/issues/1177)) ([3cf5f5c](https://github.com/BluMintInc/eslint-custom-rules/commit/3cf5f5cbb7349f7e620a8e16e9ca5c2d347a1775))
* expand collectReferencedTypeNames to cover more AST nodes ([3726e19](https://github.com/BluMintInc/eslint-custom-rules/commit/3726e1915ba02a5c0a6b285aeb03a0717df770f5))
* **global-const-style:** stop flagging null and boolean literals for `as const` (closes [#1186](https://github.com/BluMintInc/eslint-custom-rules/issues/1186)) ([35e1ea8](https://github.com/BluMintInc/eslint-custom-rules/commit/35e1ea843596595b6631fe36cfda2e2d13b1d1bb))
* handle TS assertions and computed literal keys in warn-https-error-message-user-friendly rule ([e4c3ae8](https://github.com/BluMintInc/eslint-custom-rules/commit/e4c3ae85ba20973a5b1498d1d9146665bccb8792))
* ignore function dependencies in prefer-use-deep-compare-memo rule ([d49c178](https://github.com/BluMintInc/eslint-custom-rules/commit/d49c178f9dcfbcc4f11232dc87f0760255f202d9))
* improve handling of mutually recursive functions in warn-https-error-message-user-friendly rule ([994c544](https://github.com/BluMintInc/eslint-custom-rules/commit/994c544403c69498d6be939355ef292cb7cedfc0))
* **logical-top-to-bottom-grouping:** keep sibling destructures from the same source declarator grouped (closes [#1191](https://github.com/BluMintInc/eslint-custom-rules/issues/1191)) ([02b99fb](https://github.com/BluMintInc/eslint-custom-rules/commit/02b99fbcb9296f898e9b3f253f225d964dffef07))
* **memo-compare-deeply-complex-props:** exclude React render types from complex-prop detection ([4add989](https://github.com/BluMintInc/eslint-custom-rules/commit/4add989ea2fbcfa4b1c11f869fb02e10cc545378)), closes [#1179](https://github.com/BluMintInc/eslint-custom-rules/issues/1179) [#1179](https://github.com/BluMintInc/eslint-custom-rules/issues/1179)
* **memo-compare-deeply-complex-props:** skip reserved React ref/key slots (closes [#1224](https://github.com/BluMintInc/eslint-custom-rules/issues/1224)) ([e565627](https://github.com/BluMintInc/eslint-custom-rules/commit/e5656274c5c8d69d531c9ee9baca96dda7962c0c))
* **memo-nested-react-components:** skip HOC factories and render-prop callbacks (closes [#1185](https://github.com/BluMintInc/eslint-custom-rules/issues/1185)) ([1a5f0cc](https://github.com/BluMintInc/eslint-custom-rules/commit/1a5f0cc5e4be46df45f7ef8b9242b9a2d7cf945a))
* **no-array-length-in-deps:** allow array.length in deps when the body uses only .length (closes [#1196](https://github.com/BluMintInc/eslint-custom-rules/issues/1196)) ([48a021a](https://github.com/BluMintInc/eslint-custom-rules/commit/48a021a56a739a951fc6c70f1a6c3e8016527218))
* **no-circular-references:** fix false positive for function parameters ([37f67e6](https://github.com/BluMintInc/eslint-custom-rules/commit/37f67e6a1076e8d54742df83ae99ea583f9d3eed))
* **no-circular-references:** fix recursive member resolution and use cross-version scope helper ([48d8099](https://github.com/BluMintInc/eslint-custom-rules/commit/48d80991dcd1b988e8a903d7ed20ca1ac8e1d84f))
* **no-compositing-layer-props:** don't flag CSS reset/identity values (closes [#1228](https://github.com/BluMintInc/eslint-custom-rules/issues/1228)) ([1073aed](https://github.com/BluMintInc/eslint-custom-rules/commit/1073aedd0f166e0f83ada1ad1e46d1b058af7126))
* **no-entire-object-hook-deps:** correctly handle TS assertions and optional chaining in parent traversal ([2828295](https://github.com/BluMintInc/eslint-custom-rules/commit/2828295e23e8a238d24a112bec657a301522b077))
* **no-entire-object-hook-deps:** lock in shorthand/JSX usage detection for as-const memo returns (closes [#1176](https://github.com/BluMintInc/eslint-custom-rules/issues/1176)) ([5173427](https://github.com/BluMintInc/eslint-custom-rules/commit/5173427b6452bd6450e0b67cc24e8fee60c90fc2))
* **no-entire-object-hook-deps:** resolve PR review comments on TS assertion handling in object literals ([914f4ea](https://github.com/BluMintInc/eslint-custom-rules/commit/914f4ea3ad906f68238ce215a3f70c39a6d20989))
* **no-explicit-return-type:** exempt explicit `never` return types (closes [#1216](https://github.com/BluMintInc/eslint-custom-rules/issues/1216)) ([cef283a](https://github.com/BluMintInc/eslint-custom-rules/commit/cef283a6e0536a8eb9d4d73fc3114befeead7f01))
* **no-hungarian:** exempt generic type parameters and semantic type-concept names (closes [#1217](https://github.com/BluMintInc/eslint-custom-rules/issues/1217)) ([d127364](https://github.com/BluMintInc/eslint-custom-rules/commit/d127364e01731a44cde6df970fed9b7bdab927c4))
* **no-margin-properties:** don't flag margins inside createTheme() overrides (closes [#1214](https://github.com/BluMintInc/eslint-custom-rules/issues/1214)) ([a00828d](https://github.com/BluMintInc/eslint-custom-rules/commit/a00828dc6593798759f90599ffec941c7b138dab))
* **no-unnecessary-verb-suffix:** exempt phrasal-verb particle endings (closes [#1227](https://github.com/BluMintInc/eslint-custom-rules/issues/1227)) ([6a9c594](https://github.com/BluMintInc/eslint-custom-rules/commit/6a9c594e939e56709b08e362580785fb4b495d11))
* **no-unused-props:** track props through generic wrappers and body destructuring (closes [#1215](https://github.com/BluMintInc/eslint-custom-rules/issues/1215)) ([0f84151](https://github.com/BluMintInc/eslint-custom-rules/commit/0f84151e4f807ed29adc6848ad39c64cd9f1743a))
* **no-useless-fragment:** keep fragments wrapping a single expression container (closes [#1195](https://github.com/BluMintInc/eslint-custom-rules/issues/1195)) ([e6480e0](https://github.com/BluMintInc/eslint-custom-rules/commit/e6480e0e7e53d6f0cc4c47fe691bd47efb0f3689))
* optimize isIgnored logic and fix isExternal regex in enforce-dynamic-imports rule ([ee8a538](https://github.com/BluMintInc/eslint-custom-rules/commit/ee8a5382cb8567fdde3059428147c900b8c9f06f))
* prevent false positives for primitive values in no-circular-references ([7e88cc3](https://github.com/BluMintInc/eslint-custom-rules/commit/7e88cc3ffee267ee88b46767dd18197bbd167dc5))
* **react-memoize-literals:** exempt inline sx/style JSX attribute literals (closes [#1169](https://github.com/BluMintInc/eslint-custom-rules/issues/1169)) ([e7dbb57](https://github.com/BluMintInc/eslint-custom-rules/commit/e7dbb579b6b6997e5068fd7c9bab025ad7e19e91))
* **react-memoize-literals:** extend sx/style exemption to conditional, logical, and array values (refs [#1169](https://github.com/BluMintInc/eslint-custom-rules/issues/1169)) ([445e3b5](https://github.com/BluMintInc/eslint-custom-rules/commit/445e3b54a5d52bd41e8e61a35de63cb81ffe0247))
* **require-migration-script-metadata:** address review comments on JSDoc tag parsing and validation ([7890c38](https://github.com/BluMintInc/eslint-custom-rules/commit/7890c382ff09b263f0b2b3fd2e63a8a219901590))
* **require-migration-script-metadata:** fix [@migration](https://github.com/migration)Dependencies logic and update filename access for ESLint v9 compatibility ([88353c2](https://github.com/BluMintInc/eslint-custom-rules/commit/88353c24fd51a9d108ae8ccc1a96369c4ec62695))
* resolve false positive in enforce-boolean-naming-prefixes for variables starting with boolean keywords but not following boundary conventions ([14e35ba](https://github.com/BluMintInc/eslint-custom-rules/commit/14e35bac0cfb50605e7a7514bcee0e2c56d17d10))
* resolve false positives in no-circular-references rule and improve detection ([8829554](https://github.com/BluMintInc/eslint-custom-rules/commit/8829554d26ae4054bda7657598aae34a4b5216d6))
* restore logical AND inference for common boolean patterns to resolve CI failures ([097c78a](https://github.com/BluMintInc/eslint-custom-rules/commit/097c78a19821cd85ba25765cda7d08b0dee4c574))
* skip nested literals in useLatestCallback in react-memoize-literals rule ([b0f5ac4](https://github.com/BluMintInc/eslint-custom-rules/commit/b0f5ac440aef8fc47187cf34568c2b105ac85425))
* skip prefer-type-alias-over-typeof-constant for indexed access types in type aliases ([c1f9ac7](https://github.com/BluMintInc/eslint-custom-rules/commit/c1f9ac7891689907fd50bc03705a0a8b98136263))
* unwrap TS assertions and ChainExpression in member-chain traversal ([6de9f93](https://github.com/BluMintInc/eslint-custom-rules/commit/6de9f93cda4b75cfa268d3fc9b868f641abb5aa0))
* unwrap TSNonNullExpression in no-entire-object-hook-deps ([0edd5cb](https://github.com/BluMintInc/eslint-custom-rules/commit/0edd5cbea46f721439a906a04ae9765b7409ba5a))


### Features

* add Anthropic API key verification to Claude workflows ([b6f2cee](https://github.com/BluMintInc/eslint-custom-rules/commit/b6f2cee7ddd82ed0a3a932abb212144cbd307b93))
* add Load Prompt action to Claude workflows for dynamic prompt handling ([d1869fc](https://github.com/BluMintInc/eslint-custom-rules/commit/d1869fc344e6f8293cbed7d3057730cb796fe253))
* **eslint:** add @blumintinc/blumint/warn-https-error-message-user-friendly rule ([9b94b4b](https://github.com/BluMintInc/eslint-custom-rules/commit/9b94b4b7493ac0823735513487a85f4d123e5f93))
* implement require-migration-script-metadata rule ([5d04cba](https://github.com/BluMintInc/eslint-custom-rules/commit/5d04cbab4f0ac26b6813cad49b5c562faf920846))
* refactor enforce-dynamic-imports to use whitelist pattern with ignoredLibraries ([1b54359](https://github.com/BluMintInc/eslint-custom-rules/commit/1b5435942334e368af3cddf212e2c082bdfc1a92))
* resolve PR review comments for warn-https-error-message-user-friendly rule ([e235490](https://github.com/BluMintInc/eslint-custom-rules/commit/e2354904b9ac04156dcf424ce839f24f579aad74))

# [1.15.0](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.14.0...v1.15.0) (2026-01-20)


### Bug Fixes

* **@blumintinc/blumint/no-redundant-this-params:** allow different instance members for same parameter ([88d194e](https://github.com/BluMintInc/eslint-custom-rules/commit/88d194ee88ae109c1f94802afb2583cf86f6c9dc))
* add parserServices fallback to enforce-date-ttime rule ([ea45ddb](https://github.com/BluMintInc/eslint-custom-rules/commit/ea45ddbcfb8f23e41700350897303e907be6f7c6))
* add Void type flag to isPossiblyNullish check ([87e2db9](https://github.com/BluMintInc/eslint-custom-rules/commit/87e2db9407e9f0baa1e186b8254b30aa8712bdad))
* address PR review comments for `prefer-nullish-coalescing-boolean-props` ([a8bbe60](https://github.com/BluMintInc/eslint-custom-rules/commit/a8bbe6061aedd9cd7a9e43d2a76bc831cab2300b))
* address PR review comments for dynamic-https-errors ([e6d7027](https://github.com/BluMintInc/eslint-custom-rules/commit/e6d7027936266116b7d90bc5c791b2c3b036fe5a))
* allow typeof constant in type alias definitions ([c7d3cbe](https://github.com/BluMintInc/eslint-custom-rules/commit/c7d3cbe886402901cef584faab8e0821ea9cf64a))
* **dynamic-https-errors:** handle spread elements and edge cases in HttpsError calls ([8e87a35](https://github.com/BluMintInc/eslint-custom-rules/commit/8e87a35aff9e5ce164ccf5c24e85100c1cb1eb52))
* **dynamic-https-errors:** handle string literal keys and computed properties in object-based constructor ([fb0250d](https://github.com/BluMintInc/eslint-custom-rules/commit/fb0250d774ac6c139e7a249f1d4bdbbec6dacee8))
* **dynamic-https-errors:** handle TypeScript assertions in staticness check ([8eab5ef](https://github.com/BluMintInc/eslint-custom-rules/commit/8eab5efb5a77c9f6f07a63b362d94a1596858d25))
* **dynamic-https-errors:** replace type assertion with explicit isExpression type guard ([05a18af](https://github.com/BluMintInc/eslint-custom-rules/commit/05a18afaab898ffc12800963d1efc9d3d4c4b31a))
* **dynamic-https-errors:** support object-based constructor signature ([755641f](https://github.com/BluMintInc/eslint-custom-rules/commit/755641f1e503488418426bcaaa84964ad5c2bd4c))
* **enforce-memoize-async:** enhance alias handling for decorator selection ([ee6a9f8](https://github.com/BluMintInc/eslint-custom-rules/commit/ee6a9f870b3a360bee2e524134a5226b158f2ac8))
* **enforce-memoize-async:** enhance namespace handling for multiple imports ([b3a1a6e](https://github.com/BluMintInc/eslint-custom-rules/commit/b3a1a6e4d3a7d9b4f41412f497db2fa5e37133ab))
* **enforce-memoize-async:** improve decorator detection and simplify code ([6ae6579](https://github.com/BluMintInc/eslint-custom-rules/commit/6ae6579127adc7c8c1167ad55999909d5a03e60b))
* **enforce-memoize-async:** improve decorator detection with multiple imports ([018b874](https://github.com/BluMintInc/eslint-custom-rules/commit/018b874f9b513e9b01824e2cdee365bb874a7548))
* exclude literals used in throw statements from react-memoize-literals ([5a1a9c1](https://github.com/BluMintInc/eslint-custom-rules/commit/5a1a9c1bcac8ad1687d6e9fadc3f07b6bbef7fc5))
* **global-const-style:** ignore MemberExpression on dynamic values ([f938fd3](https://github.com/BluMintInc/eslint-custom-rules/commit/f938fd389e245557e77cc854cf6a254b0977cdad)), closes [#1130](https://github.com/BluMintInc/eslint-custom-rules/issues/1130)
* handle functions in ASTHelpers.declarationIncludesIdentifier ([d4c3edf](https://github.com/BluMintInc/eslint-custom-rules/commit/d4c3edf05c4edabe5f9aaab85123d3bd278810bf))
* handle optional chaining in isDynamicValue for global-const-style ([5eb4f27](https://github.com/BluMintInc/eslint-custom-rules/commit/5eb4f27acda86d922ed434c62089d9135e43ae0e))
* ignore batch manager and coordinator dependencies in parallelize-async-operations ([7fd4f74](https://github.com/BluMintInc/eslint-custom-rules/commit/7fd4f740fea3301244e9249770c3b3ca99fcf072))
* improve boolean context and nullish type checking ([bc30b38](https://github.com/BluMintInc/eslint-custom-rules/commit/bc30b38ef86f8a9f48ac8e1a433cf1fe773eb3fd))
* improve HttpsError validation and error messages ([f68cd1e](https://github.com/BluMintInc/eslint-custom-rules/commit/f68cd1e232346234f9c01bf7bc00fdc2732c8de1))
* improve TypeParameter handling in isPossiblyNullish ([d9fcfa5](https://github.com/BluMintInc/eslint-custom-rules/commit/d9fcfa5718ba38243ebc1c8c534650bf143bb933))
* include member properties in coordinator detection and update docs ([1040d2b](https://github.com/BluMintInc/eslint-custom-rules/commit/1040d2ba50eedd19160f8df6320669b6dddd1ae3))
* **no-passthrough-getters:** add defensive check for tsNode mapping ([4a3660a](https://github.com/BluMintInc/eslint-custom-rules/commit/4a3660aeaad9ff8012c971e40d2d1a2732f87c12)), closes [no-passthrou#getters](https://github.com/no-passthrou/issues/getters)
* **no-passthrough-getters:** handle anonymous classes and optimize heritage checks ([4740677](https://github.com/BluMintInc/eslint-custom-rules/commit/47406775d52ac20d61d10699032f5a1809e46a7e)), closes [no-passthrou#getters](https://github.com/no-passthrou/issues/getters)
* prevent duplicate parameter names in enforce-props-argument-name rule ([1129669](https://github.com/BluMintInc/eslint-custom-rules/commit/1129669271c10af3e59a5a644990fbc32f4bcb64))
* prevent no-passthrough-getters from flagging interface implementations ([29b85ff](https://github.com/BluMintInc/eslint-custom-rules/commit/29b85ff24b655b6306bd9a68f34eff17febd7dcf)), closes [no-passthrou#getters](https://github.com/no-passthrou/issues/getters) [no-passthrou#getters](https://github.com/no-passthrou/issues/getters) [BluMintInc/eslint-custom-rules#1132](https://github.com/BluMintInc/eslint-custom-rules/issues/1132)
* restrict isRenderFunction to React-specific types and add tests ([6503d34](https://github.com/BluMintInc/eslint-custom-rules/commit/6503d34b426895e00e848565f5dba762ba3a6e13))
* **rules:** exempt render functions from consistent-callback-naming ([b2e3aab](https://github.com/BluMintInc/eslint-custom-rules/commit/b2e3aab01c37c4ea8e333e0abdba6b2e370bce44))
* update enforce-memoize-async package name to @blumintinc/typescript-memoize ([25614a6](https://github.com/BluMintInc/eslint-custom-rules/commit/25614a6e28afd9810f6903b4def25386090a8638))
* update enforce-memoize-async to use @blumintinc/typescript-memoize ([5c5a3dd](https://github.com/BluMintInc/eslint-custom-rules/commit/5c5a3dd849bc5b1b4d134aa0c0a40e3c5487b6ca)), closes [#1128](https://github.com/BluMintInc/eslint-custom-rules/issues/1128)


### Features

* Add coverage threshold and improve memoization tests ([13c6c06](https://github.com/BluMintInc/eslint-custom-rules/commit/13c6c06058e0f81493ebfdd5facfa500d4244385))
* Add enforce-f-extension-for-entry-points rule ([61abebb](https://github.com/BluMintInc/eslint-custom-rules/commit/61abebbcaac58fdef153e588667d0979c7a15bc8))
* Add type checking to prefer-nullish-coalescing-boolean-props ([3fbb4d3](https://github.com/BluMintInc/eslint-custom-rules/commit/3fbb4d3441afe28f664f4f73c81c83ff4d922c05))
* Allow HttpsError cause via settings object ([eff0068](https://github.com/BluMintInc/eslint-custom-rules/commit/eff0068f24b4b504069b7cd2b9acd98489d56c27))
* Allow memoizing literals in conditional/logical expressions ([cdf1ce3](https://github.com/BluMintInc/eslint-custom-rules/commit/cdf1ce3078370176f0028455f7bede1fc0a4d752))
* Allow memoizing literals in deep-compared JSX attributes ([8785bb8](https://github.com/BluMintInc/eslint-custom-rules/commit/8785bb81b3e961918c09eee12f0205a0566a0ef3))
* enhance enforce-date-ttime rule based on PR review ([ed4ec60](https://github.com/BluMintInc/eslint-custom-rules/commit/ed4ec60766969ba7b8bf31ca355f9369b0a5d993))
* **eslint:** add enforce-date-ttime rule ([5e4e059](https://github.com/BluMintInc/eslint-custom-rules/commit/5e4e059232028bf495fdf7910f0dd43f60ff66bb))
* Improve AST helper and verb-noun rule ([6ed0e25](https://github.com/BluMintInc/eslint-custom-rules/commit/6ed0e2500d3144dd123fb78943790023c2531d57))
* Improve memo-compare-deeply-complex-props and prevent-children-clobber ([b9c14ca](https://github.com/BluMintInc/eslint-custom-rules/commit/b9c14ca03748a796ea0065efce48bf566d0b03f2))
* Skip memoizing literals that are thrown ([33a7992](https://github.com/BluMintInc/eslint-custom-rules/commit/33a799222dcfbef02ee09d2808cd6a62302aede3))
* Support JSX in VariableDeclarations and Declarators ([de5a127](https://github.com/BluMintInc/eslint-custom-rules/commit/de5a1275b1e39e02b3b8eb7d5aedad52ca64b497))
* Support more stable hooks and async functions ([80a176b](https://github.com/BluMintInc/eslint-custom-rules/commit/80a176ba650ba289311fe578bafaf0249d58c05d))
* Support namespace imports for entry points ([e03e1f3](https://github.com/BluMintInc/eslint-custom-rules/commit/e03e1f36e92187248c58f2da88e01ba82f0e846b))

# [1.14.0](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.13.0...v1.14.0) (2026-01-06)


### Bug Fixes

* address bot review feedback for no-console-error ([95eea34](https://github.com/BluMintInc/eslint-custom-rules/commit/95eea3497e758f72de7190c4c1ffcde5501592e4))
* address bot review feedback for no-console-error ([3af2220](https://github.com/BluMintInc/eslint-custom-rules/commit/3af2220092433eb4ab6609d6e7589aa481e5195d))
* allow dispute naming as domain exception ([0b0200a](https://github.com/BluMintInc/eslint-custom-rules/commit/0b0200a23b59be927bcd4100f5561374845be49c))
* avoid false local type matches in TSQualifiedName ([6d77799](https://github.com/BluMintInc/eslint-custom-rules/commit/6d7779955bf0c4ac8c3921b9df11f54f1b85366a))
* clarify prefer-clone-deep messaging ([09e799a](https://github.com/BluMintInc/eslint-custom-rules/commit/09e799ad756497c964143db30a5e70d104e50c7f))
* Correct parameter name usage in error reporting for no-undefined-null-passthrough rule ([0868f8d](https://github.com/BluMintInc/eslint-custom-rules/commit/0868f8d53640d0e0714204de1de2b4b6172d5947))
* correct typo in error message for enforceFirestoreDocRefGeneric rule ([60ab9ac](https://github.com/BluMintInc/eslint-custom-rules/commit/60ab9ac911435e06d73e7ca10efdbdce0c08121a))
* Enhance error message clarity in no-undefined-null-passthrough rule ([0d98834](https://github.com/BluMintInc/eslint-custom-rules/commit/0d988342484d12e099b4b166d46ed85b550c1e0c))
* enhance no-console-error rule to handle console variable references ([ee9cc2c](https://github.com/BluMintInc/eslint-custom-rules/commit/ee9cc2c3b945dddc97ea6ed89f4602af0e0a3d39))
* Exclude method definitions from explicit return type enforcement ([6a649bd](https://github.com/BluMintInc/eslint-custom-rules/commit/6a649bd801b9eb882a033ab5a1de4ed2a9c41384))
* exempt 'unknown' parameters from no-undefined-null-passthrough ([79614ef](https://github.com/BluMintInc/eslint-custom-rules/commit/79614effa268ac6c0ee26aecc4603b3b4e4c2585))
* improve no-restricted-properties-fix messaging ([cdbb038](https://github.com/BluMintInc/eslint-custom-rules/commit/cdbb038897d43ba5cbfd76bc6ce9a527d8a863b8))
* limit frontend import restriction to backend functions ([e1a3f4c](https://github.com/BluMintInc/eslint-custom-rules/commit/e1a3f4c87c03db7440318a4e8b596b17f2ae4903))
* narrow no-console-error useAlertDialog open detection ([ba72f1a](https://github.com/BluMintInc/eslint-custom-rules/commit/ba72f1af101342da1711c33d6bed26d70362385f))
* prefer context.sourceCode when available ([a32ba99](https://github.com/BluMintInc/eslint-custom-rules/commit/a32ba992e81a9a6a1bbf339b1733e6bca9493bd5))
* prevent extract-global-constants crash on missing declarators ([0e63aea](https://github.com/BluMintInc/eslint-custom-rules/commit/0e63aea0ebf8e9e186188eb02f1f1acbe89d077e))
* reconcile no-console-error with enforce-console-error ([b3cb5e9](https://github.com/BluMintInc/eslint-custom-rules/commit/b3cb5e98c928e8e486ee4d68d463938fdf96a0d2))
* refine enforce-console-error lint messaging ([6824ca2](https://github.com/BluMintInc/eslint-custom-rules/commit/6824ca2485c46b71e075d9a0348fb04366521a4c))
* Remove unnecessary line from track-prompt.sh script ([d21e48d](https://github.com/BluMintInc/eslint-custom-rules/commit/d21e48d2676e39a6d638569397690265dd675496))
* tighten no-console-error useAlertDialog open matching ([fbe4bfd](https://github.com/BluMintInc/eslint-custom-rules/commit/fbe4bfd448a5e19648837ee3684764cb7076fe8e))
* traverse wrapped firestore types for identifiable check ([0ac894b](https://github.com/BluMintInc/eslint-custom-rules/commit/0ac894b59d039975135926459e51dd2f742fd05e))
* Update GitHub CLI command for comment retrieval in fetchPrMetadata ([dea8c97](https://github.com/BluMintInc/eslint-custom-rules/commit/dea8c971d9ec297953fdfa40985a35f15c1096f2))
* Update GitHub CLI command in fetchPrMetadata test for improved comment retrieval ([932e6f4](https://github.com/BluMintInc/eslint-custom-rules/commit/932e6f45f3aa1d2f04cb1c0d8e7ae5283ff62666))
* Update JSON payload handling in cursor-bot PR review agent workflow ([b1d09e8](https://github.com/BluMintInc/eslint-custom-rules/commit/b1d09e8e32080fb487e96835ab4a898cd73db2eb))


### Features

* Add branch name normalization utility for merge conflict handling ([fa46148](https://github.com/BluMintInc/eslint-custom-rules/commit/fa461485c83f5504caf937ec683f421bc24abdfb))
* Add dependency placeholder to memoize suggestions ([eef912b](https://github.com/BluMintInc/eslint-custom-rules/commit/eef912bd5a26d610ab32f4d80d0fdfcc9e7829e0))
* Add enforce-early-destructuring rule ([ee4478c](https://github.com/BluMintInc/eslint-custom-rules/commit/ee4478cd36dae7ce20272d31c5d49545dfcc9406))
* Add enforce-storage-context lint rule ([6d2da21](https://github.com/BluMintInc/eslint-custom-rules/commit/6d2da2154fdd56d983297330a070231315df870a))
* Add enforce-transform-memoization rule ([ae6e98b](https://github.com/BluMintInc/eslint-custom-rules/commit/ae6e98be96360fe735079ac084ee8c36c4e4a12f))
* Add enforce-unique-cursor-headers rule ([9f64a2b](https://github.com/BluMintInc/eslint-custom-rules/commit/9f64a2b3f1822eef4f75b64a0fee5790665c781f))
* Add excludedAtDirectives to enforce-unique-cursor-headers rule ([b2d7ee5](https://github.com/BluMintInc/eslint-custom-rules/commit/b2d7ee507d57718b8a780fac43b644dcd9c401a9))
* Add flatten-push-calls ESLint rule ([6e7d3da](https://github.com/BluMintInc/eslint-custom-rules/commit/6e7d3da26bb2efa711178f9d3a5b8336254ef737))
* Add flatten-push-calls ESLint rule ([d97d69e](https://github.com/BluMintInc/eslint-custom-rules/commit/d97d69e906d65eae3d1988447a1cbbd7d11bb5c7))
* Add initial core functionality ([6989331](https://github.com/BluMintInc/eslint-custom-rules/commit/69893313f350d107ba34cc1e37b4d86899eb6ff7))
* Add initial core functionality ([6844e61](https://github.com/BluMintInc/eslint-custom-rules/commit/6844e61bca72ed4770eaa5d273e9ad732f66ebb9))
* Add initial core functionality ([1c1e43b](https://github.com/BluMintInc/eslint-custom-rules/commit/1c1e43b20dcc07a40525d950b90ce09f3a040e46))
* Add initial core functionality ([8156147](https://github.com/BluMintInc/eslint-custom-rules/commit/81561477e3cc1e2907a7b909292b96140caa7949))
* Add initial core functionality ([e52d8e2](https://github.com/BluMintInc/eslint-custom-rules/commit/e52d8e2a41870e2bfb588eecd6f10ed51e8ec3c4))
* Add initial core functionality ([67b341e](https://github.com/BluMintInc/eslint-custom-rules/commit/67b341edefc416ea438e147a048b583bc440fd1b))
* Add initial core functionality ([49ee2b5](https://github.com/BluMintInc/eslint-custom-rules/commit/49ee2b5f92ddaf8f09d3260f715c84369a5832a7))
* Add initial core functionality ([4dddf19](https://github.com/BluMintInc/eslint-custom-rules/commit/4dddf19debb59473d62c50007fcc4ac69cd2c7f5))
* Add initial core functionality ([9b149ac](https://github.com/BluMintInc/eslint-custom-rules/commit/9b149ac46d3f5b86c9b743bac7be6816dd0a0d00))
* Add initial core functionality ([d053c25](https://github.com/BluMintInc/eslint-custom-rules/commit/d053c25d0b8931fb39235199f7373c1b76332500))
* Add initial core functionality ([65fbaa6](https://github.com/BluMintInc/eslint-custom-rules/commit/65fbaa642dad9f85dca7312ebefdd8f93f314ea4))
* Add initial core functionality ([93ebb5d](https://github.com/BluMintInc/eslint-custom-rules/commit/93ebb5d3a9aa6bb3195fbe7122365ab0c8f3ce80))
* Add initial core functionality ([5d74dc4](https://github.com/BluMintInc/eslint-custom-rules/commit/5d74dc42731b0fcee38a1d0d8d20041156bcbad6))
* Add initial core functionality ([25716f0](https://github.com/BluMintInc/eslint-custom-rules/commit/25716f01cd64eb7a963f394b6e5b1a0726128aa4))
* Add initial core functionality ([8a32034](https://github.com/BluMintInc/eslint-custom-rules/commit/8a32034dde4d64aa66f75123bd7504658e55e79e))
* Add initial core functionality ([a6d5c41](https://github.com/BluMintInc/eslint-custom-rules/commit/a6d5c4166f8ae18339d763ead71107dcac4614ae))
* Add initial core functionality ([b67f44d](https://github.com/BluMintInc/eslint-custom-rules/commit/b67f44dedd0154098c341d64fdf8132f2a85ebb9))
* Add initial core functionality ([b85cdab](https://github.com/BluMintInc/eslint-custom-rules/commit/b85cdab58ac368f2f61440a606e14176450c5a93))
* Add initial core functionality ([e9b94d6](https://github.com/BluMintInc/eslint-custom-rules/commit/e9b94d6820388bd96d5fb2925f6640de2a104b84))
* Add initial core functionality ([46e52ae](https://github.com/BluMintInc/eslint-custom-rules/commit/46e52aeca91d26333ed32471a4aadb39b732ae67))
* Add initial core functionality ([3f2828d](https://github.com/BluMintInc/eslint-custom-rules/commit/3f2828d6f9216b558746b7eefd46a2a00246ea36))
* Add initial core functionality ([71c2c51](https://github.com/BluMintInc/eslint-custom-rules/commit/71c2c51033788ff099ecb50d00604f763f05a267))
* Add initial core functionality ([169368d](https://github.com/BluMintInc/eslint-custom-rules/commit/169368d21f08b8e65a3aaa3a902ef67ca0f4eb29))
* Add initial core functionality ([31fe1bd](https://github.com/BluMintInc/eslint-custom-rules/commit/31fe1bd01dcd4e70970de43dd19719b21ad1c5da))
* Add initial project structure ([0eddedb](https://github.com/BluMintInc/eslint-custom-rules/commit/0eddedb33cb03d0ff9e1f28125f51119e5b9904e))
* Add invalid regex error and improve variable tracking ([b6e5285](https://github.com/BluMintInc/eslint-custom-rules/commit/b6e5285d39949d0d1a8a5aa55780f4a786b9d612))
* Add jsdoc-above-field lint rule ([ed36d84](https://github.com/BluMintInc/eslint-custom-rules/commit/ed36d849d1c0db24bd8d5a1e2a35b71bdf4a98fa))
* Add logical top-to-bottom grouping rule ([2b58e61](https://github.com/BluMintInc/eslint-custom-rules/commit/2b58e613206172c92ee8d796f8ca98674f6af12a))
* Add memo-compare-deeply-complex-props rule ([a1092e7](https://github.com/BluMintInc/eslint-custom-rules/commit/a1092e7b9e7cd0fd0fbdbd3800102186be770f3f))
* add memo-nested component rule ([3066715](https://github.com/BluMintInc/eslint-custom-rules/commit/3066715c641ae1ac4f3a24384252475f5adf3a0e))
* Add no-console-error lint rule ([b4cba4a](https://github.com/BluMintInc/eslint-custom-rules/commit/b4cba4abc1fd5bb18441f71b0e380589261ded71))
* Add no-empty-dependency-use-callbacks rule ([dca89e0](https://github.com/BluMintInc/eslint-custom-rules/commit/dca89e0283e2504056a7f79718fa7c6426cc07ce))
* Add no-handler-suffix lint rule ([1d4210a](https://github.com/BluMintInc/eslint-custom-rules/commit/1d4210ab0dc30cf29053a3331ed5364cae8320c9))
* Add no-redundant-this-params rule ([b511a05](https://github.com/BluMintInc/eslint-custom-rules/commit/b511a054bc29ec9754d02a35c02e7b00cfecca71))
* Add no-res-error-status-in-onrequest lint rule ([419009e](https://github.com/BluMintInc/eslint-custom-rules/commit/419009ed57e7dd3e904e8d5af28260110da38135))
* Add no-unmemoized-memo-without-props rule ([56384af](https://github.com/BluMintInc/eslint-custom-rules/commit/56384af812a8b819101950322f05def9e4fb95d9))
* add no-unnecessary-destructuring-rename rule ([bcdcefb](https://github.com/BluMintInc/eslint-custom-rules/commit/bcdcefb6ddba236590e128cbad219f9b0297290b))
* Add no-useless-usememo-primitives ESLint rule ([bee69ff](https://github.com/BluMintInc/eslint-custom-rules/commit/bee69fff5a5be1b91691d986cebb1081fef257a8))
* Add no-usememo-for-pass-by-value rule ([b29b2e3](https://github.com/BluMintInc/eslint-custom-rules/commit/b29b2e33c925e70a9d0842c6bd2615d837405c8a))
* Add no-usememo-for-pass-by-value rule ([56e1e14](https://github.com/BluMintInc/eslint-custom-rules/commit/56e1e148d853f8b842ce119e5ff7172384364ebf))
* Add prefer-docsetter-setall lint rule ([ef6eb79](https://github.com/BluMintInc/eslint-custom-rules/commit/ef6eb79f9a479afa7942031fea7b3b0546b55f90))
* Add prefer-getter-over-parameterless-method rule ([0261b37](https://github.com/BluMintInc/eslint-custom-rules/commit/0261b377332cf4c2985076e6906153da36ecfe68))
* add prefer-memoized-props rule ([154083d](https://github.com/BluMintInc/eslint-custom-rules/commit/154083d4ced5236bf13f61195c1672f701efa283))
* Add prevent-children-clobber lint rule ([42a320c](https://github.com/BluMintInc/eslint-custom-rules/commit/42a320c7ac5c3563bc8f96e911193adbc191e0b5))
* Add react-memoize-literals rule ([09050df](https://github.com/BluMintInc/eslint-custom-rules/commit/09050df50840bded11aaf2f65faca1878a7ac7c1))
* Add require-memoize-jsx-returners rule ([89834f0](https://github.com/BluMintInc/eslint-custom-rules/commit/89834f03a8cce026cfc4f9795442e5f2fd48a04b))
* add rule for redundant annotation assertions ([1072cfe](https://github.com/BluMintInc/eslint-custom-rules/commit/1072cfeda565857298434c3ffbb0851bfb190bbe))
* Add rule to disallow curly braces around commented properties ([b2cb73e](https://github.com/BluMintInc/eslint-custom-rules/commit/b2cb73ea78e1e0258ab9298bc3c8c76bc04948d3))
* Add rule to enforce empty object checks ([3c5c5ca](https://github.com/BluMintInc/eslint-custom-rules/commit/3c5c5cad5a3a2af0145fae1b2970152d65e32421))
* Add support for generic types and type annotations ([8117c9e](https://github.com/BluMintInc/eslint-custom-rules/commit/8117c9e8efb39bb039a4d19b4615f0a6129c60af))
* Add useLayoutEffect to enforce-early-destructuring rule ([11f03a3](https://github.com/BluMintInc/eslint-custom-rules/commit/11f03a33bdd10dadd67dff2335f5d78bfc89fdff))
* Add vertically-group-related-functions ESLint rule ([104f8f7](https://github.com/BluMintInc/eslint-custom-rules/commit/104f8f7416e86a35d07834c2d5cb7427e310596d))
* Allow callbacks using component-scoped types ([bbbf013](https://github.com/BluMintInc/eslint-custom-rules/commit/bbbf013cc0213103c89cb9aac1eb20f79d9dbed6))
* Avoid renaming when original name is shadowed ([5f6f8d1](https://github.com/BluMintInc/eslint-custom-rules/commit/5f6f8d17d3532f8323f01803d5c8589b291fd5b9))
* Cache module scope bindings to improve performance ([48849cb](https://github.com/BluMintInc/eslint-custom-rules/commit/48849cb29c039822895b3c5d65ed9de0d9cbe188))
* Collect type annotations from function bodies ([ad653a2](https://github.com/BluMintInc/eslint-custom-rules/commit/ad653a25295e52a883186a97f5f81f7df9a4a509))
* Detect async functions referenced by name in forEach ([b4083c8](https://github.com/BluMintInc/eslint-custom-rules/commit/b4083c84ac96cd3a7cac450170d492c54e22d645))
* enforce stable hash for spread props deps ([c67b5c0](https://github.com/BluMintInc/eslint-custom-rules/commit/c67b5c05095934bd3c167010f050f8511cfd33a6))
* enforce unique cursor headers ([4960ac1](https://github.com/BluMintInc/eslint-custom-rules/commit/4960ac14cfb1766992b7b6121d14670f9343b431))
* Enhance cursor-bot PR review workflow with commit status tracking ([a381380](https://github.com/BluMintInc/eslint-custom-rules/commit/a381380fe4e5a7f04797df5abcf4b62f41ac1e4f))
* Enhance omit-index-html rule to check for '/index.html' in template literals ([d09a012](https://github.com/BluMintInc/eslint-custom-rules/commit/d09a012be98828a5bb759255a4fd4dbc513dad32))
* Handle array and object literals in useMemo analysis ([0b9ac54](https://github.com/BluMintInc/eslint-custom-rules/commit/0b9ac541521933e2e2c900c3c087161c9cae4293))
* Handle hoisted aliases and var declarations ([d87ff87](https://github.com/BluMintInc/eslint-custom-rules/commit/d87ff874098ed5de8fcb5dba6998174c5c02c7fb))
* Handle transformed this values and mixed method shapes ([e7a36fd](https://github.com/BluMintInc/eslint-custom-rules/commit/e7a36fd2c0e86462cc5b26e55c16468e0511b280))
* Ignore docsetter payloads with numeric keys ([c8e31b8](https://github.com/BluMintInc/eslint-custom-rules/commit/c8e31b8cb272256706bc912a910e125ce33531c5))
* Implement initial core functionality ([9f39710](https://github.com/BluMintInc/eslint-custom-rules/commit/9f397103fecae596e1511632216cb43017cce3b9))
* Implement merge conflict resolution workflow ([54bda08](https://github.com/BluMintInc/eslint-custom-rules/commit/54bda084a2a7288ccbf11f7beffe438aebcf6a0f))
* Improve empty object check rule and tests ([d667a3e](https://github.com/BluMintInc/eslint-custom-rules/commit/d667a3ef2d93525a5cdd067e30bda72fb7cfab01))
* Improve function name detection for memoization ([93bdb5d](https://github.com/BluMintInc/eslint-custom-rules/commit/93bdb5d3f008ccbf6be142d76ba1e1f16028dcca))
* Improve inline component prop rule configuration ([4aef7d3](https://github.com/BluMintInc/eslint-custom-rules/commit/4aef7d3d17372c9878eb6328282ad3b72ed6e3d7))
* Improve no-restricted-imports config for frontend/backend boundaries ([f862cd2](https://github.com/BluMintInc/eslint-custom-rules/commit/f862cd2ad47d0c1625b05fb8e1616f9dd2e6c21d))
* Improve no-unused-props and add memoize rule ([a208cec](https://github.com/BluMintInc/eslint-custom-rules/commit/a208cec6adc5a6560f891ffd92902e3b01b67210))
* Improve object emptiness check rule ([16b6cf1](https://github.com/BluMintInc/eslint-custom-rules/commit/16b6cf1200902c0b31c7c61891dbd007356be403))
* Improve template literal handling in omit-index-html ([49e31f3](https://github.com/BluMintInc/eslint-custom-rules/commit/49e31f3d7123adf16b08de03aecb31293f3e78ff))
* Include function captures in dependency collection ([bb4cffe](https://github.com/BluMintInc/eslint-custom-rules/commit/bb4cffe052804d1fa81846c5cee121c03c0dad6e))
* Include tagged template expressions in ignoreCallExpressions ([62e267b](https://github.com/BluMintInc/eslint-custom-rules/commit/62e267ba05e29f1803c06cc086b032146627039b))
* Mark enforceStorageContext rule as not fixable ([ac3109b](https://github.com/BluMintInc/eslint-custom-rules/commit/ac3109b62580acc323468d5675c36e5dd20913b0))
* Skip generator callbacks in no-useless-usememo-primitives ([af1219d](https://github.com/BluMintInc/eslint-custom-rules/commit/af1219dd4d5b052e62b6e8bc667faafe9d512762))
* Skip methods with overload signatures ([f644cc9](https://github.com/BluMintInc/eslint-custom-rules/commit/f644cc903a4f69bb13230972554ea31f0f0964be))
* Skip renaming when original key is not a valid identifier ([f65271f](https://github.com/BluMintInc/eslint-custom-rules/commit/f65271f90106a0f6f54e22e3b761856bdedd8137))
* Support class expressions and add test case ([b3e07f5](https://github.com/BluMintInc/eslint-custom-rules/commit/b3e07f55d7f2fcf6ce3b8d41d90405ef484dc1d5))
* Support classes in no-empty-dependency-use-callbacks ([cf3384c](https://github.com/BluMintInc/eslint-custom-rules/commit/cf3384ce296b3786baac835e701efe39b864e529))
* Support computed transaction keys in fetcher options ([84a56ee](https://github.com/BluMintInc/eslint-custom-rules/commit/84a56ee36fd9c8cfdeb29bffe0013757eb3c0789))
* Support Record utility type and boolean assert in logical AND ([6c1619a](https://github.com/BluMintInc/eslint-custom-rules/commit/6c1619af8780be02737273b8011022aae89587f3))
* Support satisfies expression in memoize-literals rule ([e266a94](https://github.com/BluMintInc/eslint-custom-rules/commit/e266a940ccdd01db352d6f14c9cfe310bfcc256f))
* Support satisfies operator and add tests ([bbe7e05](https://github.com/BluMintInc/eslint-custom-rules/commit/bbe7e05c684de1f5498b0f17b8be3a9b75f54bd2))
* Support satisfies operator and TSAsExpression in handlers ([94b8742](https://github.com/BluMintInc/eslint-custom-rules/commit/94b87429d99754273c59a768294bb3dee86f2b20))
* Support string concatenation in no-useless-usememo-primitives ([74a5721](https://github.com/BluMintInc/eslint-custom-rules/commit/74a57218db9e51368ac8ae903e55d7c88530e413))
* Unwrap TS assertions for prop analysis ([b8f42b9](https://github.com/BluMintInc/eslint-custom-rules/commit/b8f42b91a00ce4507ca4cf709478a313f753564d))
* Validate and improve regex handling in no-handler-suffix ([2ddf6eb](https://github.com/BluMintInc/eslint-custom-rules/commit/2ddf6ebfed4f5e155ac5fc6d97bc532eb17c9156))

# [1.13.0](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.12.6...v1.13.0) (2025-12-11)


### Bug Fixes

* **enforce-positive-naming.ts:** add intersect & intersecting ([dc06ab6](https://github.com/BluMintInc/eslint-custom-rules/commit/dc06ab6718bb7468b2d8d5e917f2c44ff844eeaa))
* enhance check run validation in cursor-bot PR review workflow ([4ac5e48](https://github.com/BluMintInc/eslint-custom-rules/commit/4ac5e487ddea594f492fec29ac6878b686fa2219))
* force update ([d65b8a3](https://github.com/BluMintInc/eslint-custom-rules/commit/d65b8a3165bffccc442555b0f7ecb6a261a79a63))
* handle missing webhook secrets in Cursor agent workflows ([2590265](https://github.com/BluMintInc/eslint-custom-rules/commit/2590265724e4fdfafedeefae986c6da285632bce))
* improve idempotency check for Cursor bot agent launches ([1d246a8](https://github.com/BluMintInc/eslint-custom-rules/commit/1d246a88b76aa5e13beced1365a2b400c574a7c7))
* improve type definitions in prefer-field-paths-in-transforms rule ([e390aff](https://github.com/BluMintInc/eslint-custom-rules/commit/e390aff5b97ad57ff0a1f2cb0a7787fb7a03d0a7))
* **index.ts:** warn should be error ([d38cba2](https://github.com/BluMintInc/eslint-custom-rules/commit/d38cba2f57ab1c243384fc4a71cb65b080d4476f))
* **no-hungarian.ts:** whitelist toArr ([5222c89](https://github.com/BluMintInc/eslint-custom-rules/commit/5222c89dd4b1f43cd5262bd36cf29560649bb2cf))
* **no-unnecessary-verb-suffix.test.ts:** Allow Before & After ([bdb978e](https://github.com/BluMintInc/eslint-custom-rules/commit/bdb978ebe30298f7d58f59bdb203ec8d937da09b))
* **no-unnecessary-verb-suffix.ts:** allow Before and After ([30bae1e](https://github.com/BluMintInc/eslint-custom-rules/commit/30bae1e6c5868eca9dc4ad252ac77284ca6bd923))
* prevent enforce-positive-naming false positive on integer ([6f2a97e](https://github.com/BluMintInc/eslint-custom-rules/commit/6f2a97e0d807991ecb8b1b2ac3d9938c22a667cd))
* refactor agent check logic for improved clarity ([004bc1a](https://github.com/BluMintInc/eslint-custom-rules/commit/004bc1a6d45dedbfc80606b3f439a3767ed8343a))
* refine boolean naming enforcement logic and enhance test coverage ([987aab1](https://github.com/BluMintInc/eslint-custom-rules/commit/987aab1d0ca98ea1c341651b6e5a95b7523d4946))
* refine describeNestedPath function to improve fallback logic for nested paths ([5f0f0f5](https://github.com/BluMintInc/eslint-custom-rules/commit/5f0f0f561b5518d379e545d60673176690736383))
* remove "do not hesitate to ask questions" rule for Cloud Agents ([f1bba66](https://github.com/BluMintInc/eslint-custom-rules/commit/f1bba666ad3b5d62b83c3efd8a95b50a451c3b84))
* restrict no-unused-props to react contexts ([4dd70d6](https://github.com/BluMintInc/eslint-custom-rules/commit/4dd70d687658f677f0c38cfe867a038dae74fb38))
* **src/rules/enforce-boolean-naming-prefixes.ts:** remove erroneous test workaround ([e21c533](https://github.com/BluMintInc/eslint-custom-rules/commit/e21c53393f1dfa1b20a9071376d5249b72e522bd))
* swap error message data in prefer-fragment-component tests ([d099e49](https://github.com/BluMintInc/eslint-custom-rules/commit/d099e49217ee3b690d08b6aa4c3cbe4d9b145ca2))
* trigger bot review agent on CodeRabbit status updates ([d3c4d47](https://github.com/BluMintInc/eslint-custom-rules/commit/d3c4d473432f57c0191eee0d18c41b345e5c54b5))
* update cursor-bot PR review agent to handle neutral check conclusions ([1e6af37](https://github.com/BluMintInc/eslint-custom-rules/commit/1e6af37822fc52434d2ff72e5ffb2f15e3b7d8bf))
* update describeNestedPath function to handle nested object paths correctly ([3631510](https://github.com/BluMintInc/eslint-custom-rules/commit/3631510ec05e7ba22897ddefc307c6d34ba3513f))
* update error message data in prefer-fragment-component tests ([a8aa529](https://github.com/BluMintInc/eslint-custom-rules/commit/a8aa5299ba5973430231fc23cf41ec8d53213a34))
* update GitHub workflow and post-research comment script for cursor-research label ([aa5d229](https://github.com/BluMintInc/eslint-custom-rules/commit/aa5d22996b959fdc7f223c4d5ab2614ba24898c5))
* update labeling conventions in research workflows ([ddc6e06](https://github.com/BluMintInc/eslint-custom-rules/commit/ddc6e06d9aa46933415a054d3df502bba225e1b1))
* update Node dependency installation process in install script ([842b34c](https://github.com/BluMintInc/eslint-custom-rules/commit/842b34c2edf83a486a15441ae9d9dd762d9c1f2b))
* update regex in GitHub workflow for issue linking ([dbe9884](https://github.com/BluMintInc/eslint-custom-rules/commit/dbe98847846b962f368644f8028eab99463ad12b))


### Features

* add code investigation and solution design command documentation ([bdbf7a8](https://github.com/BluMintInc/eslint-custom-rules/commit/bdbf7a8aa4e2f65fdc4787d457d44058bd12dddb))
* Add collectBindingIdentifiers helper function ([fd7e878](https://github.com/BluMintInc/eslint-custom-rules/commit/fd7e878e1ceaebe93023495ee36691b02cf332e0))
* Add enforce-memoize-getters ESLint rule ([b425705](https://github.com/BluMintInc/eslint-custom-rules/commit/b4257056a36a57b7cc29264ee52e9841c7b79b19))
* add GitHub workflow to link PRs to source issues ([9c8b83c](https://github.com/BluMintInc/eslint-custom-rules/commit/9c8b83c3bca85548d27c6aca43caaa236941045c))
* add memoize-root-level-hocs rule ([171943f](https://github.com/BluMintInc/eslint-custom-rules/commit/171943fc69d81e63b02994d6274df720a6024645))
* add merge-review script and update documentation ([6526e84](https://github.com/BluMintInc/eslint-custom-rules/commit/6526e8458201b689313ae03a8ad29e4b423007f6))
* add new ESLint rule for enforcing safe object keys ([13bfcbc](https://github.com/BluMintInc/eslint-custom-rules/commit/13bfcbc6c9e5195ef8ca716538316503961e7e63))
* Add no-inline-component-prop ESLint rule ([6600908](https://github.com/BluMintInc/eslint-custom-rules/commit/6600908a43de96d1ae3588a061c27cbef88bfabd))
* add no-try-catch-already-exists-in-transaction rule ([866a9cb](https://github.com/BluMintInc/eslint-custom-rules/commit/866a9cbd2ae3ac5ac416ece932848751c5e11b92))
* Add no-try-catch-already-exists-in-transaction rule ([0f8b316](https://github.com/BluMintInc/eslint-custom-rules/commit/0f8b31699fd15f706a91a8d6fae17da905c6f855))
* add script for labeling enhancement rule requests ([2232b39](https://github.com/BluMintInc/eslint-custom-rules/commit/2232b39c6f5e8b520b36947935a7db801202b2b1))
* add script to launch agents for improving ESLint rule messaging ([50c5097](https://github.com/BluMintInc/eslint-custom-rules/commit/50c50970c63b25b11134817cf3c84ac8f43d20e9))
* add scripts and configuration for automated PR review comment handling ([6c09aec](https://github.com/BluMintInc/eslint-custom-rules/commit/6c09aec7833cbf81b7adaf2d2b3215f7ba1885f6))
* Add type annotation for Program node in test file rule ([d94feb4](https://github.com/BluMintInc/eslint-custom-rules/commit/d94feb4d78a395a75466ad6bd09b7731a16a2e1b))
* disallow static constants in dynamic files ([ed2c3b0](https://github.com/BluMintInc/eslint-custom-rules/commit/ed2c3b0c12d404a1c7aa29cbe3972d53ba6b678b))
* Enforce boolean naming on getters and add ignoreOverriddenGetters ([410705d](https://github.com/BluMintInc/eslint-custom-rules/commit/410705dcb7a5bb17c6e40c40d57d479c5379b4ce))
* enforce colocated test files ([91e01f8](https://github.com/BluMintInc/eslint-custom-rules/commit/91e01f8842664ef0ba9e9b98d7553f52fd4a9aeb))
* enforce typescript fences in markdown ([6ccecde](https://github.com/BluMintInc/eslint-custom-rules/commit/6ccecde674ffca7c10a0c6123d23d75cca3219eb))
* enhance automated review addressing system with bot review agent ([91c8cae](https://github.com/BluMintInc/eslint-custom-rules/commit/91c8cae0e947aaa0de909c43d727be67aa11e56e))
* enhance enforce-boolean-naming-prefixes rule with improved error messaging and capitalization utility ([b4ef77d](https://github.com/BluMintInc/eslint-custom-rules/commit/b4ef77d5856339b0a17172fd2eca737116e0be19))
* enhance launch-rule-message-doc-agents script with improved lint message handling ([bfe6c4d](https://github.com/BluMintInc/eslint-custom-rules/commit/bfe6c4d7e0037a9267960fa6188ccb066e733249))
* enhance pr-resolve-comments.sh with branch override functionality ([90e3e13](https://github.com/BluMintInc/eslint-custom-rules/commit/90e3e13f4a9fca5f94041ac9055fb9d88b7782db))
* Handle rest spread operator in unused props rule ([09bd37f](https://github.com/BluMintInc/eslint-custom-rules/commit/09bd37f7702d971f6a2e0c3c99ab945c4fedb0da))
* implement automated review addressing system for PRs ([c1ebc9e](https://github.com/BluMintInc/eslint-custom-rules/commit/c1ebc9e4a392739621f1a7d07504815d8a04755f))
* Make no-static-constants-in-dynamic-files rule fixable ([84537b5](https://github.com/BluMintInc/eslint-custom-rules/commit/84537b570eea2c65c1938e8da9f79b2a2aeacd71))


### Reverts

* Revert "Merge pull request [#678](https://github.com/BluMintInc/eslint-custom-rules/issues/678) from BluMintInc/openhands-fix-issue-677" ([4170af6](https://github.com/BluMintInc/eslint-custom-rules/commit/4170af6690aeb67f23f95b1a1d59e2d37ba98d34))

## [1.12.6](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.12.5...v1.12.6) (2025-03-22)


### Reverts

* Revert "chore(release): 1.12.5 [skip ci]" ([539df6b](https://github.com/BluMintInc/eslint-custom-rules/commit/539df6be6d586f3556fa3706f0bc9f7853f4c53d))

## [1.12.4](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.12.3...v1.12.4) (2025-03-20)


### Bug Fixes

* force update ([ece6878](https://github.com/BluMintInc/eslint-custom-rules/commit/ece6878fa391978d7df2aa695dec8cb3dcdc0d35))

## [1.12.3](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.12.2...v1.12.3) (2025-03-20)


### Bug Fixes

* **.cursorrules:** force patch version update ([140507e](https://github.com/BluMintInc/eslint-custom-rules/commit/140507e9fac48a51252c9ca082ae0a8abe86f487))

## [1.12.2](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.12.1...v1.12.2) (2025-03-13)


### Bug Fixes

* **.cursorrules:** force patch version upgrade in semvar release ([d5f9375](https://github.com/BluMintInc/eslint-custom-rules/commit/d5f9375dffb3e15c40b0ad11dbdeb648378836a5))

## [1.12.1](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.12.0...v1.12.1) (2025-03-12)


### Bug Fixes

* force update ([b06cdb0](https://github.com/BluMintInc/eslint-custom-rules/commit/b06cdb041d10cf7fef777b54e2e99d14d249c204))

# [1.12.0](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.11.1...v1.12.0) (2025-03-10)


### Bug Fixes

* **enforce-positive-naming.ts:** add include ([f20f149](https://github.com/BluMintInc/eslint-custom-rules/commit/f20f1499d44e626603d6072c52358206df9ab8cd))
* **src/tests/external-api-bug.ts:** delete Claude3.7 phantom file ([5c7aeac](https://github.com/BluMintInc/eslint-custom-rules/commit/5c7aeac1f579adf41524333f3f71bf96f20bc42f))


### Features

* **enforce-boolean-naming-prefixes:** Improve handling of boolean properties in parameter type annotations ([d6c1bb6](https://github.com/BluMintInc/eslint-custom-rules/commit/d6c1bb62c2f4c943964bc140bd19fdf4116f84af))
* **enforce-positive-naming:** Enhance word splitting and negative prefix detection ([eadc89c](https://github.com/BluMintInc/eslint-custom-rules/commit/eadc89ca6273076ac23ca73e573270d720011bb3))
* **enforce-positive-naming:** Expand exception lists for negative prefixes ([4b150b7](https://github.com/BluMintInc/eslint-custom-rules/commit/4b150b792bfdd61020cce1a338678aba66f30ad1))

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
