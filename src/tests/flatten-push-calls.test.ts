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
      arr.push(
        a,
        b,
        c,
        d
      );
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
      arr.push(
        a,
        ...rest,
        b
      );
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
          this.handlers.push(
            fnA,
            fnB,
            fnC
          );
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
      state.user.items.push(
        first,
        second,
        third
      );
      `,
      errors: [{ messageId: 'flattenPushCalls' }],
    },
    {
      code: `
      const items = [];
      items[index].push(a);
      items[index].push(b);
      `,
      output: `
      const items = [];
      items[index].push(a, b);
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
        c
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
        b
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
        handlers.push(
          fnA,
          fnB,
          fnC
        );
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
      const store: Record<string, string[]> = { list: [] };
      store['list'].push(itemA);
      store['list'].push(itemB, itemC);
      `,
      output: `
      const store: Record<string, string[]> = { list: [] };
      store['list'].push(
        itemA,
        itemB,
        itemC
      );
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
        other
      );
      `,
      errors: [{ messageId: 'flattenPushCalls' }],
    },
  ],
});
