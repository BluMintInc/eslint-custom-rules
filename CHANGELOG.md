## [1.20.179](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.178...v1.20.179) (2026-08-26)


### Bug Fixes

* **enforce-firestore-set-merge:** unwrap assertions in the RealtimeDB carve-out (closes [#2150](https://github.com/BluMintInc/eslint-custom-rules/issues/2150)) ([958d273](https://github.com/BluMintInc/eslint-custom-rules/commit/958d273bbfeb77f47af785227115b9579d9c56d3))

## [1.20.178](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.177...v1.20.178) (2026-08-26)


### Bug Fixes

* **enforce-firestore-facade:** key the RealtimeDB carve-out on declared type (closes [#2149](https://github.com/BluMintInc/eslint-custom-rules/issues/2149)) ([8ec1bdc](https://github.com/BluMintInc/eslint-custom-rules/commit/8ec1bdcad467355965a4a5cd00b875272e80e4d5))

## [1.20.177](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.176...v1.20.177) (2026-08-26)


### Bug Fixes

* **jsdoc-above-field:** claim a trailing block that closes its container (closes [#2145](https://github.com/BluMintInc/eslint-custom-rules/issues/2145)) ([f3dd9f4](https://github.com/BluMintInc/eslint-custom-rules/commit/f3dd9f434deb1a5b9cf60ba4ea28da3eb9d627d5))

## [1.20.176](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.175...v1.20.176) (2026-08-26)


### Bug Fixes

* **enforce-assert-safe-object-key:** wrap a coerced key instead of replacing it (closes [#2144](https://github.com/BluMintInc/eslint-custom-rules/issues/2144)) ([8a52823](https://github.com/BluMintInc/eslint-custom-rules/commit/8a52823d4fb795d8df4a2627a8066fbe5cbb0116))
* **enforce-singular-type-names:** exempt singular nouns that merely end in s (closes [#2143](https://github.com/BluMintInc/eslint-custom-rules/issues/2143)) ([45f329c](https://github.com/BluMintInc/eslint-custom-rules/commit/45f329ccf49432b1b32c72e6873982f2a0a2dd34))

## [1.20.175](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.174...v1.20.175) (2026-08-26)


### Bug Fixes

* **enforce-firestore-set-merge:** place a block comment before the separator and fold a list that fits (closes [#2142](https://github.com/BluMintInc/eslint-custom-rules/issues/2142)) ([a50d0da](https://github.com/BluMintInc/eslint-custom-rules/commit/a50d0dab9cb8b4e5a78751f5b9301ccf31f79822)), closes [#2140](https://github.com/BluMintInc/eslint-custom-rules/issues/2140) [#1877](https://github.com/BluMintInc/eslint-custom-rules/issues/1877) [#2140](https://github.com/BluMintInc/eslint-custom-rules/issues/2140)
* **prefer-nullish-coalescing-boolean-props:** discount an absorbed comment from the chain-break decision (closes [#2141](https://github.com/BluMintInc/eslint-custom-rules/issues/2141)) ([ef1da8c](https://github.com/BluMintInc/eslint-custom-rules/commit/ef1da8cad114c884ad3b385ce3a739f2e3788ad2)), closes [#2139](https://github.com/BluMintInc/eslint-custom-rules/issues/2139)

## [1.20.174](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.173...v1.20.174) (2026-08-26)


### Bug Fixes

* **enforce-firestore-set-merge:** emit the appended option's separator before a trailing comment (closes [#2140](https://github.com/BluMintInc/eslint-custom-rules/issues/2140)) ([047317d](https://github.com/BluMintInc/eslint-custom-rules/commit/047317dc4dd4c3f5b0b1f5e5af18f3044e674916))
* **no-usememo-for-pass-by-value:** carry the trailing comment past the statement terminator (closes [#2138](https://github.com/BluMintInc/eslint-custom-rules/issues/2138)) ([3d08b02](https://github.com/BluMintInc/eslint-custom-rules/commit/3d08b02ab298a5c8327f6ff12ea33fc187d3a5e1)), closes [#2079](https://github.com/BluMintInc/eslint-custom-rules/issues/2079)
* **prefer-nullish-coalescing-boolean-props:** carry the trailing comment past the statement terminator (closes [#2139](https://github.com/BluMintInc/eslint-custom-rules/issues/2139)) ([eb2e030](https://github.com/BluMintInc/eslint-custom-rules/commit/eb2e0302db91d5545e27fdc197d2390e8dd0859c)), closes [#2138](https://github.com/BluMintInc/eslint-custom-rules/issues/2138)

## [1.20.173](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.172...v1.20.173) (2026-08-25)


### Bug Fixes

* **enforce-assert-safe-object-key:** break inside the computed access when the arrow break is taken (closes [#2134](https://github.com/BluMintInc/eslint-custom-rules/issues/2134)) ([6916ed4](https://github.com/BluMintInc/eslint-custom-rules/commit/6916ed43dc90f9826f33ac9b644f48dd81477be5))
* **enforce-assert-safe-object-key:** make the --fix output a prettier fixed point (closes [#2108](https://github.com/BluMintInc/eslint-custom-rules/issues/2108)) ([4a6a520](https://github.com/BluMintInc/eslint-custom-rules/commit/4a6a520949695fcb71b718da5080a7ad216edf93))
* **enforce-empty-object-check:** make the --fix output a prettier fixed point (closes [#2110](https://github.com/BluMintInc/eslint-custom-rules/issues/2110)) ([608984a](https://github.com/BluMintInc/eslint-custom-rules/commit/608984aeb9ca051c9c02b8b0cb90844e0a89bc89))
* **enforce-firestore-rules-get-access:** make the --fix output a prettier fixed point (closes [#2123](https://github.com/BluMintInc/eslint-custom-rules/issues/2123)) ([4a56160](https://github.com/BluMintInc/eslint-custom-rules/commit/4a561600ecd6067446f68647f2a74271379b3521))
* **enforce-memoize-async:** make the --fix output a prettier fixed point (closes [#2111](https://github.com/BluMintInc/eslint-custom-rules/issues/2111)) ([9bcf2e8](https://github.com/BluMintInc/eslint-custom-rules/commit/9bcf2e812aa8178a45648a9f07350f3bf7089148))
* **enforce-memoize-getters:** make the --fix output a prettier fixed point (closes [#2124](https://github.com/BluMintInc/eslint-custom-rules/issues/2124)) ([3061b88](https://github.com/BluMintInc/eslint-custom-rules/commit/3061b88f88b2e49679417581fff73fb293b7e517))
* **enforce-microdiff:** make the --fix output a prettier fixed point (closes [#2116](https://github.com/BluMintInc/eslint-custom-rules/issues/2116)) ([092a929](https://github.com/BluMintInc/eslint-custom-rules/commit/092a9296519a59cafdd329dc4d12741b6ebba10a))
* **enforce-mui-rounded-icons:** make the --fix output a prettier fixed point (closes [#2117](https://github.com/BluMintInc/eslint-custom-rules/issues/2117)) ([147375f](https://github.com/BluMintInc/eslint-custom-rules/commit/147375f40af0a7ad4660af56303dd40477a05da7))
* **enforce-querykey-ts:** make the --fix output a prettier fixed point (closes [#2125](https://github.com/BluMintInc/eslint-custom-rules/issues/2125)) ([4e71494](https://github.com/BluMintInc/eslint-custom-rules/commit/4e71494550d12844caf97697fb111c51c29716e0))
* **global-const-style:** break the as-const append that overflows the print width (closes [#2126](https://github.com/BluMintInc/eslint-custom-rules/issues/2126)) ([c25e8da](https://github.com/BluMintInc/eslint-custom-rules/commit/c25e8da67ee2bc3bf6ff7ce10d2c28392854afb8))
* **jsdoc-above-field:** emit the hoisted comment at the field's own indent (closes [#2127](https://github.com/BluMintInc/eslint-custom-rules/issues/2127)) ([f14de56](https://github.com/BluMintInc/eslint-custom-rules/commit/f14de5682cffda2e44258b9577849d91f9a764a9))
* **memo-compare-deeply-complex-props:** make the --fix output a prettier fixed point (closes [#2112](https://github.com/BluMintInc/eslint-custom-rules/issues/2112)) ([af7c3b7](https://github.com/BluMintInc/eslint-custom-rules/commit/af7c3b703292519c79fbf2a15de795efeed519f6))
* **no-array-length-in-deps:** measure the print width before extending an import (closes [#2128](https://github.com/BluMintInc/eslint-custom-rules/issues/2128)) ([1003138](https://github.com/BluMintInc/eslint-custom-rules/commit/10031388b6c9628b1e8c0b52ea5eda4c486e20ff))
* **no-entire-object-hook-deps:** make the --fix output a prettier fixed point (closes [#2118](https://github.com/BluMintInc/eslint-custom-rules/issues/2118)) ([5f8ec6f](https://github.com/BluMintInc/eslint-custom-rules/commit/5f8ec6ff9c3c22386557c4c9735fba31ec5b9f99))
* **no-explicit-return-type:** carry the annotation comment onto the block body it precedes (closes [#2129](https://github.com/BluMintInc/eslint-custom-rules/issues/2129)) ([6dffade](https://github.com/BluMintInc/eslint-custom-rules/commit/6dffade48455faab5e1e1789db34110d2cd0ab7e))
* **no-firestore-jest-mock:** make the --fix output a prettier fixed point (closes [#2119](https://github.com/BluMintInc/eslint-custom-rules/issues/2119)) ([d2ef3f7](https://github.com/BluMintInc/eslint-custom-rules/commit/d2ef3f73a8a6c4f9205266c9911a8ef23591458d))
* **no-redundant-annotation-assertion:** withhold the strip where it would re-lay out an arrow body or chain (closes [#2120](https://github.com/BluMintInc/eslint-custom-rules/issues/2120)) ([e6a4bf8](https://github.com/BluMintInc/eslint-custom-rules/commit/e6a4bf851ed35b4738ecdc85e5e09aaf6a431d93))
* **no-redundant-param-types:** re-lay the stripped parameter list the way prettier prints it (closes [#2130](https://github.com/BluMintInc/eslint-custom-rules/issues/2130)) ([36a572b](https://github.com/BluMintInc/eslint-custom-rules/commit/36a572bc5e0128180567cbd0f4a4240833f93649))
* **no-unnecessary-destructuring:** make the --fix output a prettier fixed point (closes [#2113](https://github.com/BluMintInc/eslint-custom-rules/issues/2113)) ([0c77212](https://github.com/BluMintInc/eslint-custom-rules/commit/0c77212f844c2991e72001148dc9ffb840020839))
* **no-useless-fragment:** re-indent the promoted child for its new enclosing scope (closes [#2131](https://github.com/BluMintInc/eslint-custom-rules/issues/2131)) ([37a03a0](https://github.com/BluMintInc/eslint-custom-rules/commit/37a03a0afbe676e56597b51e258dd9d713965844))
* **no-usememo-for-pass-by-value:** make the --fix output a prettier fixed point (closes [#2114](https://github.com/BluMintInc/eslint-custom-rules/issues/2114)) ([2e05972](https://github.com/BluMintInc/eslint-custom-rules/commit/2e0597255619f18732b8c3c0c3fa2db558236983))
* **prefer-clone-deep:** make the --fix output a prettier fixed point (closes [#2109](https://github.com/BluMintInc/eslint-custom-rules/issues/2109)) ([995b0b6](https://github.com/BluMintInc/eslint-custom-rules/commit/995b0b627d6d01480b48a1a4545d0986fe7262ed))
* **prefer-map-over-conditional-dispatch:** make the --fix output a prettier fixed point (closes [#2107](https://github.com/BluMintInc/eslint-custom-rules/issues/2107)) ([8fa67df](https://github.com/BluMintInc/eslint-custom-rules/commit/8fa67dfd6b0f284d081146a9ca15476caedae956))
* **prefer-nullish-coalescing-boolean-props:** keep the parens the rewrite needs around an operand (closes [#2135](https://github.com/BluMintInc/eslint-custom-rules/issues/2135)) ([6bcedaf](https://github.com/BluMintInc/eslint-custom-rules/commit/6bcedaf9e8d8658779a14d3d15f3a419384f1915))
* **prefer-nullish-coalescing-boolean-props:** make the --fix output a prettier fixed point (closes [#2106](https://github.com/BluMintInc/eslint-custom-rules/issues/2106)) ([2693744](https://github.com/BluMintInc/eslint-custom-rules/commit/269374434ac6eb8310a83fbd4faa91770f3097bf))
* **prefer-use-deep-compare-memo:** make the --fix output a prettier fixed point (closes [#2121](https://github.com/BluMintInc/eslint-custom-rules/issues/2121)) ([90175bf](https://github.com/BluMintInc/eslint-custom-rules/commit/90175bf572f940b80ff7df845bca63776b4889a3))
* **require-hooks-default-params:** emit the default-param append at the width prettier prints (closes [#2132](https://github.com/BluMintInc/eslint-custom-rules/issues/2132)) ([daccc74](https://github.com/BluMintInc/eslint-custom-rules/commit/daccc745372b7d5754b3e27c08e327dcff4092d1))
* **require-image-optimized:** emit the renamed element at the width prettier prints (closes [#2133](https://github.com/BluMintInc/eslint-custom-rules/issues/2133)) ([9632029](https://github.com/BluMintInc/eslint-custom-rules/commit/9632029a8d3dc850778d57b619f6280d3d6bc99a))
* **require-memoize-jsx-returners:** make the --fix output a prettier fixed point (closes [#2115](https://github.com/BluMintInc/eslint-custom-rules/issues/2115)) ([88eba14](https://github.com/BluMintInc/eslint-custom-rules/commit/88eba14c1150e220056e4575f4ae61d99962146a))
* **require-memo:** measure the print width before extending the memo import (closes [#2137](https://github.com/BluMintInc/eslint-custom-rules/issues/2137)) ([1a4efc8](https://github.com/BluMintInc/eslint-custom-rules/commit/1a4efc82f19451ae55e757630fee11ec9798c1bd))
* **use-latest-callback:** make the --fix output a prettier fixed point (closes [#2122](https://github.com/BluMintInc/eslint-custom-rules/issues/2122)) ([7c97d56](https://github.com/BluMintInc/eslint-custom-rules/commit/7c97d56d5bc44266fb138621169ad5ecc0a21b6b))

## [1.20.172](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.171...v1.20.172) (2026-08-24)


### Bug Fixes

* **enforce-dynamic-firebase-imports:** anchor the awaited import behind guards, state flips and try blocks it must not jump (closes [#2103](https://github.com/BluMintInc/eslint-custom-rules/issues/2103)) ([54e54a6](https://github.com/BluMintInc/eslint-custom-rules/commit/54e54a67f6df5438a71f6d1e04292f74ab3de2ae))
* **enforce-early-destructuring:** emit nested patterns expanded as prettier prints them (closes [#2081](https://github.com/BluMintInc/eslint-custom-rules/issues/2081)) ([05a73fe](https://github.com/BluMintInc/eslint-custom-rules/commit/05a73fe0a44be9c470256bbe2ab5099ef2c98060))
* **enforce-empty-object-check:** break the widened condition's statement header at print width the way prettier does (closes [#2095](https://github.com/BluMintInc/eslint-custom-rules/issues/2095)) ([35f9b93](https://github.com/BluMintInc/eslint-custom-rules/commit/35f9b93277d83449d6acae283996d3edd582e582))
* **enforce-empty-object-check:** parenthesize the widened guard only where its position needs it (closes [#2082](https://github.com/BluMintInc/eslint-custom-rules/issues/2082)) ([f8bf9f9](https://github.com/BluMintInc/eslint-custom-rules/commit/f8bf9f9d41f28361511357aca165891e904122cc))
* **enforce-fieldpath-syntax-in-docsetter:** hoist only comments that sit outside a relocated leaf value, so the fix stops emitting them twice (closes [#2096](https://github.com/BluMintInc/eslint-custom-rules/issues/2096)) ([dba7e84](https://github.com/BluMintInc/eslint-custom-rules/commit/dba7e84ac62fbf9ffd005019909bac8dd6a3b1e9))
* **enforce-fieldpath-syntax-in-docsetter:** re-indent the relocated value to its landing depth (closes [#2083](https://github.com/BluMintInc/eslint-custom-rules/issues/2083)) ([4fe5f1f](https://github.com/BluMintInc/eslint-custom-rules/commit/4fe5f1f88affb3476dea1a444ff998e2f1bafdd7))
* **enforce-firestore-doc-ref-generic:** carry the rules-unit-testing exemption across a project module boundary (closes [#2104](https://github.com/BluMintInc/eslint-custom-rules/issues/2104)) ([8dfe8e4](https://github.com/BluMintInc/eslint-custom-rules/commit/8dfe8e4f969b655e16af57f95e04004f8bcb1762))
* **enforce-firestore-set-merge:** emit the batch manager descriptor at its call site's depth (closes [#2084](https://github.com/BluMintInc/eslint-custom-rules/issues/2084)) ([8ce5d2b](https://github.com/BluMintInc/eslint-custom-rules/commit/8ce5d2bdf4cecb7b4b3582a8c85222618e34a68f)), closes [#1957](https://github.com/BluMintInc/eslint-custom-rules/issues/1957) [#1877](https://github.com/BluMintInc/eslint-custom-rules/issues/1877)
* **enforce-firestore-set-merge:** lay { merge: true } out against the call's own argument list so prettier leaves it (closes [#2097](https://github.com/BluMintInc/eslint-custom-rules/issues/2097)) ([c4ac74f](https://github.com/BluMintInc/eslint-custom-rules/commit/c4ac74fd2844d81e004261041ba12ff9ab30d2c7))
* **enforce-m3-sentence-case:** read an interior capital as proper-noun evidence per word (closes [#2105](https://github.com/BluMintInc/eslint-custom-rules/issues/2105)) ([8bde7e3](https://github.com/BluMintInc/eslint-custom-rules/commit/8bde7e30f8bb59113482612c083911144e771817))
* **ensure-pointer-events-none:** insert the property on its own line (closes [#2085](https://github.com/BluMintInc/eslint-custom-rules/issues/2085)) ([84d63b3](https://github.com/BluMintInc/eslint-custom-rules/commit/84d63b36345a8e63cc7b510df69580dd9f53517f))
* **flatten-push-calls:** emit the merged argument list flat while it fits the print width (closes [#2086](https://github.com/BluMintInc/eslint-custom-rules/issues/2086)) ([ea3c192](https://github.com/BluMintInc/eslint-custom-rules/commit/ea3c192e0b3ef16735785cde8f64917f18dd5c8a))
* **jsdoc-above-field:** attach trailing JSDoc by token order, not line sharing (closes [#2093](https://github.com/BluMintInc/eslint-custom-rules/issues/2093)) ([3680b4b](https://github.com/BluMintInc/eslint-custom-rules/commit/3680b4b89ebc48a5d5801dea79e82b6642f6c1e9))
* **memo-compare-deeply-complex-props:** exempt Error-typed props, for which deep comparison is degenerate (closes [#2099](https://github.com/BluMintInc/eslint-custom-rules/issues/2099)) ([b265a91](https://github.com/BluMintInc/eslint-custom-rules/commit/b265a911ee2e7f766b40c3d9088438cfdaaea8c1)), closes [#1327](https://github.com/BluMintInc/eslint-custom-rules/issues/1327)
* **no-jsx-whitespace-literal:** report only spacer children (closes [#2092](https://github.com/BluMintInc/eslint-custom-rules/issues/2092), closes [#2102](https://github.com/BluMintInc/eslint-custom-rules/issues/2102)) ([cc11f49](https://github.com/BluMintInc/eslint-custom-rules/commit/cc11f49d17ca1806c3acad66bdfce6a43ba63469))
* **parallelize-async-operations:** lay the Promise.all out as prettier prints it (closes [#2087](https://github.com/BluMintInc/eslint-custom-rules/issues/2087)) ([0ac98a2](https://github.com/BluMintInc/eslint-custom-rules/commit/0ac98a22dac7177f454dc267a9f334583a615c35))
* **prefer-clone-deep:** re-lay-out the emitted call for its enclosing context and drop the redundant paren pair (closes [#2094](https://github.com/BluMintInc/eslint-custom-rules/issues/2094)) ([c625682](https://github.com/BluMintInc/eslint-custom-rules/commit/c625682941e3514bcc131baa87c70e99950fe084))
* **prefer-clone-deep:** terminate every emitted property with a comma (closes [#2088](https://github.com/BluMintInc/eslint-custom-rules/issues/2088)) ([5739019](https://github.com/BluMintInc/eslint-custom-rules/commit/5739019c7562160d6ab89fd86431257b5196bc1a))
* **prefer-next-dynamic:** carry the trailing comma on the emitted options argument (closes [#2089](https://github.com/BluMintInc/eslint-custom-rules/issues/2089)) ([68dcbe5](https://github.com/BluMintInc/eslint-custom-rules/commit/68dcbe58bc3010fb3f83ed63dda51c17d099d0b4)), closes [#2083](https://github.com/BluMintInc/eslint-custom-rules/issues/2083)
* **prefer-next-dynamic:** derive the emitted call's indent from the line its replaced span starts on (closes [#2100](https://github.com/BluMintInc/eslint-custom-rules/issues/2100)) ([3ffacda](https://github.com/BluMintInc/eslint-custom-rules/commit/3ffacda2010442ed4b68d947dfa34ec513b1dcab))
* **prefer-nullish-coalescing-boolean-props:** drop the parentheses `??` does not need (closes [#2090](https://github.com/BluMintInc/eslint-custom-rules/issues/2090)) ([04abf87](https://github.com/BluMintInc/eslint-custom-rules/commit/04abf87fb986f662079742f61aed84b1eac3a5ca)), closes [#2060](https://github.com/BluMintInc/eslint-custom-rules/issues/2060)
* **prefer-nullish-coalescing-boolean-props:** re-emit a comment-bearing chain broken as prettier prints it (closes [#2101](https://github.com/BluMintInc/eslint-custom-rules/issues/2101)) ([151c0aa](https://github.com/BluMintInc/eslint-custom-rules/commit/151c0aaedd6311c7fbad9d7aec7b7f25c9d8e020))
* **prefer-usecallback-over-usememo-for-functions:** re-indent the unwrapped body (closes [#2091](https://github.com/BluMintInc/eslint-custom-rules/issues/2091)) ([9264e2f](https://github.com/BluMintInc/eslint-custom-rules/commit/9264e2fb0b6ec2c6eb8f545f70bd2df77aec6a98))
* **require-props-composition:** credit props whose entire shape is a framework contract (closes [#2098](https://github.com/BluMintInc/eslint-custom-rules/issues/2098)) ([9c18b46](https://github.com/BluMintInc/eslint-custom-rules/commit/9c18b46beca73c24fa5bbfa0395deda8bf9a32f5))

## [1.20.171](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.170...v1.20.171) (2026-08-21)


### Bug Fixes

* **enforce-assert-safe-object-key:** own the whole access when wrapping a key (closes [#2067](https://github.com/BluMintInc/eslint-custom-rules/issues/2067)) ([ae17eb5](https://github.com/BluMintInc/eslint-custom-rules/commit/ae17eb5d6fc77895deca2cfbb56f431e2f6536dc))
* **enforce-memoize-async:** stop demanding @Memoize() on a resource-handle factory (closes [#2068](https://github.com/BluMintInc/eslint-custom-rules/issues/2068)) ([d6659a3](https://github.com/BluMintInc/eslint-custom-rules/commit/d6659a3df018ba398c1284fd92cb8f16c71b55f7))
* **enforce-memoize-getters:** exempt a getter that hands back a resource handle (closes [#2074](https://github.com/BluMintInc/eslint-custom-rules/issues/2074)) ([b021444](https://github.com/BluMintInc/eslint-custom-rules/commit/b021444c9556102d85edc8049b2a13c390ccdca4)), closes [#2068](https://github.com/BluMintInc/eslint-custom-rules/issues/2068) [#2073](https://github.com/BluMintInc/eslint-custom-rules/issues/2073)
* **enforce-stable-hash-spread-props:** own the argument list when inserting the exhaustive-deps disable (closes [#2065](https://github.com/BluMintInc/eslint-custom-rules/issues/2065)) ([8ddbf33](https://github.com/BluMintInc/eslint-custom-rules/commit/8ddbf338fc4e880a659b0d1d5a231e85cbefa810)), closes [#1877](https://github.com/BluMintInc/eslint-custom-rules/issues/1877) [#1839](https://github.com/BluMintInc/eslint-custom-rules/issues/1839)
* **importRemoval:** take the blank line a removed statement strands (closes [#2078](https://github.com/BluMintInc/eslint-custom-rules/issues/2078)) ([af641d2](https://github.com/BluMintInc/eslint-custom-rules/commit/af641d203fd4218a0fe5836e4845ebee2ecc2705))
* **no-explicit-return-type:** break and re-align a carried multi-line comment past the arrow (closes [#2066](https://github.com/BluMintInc/eslint-custom-rules/issues/2066)) ([24ce58b](https://github.com/BluMintInc/eslint-custom-rules/commit/24ce58bd99c771d0e05eaf5e608500d371c84ff1)), closes [#1963](https://github.com/BluMintInc/eslint-custom-rules/issues/1963) [#1832](https://github.com/BluMintInc/eslint-custom-rules/issues/1832)
* **no-explicit-return-type:** carry a stranded comment into the parens a JSX arrow body takes (closes [#2070](https://github.com/BluMintInc/eslint-custom-rules/issues/2070)) ([21ad0b2](https://github.com/BluMintInc/eslint-custom-rules/commit/21ad0b28ae3d02d79e535d9666d4cc47ec03067f)), closes [#2066](https://github.com/BluMintInc/eslint-custom-rules/issues/2066)
* **no-explicit-return-type:** indent the body one step when a hoisted line comment forces the break (closes [#2069](https://github.com/BluMintInc/eslint-custom-rules/issues/2069)) ([f44d89e](https://github.com/BluMintInc/eslint-custom-rules/commit/f44d89eefc8fcbef7e0d2752ba6c91fb318bde10)), closes [#2066](https://github.com/BluMintInc/eslint-custom-rules/issues/2066)
* **no-explicit-return-type:** preserve a resource-handle return annotation (closes [#2073](https://github.com/BluMintInc/eslint-custom-rules/issues/2073)) ([0b81b41](https://github.com/BluMintInc/eslint-custom-rules/commit/0b81b41aedfce25e1c6cea31dc8ef83d42259dc6)), closes [#1512](https://github.com/BluMintInc/eslint-custom-rules/issues/1512)
* **no-redundant-annotation-assertion:** carry the shared line-comment indent fix ([d234630](https://github.com/BluMintInc/eslint-custom-rules/commit/d2346306249dfd5b83c2866f456e8b0c3f644bfc)), closes [#2069](https://github.com/BluMintInc/eslint-custom-rules/issues/2069)
* **no-redundant-annotation-assertion:** pin the JSX arms of the shared arrow-gap planner ([9839fb0](https://github.com/BluMintInc/eslint-custom-rules/commit/9839fb053e3be23bf040b0b3652771f29472e005)), closes [#2070](https://github.com/BluMintInc/eslint-custom-rules/issues/2070) [#1832](https://github.com/BluMintInc/eslint-custom-rules/issues/1832)
* **no-useless-usememo-primitives:** lay a carried comment out where prettier prints it (closes [#2079](https://github.com/BluMintInc/eslint-custom-rules/issues/2079)) ([14f197f](https://github.com/BluMintInc/eslint-custom-rules/commit/14f197fa9278981eda46f40125e101aacd12ce1d))
* **no-useless-usememo-primitives:** parenthesise the inlined expression only where its landing position needs it (closes [#2071](https://github.com/BluMintInc/eslint-custom-rules/issues/2071)) ([5b60630](https://github.com/BluMintInc/eslint-custom-rules/commit/5b6063060eb880e2afa13464c44bdbc7879a130f)), closes [#1963](https://github.com/BluMintInc/eslint-custom-rules/issues/1963)
* **prefer-type-over-interface:** emit the heritage intersection in the layout prettier prints (closes [#2077](https://github.com/BluMintInc/eslint-custom-rules/issues/2077)) ([5c10ffb](https://github.com/BluMintInc/eslint-custom-rules/commit/5c10ffb8b198082235d8821d9f5bd6542c58dab9))
* **prefer-type-over-interface:** terminate the emitted type alias (closes [#2072](https://github.com/BluMintInc/eslint-custom-rules/issues/2072)) ([434d6eb](https://github.com/BluMintInc/eslint-custom-rules/commit/434d6eb9b8dc8235772305b9280869a9c2e4b308)), closes [#2077](https://github.com/BluMintInc/eslint-custom-rules/issues/2077) [#2077](https://github.com/BluMintInc/eslint-custom-rules/issues/2077) [#1850](https://github.com/BluMintInc/eslint-custom-rules/issues/1850) [#1403](https://github.com/BluMintInc/eslint-custom-rules/issues/1403) [#1583](https://github.com/BluMintInc/eslint-custom-rules/issues/1583) [#1406](https://github.com/BluMintInc/eslint-custom-rules/issues/1406) [#1549](https://github.com/BluMintInc/eslint-custom-rules/issues/1549)
* **prefer-type-over-interface:** withhold the autofix past a configurable printWidth (closes [#2080](https://github.com/BluMintInc/eslint-custom-rules/issues/2080)) ([f138a92](https://github.com/BluMintInc/eslint-custom-rules/commit/f138a92abbe6e0939da44db9dcf078de0d7f7598))
* **prefer-use-deep-compare-memo:** measure the line the rename widens before writing it (closes [#2064](https://github.com/BluMintInc/eslint-custom-rules/issues/2064)) ([9514dab](https://github.com/BluMintInc/eslint-custom-rules/commit/9514dab9fd34feb78d9ed616d6da94bbad5ac62c))

## [1.20.170](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.169...v1.20.170) (2026-08-19)


### Bug Fixes

* **prefer-map-over-conditional-dispatch:** drop the parentheses the replaced ternary needed (closes [#2063](https://github.com/BluMintInc/eslint-custom-rules/issues/2063)) ([b85d84e](https://github.com/BluMintInc/eslint-custom-rules/commit/b85d84e3ed814a734bdf5dbc886ab4ab208df6b0)), closes [#2060](https://github.com/BluMintInc/eslint-custom-rules/issues/2060)
* **prefer-map-over-conditional-dispatch:** stop the eager-call scan at function boundaries (closes [#2062](https://github.com/BluMintInc/eslint-custom-rules/issues/2062)) ([e637200](https://github.com/BluMintInc/eslint-custom-rules/commit/e63720022ca9427589f73cb8d4bc5838288c2fbf))

## [1.20.169](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.168...v1.20.169) (2026-08-19)


### Bug Fixes

* **enforce-dynamic-firebase-imports:** carry comments, reindent body (closes [#2056](https://github.com/BluMintInc/eslint-custom-rules/issues/2056), closes [#2057](https://github.com/BluMintInc/eslint-custom-rules/issues/2057)) ([76dcf67](https://github.com/BluMintInc/eslint-custom-rules/commit/76dcf6714e14c100f55b9d247d60e8620843cd7b)), closes [#1877](https://github.com/BluMintInc/eslint-custom-rules/issues/1877)
* **enforce-dynamic-firebase-imports:** measure the emitted declaration against the print width (closes [#2044](https://github.com/BluMintInc/eslint-custom-rules/issues/2044)) ([9b45166](https://github.com/BluMintInc/eslint-custom-rules/commit/9b4516645c5ee2006a4ee933c886c8058b408d26)), closes [#1566](https://github.com/BluMintInc/eslint-custom-rules/issues/1566) [#1565](https://github.com/BluMintInc/eslint-custom-rules/issues/1565) [#2056](https://github.com/BluMintInc/eslint-custom-rules/issues/2056) [#2057](https://github.com/BluMintInc/eslint-custom-rules/issues/2057) [#2056](https://github.com/BluMintInc/eslint-custom-rules/issues/2056)
* **enforce-firestore-rules-get-access:** wrap the rewritten literal at print width (closes [#2052](https://github.com/BluMintInc/eslint-custom-rules/issues/2052)) ([7eca418](https://github.com/BluMintInc/eslint-custom-rules/commit/7eca418fa24473eb9f3e461a000390f133aa5f3b)), closes [#1566](https://github.com/BluMintInc/eslint-custom-rules/issues/1566) [#1565](https://github.com/BluMintInc/eslint-custom-rules/issues/1565)
* **enforce-global-constants:** measure the hoisted declaration against the print width (closes [#2046](https://github.com/BluMintInc/eslint-custom-rules/issues/2046)) ([1c25e7d](https://github.com/BluMintInc/eslint-custom-rules/commit/1c25e7d50c507a88fd19ce94ef6338719b500e0f)), closes [#1566](https://github.com/BluMintInc/eslint-custom-rules/issues/1566) [#1565](https://github.com/BluMintInc/eslint-custom-rules/issues/1565)
* **enforce-querykey-ts:** measure the extended import before writing it (closes [#2050](https://github.com/BluMintInc/eslint-custom-rules/issues/2050)) ([218c939](https://github.com/BluMintInc/eslint-custom-rules/commit/218c939ebf3b919508918291b368734bc20ac848))
* **global-const-style:** exempt components, rename both halves of a JSX tag (closes [#2055](https://github.com/BluMintInc/eslint-custom-rules/issues/2055)) ([8eb9558](https://github.com/BluMintInc/eslint-custom-rules/commit/8eb955860134c144eb66c6b0c8bc01a93c80c6f4)), closes [#1681](https://github.com/BluMintInc/eslint-custom-rules/issues/1681) [#1740](https://github.com/BluMintInc/eslint-custom-rules/issues/1740)
* **jsdoc-above-field:** detect trailing JSDoc placed before the member separator (closes [#2041](https://github.com/BluMintInc/eslint-custom-rules/issues/2041)) ([afe8b79](https://github.com/BluMintInc/eslint-custom-rules/commit/afe8b794d5bf73683438c42b3567ef72f5c8119c))
* **logical-top-to-bottom-grouping:** count JSX element names as binding reads (closes [#2042](https://github.com/BluMintInc/eslint-custom-rules/issues/2042)) ([83256b6](https://github.com/BluMintInc/eslint-custom-rules/commit/83256b6f817bb3962a0bd2da8ebd5114e977db32))
* **memo-compare-deeply-complex-props:** measure the emitted comparator line against the print width (closes [#2043](https://github.com/BluMintInc/eslint-custom-rules/issues/2043)) ([37d74c9](https://github.com/BluMintInc/eslint-custom-rules/commit/37d74c991474093f60fb238c3639e59ba0140139)), closes [#2045](https://github.com/BluMintInc/eslint-custom-rules/issues/2045)
* **no-array-length-in-deps:** measure the emitted declaration before writing it (closes [#2049](https://github.com/BluMintInc/eslint-custom-rules/issues/2049)) ([fe80918](https://github.com/BluMintInc/eslint-custom-rules/commit/fe809180e16eb54c6234e14a1e9b435c23c7d7d2))
* **prefer-global-router-state-key:** measure the extended import before writing it (closes [#2051](https://github.com/BluMintInc/eslint-custom-rules/issues/2051)) ([31a6d8c](https://github.com/BluMintInc/eslint-custom-rules/commit/31a6d8cecfa0faccdd3745775650496554fb6713))
* **prefer-map-over-conditional-dispatch:** measure the Record annotation head before emitting it (closes [#2048](https://github.com/BluMintInc/eslint-custom-rules/issues/2048)) ([074c43c](https://github.com/BluMintInc/eslint-custom-rules/commit/074c43c3c476a378af4fd193ea311a16ab66284b)), closes [#2045](https://github.com/BluMintInc/eslint-custom-rules/issues/2045)
* **prefer-map-over-conditional-dispatch:** quote keys, absorb stale wraps, rebase copied bodies (closes [#2059](https://github.com/BluMintInc/eslint-custom-rules/issues/2059), closes [#2060](https://github.com/BluMintInc/eslint-custom-rules/issues/2060), closes [#2061](https://github.com/BluMintInc/eslint-custom-rules/issues/2061)) ([405835b](https://github.com/BluMintInc/eslint-custom-rules/commit/405835b596fbdf6611199a3e38247d4e475dadfe))
* **prefer-sx-prop-over-system-props:** rejoin children on the one-attribute merge (closes [#2058](https://github.com/BluMintInc/eslint-custom-rules/issues/2058)) ([edf0a1c](https://github.com/BluMintInc/eslint-custom-rules/commit/edf0a1c74e253366b20870688e73ab3fa374a80f))
* **prefer-sx-prop-over-system-props:** stop falling through to the over-wide line every wrap remedy declined (closes [#2045](https://github.com/BluMintInc/eslint-custom-rules/issues/2045)) ([1aee452](https://github.com/BluMintInc/eslint-custom-rules/commit/1aee4529df35fae1e789848a0483d4b66f98804b)), closes [#1565](https://github.com/BluMintInc/eslint-custom-rules/issues/1565) [#2058](https://github.com/BluMintInc/eslint-custom-rules/issues/2058)
* **require-image-optimized:** rename the tag in place, not re-author the element (closes [#2053](https://github.com/BluMintInc/eslint-custom-rules/issues/2053)) ([82ee3dc](https://github.com/BluMintInc/eslint-custom-rules/commit/82ee3dc73d8c9f6fb74d294d7d55c9991e89111b))
* **require-memo:** split the memo wrapper past the print width (closes [#2054](https://github.com/BluMintInc/eslint-custom-rules/issues/2054)) ([7c29c68](https://github.com/BluMintInc/eslint-custom-rules/commit/7c29c6811207c8f63b9e1c66bf2d20855dc5162e))
* **use-latest-callback:** honour the width measurement it already takes (closes [#2047](https://github.com/BluMintInc/eslint-custom-rules/issues/2047)) ([a4239be](https://github.com/BluMintInc/eslint-custom-rules/commit/a4239beba67ce891885b2c20975f739fcda64c82)), closes [#2045](https://github.com/BluMintInc/eslint-custom-rules/issues/2045)
* **use-latest-callback:** treat a ref callback as a consumer of callback identity (closes [#1711](https://github.com/BluMintInc/eslint-custom-rules/issues/1711)) ([21f576c](https://github.com/BluMintInc/eslint-custom-rules/commit/21f576c9ff1748fdef4b3b9189d5518c1c74b908))

## [1.20.168](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.167...v1.20.168) (2026-08-18)


### Bug Fixes

* **memo-compare-deeply-complex-props:** classify zero-declaration props by their carrier type (closes [#2039](https://github.com/BluMintInc/eslint-custom-rules/issues/2039)) ([f8ad12c](https://github.com/BluMintInc/eslint-custom-rules/commit/f8ad12c175bf1fa9d435a7e0dbd58d1fecbd1a3d))
* **prefer-nullish-coalescing-boolean-props:** keep || where it strips a short-circuit sentinel (closes [#2040](https://github.com/BluMintInc/eslint-custom-rules/issues/2040)) ([1308578](https://github.com/BluMintInc/eslint-custom-rules/commit/1308578eb853a0343338164d39e5d43d35006872))

## [1.20.167](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.166...v1.20.167) (2026-08-18)


### Bug Fixes

* **require-props-composition:** credit composition through an array element (closes [#2038](https://github.com/BluMintInc/eslint-custom-rules/issues/2038)) ([b3f2922](https://github.com/BluMintInc/eslint-custom-rules/commit/b3f292242f2a77ad61cffb44a5c41a8d45482ff7))

## [1.20.166](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.165...v1.20.166) (2026-08-18)


### Bug Fixes

* **memo-compare-deeply-complex-props:** exempt props declared by a dependency (closes [#2037](https://github.com/BluMintInc/eslint-custom-rules/issues/2037)) ([05cf46c](https://github.com/BluMintInc/eslint-custom-rules/commit/05cf46cd852d563401ef713065a14d92cf9631cc))

## [1.20.165](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.164...v1.20.165) (2026-08-18)


### Bug Fixes

* **enforce-identifiable-firestore-type:** accept every remedy its message prescribes (closes [#2035](https://github.com/BluMintInc/eslint-custom-rules/issues/2035)) ([86ba6de](https://github.com/BluMintInc/eslint-custom-rules/commit/86ba6dee2410b98db4f7971fd2fb789e875ae515))

## [1.20.164](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.163...v1.20.164) (2026-08-17)


### Bug Fixes

* **enforce-empty-object-check:** see through optional chains (closes [#2034](https://github.com/BluMintInc/eslint-custom-rules/issues/2034)) ([b45da3e](https://github.com/BluMintInc/eslint-custom-rules/commit/b45da3e8f4e789c3382af4cf8496b528e8d4cf15))

## [1.20.163](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.162...v1.20.163) (2026-08-17)


### Bug Fixes

* **prefer-clone-deep:** absorb a direct `as const` so the composed --fix lands (closes [#2032](https://github.com/BluMintInc/eslint-custom-rules/issues/2032)) ([74231b4](https://github.com/BluMintInc/eslint-custom-rules/commit/74231b42edf829b55aeff435c7d97f6d0b6de8d6)), closes [#2011](https://github.com/BluMintInc/eslint-custom-rules/issues/2011)
* **require-memoize-jsx-returners:** exempt render() on a React class component (closes [#2033](https://github.com/BluMintInc/eslint-custom-rules/issues/2033)) ([fd83f72](https://github.com/BluMintInc/eslint-custom-rules/commit/fd83f721554d958e420eecf1698b833fb2e419ef))

## [1.20.162](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.161...v1.20.162) (2026-08-17)


### Bug Fixes

* **no-hungarian:** treat Class as a taxonomy head noun in suffix position (closes [#2030](https://github.com/BluMintInc/eslint-custom-rules/issues/2030)) ([22b8117](https://github.com/BluMintInc/eslint-custom-rules/commit/22b8117a9501c3a8e22840990285217bf050f63e)), closes [#1277](https://github.com/BluMintInc/eslint-custom-rules/issues/1277) [#1835](https://github.com/BluMintInc/eslint-custom-rules/issues/1835)

## [1.20.161](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.160...v1.20.161) (2026-08-17)


### Bug Fixes

* **enforce-react-type-naming:** read the type from a type assertion (closes [#2029](https://github.com/BluMintInc/eslint-custom-rules/issues/2029)) ([67e5d9f](https://github.com/BluMintInc/eslint-custom-rules/commit/67e5d9faae7991dfa92681bb2f89d379f0636593)), closes [1846/#1847](https://github.com/BluMintInc/eslint-custom-rules/issues/1847) [#1357](https://github.com/BluMintInc/eslint-custom-rules/issues/1357)

## [1.20.160](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.159...v1.20.160) (2026-08-17)


### Bug Fixes

* **require-memo:** decline the memo rewrite inside a jest.mock factory (closes [#2028](https://github.com/BluMintInc/eslint-custom-rules/issues/2028)) ([7c643c7](https://github.com/BluMintInc/eslint-custom-rules/commit/7c643c76902c70b160b34a387e01cc1068f597f8)), closes [#1659](https://github.com/BluMintInc/eslint-custom-rules/issues/1659) [#1660](https://github.com/BluMintInc/eslint-custom-rules/issues/1660)

## [1.20.159](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.158...v1.20.159) (2026-08-17)


### Bug Fixes

* **enforce-f-extension-for-entry-points:** extend the default entry points rather than replacing them (closes [#2027](https://github.com/BluMintInc/eslint-custom-rules/issues/2027)) ([3ec50be](https://github.com/BluMintInc/eslint-custom-rules/commit/3ec50be300818e71dcb38b46d66b03270f2a37ef))

## [1.20.158](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.157...v1.20.158) (2026-08-16)


### Bug Fixes

* **no-excessive-parent-chain:** remove the binding the suggestion de-references ([f8be414](https://github.com/BluMintInc/eslint-custom-rules/commit/f8be414190d1a21f2514a81a71a36a7eba1afc24)), closes [#1733](https://github.com/BluMintInc/eslint-custom-rules/issues/1733) [#1903](https://github.com/BluMintInc/eslint-custom-rules/issues/1903) [#2026](https://github.com/BluMintInc/eslint-custom-rules/issues/2026)

## [1.20.157](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.156...v1.20.157) (2026-08-16)


### Bug Fixes

* **enforce-positive-naming:** treat the inherit/increment/integrate/instantiate/inline families as in- exceptions (closes [#2025](https://github.com/BluMintInc/eslint-custom-rules/issues/2025)) ([56e2fa2](https://github.com/BluMintInc/eslint-custom-rules/commit/56e2fa2c85f604b51517cca35ddf615d4fcb4df2))

## [1.20.156](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.155...v1.20.156) (2026-08-15)


### Bug Fixes

* **logical-top-to-bottom-grouping:** separate reordered statements so a relocated one cannot land inside a trailing // comment (closes [#2023](https://github.com/BluMintInc/eslint-custom-rules/issues/2023)) ([0394c46](https://github.com/BluMintInc/eslint-custom-rules/commit/0394c464c68c17355d576df676e1a02fa68e7656))
* **prefer-nullish-coalescing-boolean-props:** carry the comments stranded between the operands instead of deleting them (closes [#2024](https://github.com/BluMintInc/eslint-custom-rules/issues/2024)) ([f632a26](https://github.com/BluMintInc/eslint-custom-rules/commit/f632a26d330c7ee12beff6893530756d328e5681))

## [1.20.155](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.154...v1.20.155) (2026-08-15)


### Bug Fixes

* **class-methods-read-top-to-bottom:** pin a # field by every read of it, not just this.#x (closes [#2022](https://github.com/BluMintInc/eslint-custom-rules/issues/2022)) ([86c65b5](https://github.com/BluMintInc/eslint-custom-rules/commit/86c65b5292de1fdd9e8c7df81ab664632e575db3)), closes [p.#tier](https://github.com/p./issues/tier)
* **no-explicit-return-type:** spare the implementation signature of an overload set (closes [#2019](https://github.com/BluMintInc/eslint-custom-rules/issues/2019)) ([666fb57](https://github.com/BluMintInc/eslint-custom-rules/commit/666fb5700ac01f5fc3571d41605be83008f2893e)), closes [#1771](https://github.com/BluMintInc/eslint-custom-rules/issues/1771) [#2018](https://github.com/BluMintInc/eslint-custom-rules/issues/2018)
* **prefer-union-from-const-array:** decline in an ambient context, where no const array is legal (closes [#2020](https://github.com/BluMintInc/eslint-custom-rules/issues/2020)) ([526752a](https://github.com/BluMintInc/eslint-custom-rules/commit/526752aaf29c579b508a4c689d121b0b2ac44510)), closes [#2018](https://github.com/BluMintInc/eslint-custom-rules/issues/2018)
* **require-image-optimized:** exempt the img inside ImageOptimized's own definition (closes [#2021](https://github.com/BluMintInc/eslint-custom-rules/issues/2021)) ([deb9a50](https://github.com/BluMintInc/eslint-custom-rules/commit/deb9a50bbae4d98e5d9a5e3a81f510706587df1a))

## [1.20.154](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.153...v1.20.154) (2026-08-15)


### Bug Fixes

* **parallelize-async-operations:** order callback-deferred instance mutations against later reads (closes [#2017](https://github.com/BluMintInc/eslint-custom-rules/issues/2017)) ([722c98d](https://github.com/BluMintInc/eslint-custom-rules/commit/722c98dbf74e0195c77b7411dab861ac613b3a69))

## [1.20.153](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.152...v1.20.153) (2026-08-14)


### Bug Fixes

* **enforce-boolean-naming-prefixes:** decline when the use site contradicts the callee's name (closes [#2016](https://github.com/BluMintInc/eslint-custom-rules/issues/2016)) ([4375724](https://github.com/BluMintInc/eslint-custom-rules/commit/4375724fd671509da5680c7c3e0ba40c21788c4e)), closes [#1346](https://github.com/BluMintInc/eslint-custom-rules/issues/1346)
* **enforce-object-literal-as-const:** keep an unannotated returned array unfrozen (closes [#2015](https://github.com/BluMintInc/eslint-custom-rules/issues/2015)) ([5a0ee39](https://github.com/BluMintInc/eslint-custom-rules/commit/5a0ee39f6a484038e491b501651a69e9e0ab04a5))
* **global-const-style:** decline the as const when the binding is mutated later (closes [#2013](https://github.com/BluMintInc/eslint-custom-rules/issues/2013)) ([667a7e8](https://github.com/BluMintInc/eslint-custom-rules/commit/667a7e884426b9a41fa26fe0d99feb3c8e4aab7b))
* **no-explicit-return-type:** keep a decorator factory's annotation (closes [#2014](https://github.com/BluMintInc/eslint-custom-rules/issues/2014)) ([685501a](https://github.com/BluMintInc/eslint-custom-rules/commit/685501ad680ef063049974c1d6df550ffeea4f78))

## [1.20.152](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.151...v1.20.152) (2026-08-14)


### Bug Fixes

* **enforce-querykey-ts:** carry each key's import on its own fix (closes [#2012](https://github.com/BluMintInc/eslint-custom-rules/issues/2012)) ([627086d](https://github.com/BluMintInc/eslint-custom-rules/commit/627086d80dd5ec87ec9330638097b2cf44c7cb82))
* **prefer-clone-deep:** decline the fix under a const assertion (closes [#2011](https://github.com/BluMintInc/eslint-custom-rules/issues/2011)) ([9d5e61e](https://github.com/BluMintInc/eslint-custom-rules/commit/9d5e61efcaf5daf63307899d2823f72b11062684))

## [1.20.151](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.150...v1.20.151) (2026-08-14)


### Bug Fixes

* **enforce-exported-function-types:** follow a default-exported identifier to its local memo() declaration (closes [#2006](https://github.com/BluMintInc/eslint-custom-rules/issues/2006)) ([001d129](https://github.com/BluMintInc/eslint-custom-rules/commit/001d1298aa91a4a7c8f3038d32729d3fb588dc51))
* **enforce-firestore-doc-ref-generic:** require an ancestor assertion to state a document schema (closes [#2007](https://github.com/BluMintInc/eslint-custom-rules/issues/2007)) ([fd0eb73](https://github.com/BluMintInc/eslint-custom-rules/commit/fd0eb7332a950d611d96dc1b77c5141ec370b390))
* **no-redundant-usecallback-wrapper:** treat a module-level function as a stable delegate (closes [#2008](https://github.com/BluMintInc/eslint-custom-rules/issues/2008)) ([87aae47](https://github.com/BluMintInc/eslint-custom-rules/commit/87aae4732d28344442de60b3f0185691e44838fe))
* **no-unused-props:** see through memo/forwardRef wrappers require-memo emits (closes [#2004](https://github.com/BluMintInc/eslint-custom-rules/issues/2004)) ([095b5cc](https://github.com/BluMintInc/eslint-custom-rules/commit/095b5cc367914ad71719c3a2e0c50642c3cec5ae))
* **prefer-use-base62-id:** climb wrapper calls so memo() no longer hides a component (closes [#2005](https://github.com/BluMintInc/eslint-custom-rules/issues/2005)) ([c8ea11b](https://github.com/BluMintInc/eslint-custom-rules/commit/c8ea11bbcd6086d255a279f5c0d1e75b78ba6ced))

## [1.20.150](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.149...v1.20.150) (2026-08-13)


### Bug Fixes

* **enforce-exported-function-types:** drop 28 inert empty-bodied selectors (closes [#2000](https://github.com/BluMintInc/eslint-custom-rules/issues/2000)) ([d3464c7](https://github.com/BluMintInc/eslint-custom-rules/commit/d3464c77dab4d93640a7251f504789e6b4591924))
* **enforce-querykey-ts:** follow a `||=`/`??=` onto an undefined key ([#2001](https://github.com/BluMintInc/eslint-custom-rules/issues/2001)) ([c40e3df](https://github.com/BluMintInc/eslint-custom-rules/commit/c40e3dfbaf0f9219a3eac352123062d4dd3e9ddc))
* **enforce-querykey-ts:** guard variable tracking on a plain `=` assignment (closes [#1999](https://github.com/BluMintInc/eslint-custom-rules/issues/1999)) ([97e5276](https://github.com/BluMintInc/eslint-custom-rules/commit/97e5276a1bd29bd2b22914cde3205843c2de6323))
* **no-type-assertion-returns:** drop the inert empty CallExpression handler (closes [#2002](https://github.com/BluMintInc/eslint-custom-rules/issues/2002)) ([0add9a7](https://github.com/BluMintInc/eslint-custom-rules/commit/0add9a79dee2a0654bf98298c04a5dabc30c6713)), closes [#2000](https://github.com/BluMintInc/eslint-custom-rules/issues/2000)
* **prefer-global-router-state-key:** follow a `||=`/`??=` onto an undefined key (closes [#2001](https://github.com/BluMintInc/eslint-custom-rules/issues/2001)) ([9033026](https://github.com/BluMintInc/eslint-custom-rules/commit/903302653368fe20b1954b3a16f70e26d9cc94bb)), closes [#1999](https://github.com/BluMintInc/eslint-custom-rules/issues/1999)

## [1.20.149](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.148...v1.20.149) (2026-08-13)


### Bug Fixes

* **no-array-length-in-deps:** emit a hash name no-hungarian accepts (closes [#1997](https://github.com/BluMintInc/eslint-custom-rules/issues/1997)) ([d287e2e](https://github.com/BluMintInc/eslint-custom-rules/commit/d287e2e5cdbebd851473563747bb3e974215b7e9))

## [1.20.148](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.147...v1.20.148) (2026-08-13)


### Bug Fixes

* **class-methods-read-top-to-bottom:** follow eager initializer reads through invoked members (closes [#1988](https://github.com/BluMintInc/eslint-custom-rules/issues/1988)) ([3d91a03](https://github.com/BluMintInc/eslint-custom-rules/commit/3d91a03c5965c21a4b0d89ded7bee8ca65c2d07e))
* **enforce-early-destructuring:** keep a guarded nested destructure in place (closes [#1993](https://github.com/BluMintInc/eslint-custom-rules/issues/1993)) ([8470d19](https://github.com/BluMintInc/eslint-custom-rules/commit/8470d19d762a4834c8e4790d308d29e8ee309398))
* **no-array-length-in-deps:** withhold the hoist out of a skippable branch (closes [#1992](https://github.com/BluMintInc/eslint-custom-rules/issues/1992)) ([3aa9e7a](https://github.com/BluMintInc/eslint-custom-rules/commit/3aa9e7a7c96f5d0d9e92513dcce7b6d441983e00))
* **no-entire-object-hook-deps:** stop a dep path at a try or deferred body (closes [#1991](https://github.com/BluMintInc/eslint-custom-rules/issues/1991)) ([94bd398](https://github.com/BluMintInc/eslint-custom-rules/commit/94bd398d4715b699c16dd7da73d9ce1d48682ae1))
* **parallelize-async-operations:** decline ordered awaits whose later operand dereferences an installed slot (closes [#1989](https://github.com/BluMintInc/eslint-custom-rules/issues/1989)) ([588be13](https://github.com/BluMintInc/eslint-custom-rules/commit/588be13607350106c8c8782a929b2c56a4fe7c70))
* **prefer-map-over-conditional-dispatch:** decline the hoist across a guard (closes [#1990](https://github.com/BluMintInc/eslint-custom-rules/issues/1990)) ([43cafb6](https://github.com/BluMintInc/eslint-custom-rules/commit/43cafb6eb92c53fcd7ab4eeaec192191e113052e))

## [1.20.147](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.146...v1.20.147) (2026-08-13)


### Bug Fixes

* **no-entire-object-hook-deps:** stop hoisting a guarded dereference into the dependency array (closes [#1985](https://github.com/BluMintInc/eslint-custom-rules/issues/1985)) ([ff684a3](https://github.com/BluMintInc/eslint-custom-rules/commit/ff684a3be4767a20e083acb25b7c199f215d0e4d)), closes [#1401](https://github.com/BluMintInc/eslint-custom-rules/issues/1401)

## [1.20.146](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.145...v1.20.146) (2026-08-13)


### Bug Fixes

* **enforce-memoize-async:** exempt methods taking part in a transaction (closes [#1975](https://github.com/BluMintInc/eslint-custom-rules/issues/1975)) ([5881239](https://github.com/BluMintInc/eslint-custom-rules/commit/5881239100c796340547380b1a919e4f488c8603))
* **prefer-use-deep-compare-memo:** stop promoting primitive deps via member access (closes [#1979](https://github.com/BluMintInc/eslint-custom-rules/issues/1979)) ([da31680](https://github.com/BluMintInc/eslint-custom-rules/commit/da3168091a1f330db3c2af2ad4e3f109f496e2f1))
* **prevent-children-clobber:** widen the syntactic exemption beyond Omit<> (closes [#1980](https://github.com/BluMintInc/eslint-custom-rules/issues/1980)) ([8dc5cfe](https://github.com/BluMintInc/eslint-custom-rules/commit/8dc5cfe0ca298df6713a9762fa4b438865516dc2))
* **vertically-group-related-functions:** decline reorders that demote a helper below its module-scope caller (closes [#1983](https://github.com/BluMintInc/eslint-custom-rules/issues/1983)) ([b6dad3a](https://github.com/BluMintInc/eslint-custom-rules/commit/b6dad3ae6623a825b8db452a993df6fdb35e3ce8))

## [1.20.145](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.144...v1.20.145) (2026-08-12)


### Bug Fixes

* **no-always-true-false-conditions:** accept a literal loop test the body can exit (closes [#1973](https://github.com/BluMintInc/eslint-custom-rules/issues/1973)) ([33b8b09](https://github.com/BluMintInc/eslint-custom-rules/commit/33b8b09483423c094158b1c05db327e76c406e9e))
* **no-redundant-annotation-assertion:** do not treat unresolved types as identical (closes [#1972](https://github.com/BluMintInc/eslint-custom-rules/issues/1972)) ([d18e328](https://github.com/BluMintInc/eslint-custom-rules/commit/d18e328a45e4be29f1a05fadfa190e4048af1501))
* **no-undefined-null-passthrough:** stop reporting the identity function (closes [#1974](https://github.com/BluMintInc/eslint-custom-rules/issues/1974)) ([e09a36c](https://github.com/BluMintInc/eslint-custom-rules/commit/e09a36ce081810bf4c586ebd6ccd00b53bbbf9ff)), closes [#1785](https://github.com/BluMintInc/eslint-custom-rules/issues/1785)

## [1.20.144](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.143...v1.20.144) (2026-08-12)


### Bug Fixes

* **no-redundant-annotation-assertion:** carry a stranded comment past the arrow (closes [#1969](https://github.com/BluMintInc/eslint-custom-rules/issues/1969)) ([f3418f7](https://github.com/BluMintInc/eslint-custom-rules/commit/f3418f7ca7b7f8e595a94db8c3321cebd7790f13)), closes [#1964](https://github.com/BluMintInc/eslint-custom-rules/issues/1964)

## [1.20.143](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.142...v1.20.143) (2026-08-12)


### Bug Fixes

* **prefer-sx-prop-over-system-props:** key the exemption on (component, prop) (closes [#1966](https://github.com/BluMintInc/eslint-custom-rules/issues/1966)) ([fb490cf](https://github.com/BluMintInc/eslint-custom-rules/commit/fb490cf47ddfb4ff24b9db29752f2574d19af258)), closes [#1273](https://github.com/BluMintInc/eslint-custom-rules/issues/1273)

## [1.20.142](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.141...v1.20.142) (2026-08-12)


### Bug Fixes

* **no-explicit-return-type:** keep the annotation's comments clear of the arrow gap (closes [#1964](https://github.com/BluMintInc/eslint-custom-rules/issues/1964)) ([e34a4bc](https://github.com/BluMintInc/eslint-custom-rules/commit/e34a4bc172944c653b6cceefd876785742cf6e90)), closes [#1877](https://github.com/BluMintInc/eslint-custom-rules/issues/1877)
* **no-usememo-for-pass-by-value:** hoist a carried multi-line comment clear of the return (closes [#1963](https://github.com/BluMintInc/eslint-custom-rules/issues/1963)) ([8551e1c](https://github.com/BluMintInc/eslint-custom-rules/commit/8551e1c7903c8d3c68b5113596c0f710cc803664))

## [1.20.141](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.140...v1.20.141) (2026-08-12)


### Bug Fixes

* **enforce-early-destructuring:** anchor the hoist to the hook call, not to its line (closes [#1956](https://github.com/BluMintInc/eslint-custom-rules/issues/1956)) ([cc5db6b](https://github.com/BluMintInc/eslint-custom-rules/commit/cc5db6baa7f329949f7f1a4da0407238f69884af)), closes [1951/#1953](https://github.com/BluMintInc/eslint-custom-rules/issues/1953) [#1951](https://github.com/BluMintInc/eslint-custom-rules/issues/1951)
* **enforce-memoize-async:** keep the injected import below a shared-line directive (closes [#1957](https://github.com/BluMintInc/eslint-custom-rules/issues/1957)) ([215e334](https://github.com/BluMintInc/eslint-custom-rules/commit/215e3341487dd56634eefdafa2f660b5d32e3e1e)), closes [#1956](https://github.com/BluMintInc/eslint-custom-rules/issues/1956)
* **enforce-memoize-getters:** keep the injected import below a shared-line directive (closes [#1958](https://github.com/BluMintInc/eslint-custom-rules/issues/1958)) ([28229fd](https://github.com/BluMintInc/eslint-custom-rules/commit/28229fdb601a1baf8d668e94ef913c253709fdae)), closes [#1956](https://github.com/BluMintInc/eslint-custom-rules/issues/1956) [#1951](https://github.com/BluMintInc/eslint-custom-rules/issues/1951) [#1953](https://github.com/BluMintInc/eslint-custom-rules/issues/1953)
* **prefer-use-deep-compare-memo:** keep the injected import below a shared-line directive (closes [#1959](https://github.com/BluMintInc/eslint-custom-rules/issues/1959)) ([5bdadd3](https://github.com/BluMintInc/eslint-custom-rules/commit/5bdadd3b31a74a43995185bbe0113166a907d1b4)), closes [#1957](https://github.com/BluMintInc/eslint-custom-rules/issues/1957) [#1958](https://github.com/BluMintInc/eslint-custom-rules/issues/1958) [#1956](https://github.com/BluMintInc/eslint-custom-rules/issues/1956)

## [1.20.140](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.139...v1.20.140) (2026-08-11)


### Bug Fixes

* **class-methods-read-top-to-bottom:** treat `#foo` as private, so one ECMA-private member stops silencing the class (closes [#1932](https://github.com/BluMintInc/eslint-custom-rules/issues/1932)) ([6162743](https://github.com/BluMintInc/eslint-custom-rules/commit/6162743cd75be69145ba3a4ca0f35a166619e617))
* **consistent-callback-naming:** carry a class-method rename to its `this.` readers (closes [#1946](https://github.com/BluMintInc/eslint-custom-rules/issues/1946)) ([a4e9f4c](https://github.com/BluMintInc/eslint-custom-rules/commit/a4e9f4cb5c9b3cde8b6eae42933b408a70866a74)), closes [#1944](https://github.com/BluMintInc/eslint-custom-rules/issues/1944)
* **consistent-callback-naming:** report a callback written as a class property (closes [#1949](https://github.com/BluMintInc/eslint-custom-rules/issues/1949)) ([ebd2f6f](https://github.com/BluMintInc/eslint-custom-rules/commit/ebd2f6f0a24400ff33ecebb3b66dd3a488c31b57))
* **consistent-callback-naming:** withhold a rename an intervening binding would capture (closes [#1948](https://github.com/BluMintInc/eslint-custom-rules/issues/1948)) ([7c9620e](https://github.com/BluMintInc/eslint-custom-rules/commit/7c9620e59d1dc20d32d26c98622afd15595fceb4))
* **consistent-callback-naming:** withhold the rename when a member satisfies a declared contract (closes [#1944](https://github.com/BluMintInc/eslint-custom-rules/issues/1944)) ([bf418f0](https://github.com/BluMintInc/eslint-custom-rules/commit/bf418f0984b9ca8ca61acc3e78341687155dad19))
* **enforce-assert-safe-object-key:** credit a `#private` member with its own `: number` proof (closes [#1933](https://github.com/BluMintInc/eslint-custom-rules/issues/1933)) ([59f9fc8](https://github.com/BluMintInc/eslint-custom-rules/commit/59f9fc890bc3fe6f7d65a593db2cc51cf930e4b8))
* **enforce-assert-throws:** resolve `#assert` member names instead of collapsing them to '' (closes [#1934](https://github.com/BluMintInc/eslint-custom-rules/issues/1934)) ([99131d2](https://github.com/BluMintInc/eslint-custom-rules/commit/99131d2296971fd0336353110569c96f50fde948))
* **enforce-boolean-naming-prefixes:** see `#name` members, not just `Identifier` keys (closes [#1935](https://github.com/BluMintInc/eslint-custom-rules/issues/1935)) ([65380b6](https://github.com/BluMintInc/eslint-custom-rules/commit/65380b6d26d5e6c103d52003abd62a0239e690b4)), closes [#verified](https://github.com/BluMintInc/eslint-custom-rules/issues/verified)
* **enforce-firestore-doc-ref-generic:** resolve a schema declared on a `#` member (closes [#1936](https://github.com/BluMintInc/eslint-custom-rules/issues/1936)) ([5cf6d7f](https://github.com/BluMintInc/eslint-custom-rules/commit/5cf6d7f5848cf149f1007e825bd7ddd22a3cf2cc))
* **enforce-memoize-async:** anchor `@Memoize()` to the method, not to the line (closes [#1953](https://github.com/BluMintInc/eslint-custom-rules/issues/1953)) ([7e675b9](https://github.com/BluMintInc/eslint-custom-rules/commit/7e675b947a70985542f97333f0db248983082d56)), closes [#1945](https://github.com/BluMintInc/eslint-custom-rules/issues/1945) [#1951](https://github.com/BluMintInc/eslint-custom-rules/issues/1951)
* **enforce-memoize-async:** stay silent inside a class expression (closes [#1952](https://github.com/BluMintInc/eslint-custom-rules/issues/1952)) ([18e1ce9](https://github.com/BluMintInc/eslint-custom-rules/commit/18e1ce91aa3108080e8dc474ea35563bae1baea7)), closes [#1947](https://github.com/BluMintInc/eslint-custom-rules/issues/1947) [#1950](https://github.com/BluMintInc/eslint-custom-rules/issues/1950)
* **enforce-memoize-async:** stay silent on a method with a private name (closes [#1954](https://github.com/BluMintInc/eslint-custom-rules/issues/1954)) ([169606d](https://github.com/BluMintInc/eslint-custom-rules/commit/169606d608fa8e4af1a662750211a70a375d2a73))
* **enforce-memoize-getters:** anchor `@Memoize()` to the getter, not to the line (closes [#1945](https://github.com/BluMintInc/eslint-custom-rules/issues/1945)) ([f88fe89](https://github.com/BluMintInc/eslint-custom-rules/commit/f88fe899a8467cd1d042329303b7802bc097d747))
* **enforce-memoize-getters:** stay silent inside a class expression (closes [#1947](https://github.com/BluMintInc/eslint-custom-rules/issues/1947)) ([1bf2fd1](https://github.com/BluMintInc/eslint-custom-rules/commit/1bf2fd18576222a2f3e953d5a015a927028d6b32)), closes [#1945](https://github.com/BluMintInc/eslint-custom-rules/issues/1945)
* **no-passthrough-getters:** rank a `#` getter as private, not public (closes [#1937](https://github.com/BluMintInc/eslint-custom-rules/issues/1937)) ([3d7dc99](https://github.com/BluMintInc/eslint-custom-rules/commit/3d7dc99a802cc399319f765120e80c7b4e08e42b))
* **parallelize-async-operations:** engage the ordering barriers on `#` members (closes [#1938](https://github.com/BluMintInc/eslint-custom-rules/issues/1938)) ([9b25f89](https://github.com/BluMintInc/eslint-custom-rules/commit/9b25f89b5d60dbb766568bb39aac45dd29a461f3))
* **prefer-docsetter-setall:** resolve a `#docSetter` receiver to its own field (closes [#1939](https://github.com/BluMintInc/eslint-custom-rules/issues/1939)) ([774d33a](https://github.com/BluMintInc/eslint-custom-rules/commit/774d33a8760a7ca30cbfee23a20039e1e85b4976)), closes [#x](https://github.com/BluMintInc/eslint-custom-rules/issues/x)
* **prefer-getter-over-parameterless-method:** let `#` methods reach the analysis (closes [#1940](https://github.com/BluMintInc/eslint-custom-rules/issues/1940)) ([70d031f](https://github.com/BluMintInc/eslint-custom-rules/commit/70d031f4766438cf23163dd6831c7fb4d8651eda)), closes [#foo](https://github.com/BluMintInc/eslint-custom-rules/issues/foo)
* **prefer-map-over-conditional-dispatch:** derive a lookup name from a `#` discriminant (closes [#1941](https://github.com/BluMintInc/eslint-custom-rules/issues/1941)) ([9cc23a4](https://github.com/BluMintInc/eslint-custom-rules/commit/9cc23a46dc087c70581e888f3c8819d0162dd87e)), closes [this.#tier](https://github.com/this./issues/tier)
* **prefer-utility-function-over-private-static:** see `static #foo` in all three arms (closes [#1942](https://github.com/BluMintInc/eslint-custom-rules/issues/1942)) ([ac5e0c0](https://github.com/BluMintInc/eslint-custom-rules/commit/ac5e0c040046c05d7347166eee1e59cf5157f4d0))
* **require-memoize-jsx-returners:** anchor `@Memoize()` to the member, not to the line (closes [#1951](https://github.com/BluMintInc/eslint-custom-rules/issues/1951)) ([193e3a6](https://github.com/BluMintInc/eslint-custom-rules/commit/193e3a62047909d6ed5056702388118c88df62c5)), closes [#1945](https://github.com/BluMintInc/eslint-custom-rules/issues/1945) [#1950](https://github.com/BluMintInc/eslint-custom-rules/issues/1950)
* **require-memoize-jsx-returners:** stay silent inside a class expression (closes [#1950](https://github.com/BluMintInc/eslint-custom-rules/issues/1950)) ([47aca8f](https://github.com/BluMintInc/eslint-custom-rules/commit/47aca8f9d1220de44c925d6a80a9318ae4c77227)), closes [#1947](https://github.com/BluMintInc/eslint-custom-rules/issues/1947)
* **require-memoize-jsx-returners:** stay silent on a member with a private name (closes [#1955](https://github.com/BluMintInc/eslint-custom-rules/issues/1955)) ([4c07c95](https://github.com/BluMintInc/eslint-custom-rules/commit/4c07c95874edb03bb8468ae5d23367613bccd066)), closes [#1945](https://github.com/BluMintInc/eslint-custom-rules/issues/1945) [#1954](https://github.com/BluMintInc/eslint-custom-rules/issues/1954)
* **semantic-function-prefixes:** name `#` methods instead of returning early (closes [#1943](https://github.com/BluMintInc/eslint-custom-rules/issues/1943)) ([da7c186](https://github.com/BluMintInc/eslint-custom-rules/commit/da7c186c6fc3b2826ea2793a02adc883d39b4846))

## [1.20.139](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.138...v1.20.139) (2026-08-11)


### Bug Fixes

* **class-methods-read-top-to-bottom:** key dependency edges on this-qualified references (closes [#1916](https://github.com/BluMintInc/eslint-custom-rules/issues/1916), closes [#1917](https://github.com/BluMintInc/eslint-custom-rules/issues/1917), closes [#1918](https://github.com/BluMintInc/eslint-custom-rules/issues/1918)) ([82e34dc](https://github.com/BluMintInc/eslint-custom-rules/commit/82e34dca667df13b028bf029e65f8741c0ba4fe3)), closes [#559](https://github.com/BluMintInc/eslint-custom-rules/issues/559)
* **enforce-assert-safe-object-key:** credit return-type and class-field numeric proof (closes [#1915](https://github.com/BluMintInc/eslint-custom-rules/issues/1915)) ([c18be4f](https://github.com/BluMintInc/eslint-custom-rules/commit/c18be4fc510cfe0d66a8a8cb8bc95d6be5603892)), closes [#1713](https://github.com/BluMintInc/eslint-custom-rules/issues/1713) [#1554](https://github.com/BluMintInc/eslint-custom-rules/issues/1554) [#1830](https://github.com/BluMintInc/eslint-custom-rules/issues/1830) [#1713](https://github.com/BluMintInc/eslint-custom-rules/issues/1713)
* **enforce-firestore-doc-ref-generic:** credit a return annotation in any spelling (closes [#1909](https://github.com/BluMintInc/eslint-custom-rules/issues/1909)) ([f2c16aa](https://github.com/BluMintInc/eslint-custom-rules/commit/f2c16aaaa9d161f9ba48c0463f632e02c37f822a))
* **extract-global-constants:** report a hoistable nested arrow helper (closes [#1755](https://github.com/BluMintInc/eslint-custom-rules/issues/1755)) ([1339d0a](https://github.com/BluMintInc/eslint-custom-rules/commit/1339d0a1a68e5cacf8a0fcb84f28655f51bedf14))
* **memo-nested-react-components:** credit a component handed back in an array (closes [#1925](https://github.com/BluMintInc/eslint-custom-rules/issues/1925)) ([214ab5c](https://github.com/BluMintInc/eslint-custom-rules/commit/214ab5c251352987f854a4ce1536c33ee8af3c7e)), closes [#1919](https://github.com/BluMintInc/eslint-custom-rules/issues/1919)
* **memo-nested-react-components:** see through an optional chain (closes [#1911](https://github.com/BluMintInc/eslint-custom-rules/issues/1911)) ([ff37231](https://github.com/BluMintInc/eslint-custom-rules/commit/ff37231a32818e2b7f08aa6c3e3a54d7ebce0178)), closes [#1919](https://github.com/BluMintInc/eslint-custom-rules/issues/1919)
* **no-unused-props:** check a component nested inside another (closes [#1912](https://github.com/BluMintInc/eslint-custom-rules/issues/1912)) ([f02089d](https://github.com/BluMintInc/eslint-custom-rules/commit/f02089d156db42f4edabbe78efb73e2f818b7f68)), closes [#64](https://github.com/BluMintInc/eslint-custom-rules/issues/64) [#1890](https://github.com/BluMintInc/eslint-custom-rules/issues/1890) [#1620](https://github.com/BluMintInc/eslint-custom-rules/issues/1620) [#1378](https://github.com/BluMintInc/eslint-custom-rules/issues/1378)
* **no-unused-props:** examine function-declaration components (closes [#1910](https://github.com/BluMintInc/eslint-custom-rules/issues/1910)) ([229f6e7](https://github.com/BluMintInc/eslint-custom-rules/commit/229f6e749422e536f8d22eb788794125550d4416)), closes [#1378](https://github.com/BluMintInc/eslint-custom-rules/issues/1378)
* **parallelize-async-operations:** barrier closure writes to instance state (closes [#1924](https://github.com/BluMintInc/eslint-custom-rules/issues/1924)) ([3237e97](https://github.com/BluMintInc/eslint-custom-rules/commit/3237e9736d0a22c14e9706cbe88384ed64637b1a)), closes [#1723](https://github.com/BluMintInc/eslint-custom-rules/issues/1723)
* **parallelize-async-operations:** engage the receiver barrier for this/super/nested (closes [#1914](https://github.com/BluMintInc/eslint-custom-rules/issues/1914)) ([ec17093](https://github.com/BluMintInc/eslint-custom-rules/commit/ec1709370d160542a6bbc65276c62f61b9f9a2e5)), closes [#1287](https://github.com/BluMintInc/eslint-custom-rules/issues/1287) [pre-#1287](https://github.com/pre-/issues/1287)
* **parallelize-async-operations:** treat `super` and `this` as one receiver (closes [#1923](https://github.com/BluMintInc/eslint-custom-rules/issues/1923)) ([672bd0e](https://github.com/BluMintInc/eslint-custom-rules/commit/672bd0e5b748da34270f4599f9edf36ef3890f9f))
* **prefer-map-over-conditional-dispatch:** emit the Record key as a type expression (closes [#1926](https://github.com/BluMintInc/eslint-custom-rules/issues/1926)) ([f693be0](https://github.com/BluMintInc/eslint-custom-rules/commit/f693be0edb9e0defb230c6b8eb178ea9095bf9b7)), closes [#1929](https://github.com/BluMintInc/eslint-custom-rules/issues/1929) [#1930](https://github.com/BluMintInc/eslint-custom-rules/issues/1930)
* **prefer-map-over-conditional-dispatch:** look through `?.` in the ternary and if arms (closes [#1929](https://github.com/BluMintInc/eslint-custom-rules/issues/1929)) ([fc2a669](https://github.com/BluMintInc/eslint-custom-rules/commit/fc2a669af59ddf625ec6de1ec66f9e85ac8d95c1)), closes [#1867](https://github.com/BluMintInc/eslint-custom-rules/issues/1867) [#1867](https://github.com/BluMintInc/eslint-custom-rules/issues/1867)
* **prefer-spread-over-reassembly:** examine function declarations too (closes [#1908](https://github.com/BluMintInc/eslint-custom-rules/issues/1908)) ([26af95f](https://github.com/BluMintInc/eslint-custom-rules/commit/26af95f733ca4981ff0db1bcb13f207901ea4c2e)), closes [#1610](https://github.com/BluMintInc/eslint-custom-rules/issues/1610) [#1642](https://github.com/BluMintInc/eslint-custom-rules/issues/1642) [#1643](https://github.com/BluMintInc/eslint-custom-rules/issues/1643) [#1644](https://github.com/BluMintInc/eslint-custom-rules/issues/1644) [#1769](https://github.com/BluMintInc/eslint-custom-rules/issues/1769) [#1795](https://github.com/BluMintInc/eslint-custom-rules/issues/1795)
* **prefer-utility-function-over-private-static:** credit class state read through an alias (closes [#1922](https://github.com/BluMintInc/eslint-custom-rules/issues/1922)) ([e8c6877](https://github.com/BluMintInc/eslint-custom-rules/commit/e8c687709b61160db2c6a93c5c43fbc5657033c1)), closes [#1913](https://github.com/BluMintInc/eslint-custom-rules/issues/1913) [#1913](https://github.com/BluMintInc/eslint-custom-rules/issues/1913)
* **prefer-utility-function-over-private-static:** credit class-name-qualified state (closes [#1913](https://github.com/BluMintInc/eslint-custom-rules/issues/1913)) ([f3070f9](https://github.com/BluMintInc/eslint-custom-rules/commit/f3070f9bb3c9d3f07c4479b10574354f7bdf3f04))
* **prefer-utility-function-over-private-static:** decide `new.target` and `super` on dereference too (closes [#1931](https://github.com/BluMintInc/eslint-custom-rules/issues/1931)) ([c731fe1](https://github.com/BluMintInc/eslint-custom-rules/commit/c731fe190b888d65333ac6b67ece89b351fb820e)), closes [#1913](https://github.com/BluMintInc/eslint-custom-rules/issues/1913) [#1928](https://github.com/BluMintInc/eslint-custom-rules/issues/1928)
* **prefer-utility-function-over-private-static:** decide the `this` arm on dereference, not presence (closes [#1928](https://github.com/BluMintInc/eslint-custom-rules/issues/1928)) ([52f18ab](https://github.com/BluMintInc/eslint-custom-rules/commit/52f18abdcf25710ab231807ebf1264b00d8daf98)), closes [#1913](https://github.com/BluMintInc/eslint-custom-rules/issues/1913)
* **prefer-utility-function-over-private-static:** exempt setters, name getters correctly (closes [#1921](https://github.com/BluMintInc/eslint-custom-rules/issues/1921)) ([bb2a281](https://github.com/BluMintInc/eslint-custom-rules/commit/bb2a2810d80cd61b239549383d8e171d8f688732)), closes [#421](https://github.com/BluMintInc/eslint-custom-rules/issues/421) [#1913](https://github.com/BluMintInc/eslint-custom-rules/issues/1913) [#1920](https://github.com/BluMintInc/eslint-custom-rules/issues/1920)
* **prefer-utility-function-over-private-static:** see a helper spelled as a private static property (closes [#1927](https://github.com/BluMintInc/eslint-custom-rules/issues/1927)) ([e8450c7](https://github.com/BluMintInc/eslint-custom-rules/commit/e8450c7ffc28a12e8260bdaf4d426c2ebb21258c))
* **prefer-utility-function-over-private-static:** size the body in statements (closes [#1920](https://github.com/BluMintInc/eslint-custom-rules/issues/1920)) ([39d8584](https://github.com/BluMintInc/eslint-custom-rules/commit/39d8584099a73c88076919cb0b4e90aab4167b0a))
* **require-memo:** claim a nested component in both spellings (closes [#1774](https://github.com/BluMintInc/eslint-custom-rules/issues/1774)) ([ce19be1](https://github.com/BluMintInc/eslint-custom-rules/commit/ce19be170933fd902ca28d32efe6d3366ba77a64)), closes [#1911](https://github.com/BluMintInc/eslint-custom-rules/issues/1911)
* **require-memo:** credit a container-carried memo() hand-back (closes [#1919](https://github.com/BluMintInc/eslint-custom-rules/issues/1919)) ([0806359](https://github.com/BluMintInc/eslint-custom-rules/commit/0806359a1184f406985c4679c2d2c782341cf9ac))

## [1.20.138](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.137...v1.20.138) (2026-08-10)


### Bug Fixes

* **enforce-centralized-mock-firestore:** carry or withhold on the binding the retirement strands (closes [#1900](https://github.com/BluMintInc/eslint-custom-rules/issues/1900)) ([fe7ec1f](https://github.com/BluMintInc/eslint-custom-rules/commit/fe7ec1f0fb50331ce902b5c60b9da9ed71a05be7))
* **enforce-firestore-set-merge:** batch the rewrites that retire the updateDoc binding (closes [#1901](https://github.com/BluMintInc/eslint-custom-rules/issues/1901)) ([e52571f](https://github.com/BluMintInc/eslint-custom-rules/commit/e52571f626979a5b8da2aa6fff64f466f736ed77))
* **enforce-microdiff:** decline the import rewrite when every call is shadowed (closes [#1903](https://github.com/BluMintInc/eslint-custom-rules/issues/1903)) ([dcb5297](https://github.com/BluMintInc/eslint-custom-rules/commit/dcb529740bed8efc790996f788433d7f7fd928a2))
* **fast-deep-equal-over-microdiff:** remove the microdiff import the rewrite orphans (closes [#1893](https://github.com/BluMintInc/eslint-custom-rules/issues/1893)) ([4fe2cbe](https://github.com/BluMintInc/eslint-custom-rules/commit/4fe2cbecbad3f951abb952383094d8613e8174e5))
* **key-only-outermost-element:** remove the import a stripped key orphans (closes [#1904](https://github.com/BluMintInc/eslint-custom-rules/issues/1904)) ([bd706d1](https://github.com/BluMintInc/eslint-custom-rules/commit/bd706d1fe886a8979db3f4db9eb0eabc818d97bf))
* **no-empty-dependency-use-callbacks:** retire the import the hoist orphans (closes [#1897](https://github.com/BluMintInc/eslint-custom-rules/issues/1897)) ([d58abd9](https://github.com/BluMintInc/eslint-custom-rules/commit/d58abd957827286ecb9150cb54107bda79672f61))
* **no-explicit-return-type:** batch every binding the stripped annotations strand (closes [#1902](https://github.com/BluMintInc/eslint-custom-rules/issues/1902)) ([073638d](https://github.com/BluMintInc/eslint-custom-rules/commit/073638ddae075c12591487ef6ccafec4ae7ad04e))
* **no-mock-firebase-admin:** report the factory form, not a bare re-activation (closes [#1907](https://github.com/BluMintInc/eslint-custom-rules/issues/1907)) ([c7a7d00](https://github.com/BluMintInc/eslint-custom-rules/commit/c7a7d00b3c31d3fda010d00351805d9fd6406dc8))
* **no-redundant-usecallback-wrapper:** remove the import the collapse orphans (closes [#1895](https://github.com/BluMintInc/eslint-custom-rules/issues/1895)) ([2245320](https://github.com/BluMintInc/eslint-custom-rules/commit/2245320ef62a32db496d9d7b3767d1a8b4630187))
* **no-useless-usememo-primitives:** remove the react import the unwrap orphans (closes [#1894](https://github.com/BluMintInc/eslint-custom-rules/issues/1894)) ([172e421](https://github.com/BluMintInc/eslint-custom-rules/commit/172e421987adaefb4f188693bd709d315df72c96))
* **no-usememo-for-pass-by-value:** retire the import the React.useMemo unwrap orphans (closes [#1896](https://github.com/BluMintInc/eslint-custom-rules/issues/1896)) ([739e07d](https://github.com/BluMintInc/eslint-custom-rules/commit/739e07df8a140de86bdd21d9de84a6308af5b384))
* **prefer-params-over-parent-id:** remove the pattern property the rewrite strands (closes [#1899](https://github.com/BluMintInc/eslint-custom-rules/issues/1899)) ([6b5a55d](https://github.com/BluMintInc/eslint-custom-rules/commit/6b5a55df202f05242974eb03b3489dcd3b9a82c1))
* **use-latest-callback:** retire the react import the conversion orphans (closes [#1898](https://github.com/BluMintInc/eslint-custom-rules/issues/1898)) ([82b3e53](https://github.com/BluMintInc/eslint-custom-rules/commit/82b3e534e4d49e48d51a859258abc58ef4a5c9ec))

## [1.20.137](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.136...v1.20.137) (2026-08-08)


### Bug Fixes

* **logical-top-to-bottom-grouping:** report a late declaration that carries a sibling binding (closes [#1889](https://github.com/BluMintInc/eslint-custom-rules/issues/1889)) ([17e16c2](https://github.com/BluMintInc/eslint-custom-rules/commit/17e16c2eb85a9c8d0f2888f1251a88f58b2cfa87))
* **no-unused-props:** analyse every declarator, not just the first (closes [#1890](https://github.com/BluMintInc/eslint-custom-rules/issues/1890)) ([11e897b](https://github.com/BluMintInc/eslint-custom-rules/commit/11e897b33f9f47796c151bfc4f135cd7e5b99c24))
* **vertically-group-related-functions:** report a misordered function that carries a sibling binding (closes [#1891](https://github.com/BluMintInc/eslint-custom-rules/issues/1891)) ([d0facce](https://github.com/BluMintInc/eslint-custom-rules/commit/d0facceae42dbcb5794c0a851ada067e0bafb28e))

## [1.20.136](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.135...v1.20.136) (2026-08-08)


### Bug Fixes

* **consistent-callback-naming:** withhold the rename on exported bindings ([8808453](https://github.com/BluMintInc/eslint-custom-rules/commit/880845336b6d620b689b4558be9e4763d5dd256f)), closes [#1878](https://github.com/BluMintInc/eslint-custom-rules/issues/1878)
* **enforce-assert-safe-object-key:** check that a template's fixed text rules out a dangerous key (closes [#1880](https://github.com/BluMintInc/eslint-custom-rules/issues/1880)) ([2673ff3](https://github.com/BluMintInc/eslint-custom-rules/commit/2673ff30f418fdef11a56b41b70afb3cde63dd8b))
* **enforce-props-argument-name:** withhold the parameter-property rename on every static spelling of the member (closes [#1881](https://github.com/BluMintInc/eslint-custom-rules/issues/1881)) ([d149e5a](https://github.com/BluMintInc/eslint-custom-rules/commit/d149e5a60348814ba183232dbbdc6e57a3bdd3f6)), closes [#1878](https://github.com/BluMintInc/eslint-custom-rules/issues/1878) [#1882](https://github.com/BluMintInc/eslint-custom-rules/issues/1882)
* **enforce-props-naming-consistency:** withhold the parameter-property rename on every static spelling of the member (closes [#1882](https://github.com/BluMintInc/eslint-custom-rules/issues/1882)) ([74942e9](https://github.com/BluMintInc/eslint-custom-rules/commit/74942e905e57580fdb78ffea00b9b706e62e78a8)), closes [#1881](https://github.com/BluMintInc/eslint-custom-rules/issues/1881) [#1881](https://github.com/BluMintInc/eslint-custom-rules/issues/1881)
* **no-redundant-annotation-assertion:** compare index signatures, and read readonly through the accessor route (closes [#1887](https://github.com/BluMintInc/eslint-custom-rules/issues/1887)) ([c1cf7b6](https://github.com/BluMintInc/eslint-custom-rules/commit/c1cf7b63a1295bc05ed4b481df538fe430ea144c)), closes [#1883](https://github.com/BluMintInc/eslint-custom-rules/issues/1883) [#1354](https://github.com/BluMintInc/eslint-custom-rules/issues/1354)
* **no-redundant-annotation-assertion:** follow the circular-return check transitively (closes [#1886](https://github.com/BluMintInc/eslint-custom-rules/issues/1886)) ([9cea861](https://github.com/BluMintInc/eslint-custom-rules/commit/9cea86167a9c913d59b0ed14d1fa22f578431ebd)), closes [#1883](https://github.com/BluMintInc/eslint-custom-rules/issues/1883) [#1888](https://github.com/BluMintInc/eslint-custom-rules/issues/1888)
* **no-redundant-annotation-assertion:** keep annotations that are load-bearing (closes [#1883](https://github.com/BluMintInc/eslint-custom-rules/issues/1883)) ([7f19522](https://github.com/BluMintInc/eslint-custom-rules/commit/7f19522c66fbb0611ed5309c020e4fd75ea03109)), closes [#1354](https://github.com/BluMintInc/eslint-custom-rules/issues/1354) [#1886](https://github.com/BluMintInc/eslint-custom-rules/issues/1886) [#1887](https://github.com/BluMintInc/eslint-custom-rules/issues/1887) [#1885](https://github.com/BluMintInc/eslint-custom-rules/issues/1885)
* **no-redundant-annotation-assertion:** make every spelling of a relay a node in the inference graph (closes [#1888](https://github.com/BluMintInc/eslint-custom-rules/issues/1888)) ([14084e3](https://github.com/BluMintInc/eslint-custom-rules/commit/14084e38b9aa5d86fefa3832635c2fcac9aca9f1)), closes [pre-#1886](https://github.com/pre-/issues/1886) [#1883](https://github.com/BluMintInc/eslint-custom-rules/issues/1883)
* **no-unnecessary-verb-suffix:** treat an `as T` as the conformance signal it is (closes [#1885](https://github.com/BluMintInc/eslint-custom-rules/issues/1885)) ([eda1150](https://github.com/BluMintInc/eslint-custom-rules/commit/eda11509975f3f3c267d1715296ffa2967cc0a08)), closes [#1597](https://github.com/BluMintInc/eslint-custom-rules/issues/1597) [#1878](https://github.com/BluMintInc/eslint-custom-rules/issues/1878)

## [1.20.135](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.134...v1.20.135) (2026-08-08)


### Bug Fixes

* **enforce-assert-safe-object-key:** exempt compiler-bounded Record lookups (closes [#1875](https://github.com/BluMintInc/eslint-custom-rules/issues/1875)) ([4891036](https://github.com/BluMintInc/eslint-custom-rules/commit/4891036116c0224af282913a6c5badba417f6617))
* **enforce-fieldpath-syntax-in-docsetter:** fix method-shorthand fields instead of declining them (closes [#1876](https://github.com/BluMintInc/eslint-custom-rules/issues/1876)) ([c9cef8e](https://github.com/BluMintInc/eslint-custom-rules/commit/c9cef8ef76e035f7b05a5b044271e2bd4eedfb1c)), closes [#1870](https://github.com/BluMintInc/eslint-custom-rules/issues/1870)
* **enforce-id-capitalization:** exempt lone identifier tokens in array literals (closes [#1874](https://github.com/BluMintInc/eslint-custom-rules/issues/1874)) ([2ff4de7](https://github.com/BluMintInc/eslint-custom-rules/commit/2ff4de7a90aa5f7de00980404497f3c02f7e620e))
* **no-inline-component-prop:** see the holding object through an as-const (closes [#1864](https://github.com/BluMintInc/eslint-custom-rules/issues/1864)) ([08198cd](https://github.com/BluMintInc/eslint-custom-rules/commit/08198cd991d0fb89f746f1608b06f28a290fac91))
* **no-object-values-on-strings:** read the argument through an optional chain (closes [#1865](https://github.com/BluMintInc/eslint-custom-rules/issues/1865)) ([ce6b90b](https://github.com/BluMintInc/eslint-custom-rules/commit/ce6b90b200bcc8806d339d613279730e86a4889b))
* **no-passthrough-getters:** make the optional-chaining exemption reachable (closes [#1872](https://github.com/BluMintInc/eslint-custom-rules/issues/1872)) ([ede361d](https://github.com/BluMintInc/eslint-custom-rules/commit/ede361d206071f3c8b901eb3ac2ee30fe260124d)), closes [#1865](https://github.com/BluMintInc/eslint-custom-rules/issues/1865) [#1866](https://github.com/BluMintInc/eslint-custom-rules/issues/1866)
* **no-useless-usememo-primitives:** carry comments stranded by inlining (closes [#1877](https://github.com/BluMintInc/eslint-custom-rules/issues/1877)) ([3d48a3b](https://github.com/BluMintInc/eslint-custom-rules/commit/3d48a3bedcb161c50fc07351741d0ad23b4bb8a7))
* **no-usememo-for-pass-by-value:** carry comments stranded by inlining (closes [#1877](https://github.com/BluMintInc/eslint-custom-rules/issues/1877)) ([3482281](https://github.com/BluMintInc/eslint-custom-rules/commit/34822819f6d9f7001b5c4d8d02d2babcb43920f1))
* **parallelize-async-operations:** compile sideEffectPatterns through the shared helper (closes [#1873](https://github.com/BluMintInc/eslint-custom-rules/issues/1873)) ([f2affa0](https://github.com/BluMintInc/eslint-custom-rules/commit/f2affa0e21c8b1a621524fa03645497c5f1c8dc7))
* **prefer-map-over-conditional-dispatch:** judge a chained discriminant by the narrowing check (closes [#1867](https://github.com/BluMintInc/eslint-custom-rules/issues/1867)) ([5a9f843](https://github.com/BluMintInc/eslint-custom-rules/commit/5a9f843a859b4d6524ea7bafe38b1421943fdc8c))

## [1.20.134](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.133...v1.20.134) (2026-08-07)


### Bug Fixes

* **enforce-unique-cursor-headers:** keep null defaults out of the options deep-merge (closes [#1853](https://github.com/BluMintInc/eslint-custom-rules/issues/1853)) ([6f3c309](https://github.com/BluMintInc/eslint-custom-rules/commit/6f3c30982612dbd70b3877c7b3638c2fa731c0fb))

## [1.20.133](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.132...v1.20.133) (2026-08-07)


### Bug Fixes

* **parallelize-async-operations:** treat a fold accumulator await as a sequencing barrier (closes [#1851](https://github.com/BluMintInc/eslint-custom-rules/issues/1851)) ([aa096e3](https://github.com/BluMintInc/eslint-custom-rules/commit/aa096e3fdd5dff6c8330fe8285cb4da3fa3fea91))

## [1.20.132](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.131...v1.20.132) (2026-08-07)


### Bug Fixes

* **prefer-type-over-interface:** decline the fix for a default-exported interface (closes [#1850](https://github.com/BluMintInc/eslint-custom-rules/issues/1850)) ([6666df1](https://github.com/BluMintInc/eslint-custom-rules/commit/6666df1a3c5ad462bc19d38a825d1a092226bb92))

## [1.20.131](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.130...v1.20.131) (2026-08-07)


### Bug Fixes

* **enforce-dynamic-imports:** cover a package's subpaths from one ignoredLibraries entry (closes [#1845](https://github.com/BluMintInc/eslint-custom-rules/issues/1845)) ([b91138a](https://github.com/BluMintInc/eslint-custom-rules/commit/b91138a1962510ec7ccbe707fff593bbc9470ff6))
* **enforce-react-type-naming:** yield exported module-scope constants to global-const-style (closes [#1847](https://github.com/BluMintInc/eslint-custom-rules/issues/1847)) ([d5d0f98](https://github.com/BluMintInc/eslint-custom-rules/commit/d5d0f9853f998a6e2eec7bcb0e434ee35c13a91a))
* **enforce-react-type-naming:** yield module-scope constants to global-const-style (closes [#1846](https://github.com/BluMintInc/eslint-custom-rules/issues/1846)) ([235d9ba](https://github.com/BluMintInc/eslint-custom-rules/commit/235d9bae5e07d4cdd06c729efadd1f663eb230c3))

## [1.20.130](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.129...v1.20.130) (2026-08-07)


### Bug Fixes

* **enforce-dynamic-file-naming:** honor only the disable directives ESLint itself honors (closes [#1843](https://github.com/BluMintInc/eslint-custom-rules/issues/1843)) ([d6f06c8](https://github.com/BluMintInc/eslint-custom-rules/commit/d6f06c822be840449d6ae42b1f4031319f7a0dad))
* **enforce-global-constants:** name the reachable remedy when a memo literal closes over render scope (closes [#1841](https://github.com/BluMintInc/eslint-custom-rules/issues/1841)) ([244b6db](https://github.com/BluMintInc/eslint-custom-rules/commit/244b6db9165ce5c0688fd757d7a5dd5586480f2d))
* **enforce-querykey-ts:** resolve an aliased key through a type assertion (closes [#1840](https://github.com/BluMintInc/eslint-custom-rules/issues/1840)) ([7cdbfc3](https://github.com/BluMintInc/eslint-custom-rules/commit/7cdbfc3c27c59d727ac6aef7ee344e273243b457))
* **enforce-querykey-ts:** see through a type assertion at the report site (closes [#1842](https://github.com/BluMintInc/eslint-custom-rules/issues/1842)) ([3431506](https://github.com/BluMintInc/eslint-custom-rules/commit/3431506c119ca4e0c82a10d48440d4aa3b2e7015))

## [1.20.129](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.128...v1.20.129) (2026-08-07)


### Bug Fixes

* **no-circular-references:** resolve an alias through an optional chain (closes [#1838](https://github.com/BluMintInc/eslint-custom-rules/issues/1838)) ([6b8c9ff](https://github.com/BluMintInc/eslint-custom-rules/commit/6b8c9ff2b898449c42ee743a2fcef23597e2eb69))

## [1.20.128](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.127...v1.20.128) (2026-08-07)


### Bug Fixes

* **enforce-assert-safe-object-key:** read a written key through an optional chain (closes [#1830](https://github.com/BluMintInc/eslint-custom-rules/issues/1830)) ([3253ad0](https://github.com/BluMintInc/eslint-custom-rules/commit/3253ad010ac96a1bd838756f349fa35cce1b27ae))
* **enforce-querykey-ts:** resolve a key source through an optional chain (closes [#1832](https://github.com/BluMintInc/eslint-custom-rules/issues/1832)) ([4189582](https://github.com/BluMintInc/eslint-custom-rules/commit/4189582c41313e67a2e6f215ff1aae187d411c8d)), closes [#1714](https://github.com/BluMintInc/eslint-custom-rules/issues/1714) [#1803](https://github.com/BluMintInc/eslint-custom-rules/issues/1803)
* **no-hungarian:** treat Symbol as a domain glyph noun in suffix position (closes [#1835](https://github.com/BluMintInc/eslint-custom-rules/issues/1835)) ([37ad021](https://github.com/BluMintInc/eslint-custom-rules/commit/37ad021e06dc7206b469ed2dbf3618341b7c3e0b)), closes [#1277](https://github.com/BluMintInc/eslint-custom-rules/issues/1277)
* **no-misleading-boolean-prefixes:** classify a boolean-like expression through an optional chain (closes [#1829](https://github.com/BluMintInc/eslint-custom-rules/issues/1829)) ([5924d4f](https://github.com/BluMintInc/eslint-custom-rules/commit/5924d4f03d9b555ecc5c2334601036511d5af5fb))
* **no-passthrough-getters:** exempt a getter that widens visibility over its root (closes [#1834](https://github.com/BluMintInc/eslint-custom-rules/issues/1834)) ([eab8222](https://github.com/BluMintInc/eslint-custom-rules/commit/eab822211154f563322a69921a95b3bbd739e7dd)), closes [#private](https://github.com/BluMintInc/eslint-custom-rules/issues/private)
* **no-uuidv4-base62-as-key:** see the key expression through an optional-chained receiver (closes [#1831](https://github.com/BluMintInc/eslint-custom-rules/issues/1831)) ([3bdd566](https://github.com/BluMintInc/eslint-custom-rules/commit/3bdd566f4616ff32979bf3785be97be8729e8bb8))
* **prefer-global-router-state-key:** resolve a directly-passed key through transparent wrappers (closes [#1836](https://github.com/BluMintInc/eslint-custom-rules/issues/1836)) ([9ed4aba](https://github.com/BluMintInc/eslint-custom-rules/commit/9ed4abad93b066fe5e6e8e0771bdeb0ad9aaee6d)), closes [#1833](https://github.com/BluMintInc/eslint-custom-rules/issues/1833)
* **prefer-global-router-state-key:** resolve a key source through an optional chain (closes [#1833](https://github.com/BluMintInc/eslint-custom-rules/issues/1833)) ([80000bf](https://github.com/BluMintInc/eslint-custom-rules/commit/80000bf31aaf622c99dd377b8a0eed97c29888fd)), closes [#1832](https://github.com/BluMintInc/eslint-custom-rules/issues/1832) [#1714](https://github.com/BluMintInc/eslint-custom-rules/issues/1714)

## [1.20.127](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.126...v1.20.127) (2026-08-07)


### Bug Fixes

* **enforce-boolean-naming-prefixes:** read an optional-chained initializer as boolean (closes [#1828](https://github.com/BluMintInc/eslint-custom-rules/issues/1828)) ([00126bb](https://github.com/BluMintInc/eslint-custom-rules/commit/00126bba7f2c3ed976afc223ee9b0bdb6851d6e6))
* **enforce-firestore-doc-ref-generic:** resolve a typed collection through an optional link (closes [#1826](https://github.com/BluMintInc/eslint-custom-rules/issues/1826)) ([301cf37](https://github.com/BluMintInc/eslint-custom-rules/commit/301cf37e58b16686879dc5d769c571dd5dcaf6b3))
* **enforce-firestore-set-merge:** see a Firestore handle through an optional link (closes [#1827](https://github.com/BluMintInc/eslint-custom-rules/issues/1827)) ([0acc389](https://github.com/BluMintInc/eslint-custom-rules/commit/0acc389290692eb907998caba30939efacba4aa6))
* **fast-deep-equal-over-microdiff:** unwrap ChainExpression in the binary comparison arm (closes [#1825](https://github.com/BluMintInc/eslint-custom-rules/issues/1825)) ([b5eb171](https://github.com/BluMintInc/eslint-custom-rules/commit/b5eb1713ec1cd3bba1e00ec0b69d3080c68293ac))
* **no-direct-function-state:** read the setter argument through transparent wrappers (closes [#1824](https://github.com/BluMintInc/eslint-custom-rules/issues/1824)) ([db44d3d](https://github.com/BluMintInc/eslint-custom-rules/commit/db44d3d6c1d1b3ee9c5a673255ddcf92a667867d))

## [1.20.126](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.125...v1.20.126) (2026-08-06)


### Bug Fixes

* **ensure-pointer-events-none:** read every selector, name, value and offset through expression assertions (closes [#1814](https://github.com/BluMintInc/eslint-custom-rules/issues/1814)) ([09483b0](https://github.com/BluMintInc/eslint-custom-rules/commit/09483b0c881084e5bac3d1a2026f1d295424fc26))
* **global-const-style:** decline the rename when the derived name is not an identifier (closes [#1816](https://github.com/BluMintInc/eslint-custom-rules/issues/1816)) ([e9b8a5f](https://github.com/BluMintInc/eslint-custom-rules/commit/e9b8a5f42739b1f31abcb4ae3d6e595edfe3a113)), closes [#1313](https://github.com/BluMintInc/eslint-custom-rules/issues/1313) [#1811](https://github.com/BluMintInc/eslint-custom-rules/issues/1811) [#1813](https://github.com/BluMintInc/eslint-custom-rules/issues/1813)

## [1.20.125](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.124...v1.20.125) (2026-08-06)


### Bug Fixes

* **enforce-querykey-ts:** decline the fix when a key normalizes to nothing (closes [#1813](https://github.com/BluMintInc/eslint-custom-rules/issues/1813)) ([c079450](https://github.com/BluMintInc/eslint-custom-rules/commit/c079450978ed51be34bd94cb315230b678da33b1))
* **ensure-pointer-events-none:** decline the fix when an existing pointerEvents value is unreadable (closes [#1810](https://github.com/BluMintInc/eslint-custom-rules/issues/1810)) ([74c30f2](https://github.com/BluMintInc/eslint-custom-rules/commit/74c30f2bef0456bdadd601263f8aab0259e095cf))
* **prefer-global-router-state-key:** decline the fix when a key normalizes to nothing (closes [#1811](https://github.com/BluMintInc/eslint-custom-rules/issues/1811)) ([59636ff](https://github.com/BluMintInc/eslint-custom-rules/commit/59636ffdac32071d941784ccd2837fac278f7338))

## [1.20.124](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.123...v1.20.124) (2026-08-06)


### Bug Fixes

* **enforce-console-error:** treat a no-substitution template and an assertion-wrapped literal as a static severity (closes [#1801](https://github.com/BluMintInc/eslint-custom-rules/issues/1801)) ([362f50a](https://github.com/BluMintInc/eslint-custom-rules/commit/362f50ac71f0738864eb9f5178947d437130ea84))
* **enforce-mock-firestore:** treat expression assertions as transparent when resolving the jest.mock factory's object (closes [#1806](https://github.com/BluMintInc/eslint-custom-rules/issues/1806)) ([20ab708](https://github.com/BluMintInc/eslint-custom-rules/commit/20ab708ca7b9744ca5de93d09d431ff31cbffb21)), closes [#1798](https://github.com/BluMintInc/eslint-custom-rules/issues/1798)
* **enforce-querykey-ts:** gate the autofix on the key's value rather than its notation (closes [#1803](https://github.com/BluMintInc/eslint-custom-rules/issues/1803)) ([30f8e84](https://github.com/BluMintInc/eslint-custom-rules/commit/30f8e84a953485f136485036fa17a91e5c95f360))
* **ensure-pointer-events-none:** read a no-substitution template as the static string it denotes (closes [#1800](https://github.com/BluMintInc/eslint-custom-rules/issues/1800)) ([4738e36](https://github.com/BluMintInc/eslint-custom-rules/commit/4738e36a33904b68f3efe5b930088deb308b2c12))
* **logical-top-to-bottom-grouping:** treat expression assertions as transparent in every movability and dependency read (closes [#1807](https://github.com/BluMintInc/eslint-custom-rules/issues/1807)) ([a2f9c7a](https://github.com/BluMintInc/eslint-custom-rules/commit/a2f9c7aa63db1632fb67b428409cf5489bfcf09f))
* **no-complex-cloud-params:** track template-literal cloud imports and computed escape-hatch spellings (closes [#1799](https://github.com/BluMintInc/eslint-custom-rules/issues/1799)) ([defc936](https://github.com/BluMintInc/eslint-custom-rules/commit/defc9364719dd5c4c62b1a9dc9ceb02402187475))
* **no-conditional-literals-in-jsx:** recognise a no-substitution template on both operands (closes [#1802](https://github.com/BluMintInc/eslint-custom-rules/issues/1802)) ([effa77a](https://github.com/BluMintInc/eslint-custom-rules/commit/effa77ae072e16ed2277e8e0b8b8fd787ee15acd))
* **no-margin-properties:** treat expression assertions as transparent when classifying a style object (closes [#1805](https://github.com/BluMintInc/eslint-custom-rules/issues/1805)) ([c837097](https://github.com/BluMintInc/eslint-custom-rules/commit/c83709760275bfb64f2db503ef85faf80ccf2acb))
* **prefer-global-router-state-key:** gate the autofix on the key's value rather than its notation (closes [#1804](https://github.com/BluMintInc/eslint-custom-rules/issues/1804)) ([044a506](https://github.com/BluMintInc/eslint-custom-rules/commit/044a50649f9ff3a24bd9802d78db32185656610a))

## [1.20.123](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.122...v1.20.123) (2026-08-06)


### Bug Fixes

* **enforce-mock-firestore:** resolve the jest.mock factory's returned object in every body form (closes [#1798](https://github.com/BluMintInc/eslint-custom-rules/issues/1798)) ([257dca7](https://github.com/BluMintInc/eslint-custom-rules/commit/257dca7b666fb58fd6a7273c5f8c48f296672253))

## [1.20.122](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.121...v1.20.122) (2026-08-06)


### Bug Fixes

* **no-redundant-usecallback-wrapper:** exempt a suppression wrapper in every body spelling (closes [#1796](https://github.com/BluMintInc/eslint-custom-rules/issues/1796)) ([ac48a52](https://github.com/BluMintInc/eslint-custom-rules/commit/ac48a52499efdca5e1e1d34b8b3118ad2ee0c4b2))

## [1.20.121](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.120...v1.20.121) (2026-08-06)


### Bug Fixes

* **enforce-dynamic-firebase-imports:** remediate a concise-bodied async arrow (closes [#1790](https://github.com/BluMintInc/eslint-custom-rules/issues/1790)) ([b9eaf43](https://github.com/BluMintInc/eslint-custom-rules/commit/b9eaf435e54d8efefbf7d089a5091e5edac63ed3))
* **no-jsx-in-hooks:** report a concise arrow body that is itself a memoized JSX call (closes [#1792](https://github.com/BluMintInc/eslint-custom-rules/issues/1792)) ([7f4241f](https://github.com/BluMintInc/eslint-custom-rules/commit/7f4241f39c3bda4d37bd8d334d0950c95e354069))
* **no-redundant-usecallback-wrapper:** consult hookReturnObjects from the block-body arm (closes [#1793](https://github.com/BluMintInc/eslint-custom-rules/issues/1793)) ([8cb2848](https://github.com/BluMintInc/eslint-custom-rules/commit/8cb28480cea168e7e99a639d3daad8935aacc622))
* **no-undefined-null-passthrough:** detect the guard shapes in a block-bodied arrow (closes [#1794](https://github.com/BluMintInc/eslint-custom-rules/issues/1794)) ([2471f9b](https://github.com/BluMintInc/eslint-custom-rules/commit/2471f9b990e3e398cc82e816bfceb088bf620eb6))
* **prefer-usememo-over-useeffect-usestate:** recognise a block-bodied lazy initializer as state synchronization (closes [#1791](https://github.com/BluMintInc/eslint-custom-rules/issues/1791)) ([05508bc](https://github.com/BluMintInc/eslint-custom-rules/commit/05508bc284d879ea675e6343c4e981ff6849bbbf))
* **require-memo:** wrap arrow and function-expression components in memo (closes [#1789](https://github.com/BluMintInc/eslint-custom-rules/issues/1789)) ([531644b](https://github.com/BluMintInc/eslint-custom-rules/commit/531644b4dd68a7a2375b20df74bc1e6801ee1e9d))

## [1.20.120](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.119...v1.20.120) (2026-08-06)


### Bug Fixes

* **enforce-microdiff:** give the arrow spelling the rewrite its declaration twin carries (closes [#1784](https://github.com/BluMintInc/eslint-custom-rules/issues/1784)) ([e103f8a](https://github.com/BluMintInc/eslint-custom-rules/commit/e103f8a9745f65e4af9731a9f9a1f913829c10d9))
* **prefer-use-base62-id:** look through type-only wrappers to the ref name (closes [#1782](https://github.com/BluMintInc/eslint-custom-rules/issues/1782)) ([2893964](https://github.com/BluMintInc/eslint-custom-rules/commit/28939648061dcdcb85cbaa5bab6227385a2d49be))

## [1.20.119](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.118...v1.20.119) (2026-08-06)


### Bug Fixes

* **prefer-block-comments-for-declarations:** join comment runs, ignore trailing comments (closes [#1778](https://github.com/BluMintInc/eslint-custom-rules/issues/1778), closes [#1779](https://github.com/BluMintInc/eslint-custom-rules/issues/1779)) ([5b5fde7](https://github.com/BluMintInc/eslint-custom-rules/commit/5b5fde71502d1cc4a3a0605859b9bd3f61865a2f))
* **require-hooks-default-params:** resolve the options type in every statement container (closes [#1781](https://github.com/BluMintInc/eslint-custom-rules/issues/1781)) ([64af596](https://github.com/BluMintInc/eslint-custom-rules/commit/64af5966dcc26dd5c1aaa54c51fc5e4cb0b3e9a8)), closes [#1756](https://github.com/BluMintInc/eslint-custom-rules/issues/1756)

## [1.20.118](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.117...v1.20.118) (2026-08-06)


### Bug Fixes

* **enforce-callback-memo:** answer the anonymous component where it is met (closes [#1777](https://github.com/BluMintInc/eslint-custom-rules/issues/1777)) ([e95a4e7](https://github.com/BluMintInc/eslint-custom-rules/commit/e95a4e7ab2142c79c059771df4ab84cc7ae5dc8c))
* **enforce-firestore-set-merge:** resolve the base class lexically too (closes [#1773](https://github.com/BluMintInc/eslint-custom-rules/issues/1773)) ([afa3547](https://github.com/BluMintInc/eslint-custom-rules/commit/afa354707bc01081584f501070cf6b4e7c20b429)), closes [#1763](https://github.com/BluMintInc/eslint-custom-rules/issues/1763) [#1763](https://github.com/BluMintInc/eslint-custom-rules/issues/1763)
* **prefer-block-comments-for-declarations:** anchor the comment lookup on the export wrapper (closes [#1775](https://github.com/BluMintInc/eslint-custom-rules/issues/1775)) ([3da6f02](https://github.com/BluMintInc/eslint-custom-rules/commit/3da6f02de41119bb42ce06e91752abecd2996c33))
* **require-memo:** claim a component by lifetime, not by parent node type (closes [#1774](https://github.com/BluMintInc/eslint-custom-rules/issues/1774)) ([3635237](https://github.com/BluMintInc/eslint-custom-rules/commit/36352370b8340ca00fd459608573620be0b06ff4))
* **require-props-composition:** resolve names lexically in both directions (closes [#1776](https://github.com/BluMintInc/eslint-custom-rules/issues/1776)) ([cdd4b56](https://github.com/BluMintInc/eslint-custom-rules/commit/cdd4b56b6f5a17d294638bf744d7784167fe3ec1)), closes [#1316](https://github.com/BluMintInc/eslint-custom-rules/issues/1316) [#1335](https://github.com/BluMintInc/eslint-custom-rules/issues/1335)

## [1.20.117](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.116...v1.20.117) (2026-08-06)


### Bug Fixes

* **enforce-firestore-doc-ref-generic:** resolve the generic's type lexically (closes [#1761](https://github.com/BluMintInc/eslint-custom-rules/issues/1761)) ([86ecb19](https://github.com/BluMintInc/eslint-custom-rules/commit/86ecb1970b1e97f81d3a022cae8aa3bf79359689))
* **enforce-firestore-set-merge:** resolve the firestore() handle lexically (closes [#1763](https://github.com/BluMintInc/eslint-custom-rules/issues/1763)) ([61f1323](https://github.com/BluMintInc/eslint-custom-rules/commit/61f132350d86f27ce40e456a1ab4fb58bf22e8b7))
* **enforce-render-hits-memoization:** gate stability on the consumer, not scope type (closes [#1768](https://github.com/BluMintInc/eslint-custom-rules/issues/1768)) ([5d2b865](https://github.com/BluMintInc/eslint-custom-rules/commit/5d2b865a342a8445bb7e068644a7f7773f2718fc)), closes [#1767](https://github.com/BluMintInc/eslint-custom-rules/issues/1767)
* **enforce-transform-memoization:** gate stability on the consumer, not scope type (closes [#1770](https://github.com/BluMintInc/eslint-custom-rules/issues/1770)) ([fadc8ff](https://github.com/BluMintInc/eslint-custom-rules/commit/fadc8ffceb30cbd7d95946837ff82745dd286bcc)), closes [#1768](https://github.com/BluMintInc/eslint-custom-rules/issues/1768) [#1767](https://github.com/BluMintInc/eslint-custom-rules/issues/1767)
* **logical-top-to-bottom-grouping:** classify through the export wrapper (closes [#1762](https://github.com/BluMintInc/eslint-custom-rules/issues/1762)) ([7ea29ad](https://github.com/BluMintInc/eslint-custom-rules/commit/7ea29ad5ca770b8b6064469234f11c84b01fb238))
* **no-curly-brackets-around-commented-properties:** detect orphaned blocks in any statement list (closes [#1766](https://github.com/BluMintInc/eslint-custom-rules/issues/1766)) ([066dc3e](https://github.com/BluMintInc/eslint-custom-rules/commit/066dc3e3fd203fe8b41b040550c8586166c3bc47))
* **no-direct-function-state:** resolve function-type aliases lexically (closes [#1764](https://github.com/BluMintInc/eslint-custom-rules/issues/1764)) ([21d954a](https://github.com/BluMintInc/eslint-custom-rules/commit/21d954aac6d22c9b2e80c14eb4bdee86d3c05a53))
* **no-explicit-return-type:** resolve mutual recursion through the scope chain (closes [#1771](https://github.com/BluMintInc/eslint-custom-rules/issues/1771)) ([88e85e3](https://github.com/BluMintInc/eslint-custom-rules/commit/88e85e3d1b4a0f5e641e56c72c00f78edc69d1cc))
* **no-firestore-object-arrays:** resolve element type names in scope (closes [#1765](https://github.com/BluMintInc/eslint-custom-rules/issues/1765)) ([cedd8ed](https://github.com/BluMintInc/eslint-custom-rules/commit/cedd8edff6a4a3757551097424e424470061b72b))
* **no-inline-component-prop:** compare the definition's scope to the consumer's (closes [#1767](https://github.com/BluMintInc/eslint-custom-rules/issues/1767)) ([ef5f721](https://github.com/BluMintInc/eslint-custom-rules/commit/ef5f7211e3257926d7f541165a74d229c0a0e400))
* **prefer-spread-over-reassembly:** resolve local type declarations lexically (closes [#1769](https://github.com/BluMintInc/eslint-custom-rules/issues/1769)) ([008decb](https://github.com/BluMintInc/eslint-custom-rules/commit/008decb76d3d9759dd2016b5bcf11b90b1ac29fb)), closes [#1642](https://github.com/BluMintInc/eslint-custom-rules/issues/1642) [#1644](https://github.com/BluMintInc/eslint-custom-rules/issues/1644)
* **prevent-children-clobber:** resolve the props alias lexically (closes [#1760](https://github.com/BluMintInc/eslint-custom-rules/issues/1760)) ([d8818e0](https://github.com/BluMintInc/eslint-custom-rules/commit/d8818e01f9b68c2c87050178bca77779c16336de))

## [1.20.116](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.115...v1.20.116) (2026-08-05)


### Bug Fixes

* **enforce-firestore-doc-ref-generic:** detect namespaced reference types (closes [#1754](https://github.com/BluMintInc/eslint-custom-rules/issues/1754)) ([42b5449](https://github.com/BluMintInc/eslint-custom-rules/commit/42b54494770198f944e41127d0b42dd6151a6e3e))
* **extract-global-constants:** report nested helper functions (closes [#1755](https://github.com/BluMintInc/eslint-custom-rules/issues/1755)) ([9cc045e](https://github.com/BluMintInc/eslint-custom-rules/commit/9cc045e975f075b5da81f3cb53c817881d876dfa))
* **prefer-batch-operations:** resolve the setter declaration lexically (closes [#1759](https://github.com/BluMintInc/eslint-custom-rules/issues/1759)) ([f533b2f](https://github.com/BluMintInc/eslint-custom-rules/commit/f533b2f2a434fa1e71f534c27aafcc540e94df4f))
* **prefer-batch-operations:** stop flagging a lone set() in Promise.all (closes [#1757](https://github.com/BluMintInc/eslint-custom-rules/issues/1757)) ([46a513d](https://github.com/BluMintInc/eslint-custom-rules/commit/46a513dd4435199547e675da87aa5c7895a26337))
* **require-hooks-default-params:** resolve the options type lexically (closes [#1756](https://github.com/BluMintInc/eslint-custom-rules/issues/1756)) ([1377c74](https://github.com/BluMintInc/eslint-custom-rules/commit/1377c74aca9aa8be46bfcbfc8b0fe589cee11e71))
* **require-server-timestamp-for-firestore-dates:** unwrap non-null assertions (closes [#1758](https://github.com/BluMintInc/eslint-custom-rules/issues/1758)) ([c5523e0](https://github.com/BluMintInc/eslint-custom-rules/commit/c5523e095b34a65942e2c46eaa623777de16fa45))

## [1.20.115](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.114...v1.20.115) (2026-08-05)


### Bug Fixes

* **no-jsx-in-hooks:** detect React-qualified JSX return types (closes [#1753](https://github.com/BluMintInc/eslint-custom-rules/issues/1753)) ([728f09c](https://github.com/BluMintInc/eslint-custom-rules/commit/728f09c5c907d3f49dd852a220571e4c3627835c))

## [1.20.114](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.113...v1.20.114) (2026-08-05)


### Bug Fixes

* **enforce-serializable-params:** resolve namespaced names, interfaces and reference chains (closes [#1751](https://github.com/BluMintInc/eslint-custom-rules/issues/1751)) ([748c657](https://github.com/BluMintInc/eslint-custom-rules/commit/748c657ffea05975b3e77d08e213ac2fd14ef4e3)), closes [#1750](https://github.com/BluMintInc/eslint-custom-rules/issues/1750)

## [1.20.113](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.112...v1.20.113) (2026-08-05)


### Bug Fixes

* **enforce-serializable-params:** report a non-JSON-safe type used directly as the request type parameter (closes [#1750](https://github.com/BluMintInc/eslint-custom-rules/issues/1750)) ([5797add](https://github.com/BluMintInc/eslint-custom-rules/commit/5797add8c3877e491023fec3780d3c66b5e03cd5))

## [1.20.112](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.111...v1.20.112) (2026-08-05)


### Bug Fixes

* **enforce-css-media-queries:** exempt breakpoints that reach no style (closes [#1746](https://github.com/BluMintInc/eslint-custom-rules/issues/1746)) ([a0e4724](https://github.com/BluMintInc/eslint-custom-rules/commit/a0e4724febf87e1c7d5cb073a1b1ab5623c63c5b)), closes [#1675](https://github.com/BluMintInc/eslint-custom-rules/issues/1675)
* **no-uuidv4-base62-as-key:** recognize the helper by module basename (closes [#1744](https://github.com/BluMintInc/eslint-custom-rules/issues/1744)) ([c49ad30](https://github.com/BluMintInc/eslint-custom-rules/commit/c49ad30f6059bbcfa085e91880d7a7813fa834d4))
* **prefer-clone-deep:** classify a nested literal by all its sources (closes [#1745](https://github.com/BluMintInc/eslint-custom-rules/issues/1745)) ([61e20af](https://github.com/BluMintInc/eslint-custom-rules/commit/61e20afae853643e4a07ddfa3f2f49c1646812b2)), closes [#1396](https://github.com/BluMintInc/eslint-custom-rules/issues/1396) [#1371](https://github.com/BluMintInc/eslint-custom-rules/issues/1371) [#1364](https://github.com/BluMintInc/eslint-custom-rules/issues/1364)

## [1.20.111](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.110...v1.20.111) (2026-08-05)


### Bug Fixes

* **enforce-global-constants:** hoist below a shebang, not above it (closes [#1739](https://github.com/BluMintInc/eslint-custom-rules/issues/1739)) ([c795a8e](https://github.com/BluMintInc/eslint-custom-rules/commit/c795a8e056ef8e742a13e131ddc421f0f4be7ec2))
* **logical-top-to-bottom-grouping:** keep a shebang at character 0 when reordering (closes [#1738](https://github.com/BluMintInc/eslint-custom-rules/issues/1738)) ([db4a127](https://github.com/BluMintInc/eslint-custom-rules/commit/db4a127dd2a36f258484880c5ec55479f6610f26))
* **vertically-group-related-functions:** keep a shebang at character 0 when reordering (closes [#1737](https://github.com/BluMintInc/eslint-custom-rules/issues/1737)) ([bbf7ad2](https://github.com/BluMintInc/eslint-custom-rules/commit/bbf7ad2d8a68004d08f8bf7bd979b134701f7412))

## [1.20.110](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.109...v1.20.110) (2026-08-05)


### Bug Fixes

* **enforce-firestore-doc-ref-generic:** drop the unearned requiresTypeChecking declaration (closes [#1730](https://github.com/BluMintInc/eslint-custom-rules/issues/1730)) ([8bcac75](https://github.com/BluMintInc/eslint-custom-rules/commit/8bcac75ac5015741d371b3576de829189cdd4e2a))
* **enforce-memoize-async:** decline to decorate a method of a class expression (closes [#1735](https://github.com/BluMintInc/eslint-custom-rules/issues/1735)) ([79a65ec](https://github.com/BluMintInc/eslint-custom-rules/commit/79a65ecc5cbd9beae0b2ea5875746502584f13fa))
* **no-redundant-usecallback-wrapper:** report provably memoized wrappers under default options (closes [#1729](https://github.com/BluMintInc/eslint-custom-rules/issues/1729)) ([fca3b2e](https://github.com/BluMintInc/eslint-custom-rules/commit/fca3b2e7081cfbf0a07491946f11085a756ae2a7))
* **prefer-fragment-component:** declare the disabled severity it actually ships (closes [#1736](https://github.com/BluMintInc/eslint-custom-rules/issues/1736)) ([17d2a58](https://github.com/BluMintInc/eslint-custom-rules/commit/17d2a5823514ba971f7e1467321b96c42bd06a8f))

## [1.20.109](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.108...v1.20.109) (2026-08-05)


### Bug Fixes

* **firestore-transaction-reads-before-writes:** resolve a call-wrapped computed key (closes [#1728](https://github.com/BluMintInc/eslint-custom-rules/issues/1728)) ([6e70404](https://github.com/BluMintInc/eslint-custom-rules/commit/6e704040fbb4ab005fe43414ac5282e7513c591e))
* **no-redundant-usecallback-wrapper:** see the useLatestCallback spelling (closes [#1726](https://github.com/BluMintInc/eslint-custom-rules/issues/1726)) ([4ed4935](https://github.com/BluMintInc/eslint-custom-rules/commit/4ed4935bfcc301240a2cc6bf169edf67d97eb072))
* **require-server-timestamp-for-firestore-dates:** look through cast wrappers (closes [#1727](https://github.com/BluMintInc/eslint-custom-rules/issues/1727)) ([e47c239](https://github.com/BluMintInc/eslint-custom-rules/commit/e47c239946de71843b4dd36029fe57795599c59c))

## [1.20.108](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.107...v1.20.108) (2026-08-05)


### Bug Fixes

* **parallelize-loop-awaits:** resolve write locality by scope, not by name (closes [#1725](https://github.com/BluMintInc/eslint-custom-rules/issues/1725)) ([3e856b4](https://github.com/BluMintInc/eslint-custom-rules/commit/3e856b4c9bcf6e310bf3e71ec296f717a4264f13)), closes [#1724](https://github.com/BluMintInc/eslint-custom-rules/issues/1724) [#1724](https://github.com/BluMintInc/eslint-custom-rules/issues/1724) [#1723](https://github.com/BluMintInc/eslint-custom-rules/issues/1723) [pre-#1724](https://github.com/pre-/issues/1724) [#1724](https://github.com/BluMintInc/eslint-custom-rules/issues/1724)

## [1.20.107](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.106...v1.20.107) (2026-08-05)


### Bug Fixes

* **parallelize-async-operations:** treat a callback's write to an outer binding as a dependency (closes [#1723](https://github.com/BluMintInc/eslint-custom-rules/issues/1723)) ([6eb63d3](https://github.com/BluMintInc/eslint-custom-rules/commit/6eb63d369cb684f2ce14c1f2dd6ddec797d75a32)), closes [#10](https://github.com/BluMintInc/eslint-custom-rules/issues/10)
* **parallelize-loop-awaits:** see a callback's write to an outer binding (closes [#1724](https://github.com/BluMintInc/eslint-custom-rules/issues/1724)) ([b46f061](https://github.com/BluMintInc/eslint-custom-rules/commit/b46f0613007288a2c0cb545d8a77c7a280603db9)), closes [#1723](https://github.com/BluMintInc/eslint-custom-rules/issues/1723)

## [1.20.106](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.105...v1.20.106) (2026-08-05)


### Bug Fixes

* **consistent-callback-naming:** stop renaming destructuring keys and reserved words (closes [#1719](https://github.com/BluMintInc/eslint-custom-rules/issues/1719)) ([a2b824f](https://github.com/BluMintInc/eslint-custom-rules/commit/a2b824f5ae0b4c95de4f0f960026ee6c3021c377))
* **no-entire-object-hook-deps:** keep the whole object when the member is a method (closes [#1721](https://github.com/BluMintInc/eslint-custom-rules/issues/1721)) ([96e4613](https://github.com/BluMintInc/eslint-custom-rules/commit/96e46138c3ad4e484feade2a8c0e46c99f1b1797)), closes [#391](https://github.com/BluMintInc/eslint-custom-rules/issues/391)
* **prefer-nullish-coalescing-boolean-props:** keep the parens ?? requires (closes [#1720](https://github.com/BluMintInc/eslint-custom-rules/issues/1720)) ([743d9e6](https://github.com/BluMintInc/eslint-custom-rules/commit/743d9e6610a2987dc31e90ba1dfbd9f7a6c01558))

## [1.20.105](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.104...v1.20.105) (2026-08-04)


### Bug Fixes

* **enforce-dynamic-firebase-imports:** exempt never-bundled files (closes [#1715](https://github.com/BluMintInc/eslint-custom-rules/issues/1715)) ([81017db](https://github.com/BluMintInc/eslint-custom-rules/commit/81017dba9830b1090f0740d3184d59468a5ff881))
* **enforce-dynamic-firebase-imports:** relocate the dynamic import to its call site (closes [#1716](https://github.com/BluMintInc/eslint-custom-rules/issues/1716)) ([6024f18](https://github.com/BluMintInc/eslint-custom-rules/commit/6024f18263420e1e16a0ec37ad98c44e77770e58))
* **enforce-empty-object-check:** exempt constructable types, not just callable ones (closes [#1718](https://github.com/BluMintInc/eslint-custom-rules/issues/1718)) ([34f6c75](https://github.com/BluMintInc/eslint-custom-rules/commit/34f6c754b9473d30f7980e015c303daee81ae849))
* **memoize-root-level-hocs:** require component evidence, not just a with[A-Z] name (closes [#1717](https://github.com/BluMintInc/eslint-custom-rules/issues/1717)) ([a39838f](https://github.com/BluMintInc/eslint-custom-rules/commit/a39838f20770d6c2d687859623d7384ff3b993fc))

## [1.20.104](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.103...v1.20.104) (2026-08-04)


### Bug Fixes

* **enforce-assert-safe-object-key:** honour the declaration site as a numeric proof (closes [#1713](https://github.com/BluMintInc/eslint-custom-rules/issues/1713)) ([e4e8b89](https://github.com/BluMintInc/eslint-custom-rules/commit/e4e8b890ff5b05d577509e5f2bd3680b20603d93)), closes [#1554](https://github.com/BluMintInc/eslint-custom-rules/issues/1554)
* **enforce-assert-safe-object-key:** read computed keys through assertion and await wrappers (closes [#1712](https://github.com/BluMintInc/eslint-custom-rules/issues/1712)) ([6b26409](https://github.com/BluMintInc/eslint-custom-rules/commit/6b264092e3cf415788c38567c2b91d1c88286802))
* **enforce-firestore-set-merge:** exempt Realtime Database receivers from the batchManager name match (closes [#1710](https://github.com/BluMintInc/eslint-custom-rules/issues/1710)) ([891a140](https://github.com/BluMintInc/eslint-custom-rules/commit/891a14099cb645e0eb6d9650dac67946f1ce16f6))
* **enforce-querykey-ts:** accept the key shapes prefer-global-router-state-key blesses (closes [#1714](https://github.com/BluMintInc/eslint-custom-rules/issues/1714)) ([6a84255](https://github.com/BluMintInc/eslint-custom-rules/commit/6a8425526444f270ea02c6d06b408fe7bc59dcf4))
* **use-latest-callback:** exempt callbacks whose identity another hook keys on (closes [#1711](https://github.com/BluMintInc/eslint-custom-rules/issues/1711)) ([3a5b36f](https://github.com/BluMintInc/eslint-custom-rules/commit/3a5b36f578fc174f02f4b8472cf2270b5634e5bd))

## [1.20.103](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.102...v1.20.103) (2026-08-04)


### Bug Fixes

* **require-dynamic-firebase-imports:** drop the unreachable autofix declaration (closes [#1708](https://github.com/BluMintInc/eslint-custom-rules/issues/1708)) ([32bb45d](https://github.com/BluMintInc/eslint-custom-rules/commit/32bb45d3fe6db33968df5b7f0a293968f9098661))
* **require-props-composition:** credit composition with a member of the child's props union (closes [#1709](https://github.com/BluMintInc/eslint-custom-rules/issues/1709)) ([784e5ad](https://github.com/BluMintInc/eslint-custom-rules/commit/784e5ad4df8165e619ebcec21ee6bce60f2c4009))

## [1.20.102](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.101...v1.20.102) (2026-08-04)


### Bug Fixes

* **ensure-pointer-events-none:** extend the hit-slop carve-out to the inset shorthand (closes [#1707](https://github.com/BluMintInc/eslint-custom-rules/issues/1707)) ([502c413](https://github.com/BluMintInc/eslint-custom-rules/commit/502c4139edd97ec394883bce42ce3da4f095a8c0))

## [1.20.101](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.100...v1.20.101) (2026-08-04)


### Bug Fixes

* **enforce-centralized-mock-firestore:** exempt the centralized module and exported declarations (closes [#1703](https://github.com/BluMintInc/eslint-custom-rules/issues/1703)) ([bfe533c](https://github.com/BluMintInc/eslint-custom-rules/commit/bfe533c26ba4a38f1cc53df31e25c41cf6c4adb5)), closes [1671-#1673](https://github.com/1671-/issues/1673) [#1387](https://github.com/BluMintInc/eslint-custom-rules/issues/1387)
* **enforce-identifiable-firestore-type:** stay silent when the alias chain leaves the module (closes [#1705](https://github.com/BluMintInc/eslint-custom-rules/issues/1705)) ([b0d9c9b](https://github.com/BluMintInc/eslint-custom-rules/commit/b0d9c9b600fd3e1d2216789b2274cdb22f33b1e9))
* **enforce-react-type-naming:** withhold the rename for every exported declaration (closes [#1701](https://github.com/BluMintInc/eslint-custom-rules/issues/1701)) ([3b0c47b](https://github.com/BluMintInc/eslint-custom-rules/commit/3b0c47b58af3cb82943bc5147a2973c7ff62befe))
* **no-unnecessary-destructuring-rename:** withhold the fix on an exported pattern (closes [#1702](https://github.com/BluMintInc/eslint-custom-rules/issues/1702)) ([661d523](https://github.com/BluMintInc/eslint-custom-rules/commit/661d523ea47c8519cf71c1c5ee4742cf69dd2b8b))
* **semantic-function-prefixes:** exempt the compound lexemes checkIn and checkOut (closes [#1704](https://github.com/BluMintInc/eslint-custom-rules/issues/1704)) ([48024ff](https://github.com/BluMintInc/eslint-custom-rules/commit/48024ff0952f4fd02e7453af05937fcdee62cc01))

## [1.20.100](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.99...v1.20.100) (2026-08-04)


### Bug Fixes

* **global-const-style:** withhold the rename for every exported declaration (closes [#1700](https://github.com/BluMintInc/eslint-custom-rules/issues/1700)) ([e2909cc](https://github.com/BluMintInc/eslint-custom-rules/commit/e2909ccc367b74a8f649e1e77d7706078f20ffe5))

## [1.20.99](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.98...v1.20.99) (2026-08-04)


### Bug Fixes

* **enforce-memoize-async:** decline the decorator inside a jest.mock factory (closes [#1697](https://github.com/BluMintInc/eslint-custom-rules/issues/1697)) ([2194a06](https://github.com/BluMintInc/eslint-custom-rules/commit/2194a069e99e87a31b6765998c9c8de24101a997))
* **no-redundant-usecallback-wrapper:** require a single-statement body before collapsing (closes [#1699](https://github.com/BluMintInc/eslint-custom-rules/issues/1699)) ([700511e](https://github.com/BluMintInc/eslint-custom-rules/commit/700511ec3bd583ab57d0f2c8e9d81ca16f4cb0e3))
* **no-redundant-usecallback-wrapper:** treat event suppression as disqualifying, not skippable (closes [#1696](https://github.com/BluMintInc/eslint-custom-rules/issues/1696)) ([181282d](https://github.com/BluMintInc/eslint-custom-rules/commit/181282dcf67bbacde7c7dc9a5c79470fa433d8f4))

## [1.20.98](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.97...v1.20.98) (2026-08-04)


### Bug Fixes

* **enforce-centralized-mock-firestore:** place the import by anchor instead of rewriting the Program (closes [#1695](https://github.com/BluMintInc/eslint-custom-rules/issues/1695)) ([cace94d](https://github.com/BluMintInc/eslint-custom-rules/commit/cace94d60102796e0c9d33ec204b47bc7945375b))
* **enforce-centralized-mock-firestore:** retire declarations by range, not by line index (closes [#1694](https://github.com/BluMintInc/eslint-custom-rules/issues/1694)) ([83af9c5](https://github.com/BluMintInc/eslint-custom-rules/commit/83af9c5245de68f7c63cdfec075a7e5501b651ab))
* **enforce-microdiff:** rewrite the comparison in place instead of the whole body (closes [#1693](https://github.com/BluMintInc/eslint-custom-rules/issues/1693)) ([bbdc4d6](https://github.com/BluMintInc/eslint-custom-rules/commit/bbdc4d683d3d47d7ea0e9b1ccdc4e595c751c7a6))

## [1.20.97](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.96...v1.20.97) (2026-08-04)


### Bug Fixes

* **enforce-boolean-naming-prefixes:** accept a digit or $ fused onto an UPPER_SNAKE prefix (closes [#1690](https://github.com/BluMintInc/eslint-custom-rules/issues/1690)) ([bb14743](https://github.com/BluMintInc/eslint-custom-rules/commit/bb147438d0012f865d6845c4bcdc424094697c47))
* **enforce-boolean-naming-prefixes:** infer a callee's return from its body when the annotation is absent (closes [#1691](https://github.com/BluMintInc/eslint-custom-rules/issues/1691)) ([2239c23](https://github.com/BluMintInc/eslint-custom-rules/commit/2239c23a7e8287b15c9baa035883e6086597c260))
* **enforce-positive-naming:** decline when a function's returns yield no verdict (closes [#1692](https://github.com/BluMintInc/eslint-custom-rules/issues/1692)) ([0ed6f2a](https://github.com/BluMintInc/eslint-custom-rules/commit/0ed6f2a377a00d82f3534e3e28e00b5424976c5e))

## [1.20.96](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.95...v1.20.96) (2026-08-04)


### Bug Fixes

* **enforce-css-media-queries:** exempt capability queries and report once per usage (closes [#1675](https://github.com/BluMintInc/eslint-custom-rules/issues/1675)) ([274bc25](https://github.com/BluMintInc/eslint-custom-rules/commit/274bc2500a69b7c73fdd61633b1cf38be797b351))
* **enforce-exported-function-types:** read destructured props params and resolve memo(Identifier) components (closes [#1686](https://github.com/BluMintInc/eslint-custom-rules/issues/1686)) ([fb92fb9](https://github.com/BluMintInc/eslint-custom-rules/commit/fb92fb9c1e5bcbe0f0c6483f46514540c7e250a6))
* **enforce-exported-function-types:** see arrow and memo/forwardRef component shapes, autofix the type export (closes [#1677](https://github.com/BluMintInc/eslint-custom-rules/issues/1677)) ([aadb608](https://github.com/BluMintInc/eslint-custom-rules/commit/aadb608fe746e025c3cee80c5079662ad379550a))
* **enforce-firestore-doc-ref-generic:** resolve type-alias generics beside interfaces (closes [#1678](https://github.com/BluMintInc/eslint-custom-rules/issues/1678)) ([c7eeee0](https://github.com/BluMintInc/eslint-custom-rules/commit/c7eeee0f55b5d171938944a95fce5d726516e5ee))
* **enforce-mui-rounded-icons:** rename the binding with the path it retargets (closes [#1674](https://github.com/BluMintInc/eslint-custom-rules/issues/1674)) ([9202ce9](https://github.com/BluMintInc/eslint-custom-rules/commit/9202ce95f2af3992490bab365473f48f009cc8b1))
* **generic-starts-with-t:** exempt module augmentations where the name is upstream-owned (closes [#1676](https://github.com/BluMintInc/eslint-custom-rules/issues/1676)) ([592d69a](https://github.com/BluMintInc/eslint-custom-rules/commit/592d69a01f56e58fe5a584716d902e9a1463d51e))
* **global-const-style:** exempt function-expression components and unwrap satisfies/non-null wrappers (closes [#1681](https://github.com/BluMintInc/eslint-custom-rules/issues/1681)) ([3fe9cae](https://github.com/BluMintInc/eslint-custom-rules/commit/3fe9caee91dd71777c620464f5d0fc627ac6bdd9))
* **no-always-true-false-conditions:** resolve any const object in optional chains and climb assertion wrappers (closes [#1682](https://github.com/BluMintInc/eslint-custom-rules/issues/1682)) ([aa87199](https://github.com/BluMintInc/eslint-custom-rules/commit/aa87199fd5fb9177e1d67497c892d2f961fa11d1))
* **no-unnecessary-verb-suffix:** read intersection-alias contracts constituent by constituent (closes [#1679](https://github.com/BluMintInc/eslint-custom-rules/issues/1679)) ([19dca8c](https://github.com/BluMintInc/eslint-custom-rules/commit/19dca8c46ed7630f90b86c1bbb8f3790733a96f7))
* **parallelize-loop-awaits:** cover do-while, dedupe nested-loop reports, stop property keys vetoing (closes [#1688](https://github.com/BluMintInc/eslint-custom-rules/issues/1688)) ([4291d9a](https://github.com/BluMintInc/eslint-custom-rules/commit/4291d9a4910457dba079772bf0af5fac67a7d2be))
* **parallelize-loop-awaits:** exempt test files, condition-coupled loops, and for-await-of (closes [#1687](https://github.com/BluMintInc/eslint-custom-rules/issues/1687)) ([85f590d](https://github.com/BluMintInc/eslint-custom-rules/commit/85f590dcc33ff3f7b033c7accd0d5d9636c50942))
* **prefer-getter-over-parameterless-method:** skip methods bound by a heritage clause (closes [#1684](https://github.com/BluMintInc/eslint-custom-rules/issues/1684)) ([f408e25](https://github.com/BluMintInc/eslint-custom-rules/commit/f408e251f80c94346941074b9133283fc6362d16))
* **prefer-type-alias-over-typeof-constant:** exempt only canonical alias derivations, not nested use sites (closes [#1680](https://github.com/BluMintInc/eslint-custom-rules/issues/1680)) ([5e6d7e2](https://github.com/BluMintInc/eslint-custom-rules/commit/5e6d7e20bd2aab9d008368c0cb738cbc4da3ccda))
* **require-https-error:** name the codebase-owned HttpsError module, not a placeholder package (closes [#1685](https://github.com/BluMintInc/eslint-custom-rules/issues/1685)) ([4aae3dd](https://github.com/BluMintInc/eslint-custom-rules/commit/4aae3ddffc01c1d9e0d02ebb153094350e1cabc5))
* **use-custom-link:** exempt the wrapper's implementation files (closes [#1673](https://github.com/BluMintInc/eslint-custom-rules/issues/1673)) ([8f19dbd](https://github.com/BluMintInc/eslint-custom-rules/commit/8f19dbd76ee3d8688df282c803aad2fdf0e51e0d))
* **use-custom-memo:** exempt the wrapper module the rule points at (closes [#1671](https://github.com/BluMintInc/eslint-custom-rules/issues/1671)) ([3fd5e94](https://github.com/BluMintInc/eslint-custom-rules/commit/3fd5e945ccb4f1a9dab9c1ecb55953b949beef22))
* **use-custom-router:** exempt the wrapper module the rule points at (closes [#1672](https://github.com/BluMintInc/eslint-custom-rules/issues/1672)) ([7732235](https://github.com/BluMintInc/eslint-custom-rules/commit/7732235649f129940e38929b8da7340e84875c42))

## [1.20.95](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.94...v1.20.95) (2026-08-03)


### Bug Fixes

* **no-redundant-param-types:** unbind the import two annotations share (closes [#1670](https://github.com/BluMintInc/eslint-custom-rules/issues/1670)) ([752f0a0](https://github.com/BluMintInc/eslint-custom-rules/commit/752f0a0fdb91f94453240ee1024905b7d56d80f8))

## [1.20.94](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.93...v1.20.94) (2026-08-03)


### Bug Fixes

* **enforce-date-ttime:** unbind the import two arguments share (closes [#1669](https://github.com/BluMintInc/eslint-custom-rules/issues/1669)) ([1aed03a](https://github.com/BluMintInc/eslint-custom-rules/commit/1aed03a381df60196c45917bb6d62c78cbd08082))
* **no-redundant-annotation-assertion:** unbind the import two annotations share (closes [#1668](https://github.com/BluMintInc/eslint-custom-rules/issues/1668)) ([232deb9](https://github.com/BluMintInc/eslint-custom-rules/commit/232deb9d0876c5fc4608e3c2c9f47dd9d6c55dda))

## [1.20.93](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.92...v1.20.93) (2026-08-03)


### Bug Fixes

* **enforce-date-ttime:** keep the alias it rewrites away (closes [#1667](https://github.com/BluMintInc/eslint-custom-rules/issues/1667)) ([f9d9bd4](https://github.com/BluMintInc/eslint-custom-rules/commit/f9d9bd4c322ede149344e1d3df07f6d8ccade492)), closes [#1653](https://github.com/BluMintInc/eslint-custom-rules/issues/1653) [#1654](https://github.com/BluMintInc/eslint-custom-rules/issues/1654) [#1663](https://github.com/BluMintInc/eslint-custom-rules/issues/1663)
* **no-redundant-annotation-assertion:** keep the type its annotation named (closes [#1666](https://github.com/BluMintInc/eslint-custom-rules/issues/1666)) ([6c2740f](https://github.com/BluMintInc/eslint-custom-rules/commit/6c2740f9140b124a4de8dcb031492eccbd84f92f)), closes [#1653](https://github.com/BluMintInc/eslint-custom-rules/issues/1653) [#1654](https://github.com/BluMintInc/eslint-custom-rules/issues/1654)

## [1.20.92](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.91...v1.20.92) (2026-08-03)


### Bug Fixes

* **prefer-map-over-conditional-dispatch:** emit computed keys for resolved case tests (closes [#1663](https://github.com/BluMintInc/eslint-custom-rules/issues/1663)) ([42e5571](https://github.com/BluMintInc/eslint-custom-rules/commit/42e5571ce5d8e52b0b9c67222dfa940a75ca3d7e))
* **prefer-use-deep-compare-memo:** convert every call site in one edit (closes [#1662](https://github.com/BluMintInc/eslint-custom-rules/issues/1662)) ([0273be3](https://github.com/BluMintInc/eslint-custom-rules/commit/0273be3eaec54cdf0bd7deb88da598ce0e318bee))

## [1.20.91](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.90...v1.20.91) (2026-08-03)


### Bug Fixes

* **prefer-use-deep-compare-memo:** unbind the orphaned useMemo import (closes [#1661](https://github.com/BluMintInc/eslint-custom-rules/issues/1661)) ([529e560](https://github.com/BluMintInc/eslint-custom-rules/commit/529e560e990a18a12e5e14a87651175e8a7cc240))

## [1.20.90](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.89...v1.20.90) (2026-08-03)


### Bug Fixes

* **enforce-assert-safe-object-key:** decline the fix inside a jest mock factory (closes [#1659](https://github.com/BluMintInc/eslint-custom-rules/issues/1659)) ([8c1d35f](https://github.com/BluMintInc/eslint-custom-rules/commit/8c1d35f6b02237ea0f193c450d046da16e36396d))
* **prefer-fragment-component:** decline the fix inside a jest mock factory (closes [#1660](https://github.com/BluMintInc/eslint-custom-rules/issues/1660)) ([56c34ab](https://github.com/BluMintInc/eslint-custom-rules/commit/56c34ab47ec53036dacb85f69b46e16499426496))

## [1.20.89](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.88...v1.20.89) (2026-08-03)


### Bug Fixes

* **memo-compare-deeply-complex-props:** treat a primitive-backed intersection as primitive, not complex (closes [#1656](https://github.com/BluMintInc/eslint-custom-rules/issues/1656)) ([305db7d](https://github.com/BluMintInc/eslint-custom-rules/commit/305db7de4dcedf55fcc4e8de5388dbb26c6aa063))
* **no-explicit-return-type:** unbind an import when the annotations jointly keeping it alive are all stripped (closes [#1654](https://github.com/BluMintInc/eslint-custom-rules/issues/1654)) ([b39f973](https://github.com/BluMintInc/eslint-custom-rules/commit/b39f973951d111b76bcc4f0f55bb7277055ed61c))
* **no-redundant-param-types:** remove the type imports a stripped parameter annotation was the sole consumer of (closes [#1653](https://github.com/BluMintInc/eslint-custom-rules/issues/1653)) ([37ab4c9](https://github.com/BluMintInc/eslint-custom-rules/commit/37ab4c9b1f8c95c807e5e84878808802d9f8c753))
* **no-type-assertion-returns:** exempt type assertions in JSX spread attributes (closes [#1655](https://github.com/BluMintInc/eslint-custom-rules/issues/1655)) ([23c2b07](https://github.com/BluMintInc/eslint-custom-rules/commit/23c2b0777883a8280543e624c41edf9414ca8e2c))

## [1.20.88](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.87...v1.20.88) (2026-08-03)


### Bug Fixes

* **use-latest-callback:** decline the fix when dropping the deps array orphans a local binding (closes [#1652](https://github.com/BluMintInc/eslint-custom-rules/issues/1652)) ([600b64b](https://github.com/BluMintInc/eslint-custom-rules/commit/600b64b14a658094c3e672192f245bd58b94b09b))

## [1.20.87](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.86...v1.20.87) (2026-08-03)


### Bug Fixes

* **enforce-assert-safe-object-key:** keep the autofix's added import below the file prologue ([#1648](https://github.com/BluMintInc/eslint-custom-rules/issues/1648)) ([8943233](https://github.com/BluMintInc/eslint-custom-rules/commit/89432339093d8d85ab825ac2586b4fdc20102b66))
* **enforce-memoize-async:** keep the autofix's added import below the file prologue ([#1648](https://github.com/BluMintInc/eslint-custom-rules/issues/1648)) ([d3cfed9](https://github.com/BluMintInc/eslint-custom-rules/commit/d3cfed920d355ee8f4df21f66f19bbef597200cf))
* **enforce-memoize-getters:** keep the autofix's added import below the file prologue ([#1648](https://github.com/BluMintInc/eslint-custom-rules/issues/1648)) ([9e1b0bb](https://github.com/BluMintInc/eslint-custom-rules/commit/9e1b0bbdfaa7ed6213b9505875dd392b523e4c78))
* **enforce-microdiff:** keep the autofix's added import below the file prologue ([#1648](https://github.com/BluMintInc/eslint-custom-rules/issues/1648)) ([cca3f0a](https://github.com/BluMintInc/eslint-custom-rules/commit/cca3f0a33b4fd2a6e30e52297c31fb4c4c0bc9f5))
* **enforce-querykey-ts:** keep the autofix's added import below the file prologue ([#1648](https://github.com/BluMintInc/eslint-custom-rules/issues/1648)) ([113f0e2](https://github.com/BluMintInc/eslint-custom-rules/commit/113f0e22bab43563289840de844d79bdc83b4a8f))
* **enforce-safe-stringify:** keep the suggestion's added import below the file prologue ([#1648](https://github.com/BluMintInc/eslint-custom-rules/issues/1648)) ([f1d0315](https://github.com/BluMintInc/eslint-custom-rules/commit/f1d03154e060480e7ce115e49f9a9af8cc0b810e))
* **enforce-snapshot-state-narrowing:** keep the suggestion's added import below the file prologue ([#1648](https://github.com/BluMintInc/eslint-custom-rules/issues/1648)) ([9140664](https://github.com/BluMintInc/eslint-custom-rules/commit/914066491a428215d6741ead58b81a75340e0a28))
* **enforce-stable-hash-spread-props:** keep the autofix's added import below the file prologue ([#1648](https://github.com/BluMintInc/eslint-custom-rules/issues/1648)) ([cea8bfd](https://github.com/BluMintInc/eslint-custom-rules/commit/cea8bfd9b472b25a5b283fd7a4437a60ca626de6))
* **logical-top-to-bottom-grouping:** never reorder across a sequential-await run parallelize-async-operations owns (closes [#1651](https://github.com/BluMintInc/eslint-custom-rules/issues/1651)) ([67993b2](https://github.com/BluMintInc/eslint-custom-rules/commit/67993b2e645275a27feb94b39000645f9ffa1b33))
* **no-array-length-in-deps:** keep the autofix's added import below the file prologue ([#1648](https://github.com/BluMintInc/eslint-custom-rules/issues/1648)) ([646b6e6](https://github.com/BluMintInc/eslint-custom-rules/commit/646b6e6686f92e5b61c5564082f3876e9a5dce0e))
* **no-empty-dependency-use-callbacks:** unbind the hook import the hoist empties (closes [#1650](https://github.com/BluMintInc/eslint-custom-rules/issues/1650)) ([8e47ced](https://github.com/BluMintInc/eslint-custom-rules/commit/8e47ced1c4c331ed07e338229166f73f1ba67ff2))
* **no-explicit-return-type:** drop the import the stripped annotation solely consumed (closes [#1649](https://github.com/BluMintInc/eslint-custom-rules/issues/1649)) ([d95af37](https://github.com/BluMintInc/eslint-custom-rules/commit/d95af37a64b37d2d494740daa7ac8e64b41b13f6))
* **prefer-fragment-component:** keep the autofix's added import below the file prologue ([#1648](https://github.com/BluMintInc/eslint-custom-rules/issues/1648)) ([177f992](https://github.com/BluMintInc/eslint-custom-rules/commit/177f992aea8efaedf61a846456fd4658987e7da9))
* **prefer-global-router-state-key:** keep the autofix's added import below the file prologue ([#1648](https://github.com/BluMintInc/eslint-custom-rules/issues/1648)) ([f1bb0eb](https://github.com/BluMintInc/eslint-custom-rules/commit/f1bb0eb8340bf088627446de671b0a18e0d6cc1b))
* **prefer-use-deep-compare-memo:** keep the autofix's added import below the file prologue ([#1648](https://github.com/BluMintInc/eslint-custom-rules/issues/1648)) ([fa80440](https://github.com/BluMintInc/eslint-custom-rules/commit/fa80440e6ed55644750e62d5fa277d7dd77c0f4f))
* **react-memoize-literals:** keep the suggestion's added import below the file prologue ([#1648](https://github.com/BluMintInc/eslint-custom-rules/issues/1648)) ([337ee2e](https://github.com/BluMintInc/eslint-custom-rules/commit/337ee2e3b86d93e2a804c4cc030d093c2fc5f801))
* **require-memoize-jsx-returners:** keep the autofix's added import below the file prologue (closes [#1648](https://github.com/BluMintInc/eslint-custom-rules/issues/1648)) ([b1e2b09](https://github.com/BluMintInc/eslint-custom-rules/commit/b1e2b09d7dcee989d5fe3bb4c0e3d6245c56fbc4))
* **require-memo:** keep the autofix's added import below the file prologue ([#1648](https://github.com/BluMintInc/eslint-custom-rules/issues/1648)) ([739c0c7](https://github.com/BluMintInc/eslint-custom-rules/commit/739c0c7ae9a6356d74b6202c50876e4e42158d6c))

## [1.20.86](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.85...v1.20.86) (2026-08-03)


### Bug Fixes

* **prefer-spread-over-reassembly:** prove narrowing through a relative import (closes [#1644](https://github.com/BluMintInc/eslint-custom-rules/issues/1644)) ([58cdf6f](https://github.com/BluMintInc/eslint-custom-rules/commit/58cdf6fb7bf100eb613e88edf16c424330e305b9))

## [1.20.85](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.84...v1.20.85) (2026-08-03)


### Bug Fixes

* **prefer-spread-over-reassembly:** read the narrowing proof through Readonly (closes [#1643](https://github.com/BluMintInc/eslint-custom-rules/issues/1643)) ([5931cf4](https://github.com/BluMintInc/eslint-custom-rules/commit/5931cf46c786880d17fba2f0df5bf821a362ae61)), closes [#1642](https://github.com/BluMintInc/eslint-custom-rules/issues/1642) [#1642](https://github.com/BluMintInc/eslint-custom-rules/issues/1642)

## [1.20.84](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.83...v1.20.84) (2026-08-03)


### Bug Fixes

* **prefer-spread-over-reassembly:** stay silent on a provably narrowing pick (closes [#1642](https://github.com/BluMintInc/eslint-custom-rules/issues/1642)) ([3c13155](https://github.com/BluMintInc/eslint-custom-rules/commit/3c131557fd22102df9a821217874a7b5ab9a7ecb))

## [1.20.83](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.82...v1.20.83) (2026-08-03)


### Bug Fixes

* **enforce-identifiable-firestore-type:** require the folder-matching type to be exported (closes [#1635](https://github.com/BluMintInc/eslint-custom-rules/issues/1635)) ([448b34b](https://github.com/BluMintInc/eslint-custom-rules/commit/448b34beffe518f50307ec35eea07ee8355ae245))
* **no-always-true-false-conditions:** fold Math.max/min operands inside comparisons (closes [#1625](https://github.com/BluMintInc/eslint-custom-rules/issues/1625)) ([c1f9b41](https://github.com/BluMintInc/eslint-custom-rules/commit/c1f9b4113e00e6ef19c293306a805095b5d84c76))
* **no-conditional-literals-in-jsx:** count every non-comment expression container as adjacent content (closes [#1627](https://github.com/BluMintInc/eslint-custom-rules/issues/1627)) ([ee517e2](https://github.com/BluMintInc/eslint-custom-rules/commit/ee517e23d67edf73c286ba094deb1bc68cb660f2))
* **no-direct-function-state:** see function types behind a same-file alias (closes [#1636](https://github.com/BluMintInc/eslint-custom-rules/issues/1636)) ([86a8d62](https://github.com/BluMintInc/eslint-custom-rules/commit/86a8d6246131f5dd7603b53bf6a7b102a464fa20))
* **no-useless-fragment:** stop the fixer corrupting source and count meaningful children (closes [#1634](https://github.com/BluMintInc/eslint-custom-rules/issues/1634)) ([6fa08d4](https://github.com/BluMintInc/eslint-custom-rules/commit/6fa08d4468deb198ed1a6c988dfdc0b9f289bfe7)), closes [#1195](https://github.com/BluMintInc/eslint-custom-rules/issues/1195)
* **prefer-map-over-conditional-dispatch:** extend the narrowing exemption to this-rooted discriminants (closes [#1626](https://github.com/BluMintInc/eslint-custom-rules/issues/1626)) ([3aad9f7](https://github.com/BluMintInc/eslint-custom-rules/commit/3aad9f751116334101f2254742cca1d7487a7717))

## [1.20.82](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.81...v1.20.82) (2026-08-02)


### Bug Fixes

* **require-image-optimized:** key next/image detection on the imported binding (closes [#1623](https://github.com/BluMintInc/eslint-custom-rules/issues/1623)) ([ce71084](https://github.com/BluMintInc/eslint-custom-rules/commit/ce71084e6da7d81d2ec1158d0cd90082516fa194))

## [1.20.81](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.80...v1.20.81) (2026-08-02)


### Bug Fixes

* **no-unused-props:** resolve the props type from an FC-annotated declarator (closes [#1620](https://github.com/BluMintInc/eslint-custom-rules/issues/1620)) ([d2b4496](https://github.com/BluMintInc/eslint-custom-rules/commit/d2b4496ea6aa7fbe60a7a0e7db1e130d68ffee0d))
* **prefer-destructuring-no-class:** recognize annotation-carried class instances (closes [#1619](https://github.com/BluMintInc/eslint-custom-rules/issues/1619)) ([2e12d61](https://github.com/BluMintInc/eslint-custom-rules/commit/2e12d61be18da6e99efd9cfe2a54b422b8cf52ba))

## [1.20.80](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.79...v1.20.80) (2026-08-02)


### Bug Fixes

* **no-harness-coupled-disables:** read the whole contiguous `//` rationale run (closes [#1617](https://github.com/BluMintInc/eslint-custom-rules/issues/1617)) ([ec0b9f1](https://github.com/BluMintInc/eslint-custom-rules/commit/ec0b9f1e88ee00ca5bb3db2b20f2f86f0a642dc8)), closes [#1312](https://github.com/BluMintInc/eslint-custom-rules/issues/1312)

## [1.20.79](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.78...v1.20.79) (2026-08-02)


### Bug Fixes

* **enforce-firestore-path-utils:** cite a reportable example in the message (closes [#1613](https://github.com/BluMintInc/eslint-custom-rules/issues/1613)) ([b8335d9](https://github.com/BluMintInc/eslint-custom-rules/commit/b8335d98bc621e823a9423f1d896ace1ed4a1981)), closes [#1612](https://github.com/BluMintInc/eslint-custom-rules/issues/1612)

## [1.20.78](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.77...v1.20.78) (2026-08-02)


### Bug Fixes

* **enforce-firestore-path-utils:** report concatenated inline paths (closes [#1611](https://github.com/BluMintInc/eslint-custom-rules/issues/1611)) ([5250d88](https://github.com/BluMintInc/eslint-custom-rules/commit/5250d88294914308b6bfcca59e75ad4a04c37ead))
* **enforce-realtimedb-path-utils:** report concatenated inline paths (closes [#1612](https://github.com/BluMintInc/eslint-custom-rules/issues/1612)) ([611a9e7](https://github.com/BluMintInc/eslint-custom-rules/commit/611a9e73621af07773681881d80ce5412ced9171))

## [1.20.77](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.76...v1.20.77) (2026-08-02)


### Bug Fixes

* **prefer-spread-over-reassembly:** see through transparent type-assertion wrappers (closes [#1610](https://github.com/BluMintInc/eslint-custom-rules/issues/1610)) ([6141f79](https://github.com/BluMintInc/eslint-custom-rules/commit/6141f792e4dfc3eb02ec4d3dfbeb85c4104887ca))

## [1.20.76](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.75...v1.20.76) (2026-08-02)


### Bug Fixes

* **no-type-assertion-returns:** report a chained assertion once, on the outermost link (closes [#1609](https://github.com/BluMintInc/eslint-custom-rules/issues/1609)) ([464d8dc](https://github.com/BluMintInc/eslint-custom-rules/commit/464d8dc683611606e00b08350064c8e0c759f62e))

## [1.20.75](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.74...v1.20.75) (2026-08-02)


### Bug Fixes

* **no-misleading-boolean-prefixes:** see through assertion wrappers on a returned value (closes [#1606](https://github.com/BluMintInc/eslint-custom-rules/issues/1606)) ([2eb12e2](https://github.com/BluMintInc/eslint-custom-rules/commit/2eb12e20d1f39d6f0f9d7eb0d0327972a78985e2))
* **prefer-field-paths-in-transforms:** see through assertion wrappers when classifying a transform return (closes [#1607](https://github.com/BluMintInc/eslint-custom-rules/issues/1607)) ([fcfc426](https://github.com/BluMintInc/eslint-custom-rules/commit/fcfc42630967c4201cc6db008bd5c49378c11d43))
* **prefer-flat-transform-each-keys:** see through assertion wrappers when classifying a transform return (closes [#1608](https://github.com/BluMintInc/eslint-custom-rules/issues/1608)) ([bafb16d](https://github.com/BluMintInc/eslint-custom-rules/commit/bafb16d649692244e772dc11d895c89773f8745f))

## [1.20.74](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.73...v1.20.74) (2026-08-02)


### Bug Fixes

* **global-const-style:** split the rename on case boundaries so it is idempotent (closes [#1605](https://github.com/BluMintInc/eslint-custom-rules/issues/1605)) ([5be993b](https://github.com/BluMintInc/eslint-custom-rules/commit/5be993b709850a45f146de97ff60fa51747bf1c6))

## [1.20.73](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.72...v1.20.73) (2026-08-02)


### Bug Fixes

* **enforce-boolean-naming-prefixes:** recognise a direct Boolean(...) initializer (closes [#1602](https://github.com/BluMintInc/eslint-custom-rules/issues/1602)) ([31978ef](https://github.com/BluMintInc/eslint-custom-rules/commit/31978ef84850c8b9f795a14a12a9f15dd5a1384e)), closes [#1601](https://github.com/BluMintInc/eslint-custom-rules/issues/1601)
* **react-memoize-literals:** decline the memo suggestion when the literal closes over nothing (closes [#1600](https://github.com/BluMintInc/eslint-custom-rules/issues/1600)) ([1dd34b3](https://github.com/BluMintInc/eslint-custom-rules/commit/1dd34b3348177245a8b381619b42ff312b8ac321))

## [1.20.72](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.71...v1.20.72) (2026-08-02)


### Bug Fixes

* **enforce-firestore-doc-ref-generic:** infer collection schema from the returned expression, not only the annotation (closes [#1595](https://github.com/BluMintInc/eslint-custom-rules/issues/1595)) ([4363827](https://github.com/BluMintInc/eslint-custom-rules/commit/4363827059eec4bf46ae69e11f37f052a98619df))
* **enforce-verb-noun-naming:** recognize a React component without its return annotation (closes [#1596](https://github.com/BluMintInc/eslint-custom-rules/issues/1596)) ([3fb13b1](https://github.com/BluMintInc/eslint-custom-rules/commit/3fb13b1e58dceb99c8d6af42b8d91283afd58204))
* **no-explicit-return-type:** see overload siblings inside a type literal, not only an interface body (closes [#1598](https://github.com/BluMintInc/eslint-custom-rules/issues/1598)) ([0133b68](https://github.com/BluMintInc/eslint-custom-rules/commit/0133b68e7a1001cc83eb26da4e6b7d2d06bb5c73))
* **no-unnecessary-verb-suffix:** climb through assertion wrappers when seeking a conformance signal (closes [#1597](https://github.com/BluMintInc/eslint-custom-rules/issues/1597)) ([f09dc1a](https://github.com/BluMintInc/eslint-custom-rules/commit/f09dc1ac2ccf283a0a69d42a3a2f351d6eda0aa4))

## [1.20.71](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.70...v1.20.71) (2026-08-02)


### Bug Fixes

* **no-firestore-object-arrays:** treat (typeof X)[number] over a primitive const array as a primitive union (closes [#1594](https://github.com/BluMintInc/eslint-custom-rules/issues/1594)) ([44d14cb](https://github.com/BluMintInc/eslint-custom-rules/commit/44d14cb7cdb2fee8a34611e09e5a185d25899890))

## [1.20.70](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.69...v1.20.70) (2026-08-01)


### Bug Fixes

* **class-methods-read-top-to-bottom:** preserve the whitespace separating reordered class members (closes [#1592](https://github.com/BluMintInc/eslint-custom-rules/issues/1592)) ([fdb332d](https://github.com/BluMintInc/eslint-custom-rules/commit/fdb332d099007923b2d503176a7132fd980b3346))
* **no-useless-usememo-primitives:** decline the autofix when inlining would strand a comment (closes [#1591](https://github.com/BluMintInc/eslint-custom-rules/issues/1591)) ([c4a985b](https://github.com/BluMintInc/eslint-custom-rules/commit/c4a985b64d739b965df0c69153644cb233b2cc02))
* **parallelize-async-operations:** preserve comments between merged awaits (closes [#1589](https://github.com/BluMintInc/eslint-custom-rules/issues/1589)) ([685465e](https://github.com/BluMintInc/eslint-custom-rules/commit/685465e676d96a76f7c7bde29c3e0990a9b04ab0))
* **prefer-map-over-conditional-dispatch:** preserve branch comments in the generated map (closes [#1590](https://github.com/BluMintInc/eslint-custom-rules/issues/1590)) ([2d7089f](https://github.com/BluMintInc/eslint-custom-rules/commit/2d7089f6eb802ce617da2729b34a733cda33f84a))

## [1.20.69](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.68...v1.20.69) (2026-08-01)


### Bug Fixes

* **enforce-early-destructuring:** stop parenthesizing a source that already binds tighter than ?? (closes [#1580](https://github.com/BluMintInc/eslint-custom-rules/issues/1580)) ([c22d48d](https://github.com/BluMintInc/eslint-custom-rules/commit/c22d48d4d3da2a313a4e6a4d030516b76d0d13f0))
* **enforce-render-hits-memoization:** accept a module-scope function as already stable (closes [#1586](https://github.com/BluMintInc/eslint-custom-rules/issues/1586)) ([ad746ba](https://github.com/BluMintInc/eslint-custom-rules/commit/ad746baee3f0cf767d800cb98e9ad44654a6562a)), closes [#1578](https://github.com/BluMintInc/eslint-custom-rules/issues/1578) [1584/#1585](https://github.com/BluMintInc/eslint-custom-rules/issues/1585)
* **enforce-render-hits-memoization:** recognise useLatestCallback as a memoization boundary (closes [#1585](https://github.com/BluMintInc/eslint-custom-rules/issues/1585)) ([5fb93a4](https://github.com/BluMintInc/eslint-custom-rules/commit/5fb93a449f3eeed579ac704901e415ee87d13847)), closes [#1584](https://github.com/BluMintInc/eslint-custom-rules/issues/1584)
* **enforce-render-hits-memoization:** report shorthand props (closes [#1588](https://github.com/BluMintInc/eslint-custom-rules/issues/1588)) ([8ce4a05](https://github.com/BluMintInc/eslint-custom-rules/commit/8ce4a05748b143a409fd24a97968ca27eb404094)), closes [#1585](https://github.com/BluMintInc/eslint-custom-rules/issues/1585) [#1585](https://github.com/BluMintInc/eslint-custom-rules/issues/1585)
* **enforce-transform-memoization:** recognise useLatestCallback as a stabilizing wrapper (closes [#1584](https://github.com/BluMintInc/eslint-custom-rules/issues/1584)) ([2a88068](https://github.com/BluMintInc/eslint-custom-rules/commit/2a88068306b6c45d24f6cd5c8afa07da0e8f9466))
* **optimize-object-boolean-conditions:** see through `as const` when judging a primitive (closes [#1581](https://github.com/BluMintInc/eslint-custom-rules/issues/1581)) ([9ed3999](https://github.com/BluMintInc/eslint-custom-rules/commit/9ed399911bb1a01b8c1fa59600668ecd9e6bbe98)), closes [#1569](https://github.com/BluMintInc/eslint-custom-rules/issues/1569)
* **prefer-type-over-interface:** exempt merged interface declarations (closes [#1583](https://github.com/BluMintInc/eslint-custom-rules/issues/1583)) ([577a17b](https://github.com/BluMintInc/eslint-custom-rules/commit/577a17b8e63072383b5e4bb8588aba18da840c66)), closes [#1568](https://github.com/BluMintInc/eslint-custom-rules/issues/1568)
* **use-latest-callback:** keep the call broken open when collapsing overflows the print width (closes [#1579](https://github.com/BluMintInc/eslint-custom-rules/issues/1579)) ([c539f94](https://github.com/BluMintInc/eslint-custom-rules/commit/c539f9465b290124eacb01b12f865cd262c4d3b9))

## [1.20.68](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.67...v1.20.68) (2026-08-01)


### Bug Fixes

* **prefer-union-from-const-array:** exclude block comments by range when inferring the indent unit (closes [#1577](https://github.com/BluMintInc/eslint-custom-rules/issues/1577)) ([2a65a5d](https://github.com/BluMintInc/eslint-custom-rules/commit/2a65a5d96cb9340629b383df652bc09637eeb3d0)), closes [#1574](https://github.com/BluMintInc/eslint-custom-rules/issues/1574)

## [1.20.67](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.66...v1.20.67) (2026-08-01)


### Bug Fixes

* **enforce-microdiff:** guard the zero-argument JSON.stringify comparison (closes [#1571](https://github.com/BluMintInc/eslint-custom-rules/issues/1571)) ([42358c8](https://github.com/BluMintInc/eslint-custom-rules/commit/42358c8e01c0eef5d0218378b036c48c3544963f))
* **memo-nested-react-components:** exempt lowercase-initial render-prop callbacks (closes [#1567](https://github.com/BluMintInc/eslint-custom-rules/issues/1567)) ([8db3a23](https://github.com/BluMintInc/eslint-custom-rules/commit/8db3a2375b2b6c266d0c7887f045a334c12e7e39))
* **no-compositing-layer-props:** exempt mix-blend-mode's non-promoting values (closes [#1570](https://github.com/BluMintInc/eslint-custom-rules/issues/1570)) ([373ecc9](https://github.com/BluMintInc/eslint-custom-rules/commit/373ecc9ce048deaa520e730a06b81894f55519ad))
* **no-jsx-in-hooks:** guard the zero-argument .map() inside useMemo (closes [#1572](https://github.com/BluMintInc/eslint-custom-rules/issues/1572)) ([831f186](https://github.com/BluMintInc/eslint-custom-rules/commit/831f186e18899ebe17abd66420b234285b3836ad))
* **optimize-object-boolean-conditions:** stop calling boolean-prefixed and primitive identifiers objects (closes [#1569](https://github.com/BluMintInc/eslint-custom-rules/issues/1569)) ([37e6f17](https://github.com/BluMintInc/eslint-custom-rules/commit/37e6f175ed281dbb09aefe675f6f56495a6c46d0))
* **prefer-getter-over-parameterless-method:** prescribe a remedy that clears preferGetterSideEffect (closes [#1568](https://github.com/BluMintInc/eslint-custom-rules/issues/1568)) ([4feefed](https://github.com/BluMintInc/eslint-custom-rules/commit/4feefed8c320cee2c3c9424a0a5ca26ec703f03b))
* **prefer-sx-prop-over-system-props:** ignore block-comment lines when inferring the indent unit (closes [#1574](https://github.com/BluMintInc/eslint-custom-rules/issues/1574)) ([618a386](https://github.com/BluMintInc/eslint-custom-rules/commit/618a386d7796323d78fdf945ef3cc3808fe3ac3a)), closes [#1565](https://github.com/BluMintInc/eslint-custom-rules/issues/1565)
* **prefer-sx-prop-over-system-props:** wrap emitted sx object when it overflows the print width (closes [#1565](https://github.com/BluMintInc/eslint-custom-rules/issues/1565)) ([722bdf8](https://github.com/BluMintInc/eslint-custom-rules/commit/722bdf87b34664d91f15d5c4c8dde79e2311c829))
* **prefer-union-from-const-array:** wrap the authored as-const array when it exceeds the print width (closes [#1566](https://github.com/BluMintInc/eslint-custom-rules/issues/1566)) ([81b6a76](https://github.com/BluMintInc/eslint-custom-rules/commit/81b6a761620ea0a043cf2059780bbec6919315c0))

## [1.20.66](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.65...v1.20.66) (2026-08-01)


### Bug Fixes

* **enforce-firestore-doc-ref-generic:** trace compat receivers through annotated lets and seeding callbacks (closes [#1564](https://github.com/BluMintInc/eslint-custom-rules/issues/1564)) ([5e28652](https://github.com/BluMintInc/eslint-custom-rules/commit/5e286521ed9ea7d1c40cbcceddf399954f418566))

## [1.20.65](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.64...v1.20.65) (2026-08-01)


### Bug Fixes

* **enforce-firestore-doc-ref-generic:** exempt compat Firestore receivers from @firebase/rules-unit-testing (closes [#1564](https://github.com/BluMintInc/eslint-custom-rules/issues/1564)) ([4a207a4](https://github.com/BluMintInc/eslint-custom-rules/commit/4a207a497927c0f631028b4e0189d0b2d47c7154))

## [1.20.64](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.63...v1.20.64) (2026-08-01)


### Bug Fixes

* **enforce-id-capitalization:** preserve the original quote delimiter when rewriting a literal (closes [#1558](https://github.com/BluMintInc/eslint-custom-rules/issues/1558)) ([cbce15d](https://github.com/BluMintInc/eslint-custom-rules/commit/cbce15d4ec10eba1944470e9cb70997ba4c7eba3))
* **enforce-memoize-async:** skip methods whose sole parameter is a callback (closes [#1563](https://github.com/BluMintInc/eslint-custom-rules/issues/1563)) ([8782e9f](https://github.com/BluMintInc/eslint-custom-rules/commit/8782e9f24bf2164343c9b4dc22c4d9d62bc83250))
* **enforce-memoize-getters:** exempt getters that read live external state (closes [#1561](https://github.com/BluMintInc/eslint-custom-rules/issues/1561)) ([f70af27](https://github.com/BluMintInc/eslint-custom-rules/commit/f70af27a95cd0cb004f2eaa98dc8af77be8c573a))
* **no-empty-dependency-use-callbacks:** dedent the callback when hoisting it to module scope (closes [#1560](https://github.com/BluMintInc/eslint-custom-rules/issues/1560)) ([78bf72b](https://github.com/BluMintInc/eslint-custom-rules/commit/78bf72bb19a931e382f2ba559d673d22ffd694f0))
* **no-explicit-return-type:** keep void and Promise<void> annotations under allowVoidReturnTypes (closes [#1562](https://github.com/BluMintInc/eslint-custom-rules/issues/1562)) ([cf593dd](https://github.com/BluMintInc/eslint-custom-rules/commit/cf593dd5e564763d80ac9fc6629857e81961c06a))
* **use-latest-callback:** re-indent the callback body when collapsing a multi-line useCallback (closes [#1559](https://github.com/BluMintInc/eslint-custom-rules/issues/1559)) ([5ff3780](https://github.com/BluMintInc/eslint-custom-rules/commit/5ff3780e39e559b0f6e61a16b9afd6b638652a84))

## [1.20.63](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.62...v1.20.63) (2026-08-01)


### Bug Fixes

* **parallelize-async-operations:** indent Promise.all output relative to the replaced statements (closes [#1557](https://github.com/BluMintInc/eslint-custom-rules/issues/1557)) ([5969407](https://github.com/BluMintInc/eslint-custom-rules/commit/5969407315dce3a83b61fe4ba368de9ac520517e))

## [1.20.62](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.61...v1.20.62) (2026-08-01)


### Bug Fixes

* **enforce-assert-safe-object-key:** append .js to the injected specifier for native-ESM consumers (closes [#1556](https://github.com/BluMintInc/eslint-custom-rules/issues/1556)) ([7372713](https://github.com/BluMintInc/eslint-custom-rules/commit/737271340ccdf4d93f7b25012c86a9ba0b769037))
* **enforce-assert-safe-object-key:** exempt statically numeric keys and array-ish member objects (closes [#1554](https://github.com/BluMintInc/eslint-custom-rules/issues/1554)) ([035a933](https://github.com/BluMintInc/eslint-custom-rules/commit/035a933e73dc3e8613f900540171b0294c05c521))
* **enforce-verb-noun-naming:** add externallyNamedExports glob option for externally-specified names (closes [#1555](https://github.com/BluMintInc/eslint-custom-rules/issues/1555)) ([8fe90be](https://github.com/BluMintInc/eslint-custom-rules/commit/8fe90be4ef6566fc93f04a1c2c8ff762cd6d3d8a))

## [1.20.61](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.60...v1.20.61) (2026-08-01)


### Bug Fixes

* **prefer-fragment-shorthand:** don't report attributed fragments (closes [#1552](https://github.com/BluMintInc/eslint-custom-rules/issues/1552)) ([339152e](https://github.com/BluMintInc/eslint-custom-rules/commit/339152e43e050b2ee33a566090991ee57e948c22))

## [1.20.60](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.59...v1.20.60) (2026-08-01)


### Bug Fixes

* **enforce-singular-type-names:** keep the container exemption when nullable (closes [#1550](https://github.com/BluMintInc/eslint-custom-rules/issues/1550)) ([697bed7](https://github.com/BluMintInc/eslint-custom-rules/commit/697bed7e4cd8953bb5ee19f7f34c73e1b0857f9d)), closes [#1551](https://github.com/BluMintInc/eslint-custom-rules/issues/1551)

## [1.20.59](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.58...v1.20.59) (2026-08-01)


### Bug Fixes

* **prefer-type-over-interface:** exempt module augmentations (closes [#1549](https://github.com/BluMintInc/eslint-custom-rules/issues/1549)) ([faa8a29](https://github.com/BluMintInc/eslint-custom-rules/commit/faa8a29aa363d0df0cc564c377c258a65d295183))

## [1.20.58](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.57...v1.20.58) (2026-08-01)


### Bug Fixes

* **enforce-memoize-async:** skip methods declared Promise<void> (closes [#1548](https://github.com/BluMintInc/eslint-custom-rules/issues/1548)) ([7dc5dd5](https://github.com/BluMintInc/eslint-custom-rules/commit/7dc5dd5c94602111928f29eb26f7d1c3e5e108fa))

## [1.20.57](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.56...v1.20.57) (2026-08-01)


### Bug Fixes

* **no-entire-object-hook-deps:** never prune deps from a hand-maintained dependency array (closes [#1547](https://github.com/BluMintInc/eslint-custom-rules/issues/1547)) ([4e71111](https://github.com/BluMintInc/eslint-custom-rules/commit/4e71111b584f3916864f9ee35e5b2c57a606d2c3)), closes [#1546](https://github.com/BluMintInc/eslint-custom-rules/issues/1546)

## [1.20.56](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.55...v1.20.56) (2026-08-01)


### Bug Fixes

* **no-entire-object-hook-deps:** treat unread useEffect deps as re-run triggers unless the effect sets them (closes [#1546](https://github.com/BluMintInc/eslint-custom-rules/issues/1546)) ([a9c0f85](https://github.com/BluMintInc/eslint-custom-rules/commit/a9c0f85b0357cb28e32cbc1a4bd58a6d7dd004c6))

## [1.20.55](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.54...v1.20.55) (2026-08-01)


### Bug Fixes

* **enforce-boolean-naming-prefixes:** check abstract properties and constructor parameter properties (closes [#1545](https://github.com/BluMintInc/eslint-custom-rules/issues/1545)) ([c6e13f8](https://github.com/BluMintInc/eslint-custom-rules/commit/c6e13f85b59fa695bae67ce72ad6b83293b645c1))

## [1.20.54](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.53...v1.20.54) (2026-08-01)


### Bug Fixes

* **export-if-in-doubt:** elide the remedy example instead of fabricating a destructive value (closes [#1543](https://github.com/BluMintInc/eslint-custom-rules/issues/1543)) ([9907087](https://github.com/BluMintInc/eslint-custom-rules/commit/99070871ab4b53f61b177bc1bb85a1059a58bdf4))

## [1.20.53](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.52...v1.20.53) (2026-08-01)


### Bug Fixes

* **deps:** bound eslint peer range below 9 (closes [#1540](https://github.com/BluMintInc/eslint-custom-rules/issues/1540)) ([944dd20](https://github.com/BluMintInc/eslint-custom-rules/commit/944dd208842fcab8aca9ed216ef00b26e4befe43))
* **parallelize-async-operations:** stop hoisting dependent and await-containing operations (closes [#1541](https://github.com/BluMintInc/eslint-custom-rules/issues/1541)) ([0e39081](https://github.com/BluMintInc/eslint-custom-rules/commit/0e39081baa5633daff2c0d01bbcc0ee3f173ba9b))

## [1.20.52](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.51...v1.20.52) (2026-07-31)


### Bug Fixes

* **enforce-m3-sentence-case:** validate ignorePatterns regexes with an actionable error (closes [#1534](https://github.com/BluMintInc/eslint-custom-rules/issues/1534)) ([8432520](https://github.com/BluMintInc/eslint-custom-rules/commit/8432520a4afbfd47ae31bd9846f37c6f0980798d))
* **no-render-function-components:** validate allowNames regexes with an actionable error (closes [#1536](https://github.com/BluMintInc/eslint-custom-rules/issues/1536)) ([2bde041](https://github.com/BluMintInc/eslint-custom-rules/commit/2bde041f442bb38d88be86a3e19086d7e12e42ce))
* **no-separate-loading-state:** validate patterns regexes with an actionable error (closes [#1535](https://github.com/BluMintInc/eslint-custom-rules/issues/1535)) ([e35666f](https://github.com/BluMintInc/eslint-custom-rules/commit/e35666f8ad61d99dd07e917961abfe9d765390d5))

## [1.20.51](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.50...v1.20.51) (2026-07-31)


### Bug Fixes

* **enforce-dynamic-imports:** allow the scoped @blumintinc/fast-deep-equal specifier ([bb0fa10](https://github.com/BluMintInc/eslint-custom-rules/commit/bb0fa10bd3b4dae16e00540cfd4aeb7289fffa83))
* **enforce-dynamic-imports:** allow the scoped @blumintinc/microdiff specifier ([a93a1c3](https://github.com/BluMintInc/eslint-custom-rules/commit/a93a1c3cc0000a5686d3713ee22768bee6a2eeec))
* **enforce-microdiff:** emit a default import from @blumintinc/microdiff and stop stranding the call site (closes [#1531](https://github.com/BluMintInc/eslint-custom-rules/issues/1531)) ([e74e7da](https://github.com/BluMintInc/eslint-custom-rules/commit/e74e7da3167b3bdc3713166a8a0c183cbad6dc28))
* **enforce-timestamp-now:** only rewrite new Date() when every use is Timestamp-compatible (closes [#1528](https://github.com/BluMintInc/eslint-custom-rules/issues/1528)) ([43232eb](https://github.com/BluMintInc/eslint-custom-rules/commit/43232eb8dac0ec51a21de691a9750aafcc99981d))
* **enforce-timestamp-now:** reject type-only imports as evidence of a value binding (closes [#1530](https://github.com/BluMintInc/eslint-custom-rules/issues/1530)) ([cd63279](https://github.com/BluMintInc/eslint-custom-rules/commit/cd63279ad713b254ab4dd9609be0fab69a04f150)), closes [#1521](https://github.com/BluMintInc/eslint-custom-rules/issues/1521)
* **fast-deep-equal-over-microdiff:** emit and recognize @blumintinc/fast-deep-equal (closes [#1533](https://github.com/BluMintInc/eslint-custom-rules/issues/1533)) ([0f4bd50](https://github.com/BluMintInc/eslint-custom-rules/commit/0f4bd5079ec9e699db05422e32dd3a0da9bfb015))
* **fast-deep-equal-over-microdiff:** recognize the scoped @blumintinc/microdiff fork (closes [#1532](https://github.com/BluMintInc/eslint-custom-rules/issues/1532)) ([873701b](https://github.com/BluMintInc/eslint-custom-rules/commit/873701be35a2b843a95a24bfbdb327d6fad65d14))

## [1.20.50](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.49...v1.20.50) (2026-07-31)


### Bug Fixes

* **consistent-callback-naming:** stop autofixing prop renames, which broke compilation (closes [#1522](https://github.com/BluMintInc/eslint-custom-rules/issues/1522)) ([836bf8f](https://github.com/BluMintInc/eslint-custom-rules/commit/836bf8f89f7105f5bdccf4f7a0ef9bbd5095d8d0))
* **enforce-early-destructuring:** drop the synthesized `= {}` on nested object patterns (closes [#1523](https://github.com/BluMintInc/eslint-custom-rules/issues/1523)) ([70a7585](https://github.com/BluMintInc/eslint-custom-rules/commit/70a75856b7bf791c90ed1dae3e9ae10a07ecbfd3))
* **enforce-object-literal-as-const:** skip array literals a signature declares mutable (closes [#1526](https://github.com/BluMintInc/eslint-custom-rules/issues/1526)) ([7712b04](https://github.com/BluMintInc/eslint-custom-rules/commit/7712b0423d80b1da7c8eaa23464fe207ffc1a38b))
* **enforce-timestamp-now:** gate the new Date() autofix on an in-scope Timestamp import (closes [#1521](https://github.com/BluMintInc/eslint-custom-rules/issues/1521)) ([a9320b3](https://github.com/BluMintInc/eslint-custom-rules/commit/a9320b3e37e2a8f951d7e4dc3b9c664353571209))
* **no-class-instance-destructuring:** bind the instance once instead of reconstructing per property (closes [#1524](https://github.com/BluMintInc/eslint-custom-rules/issues/1524)) ([90967ab](https://github.com/BluMintInc/eslint-custom-rules/commit/90967ab48ea20c74c85ddcea61e51fb3b24237a7))

## [1.20.49](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.48...v1.20.49) (2026-07-31)


### Bug Fixes

* **export-if-in-doubt:** recognize `export default <identifier>` as an export (closes [#1520](https://github.com/BluMintInc/eslint-custom-rules/issues/1520)) ([f53a3aa](https://github.com/BluMintInc/eslint-custom-rules/commit/f53a3aa77a424656eebd9787aef37e42a8dbff74))

## [1.20.48](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.47...v1.20.48) (2026-07-31)


### Bug Fixes

* **enforce-props-naming-consistency:** stop reporting constructor parameters twice (closes [#1514](https://github.com/BluMintInc/eslint-custom-rules/issues/1514)) ([ff4e84c](https://github.com/BluMintInc/eslint-custom-rules/commit/ff4e84c3d59fb73d99e5f989c5a9932427a12b91))
* **prefer-nullish-coalescing-boolean-props:** degrade instead of throwing under a non-TypeScript parser (closes [#1513](https://github.com/BluMintInc/eslint-custom-rules/issues/1513)) ([5f9f915](https://github.com/BluMintInc/eslint-custom-rules/commit/5f9f9156da594120cc9d506e5d5827321ea2f7ce))

## [1.20.47](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.46...v1.20.47) (2026-07-31)


### Bug Fixes

* **no-explicit-return-type:** stop reporting an annotation TypeScript requires (closes [#1512](https://github.com/BluMintInc/eslint-custom-rules/issues/1512)) ([060121f](https://github.com/BluMintInc/eslint-custom-rules/commit/060121fb633c820f4b0d94ae679cd6a1c8216f7a))
* **no-mock-firebase-admin:** stop reporting factories the shared fake cannot replace (closes [#1510](https://github.com/BluMintInc/eslint-custom-rules/issues/1510)) ([2536d90](https://github.com/BluMintInc/eslint-custom-rules/commit/2536d9043c2fd2c485100e0a9c728d8364671c10))
* **no-unnecessary-verb-suffix:** accept a function's own return type as a conformance signal (closes [#1511](https://github.com/BluMintInc/eslint-custom-rules/issues/1511)) ([8fcf495](https://github.com/BluMintInc/eslint-custom-rules/commit/8fcf495e8c05fd2da584f1e2a1dd0881c78cada5)), closes [#1350](https://github.com/BluMintInc/eslint-custom-rules/issues/1350)

## [1.20.46](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.45...v1.20.46) (2026-07-31)


### Bug Fixes

* **enforce-snapshot-state-narrowing:** make the guardFunctions option actually select the emitted guard name (closes [#1505](https://github.com/BluMintInc/eslint-custom-rules/issues/1505)) ([e04d132](https://github.com/BluMintInc/eslint-custom-rules/commit/e04d1326eb5b9be70fb788468110e562a96117e3))

## [1.20.45](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.44...v1.20.45) (2026-07-31)


### Bug Fixes

* **enforce-mui-rounded-icons:** examine barrel imports, not just deep ones (closes [#1502](https://github.com/BluMintInc/eslint-custom-rules/issues/1502)) ([bac89c6](https://github.com/BluMintInc/eslint-custom-rules/commit/bac89c6f7ee866da3824734236d1c1a01bcaf732))
* **enforce-object-literal-as-const:** stop the autofix destroying an existing type assertion (closes [#1503](https://github.com/BluMintInc/eslint-custom-rules/issues/1503)) ([7daaf38](https://github.com/BluMintInc/eslint-custom-rules/commit/7daaf386a3a14f22ad79341f913cd0e26e360f57))

## [1.20.44](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.43...v1.20.44) (2026-07-31)


### Bug Fixes

* **enforce-firestore-doc-ref-generic:** honor a typed collection bound to a const (closes [#1498](https://github.com/BluMintInc/eslint-custom-rules/issues/1498)) ([1f292c7](https://github.com/BluMintInc/eslint-custom-rules/commit/1f292c7923d2e04a59283ada30d5b8fa6c80dce8)), closes [#1499](https://github.com/BluMintInc/eslint-custom-rules/issues/1499)
* **enforce-transform-memoization:** only report inside a component or hook (closes [#1497](https://github.com/BluMintInc/eslint-custom-rules/issues/1497)) ([e91155e](https://github.com/BluMintInc/eslint-custom-rules/commit/e91155e05e28ce38a5ef5cf0934a652d14e59a6e)), closes [#1243](https://github.com/BluMintInc/eslint-custom-rules/issues/1243) [#1292](https://github.com/BluMintInc/eslint-custom-rules/issues/1292) [#1347](https://github.com/BluMintInc/eslint-custom-rules/issues/1347) [#1496](https://github.com/BluMintInc/eslint-custom-rules/issues/1496)

## [1.20.43](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.42...v1.20.43) (2026-07-31)


### Bug Fixes

* **enforce-callback-memo:** only report inside a component or hook (closes [#1496](https://github.com/BluMintInc/eslint-custom-rules/issues/1496)) ([a5e8a82](https://github.com/BluMintInc/eslint-custom-rules/commit/a5e8a827df3e4bd1a45a7827cd08900eb9d67ae4))

## [1.20.42](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.41...v1.20.42) (2026-07-31)


### Bug Fixes

* **logical-top-to-bottom-grouping:** stop hoisting effects above captured state (closes [#1493](https://github.com/BluMintInc/eslint-custom-rules/issues/1493)) ([fa22167](https://github.com/BluMintInc/eslint-custom-rules/commit/fa221679c5abec16fe027df9b61027ae476e720d))
* **memo-nested-react-components:** exempt components defined in jest.mock factories (closes [#1491](https://github.com/BluMintInc/eslint-custom-rules/issues/1491)) ([cc2e704](https://github.com/BluMintInc/eslint-custom-rules/commit/cc2e7046266ebd99e2269f23aa736b05eaad818f))
* **memo-nested-react-components:** exempt components defined in test bodies (closes [#1494](https://github.com/BluMintInc/eslint-custom-rules/issues/1494)) ([b6792ea](https://github.com/BluMintInc/eslint-custom-rules/commit/b6792ea8ec251d73bfb2ec75d41c0282f275fe17)), closes [#1491](https://github.com/BluMintInc/eslint-custom-rules/issues/1491)
* **memo-nested-react-components:** exempt stubs inside test helper functions (closes [#1495](https://github.com/BluMintInc/eslint-custom-rules/issues/1495)) ([41dd028](https://github.com/BluMintInc/eslint-custom-rules/commit/41dd028a983853b1c758142bcb142531c5b858f7)), closes [#1491](https://github.com/BluMintInc/eslint-custom-rules/issues/1491) [#1494](https://github.com/BluMintInc/eslint-custom-rules/issues/1494)

## [1.20.41](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.40...v1.20.41) (2026-07-31)


### Bug Fixes

* **createRule:** point rule docs URLs at the blob path so they resolve (closes [#1479](https://github.com/BluMintInc/eslint-custom-rules/issues/1479)) ([d425de7](https://github.com/BluMintInc/eslint-custom-rules/commit/d425de70e20d6f0e24f6e07705462aa6b5b8d114)), closes [1480-#1483](https://github.com/1480-/issues/1483)
* **no-async-foreach:** build via createRule so it ships a docs URL (closes [#1480](https://github.com/BluMintInc/eslint-custom-rules/issues/1480)) ([73face2](https://github.com/BluMintInc/eslint-custom-rules/commit/73face290a097b93f80894769f2e565cb2fc7773))
* **no-useless-fragment:** build via createRule so it ships a docs URL (closes [#1481](https://github.com/BluMintInc/eslint-custom-rules/issues/1481)) ([3030bcd](https://github.com/BluMintInc/eslint-custom-rules/commit/3030bcd1f21969918dc1f6f222554a1550780f0b))
* **prefer-fragment-shorthand:** build via createRule so it ships a docs URL (closes [#1482](https://github.com/BluMintInc/eslint-custom-rules/issues/1482)) ([0421be8](https://github.com/BluMintInc/eslint-custom-rules/commit/0421be89562ec28905995ce1928c0db21e91abeb))
* **require-memo:** build via createRule so it ships a docs URL (closes [#1483](https://github.com/BluMintInc/eslint-custom-rules/issues/1483)) ([4477620](https://github.com/BluMintInc/eslint-custom-rules/commit/4477620ee7a24c1e39f6f907308a1ed8b9e3476d))

## [1.20.40](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.39...v1.20.40) (2026-07-30)


### Bug Fixes

* **avoid-utils-directory:** report the path relative to ESLint's cwd (closes [#1475](https://github.com/BluMintInc/eslint-custom-rules/issues/1475)) ([90dc87e](https://github.com/BluMintInc/eslint-custom-rules/commit/90dc87e5fbf4b867fad63c0bad1210bc5b821a42))
* **enforce-assert-safe-object-key:** anchor the injected import at ESLint's cwd (closes [#1473](https://github.com/BluMintInc/eslint-custom-rules/issues/1473)) ([2dc6d3d](https://github.com/BluMintInc/eslint-custom-rules/commit/2dc6d3d878e42794ba76e3d2c6b57758287f3e97))
* **enforce-dynamic-imports:** accept the helper modules this plugin's own fixers inject (closes [#1474](https://github.com/BluMintInc/eslint-custom-rules/issues/1474)) ([8e07cd7](https://github.com/BluMintInc/eslint-custom-rules/commit/8e07cd7a7cd4e53e9a096b0896187d1dbbf16936))
* **require-props-composition:** resolve sibling components from ESLint's cwd ([3d2e2cc](https://github.com/BluMintInc/eslint-custom-rules/commit/3d2e2cc6376e493afcb3fe615e8c06ce925ba3c1))
* **test-file-location-enforcement:** name the file relative to ESLint's cwd ([4eda6c4](https://github.com/BluMintInc/eslint-custom-rules/commit/4eda6c4e1fcb6f33bafaf5832fd9bc81a4cdce5e))

## [1.20.39](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.38...v1.20.39) (2026-07-30)


### Bug Fixes

* **repo:** track only files inside the workspace in the agent change log (closes [#1469](https://github.com/BluMintInc/eslint-custom-rules/issues/1469)) ([69d6ebb](https://github.com/BluMintInc/eslint-custom-rules/commit/69d6ebb228645868160591e8c5238b8245bd285b))

## [1.20.38](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.37...v1.20.38) (2026-07-30)


### Bug Fixes

* **enforce-callback-memo:** allow an inline callback inside a useMemo factory (closes [#1465](https://github.com/BluMintInc/eslint-custom-rules/issues/1465)) ([89c39a2](https://github.com/BluMintInc/eslint-custom-rules/commit/89c39a29604fa4df492aa40e63bf1a0ff9a2fe77))

## [1.20.37](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.36...v1.20.37) (2026-07-30)


### Bug Fixes

* **enforce-unique-cursor-headers:** only autofix a template that satisfies the rule (closes [#1461](https://github.com/BluMintInc/eslint-custom-rules/issues/1461)) ([f8862a2](https://github.com/BluMintInc/eslint-custom-rules/commit/f8862a299819a3d2ad89b96a9a5a76476d9f479c))

## [1.20.36](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.35...v1.20.36) (2026-07-30)


### Bug Fixes

* **no-margin-properties:** remove the inert autofix option (closes [#1460](https://github.com/BluMintInc/eslint-custom-rules/issues/1460)) ([7724ef6](https://github.com/BluMintInc/eslint-custom-rules/commit/7724ef64d8ec2d052646f6fece50035167acc53c)), closes [#726](https://github.com/BluMintInc/eslint-custom-rules/issues/726)

## [1.20.35](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.34...v1.20.35) (2026-07-30)


### Bug Fixes

* **require-image-optimized:** decline the autofix when a shadow captures the reused import alias (closes [#1457](https://github.com/BluMintInc/eslint-custom-rules/issues/1457)) ([f25f504](https://github.com/BluMintInc/eslint-custom-rules/commit/f25f50432c9fff5ade365b8ed30d5ed44b66e68c)), closes [#1455](https://github.com/BluMintInc/eslint-custom-rules/issues/1455)

## [1.20.34](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.33...v1.20.34) (2026-07-30)


### Bug Fixes

* **enforce-global-constants:** decline the autofix when the generated name is taken (closes [#1455](https://github.com/BluMintInc/eslint-custom-rules/issues/1455)) ([5cc0eed](https://github.com/BluMintInc/eslint-custom-rules/commit/5cc0eedd66bc7a85db5a67b3ef14745217cc8a51))
* **prefer-global-router-state-key:** decline the autofix when a shadow captures the emitted reference (closes [#1456](https://github.com/BluMintInc/eslint-custom-rules/issues/1456)) ([f18607f](https://github.com/BluMintInc/eslint-custom-rules/commit/f18607f44062401e79d8134dd725d9d96357dc0e))

## [1.20.33](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.32...v1.20.33) (2026-07-30)


### Bug Fixes

* **enforce-fieldpath-syntax-in-docsetter:** preserve comments and indentation by splicing only the properties that need flattening (closes [#1441](https://github.com/BluMintInc/eslint-custom-rules/issues/1441)) ([91e00d8](https://github.com/BluMintInc/eslint-custom-rules/commit/91e00d8d4170a2b3acfe73832a747b0a54e49249))
* **enforce-firestore-set-merge:** import setDoc atomically with the rewrite and preserve aliased bindings (closes [#1439](https://github.com/BluMintInc/eslint-custom-rules/issues/1439)) ([30eef0f](https://github.com/BluMintInc/eslint-custom-rules/commit/30eef0f7d0a034186389947d8c728a3feaf8426d))
* **enforce-microdiff:** decline the lodash difference rewrite instead of emitting an unbound diff with a comparator microdiff cannot accept (closes [#1437](https://github.com/BluMintInc/eslint-custom-rules/issues/1437)) ([6db4941](https://github.com/BluMintInc/eslint-custom-rules/commit/6db4941617547bc44623d16678d864574fef233d))
* **enforce-microdiff:** resolve call sites through the scope chain so local shadows of competing imports are not rewritten (closes [#1450](https://github.com/BluMintInc/eslint-custom-rules/issues/1450)) ([16206ec](https://github.com/BluMintInc/eslint-custom-rules/commit/16206ec811fbd64574586d10810a2cea0112f0db))
* **enforce-microdiff:** resolve name-only matches through the scope chain so locally-bound names are not flagged or rewritten (closes [#1449](https://github.com/BluMintInc/eslint-custom-rules/issues/1449)) ([3c7e05d](https://github.com/BluMintInc/eslint-custom-rules/commit/3c7e05d9f0e600af63e23071cee6a8e06d0f9acb))
* **fast-deep-equal-over-microdiff:** preserve comments by splicing the callee and length tail instead of re-emitting the arguments (closes [#1442](https://github.com/BluMintInc/eslint-custom-rules/issues/1442)) ([31a616c](https://github.com/BluMintInc/eslint-custom-rules/commit/31a616c95ce582a4f1de231eeaf61da5cadcf42c))
* **fast-deep-equal-over-microdiff:** remove the redundant declaration by node range so single-line shapes cannot produce overlapping fixes (closes [#1448](https://github.com/BluMintInc/eslint-custom-rules/issues/1448)) ([743bdf3](https://github.com/BluMintInc/eslint-custom-rules/commit/743bdf3c5e92adc6f050ea0898cec647ee9752ba))
* **flatten-push-calls:** preserve comments attached to the merged arguments (closes [#1444](https://github.com/BluMintInc/eslint-custom-rules/issues/1444)) ([802a6b4](https://github.com/BluMintInc/eslint-custom-rules/commit/802a6b4969fa90254ee717846c8f034d0916a1af))
* **no-unused-usestate:** require both bindings dead before reporting or removing a useState (closes [#1438](https://github.com/BluMintInc/eslint-custom-rules/issues/1438)) ([6a4d8a4](https://github.com/BluMintInc/eslint-custom-rules/commit/6a4d8a41705f0b68501fe5da1f63d95d7ec8e16f))
* **prefer-spread-over-reassembly:** preserve comments on retained JSX attributes by splicing only the collapsed ones (closes [#1443](https://github.com/BluMintInc/eslint-custom-rules/issues/1443)) ([9334fe9](https://github.com/BluMintInc/eslint-custom-rules/commit/9334fe9da200a7b1976d530814e0c2acf22b57a8))
* **prefer-usecallback-over-usememo-for-functions:** decline the fix when useMemo is not bound to react (closes [#1440](https://github.com/BluMintInc/eslint-custom-rules/issues/1440)) ([cbecc39](https://github.com/BluMintInc/eslint-custom-rules/commit/cbecc390a45c0ef4eb3e2d34d817b55f9c71177e))
* **prefer-usecallback-over-usememo-for-functions:** preserve comments when unwrapping useMemo into useCallback (closes [#1447](https://github.com/BluMintInc/eslint-custom-rules/issues/1447)) ([9a73e51](https://github.com/BluMintInc/eslint-custom-rules/commit/9a73e51b1bb4178f57402ee8286916c3afdb1610))
* **use-custom-memo:** preserve comments attached to surviving import specifiers (closes [#1445](https://github.com/BluMintInc/eslint-custom-rules/issues/1445)) ([e8a6660](https://github.com/BluMintInc/eslint-custom-rules/commit/e8a66607b8a9a9d116323486896f0d793080e116))
* **use-latest-callback:** preserve comments attached to surviving import specifiers (closes [#1446](https://github.com/BluMintInc/eslint-custom-rules/issues/1446)) ([e456fdb](https://github.com/BluMintInc/eslint-custom-rules/commit/e456fdbd11cbc01b3e1bfaba1c1e00a740877c84))

## [1.20.32](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.31...v1.20.32) (2026-07-30)


### Bug Fixes

* **enforce-microdiff:** decline the fix when `diff` is already bound (closes [#1429](https://github.com/BluMintInc/eslint-custom-rules/issues/1429)) ([6c8a0af](https://github.com/BluMintInc/eslint-custom-rules/commit/6c8a0afd24efc6534b2ec8e4c8d6de4d95616316))
* **enforce-stable-hash-spread-props:** decline the fix when `stableHash` is already bound (closes [#1430](https://github.com/BluMintInc/eslint-custom-rules/issues/1430)) ([53c886d](https://github.com/BluMintInc/eslint-custom-rules/commit/53c886dd80e34b14a3d2b0887f0d5b30850be03f))
* **fast-deep-equal-over-microdiff:** decline the fix when `isEqual` is already bound (closes [#1435](https://github.com/BluMintInc/eslint-custom-rules/issues/1435)) ([47236b8](https://github.com/BluMintInc/eslint-custom-rules/commit/47236b88812a017dc9f8727a7f5462e8fd97217c))
* **prefer-global-router-state-key:** decline the fix when the derived query-key constant is already bound (closes [#1431](https://github.com/BluMintInc/eslint-custom-rules/issues/1431)) ([b960875](https://github.com/BluMintInc/eslint-custom-rules/commit/b960875565dd17dcc4e0a08b1cfcbf1017a25192))
* **prefer-next-dynamic:** decline the fix when `dynamic` is already bound (closes [#1432](https://github.com/BluMintInc/eslint-custom-rules/issues/1432)) ([e92615b](https://github.com/BluMintInc/eslint-custom-rules/commit/e92615b05bfe88deabc367e35e1dc7ad088516fd))
* **prefer-use-deep-compare-memo:** decline the fix when `useDeepCompareMemo` is already bound (closes [#1436](https://github.com/BluMintInc/eslint-custom-rules/issues/1436)) ([c6053d0](https://github.com/BluMintInc/eslint-custom-rules/commit/c6053d0feec6777483b785f3f3be920ff0537bbe))
* **require-dynamic-firebase-imports:** decline the fix when a hoisted type name is already bound (closes [#1433](https://github.com/BluMintInc/eslint-custom-rules/issues/1433)) ([34eb80f](https://github.com/BluMintInc/eslint-custom-rules/commit/34eb80f8cb3f433636e451968eb096597d064a56))
* **require-memoize-jsx-returners:** decline the fix when `Memoize` is already bound (closes [#1434](https://github.com/BluMintInc/eslint-custom-rules/issues/1434)) ([4970190](https://github.com/BluMintInc/eslint-custom-rules/commit/49701901cc6ecde782d6d0b299b08494678b29a5))

## [1.20.31](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.30...v1.20.31) (2026-07-30)


### Bug Fixes

* **enforce-assert-safe-object-key:** decline the fix when `assertSafe` is already bound (closes [#1422](https://github.com/BluMintInc/eslint-custom-rules/issues/1422)) ([a5b8517](https://github.com/BluMintInc/eslint-custom-rules/commit/a5b85174573d5d1db7c1b6793f00e33f6f7db747))
* **enforce-memoize-async:** decline the fix when `Memoize` is already bound (closes [#1423](https://github.com/BluMintInc/eslint-custom-rules/issues/1423)) ([0c037a4](https://github.com/BluMintInc/eslint-custom-rules/commit/0c037a4d5ba538a7eec48b39bfe126031cd55d63))
* **enforce-memoize-getters:** decline the fix when `Memoize` is already bound (closes [#1424](https://github.com/BluMintInc/eslint-custom-rules/issues/1424)) ([d0ce6a2](https://github.com/BluMintInc/eslint-custom-rules/commit/d0ce6a2e4e56806ddff34899078ddd02edde7b3a))
* **no-array-length-in-deps:** decline the fix when a name it needs is already bound (closes [#1425](https://github.com/BluMintInc/eslint-custom-rules/issues/1425)) ([88efd23](https://github.com/BluMintInc/eslint-custom-rules/commit/88efd23a0328df81f6a7695f76a6a84481df1d69))
* **prefer-fragment-component:** decline the fix when `Fragment` is already bound (closes [#1426](https://github.com/BluMintInc/eslint-custom-rules/issues/1426)) ([7a28c58](https://github.com/BluMintInc/eslint-custom-rules/commit/7a28c58a2f47c3c5303d8629133360552d4d68e9))
* **require-memo:** decline the fix when `memo` is already bound (closes [#1427](https://github.com/BluMintInc/eslint-custom-rules/issues/1427)) ([2469e87](https://github.com/BluMintInc/eslint-custom-rules/commit/2469e87ce97406b1c63a9245b001b079c0bec87a))
* **use-latest-callback:** decline the fix when `useLatestCallback` is already bound (closes [#1428](https://github.com/BluMintInc/eslint-custom-rules/issues/1428)) ([c62b091](https://github.com/BluMintInc/eslint-custom-rules/commit/c62b09121db8948e71ba51ffb8738bb19bd11fe7))

## [1.20.30](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.29...v1.20.30) (2026-07-30)


### Bug Fixes

* **enforce-safe-stringify:** withhold the suggestion when `stringify` is already bound (closes [#1419](https://github.com/BluMintInc/eslint-custom-rules/issues/1419)) ([1f6593b](https://github.com/BluMintInc/eslint-custom-rules/commit/1f6593b8b026206baa94de674e67167a1dcfd2f5))
* **prefer-document-flattening:** anchor the shouldFlatten insertion on the trailing comma (closes [#1420](https://github.com/BluMintInc/eslint-custom-rules/issues/1420)) ([3d00e52](https://github.com/BluMintInc/eslint-custom-rules/commit/3d00e521b13bd8420e4db1d91fbf3560c2642236))
* **react-memoize-literals:** carry the react hook import with the wrapper (closes [#1421](https://github.com/BluMintInc/eslint-custom-rules/issues/1421)) ([f469db9](https://github.com/BluMintInc/eslint-custom-rules/commit/f469db9137dfeeee5abaa3d4b7dd7776c5da2846))

## [1.20.29](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.28...v1.20.29) (2026-07-30)


### Bug Fixes

* **global-const-style:** exempt bare-identifier binding aliases (closes [#1418](https://github.com/BluMintInc/eslint-custom-rules/issues/1418)) ([ae19434](https://github.com/BluMintInc/eslint-custom-rules/commit/ae19434c9ae76c4e2fc1911f941387c09303521c))

## [1.20.28](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.27...v1.20.28) (2026-07-30)


### Bug Fixes

* **require-image-optimized:** exempt the component's own implementation and decline unbound fixes (closes [#1417](https://github.com/BluMintInc/eslint-custom-rules/issues/1417)) ([89d00f3](https://github.com/BluMintInc/eslint-custom-rules/commit/89d00f3db63e2190f3d5c5032ba9b333306ccee1))

## [1.20.27](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.26...v1.20.27) (2026-07-30)


### Bug Fixes

* **logical-top-to-bottom-grouping:** keep a trailing comment with the statement it annotates (closes [#1416](https://github.com/BluMintInc/eslint-custom-rules/issues/1416)) ([f59dfe1](https://github.com/BluMintInc/eslint-custom-rules/commit/f59dfe1fb8b73a2eda54436e1e29b35c86be0bab))

## [1.20.26](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.25...v1.20.26) (2026-07-30)


### Bug Fixes

* **enforce-assert-safe-object-key:** keep the assertSafe import when the carrier violation is disabled inline (closes [#1408](https://github.com/BluMintInc/eslint-custom-rules/issues/1408)) ([5dd4add](https://github.com/BluMintInc/eslint-custom-rules/commit/5dd4addc8c940de448fc4e282afbe00ddae0c80f))
* **enforce-memoize-async:** keep the Memoize import when the carrier violation is disabled (closes [#1404](https://github.com/BluMintInc/eslint-custom-rules/issues/1404)) ([56b5b6b](https://github.com/BluMintInc/eslint-custom-rules/commit/56b5b6b4eaef4dcf16dc7a469895457d5b1a3f7b))
* **enforce-memoize-getters:** keep the Memoize import when the carrier violation is disabled inline (closes [#1409](https://github.com/BluMintInc/eslint-custom-rules/issues/1409)) ([dae59c6](https://github.com/BluMintInc/eslint-custom-rules/commit/dae59c66dae575f0c44a29fe830dca6ff9925c1c))
* **enforce-querykey-ts:** exclude suppressed reports from the import plan and carrier choice (closes [#1410](https://github.com/BluMintInc/eslint-custom-rules/issues/1410)) ([293d523](https://github.com/BluMintInc/eslint-custom-rules/commit/293d5235ed9db0e715714615f76ffedeccf27a32))
* **enforce-stable-hash-spread-props:** keep the stableHash import when the carrier violation is disabled inline (closes [#1413](https://github.com/BluMintInc/eslint-custom-rules/issues/1413)) ([e205f76](https://github.com/BluMintInc/eslint-custom-rules/commit/e205f76e9378e3ac0ea394a8fa17848399ad9a4e))
* **fast-deep-equal-over-microdiff:** keep the isEqual import when the carrier violation is disabled inline (closes [#1415](https://github.com/BluMintInc/eslint-custom-rules/issues/1415)) ([5c17bee](https://github.com/BluMintInc/eslint-custom-rules/commit/5c17bee32ab07005741e50fa44e9ac620c93db24))
* **logical-top-to-bottom-grouping:** emit a fully-satisfying reordering as one fix (closes [#1405](https://github.com/BluMintInc/eslint-custom-rules/issues/1405)) ([fc21359](https://github.com/BluMintInc/eslint-custom-rules/commit/fc21359708ca65acefd24988345157fb0a275723))
* **no-array-length-in-deps:** keep both planned imports when the carrier violation is disabled inline (closes [#1412](https://github.com/BluMintInc/eslint-custom-rules/issues/1412)) ([b3d131b](https://github.com/BluMintInc/eslint-custom-rules/commit/b3d131bb9951d22f5551d60a0bae75f56883e279))
* **prefer-fragment-component:** keep the Fragment import when the carrier violation is disabled inline (closes [#1407](https://github.com/BluMintInc/eslint-custom-rules/issues/1407)) ([484272b](https://github.com/BluMintInc/eslint-custom-rules/commit/484272b7f935340851987732594c092795f6ce9a))
* **prefer-type-over-interface:** insert `=` after the type parameters (closes [#1403](https://github.com/BluMintInc/eslint-custom-rules/issues/1403)) ([4651cef](https://github.com/BluMintInc/eslint-custom-rules/commit/4651cefaac5794ff46201fdf5de8f5ce5ad4ebd5))
* **prefer-type-over-interface:** join heritage clauses with `&` in the autofix (closes [#1406](https://github.com/BluMintInc/eslint-custom-rules/issues/1406)) ([7521a8f](https://github.com/BluMintInc/eslint-custom-rules/commit/7521a8fb48632f0630acc224598e50798cfea80c))
* **prefer-usecallback-over-usememo-for-functions:** exclude suppressed violations from the conversion plan (closes [#1411](https://github.com/BluMintInc/eslint-custom-rules/issues/1411)) ([bd33a34](https://github.com/BluMintInc/eslint-custom-rules/commit/bd33a349efd2f402deae7b365b8bec3ba9012a39))
* **require-memoize-jsx-returners:** keep the Memoize import when the carrier violation is disabled inline (closes [#1414](https://github.com/BluMintInc/eslint-custom-rules/issues/1414)) ([3e807b3](https://github.com/BluMintInc/eslint-custom-rules/commit/3e807b3b3dc8228b5504751eed7b1acf1a289f5a))

## [1.20.25](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.24...v1.20.25) (2026-07-30)


### Bug Fixes

* **no-entire-object-hook-deps:** render optional links per segment (closes [#1401](https://github.com/BluMintInc/eslint-custom-rules/issues/1401)) ([5877951](https://github.com/BluMintInc/eslint-custom-rules/commit/58779518e2a71908ab9f22d6900e9b645a0f5fee))
* **prefer-map-over-conditional-dispatch:** validate the synthesized Record annotation (closes [#1402](https://github.com/BluMintInc/eslint-custom-rules/issues/1402)) ([31bf682](https://github.com/BluMintInc/eslint-custom-rules/commit/31bf682249dcc4ad330d43c50bef8d0dae55287e))

## [1.20.24](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.23...v1.20.24) (2026-07-30)


### Bug Fixes

* **use-latest-callback:** apply the import rewrite and call conversions atomically (closes [#1400](https://github.com/BluMintInc/eslint-custom-rules/issues/1400)) ([7afff3d](https://github.com/BluMintInc/eslint-custom-rules/commit/7afff3d17a15b97c0812344c5409be0ac6387de4))

## [1.20.23](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.22...v1.20.23) (2026-07-30)


### Bug Fixes

* **no-array-length-in-deps:** insert generated memo in the variable's own scope (closes [#1398](https://github.com/BluMintInc/eslint-custom-rules/issues/1398)) ([d007870](https://github.com/BluMintInc/eslint-custom-rules/commit/d007870b641a66b77a46c16da775f9531e110e3e))
* **require-dynamic-firebase-imports:** keep type-only specifiers out of the runtime import (closes [#1399](https://github.com/BluMintInc/eslint-custom-rules/issues/1399)) ([e8c2a67](https://github.com/BluMintInc/eslint-custom-rules/commit/e8c2a67b9a1d48e349e4fd563c42741a41111bad))

## [1.20.22](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.21...v1.20.22) (2026-07-30)


### Bug Fixes

* **parallelize-async-operations:** exempt test files and stop schema defaults erasing barriers (closes [#1395](https://github.com/BluMintInc/eslint-custom-rules/issues/1395)) ([0058f34](https://github.com/BluMintInc/eslint-custom-rules/commit/0058f347fdc771b42eadb839d73016d70f7da8e3))
* **prefer-clone-deep:** only autofix when the file already imports the helper (closes [#1396](https://github.com/BluMintInc/eslint-custom-rules/issues/1396)) ([1e7ca8c](https://github.com/BluMintInc/eslint-custom-rules/commit/1e7ca8c646b36b2155acae8f625a770b1d0ab7b2)), closes [#1389](https://github.com/BluMintInc/eslint-custom-rules/issues/1389)

## [1.20.21](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.20...v1.20.21) (2026-07-29)


### Bug Fixes

* **enforce-querykey-ts:** exempt parameter bindings from the constant requirement (closes [#1393](https://github.com/BluMintInc/eslint-custom-rules/issues/1393)) ([e3ab399](https://github.com/BluMintInc/eslint-custom-rules/commit/e3ab399153f776a9d41d460e7b663f14a81b21d4))
* **prefer-global-router-state-key:** exempt parameter bindings from the constant requirement (closes [#1394](https://github.com/BluMintInc/eslint-custom-rules/issues/1394)) ([1eee0ed](https://github.com/BluMintInc/eslint-custom-rules/commit/1eee0ed5c6fa5c3b1fca097686f278a9d274294d))

## [1.20.20](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.19...v1.20.20) (2026-07-29)


### Bug Fixes

* **enforce-querykey-ts:** derive the inserted queryKeys import specifier (closes [#1391](https://github.com/BluMintInc/eslint-custom-rules/issues/1391)) ([52741da](https://github.com/BluMintInc/eslint-custom-rules/commit/52741da566ab686bca516aeae301fe1e960ae1ca))
* **prefer-global-router-state-key:** derive queryKeys import specifier from file path (closes [#1390](https://github.com/BluMintInc/eslint-custom-rules/issues/1390)) ([7e36c6a](https://github.com/BluMintInc/eslint-custom-rules/commit/7e36c6a782f47a465518c827c8c3ad3d84ffbfec))

## [1.20.19](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.18...v1.20.19) (2026-07-29)


### Bug Fixes

* **prefer-clone-deep:** derive autofix import specifier from file tier (closes [#1389](https://github.com/BluMintInc/eslint-custom-rules/issues/1389)) ([3772021](https://github.com/BluMintInc/eslint-custom-rules/commit/377202121ad7ac221a13b014e923f82310c245e7))

## [1.20.18](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.17...v1.20.18) (2026-07-29)


### Bug Fixes

* **parallelize-async-operations:** treat route transitions as an ordering barrier (closes [#1388](https://github.com/BluMintInc/eslint-custom-rules/issues/1388)) ([451e5fc](https://github.com/BluMintInc/eslint-custom-rules/commit/451e5fc14450ff4608b8edbd73a36d2a91e64318))

## [1.20.17](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.16...v1.20.17) (2026-07-29)


### Bug Fixes

* **no-mock-firebase-admin:** skip interpolated jest.mock specifiers (closes [#1386](https://github.com/BluMintInc/eslint-custom-rules/issues/1386)) ([4169834](https://github.com/BluMintInc/eslint-custom-rules/commit/4169834d14025a6a41966685f5826f8d7371e407))

## [1.20.16](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.15...v1.20.16) (2026-07-29)


### Bug Fixes

* **no-mock-firebase-admin:** resolve specifier tier before flagging (closes [#1385](https://github.com/BluMintInc/eslint-custom-rules/issues/1385)) ([05b8e66](https://github.com/BluMintInc/eslint-custom-rules/commit/05b8e66f3dea38de8c1ba853bd0f8b28a0aa52d3))

## [1.20.15](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.14...v1.20.15) (2026-07-29)


### Bug Fixes

* **enforce-boolean-naming-prefixes:** drop false fixable declaration (closes [#1376](https://github.com/BluMintInc/eslint-custom-rules/issues/1376)) ([c74ed56](https://github.com/BluMintInc/eslint-custom-rules/commit/c74ed567800133a240398e4795c469eaa8708f68))
* **no-restricted-properties-fix:** drop false fixable declaration (closes [#1381](https://github.com/BluMintInc/eslint-custom-rules/issues/1381)) ([9842df6](https://github.com/BluMintInc/eslint-custom-rules/commit/9842df67212811e44c7b3d7cdf84d8e5054b3730))
* **no-type-assertion-returns:** drop false fixable declaration (closes [#1377](https://github.com/BluMintInc/eslint-custom-rules/issues/1377)) ([a1dbbcd](https://github.com/BluMintInc/eslint-custom-rules/commit/a1dbbcdf022168de00ca9325a28ce31bcb1ebc39))
* **no-unsafe-firestore-spread:** drop false fixable declaration (closes [#1382](https://github.com/BluMintInc/eslint-custom-rules/issues/1382)) ([cd6d21f](https://github.com/BluMintInc/eslint-custom-rules/commit/cd6d21f0cdc98660278f4b39b486f8d410f86e1c))
* **no-unused-props:** drop false fixable declaration (closes [#1378](https://github.com/BluMintInc/eslint-custom-rules/issues/1378)) ([21865a9](https://github.com/BluMintInc/eslint-custom-rules/commit/21865a9f3e00d3078da5147c76c5c71d6f9831df))
* **prefer-batch-operations:** drop false fixable declaration (closes [#1383](https://github.com/BluMintInc/eslint-custom-rules/issues/1383)) ([5ec0300](https://github.com/BluMintInc/eslint-custom-rules/commit/5ec03003b3f80b4e60798e10bc8a2a6f7ae53c02))
* **prefer-field-paths-in-transforms:** drop false fixable declaration (closes [#1384](https://github.com/BluMintInc/eslint-custom-rules/issues/1384)) ([fa8b543](https://github.com/BluMintInc/eslint-custom-rules/commit/fa8b543ee66bd808cddaba73cde85593c24a58f5))
* **prefer-settings-object:** drop false fixable declaration (closes [#1379](https://github.com/BluMintInc/eslint-custom-rules/issues/1379)) ([70562bf](https://github.com/BluMintInc/eslint-custom-rules/commit/70562bf9c0878330701a5e87bffe64f5f94a9074))
* **require-https-error:** stop flagging throws in Jest test files (closes [#1380](https://github.com/BluMintInc/eslint-custom-rules/issues/1380)) ([08dbffc](https://github.com/BluMintInc/eslint-custom-rules/commit/08dbffcff4d76f4df65d4e6140275f10ec7c03dd))

## [1.20.14](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.13...v1.20.14) (2026-07-29)


### Bug Fixes

* **global-const-style:** stop appending as const after a type assertion (closes [#1375](https://github.com/BluMintInc/eslint-custom-rules/issues/1375)) ([a45e51a](https://github.com/BluMintInc/eslint-custom-rules/commit/a45e51ad0aa6badc80d7eb3deb06ac5d422fa0aa))

## [1.20.13](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.12...v1.20.13) (2026-07-29)


### Bug Fixes

* **require-props-composition:** exempt caller-injected component prop slots (closes [#1374](https://github.com/BluMintInc/eslint-custom-rules/issues/1374)) ([7615c16](https://github.com/BluMintInc/eslint-custom-rules/commit/7615c160bdd3f478f1dd2932b6cd10064f761f17))

## [1.20.12](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.11...v1.20.12) (2026-07-28)


### Bug Fixes

* **test-file-location-enforcement:** accept suite-qualifier test files (closes [#1372](https://github.com/BluMintInc/eslint-custom-rules/issues/1372)) ([b2abb0f](https://github.com/BluMintInc/eslint-custom-rules/commit/b2abb0f39bab3b91a63a1044e78f9738e3cb3eae))

## [1.20.11](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.10...v1.20.11) (2026-07-28)


### Bug Fixes

* **prefer-clone-deep:** flag only partial deep copies of the same base (closes [#1371](https://github.com/BluMintInc/eslint-custom-rules/issues/1371)) ([0581b08](https://github.com/BluMintInc/eslint-custom-rules/commit/0581b082d2f18e7e5528bc40e8454bab6a518816)), closes [#1364](https://github.com/BluMintInc/eslint-custom-rules/issues/1364)

## [1.20.10](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.9...v1.20.10) (2026-07-28)


### Bug Fixes

* **enforce-early-destructuring:** withhold the hoist when a declarator is annotated (closes [#1362](https://github.com/BluMintInc/eslint-custom-rules/issues/1362)) ([24b7238](https://github.com/BluMintInc/eslint-custom-rules/commit/24b7238dbec6f6c7559548c06bc0ac7b23680437))
* **enforce-m3-sentence-case:** escape suggestions per target and sentence-case ALL-CAPS fully (closes [#1370](https://github.com/BluMintInc/eslint-custom-rules/issues/1370)) ([4b986bb](https://github.com/BluMintInc/eslint-custom-rules/commit/4b986bb1426016c5a1b504f58e5ed545625d90d4))
* **enforce-props-naming-consistency:** rename references and keep the Props annotation (closes [#1358](https://github.com/BluMintInc/eslint-custom-rules/issues/1358)) ([c64ca8e](https://github.com/BluMintInc/eslint-custom-rules/commit/c64ca8eb0f095de3b6b34a2932562a75fcad3400))
* **enforce-querykey-ts:** import the QUERY_KEY constant the fix substitutes (closes [#1365](https://github.com/BluMintInc/eslint-custom-rules/issues/1365)) ([1ac8eca](https://github.com/BluMintInc/eslint-custom-rules/commit/1ac8eca8a1def8ac727e825f9ffded4be8cc989f))
* **enforce-react-type-naming:** rename references and keep the type annotation (closes [#1357](https://github.com/BluMintInc/eslint-custom-rules/issues/1357)) ([6798b06](https://github.com/BluMintInc/eslint-custom-rules/commit/6798b067abc5c164eebab7ba7eb099f1ed9c1ef7)), closes [#1351](https://github.com/BluMintInc/eslint-custom-rules/issues/1351)
* **enforce-snapshot-state-narrowing:** keep polarity and import the guard (closes [#1369](https://github.com/BluMintInc/eslint-custom-rules/issues/1369)) ([d408d1c](https://github.com/BluMintInc/eslint-custom-rules/commit/d408d1c21583cec104c8509725d89b19ef7ff33d))
* **no-class-instance-destructuring:** withhold the fix for annotated patterns (closes [#1359](https://github.com/BluMintInc/eslint-custom-rules/issues/1359)) ([b43a74d](https://github.com/BluMintInc/eslint-custom-rules/commit/b43a74da58957dd55194ac79cad0ed0faf9ddfe9))
* **no-excessive-parent-chain:** suggest the handler's actual parameter name (closes [#1368](https://github.com/BluMintInc/eslint-custom-rules/issues/1368)) ([bb64076](https://github.com/BluMintInc/eslint-custom-rules/commit/bb6407622e99fae5941bf637ad8826336b69c0b4))
* **no-unnecessary-destructuring:** preserve the declarator's type annotation (closes [#1361](https://github.com/BluMintInc/eslint-custom-rules/issues/1361)) ([c9d0d01](https://github.com/BluMintInc/eslint-custom-rules/commit/c9d0d01322f7a1dc5ee9dc91e7f4fc3a94ecefd4))
* **prefer-clone-deep:** stop dropping nested spreads and import cloneDeep (closes [#1364](https://github.com/BluMintInc/eslint-custom-rules/issues/1364)) ([f1c566e](https://github.com/BluMintInc/eslint-custom-rules/commit/f1c566e91eae9cdf7e82d3e9550a1d9655372983))
* **prefer-destructuring-no-class:** withhold the fix for annotated declarators (closes [#1360](https://github.com/BluMintInc/eslint-custom-rules/issues/1360)) ([9fcca7f](https://github.com/BluMintInc/eslint-custom-rules/commit/9fcca7fe53ba91286e89b33e6ffd8359e2368e2d))
* **prefer-usecallback-over-usememo-for-functions:** rewrite imports with the call (closes [#1367](https://github.com/BluMintInc/eslint-custom-rules/issues/1367)) ([addecb5](https://github.com/BluMintInc/eslint-custom-rules/commit/addecb5d938e66c4b1c5e833a859a3fa5576c85a))
* **use-custom-memo:** re-emit surviving react import specifiers faithfully (closes [#1366](https://github.com/BluMintInc/eslint-custom-rules/issues/1366)) ([9f479f3](https://github.com/BluMintInc/eslint-custom-rules/commit/9f479f31ed9162a15ffd931c0ad4304bd1b42291))
* **use-latest-callback:** keep the react import while any useCallback reference survives (closes [#1363](https://github.com/BluMintInc/eslint-custom-rules/issues/1363)) ([8927931](https://github.com/BluMintInc/eslint-custom-rules/commit/89279311da4204ec4469841ee9a54a599a03cb35))

## [1.20.9](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.8...v1.20.9) (2026-07-28)


### Bug Fixes

* **prefer-spread-over-reassembly:** preserve the parameter's type annotation (closes [#1356](https://github.com/BluMintInc/eslint-custom-rules/issues/1356)) ([782cc9c](https://github.com/BluMintInc/eslint-custom-rules/commit/782cc9cad95a23fe30c55b67f16fba9b4efdca1a))

## [1.20.8](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.7...v1.20.8) (2026-07-28)


### Bug Fixes

* **enforce-props-argument-name:** rename parameter references, not just the declaration (closes [#1355](https://github.com/BluMintInc/eslint-custom-rules/issues/1355)) ([bbe671d](https://github.com/BluMintInc/eslint-custom-rules/commit/bbe671d4967819d93459f6ed4561f9c29835f4f1)), closes [#1313](https://github.com/BluMintInc/eslint-custom-rules/issues/1313)

## [1.20.7](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.6...v1.20.7) (2026-07-28)


### Bug Fixes

* **no-redundant-annotation-assertion:** resolve type format flags lazily (closes [#1354](https://github.com/BluMintInc/eslint-custom-rules/issues/1354)) ([50167cd](https://github.com/BluMintInc/eslint-custom-rules/commit/50167cd8e54e24a53ac23e4b1fb4af8fb5d8c877))
* **no-usememo-for-pass-by-value:** resolve compiler type flags lazily (refs [#1354](https://github.com/BluMintInc/eslint-custom-rules/issues/1354)) ([025f8e9](https://github.com/BluMintInc/eslint-custom-rules/commit/025f8e9d8d81db542fe166899f3b222a518ac628))

## [1.20.6](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.5...v1.20.6) (2026-07-28)


### Bug Fixes

* **deps:** declare @typescript-eslint/utils as a runtime dependency (closes [#1353](https://github.com/BluMintInc/eslint-custom-rules/issues/1353)) ([ad0c0d6](https://github.com/BluMintInc/eslint-custom-rules/commit/ad0c0d653e2c31810b9ac83a5a9f248139852aa1))

## [1.20.5](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.4...v1.20.5) (2026-07-28)


### Bug Fixes

* **require-props-composition:** prove imported zero-prop children off disk (closes [#1316](https://github.com/BluMintInc/eslint-custom-rules/issues/1316)) ([82e307c](https://github.com/BluMintInc/eslint-custom-rules/commit/82e307c7db97669df9e5fd01ab48375883915fa8))

## [1.20.4](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.3...v1.20.4) (2026-07-25)


### Bug Fixes

* **no-unnecessary-verb-suffix:** stop the rename autofix from renaming shorthand keys and re-exported names (closes [#1352](https://github.com/BluMintInc/eslint-custom-rules/issues/1352)) ([e13b7bb](https://github.com/BluMintInc/eslint-custom-rules/commit/e13b7bb6327e6dda65f3c864249dfc7259bda664)), closes [#1313](https://github.com/BluMintInc/eslint-custom-rules/issues/1313)

## [1.20.3](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.2...v1.20.3) (2026-07-25)


### Bug Fixes

* **no-unnecessary-verb-suffix:** preserve type annotations when the rename autofix renames an identifier (closes [#1351](https://github.com/BluMintInc/eslint-custom-rules/issues/1351)) ([715c2a5](https://github.com/BluMintInc/eslint-custom-rules/commit/715c2a5d3f181c10efff2956d4e4139e54a1b797))

## [1.20.2](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.1...v1.20.2) (2026-07-25)


### Bug Fixes

* **no-unnecessary-verb-suffix:** exempt member names dictated by a declared contract (closes [#1350](https://github.com/BluMintInc/eslint-custom-rules/issues/1350)) ([36060c9](https://github.com/BluMintInc/eslint-custom-rules/commit/36060c9de546b174da3f0996f48263fa3aaed896))

## [1.20.1](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.20.0...v1.20.1) (2026-07-24)


### Bug Fixes

* **enforce-boolean-naming-prefixes:** skip boolean-prefixed callees whose return is demonstrably non-boolean (closes [#1346](https://github.com/BluMintInc/eslint-custom-rules/issues/1346)) ([be94356](https://github.com/BluMintInc/eslint-custom-rules/commit/be94356379064c69567f8d7318786dfdd50092f5)), closes [#1249](https://github.com/BluMintInc/eslint-custom-rules/issues/1249) [#822](https://github.com/BluMintInc/eslint-custom-rules/issues/822)
* **enforce-firestore-facade:** classify batches by import origin, not variable name (closes [#1348](https://github.com/BluMintInc/eslint-custom-rules/issues/1348)) ([f5c99b2](https://github.com/BluMintInc/eslint-custom-rules/commit/f5c99b26c2032e81ec7b16de8924a449bb0b8940))
* **react-memoize-literals:** exempt argument literals whose callee cannot return their reference (closes [#1349](https://github.com/BluMintInc/eslint-custom-rules/issues/1349)) ([e39d7f7](https://github.com/BluMintInc/eslint-custom-rules/commit/e39d7f7b8abcc7ccf16c51a2db0c54d2c575d32e)), closes [#1329](https://github.com/BluMintInc/eslint-custom-rules/issues/1329) [#1329](https://github.com/BluMintInc/eslint-custom-rules/issues/1329)
* **react-memoize-literals:** skip hook names resolved inside jest.mock and factory callbacks (closes [#1347](https://github.com/BluMintInc/eslint-custom-rules/issues/1347)) ([10de351](https://github.com/BluMintInc/eslint-custom-rules/commit/10de3511ad6136bba06c2a5dfadeb58907b0524d))

# [1.20.0](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.19.32...v1.20.0) (2026-07-24)


### Features

* **no-render-function-components:** flag render* functions returning JSX consumed as plain calls (closes [#1345](https://github.com/BluMintInc/eslint-custom-rules/issues/1345)) ([471aa49](https://github.com/BluMintInc/eslint-custom-rules/commit/471aa4970985b7bb5b100bad38f665bc4d64369b)), closes [#1243](https://github.com/BluMintInc/eslint-custom-rules/issues/1243)

## [1.19.32](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.19.31...v1.19.32) (2026-07-24)


### Bug Fixes

* **enforce-positive-naming:** recognize wrapped and annotated non-boolean validator returns ([04235c2](https://github.com/BluMintInc/eslint-custom-rules/commit/04235c22517a9441fac4c283c166ad4b73cc4e5a))

## [1.19.31](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.19.30...v1.19.31) (2026-07-24)


### Bug Fixes

* **enforce-positive-naming:** don't flag non-boolean validator predicates (closes [#1344](https://github.com/BluMintInc/eslint-custom-rules/issues/1344)) ([dafe190](https://github.com/BluMintInc/eslint-custom-rules/commit/dafe19072204127bd5a9fa11f79434b3e77ca800))

## [1.19.30](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.19.29...v1.19.30) (2026-07-23)


### Bug Fixes

* **require-props-composition:** resolve named aliases through union arms (closes [#1343](https://github.com/BluMintInc/eslint-custom-rules/issues/1343)) ([b3a4e02](https://github.com/BluMintInc/eslint-custom-rules/commit/b3a4e0250f3c95e174207638d575fd470969796f))

## [1.19.29](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.19.28...v1.19.29) (2026-07-23)


### Bug Fixes

* **enforce-id-capitalization:** exempt DOM attribute-name arguments (closes [#1337](https://github.com/BluMintInc/eslint-custom-rules/issues/1337)) ([2c69532](https://github.com/BluMintInc/eslint-custom-rules/commit/2c695327acb4a9dfeb123de37366a6f44183276c))

## [1.19.28](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.19.27...v1.19.28) (2026-07-23)


### Bug Fixes

* **memo-nested-react-components:** exempt memo/forwardRef components returned from useMemo/useDeepCompareMemo callbacks (closes [#1336](https://github.com/BluMintInc/eslint-custom-rules/issues/1336)) ([1d04656](https://github.com/BluMintInc/eslint-custom-rules/commit/1d04656840e128403fe251a261eef7be400fd045))

## [1.19.27](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.19.26...v1.19.27) (2026-07-23)


### Bug Fixes

* **parallelize-async-operations:** treat mutation→refetch bare-identifier awaits as ordered (closes [#1334](https://github.com/BluMintInc/eslint-custom-rules/issues/1334)) ([2f91dab](https://github.com/BluMintInc/eslint-custom-rules/commit/2f91dab48d267f3dd00a3007c0edf786716132d0))

## [1.19.26](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.19.25...v1.19.26) (2026-07-23)


### Bug Fixes

* **no-console-error:** allow structured Error argument via allowErrorInstanceArgument (closes [#1333](https://github.com/BluMintInc/eslint-custom-rules/issues/1333)) ([737611d](https://github.com/BluMintInc/eslint-custom-rules/commit/737611dca6422fae868888f79c54a59d1dbb20fd))

## [1.19.25](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.19.24...v1.19.25) (2026-07-22)


### Bug Fixes

* **enforce-safe-stringify:** offer JSON.stringify rewrite as a suggestion, not an unconditional auto-fix (closes [#1332](https://github.com/BluMintInc/eslint-custom-rules/issues/1332)) ([62da767](https://github.com/BluMintInc/eslint-custom-rules/commit/62da767d9efdf38ecd9999c15901bb505df11176))

## [1.19.24](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.19.23...v1.19.24) (2026-07-22)


### Bug Fixes

* **enforce-positive-naming:** exempt ingest word family from in- prefix heuristic (closes [#1331](https://github.com/BluMintInc/eslint-custom-rules/issues/1331)) ([c384551](https://github.com/BluMintInc/eslint-custom-rules/commit/c384551f88c5f784835b788dc45cbb65d0afeaac)), closes [#859](https://github.com/BluMintInc/eslint-custom-rules/issues/859) [#772](https://github.com/BluMintInc/eslint-custom-rules/issues/772) [#1261](https://github.com/BluMintInc/eslint-custom-rules/issues/1261)
* **vertically-group-related-functions:** fill the mismatched slot instead of evicting its occupant (closes [#1330](https://github.com/BluMintInc/eslint-custom-rules/issues/1330)) ([613c4b0](https://github.com/BluMintInc/eslint-custom-rules/commit/613c4b0e6f85710ceaf5e9b2eeb7ca3cc644291a))

## [1.19.23](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.19.22...v1.19.23) (2026-07-22)


### Bug Fixes

* **react-memoize-literals:** exempt literal args to primitively-consumed plain calls (closes [#1329](https://github.com/BluMintInc/eslint-custom-rules/issues/1329)) ([6dbacb5](https://github.com/BluMintInc/eslint-custom-rules/commit/6dbacb589a8e20732fff4ae01c3cda4b1b669b3a))

## [1.19.22](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.19.21...v1.19.22) (2026-07-22)


### Bug Fixes

* **memo-compare-deeply-complex-props:** exempt DOM-node props (HTMLElement | null) from complex-prop check (closes [#1327](https://github.com/BluMintInc/eslint-custom-rules/issues/1327)) ([b32b28b](https://github.com/BluMintInc/eslint-custom-rules/commit/b32b28babff6bddda36673de2f808197745925f5))

## [1.19.21](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.19.20...v1.19.21) (2026-07-21)


### Bug Fixes

* **enforce-object-literal-as-const:** exempt identifier/member array elements returned from hooks (closes [#1324](https://github.com/BluMintInc/eslint-custom-rules/issues/1324)) ([edd6c79](https://github.com/BluMintInc/eslint-custom-rules/commit/edd6c7936d7a6dda11c7164c12662396c9e8965c)), closes [#511](https://github.com/BluMintInc/eslint-custom-rules/issues/511) [#511](https://github.com/BluMintInc/eslint-custom-rules/issues/511)

## [1.19.20](https://github.com/BluMintInc/eslint-custom-rules/compare/v1.19.19...v1.19.20) (2026-07-18)


### Bug Fixes

* **prefer-map-over-conditional-dispatch:** qualify JSX value/discriminant type via enclosingDeclaration (closes [#1322](https://github.com/BluMintInc/eslint-custom-rules/issues/1322)) ([b238075](https://github.com/BluMintInc/eslint-custom-rules/commit/b238075122f121d3670f2fa1573908da9427e51e))

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
