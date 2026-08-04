import { ruleTesterTs } from '../utils/ruleTester';
import { parallelizeLoopAwaits } from '../rules/parallelize-loop-awaits';

// A loop the rule reports at the defaults: one await per iteration, an argument
// drawn from the iteration, and no barrier of any kind. Reused across the
// test-file exemption cases so the filename is the only thing that varies
// between a valid and an invalid outcome. (#1687)
const ORDERED_LOOP_AWAITS = `
async function replaysOrderedSideEffects() {
  for (const seed of seeds) {
    await postAutomationSuggestion(seed);
  }
}
`;

ruleTesterTs.run('parallelize-loop-awaits', parallelizeLoopAwaits, {
  valid: [
    // No await in loop — no issue
    `
    async function noAwait() {
      for (const item of items) {
        doSomethingSync(item);
      }
    }
    `,

    // Already using Promise.all — no issue
    `
    async function alreadyParallel() {
      await Promise.all(items.map((item) => processItem(item)));
    }
    `,

    // Await outside of loop — handled by parallelize-async-operations, not this rule
    `
    async function awaitsOutsideLoop() {
      await operation1();
      await operation2();
    }
    `,

    // Accumulator: result of await is used by next iteration's await
    `
    async function accumulatorPattern() {
      let previousResult = null;
      for (const item of items) {
        const result = await processItem(item, previousResult);
        previousResult = result;
      }
    }
    `,

    // Accumulator: running total computed across iterations
    `
    async function runningTotal() {
      let total = 0;
      for (const item of items) {
        const value = await fetchValue(item);
        total += value;
      }
    }
    `,

    // Coordinator pattern: batch object in loop body
    `
    async function batchCoordinator() {
      const batch = new BatchManager();
      for (const doc of snapshot.docs) {
        await batch.set({ ref: doc.ref, data: { id: doc.id } });
      }
      await batch.commit();
    }
    `,

    // Coordinator pattern: transaction variable directly in loop body
    `
    async function transactionCoordinator() {
      for (const token of tokens) {
        await transaction.set(token.ref, token.data);
      }
    }
    `,

    // Rate limiting: sleep call in loop body
    `
    async function rateLimitedLoop() {
      for (const asset of assets) {
        await processAsset(asset);
        await sleep(1000);
      }
    }
    `,

    // Rate limiting: delay call in loop body
    `
    async function rateLimitedDelay() {
      for (const batch of batches) {
        await processBatch(batch);
        await delay(100);
      }
    }
    `,

    // Per-iteration try/catch — sequential semantics are intentional
    `
    async function perIterationErrorHandling() {
      for (const item of items) {
        try {
          await processItem(item);
        } catch (error) {
          console.error('Failed:', error);
        }
      }
    }
    `,

    // break after await — control flow depends on async result
    `
    async function breakOnResult() {
      for (const item of items) {
        const result = await process(item);
        if (result.shouldStop) {
          break;
        }
      }
    }
    `,

    // continue after await — control flow depends on async result
    `
    async function continueOnResult() {
      for (const item of items) {
        const result = await checkItem(item);
        if (!result.valid) {
          continue;
        }
        doMoreWork(item);
      }
    }
    `,

    // return after await — early exit based on async result
    `
    async function returnOnResult() {
      for (const item of items) {
        const result = await process(item);
        if (result.done) {
          return result;
        }
      }
    }
    `,

    // Pagination while loop: cursor-based, inherently sequential
    `
    async function paginationLoop() {
      let cursor = null;
      while (true) {
        const { data, nextCursor } = await fetchPage(cursor);
        if (!nextCursor) break;
        cursor = nextCursor;
      }
    }
    `,

    // Pagination while loop: condition depends on loop variables
    `
    async function paginationWhile() {
      let hasMore = true;
      let page = 1;
      while (hasMore) {
        const response = await api.list({ page, limit: 50 });
        hasMore = response.data.length === 50;
        page++;
      }
    }
    `,

    // Await inside nested arrow function — belongs to a different async scope
    `
    async function nestedAsyncScope() {
      for (const item of items) {
        const handler = async () => {
          await processItem(item);
        };
        handler();
      }
    }
    `,

    // Coordinator pattern: aggregator identifier
    `
    async function aggregatorLoop() {
      for (const item of items) {
        await aggregator.add(item);
      }
    }
    `,

    // Coordinator pattern: mutex identifier
    `
    async function mutexLoop() {
      for (const item of items) {
        await mutex.acquire();
        doLockedWork(item);
        mutex.release();
      }
    }
    `,

    // Coordinator pattern custom config: custom coordinator name
    {
      code: `
      async function customCoordinatorLoop() {
        for (const item of items) {
          await myWriter.write(item);
        }
      }
      `,
      options: [{ coordinatorPatterns: ['myWriter'] }],
    },

    // Rate limiting custom config: custom rate limit name
    {
      code: `
      async function customRateLimitLoop() {
        for (const item of items) {
          await processItem(item);
          await wait(500);
        }
      }
      `,
      options: [{ rateLimitedPatterns: ['wait'] }],
    },

    // for...in with no real await
    `
    async function forInNoAwait() {
      for (const key in obj) {
        console.log(key);
      }
    }
    `,

    // Nested outer loop has rate limit (sleep), inner reported separately
    // This test ensures the OUTER loop with sleep is NOT flagged
    `
    async function outerRateLimited() {
      for (const batch of batches) {
        doSync(batch);
        await sleep(100);
      }
    }
    `,

    // Accumulator: variable declared outside loop is reassigned from await
    `
    async function outerVarReassignedFromAwait() {
      let cursor = initialCursor;
      for (let i = 0; i < 10; i++) {
        const page = await fetchPage(cursor);
        cursor = page.nextCursor;
      }
    }
    `,

    // A. Ordering lives inside the callee: zero-argument call, discarded result.
    //    The loop consumes nothing from the iteration, so nothing licenses a verdict.
    {
      filename: 'src/postAutomationSuggestion.test.ts',
      code: `
      async function replaysOrderedSideEffects() {
        for (let occurrence = 0; occurrence < 21; occurrence += 1) {
          await postAutomationSuggestion();
        }
      }
      `,
    },

    // B. Same shape, recognized via a Jest convention directory.
    {
      filename: 'src/__tests__/postAutomationSuggestion.ts',
      code: `
      async function replaysOrderedSideEffects() {
        for (let occurrence = 0; occurrence < 21; occurrence += 1) {
          await postAutomationSuggestion();
        }
      }
      `,
    },

    // C. Loop CONDITION depends on the awaited side effect -> sequential by construction.
    //    Not a test file: the body-only analysis fails here in production code too.
    {
      filename: 'src/drain.ts',
      code: `
      async function drainUntilSettled() {
        while (!hasSettled()) {
          await Promise.resolve();
        }
      }
      `,
    },

    // D. Bounded tick-drain; the `test` clause re-checks state the await advances.
    {
      filename: 'src/drain.ts',
      code: `
      async function drainMicrotasks() {
        for (let tick = 0; tick < 100 && !findBackoffTimer(); tick += 1) {
          await Promise.resolve();
        }
      }
      `,
    },

    // E. `for await...of` is sequential by language semantics.
    {
      filename: 'src/stream.ts',
      code: `
      async function readStream() {
        for await (const chunk of stream) {
          await handleChunk(chunk);
        }
      }
      `,
    },

    // Every recognized test-file shape, with the code held constant. (#1687)
    {
      code: ORDERED_LOOP_AWAITS,
      filename: 'src/hooks/useThing.test.ts',
    },
    {
      code: ORDERED_LOOP_AWAITS,
      filename: 'src/components/Thing.test.tsx',
    },
    {
      code: ORDERED_LOOP_AWAITS,
      filename: 'src/hooks/useThing.spec.ts',
    },
    {
      code: ORDERED_LOOP_AWAITS,
      filename: 'src/legacy/thing.test.js',
    },
    // ESM/CJS TypeScript extensions carry the same suffix.
    {
      code: ORDERED_LOOP_AWAITS,
      filename: 'src/hooks/useThing.test.mts',
    },
    // Multi-part suffixes still end in `.test.ts`.
    {
      code: ORDERED_LOOP_AWAITS,
      filename: 'functions/src/util/EventRegistry.integration.test.ts',
    },
    // Jest convention directories exempt their contents regardless of filename.
    {
      code: ORDERED_LOOP_AWAITS,
      filename: 'src/components/__tests__/Thing.ts',
    },
    {
      code: ORDERED_LOOP_AWAITS,
      filename: 'src/__mocks__/firebase.ts',
    },
    // A leading `__tests__/` segment matches the start-of-path alternative.
    {
      code: ORDERED_LOOP_AWAITS,
      filename: '__tests__/setup.ts',
    },
    // Windows separators are normalized, so the directory check holds there.
    {
      code: ORDERED_LOOP_AWAITS,
      filename: 'C:\\repo\\src\\__tests__\\Thing.ts',
    },

    // Condition coupling: a `while` test that calls something re-reads state the
    // awaited work advances, so the iteration count is a function of the
    // iterations themselves and no Promise.all form exists. (#1687)
    {
      filename: 'src/drain.ts',
      code: `
      async function drainQueue() {
        while (queue.hasPending()) {
          await drainNext(queue);
        }
      }
      `,
    },

    // Condition coupling via the `update` clause: the next index is computed by
    // a call, so the iteration sequence is not known up front. (#1687)
    {
      filename: 'src/walk.ts',
      code: `
      async function walkSparse() {
        for (let i = 0; i < 10; i = nextIndex(i)) {
          await processItem(items[i]);
        }
      }
      `,
    },

    // `for await...of` keeps its exemption in a file that is not a test file and
    // whose body would otherwise report on its own. (#1687)
    {
      filename: 'src/stream.ts',
      code: `
      async function readStreamRows() {
        for await (const row of cursor) {
          const parsed = parseRow(row);
          await persistRow(parsed);
        }
      }
      `,
    },

    // A lone discarded await of a zero-argument call passes nothing from the
    // iteration and keeps nothing back, so the loop exists only for an ordered
    // side effect the callee owns — including in a production module. (#1687)
    {
      filename: 'src/replay.ts',
      code: `
      async function replayEntrypoint() {
        for (let occurrence = 0; occurrence < 21; occurrence += 1) {
          await postAutomationSuggestion();
        }
      }
      `,
    },

    // The same shape written without a block body. (#1687)
    {
      filename: 'src/replay.ts',
      code: `
      async function replayEntrypointUnbraced() {
        for (const _ of attempts) await postAutomationSuggestion();
      }
      `,
    },
  ],

  invalid: [
    // Basic for...of with independent await
    {
      code: `
      async function basicForOf() {
        for (const userId of userIds) {
          await sendNotification(userId);
        }
      }
      `,
      errors: [{ messageId: 'parallelizeLoopAwaits' }],
    },

    // for...in with independent await
    {
      code: `
      async function forInLoop() {
        for (const key in obj) {
          await processKey(key);
        }
      }
      `,
      errors: [{ messageId: 'parallelizeLoopAwaits' }],
    },

    // Traditional for loop with independent await
    {
      code: `
      async function traditionalForLoop() {
        for (let i = 0; i < items.length; i++) {
          await processItem(items[i]);
        }
      }
      `,
      errors: [{ messageId: 'parallelizeLoopAwaits' }],
    },

    // while loop with independent await
    {
      code: `
      async function whileLoop() {
        let i = 0;
        while (i < items.length) {
          await processItem(items[i]);
          i++;
        }
      }
      `,
      errors: [{ messageId: 'parallelizeLoopAwaits' }],
    },

    // Bad example from issue: OffchainCreatorAsserter pattern
    {
      code: `
      async function assertTokens() {
        for (const token of this.tokens) {
          if (isOffchainToken(token)) {
            await this.assertSingleTokenMintPermission(token);
          } else {
            throw new HttpsError({ code: 'invalid-argument', message: 'error' });
          }
        }
      }
      `,
      errors: [{ messageId: 'parallelizeLoopAwaits' }],
    },

    // Bad example from issue: update via method call
    {
      code: `
      async function updateMetrics() {
        for (const [userId, eventCount] of userEventCounts.entries()) {
          await groupMetricsRef.update({
            eventsHosted: FieldValue.increment(eventCount),
          });
        }
      }
      `,
      errors: [{ messageId: 'parallelizeLoopAwaits' }],
    },

    // Results pushed to array (not accumulator — no cross-iteration dependency)
    {
      code: `
      async function collectResults() {
        const results = [];
        for (const item of items) {
          const result = await processItem(item);
          results.push(result);
        }
      }
      `,
      errors: [{ messageId: 'parallelizeLoopAwaits' }],
    },

    // Method calls on objects — independent
    {
      code: `
      async function updateUsers() {
        for (const user of users) {
          await db.collection('users').doc(user.id).update({ active: true });
        }
      }
      `,
      errors: [{ messageId: 'parallelizeLoopAwaits' }],
    },

    // Mixed sync and async — the await is still parallelizable
    {
      code: `
      async function mixedSyncAsync() {
        for (const doc of snapshot.docs) {
          const data = doc.data();
          const expectedId = doc.id;
          if (!data.id || data.id !== expectedId) {
            await updateDoc(doc.ref, { id: expectedId });
          }
        }
      }
      `,
      errors: [{ messageId: 'parallelizeLoopAwaits' }],
    },

    // Conditional await — parallelizable (no break/continue/return)
    {
      code: `
      async function conditionalAwait() {
        for (const token of tokens) {
          if (isOffchainToken(token)) {
            await assertPermission(token);
          }
        }
      }
      `,
      errors: [{ messageId: 'parallelizeLoopAwaits' }],
    },

    // Nested loops: inner is parallelizable
    {
      code: `
      async function innerLoopParallelizable() {
        for (const batch of batches) {
          doSomethingSync(batch);
          for (const item of batch.items) {
            await processItem(item);
          }
        }
      }
      `,
      errors: [{ messageId: 'parallelizeLoopAwaits' }],
    },

    // Class method with independent for...of
    {
      code: `
      class MyProcessor {
        async processAll() {
          for (const item of this.items) {
            await this.process(item);
          }
        }
      }
      `,
      errors: [{ messageId: 'parallelizeLoopAwaits' }],
    },

    // Arrow function body with for...of
    {
      code: `
      const processItems = async (items) => {
        for (const item of items) {
          await sendEmail(item.email);
        }
      };
      `,
      errors: [{ messageId: 'parallelizeLoopAwaits' }],
    },

    // for...of with method call that doesn't match coordinator pattern
    {
      code: `
      async function noCoordinatorMatch() {
        for (const item of items) {
          await manager.nonBatchMethod(item);
        }
      }
      `,
      errors: [{ messageId: 'parallelizeLoopAwaits' }],
    },

    // Custom options: coordinator patterns set to empty — batch no longer excluded
    {
      code: `
      async function customEmptyCoordinators() {
        const batch = new SomeBatch();
        for (const item of items) {
          await batch.add(item);
        }
      }
      `,
      options: [{ coordinatorPatterns: [] }],
      errors: [{ messageId: 'parallelizeLoopAwaits' }],
    },

    // for...of with async assignment, no cross-iteration dependency
    {
      code: `
      async function independentAssignments() {
        for (const item of items) {
          const result = await fetchData(item.id);
          logResult(result);
        }
      }
      `,
      errors: [{ messageId: 'parallelizeLoopAwaits' }],
    },

    // Deeply nested await in if block (no break/continue/return)
    {
      code: `
      async function deeplyNestedIfAwait() {
        for (const user of users) {
          if (user.isActive) {
            if (user.needsUpdate) {
              await updateUser(user.id);
            }
          }
        }
      }
      `,
      errors: [{ messageId: 'parallelizeLoopAwaits' }],
    },

    // for...of loop with push-only accumulation (no cross-iter data dep)
    {
      code: `
      async function independentWithPush() {
        const notifications = [];
        for (const userId of userIds) {
          const notification = await createNotification(userId);
          notifications.push(notification);
        }
      }
      `,
      errors: [{ messageId: 'parallelizeLoopAwaits' }],
    },

    // Control for the test-file exemption: the identical loop in a production
    // module still reports, so the exemption keys on the filename alone. (#1687)
    {
      code: ORDERED_LOOP_AWAITS,
      filename: 'src/hooks/useThing.ts',
      errors: [{ messageId: 'parallelizeLoopAwaits' }],
    },
    // Production modules whose names merely contain "test"/"spec" keep their
    // enforcement: the exemption matches anchored suffixes and whole path
    // segments, not a bare substring. (#1687)
    {
      code: ORDERED_LOOP_AWAITS,
      filename: 'src/util/testHelpers.ts',
      errors: [{ messageId: 'parallelizeLoopAwaits' }],
    },
    {
      code: ORDERED_LOOP_AWAITS,
      filename: 'src/util/foo.test.helper.ts',
      errors: [{ messageId: 'parallelizeLoopAwaits' }],
    },
    {
      code: ORDERED_LOOP_AWAITS,
      filename: 'src/__tests__helpers/Thing.ts',
      errors: [{ messageId: 'parallelizeLoopAwaits' }],
    },
    // Consumers can opt back into enforcement inside test files, which proves
    // the option is live in both directions. (#1687)
    {
      code: ORDERED_LOOP_AWAITS,
      filename: 'src/components/Thing.test.tsx',
      options: [{ ignoreTestFiles: false }],
      errors: [{ messageId: 'parallelizeLoopAwaits' }],
    },

    // Control for the condition-coupling veto: a `test` clause that only reads a
    // property (`items.length`) invokes nothing, so the iteration count is known
    // up front and the loop stays reportable. (#1687)
    {
      code: `
      async function indexedForLoop() {
        for (let i = 0; i < items.length; i += 1) {
          await sendNotification(items[i]);
        }
      }
      `,
      errors: [{ messageId: 'parallelizeLoopAwaits' }],
    },
    // A call in the `init` clause runs once, before any iteration, so it says
    // nothing about cross-iteration coupling. (#1687)
    {
      code: `
      async function initCallOnly() {
        for (let i = startIndex(); i < items.length; i += 1) {
          await sendNotification(items[i]);
        }
      }
      `,
      errors: [{ messageId: 'parallelizeLoopAwaits' }],
    },
    // A `for...of` right-hand side is evaluated once, so a call there is not
    // condition coupling either. (#1687)
    {
      code: `
      async function iterateCallResult() {
        for (const entry of registry.entries()) {
          await publish(entry);
        }
      }
      `,
      errors: [{ messageId: 'parallelizeLoopAwaits' }],
    },
    // A plain `for await...of` is exempt, but the ordinary `for...of` it is
    // easily confused with is not. (#1687)
    {
      code: `
      async function iterateSyncIterable() {
        for (const chunk of chunks) {
          await handleChunk(chunk);
        }
      }
      `,
      errors: [{ messageId: 'parallelizeLoopAwaits' }],
    },
    // The zero-argument exemption is narrow: an argument drawn from the
    // iteration is evidence the call is per-item work. (#1687)
    {
      code: `
      async function zeroArgControl() {
        for (const item of items) {
          await process(item);
        }
      }
      `,
      errors: [{ messageId: 'parallelizeLoopAwaits' }],
    },
    // A zero-argument call whose RECEIVER comes from the iteration addresses a
    // different target every pass, which is exactly the shape the rule exists
    // to flag. (#1687)
    {
      code: `
      async function deleteEachDoc() {
        for (const doc of snapshot.docs) {
          await doc.ref.delete();
        }
      }
      `,
      errors: [{ messageId: 'parallelizeLoopAwaits' }],
    },
    // The same holds for an index-addressed receiver in a counted loop. (#1687)
    {
      code: `
      async function deleteByIndex() {
        for (let i = 0; i < docs.length; i += 1) {
          await docs[i].delete();
        }
      }
      `,
      errors: [{ messageId: 'parallelizeLoopAwaits' }],
    },
    // Likewise, a zero-argument await beside a statement that consumes the
    // iteration variable is not a bare replay loop. (#1687)
    {
      code: `
      async function zeroArgWithSibling() {
        for (const item of items) {
          await ping();
          record(item);
        }
      }
      `,
      errors: [{ messageId: 'parallelizeLoopAwaits' }],
    },
  ],
});
