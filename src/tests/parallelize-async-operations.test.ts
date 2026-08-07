import { ESLint, Rule } from 'eslint';
import { parallelizeAsyncOperations } from '../rules/parallelize-async-operations';
import { ruleTesterTs } from '../utils/ruleTester';

const formatMessage = (awaitCount: number) =>
  parallelizeAsyncOperations.meta.messages.parallelizeAsyncOperations.replace(
    /{{awaitCount}}/g,
    awaitCount.toString(),
  );

const error = (awaitCount: number) => ({
  messageId: 'parallelizeAsyncOperations' as const,
  data: { awaitCount: awaitCount.toString() },
});

// An awaited interaction followed by an awaited assertion that observes its
// side effect. No value flows between them, so every syntactic barrier in the
// rule considers them independent; only the filename distinguishes a test from
// production code. Reused across the test-file exemption cases so the filename
// is the ONLY variable. (#1395)
const ORDER_DEPENDENT_AWAITS = `
async function submit() {
  await userEvent.click(screen.getByText('go'));
  await waitFor(() => { expect(screen.getByText('done')).toBeInTheDocument(); });
}
`;

const ORDER_DEPENDENT_AWAITS_FIXED = `
async function submit() {
  await Promise.all([
    userEvent.click(screen.getByText('go')),
    waitFor(() => { expect(screen.getByText('done')).toBeInTheDocument(); })
  ]);
}
`;

// Simple test that will always pass
test('parallelize-async-operations rule exists', () => {
  expect(parallelizeAsyncOperations).toBeDefined();
});

test('parallelize-async-operations message explains why and how to fix', () => {
  expect(formatMessage(2)).toBe(
    'Awaiting 2 independent async operations sequentially makes their network and I/O latency add up, which slows responses and wastes compute. These awaits have no data dependency or per-call error handling, so run them together with Promise.all([...]) and destructure the results when you need individual values.',
  );
});

// `flush` is one of the rule's built-in side-effect patterns, so this pair is a
// barrier and must not be reported -- unless those built-in patterns get lost.
const BUILT_IN_SIDE_EFFECT_CODE = `
async function persist(entry) {
  await writeEntry(entry);
  await flush();
}
`;

// What the same snippet becomes once a caller clears `sideEffectPatterns`, so
// `flush` stops acting as an ordering barrier.
const BUILT_IN_SIDE_EFFECT_FIXED = `
async function persist(entry) {
  await Promise.all([
    writeEntry(entry),
    flush()
  ]);
}
`;

// The mirror direction: neither callee matches a built-in pattern, so this
// parallelizes under the defaults and only a caller-supplied pattern can hold
// it back. `sideEffectPatterns` REPLACES the built-in list rather than
// extending it, which is why both directions are asserted.
const CUSTOM_SIDE_EFFECT_CODE = `
async function sync(a, b) {
  await uploadAvatar(a);
  await archiveEntry(b);
}
`;

const CUSTOM_SIDE_EFFECT_FIXED = `
async function sync(a, b) {
  await Promise.all([
    uploadAvatar(a),
    archiveEntry(b)
  ]);
}
`;

/**
 * Lints through the ESLint class rather than RuleTester because only the ESLint
 * class validates rule options with ajv's `useDefaults`, which is what writes
 * schema defaults into the supplied options object. RuleTester cannot observe
 * this failure mode at all.
 */
const lintProductionFile = async (options?: Record<string, unknown>) => {
  const eslint = new ESLint({
    useEslintrc: false,
    ignore: false,
    overrideConfig: {
      parser: require.resolve('@typescript-eslint/parser'),
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
      plugins: ['blumint'],
      rules: {
        'blumint/parallelize-async-operations': options
          ? ['error', options]
          : 'error',
      },
    },
    plugins: {
      blumint: {
        rules: {
          'parallelize-async-operations':
            parallelizeAsyncOperations as unknown as Rule.RuleModule,
        },
      },
    },
  });
  const [result] = await eslint.lintText(BUILT_IN_SIDE_EFFECT_CODE, {
    filePath: 'src/util/persist.ts',
  });
  return result.messages;
};

// Supplying an options object must not discard the rule's own side-effect
// pattern defaults. A schema-level `default: []` would be written into the
// user's options by ESLint's ajv instance and then win the merge against
// `defaultOptions`, silently dropping `commit`/`flush`/counter barriers and
// reporting the sequences they exist to protect. (#1395)
test('sideEffectPatterns declares no schema default that could erase the built-in patterns', () => {
  const properties = (
    parallelizeAsyncOperations.meta.schema as [
      { properties: Record<string, Record<string, unknown>> },
    ]
  )[0].properties;
  expect(properties.sideEffectPatterns.default).toBeUndefined();
  expect(properties.ignoreTestFiles.default).toBeUndefined();
});

test('built-in side-effect patterns survive an explicit options object', async () => {
  expect(await lintProductionFile()).toHaveLength(0);
  expect(await lintProductionFile({})).toHaveLength(0);
  expect(await lintProductionFile({ ignoreTestFiles: false })).toHaveLength(0);
});

test('the side-effect barrier is what suppresses the control snippet', async () => {
  // Clearing the patterns explicitly is the caller's own choice, and proves the
  // snippet is otherwise reportable -- so the assertions above are not vacuous.
  expect(await lintProductionFile({ sideEffectPatterns: [] })).toHaveLength(1);
});

ruleTesterTs.run('parallelize-async-operations', parallelizeAsyncOperations, {
  valid: [
    // Already using Promise.all
    `
    async function goodFunction() {
      await Promise.all([
        asyncOperation1(),
        asyncOperation2()
      ]);
      return true;
    }
    `,

    // Single await is fine
    `
    async function singleAwait() {
      await asyncOperation();
      return true;
    }
    `,

    // Sequential awaits with dependencies
    `
    async function sequentialWithDependencies() {
      const result1 = await asyncOperation1();
      const result2 = await asyncOperation2(result1);
      return result2;
    }
    `,

    // Awaits in individual try-catch blocks
    `
    async function individualErrorHandling() {
      try {
        await asyncOperation1();
      } catch (error) {
        handleError1(error);
      }

      try {
        await asyncOperation2();
      } catch (error) {
        handleError2(error);
      }

      return true;
    }
    `,

    // Awaits in a loop
    `
    async function processItems(items) {
      for (const item of items) {
        await processItem(item);
      }
      return true;
    }
    `,

    // Non-consecutive awaits
    `
    async function nonConsecutiveAwaits() {
      await asyncOperation1();
      doSomethingSync();
      await asyncOperation2();
      return true;
    }
    `,

    // Awaits with side effects
    `
    async function awaitsWithSideEffects() {
      await updateCounter();
      // This might depend on side effects from updateCounter
      await checkThreshold();
      return true;
    }
    `,

    // Awaits in different scopes
    `
    async function differentScopes() {
      await asyncOperation1();

      if (condition) {
        await asyncOperation2();
      }

      return true;
    }
    `,

    // Using await with destructuring - this should be detected as a dependency
    // because we're using destructuring which creates variables that might be used
    {
      code: `
      async function destructuringAwait() {
        const { data: data1 } = await fetchData1();
        const { data: data2 } = await fetchData2();
        return { data1, data2 };
      }
      `,
    },

    // Using await with complex expressions
    `
    async function complexExpressions() {
      const result1 = (await fetchData1()).transform();
      const result2 = (await fetchData2()).transform();
      return { result1, result2 };
    }
    `,

    // Sequential awaits with dependencies - result1 is used in result2
    `
    async function sequentialAwaitsWithAssignments() {
      const result1 = await operation1();
      const result2 = await operation2(result1);
      return { result1, result2 };
    }
    `,

    // Awaits in different scopes (different blocks)
    `
    async function differentScopes() {
      await operation1();

      if (condition) {
        await operation2();
      }

      return true;
    }
    `,

    // Complex expressions with dependencies
    `
    async function complexExpressionsWithDeps() {
      const data = await (await fetch(url1)).json();
      const result = await processData(data);
      return result;
    }
    `,

    // Awaits with very specific side effect patterns
    `
    async function awaitsWithSpecificSideEffects() {
      await updateCounter();
      await checkThreshold();
      return true;
    }
    `,

    // Mixed await styles with dependencies
    `
    async function mixedAwaitStylesWithDeps() {
      const result = await operation1();
      await operation2(result);
      return result;
    }
    `,

    // Awaits separated by other statements
    `
    async function separatedAwaits() {
      await operation1();
      console.log('between operations');
      await operation2();
      return true;
    }
    `,

    // Single await
    `
    async function singleAwaitOnly() {
      await operation1();
      return true;
    }
    `,

    // Awaits with return values used later
    `
    async function awaitWithReturnUsage() {
      const user = await getUser();
      const profile = await getProfile(user.id);
      return { user, profile };
    }
    `,

    // Awaits in different control flow
    `
    async function differentControlFlow() {
      await operation1();

      if (someCondition) {
        return early;
      }

      await operation2();
      return true;
    }
    `,

    // Awaits with complex destructuring dependencies
    `
    async function complexDestructuringDeps() {
      const { id, name } = await fetchUser();
      const profile = await fetchProfile(id);
      return { name, profile };
    }
    `,

    // Edge case: Awaits with array destructuring dependencies
    `
    async function arrayDestructuringDeps() {
      const [first, second] = await getArray();
      const result = await processItem(first);
      return result;
    }
    `,

    // Edge case: Awaits with rest parameter dependencies
    `
    async function restParameterDeps() {
      const { id, ...rest } = await getData();
      const processed = await processData(id);
      return { processed, rest };
    }
    `,

    // Edge case: Awaits with nested destructuring dependencies
    `
    async function nestedDestructuringDeps() {
      const { user: { id } } = await fetchUserData();
      const profile = await fetchProfile(id);
      return profile;
    }
    `,

    // Edge case: Awaits with property access dependencies
    `
    async function propertyAccessDeps() {
      const user = await getUser();
      const profile = await getProfile(user.id);
      const settings = await getSettings(user.preferences.theme);
      return { user, profile, settings };
    }
    `,

    // Edge case: Awaits with method call dependencies
    `
    async function methodCallDeps() {
      const data = await fetchData();
      const processed = await processData(data.getValue());
      return processed;
    }
    `,

    // Edge case: Awaits with computed property dependencies
    `
    async function computedPropertyDeps() {
      const config = await getConfig();
      const value = await getValue(config['dynamic-key']);
      return value;
    }
    `,

    // Edge case: Awaits with function call dependencies
    `
    async function functionCallDeps() {
      const input = await getInput();
      const result = await process(transform(input));
      return result;
    }
    `,

    // Edge case: Awaits in different loop types
    `
    async function forInLoop() {
      for (const key in obj) {
        await processKey(key);
      }
      return true;
    }
    `,

    `
    async function whileLoop() {
      while (condition) {
        await processItem();
      }
      return true;
    }
    `,

    `
    async function doWhileLoop() {
      do {
        await processItem();
      } while (condition);
      return true;
    }
    `,

    // Edge case: Awaits with conditional assignment
    `
    async function conditionalAssignment() {
      const data = condition ? await fetchData1() : await fetchData2();
      const result = await processData(data);
      return result;
    }
    `,

    // Edge case: Awaits with logical operators
    `
    async function logicalOperators() {
      const data = await fetchData();
      const result = data && await processData(data);
      return result;
    }
    `,

    // Edge case: Awaits with nullish coalescing
    `
    async function nullishCoalescing() {
      const data = await fetchData();
      const fallback = data ?? await getFallbackData();
      return fallback;
    }
    `,

    // Edge case: Awaits with optional chaining
    `
    async function optionalChaining() {
      const user = await getUser();
      const profile = await getProfile(user?.id);
      return profile;
    }
    `,

    // Edge case: Awaits with template literal dependencies
    `
    async function templateLiteralDeps() {
      const userId = await getUserId();
      const profile = await fetch(\`/api/users/\${userId}/profile\`);
      return profile;
    }
    `,

    // Edge case: Awaits with spread operator dependencies
    `
    async function spreadOperatorDeps() {
      const baseData = await getBaseData();
      const result = await processData({ ...baseData, extra: 'value' });
      return result;
    }
    `,

    // Edge case: Awaits with assignment expression dependencies
    `
    async function assignmentExpressionDeps() {
      let data;
      data = await fetchData();
      const result = await processData(data);
      return result;
    }
    `,

    // Edge case: Awaits with update expression dependencies
    `
    async function updateExpressionDeps() {
      let counter = await getCounter();
      const result = await processCounter(++counter);
      return result;
    }
    `,

    // Edge case: Awaits with very specific side effect method names
    `
    async function verySpecificSideEffects() {
      await updateCounterValue();
      await checkThresholdLimit();
      return true;
    }
    `,

    // Edge case: Awaits with side effect function names
    `
    async function sideEffectFunctions() {
      await incrementCounterFunction();
      await checkThresholdFunction();
      return true;
    }
    `,

    // Edge case: Awaits in try-catch with shared catch (should not be parallelized)
    `
    async function sharedTryCatch() {
      try {
        await operation1();
        await operation2();
      } catch (error) {
        handleError(error);
      }
      return true;
    }
    `,

    // Edge case: Awaits in nested try-catch (should not be parallelized)
    `
    async function nestedTryCatch() {
      try {
        try {
          await operation1();
          await operation2();
        } catch (innerError) {
          handleInnerError(innerError);
        }
      } catch (outerError) {
        handleOuterError(outerError);
      }
      return true;
    }
    `,

    // Regression: Batch manager dependency (Issue #1147)
    `
    async function batchManagerRegression() {
      const batchManager = options?.batchManager ?? new BatchManager<Notification>();

      await Promise.all(
        settings.map((setting) => {
          const filer = new NotificationFiler(setting);
          return filer.store({ batchManager });
        }),
      );
      await batchManager.commit();
    }
    `,
    `
    async function batchManagerSimple() {
      const batch = new Batch();
      await batch.add(item);
      await batch.commit();
    }
    `,
    `
    async function coordinatorShared() {
      await manager.doSomething();
      await manager.doSomethingElse();
    }

    async function coordinatorExplicitlyNamed() {
      await unitofwork.doSomething();
      await unitofwork.doSomethingElse();
    }
    `,
    // Regression (#1283): COORDINATOR_PATTERN must match the literal identifier
    // "coordinator" itself, not just batch/manager/transaction/etc.
    `
    async function processWithCoordinator() {
      await coordinator.doSomething();
      await coordinator.doSomethingElse();
    }
    `,
    // Regression (#1283): "aggregator" is a coordinator-like identifier too.
    `
    async function processWithAggregator() {
      await aggregator.doSomething();
      await aggregator.doSomethingElse();
    }
    `,
    // property-based coordinator
    `
    async function propertyCoordinator() {
      await myObj.batchManager.add(item1);
      await myObj.batchManager.add(item2);
    }
    `,
    // Regression: Optional chaining with side-effect patterns (Issue #1147)
    `
    async function optionalChainingSideEffect() {
      await batchManager?.commit();
      await batchManager?.flush();
    }
    `,
    // Gate-then-side-effect: no DATA dependency, but a control-flow / side-effect
    // ordering dependency. The first await is a guard that throws to abort; the
    // second must run ONLY if the gate passed. Promise.all would invoke
    // activateBracket even when assertStartable rejects, so these must stay
    // sequential and the rule must NOT flag them.
    `
async function startTournament(tournamentId: string) {
  await assertStartable(tournamentId);
  await activateBracket(tournamentId);
}
`,
    // Guard verb: validate*
    `
async function saveIfValid(input) {
  await validateInput(input);
  await persistRecord(input);
}
`,
    // Guard verb: ensure*
    `
async function ensureThenMutate(id) {
  await ensureExists(id);
  await deleteRecord(id);
}
`,
    // Guard verb: require*
    `
async function requireThenAct(user) {
  await requireAuth(user);
  await performAction(user);
}
`,
    // Guard verb: verify*
    `
async function verifyThenTransfer(account) {
  await verifyOwnership(account);
  await transferFunds(account);
}
`,
    // Guard verb: guard*
    `
async function guardThenRun(ctx) {
  await guardAgainstAbuse(ctx);
  await runJob(ctx);
}
`,
    // Guard verb: check*
    `
async function checkThenSend(recipient) {
  await checkAccess(recipient);
  await sendMessage(recipient);
}
`,
    // Member-expression guard callee gating a member-expression side effect.
    `
async function memberGuard(x) {
  await validator.assertValid(x);
  await repo.save(x);
}
`,
    // Optional-call (ChainExpression) guard callee gating a side effect.
    `
async function optionalGuard(x) {
  await guards?.assert(x);
  await mutate(x);
}
`,
    // Three awaits: a leading guard gates the two side effects that follow.
    `
async function guardBeforeTwo(orderId) {
  await assertPayable(orderId);
  await capturePayment(orderId);
  await markPaid(orderId);
}
`,
    // Read-after-write on the SAME receiver: NOT parallelizable. The `.get()`
    // must observe the value written by the preceding `.set()`; running them
    // in Promise.all would race the read against the write. (Issue #1287)
    `
        declare function makeRef(): {
          set: (v: unknown) => Promise<void>;
          get: () => Promise<number>;
        };
        export const bumpVersion = async () => {
          const ref = makeRef();
          await ref.set(1);
          const value = await ref.get();
          return value;
        };
      `,
    // Shared receiver with the write result captured in an (unused) variable:
    // the shared receiver still carries the ordering dependency. (Issue #1287)
    `
        declare function makeRef(): {
          set: (v: unknown) => Promise<void>;
          get: () => Promise<number>;
        };
        export const bumpVersion = async () => {
          const ref = makeRef();
          const writeResult = await ref.set(1);
          const value = await ref.get();
          return { writeResult, value };
        };
      `,
    // Two reads on the same receiver are conservatively kept sequential: a
    // shared mutable receiver can carry hidden state (e.g. a paginated cursor),
    // so skipping the flag is a safe no-op. (Issue #1287)
    `
      async function methodCallAwaits() {
        await api.getData();
        await api.getMoreData();
        await api.getEvenMoreData();
        return true;
      }
      `,
    // Computed-member calls on the same receiver identifier are also kept
    // sequential (the receiver `api` is shared even though the method is a
    // string literal). (Issue #1287)
    `
      async function computedPropertyAccess() {
        await api['getData']();
        await api['processData']();
        await api['saveData']();
        return 'completed';
      }
      `,
    // Refetch/refresh ordering barrier (#1334): a mutation followed by a
    // state-refetch must stay sequential. Promise.all would race the refetch
    // ahead of the mutation, so a refresh that resolves first repopulates the
    // just-unlinked provider.
    {
      code: `
    async function unlink(providerId: string, providerUid: string) {
      await unlinkProvider({ providerId, providerUid });
      await refreshUser();
    }
  `,
    },
    // Refetch verb: reload* -- mutation then reload re-reads mutated state.
    `
async function saveThenReload(record) {
  await saveRecord(record);
  await reloadData();
}
`,
    // Refetch verb: refetch* -- mutation then refetch of the mutated resource.
    `
async function updateThenRefetch(profile) {
  await updateProfile(profile);
  await refetchProfile();
}
`,
    // Refetch verb: revalidate* -- write then revalidate (e.g. Next.js cache).
    `
async function writeThenRevalidate(path) {
  await writePost(path);
  await revalidatePath(path);
}
`,
    // Refetch verb: resync* -- mutation then resync of local state.
    `
async function mutateThenResync(id) {
  await deleteItem(id);
  await resyncState();
}
`,
    // Refetch verb: sync* -- mutation then cache sync re-reads server state.
    `
async function persistThenSync(entry) {
  await persistEntry(entry);
  await syncCache();
}
`,
    // Member-expression refetch on a DISTINCT receiver: the shared-receiver
    // barrier does NOT apply here (api vs cache), so ONLY the refetch barrier
    // keeps this sequential. A cache.refresh() after api.save() re-reads state
    // the save produced. (#1334)
    `
async function saveThenRefreshCache(entity) {
  await api.save(entity);
  await cache.refresh();
}
`,
    // Member-expression refetch on the SAME receiver: both the shared-receiver
    // barrier (#1287) and the refetch barrier (#1334) cover this; it must stay
    // sequential. (#1334)
    `
async function mutateThenRefreshStore(value) {
  await store.mutate(value);
  await store.refresh();
}
`,
    // Three awaits where only the LAST is a refresh: the trailing refetch
    // observes state produced by the two preceding mutations. (#1334)
    `
async function twoMutationsThenRefresh(a, b) {
  await createRecord(a);
  await updateRecord(b);
  await refreshList();
}
`,
    // Optional-call (ChainExpression) refetch following a mutation. (#1334)
    `
async function mutateThenOptionalRefresh(x) {
  await mutateThing(x);
  await refresh?.();
}
`,

    // The exact reproduction from #1388: navigate FIRST so the accept flow's
    // guard dialogs mount on the destination page. Parallelizing opens them on
    // the source page, where the landing route change destroys them.
    `
const execute = async () => {
  await push(buildTournamentUrl({ tournamentId }));
  await acceptPending({ teamId, subjectUserId: toId });
};
`,
    // Member-expression navigation via the router object. (#1388)
    `
async function routerPushThenFlow(tournamentId) {
  await router.push(buildTournamentUrl({ tournamentId }));
  await startRegistration(tournamentId);
}
`,
    // A trailing navigation is equally load-bearing: parallelizing would race
    // the route change against the save, navigating away before it settles.
    // (#1388)
    `
async function saveThenNavigate(draft, url) {
  await saveDraft(draft);
  await push(url);
}
`,
    // router.replace is a route transition too. (#1388)
    `
async function replaceThenTrack(url) {
  await router.replace(url);
  await trackPageView(url);
}
`,
    // Router methods that are not themselves navigation verbs still count,
    // because the receiver identifies the whole call as routing. (#1388)
    `
async function routerBackThenRenderWidget(id) {
  await router.back();
  await renderWidget(id);
}
`,
    // history.go is navigation by receiver, not by verb. (#1388)
    `
async function historyGoThenRender() {
  await history.go(-1);
  await renderDestination();
}
`,
    // Suffixed navigation verbs (navigateTo, redirectTo) match the anchored
    // leading-verb pattern. (#1388)
    `
async function navigateToThenPrompt(url) {
  await navigateTo(url);
  await promptInstall();
}
`,
    `
async function redirectToLoginThenTrack() {
  await redirectToLogin();
  await trackRedirect();
}
`,
    // Optional-call navigation. (#1388)
    `
async function optionalPushThenFlow(url) {
  await push?.(url);
  await acceptPending();
}
`,
    // A navigation in the MIDDLE of a run bars the whole run, not just the
    // adjacent pair. (#1388)
    `
async function loadNavigateThenFlow(id, url) {
  await loadProfile(id);
  await push(url);
  await acceptPending(id);
}
`,
    // A captured navigation result qualifies as well: the hazard is the route
    // transition itself, not the value it returns. (#1388)
    `
async function capturedNavigationResult(url) {
  const navigated = await push(url);
  await acceptPending();
}
`,
    // Test files are exempt: an awaited assertion observes the DOM state a
    // preceding awaited interaction produces, so the ordering is load-bearing
    // and the latency rationale does not apply. (#1395)
    {
      code: `
it('shows the message', async () => {
  await userEvent.click(screen.getByText('go'));
  await waitFor(() => { expect(screen.getByText('done')).toBeInTheDocument(); });
});
`,
      filename: 'src/components/Thing.test.tsx',
    },
    // Every recognized test-file shape, with the code held constant. (#1395)
    {
      code: ORDER_DEPENDENT_AWAITS,
      filename: 'src/hooks/useThing.test.ts',
    },
    {
      code: ORDER_DEPENDENT_AWAITS,
      filename: 'src/components/Thing.test.tsx',
    },
    {
      code: ORDER_DEPENDENT_AWAITS,
      filename: 'src/hooks/useThing.spec.ts',
    },
    {
      code: ORDER_DEPENDENT_AWAITS,
      filename: 'src/components/Thing.spec.tsx',
    },
    {
      code: ORDER_DEPENDENT_AWAITS,
      filename: 'src/legacy/thing.test.js',
    },
    {
      code: ORDER_DEPENDENT_AWAITS,
      filename: 'src/legacy/thing.spec.jsx',
    },
    // ESM/CJS TypeScript extensions carry the same suffix. (#1395)
    {
      code: ORDER_DEPENDENT_AWAITS,
      filename: 'src/hooks/useThing.test.mts',
    },
    // Multi-part suffixes still end in `.test.ts`. (#1395)
    {
      code: ORDER_DEPENDENT_AWAITS,
      filename: 'functions/src/util/EventRegistry.integration.test.ts',
    },
    // Jest convention directories exempt their contents regardless of filename.
    {
      code: ORDER_DEPENDENT_AWAITS,
      filename: 'src/components/__tests__/Thing.ts',
    },
    {
      code: ORDER_DEPENDENT_AWAITS,
      filename: 'src/__mocks__/firebase.ts',
    },
    // A `__tests__` segment anywhere in the path counts, including nested
    // subdirectories beneath it. (#1395)
    {
      code: ORDER_DEPENDENT_AWAITS,
      filename: 'src/a/__tests__/b/c.ts',
    },
    // A leading `__tests__/` segment matches the start-of-path alternative.
    {
      code: ORDER_DEPENDENT_AWAITS,
      filename: '__tests__/setup.ts',
    },
    // Absolute monorepo paths are the real-world shape reported by ESLint.
    {
      code: ORDER_DEPENDENT_AWAITS,
      filename: '/workspace/src/components/__tests__/Thing.tsx',
    },
    // Windows separators are normalized, so the directory check holds there.
    {
      code: ORDER_DEPENDENT_AWAITS,
      filename: 'C:\\repo\\src\\__tests__\\Thing.ts',
    },
    // `flush` is a built-in side-effect pattern, so the defaults treat this as
    // an ordering barrier. Paired with the invalid case that empties
    // `sideEffectPatterns` over the identical snippet.
    {
      code: BUILT_IN_SIDE_EFFECT_CODE,
    },
    // A caller-supplied pattern makes `archiveEntry` a barrier, suppressing the
    // report the defaults produce for this same snippet.
    {
      code: CUSTOM_SIDE_EFFECT_CODE,
      options: [{ sideEffectPatterns: ['archiveEntry'] }],
    },
    // A nested `await` inside a call argument is a data dependency: `dropped` is
    // an element of the very array the preceding `Promise.all` aggregates, so the
    // release cannot start any earlier. Folding these into one aggregate orphans
    // the aggregate's rejection. (array-element aliasing + argument-nested await)
    {
      filename: 'functions/src/util/tournament/team/TeamAssigner.ts',
      code: `
        const drop = async () => 'dropped';
        const assign = async () => undefined;
        const release = async (args: { results: string[] }) => args;

        async function assignToTeam() {
          const dropped = drop();
          const ops: Promise<unknown>[] = [dropped, assign()];
          await Promise.all(ops);
          await release({ results: [await dropped] });
        }
      `,
    },
    // Same dependency reached through an inline array literal, with no
    // intermediate `ops` variable. Isolates the argument-nested-await channel
    // from the array-variable-aliasing channel.
    {
      filename: 'functions/src/util/tournament/team/TeamAssigner.ts',
      code: `
        const drop = async () => 'dropped';
        const assign = async () => undefined;
        const release = async (args: { results: string[] }) => args;

        async function assignToTeam() {
          const dropped = drop();
          await Promise.all([dropped, assign()]);
          await release({ results: [await dropped] });
        }
      `,
    },
    // Conservative fallback case: even with NO data dependency, hoisting a
    // trailing statement that contains an `await` into a Promise.all([...])
    // array literal orphans element 0's promise when it rejects. The fixer is
    // unsound here, so the rule must not report.
    {
      filename: 'functions/src/util/tournament/team/TeamAssigner.ts',
      code: `
        const drop = async () => 'dropped';
        const assign = async () => undefined;
        const release = async (args: { results: string[] }) => args;

        async function assignToTeam() {
          const other = drop();
          const ops: Promise<unknown>[] = [drop(), assign()];
          await Promise.all(ops);
          await release({ results: [await other] });
        }
      `,
    },
    // The dependency survives without any nested await: `dropped` is an element
    // of the array `Promise.all` aggregates, so the aggregate is still producing
    // the value the second await reads. Proves the aliasing barrier stands on
    // its own rather than riding on the nested-await guard. (#1541)
    `
    async function aggregateThenConsumeElement() {
      const dropped = drop();
      const ops = [dropped, assign()];
      await Promise.all(ops);
      const result = await dropped;
      return result;
    }
    `,
    // Same aliasing through an inline array literal. (#1541)
    `
    async function inlineAggregateThenConsumeElement() {
      const dropped = drop();
      await Promise.all([dropped, assign()]);
      const result = await dropped;
      return result;
    }
    `,
    // Reaching the aggregated promise by index rather than by its own binding
    // is the same dependency, expressed through the array's name. (#1541)
    `
    async function aggregateThenIndexElement() {
      const ops = [drop(), assign()];
      await Promise.all(ops);
      await report(ops[0]);
    }
    `,
    // A spread element carries its source array's promises into the aggregate,
    // so the source name identifies them afterwards. (#1541)
    `
    async function spreadAggregateThenDrain(extras) {
      await Promise.all([...extras]);
      await drainQueue(extras);
    }
    `,
    // Every array-taking Promise combinator leaves its members reachable by
    // name, so the aliasing barrier is not specific to Promise.all. (#1541)
    `
    async function allSettledThenConsumeElement() {
      const dropped = drop();
      const ops = [dropped, assign()];
      await Promise.allSettled(ops);
      const outcome = await dropped;
      return outcome;
    }
    `,
    // A nested await in RECEIVER position is unsound to hoist for exactly the
    // reason an argument-nested one is: the array literal suspends at `await
    // fetch(url1)` while the earlier element's promise is already running with
    // no handler attached. The rewrite is also a latency no-op, since
    // `fetch(url2)` cannot start until `fetch(url1)` resolves. (#1541)
    `
    async function complexExpressionAwaits() {
      await (await fetch(url1)).json();
      await (await fetch(url2)).json();
      return true;
    }
    `,
    // The same shape with the first result captured. (#1541)
    `
    async function complexExpressions() {
      const data = await (await fetch(url1)).json();
      await (await fetch(url2)).json();
      return data;
    }
    `,
    // A nested await inside a captured trailing await is equally unsound: it
    // suspends the array literal after the leading element's promise exists.
    // (#1541)
    `
    async function capturedNestedAwait() {
      await sendPing();
      const payload = await wrap(await load());
      return payload;
    }
    `,
    /**
     * A callback assigning an outer-scope binding that a later await reads is a
     * data dependency the rule cannot see: extractVariableNames collects only
     * names DECLARED by the run's own statements, so `teamMutator` is never
     * tested by check #1 in hasDependencies.
     */
    `
async function exitTeam(db, teamId) {
  let teamMutator;
  await db.runTransaction(async (transaction) => {
    teamMutator = new TeamMutator(transaction, teamId);
  });
  await teamMutator?.deleteIfEmptied();
}
`,
    /** Same dependency, non-optional read — the ?. must not be what decides. */
    `
async function exitTeamStrict(db, teamId) {
  let teamMutator;
  await db.runTransaction(async () => {
    teamMutator = new TeamMutator(teamId);
  });
  await teamMutator.deleteIfEmptied();
}
`,
    /** Same dependency, read as an ARGUMENT rather than a receiver. */
    `
async function captureThenPersist(runner) {
  let captured;
  await runner.execute(async () => { captured = compute(); });
  await persist(captured);
}
`,
    /**
     * Regression pin for the name lottery: this is the SAME structure as the
     * first case with the binding renamed to something COORDINATOR_PATTERN
     * happens to match. It passes today only by accident; it must keep passing
     * for the right reason once write-detection lands.
     */
    `
async function exitTeamCoordinatorNamed(db, teamId) {
  let batchManager;
  await db.runTransaction(async () => {
    batchManager = new TeamMutator(teamId);
  });
  await batchManager?.deleteIfEmptied();
}
`,
    // A write through a member expression mutates state reachable from the root
    // binding, so a later await naming that binding observes it. (#1723)
    `
async function propertyWriteThenRead(runner) {
  const box = {};
  await runner.execute(async () => { box.value = compute(); });
  await persist(box);
}
`,
    // The root of a nested member write is the binding that carries the change.
    // (#1723)
    `
async function nestedPropertyWriteThenRead(runner) {
  const state = { nested: {} };
  await runner.execute(async () => { state.nested.value = compute(); });
  await persist(state);
}
`,
    // A compound assignment both reads and writes, and the write is what a
    // later await depends on. (#1723)
    `
async function compoundAssignmentThenRead(runner) {
  let total = 0;
  await runner.execute(async () => { total += computeDelta(); });
  await persist(total);
}
`,
    // An update expression is a write with no assignment operator in sight.
    // (#1723)
    `
async function updateExpressionThenRead(runner) {
  let count = 0;
  await runner.execute(async () => { count++; });
  await persist(count);
}
`,
    // A destructuring assignment writes every leaf of its pattern. (#1723)
    `
async function objectDestructuringWriteThenRead(runner) {
  let alpha;
  let beta;
  await runner.execute(async () => { ({ alpha, beta } = computeParts()); });
  await persist(alpha, beta);
}
`,
    // The array form of the same write. (#1723)
    `
async function arrayDestructuringWriteThenRead(runner) {
  let head;
  await runner.execute(async () => { [head] = computeParts(); });
  await persist(head);
}
`,
    // A for-of head that is not a declaration assigns an existing binding on
    // every iteration. (#1723)
    `
async function forOfWriteThenRead(runner, items) {
  let current;
  await runner.execute(async () => {
    for (current of items) { record(current); }
  });
  await persist(current);
}
`,
    // Depth does not dilute the dependency: the write reaches the outer binding
    // through two nested callbacks. (#1723)
    `
async function nestedCallbackWriteThenRead(runner, items) {
  let captured;
  await runner.execute(async () => {
    items.forEach((item) => { captured = item; });
  });
  await persist(captured);
}
`,
    // The callback need not be async -- a synchronous visitor handed to an
    // awaited call publishes its writes just the same. (#1723)
    `
async function plainFunctionCallbackWriteThenRead(runner) {
  let captured;
  await runner.execute(function () { captured = compute(); });
  await persist(captured);
}
`,
    // ------------------------------------------------------------------
    // Fold-accumulator serialization barrier. `arr.reduce(async (promise, x)
    // => { await promise; ... }, Promise.resolve())` is the canonical idiom for
    // FORCING sequential execution over a collection: the first parameter is
    // the previous iteration's completion, so awaiting it is a serialization
    // point rather than an operation. Parallelizing it discards the exact
    // guarantee the idiom exists to provide. (#1851)
    // ------------------------------------------------------------------
    // The issue's own reproduction.
    `
async function persistAll(documents, collectionRef) {
  const setter = new DocSetter(collectionRef);
  await documents.reduce(async (promise, doc) => {
    await promise;
    await setter.set(doc);
  }, Promise.resolve());
}
`,
    // The accumulator is resolved through the scope chain, not matched against a
    // name list, so every spelling of it is a barrier. (#1851)
    `
async function accumulatorNamedAcc(documents) {
  await documents.reduce(async (acc, doc) => {
    await acc;
    await sendEmail(doc);
  }, Promise.resolve());
}
`,
    `
async function accumulatorNamedPrevious(documents) {
  await documents.reduce(async (previous, doc) => {
    await previous;
    await sendEmail(doc);
  }, Promise.resolve());
}
`,
    `
async function accumulatorNamedPrev(documents) {
  await documents.reduce(async (prev, doc) => {
    await prev;
    await sendEmail(doc);
  }, Promise.resolve());
}
`,
    `
async function accumulatorNamedChain(documents) {
  await documents.reduce(async (chain, doc) => {
    await chain;
    await sendEmail(doc);
  }, Promise.resolve());
}
`,
    // A spelling no name list would ever contain still resolves to parameter
    // zero of the fold callback. (#1851)
    `
async function accumulatorNamedArbitrarily(documents) {
  await documents.reduce(async (soFar, doc) => {
    await soFar;
    await sendEmail(doc);
  }, Promise.resolve());
}
`,
    // Everything after the barrier is blocked, not merely the adjacent pair:
    // each of these operations would start before the previous iteration
    // finished. (#1851)
    `
async function multipleStepsAfterBarrier(documents) {
  await documents.reduce(async (promise, doc) => {
    await promise;
    await stepOne(doc);
    await stepTwo(doc);
    await stepThree(doc);
  }, Promise.resolve());
}
`,
    // `reduceRight` folds the same chain in the opposite direction, so its
    // accumulator carries the same contract. (#1851)
    `
async function reduceRightAccumulator(documents) {
  await documents.reduceRight(async (chain, doc) => {
    await chain;
    await sendEmail(doc);
  }, Promise.resolve());
}
`,
    // A computed string key names the same method. (#1851)
    `
async function computedReduceKey(documents) {
  await documents['reduce'](async (promise, doc) => {
    await promise;
    await sendEmail(doc);
  }, Promise.resolve());
}
`,
    // An optional call reaches the same fold. (#1851)
    `
async function optionalReduceCall(documents) {
  await documents?.reduce(async (promise, doc) => {
    await promise;
    await sendEmail(doc);
  }, Promise.resolve());
}
`,
    // A default on the accumulator still binds it first. (#1851)
    `
async function accumulatorWithDefault(documents) {
  await documents.reduce(async (acc = Promise.resolve(), doc) => {
    await acc;
    await sendEmail(doc);
  }, Promise.resolve());
}
`,
    // A function expression is a fold callback exactly as an arrow is. (#1851)
    `
async function functionExpressionCallback(documents) {
  await documents.reduce(async function (acc, doc) {
    await acc;
    await sendEmail(doc);
  }, Promise.resolve());
}
`,
    // Depth does not dilute the barrier: awaiting the accumulator inside a
    // nested closure still serializes that closure behind the previous
    // iteration. (#1851)
    `
async function accumulatorAwaitedInNestedClosure(documents) {
  await documents.reduce(async (acc, doc) => {
    await withRetry(async () => {
      await acc;
      await sendEmail(doc);
    });
  }, Promise.resolve());
}
`,
    // TS-only wrappers read the same binding. (#1851)
    `
async function nonNullAssertedAccumulator(documents) {
  await documents.reduce(async (acc, doc) => {
    await acc!;
    await sendEmail(doc);
  }, Promise.resolve());
}
`,
    `
async function assertedAccumulator(documents) {
  await documents.reduce(async (acc, doc) => {
    await (acc as Promise<void>);
    await sendEmail(doc);
  }, Promise.resolve());
}
`,
    // A fold over a member-expression receiver, which is how the idiom usually
    // appears in production code. (#1851)
    `
async function foldOverMemberReceiver(batch) {
  await batch.documents.reduce(async (promise, doc) => {
    await promise;
    await store(doc);
  }, Promise.resolve());
}
`,
    // Nested folds: the inner callback's own accumulator is the barrier for the
    // inner run. (#1851)
    `
async function nestedFolds(groups) {
  await groups.reduce(async (outerPromise, group) => {
    await outerPromise;
    await group.items.reduce(async (innerPromise, item) => {
      await innerPromise;
      await store(item);
    }, Promise.resolve());
  }, Promise.resolve());
}
`,
    // A for...of loop is the other spelling of the same sequential intent, and
    // is already exempt through the loop barrier. Held here as the contrast
    // case, so a change that removed the loop barrier would surface next to the
    // fold one. (#1851)
    `
async function sequentialForOf(documents, setter) {
  for (const doc of documents) {
    await validateDoc(doc);
    await setter.store(doc);
  }
}
`,
  ],
  invalid: [
    // Control: different receivers, genuinely independent -> still flagged.
    // Proves the shared-receiver barrier does not suppress real parallelization
    // opportunities. (Issue #1287)
    {
      code: `
        declare function makeRef(): { get: () => Promise<number> };
        export const readBoth = async () => {
          const refA = makeRef();
          const refB = makeRef();
          const a = await refA.get();
          const b = await refB.get();
          return { a, b };
        };
      `,
      errors: [{ messageId: 'parallelizeAsyncOperations' }],
      output: `
        declare function makeRef(): { get: () => Promise<number> };
        export const readBoth = async () => {
          const refA = makeRef();
          const refB = makeRef();
          const [a, b] = await Promise.all([
            refA.get(),
            refB.get()
          ]);
          return { a, b };
        };
      `,
    },
    // Basic case: two sequential awaits with realtimeDb
    {
      code: `
      async function cleanUpReferences(params, ref) {
        await realtimeDb.ref(buildPath(params)).remove();
        await realtimeDb.ref(ref).remove();

        return true;
      }
      `,
      errors: [error(2)],
      output: `
      async function cleanUpReferences(params, ref) {
        await Promise.all([
          realtimeDb.ref(buildPath(params)).remove(),
          realtimeDb.ref(ref).remove()
        ]);

        return true;
      }
      `,
    },

    // Sequential awaits with db.collection
    {
      code: `
      async function methodChaining() {
        await db.collection('users').doc(id1).delete();
        await db.collection('profiles').doc(id2).delete();
        return true;
      }
      `,
      errors: [error(2)],
      output: `
      async function methodChaining() {
        await Promise.all([
          db.collection('users').doc(id1).delete(),
          db.collection('profiles').doc(id2).delete()
        ]);
        return true;
      }
      `,
    },

    // Sequential awaits with comments: a comment between the merged awaits is
    // re-hosted above the element built from the statement it annotated
    // instead of being deleted with the replaced span. (#1589)
    {
      code: `
      async function withComments() {
        // First operation
        await operation1();
        // Second operation
        await operation2();
        return true;
      }
      `,
      errors: [error(2)],
      output: `
      async function withComments() {
        // First operation
        await Promise.all([
          operation1(),
          // Second operation
          operation2()
        ]);
        return true;
      }
      `,
    },

    // An eslint-disable-next-line directive between the merged awaits must be
    // re-hosted directly above the array element it annotates; dropping it
    // silently re-enables the suppressed rule on the surviving code. (#1589)
    {
      code: `
async function saveAll(a, b) {
  await writeProfile(a);
  // eslint-disable-next-line no-console
  await logResult(b);
  return true;
}
`,
      errors: [{ messageId: 'parallelizeAsyncOperations' }],
      output: `
async function saveAll(a, b) {
  await Promise.all([
    writeProfile(a),
    // eslint-disable-next-line no-console
    logResult(b)
  ]);
  return true;
}
`,
    },

    // A trailing comment sharing the previous await's line (the natural home
    // of an eslint-disable-line directive) governs THAT line, so it cannot be
    // re-hosted above the next element without changing which line it applies
    // to. The fix is declined; the report still fires. (#1589)
    {
      code: `
async function saveAll(a, b) {
  await writeProfile(a); // eslint-disable-line no-console
  await logResult(b);
  return true;
}
`,
      errors: [{ messageId: 'parallelizeAsyncOperations' }],
      output: null,
    },

    // A comment between `await` and its operand has no slot in the rebuilt
    // Promise.all text, so the fix is declined rather than deleting it. (#1589)
    {
      code: `
async function saveAll(a, b) {
  await writeProfile(a);
  await /* audit: intentional */ logResult(b);
  return true;
}
`,
      errors: [{ messageId: 'parallelizeAsyncOperations' }],
      output: null,
    },

    // A directive above a variable-declaration await may target the declared
    // identifier, which the rewrite moves into the destructuring pattern on
    // the Promise.all line — no re-hosted placement can keep governing it, so
    // the fix is declined. (#1589)
    {
      code: `
async function loadBoth() {
  const first = await fetchFirst();
  // eslint-disable-next-line camelcase
  const second_raw = await fetchSecond();
  return [first, second_raw];
}
`,
      errors: [{ messageId: 'parallelizeAsyncOperations' }],
      output: null,
    },

    // A plain (non-directive) comment above a variable-declaration await only
    // describes the awaited operation, so it is re-hosted above the element
    // like in the expression-statement case. (#1589)
    {
      code: `
async function loadBoth() {
  const first = await fetchFirst();
  // second fetch is independent of the first
  const second = await fetchSecond();
  return [first, second];
}
`,
      errors: [{ messageId: 'parallelizeAsyncOperations' }],
      output: `
async function loadBoth() {
  const [first, second] = await Promise.all([
    fetchFirst(),
    // second fetch is independent of the first
    fetchSecond()
  ]);
  return [first, second];
}
`,
    },

    // A directive above an expression-statement await stays hostable even when
    // the merge contains a variable declaration elsewhere: the annotated code
    // lands wholly on its element line. (#1589)
    {
      code: `
async function loadAndLog(b) {
  const first = await fetchFirst();
  // eslint-disable-next-line no-console
  await logResult(b);
  return first;
}
`,
      errors: [{ messageId: 'parallelizeAsyncOperations' }],
      output: `
async function loadAndLog(b) {
  const [first, ] = await Promise.all([
    fetchFirst(),
    // eslint-disable-next-line no-console
    logResult(b)
  ]);
  return first;
}
`,
    },

    // A comment inside the awaited expression itself travels verbatim with the
    // element text and never blocks the fix. (#1589)
    {
      code: `
async function saveAll(a, b) {
  await writeProfile(/* keep: primary */ a);
  await logResult(b);
  return true;
}
`,
      errors: [{ messageId: 'parallelizeAsyncOperations' }],
      output: `
async function saveAll(a, b) {
  await Promise.all([
    writeProfile(/* keep: primary */ a),
    logResult(b)
  ]);
  return true;
}
`,
    },

    // Stacked comments above one await each keep their own line, with the
    // directive remaining directly above the element it suppresses. (#1589)
    {
      code: `
async function saveAll(a, b) {
  await writeProfile(a);
  // logging is temporary until the migration completes
  // eslint-disable-next-line no-console
  await logResult(b);
  return true;
}
`,
      errors: [{ messageId: 'parallelizeAsyncOperations' }],
      output: `
async function saveAll(a, b) {
  await Promise.all([
    writeProfile(a),
    // logging is temporary until the migration completes
    // eslint-disable-next-line no-console
    logResult(b)
  ]);
  return true;
}
`,
    },

    // Three sequential awaits - this should be invalid
    {
      code: `
      async function threeSequentialAwaits() {
        await operation1();
        await operation2();
        await operation3();
        return true;
      }
      `,
      errors: [error(3)],
      output: `
      async function threeSequentialAwaits() {
        await Promise.all([
          operation1(),
          operation2(),
          operation3()
        ]);
        return true;
      }
      `,
    },

    // Mixed await styles without dependencies
    {
      code: `
      async function mixedAwaitStyles() {
        await operation1();
        const result = await operation2();
        return result;
      }
      `,
      errors: [error(2)],
      output: `
      async function mixedAwaitStyles() {
        const [, result] = await Promise.all([
          operation1(),
          operation2()
        ]);
        return result;
      }
      `,
    },

    // Arrow function with sequential awaits
    {
      code: `
      const arrowFunction = async () => {
        await operation1();
        await operation2();
        return true;
      };
      `,
      errors: [error(2)],
      output: `
      const arrowFunction = async () => {
        await Promise.all([
          operation1(),
          operation2()
        ]);
        return true;
      };
      `,
    },

    // Class method with sequential awaits
    {
      code: `
      class MyClass {
        async classMethod() {
          await operation1();
          await operation2();
          return true;
        }
      }
      `,
      errors: [error(2)],
      output: `
      class MyClass {
        async classMethod() {
          await Promise.all([
            operation1(),
            operation2()
          ]);
          return true;
        }
      }
      `,
    },

    // Sequential awaits without variable assignments
    {
      code: `
      async function simpleSequentialAwaits() {
        await fetchData1();
        await fetchData2();
        await fetchData3();
        return 'done';
      }
      `,
      errors: [error(3)],
      output: `
      async function simpleSequentialAwaits() {
        await Promise.all([
          fetchData1(),
          fetchData2(),
          fetchData3()
        ]);
        return 'done';
      }
      `,
    },

    // Sequential awaits with independent variable assignments
    {
      code: `
      async function independentVariableAssignments() {
        const data1 = await fetchData1();
        const data2 = await fetchData2();
        return { data1, data2 };
      }
      `,
      errors: [error(2)],
      output: `
      async function independentVariableAssignments() {
        const [data1, data2] = await Promise.all([
          fetchData1(),
          fetchData2()
        ]);
        return { data1, data2 };
      }
      `,
    },

    // Sequential awaits with function calls
    {
      code: `
      async function functionCallAwaits() {
        await processFile(file1);
        await processFile(file2);
        await processFile(file3);
        return 'processed';
      }
      `,
      errors: [error(3)],
      output: `
      async function functionCallAwaits() {
        await Promise.all([
          processFile(file1),
          processFile(file2),
          processFile(file3)
        ]);
        return 'processed';
      }
      `,
    },

    // Sequential awaits with different types of calls
    {
      code: `
      async function mixedCallTypes() {
        await api.method1();
        await standaloneFunction();
        await obj.method2();
        return 'mixed';
      }
      `,
      errors: [error(3)],
      output: `
      async function mixedCallTypes() {
        await Promise.all([
          api.method1(),
          standaloneFunction(),
          obj.method2()
        ]);
        return 'mixed';
      }
      `,
    },

    // Sequential awaits at the end of function
    {
      code: `
      async function awaitsAtEnd() {
        const setup = doSomeSetup();
        await operation1();
        await operation2();
      }
      `,
      errors: [error(2)],
      output: `
      async function awaitsAtEnd() {
        const setup = doSomeSetup();
        await Promise.all([
          operation1(),
          operation2()
        ]);
      }
      `,
    },

    // Sequential awaits with whitespace and formatting
    {
      code: `
      async function withWhitespace() {

        await operation1();

        await operation2();

        return true;
      }
      `,
      errors: [error(2)],
      output: `
      async function withWhitespace() {

        await Promise.all([
          operation1(),
          operation2()
        ]);

        return true;
      }
      `,
    },

    // Sequential awaits with template literals
    {
      code: `
      async function withTemplateLiterals() {
        await fetch(\`/api/\${endpoint1}\`);
        await fetch(\`/api/\${endpoint2}\`);
        return 'fetched';
      }
      `,
      errors: [error(2)],
      output: `
      async function withTemplateLiterals() {
        await Promise.all([
          fetch(\`/api/\${endpoint1}\`),
          fetch(\`/api/\${endpoint2}\`)
        ]);
        return 'fetched';
      }
      `,
    },

    // Sequential awaits in nested blocks
    {
      code: `
      async function nestedBlock() {
        if (condition) {
          await operation1();
          await operation2();
        }
        return true;
      }
      `,
      errors: [error(2)],
      output: `
      async function nestedBlock() {
        if (condition) {
          await Promise.all([
            operation1(),
            operation2()
          ]);
        }
        return true;
      }
      `,
    },

    // Edge case: Four sequential awaits
    {
      code: `
      async function fourSequentialAwaits() {
        await operation1();
        await operation2();
        await operation3();
        await operation4();
        return true;
      }
      `,
      errors: [error(4)],
      output: `
      async function fourSequentialAwaits() {
        await Promise.all([
          operation1(),
          operation2(),
          operation3(),
          operation4()
        ]);
        return true;
      }
      `,
    },

    // Edge case: Sequential awaits with independent variable assignments (no dependencies)
    {
      code: `
      async function independentAssignments() {
        const a = await fetchA();
        const b = await fetchB();
        const c = await fetchC();
        return { a, b, c };
      }
      `,
      errors: [error(3)],
      output: `
      async function independentAssignments() {
        const [a, b, c] = await Promise.all([
          fetchA(),
          fetchB(),
          fetchC()
        ]);
        return { a, b, c };
      }
      `,
    },

    // Edge case: Sequential awaits with mixed expression and variable styles
    {
      code: `
      async function mixedStyles() {
        await sendNotification();
        const data = await fetchData();
        await logActivity();
        return data;
      }
      `,
      errors: [error(3)],
      output: `
      async function mixedStyles() {
        const [, data, ] = await Promise.all([
          sendNotification(),
          fetchData(),
          logActivity()
        ]);
        return data;
      }
      `,
    },

    // Edge case: Sequential awaits with object method calls
    {
      code: `
      async function objectMethodCalls() {
        await cache.clear();
        await database.connect();
        await logger.initialize();
        return 'initialized';
      }
      `,
      errors: [error(3)],
      output: `
      async function objectMethodCalls() {
        await Promise.all([
          cache.clear(),
          database.connect(),
          logger.initialize()
        ]);
        return 'initialized';
      }
      `,
    },

    // Edge case: Sequential awaits with chained method calls
    {
      code: `
      async function chainedMethodCalls() {
        await api.users.getAll();
        await api.posts.getRecent();
        await api.comments.getLatest();
        return 'fetched';
      }
      `,
      errors: [error(3)],
      output: `
      async function chainedMethodCalls() {
        await Promise.all([
          api.users.getAll(),
          api.posts.getRecent(),
          api.comments.getLatest()
        ]);
        return 'fetched';
      }
      `,
    },

    // Edge case: Sequential awaits with function expressions
    {
      code: `
      async function functionExpressions() {
        await (async () => { return 'first'; })();
        await (async () => { return 'second'; })();
        return 'done';
      }
      `,
      errors: [error(2)],
      output: `
      async function functionExpressions() {
        await Promise.all([
          (async () => { return 'first'; })(),
          (async () => { return 'second'; })()
        ]);
        return 'done';
      }
      `,
    },

    // Edge case: Sequential awaits with conditional expressions (no dependencies)
    {
      code: `
      async function conditionalExpressions() {
        await (condition ? fetchA() : fetchB());
        await (otherCondition ? fetchC() : fetchD());
        return 'fetched';
      }
      `,
      errors: [error(2)],
      output: `
      async function conditionalExpressions() {
        await Promise.all([
          condition ? fetchA() : fetchB(),
          otherCondition ? fetchC() : fetchD()
        ]);
        return 'fetched';
      }
      `,
    },

    // Edge case: Sequential awaits with logical expressions (no dependencies)
    {
      code: `
      async function logicalExpressions() {
        await (shouldFetch && fetchData());
        await (shouldProcess || processData());
        return 'processed';
      }
      `,
      errors: [error(2)],
      output: `
      async function logicalExpressions() {
        await Promise.all([
          shouldFetch && fetchData(),
          shouldProcess || processData()
        ]);
        return 'processed';
      }
      `,
    },

    // Edge case: Sequential awaits with new expressions
    {
      code: `
      async function newExpressions() {
        await new Promise(resolve => setTimeout(resolve, 100));
        await new Promise(resolve => setTimeout(resolve, 200));
        return 'delayed';
      }
      `,
      errors: [error(2)],
      output: `
      async function newExpressions() {
        await Promise.all([
          new Promise(resolve => setTimeout(resolve, 100)),
          new Promise(resolve => setTimeout(resolve, 200))
        ]);
        return 'delayed';
      }
      `,
    },

    // Edge case: Sequential awaits with tagged template literals
    {
      code: `
      async function taggedTemplateLiterals() {
        await sql\`SELECT * FROM users\`;
        await sql\`SELECT * FROM posts\`;
        return 'queried';
      }
      `,
      errors: [error(2)],
      output: `
      async function taggedTemplateLiterals() {
        await Promise.all([
          sql\`SELECT * FROM users\`,
          sql\`SELECT * FROM posts\`
        ]);
        return 'queried';
      }
      `,
    },

    // Edge case: Sequential awaits with array access
    {
      code: `
      async function arrayAccess() {
        await operations[0]();
        await operations[1]();
        await operations[2]();
        return 'executed';
      }
      `,
      errors: [error(3)],
      output: `
      async function arrayAccess() {
        await Promise.all([
          operations[0](),
          operations[1](),
          operations[2]()
        ]);
        return 'executed';
      }
      `,
    },

    // Edge case: Sequential awaits with this context
    {
      code: `
      class AsyncClass {
        async sequentialMethods() {
          await this.method1();
          await this.method2();
          await this.method3();
          return 'completed';
        }
      }
      `,
      errors: [error(3)],
      output: `
      class AsyncClass {
        async sequentialMethods() {
          await Promise.all([
            this.method1(),
            this.method2(),
            this.method3()
          ]);
          return 'completed';
        }
      }
      `,
    },

    // Edge case: Sequential awaits with super calls
    {
      code: `
      class ChildClass extends ParentClass {
        async sequentialSuper() {
          await super.method1();
          await super.method2();
          return 'completed';
        }
      }
      `,
      errors: [error(2)],
      output: `
      class ChildClass extends ParentClass {
        async sequentialSuper() {
          await Promise.all([
            super.method1(),
            super.method2()
          ]);
          return 'completed';
        }
      }
      `,
    },

    // Edge case: Sequential awaits with yield expressions (in async generator)
    {
      code: `
      async function* asyncGenerator() {
        await operation1();
        await operation2();
        yield 'done';
      }
      `,
      errors: [error(2)],
      output: `
      async function* asyncGenerator() {
        await Promise.all([
          operation1(),
          operation2()
        ]);
        yield 'done';
      }
      `,
    },

    // Edge case: Sequential awaits with assignment patterns (independent)
    {
      code: `
      async function assignmentPatterns() {
        const x = await getValue1();
        const y = await getValue2();
        const z = await getValue3();
        return x + y + z;
      }
      `,
      errors: [error(3)],
      output: `
      async function assignmentPatterns() {
        const [x, y, z] = await Promise.all([
          getValue1(),
          getValue2(),
          getValue3()
        ]);
        return x + y + z;
      }
      `,
    },

    // Edge case: Sequential awaits with unary expressions
    {
      code: `
      async function unaryExpressions() {
        await +getValue1();
        await -getValue2();
        return 'calculated';
      }
      `,
      errors: [error(2)],
      output: `
      async function unaryExpressions() {
        await Promise.all([
          +getValue1(),
          -getValue2()
        ]);
        return 'calculated';
      }
      `,
    },

    // Guard-barrier fix must NOT suppress genuinely independent value reads.
    // Two variable-declaration awaits with no data dependency, no guard, no
    // coordinator: still parallelizable.
    {
      code: `
      async function independentReads() {
        const a = await fetchA();
        const b = await fetchB();
        return { a, b };
      }
      `,
      errors: [error(2)],
      output: `
      async function independentReads() {
        const [a, b] = await Promise.all([
          fetchA(),
          fetchB()
        ]);
        return { a, b };
      }
      `,
    },

    // Two independent discarded-result awaits whose callees do NOT read as
    // guards (no leading assert/ensure/validate/... verb): still parallelizable.
    {
      code: `
      async function independentSideEffects() {
        await logEvent(x);
        await sendEmail(y);
        return true;
      }
      `,
      errors: [error(2)],
      output: `
      async function independentSideEffects() {
        await Promise.all([
          logEvent(x),
          sendEmail(y)
        ]);
        return true;
      }
      `,
    },

    // A guard-verb callee whose result is ASSIGNED to a variable is NOT a
    // discarded-result guard barrier: it has a value and is governed by the
    // data-dependency path. Since `other` does not consume `ok`, the two reads
    // are independent and remain parallelizable.
    {
      code: `
      async function assignedGuardStillFlagged() {
        const ok = await validateThing(x);
        const other = await fetchOther();
        return { ok, other };
      }
      `,
      errors: [error(2)],
      output: `
      async function assignedGuardStillFlagged() {
        const [ok, other] = await Promise.all([
          validateThing(x),
          fetchOther()
        ]);
        return { ok, other };
      }
      `,
    },

    // Refetch-barrier fix must NOT suppress genuinely independent reads. Two
    // bare-identifier reads whose callees do NOT match a refetch verb
    // (fetch* is not refresh/reload/refetch/revalidate/resync/sync) remain
    // parallelizable. (#1334)
    {
      code: `
      async function independentFetches() {
        await fetchUser();
        await fetchSettings();
        return true;
      }
      `,
      errors: [error(2)],
      output: `
      async function independentFetches() {
        await Promise.all([
          fetchUser(),
          fetchSettings()
        ]);
        return true;
      }
      `,
    },

    // The refetch verb must appear as a LEADING verb: `getRefreshToken` merely
    // CONTAINS "refresh", it does not START with it, so the anchored `^` must
    // not match and the pair stays parallelizable. (#1334)
    {
      code: `
      async function refreshTokenNotLeadingVerb() {
        await getRefreshToken();
        await getSettings();
        return true;
      }
      `,
      errors: [error(2)],
      output: `
      async function refreshTokenNotLeadingVerb() {
        await Promise.all([
          getRefreshToken(),
          getSettings()
        ]);
        return true;
      }
      `,
    },

    // Edge (#1334): a refetch verb in the FIRST position followed by a
    // non-matching independent read. The barrier keys on non-first positions
    // (a refetch depends on what PRECEDES it); with nothing before it, the
    // refresh has no ordering dependency, so the pair remains parallelizable.
    {
      code: `
      async function refreshFirstThenIndependentRead() {
        await refreshUser();
        await fetchSettings();
        return true;
      }
      `,
      errors: [error(2)],
      output: `
      async function refreshFirstThenIndependentRead() {
        await Promise.all([
          refreshUser(),
          fetchSettings()
        ]);
        return true;
      }
      `,
    },

    // The navigation verb must LEAD: `getPushToken` merely contains "push", so
    // the anchored pattern must not match and the pair stays parallelizable.
    // (#1388)
    {
      code: `
      async function pushNotLeadingVerb() {
        await getPushToken();
        await getSettings();
      }
      `,
      errors: [error(2)],
      output: `
      async function pushNotLeadingVerb() {
        await Promise.all([
          getPushToken(),
          getSettings()
        ]);
      }
      `,
    },

    // Same for a trailing "redirect": `fetchRedirectRules` reads configuration,
    // it does not perform a route transition. (#1388)
    {
      code: `
      async function redirectNotLeadingVerb() {
        await fetchRedirectRules();
        await fetchFeatureFlags();
      }
      `,
      errors: [error(2)],
      output: `
      async function redirectNotLeadingVerb() {
        await Promise.all([
          fetchRedirectRules(),
          fetchFeatureFlags()
        ]);
      }
      `,
    },

    // The router-receiver pattern is exact: `navigator` and `historyLog` are
    // not routers, so calls on them remain parallelizable. (#1388)
    {
      code: `
      async function routerLikeReceiverNames() {
        await navigator.getBattery();
        await historyLog.append(entry);
      }
      `,
      errors: [error(2)],
      output: `
      async function routerLikeReceiverNames() {
        await Promise.all([
          navigator.getBattery(),
          historyLog.append(entry)
        ]);
      }
      `,
    },

    // Control for the test-file exemption: the identical code in a production
    // module still reports, so the exemption keys on the filename alone. (#1395)
    {
      code: ORDER_DEPENDENT_AWAITS,
      filename: 'src/hooks/useThing.ts',
      errors: [error(2)],
      output: ORDER_DEPENDENT_AWAITS_FIXED,
    },
    // Production modules whose names merely contain "test"/"spec" keep their
    // enforcement: the exemption matches anchored suffixes and whole path
    // segments, not a bare substring. (#1395)
    {
      code: ORDER_DEPENDENT_AWAITS,
      filename: 'src/util/testHelpers.ts',
      errors: [error(2)],
      output: ORDER_DEPENDENT_AWAITS_FIXED,
    },
    {
      code: ORDER_DEPENDENT_AWAITS,
      filename: 'src/util/latest.ts',
      errors: [error(2)],
      output: ORDER_DEPENDENT_AWAITS_FIXED,
    },
    {
      code: ORDER_DEPENDENT_AWAITS,
      filename: 'src/contest/Thing.ts',
      errors: [error(2)],
      output: ORDER_DEPENDENT_AWAITS_FIXED,
    },
    {
      code: ORDER_DEPENDENT_AWAITS,
      filename: 'src/inspector/specialize.ts',
      errors: [error(2)],
      output: ORDER_DEPENDENT_AWAITS_FIXED,
    },
    // `.test.` must be the final suffix: a helper module named
    // `foo.test.helper.ts` ships production code. (#1395)
    {
      code: ORDER_DEPENDENT_AWAITS,
      filename: 'src/util/foo.test.helper.ts',
      errors: [error(2)],
      output: ORDER_DEPENDENT_AWAITS_FIXED,
    },
    // A directory that merely starts with `__tests__` is not the Jest
    // convention directory. (#1395)
    {
      code: ORDER_DEPENDENT_AWAITS,
      filename: 'src/__tests__helpers/Thing.ts',
      errors: [error(2)],
      output: ORDER_DEPENDENT_AWAITS_FIXED,
    },
    // Consumers can opt back into enforcement inside test files. (#1395)
    {
      code: ORDER_DEPENDENT_AWAITS,
      filename: 'src/components/Thing.test.tsx',
      options: [{ ignoreTestFiles: false }],
      errors: [error(2)],
      output: ORDER_DEPENDENT_AWAITS_FIXED,
    },
    // Clearing `sideEffectPatterns` drops the `flush` barrier that makes the
    // identical snippet valid at the defaults.
    {
      code: BUILT_IN_SIDE_EFFECT_CODE,
      options: [{ sideEffectPatterns: [] }],
      errors: [error(2)],
      output: BUILT_IN_SIDE_EFFECT_FIXED,
    },
    // The defaults parallelize this snippet; the matching valid case above adds
    // the pattern that stops them.
    {
      code: CUSTOM_SIDE_EFFECT_CODE,
      errors: [error(2)],
      output: CUSTOM_SIDE_EFFECT_FIXED,
    },

    // Control for the aggregate-element aliasing barrier: the trailing await
    // shares no name with anything the aggregate holds, so the pair stays
    // parallelizable. Proves expanding `Promise.all(ops)` to `ops` and its
    // elements does not suppress unrelated work. (#1541)
    {
      code: `
      async function aggregateThenUnrelated(ops, payload) {
        await Promise.all(ops);
        await recordMetrics(payload);
      }
      `,
      errors: [error(2)],
      output: `
      async function aggregateThenUnrelated(ops, payload) {
        await Promise.all([
          Promise.all(ops),
          recordMetrics(payload)
        ]);
      }
      `,
    },
    // An inline aggregate whose elements are all freshly-constructed promises
    // binds no name a later await could reference. (#1541)
    {
      code: `
      async function inlineAggregateThenUnrelated() {
        await Promise.all([dropA(), dropB()]);
        await recordMetrics();
      }
      `,
      errors: [error(2)],
      output: `
      async function inlineAggregateThenUnrelated() {
        await Promise.all([
          Promise.all([dropA(), dropB()]),
          recordMetrics()
        ]);
      }
      `,
    },
    // `Promise.resolve` wraps a single value rather than aggregating an array,
    // so its argument is not an aggregated element and the run stays
    // parallelizable. Proves the combinator pattern is exact. (#1541)
    {
      code: `
      async function promiseResolveIsNotAnAggregate(marker) {
        await Promise.resolve(marker);
        await recordMetrics(marker);
      }
      `,
      errors: [error(2)],
      output: `
      async function promiseResolveIsNotAnAggregate(marker) {
        await Promise.all([
          Promise.resolve(marker),
          recordMetrics(marker)
        ]);
      }
      `,
    },
    // Control for the nested-await hoist barrier: an `await` inside a callback
    // belongs to that callback, so the outer expression evaluates straight
    // through to a promise and hoisting it suspends nothing. (#1541)
    {
      code: `
      async function callbackAwaitsStillParallelize(items, others) {
        await Promise.all(items.map(async (item) => await store(item)));
        await recordCompletion(others);
      }
      `,
      errors: [error(2)],
      output: `
      async function callbackAwaitsStillParallelize(items, others) {
        await Promise.all([
          Promise.all(items.map(async (item) => await store(item))),
          recordCompletion(others)
        ]);
      }
      `,
    },
    // The replacement range starts at the first await's offset, so only that
    // line inherits the surrounding indentation. These cases pin the generated
    // continuation lines at three different nesting depths; before the fix the
    // elements landed at column 2 and the closing bracket at column 0 no matter
    // how deep the original awaits sat. (#1557)
    {
      code: `
async function topLevelDepth() {
  await alpha();
  await beta();
}
`,
      errors: [error(2)],
      output: `
async function topLevelDepth() {
  await Promise.all([
    alpha(),
    beta()
  ]);
}
`,
    },
    // Deeper: a callback inside an arrow function.
    {
      code: `
const registerHandlers = () => {
  onReady(async () => {
    await alpha();
    await beta();
  });
};
`,
      errors: [error(2)],
      output: `
const registerHandlers = () => {
  onReady(async () => {
    await Promise.all([
      alpha(),
      beta()
    ]);
  });
};
`,
    },
    // The variable-declaration branch builds its replacement separately from
    // the bare-expression branch, so it needs its own depth assertion. (#1557)
    {
      code: `
const buildLoader = () => {
  const load = async () => {
    const alpha = await loadAlpha();
    const beta = await loadBeta();
    return { alpha, beta };
  };
};
`,
      errors: [error(2)],
      output: `
const buildLoader = () => {
  const load = async () => {
    const [alpha, beta] = await Promise.all([
      loadAlpha(),
      loadBeta()
    ]);
    return { alpha, beta };
  };
};
`,
    },
    // A multi-line argument is spliced in verbatim: the interior lines of this
    // template literal are the string's own contents, so re-indenting them
    // would change the query the code sends. Only the separators and the
    // closing bracket are indented. (#1557)
    {
      code: `
async function multiLineTemplateArgument() {
  await runQuery(\`
SELECT *
  FROM users
\`);
  await recordMetrics();
}
`,
      errors: [error(2)],
      output: `
async function multiLineTemplateArgument() {
  await Promise.all([
    runQuery(\`
SELECT *
  FROM users
\`),
    recordMetrics()
  ]);
}
`,
    },
    // A tab-indented file gets tabs for the generated level, so the fixer never
    // mixes indentation characters into a file that uses neither. (#1557)
    {
      code: 'async function tabIndented() {\n\tawait alpha();\n\tawait beta();\n}\n',
      errors: [error(2)],
      output:
        'async function tabIndented() {\n\tawait Promise.all([\n\t\talpha(),\n\t\tbeta()\n\t]);\n}\n',
    },
    // Controls for the closure-write barrier. It keys on a write that a LATER
    // await actually reads, so callbacks that write bindings nothing downstream
    // observes stay parallelizable -- the barrier must not degrade into "any
    // callback containing an assignment blocks the run". (#1723)
    {
      code: `
async function writeDistinctBindings(runnerA, runnerB) {
  let alpha;
  let beta;
  await runnerA.execute(async () => { alpha = computeAlpha(); });
  await runnerB.execute(async () => { beta = computeBeta(); });
  report(alpha, beta);
}
`,
      errors: [error(2)],
      output: `
async function writeDistinctBindings(runnerA, runnerB) {
  let alpha;
  let beta;
  await Promise.all([
    runnerA.execute(async () => { alpha = computeAlpha(); }),
    runnerB.execute(async () => { beta = computeBeta(); })
  ]);
  report(alpha, beta);
}
`,
    },
    // A write no later await reads is not a dependency between the awaits.
    // (#1723)
    {
      code: `
async function writeUnreadBinding(runner, sink, payload) {
  let scratch;
  await runner.execute(async () => { scratch = computeScratch(); });
  await sink.persist(payload);
}
`,
      errors: [error(2)],
      output: `
async function writeUnreadBinding(runner, sink, payload) {
  let scratch;
  await Promise.all([
    runner.execute(async () => { scratch = computeScratch(); }),
    sink.persist(payload)
  ]);
}
`,
    },
    // A name declared inside the callback is a fresh local, so writing it
    // publishes nothing: the `tally` the second await reads is the outer
    // binding, which the callback never touches. (#1723)
    {
      code: `
async function shadowedLocalWrite(runner, sink) {
  let tally = 0;
  await runner.execute(async () => {
    let tally;
    tally = computeTally();
    record(tally);
  });
  await sink.persist(tally);
}
`,
      errors: [error(2)],
      output: `
async function shadowedLocalWrite(runner, sink) {
  let tally = 0;
  await Promise.all([
    runner.execute(async () => {
    let tally;
    tally = computeTally();
    record(tally);
  }),
    sink.persist(tally)
  ]);
}
`,
    },
    // A declarator is not a write for this purpose either: `const captured`
    // inside the callback binds a new name rather than filling the outer one.
    // (#1723)
    {
      code: `
async function localDeclarationIsNotAWrite(runner, sink) {
  const captured = loadCaptured();
  await runner.execute(async () => {
    const captured = computeCaptured();
    stash(captured);
  });
  await sink.persist(captured);
}
`,
      errors: [error(2)],
      output: `
async function localDeclarationIsNotAWrite(runner, sink) {
  const captured = loadCaptured();
  await Promise.all([
    runner.execute(async () => {
    const captured = computeCaptured();
    stash(captured);
  }),
    sink.persist(captured)
  ]);
}
`,
    },
    // ------------------------------------------------------------------
    // Negative controls for the fold-accumulator barrier (#1851). Each one is a
    // shape the barrier must NOT reach: a fold whose callback never awaits its
    // accumulator, an await of some other binding that merely sits inside a
    // fold, and a `promise`-named parameter outside a fold. A barrier drawn any
    // wider than "awaits parameter zero of a directly-passed fold callback"
    // silently switches the rule off across all of these.
    // ------------------------------------------------------------------
    // A fold callback that never awaits its accumulator serializes nothing: the
    // two operations are genuinely independent within one iteration. (#1851)
    {
      code: `
async function foldWithoutAccumulatorAwait(documents) {
  await documents.reduce(async (acc, doc) => {
    await loadDoc(doc);
    await store(doc);
    return acc;
  }, Promise.resolve());
}
`,
      errors: [error(2)],
      output: `
async function foldWithoutAccumulatorAwait(documents) {
  await documents.reduce(async (acc, doc) => {
    await Promise.all([
      loadDoc(doc),
      store(doc)
    ]);
    return acc;
  }, Promise.resolve());
}
`,
    },
    // Awaiting the ELEMENT parameter is an ordinary data read, not a
    // serialization point -- only parameter zero carries the chain. (#1851)
    {
      code: `
async function foldAwaitingTheElement(documents) {
  await documents.reduce(async (acc, doc) => {
    await doc;
    await notify(doc);
    return acc;
  }, Promise.resolve());
}
`,
      errors: [error(2)],
      output: `
async function foldAwaitingTheElement(documents) {
  await documents.reduce(async (acc, doc) => {
    await Promise.all([
      doc,
      notify(doc)
    ]);
    return acc;
  }, Promise.resolve());
}
`,
    },
    // The barrier blocks the run it sits in, not the whole callback: a later,
    // separate run of genuinely independent awaits in the SAME fold callback is
    // still reported and still fixed. (#1851)
    {
      code: `
async function independentRunAfterTheBarrier(documents, setter) {
  await documents.reduce(async (promise, doc) => {
    await promise;
    await setter.store(doc);
    const derived = compute(doc);
    await logStart(derived);
    await logFinish(derived);
  }, Promise.resolve());
}
`,
      errors: [error(2)],
      output: `
async function independentRunAfterTheBarrier(documents, setter) {
  await documents.reduce(async (promise, doc) => {
    await promise;
    await setter.store(doc);
    const derived = compute(doc);
    await Promise.all([
      logStart(derived),
      logFinish(derived)
    ]);
  }, Promise.resolve());
}
`,
    },
    // Resolution is lexical, so a local that merely borrows the accumulator's
    // usual spelling is not the accumulator. A name-matching barrier would
    // suppress this. (#1851)
    {
      code: `
async function localShadowNamedPromise(documents) {
  await documents.reduce(async (acc, doc) => {
    const promise = loadDoc(doc);
    await promise;
    await store(doc);
    return acc;
  }, Promise.resolve());
}
`,
      errors: [error(2)],
      output: `
async function localShadowNamedPromise(documents) {
  await documents.reduce(async (acc, doc) => {
    const promise = loadDoc(doc);
    await Promise.all([
      promise,
      store(doc)
    ]);
    return acc;
  }, Promise.resolve());
}
`,
    },
    // `map` hands its callback an element first, so parameter zero there is not
    // an accumulator. (#1851)
    {
      code: `
async function mapCallbackAwaitingItsElement(documents) {
  await Promise.all(documents.map(async (doc, index) => {
    await doc;
    await store(index);
  }));
}
`,
      errors: [error(2)],
      output: `
async function mapCallbackAwaitingItsElement(documents) {
  await Promise.all(documents.map(async (doc, index) => {
    await Promise.all([
      doc,
      store(index)
    ]);
  }));
}
`,
    },
    // Neither does `forEach`, even when its first parameter is spelled
    // `promise`. (#1851)
    {
      code: `
function forEachCallbackParamNamedPromise(documents) {
  documents.forEach(async (promise, index) => {
    await promise;
    await store(index);
  });
}
`,
      errors: [error(2)],
      output: `
function forEachCallbackParamNamedPromise(documents) {
  documents.forEach(async (promise, index) => {
    await Promise.all([
      promise,
      store(index)
    ]);
  });
}
`,
    },
    // A `promise`-named parameter of an ordinary function is not a fold
    // accumulator at all. (#1851)
    {
      code: `
async function plainFunctionParamNamedPromise(promise, doc) {
  await promise;
  await store(doc);
}
`,
      errors: [error(2)],
      output: `
async function plainFunctionParamNamedPromise(promise, doc) {
  await Promise.all([
    promise,
    store(doc)
  ]);
}
`,
    },
    // Only a callback passed DIRECTLY to the fold qualifies; the barrier does
    // not chase a binding, so this keeps reporting exactly as before. (#1851)
    {
      code: `
const step = async (acc, doc) => {
  await acc;
  await store(doc);
};
async function foldCallbackBoundToAName(documents) {
  await documents.reduce(step, Promise.resolve());
}
`,
      errors: [error(2)],
      output: `
const step = async (acc, doc) => {
  await Promise.all([
    acc,
    store(doc)
  ]);
};
async function foldCallbackBoundToAName(documents) {
  await documents.reduce(step, Promise.resolve());
}
`,
    },
    // Position matters: an accumulator await with nothing after it in the run
    // gates nothing, because the operation before it had already started
    // without waiting for the previous iteration. (#1851)
    {
      code: `
async function accumulatorAwaitedLast(documents) {
  await documents.reduce(async (acc, doc) => {
    await store(doc);
    await acc;
  }, Promise.resolve());
}
`,
      errors: [error(2)],
      output: `
async function accumulatorAwaitedLast(documents) {
  await documents.reduce(async (acc, doc) => {
    await Promise.all([
      store(doc),
      acc
    ]);
  }, Promise.resolve());
}
`,
    },
    // A method whose name merely STARTS with `reduce` is not a fold. (#1851)
    {
      code: `
async function nonFoldMethodNamedReduceBy(documents) {
  await documents.reduceBy(async (acc, doc) => {
    await acc;
    await store(doc);
  }, Promise.resolve());
}
`,
      errors: [error(2)],
      output: `
async function nonFoldMethodNamedReduceBy(documents) {
  await documents.reduceBy(async (acc, doc) => {
    await Promise.all([
      acc,
      store(doc)
    ]);
  }, Promise.resolve());
}
`,
    },
    // A fold parameter named `promise` in the ELEMENT slot is still not the
    // accumulator: the barrier is keyed on position, not spelling. (#1851)
    {
      code: `
async function secondParameterNamedPromise(documents) {
  await documents.reduce(async (acc, promise, index) => {
    await promise;
    await store(index);
    return acc;
  }, Promise.resolve());
}
`,
      errors: [error(2)],
      output: `
async function secondParameterNamedPromise(documents) {
  await documents.reduce(async (acc, promise, index) => {
    await Promise.all([
      promise,
      store(index)
    ]);
    return acc;
  }, Promise.resolve());
}
`,
    },
  ],
});
