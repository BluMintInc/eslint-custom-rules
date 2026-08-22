import { flattenPushCalls } from '../rules/flatten-push-calls';
import { ruleTesterTs } from '../utils/ruleTester';

test('flatten-push-calls rule exists', () => {
  expect(flattenPushCalls).toBeDefined();
});

ruleTesterTs.run('flatten-push-calls', flattenPushCalls, {
  valid: [
    `
    const arr = [];
    arr.push(first);
    `,
    `
    const one = [];
    const two = [];
    one.push(a);
    two.push(b);
    `,
    `
    const arr = [];
    arr.push(a);
    console.log(arr.length);
    arr.push(b);
    `,
    `
    function demo(flag: boolean, value: string) {
      items.push(value);
      if (flag) {
        items.push(value.toUpperCase());
      }
    }
    `,
    `
    const arr = [];
    arr.push(a, b, c);
    `,
    `
    const arr = [];
    arr.push(...values);
    `,
    `
    const maybe = getList();
    maybe?.push(first);
    maybe?.push(second);
    `,
    `
    class Demo {
      add(a: number, b: number) {
        this.items.push(a);
        this.otherItems.push(b);
      }
    }
    `,
    `
    const items = [];
    items[i].push(a);
    items[j].push(b);
    `,
    `
    const items = [];
    items[index].push(a);
    items[index].push(b);
    `,
    `
    const items = [];
    items[index].push(a);
    items[index].push(index++);
    `,
    `
    const arr = [];
    arr.push(a);
    await doWork();
    arr.push(b);
    `,
    `
    switch (kind) {
      case 'one':
        arr.push(a);
        break;
      case 'two':
        arr.push(b);
        break;
      default:
        arr.push(c);
    }
    `,
    `
    if (fn(arr.push(item))) {
      arr.push(extra);
    }
    `,
    `
    const arr = [];
    arr.push(doWork());
    arr.push(other);
    `,
    `
    const store: Record<string, string[]> = { list: [] };
    store['list'].push(first);
    store['list'].push(second);
    `,
    `
    const arr: Array<string | number> = [];
    arr.push(value = getValue());
    arr.push(other);
    `,
    `
    const arr = [];
    arr.push(import('./module'));
    arr.push(other);
    `,
    `
    const arr = [];
    arr.push(getValue() satisfies number);
    arr.push(other);
    `,
  ],
  invalid: [
    {
      code: `
      const arr = [];
      arr.push(a);
      arr.push(b);
      `,
      output: `
      const arr = [];
      arr.push(a, b);
      `,
      errors: [{ messageId: 'flattenPushCalls' }],
    },
    {
      code: `
      const arr = [];
      arr.push(a);
      arr.push(b, c);
      arr.push(d);
      `,
      output: `
      const arr = [];
      arr.push(a, b, c, d);
      `,
      errors: [{ messageId: 'flattenPushCalls' }],
    },
    {
      code: `
      const arr = [];
      arr.push(a);
      arr.push(...rest);
      arr.push(b);
      `,
      output: `
      const arr = [];
      arr.push(a, ...rest, b);
      `,
      errors: [{ messageId: 'flattenPushCalls' }],
    },
    {
      code: `
      class Demo {
        configure(fnA: () => void, fnB: () => void) {
          this.handlers.push(fnA);
          this.handlers.push(fnB);
          this.handlers.push(fnC);
        }
      }
      `,
      output: `
      class Demo {
        configure(fnA: () => void, fnB: () => void) {
          this.handlers.push(fnA, fnB, fnC);
        }
      }
      `,
      errors: [{ messageId: 'flattenPushCalls' }],
    },
    {
      code: `
      const state = { user: { items: [] } };
      state.user.items.push(first);
      state.user.items.push(second, third);
      `,
      output: `
      const state = { user: { items: [] } };
      state.user.items.push(first, second, third);
      `,
      errors: [{ messageId: 'flattenPushCalls' }],
    },
    {
      code: `
      const items = [];
      items.push(a);
      /* keep track */
      items.push();
      items.push(b);
      `,
      output: `
      const items = [];
      items.push(a, /* keep track */ b);
      `,
      errors: [{ messageId: 'flattenPushCalls' }],
    },
    {
      code: `
      const arr = [];
      arr.push(a);
      // ensure the second item is grouped
      arr.push(b);
      arr.push(c);
      `,
      output: `
      const arr = [];
      arr.push(
        a,
        // ensure the second item is grouped
        b,
        c,
      );
      `,
      errors: [{ messageId: 'flattenPushCalls' }],
    },
    {
      code: `
      const arr = [];
      arr.push(a); // keep info
      arr.push(b);
      `,
      output: `
      const arr = [];
      arr.push(
        a,
        // keep info
        b,
      );
      `,
      errors: [{ messageId: 'flattenPushCalls' }],
    },
    {
      code: `
      const items: Array<string | number> = [];
      items.push(value as string);
      items.push<number>(other);
      `,
      output: `
      const items: Array<string | number> = [];
      items.push<number>(value as string, other);
      `,
      errors: [{ messageId: 'flattenPushCalls' }],
    },
    {
      code: `
      function build() {
        const handlers = [];
        handlers.push(fnA);
        handlers.push(fnB, fnC);
      }
      `,
      output: `
      function build() {
        const handlers = [];
        handlers.push(fnA, fnB, fnC);
      }
      `,
      errors: [{ messageId: 'flattenPushCalls' }],
    },
    {
      code: `
      const arr = [];
      arr.push(
        firstItem
      );
      arr.push(secondItem);
      `,
      output: `
      const arr = [];
      arr.push(firstItem, secondItem);
      `,
      errors: [{ messageId: 'flattenPushCalls' }],
    },
    {
      code: `
      const arr: string[] = [];
      arr!.push(alpha);
      arr!.push(beta);
      `,
      output: `
      const arr: string[] = [];
      arr!.push(alpha, beta);
      `,
      errors: [{ messageId: 'flattenPushCalls' }],
    },
    {
      code: `
      let arr: string[];
      (arr as string[]).push(first);
      (arr as string[]).push(second);
      `,
      output: `
      let arr: string[];
      (arr as string[]).push(first, second);
      `,
      errors: [{ messageId: 'flattenPushCalls' }],
    },
    {
      code: `
      const arr = [];
      arr.push({
        value: 1,
      });
      arr.push(other);
      `,
      output: `
      const arr = [];
      arr.push(
        {
          value: 1,
        },
        other,
      );
      `,
      errors: [{ messageId: 'flattenPushCalls' }],
    },
    {
      code: `
      const arr = [];
      (arr satisfies string[]).push(a);
      (arr satisfies string[]).push(b);
      `,
      output: `
      const arr = [];
      (arr satisfies string[]).push(a, b);
      `,
      errors: [{ messageId: 'flattenPushCalls' }],
    },
    {
      code: `
      const arr = [];
      arr.push(a);
      arr.push(b);
      /* trailing */
      arr.push();
      `,
      output: `
      const arr = [];
      arr.push(a, b /* trailing */);
      `,
      errors: [{ messageId: 'flattenPushCalls' }],
    },
    {
      code: `
      const arr = [];
      arr.push(
        // eslint-disable-next-line no-console
        firstItem
      );
      arr.push(secondItem);
      `,
      output: `
      const arr = [];
      arr.push(
        // eslint-disable-next-line no-console
        firstItem,
        secondItem,
      );
      `,
      errors: [{ messageId: 'flattenPushCalls' }],
    },
    {
      code: `
      const arr = [];
      arr.push(first);
      arr.push(
        // eslint-disable-next-line no-console
        second
      );
      `,
      output: `
      const arr = [];
      arr.push(
        first,
        // eslint-disable-next-line no-console
        second,
      );
      `,
      errors: [{ messageId: 'flattenPushCalls' }],
    },
    {
      code: `
      const arr = [];
      arr.push(
        alpha // keep alpha
      );
      arr.push(beta);
      `,
      output: `
      const arr = [];
      arr.push(
        alpha, // keep alpha
        beta,
      );
      `,
      errors: [{ messageId: 'flattenPushCalls' }],
    },
    {
      code: `
      const arr = [];
      arr.push(alpha /* inline note */);
      arr.push(beta);
      `,
      output: `
      const arr = [];
      arr.push(alpha /* inline note */, beta);
      `,
      errors: [{ messageId: 'flattenPushCalls' }],
    },
    {
      code: `
      const arr = [];
      arr.push(alpha);
      arr.push(
        beta
        // afterthought
      );
      `,
      output: `
      const arr = [];
      arr.push(
        alpha,
        beta,
        // afterthought
      );
      `,
      errors: [{ messageId: 'flattenPushCalls' }],
    },
    {
      code: `
      const arr = [];
      arr.push(one);
      arr.push(
        // middle matters
        two
      );
      arr.push(three);
      `,
      output: `
      const arr = [];
      arr.push(
        one,
        // middle matters
        two,
        three,
      );
      `,
      errors: [{ messageId: 'flattenPushCalls' }],
    },
    {
      code: `
      const arr = [];
      arr.push(/* leading note */ alpha);
      arr.push(beta);
      `,
      output: `
      const arr = [];
      arr.push(/* leading note */ alpha, beta);
      `,
      errors: [{ messageId: 'flattenPushCalls' }],
    },
    {
      code: `
      const arr = [];
      arr.push(
        /**
         * Alpha is special.
         */
        alpha
      );
      arr.push(beta);
      `,
      output: `
      const arr = [];
      arr.push(
        /**
         * Alpha is special.
         */
        alpha,
        beta,
      );
      `,
      errors: [{ messageId: 'flattenPushCalls' }],
    },
    {
      code: `
      const arr = [];
      arr.push(
        // first
        a,
        // second
        b
      );
      arr.push(c);
      `,
      output: `
      const arr = [];
      arr.push(
        // first
        a,
        // second
        b,
        c,
      );
      `,
      errors: [{ messageId: 'flattenPushCalls' }],
    },
    {
      code: `
      const items = [];
      items.push(a);
      items.push(/* placeholder */);
      items.push(b);
      `,
      output: `
      const items = [];
      items.push(a, /* placeholder */ b);
      `,
      errors: [{ messageId: 'flattenPushCalls' }],
    },
    {
      code: `
      const arr = [];
      // unrelated header
      arr.push(a);
      arr.push(b);
      // unrelated footer
      const done = true;
      `,
      output: `
      const arr = [];
      // unrelated header
      arr.push(a, b);
      // unrelated footer
      const done = true;
      `,
      errors: [{ messageId: 'flattenPushCalls' }],
    },
    {
      // A comment wedged between the callee and its argument list cannot be
      // carried into the merged call, so the report stands without a fix.
      code: `
      const arr = [];
      arr.push /* odd spot */ (alpha);
      arr.push(beta);
      `,
      output: null,
      errors: [{ messageId: 'flattenPushCalls' }],
    },
    {
      code: `
      const arr = [];
      arr.push(alpha) /* tail */;
      arr.push(beta);
      `,
      output: null,
      errors: [{ messageId: 'flattenPushCalls' }],
    },
    {
      // The merged call lands on column 80 exactly, the last column prettier
      // leaves alone, so it stays on one line.
      code: `
      const arr = [];
      arr.push(alphaAlpha);
      arr.push(bravoBravo);
      arr.push(charlieChar);
      arr.push(deltaDelta);
      arr.push(eeeeeeeeeeeeee);
      `,
      output: `
      const arr = [];
      arr.push(alphaAlpha, bravoBravo, charlieChar, deltaDelta, eeeeeeeeeeeeee);
      `,
      errors: [{ messageId: 'flattenPushCalls' }],
    },
    {
      // One column wider than the previous case, so the list breaks — with the
      // trailing comma prettier writes into any argument list it splits.
      code: `
      const arr = [];
      arr.push(alphaAlpha);
      arr.push(bravoBravo);
      arr.push(charlieChar);
      arr.push(deltaDelta);
      arr.push(eeeeeeeeeeeeeee);
      `,
      output: `
      const arr = [];
      arr.push(
        alphaAlpha,
        bravoBravo,
        charlieChar,
        deltaDelta,
        eeeeeeeeeeeeeee,
      );
      `,
      errors: [{ messageId: 'flattenPushCalls' }],
    },
    {
      // Two arguments overflow just as readily as many, so the count of
      // arguments cannot decide the layout on its own.
      code: `
      const arr = [];
      arr.push(alphaAlphaAlphaAlphaAlphaAlphaAlphaAlpha);
      arr.push(bravoBravoBravoBravoBravoBravoBravoBravo);
      `,
      output: `
      const arr = [];
      arr.push(
        alphaAlphaAlphaAlphaAlphaAlphaAlphaAlpha,
        bravoBravoBravoBravoBravoBravoBravoBravo,
      );
      `,
      errors: [{ messageId: 'flattenPushCalls' }],
    },
    {
      // The very argument list that fits at column 6 overflows four columns
      // deeper, so the call's own column decides the layout.
      code: `
      class Demo {
        run() {
          arr.push(alphaAlpha);
          arr.push(bravoBravo);
          arr.push(charlieChar);
          arr.push(deltaDelta);
          arr.push(eeeeeeeeeeeeee);
        }
      }
      `,
      output: `
      class Demo {
        run() {
          arr.push(
            alphaAlpha,
            bravoBravo,
            charlieChar,
            deltaDelta,
            eeeeeeeeeeeeee,
          );
        }
      }
      `,
      errors: [{ messageId: 'flattenPushCalls' }],
    },
    {
      // A line comment cannot ride on a collapsed list: it would swallow the
      // rest of the call, so the list stays broken however short it is.
      code: `
      const arr = [];
      arr.push(a);
      // keep b explained
      arr.push(b);
      `,
      output: `
      const arr = [];
      arr.push(
        a,
        // keep b explained
        b,
      );
      `,
      errors: [{ messageId: 'flattenPushCalls' }],
    },
    {
      // A single-line block comment survives the collapse, staying glued to the
      // argument it trails and ahead of the separating comma.
      code: `
      const arr = [];
      arr.push(alpha /* note */);
      arr.push(beta);
      arr.push(gamma);
      `,
      output: `
      const arr = [];
      arr.push(alpha /* note */, beta, gamma);
      `,
      errors: [{ messageId: 'flattenPushCalls' }],
    },
    {
      // A block comment carrying newlines keeps the list broken, since it
      // cannot be folded onto one line.
      code: `
      const arr = [];
      arr.push(
        /* first
        second */
        alpha
      );
      arr.push(beta);
      `,
      output: `
      const arr = [];
      arr.push(
        /* first
        second */
        alpha,
        beta,
      );
      `,
      errors: [{ messageId: 'flattenPushCalls' }],
    },
  ],
});
