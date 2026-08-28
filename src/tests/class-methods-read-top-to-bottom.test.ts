import { classMethodsReadTopToBottom } from '../rules/class-methods-read-top-to-bottom';
import { ruleTesterTs } from '../utils/ruleTester';

/**
 * NOTE: these tests are sensitive to whitespace since we aren't running
 * prettier as part of the rule. Please be careful!
 */

ruleTesterTs.run(
  'class-methods-read-top-to-bottom',
  classMethodsReadTopToBottom,
  {
    valid: [
      {
        code: `export class TokenIssuerOAuth implements TokenIssuer<OAuthUserResponse> {
          constructor(
            public providerId: CustomSignInMethod,
            public authCode: string,
            private platform: BlumintPlatform,
            private axiosClient: typeof axios = axios,
            private db: Firestore = dbDefault,
            private auth: Auth = authDefault(),
          ) {}

          public async getTokenFromAuthCode(): Promise<string> {
            const PARAMS = {
              client_id: this.clientId || '',
              client_secret: this.clientSecret || '',
              grant_type: 'authorization_code',
              code: this.authCode,
              redirect_uri: oAuthRedirectUri(this.platform, this.providerId),
              scope: this.scope,
            };
            const responseData = await this.axiosClient.post(
              this.accessTokenEndpoint,
              new URLSearchParams(PARAMS).toString(),
              { headers: this.headers },
            );
            return responseData.data.access_token;
          }
        }`,
      },
      {
        code: `
          class TestClass {
            field1: string;
            field2: number;
            constructor() {
              this.methodA();
            }
            methodA() {
              // Test TypeScript 5.7.2 compatibility with undefined dependencies
              const obj = { dependencies: undefined };
              this.methodB();
            }
            methodB() {}
          }
          `,
      },
      {
        code: `
          class TestClass {
            field1: string;
            field2: number;
            constructor() {
              this.methodA();
            }
            methodA() {
              this.methodB();
            }
            methodB() {}
          }
          `,
      },
      {
        code: `
          class TestClass {
            field1: string;
            field2: number;
            constructor() {
              this.field1 = this.methodA();
              this.methodB();
            }
            methodA(): string {
              return "foo";
            }
            methodB() {
                this.field2 = 5;
            }
          }
          `,
      },
      {
        code: `
          class TestClass {
            field1: string;
            field2: number;
            constructor() {
              this.field1 = this.methodA();
              const foo = this.methodB();
              console.log(foo);
            }
            methodA(): string {
              return "foo";
            }
            methodB() {
                this.field2 = 5;
            }
          }
          `,
      },
      {
        code: `
          class TestClass {
            field1: string;
            field2: number;
            constructor() {
              this.field1 = this.methodA();
              const foo = this.methodB();
              console.log(foo);
            }
            methodA(): string {
              return TestClass.someStaticMethod();
            }
            private static someStaticMethod() {
              console.log('foo')
            }
            methodB() {
                this.field2 = 5;
            }
          }
          `,
      },
      // cyclic deps
      {
        code: `class SomeGeniusMadeARecursiveCall {
          public fooBar: string
          constructor(public foo: string, private bar: string) {
            this.fooBar = foo + bar
            this.baz()
          }
          public baz() {
            console.log('baz')
            SomeGeniusMadeARecursiveCall.someRecursiveFunction('baz')
          }
          public static someRecursiveFunction(s: string) {
              this.qux()
              SomeGeniusMadeARecursiveCall.someRecursiveFunction(s)
          }
          private qux() {
            return 5
          }
        }`,
      },
      {
        code: `export class PrizePoolAccountant {
          constructor(
            private readonly prizePool: PrizePool,
            private readonly prizePoolRef: DocumentReference<PrizePool>,
            private readonly userId: string,
          ) {
            this.assertPrizePoolContributor();
          }
          public assertPrizePoolContributor() {
            if (!this.contributors.includes(this.userId)) {
              throw new https.HttpsError(
                'unauthenticated',
                \`User is not a contributor of prize pool\`,
                \`User id: \${this.userId}, prize pool id: \${this.prizePoolId}\`,
              );
            }
          }
          private get contributors() {
            return this.prizePool.userIdsContributors;
          }
          private get prizePoolId() {
            return this.prizePool.id;
          }
          public static async build(
            prizePoolRef: DocumentReference<PrizePool>,
            userId: string,
          ) {
            const fetcher = new FirestoreDocFetcher<PrizePool>(prizePoolRef);
            const prizePool = await fetcher.fetch();
            if (!prizePool) {
              throw new https.HttpsError(
                'internal',
                \`Prize pool has no data\`,
                \`Prize pool id: \${prizePoolRef.id}\`,
              );
            }
            return new PrizePoolAccountant(prizePool, prizePoolRef, userId);
          }
          public removeAllTokens() {
            return this.prizePoolRef.update({
              prizes: FieldValue.arrayRemove(
                ...this.tokensContributed.filter((token) => {
                  return PrizePoolAccountant.isRemovable(token);
                }),
              ),
            });
          }
          public get tokensContributed() {
            return this.prizes.filter((token) => {
              return token.contributor.userId === this.userId;
            });
          }
          private get prizes() {
            return this.prizePool.prizes;
          }
          private static isRemovable({
            contributor,
          }: Pick<PrizePoolToken, 'contributor'>) {
            return TOKEN_REMOVAL_PERMITTED_STAGES.includes(contributor.stage);
          }
          public removeToken(token: PrizePoolToken) {
            if (!PrizePoolAccountant.isRemovable(token)) {
              throw new https.HttpsError(
                'failed-precondition',
                \`Token cannot be removed when transfer is "transferring" or "transferred"\`,
                \`Token stage: \${token.contributor.stage}, address: \${token.address}, chainId: \${token.chainId}\`,
              );
            }
            const tokenFoundIndex = this.findTokenIndex(token);
            if (tokenFoundIndex === -1) {
              throw new https.HttpsError(
                'failed-precondition',
                'Token does not exist in current prize pool',
                \`Token address: \${token.address}, chainId: \${token.chainId}\`,
              );
            }
            const tokenFound = this.prizes[Number(tokenFoundIndex)];
            return this.updatePrizes(FieldValue.arrayRemove(tokenFound));
          }
          private findTokenIndex(token: PrizePoolToken): number {
            return this.prizes.findIndex((prize) => {
              return hasSameContract(prize, token);
            });
          }
          private updatePrizes(newPrizes: PrizePoolToken[] | FieldValue) {
            return this.prizePoolRef.update({ prizes: newPrizes });
          }
          public unionToken({
            addressContributor,
            token,
          }: {
            token: PrizePoolToken;
            addressContributor?: \`0x\${string}\`;
          }) {
            PrizePoolAccountant.assertValidTokenStatusUpdate(token);
            const tokenFoundIndex = this.findTokenIndex(token);
            if (tokenFoundIndex !== -1) {
              PrizePoolAccountant.assertContributorOfToken(
                token,
                \`\${addressContributor}\`,
              );
              return this.updatePrizes(
                this.prizes.map((currentToken, index) => {
                  return index === tokenFoundIndex ? token : currentToken;
                }),
              );
            }
            return this.prizePoolRef.update({
              prizes: FieldValue.arrayUnion(token),
            });
          }
          private static assertValidTokenStatusUpdate({ contributor }: PrizePoolToken) {
            if (contributor.stage && !contributor.address) {
              throw new https.HttpsError(
                'failed-precondition',
                \`Token status update attempted without addressContributor field\`,
              );
            }
          }
          private static assertContributorOfToken(
            { contributor }: PrizePoolToken,
            address: string,
          ) {
            if (contributor.address !== address) {
              throw new https.HttpsError(
                'unauthenticated',
                \`Token contributor is different to contributing user\`,
                \`Token contributor: \${contributor.address}, user: \${address}\`,
              );
            }
          }
          public modifyTokenAmount({
            token,
            newAmount,
          }: {
            token: PrizePoolToken;
            newAmount: string;
          }) {
            const tokenFoundIndex = this.assertTokenIndex(token);
            if (
              this.prizes[Number(tokenFoundIndex)].contributor.stage === 'transferred'
            ) {
              throw new https.HttpsError(
                'internal',
                'Cannot update amount of transferred token',
              );
            }
            return this.updatePrizes(
              this.prizes.map((currentToken, index) => {
                return index === tokenFoundIndex
                  ? { ...token, amount: newAmount }
                  : currentToken;
              }),
            );
          }
          private assertTokenIndex(token: PrizePoolToken) {
            const tokenFoundIndex = this.findTokenIndex(token);
            if (tokenFoundIndex === -1) {
              throw new https.HttpsError(
                'failed-precondition',
                'Token does not exist in current prize pool',
              );
            }
            return tokenFoundIndex;
          }
        }`,
      },
      {
        code: `export class TeamPayoutAllocator implements PayoutAllocator {
          public constructor(
            public readonly payouts: Token[][],
            private readonly payoutableDocPath: string,
            /**
             * @remarks
             * A list of teams ordered in ascending order of placement, irrespective of ties
             */
            private readonly teamsOrdered: Team[],
          ) {}
          public allocate() {
            this.assertSufficientPayouts();
            return this.teamsOrdered.flatMap((winner, index) => {
              return this.createTeamPayouts(winner, index);
            });
          }
          private assertSufficientPayouts() {
            if (this.teamsOrdered.length > this.payouts.length) {
              throw new HttpsError(
                'internal',
                \`Insufficient payouts for winners provided\`,
                \`Payouts length: \${this.payouts.length}, winners length: \${this.teamsOrdered.length}\`,
              );
            }
          }
          private createTeamPayouts(winner: Team, index: number) {
            const teamPayout = this.payouts[Number(index)];
            const divider = new TokenDivider(teamPayout, winner.members.length);
            const payoutDivided = divider.divideEvenly();
            return winner.members.map(
              (member: Member, i: number): Omit<Payout, 'id'> => {
                return {
                  payoutableDocPath: this.payoutableDocPath,
                  userId: member.userId,
                  tokens: payoutDivided[Number(i)].map((token) => {
                    return tokenToPayoutToken(token, member.userId);
                  }),
                };
              },
            );
          }
        }`,
      },
      {
        // Abstract class already in correct top-to-bottom order: caller before
        // helper, trailing abstract signature. Abstract members must not perturb
        // an already-sorted class (no false positive).
        code: `export abstract class Repro {
  public run() {
    return this.helper();
  }

  private helper() {
    return this.compute();
  }

  public abstract compute(): number;
}`,
      },
      {
        // Abstract class with an abstract property already in correct order:
        // property first, then caller, then helper.
        code: `export abstract class Repro {
  protected abstract readonly config: number;

  public run() {
    return this.helper();
  }

  private helper() {
    return this.config;
  }
}`,
      },
      {
        // Defense-in-depth (Part B): body contains an out-of-order pair PLUS an
        // untracked static initialization block. The rule must BAIL rather than
        // emit a rewritten body that silently deletes the static block.
        code: `export abstract class Repro {
  static {
    console.log('init');
  }
  private helper() {
    return 1;
  }
  public run() {
    return this.helper();
  }
}`,
      },
      {
        // Defense-in-depth (Part B): body contains an out-of-order pair PLUS an
        // untracked computed-key method. The rule must BAIL rather than delete
        // the untracked member.
        code: `export class Repro {
  ['dynamic']() {
    return 1;
  }
  private helper() {
    return 1;
  }
  public run() {
    return this.helper();
  }
}`,
      },
      // ── #1916: accessibility ranking ───────────────────────────────────
      // 'protected' was absent from the accessibility priority array, so
      // indexOf returned -1 and ranked every protected member ahead of the
      // public API it extends.
      {
        code: `export class Repro {
  public first() {
    return 1;
  }

  protected second() {
    return 2;
  }
}`,
      },
      {
        code: `export class Repro {
  public a: number[] = [];
  protected b: number[] = [];
}`,
      },
      // Pins the relative rank rather than the mere absence of a report, so a
      // fix that gives 'protected' the wrong slot still fails.
      {
        code: `export class Repro {
  public a: number[] = [];
  protected b: number[] = [];
  private c: number[] = [];
}`,
      },
      {
        code: `export class Repro {
  public first() {
    return 1;
  }

  protected second() {
    return 2;
  }

  private third() {
    return 3;
  }
}`,
      },
      // Implicit accessibility outranks protected, which outranks private.
      {
        code: `export class Repro {
  first() {
    return 1;
  }

  protected second() {
    return 2;
  }

  private third() {
    return 3;
  }
}`,
      },
      // Staticness outranks accessibility, so a protected static still leads.
      {
        code: `export class Repro {
  protected static first() {
    return 1;
  }

  public second() {
    return 2;
  }
}`,
      },
      // The conventional layout: fields, then public API, then extension
      // points, then internals.
      {
        code: `export class Repro {
  public a = 1;
  protected b = 2;
  private c = 3;

  public run() {
    return this.helper();
  }

  protected helper() {
    return this.internal();
  }

  private internal() {
    return 1;
  }
}`,
      },

      // ── #1917: an edge survives every enclosing statement form ─────────
      {
        code: `export class Repro {
  private run() {
    try {
      return this.helper();
    } catch (e) {
      return null;
    }
  }

  public helper() {
    return 1;
  }
}`,
      },
      // Control for the case above: the identical class without the try.
      {
        code: `export class Repro {
  private run() {
    return this.helper();
  }

  public helper() {
    return 1;
  }
}`,
      },
      {
        code: `export class Repro {
  private run() {
    try {
      return 1;
    } catch (e) {
      return this.helper();
    }
  }

  public helper() {
    return 1;
  }
}`,
      },
      {
        code: `export class Repro {
  private run() {
    try {
      return 1;
    } finally {
      this.helper();
    }
  }

  public helper() {
    return 1;
  }
}`,
      },
      {
        code: `export class Repro {
  private run() {
    try {
      throw this.helper();
    } catch (e) {
      return 0;
    }
  }

  public helper() {
    return 1;
  }
}`,
      },
      {
        code: `export class Repro {
  private run(flag: number) {
    switch (flag) {
      case 1:
        return this.helper();
      default:
        return 0;
    }
  }

  public helper() {
    return 1;
  }
}`,
      },
      {
        code: `export class Repro {
  private run() {
    switch (this.helper()) {
      case 1:
        return 1;
      default:
        return 0;
    }
  }

  public helper() {
    return 1;
  }
}`,
      },
      {
        code: `export class Repro {
  private run() {
    while (this.helper() < 10) {
      return 1;
    }
    return 0;
  }

  public helper() {
    return 1;
  }
}`,
      },
      {
        code: `export class Repro {
  private run() {
    do {
      return this.helper();
    } while (false);
  }

  public helper() {
    return 1;
  }
}`,
      },
      {
        code: `export class Repro {
  private run(obj: Record<string, number>) {
    for (const key in obj) {
      return this.helper();
    }
    return 0;
  }

  public helper() {
    return 1;
  }
}`,
      },
      {
        code: `export class Repro {
  private run(items: number[]) {
    for (const item of items) {
      return this.helper();
    }
    return 0;
  }

  public helper() {
    return 1;
  }
}`,
      },
      {
        code: `export class Repro {
  private run() {
    outer: {
      return this.helper();
    }
  }

  public helper() {
    return 1;
  }
}`,
      },
      {
        code: `export class Repro {
  private run() {
    return (0, this.helper());
  }

  public helper() {
    return 1;
  }
}`,
      },
      {
        code: `export class Repro {
  private run() {
    return this.helper\`x\`;
  }

  public helper() {
    return 1;
  }
}`,
      },
      {
        code: `export class Repro {
  private run() {
    return \`\${this.helper()}\`;
  }

  public helper() {
    return 1;
  }
}`,
      },
      // An arrow keeps the enclosing `this`, so the edge survives.
      {
        code: `export class Repro {
  private run() {
    const fn = () => this.helper();
    return fn();
  }

  public helper() {
    return 1;
  }
}`,
      },
      // A nested non-arrow function rebinds `this`, but a ClassName-qualified
      // static reference inside it still names this class's member.
      {
        code: `export class Repro {
  private static run() {
    const fn = function () {
      return Repro.helper();
    };
    return fn();
  }

  public static helper() {
    return 1;
  }
}`,
      },
      // Optional chaining wraps the member expression in a ChainExpression.
      {
        code: `export class Repro {
  private run() {
    return this?.helper();
  }

  public helper() {
    return 1;
  }
}`,
      },
      {
        code: `export class Repro {
  private run() {
    return this.helper?.();
  }

  public helper() {
    return 1;
  }
}`,
      },
      // A method passed as a callback is referenced without being called.
      {
        code: `export class Repro {
  private run(items: number[]) {
    return items.map(this.helper);
  }

  public helper() {
    return 1;
  }
}`,
      },
      // A string-literal computed access names the member as precisely as dot
      // access does.
      {
        code: `export class Repro {
  private run() {
    return this['helper']();
  }

  public helper() {
    return 1;
  }
}`,
      },

      // ── #1918: a name collision is not a reference ──────────────────────
      // A bare identifier sharing a member's name used to fabricate an edge,
      // reordering the class around a dependency that does not exist.
      {
        code: `export class Repro {
  public helper() {
    return 1;
  }

  public run() {
    const helper = 1;
    return helper;
  }
}`,
      },
      {
        code: `export class Repro {
  public helper() {
    return 1;
  }

  public run(helper: number) {
    return helper;
  }
}`,
      },
      {
        code: `export class Repro {
  public helper() {
    return 1;
  }

  public run(config: { helper: number }) {
    return config.helper;
  }
}`,
      },
      {
        code: `export class Repro {
  public helper() {
    return 1;
  }

  public run(props: { helper: number }) {
    const { helper } = props;
    return helper;
  }
}`,
      },
      {
        code: `import { helper } from './helpers';

export class Repro {
  public helper() {
    return 1;
  }

  public run() {
    return helper();
  }
}`,
      },
      {
        code: `export class Repro {
  public helper() {
    return 1;
  }

  public run() {
    const helper = 1;
    return { helper };
  }
}`,
      },
      {
        code: `export class Repro {
  public helper() {
    return 1;
  }

  public run(flag: boolean) {
    if (flag) {
      const helper = 2;
      return helper;
    }
    return 0;
  }
}`,
      },
      {
        code: `export class Repro {
  public helper() {
    return 1;
  }

  public run() {
    try {
      return 1;
    } catch (helper) {
      return 0;
    }
  }
}`,
      },
      {
        code: `export class Repro {
  public helper() {
    return 1;
  }

  public run() {
    return { helper: 1 };
  }
}`,
      },
      // `this` inside a non-arrow function is the call-site receiver, not the
      // instance, so it names no member of this class.
      {
        code: `export class Repro {
  public helper() {
    return 1;
  }

  public run() {
    const fn = function () {
      return this.helper();
    };
    return fn.call(this);
  }
}`,
      },
      // `super.helper` resolves to the base class's member, not this one's.
      {
        code: `export class Repro extends Base {
  public helper() {
    return 1;
  }

  public run() {
    return super.helper();
  }
}`,
      },
      // ── #1932: an ECMA private member is the same privacy as `private` ──
      // `private #foo` is a TypeScript error (TS18010), so the `#` spelling is
      // the only way to write these members and must be ordered, not skipped.
      {
        code: `export class Repro {
  public run() {
    return this.#helper();
  }

  #helper() {
    return 1;
  }
}`,
      },
      {
        code: `export class Repro {
  #unrelated = 1;

  public run() {
    return this.helper();
  }

  public helper() {
    return 1;
  }
}`,
      },
      {
        code: `export class Repro {
  public static run() {
    return Repro.#helper();
  }

  static #helper() {
    return 1;
  }
}`,
      },
      // A `#` member ranks with `private`, so it trails the public API rather
      // than leading it.
      {
        code: `export class Repro {
  public a = 1;
  #b = 2;
}`,
      },
      // `#foo` and `foo` are distinct members; keying them apart keeps this
      // already-sorted class from reading as a duplicate name.
      {
        code: `export class Repro {
  public run() {
    return this.#foo() + this.foo();
  }

  #foo() {
    return 1;
  }

  public foo() {
    return 2;
  }
}`,
      },
      // Field declaration order is observable, so a field whose initializer
      // reads another field pins the layout: hoisting the reader would read
      // `undefined` under `private` and throw under `#`.
      {
        code: `export class Repro {
  #a = 1;
  public b = this.#a;
}`,
      },
      {
        code: `export class Repro {
  private a = 1;
  public b = this.a;
}`,
      },
      {
        code: `export class Repro {
  private a = 1;
  public b = this['a'];
}`,
      },
      {
        code: `export class Repro {
  private static a = 1;
  public static b = Repro.a;
}`,
      },
      // An immediately invoked arrow runs during initialization and keeps the
      // enclosing `this`, so its read pins the layout too.
      {
        code: `export class Repro {
  #a = 1;
  public b = (() => this.#a)();
}`,
      },
      // A method an initializer calls runs during construction, so the fields
      // that method reads are read as eagerly as the initializer's own reads:
      // hoisting `derived` above `base` makes `new Repro()` throw.
      {
        code: `export class Repro {
  private readonly base = { n: 1 };
  public readonly derived = this.compute();
  private compute() {
    return this.base.n + 1;
  }
}`,
      },
      // The accessor spelling reads the same field through the same eager call.
      {
        code: `export class Repro {
  private readonly base = { n: 1 };
  public readonly derived = this.doubled;
  private get doubled() {
    return this.base.n * 2;
  }
}`,
      },
      // Under the ECMA `#` spelling the hoisted read throws outright rather
      // than yielding `undefined`.
      {
        code: `export class Repro {
  #base = { n: 1 };
  public derived = this.compute();
  private compute() {
    return this.#base.n;
  }
}`,
      },
      // A field holding an arrow runs that arrow's body at the call site, so an
      // initializer invoking it reads whatever the arrow reads.
      {
        code: `export class Repro {
  private readonly base = { n: 1 };
  public readonly makeIt = () => this.base.n;
  public readonly derived = this.makeIt();
}`,
      },
      // A read inside a callback the invoked body runs (`Array#map` calls it
      // before returning) is no less eager than one written inline.
      {
        code: `export class Repro {
  private readonly bases = [{ n: 1 }];
  private readonly offset = 1;
  public readonly derived = this.compute();
  private compute() {
    return this.bases.map((b) => b.n + this.offset);
  }
}`,
      },
      // A read of a member this class does not declare cannot be placed by the
      // sort, so the layout cannot be certified: decline instead of guessing.
      {
        code: `export class Repro extends Base {
  private readonly local = 1;
  public readonly derived = this.inherited;
}`,
      },
      // A `#name` resolves lexically, so it names the same field whatever value
      // it is read through: a static initializer reaching the field through
      // another instance of the class constrains the layout exactly as
      // `this.#tier` would. Hoisting the initializer above the declaration is
      // TS2729 and a runtime throw (#2022).
      {
        code: `declare const p: Pricing;
export class Pricing {
  readonly #tier!: Tier;
  static label = p.#tier === 'free' ? 'Free' : 'Pro';
}`,
      },
      // The same read written as a lookup rather than a conditional.
      {
        code: `declare const p: Pricing;
export class Pricing {
  readonly #tier!: Tier;
  static label = LABELS[p.#tier];
}`,
      },
      // A `#` field ranks with `private` and so sorts below a public field; the
      // public reader must still stay under the declaration it reads.
      {
        code: `declare const o: Repro;
export class Repro {
  #secret = 1;
  public label = o.#secret;
}`,
      },
      // The read reaches the field through an invoked method, which runs while
      // the initializer does.
      {
        code: `declare const o: Repro;
export class Repro {
  #secret = 1;
  public label = this.read();
  read() {
    return o.#secret;
  }
}`,
      },
      // #2193 subject: a class nested in a method rebinds `this`, so the
      // nested method's `this.helper` names Inner's member and lends Outer no
      // dependency. The MethodDefinition walk used to restore instance context
      // rather than preserve it, which credited the read to Outer and reordered
      // it on an edge that does not exist.
      {
        code: `class Outer {
  public helper() {
    return 2;
  }

  public outerMethod() {
    class Inner {
      public inner() {
        return this.helper();
      }
    }
    return Inner;
  }
}`,
      },
      // #2193 control: the arrow-field spelling of the same nested method has
      // identical `this` semantics and has always been read correctly.
      {
        code: `class Outer {
  public helper() {
    return 2;
  }

  public outerMethod() {
    class Inner {
      public inner = () => {
        return this.helper();
      };
    }
    return Inner;
  }
}`,
      },
      // The boundary holds however the nested member is spelled. A static
      // method rebinds `this` to the nested CLASS, not even an instance.
      {
        code: `class Outer {
  public helper() {
    return 2;
  }

  public outerMethod() {
    class Inner {
      static inner() {
        return this.helper();
      }
    }
    return Inner;
  }
}`,
      },
      // A getter is a MethodDefinition too, so it takes the same path.
      {
        code: `class Outer {
  public helper() {
    return 2;
  }

  public outerMethod() {
    class Inner {
      get value() {
        return this.helper();
      }
    }
    return Inner;
  }
}`,
      },
      // A constructor parameter default runs against the nested instance.
      {
        code: `class Outer {
  public helper() {
    return 2;
  }

  public outerMethod() {
    class Inner {
      constructor(readonly seed = this.helper()) {}
    }
    return Inner;
  }
}`,
      },
      // An anonymous class expression rebinds `this` exactly as a declaration
      // does, and the boundary composes across depth.
      {
        code: `class Outer {
  public helper() {
    return 2;
  }

  public outerMethod() {
    class Mid {
      public mid() {
        class Deep {
          public deep() {
            return this.helper();
          }
        }
        return Deep;
      }
    }
    return Mid;
  }
}`,
      },
    ],
    invalid: [
      {
        code: `
        class TestClass {
          field1: string;
          field2: number;
          methodA() {
            this.methodB();
          }
          constructor() {
            this.methodA();
            this.methodC();
          }
          methodB() {}
          methodC() {}
        }`,
        errors: [
          {
            messageId: 'classMethodsReadTopToBottom',
            data: {
              className: 'TestClass',
              actualMember: 'methodA',
              expectedMember: 'constructor',
            },
          },
        ],
        output: `
        class TestClass {
          field1: string;
          field2: number;
          constructor() {
            this.methodA();
            this.methodC();
          }
          methodA() {
            this.methodB();
          }
          methodB() {}
          methodC() {}
        }`,
      },
      {
        code: `
        const Holder = class Named {
          methodA() {
            return this.methodB();
          }
          constructor() {
            this.methodA();
          }
          methodB() {}
        };`,
        errors: [
          {
            messageId: 'classMethodsReadTopToBottom',
            data: {
              className: 'Named',
              actualMember: 'methodA',
              expectedMember: 'constructor',
            },
          },
        ],
        output: `
        const Holder = class Named {
          constructor() {
            this.methodA();
          }
          methodA() {
            return this.methodB();
          }
          methodB() {}
        };`,
      },
      {
        code: `
        class TestClass {
            field1: string;
            field2: number;
            constructor() {
              this.field1 = this.methodA();
              this.methodB();
            }
            methodB() {
                this.field2 = 5;
            }
            methodA(): string {
              return "foo";
            }
          }`,
        errors: [
          {
            messageId: 'classMethodsReadTopToBottom',
            data: {
              className: 'TestClass',
              actualMember: 'methodB',
              expectedMember: 'methodA',
            },
          },
        ],
        output: `
        class TestClass {
            field1: string;
            field2: number;
            constructor() {
              this.field1 = this.methodA();
              this.methodB();
            }
            methodA(): string {
              return "foo";
            }
            methodB() {
                this.field2 = 5;
            }
          }`,
      },
      {
        code: `
        class Outer {
          caller() {
            class Inner {
              methodInner() {}
              constructor() {}
            }
            return new Inner();
          }
          constructor() {
            this.caller();
          }
        }`,
        errors: [
          {
            messageId: 'classMethodsReadTopToBottom',
            data: {
              className: 'Outer',
              actualMember: 'caller',
              expectedMember: 'constructor',
            },
          },
          {
            messageId: 'classMethodsReadTopToBottom',
            data: {
              className: 'Inner',
              actualMember: 'methodInner',
              expectedMember: 'constructor',
            },
          },
        ],
        output: `
        class Outer {
          constructor() {
            this.caller();
          }
          caller() {
            class Inner {
              methodInner() {}
              constructor() {}
            }
            return new Inner();
          }
        }`,
      },
      {
        code: `export class TestClass {
          public field1: string;
          public fooBar: string;
          private field2: number;
          constructor() {
            this.methodA();
            this.field1 = '';
          }
          //We should test if comments are moved
          //We should expect to see these two lines kept above methodA
          async methodA() {
            for (let i = 0 ; i < 10; i ++) {
              this.methodB()
            }
            // this.fooBar = this.methodD();
            return methods;
          }
          //And this one kept above methodD
          public methodD() {
            /**
             *
             */
          }
          private methodB() {
            return 'Foobar';
          }
          private methodC() {
            /**
             *
             */
          }
        }`,
        errors: [
          {
            messageId: 'classMethodsReadTopToBottom',
            data: {
              className: 'TestClass',
              actualMember: 'methodD',
              expectedMember: 'methodB',
            },
          },
        ],
        output: `export class TestClass {
          public field1: string;
          public fooBar: string;
          private field2: number;
          constructor() {
            this.methodA();
            this.field1 = '';
          }
          //We should test if comments are moved
          //We should expect to see these two lines kept above methodA
          async methodA() {
            for (let i = 0 ; i < 10; i ++) {
              this.methodB()
            }
            // this.fooBar = this.methodD();
            return methods;
          }
          private methodB() {
            return 'Foobar';
          }
          //And this one kept above methodD
          public methodD() {
            /**
             *
             */
          }
          private methodC() {
            /**
             *
             */
          }
        }`,
      },
      {
        // plain methods + trailing abstract signature: abstract member must be relocated AND preserved
        code: `export abstract class Repro {
  private helper() {
    return this.compute();
  }

  public run() {
    return this.helper();
  }

  public abstract compute(): number;
}`,
        errors: [{ messageId: 'classMethodsReadTopToBottom' }],
        output: `export abstract class Repro {
  public run() {
    return this.helper();
  }

  private helper() {
    return this.compute();
  }

  public abstract compute(): number;
}`,
      },
      {
        // decorated getter interleaved + trailing abstract signature
        code: `import { Memoize } from '@blumintinc/typescript-memoize';

export abstract class Repro {
  private helper() {
    return this.compute();
  }

  @Memoize()
  public get value() {
    return this.helper();
  }

  public abstract compute(): number;
}`,
        errors: [{ messageId: 'classMethodsReadTopToBottom' }],
        output: `import { Memoize } from '@blumintinc/typescript-memoize';

export abstract class Repro {
  @Memoize()
  public get value() {
    return this.helper();
  }

  private helper() {
    return this.compute();
  }

  public abstract compute(): number;
}`,
      },
      {
        // Abstract PROPERTY (TSAbstractPropertyDefinition) referenced by a
        // concrete method: the abstract property must be relocated AND preserved.
        code: `export abstract class Repro {
  private helper() {
    return this.config;
  }

  public run() {
    return this.helper();
  }

  protected abstract readonly config: number;
}`,
        errors: [{ messageId: 'classMethodsReadTopToBottom' }],
        output: `export abstract class Repro {
  protected abstract readonly config: number;

  public run() {
    return this.helper();
  }

  private helper() {
    return this.config;
  }
}`,
      },
      {
        // Mixed abstract method + abstract property, both out of order and both
        // referenced by concrete members: every abstract signature is preserved.
        code: `export abstract class Repro {
  private helper() {
    return this.compute() + this.config;
  }

  public run() {
    return this.helper();
  }

  protected abstract readonly config: number;

  public abstract compute(): number;
}`,
        errors: [{ messageId: 'classMethodsReadTopToBottom' }],
        output: `export abstract class Repro {
  protected abstract readonly config: number;

  public run() {
    return this.helper();
  }

  private helper() {
    return this.compute() + this.config;
  }

  public abstract compute(): number;
}`,
      },
      {
        // Issue #1592: the blank lines separating members must survive the
        // reorder. Prettier preserves existing blank lines but never inserts
        // new ones, so collapsing them here would be irreversible.
        code: `
class Service {
  private readonly db: string;

  public fetchPage() {
    return this.buildQuery();
  }

  constructor(db: string) {
    this.db = db;
  }

  private buildQuery() {
    return this.db;
  }
}
`,
        errors: [{ messageId: 'classMethodsReadTopToBottom' }],
        output: `
class Service {
  private readonly db: string;

  constructor(db: string) {
    this.db = db;
  }

  public fetchPage() {
    return this.buildQuery();
  }

  private buildQuery() {
    return this.db;
  }
}
`,
      },
      {
        // Uneven separators are carried positionally, so a deliberately
        // blank-line-grouped body keeps its shape instead of collapsing into
        // a dense wall.
        code: `
class Grouped {
  private helper() {
    return this.seed;
  }


  public run() {
    return this.helper();
  }
  protected readonly seed = 1;
}
`,
        errors: [{ messageId: 'classMethodsReadTopToBottom' }],
        output: `
class Grouped {
  protected readonly seed = 1;


  public run() {
    return this.helper();
  }
  private helper() {
    return this.seed;
  }
}
`,
      },
      // ── #1916: protected outranks nothing above public ──────────────────
      {
        code: `export class Repro {
  protected second() {
    return 2;
  }

  public first() {
    return 1;
  }
}`,
        output: `export class Repro {
  public first() {
    return 1;
  }

  protected second() {
    return 2;
  }
}`,
        errors: [{ messageId: 'classMethodsReadTopToBottom' }],
      },
      {
        code: `export class Repro {
  protected b: number[] = [];
  public a: number[] = [];
}`,
        output: `export class Repro {
  public a: number[] = [];
  protected b: number[] = [];
}`,
        errors: [{ messageId: 'classMethodsReadTopToBottom' }],
      },
      {
        code: `export class Repro {
  private c = 3;
  protected b = 2;
}`,
        output: `export class Repro {
  protected b = 2;
  private c = 3;
}`,
        errors: [{ messageId: 'classMethodsReadTopToBottom' }],
      },

      // ── #1917/#1918: the edge itself is what drives these reports ────────
      // Each pair is two same-accessibility orphans apart from one genuine
      // `this.<member>` reference, so a lost edge silences the report and a
      // fabricated one would move a member for nothing.
      {
        code: `export class Repro {
  public helper() {
    return 1;
  }

  public run() {
    return this.helper();
  }
}`,
        output: `export class Repro {
  public run() {
    return this.helper();
  }

  public helper() {
    return 1;
  }
}`,
        errors: [{ messageId: 'classMethodsReadTopToBottom' }],
      },
      {
        code: `export class Repro {
  public helper() {
    return 1;
  }

  public run() {
    try {
      return this.helper();
    } catch (e) {
      return null;
    }
  }
}`,
        output: `export class Repro {
  public run() {
    try {
      return this.helper();
    } catch (e) {
      return null;
    }
  }

  public helper() {
    return 1;
  }
}`,
        errors: [{ messageId: 'classMethodsReadTopToBottom' }],
      },
      {
        code: `export class Repro {
  public helper() {
    return 1;
  }

  public run() {
    while (this.helper() < 10) {
      return 1;
    }
    return 0;
  }
}`,
        output: `export class Repro {
  public run() {
    while (this.helper() < 10) {
      return 1;
    }
    return 0;
  }

  public helper() {
    return 1;
  }
}`,
        errors: [{ messageId: 'classMethodsReadTopToBottom' }],
      },
      {
        code: `export class Repro {
  public helper() {
    return 1;
  }

  public run() {
    const fn = () => this.helper();
    return fn();
  }
}`,
        output: `export class Repro {
  public run() {
    const fn = () => this.helper();
    return fn();
  }

  public helper() {
    return 1;
  }
}`,
        errors: [{ messageId: 'classMethodsReadTopToBottom' }],
      },
      {
        code: `export class Repro {
  public static helper() {
    return 1;
  }

  public static run() {
    return Repro.helper();
  }
}`,
        output: `export class Repro {
  public static run() {
    return Repro.helper();
  }

  public static helper() {
    return 1;
  }
}`,
        errors: [{ messageId: 'classMethodsReadTopToBottom' }],
      },
      {
        code: `export class Repro {
  public helper() {
    return 1;
  }

  public run() {
    return this?.helper();
  }
}`,
        output: `export class Repro {
  public run() {
    return this?.helper();
  }

  public helper() {
    return 1;
  }
}`,
        errors: [{ messageId: 'classMethodsReadTopToBottom' }],
      },

      // ── #1932: the ECMA private spelling is ordered like `private` ───────
      // A `#` member used to leave the graph and the source order disagreeing
      // about how many members exist, which silenced the whole class body.
      {
        code: `export class Repro {
  #helper() {
    return 1;
  }

  public run() {
    return this.#helper();
  }
}`,
        output: `export class Repro {
  public run() {
    return this.#helper();
  }

  #helper() {
    return 1;
  }
}`,
        errors: [
          {
            messageId: 'classMethodsReadTopToBottom',
            data: {
              className: 'Repro',
              actualMember: '#helper',
              expectedMember: 'run',
            },
          },
        ],
      },
      // The bystander shape: the `#` member is ordered correctly and the
      // violation is entirely among plain public methods, so its presence must
      // not cost the class its diagnostic.
      {
        code: `export class Repro {
  #unrelated = 1;

  public helper() {
    return 1;
  }

  public run() {
    return this.helper();
  }
}`,
        output: `export class Repro {
  #unrelated = 1;

  public run() {
    return this.helper();
  }

  public helper() {
    return 1;
  }
}`,
        errors: [
          {
            messageId: 'classMethodsReadTopToBottom',
            data: {
              className: 'Repro',
              actualMember: 'helper',
              expectedMember: 'run',
            },
          },
        ],
      },
      // `Repro.#helper()` names a static the same way `Repro.helper()` does.
      {
        code: `export class Repro {
  static #helper() {
    return 1;
  }

  public static run() {
    return Repro.#helper();
  }
}`,
        output: `export class Repro {
  public static run() {
    return Repro.#helper();
  }

  static #helper() {
    return 1;
  }
}`,
        errors: [{ messageId: 'classMethodsReadTopToBottom' }],
      },
      // A `#` field ranks with `private`, so it belongs below the public field.
      {
        code: `export class Repro {
  #b = 2;
  public a = 1;
}`,
        output: `export class Repro {
  public a = 1;
  #b = 2;
}`,
        errors: [{ messageId: 'classMethodsReadTopToBottom' }],
      },
      // A read inside an arrow is deferred to call time, so the reader may
      // still be hoisted above the field it reads.
      {
        code: `export class Repro {
  #config = { a: 1 };
  public handler = () => this.#config;
}`,
        output: `export class Repro {
  public handler = () => this.#config;
  #config = { a: 1 };
}`,
        errors: [{ messageId: 'classMethodsReadTopToBottom' }],
      },
      // Private methods are installed on the instance before any field
      // initializer runs, so a field that calls one may precede it.
      {
        code: `export class Repro {
  #helper() {
    return 1;
  }

  public a = this.#helper();
}`,
        output: `export class Repro {
  public a = this.#helper();

  #helper() {
    return 1;
  }
}`,
        errors: [{ messageId: 'classMethodsReadTopToBottom' }],
      },
      // `#foo` and `foo` coexist: they must key apart, or one overwrites the
      // other and the fixer emits a body missing a member.
      {
        code: `export class Repro {
  #foo() {
    return 1;
  }

  public foo() {
    return 2;
  }

  public run() {
    return this.#foo() + this.foo();
  }
}`,
        output: `export class Repro {
  public run() {
    return this.#foo() + this.foo();
  }

  #foo() {
    return 1;
  }

  public foo() {
    return 2;
  }
}`,
        errors: [{ messageId: 'classMethodsReadTopToBottom' }],
      },
      // The transitive read is satisfied by the proposed order: `base` still
      // precedes `derived`, so the helper may move below both. Chasing reads
      // through a call must not decline an order that holds.
      {
        code: `export class Repro {
  public readonly base = { n: 1 };

  private compute() {
    return this.base.n + 1;
  }

  public readonly derived = this.compute();
}`,
        output: `export class Repro {
  public readonly base = { n: 1 };

  public readonly derived = this.compute();

  private compute() {
    return this.base.n + 1;
  }
}`,
        errors: [{ messageId: 'classMethodsReadTopToBottom' }],
      },
      // A method reaching only other methods adds no field constraint, so the
      // initializer that calls it still moves to the top.
      {
        code: `export class Repro {
  #helper() {
    return this.#inner();
  }

  #inner() {
    return 1;
  }

  public a = this.#helper();
}`,
        output: `export class Repro {
  public a = this.#helper();

  #helper() {
    return this.#inner();
  }

  #inner() {
    return 1;
  }
}`,
        errors: [{ messageId: 'classMethodsReadTopToBottom' }],
      },
      // A `#` METHOD read through another value constrains nothing: methods are
      // installed before any initializer runs, so the reorder still happens.
      {
        code: `declare const o: Repro;
export class Repro {
  private b = o.#calc();
  public a = 1;
  #calc() {
    return 2;
  }
}`,
        output: `declare const o: Repro;
export class Repro {
  public a = 1;
  private b = o.#calc();
  #calc() {
    return 2;
  }
}`,
        errors: [{ messageId: 'classMethodsReadTopToBottom' }],
      },
      // A nested class body SHADOWS the private names it declares, so `Inner`'s
      // `#q` is not a read of anything `Outer` declares and leaves Outer's own
      // fields free to sort.
      {
        code: `export class Outer {
  private z = this.m();
  public y = 1;
  m() {
    class Inner {
      #q = 1;
      r = this.#q;
    }
    return Inner;
  }
}`,
        output: `export class Outer {
  public y = 1;
  private z = this.m();
  m() {
    class Inner {
      #q = 1;
      r = this.#q;
    }
    return Inner;
  }
}`,
        errors: [{ messageId: 'classMethodsReadTopToBottom' }],
      },
      // #2193 positive control: a `<ClassName>.member` read does not depend on
      // `this`, so it still resolves OUTWARD from a nested class. Honouring the
      // rebind boundary must not cost the static edge.
      {
        code: `class Outer {
  public static helper() {
    return 2;
  }

  public static outerMethod() {
    class Inner {
      public inner() {
        return Outer.helper();
      }
    }
    return Inner;
  }
}`,
        output: `class Outer {
  public static outerMethod() {
    class Inner {
      public inner() {
        return Outer.helper();
      }
    }
    return Inner;
  }

  public static helper() {
    return 2;
  }
}`,
        errors: [{ messageId: 'classMethodsReadTopToBottom' }],
      },
    ],
  },
);
