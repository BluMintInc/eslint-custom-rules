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
        errors: [{ messageId: 'classMethodsReadTopToBottom' }],
        output: `
        class TestClass {field1: string;
field2: number;
constructor() {
            this.methodA();
            this.methodC();
          }
methodA() {
            this.methodB();
          }
methodB() {}
methodC() {}}`,
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
        errors: [{ messageId: 'classMethodsReadTopToBottom' }],
        output: `
        class TestClass {field1: string;
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
            }}`,
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
        errors: [{ messageId: 'classMethodsReadTopToBottom' }],
        output: `export class TestClass {public field1: string;
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
          }}`,
      },
    ],
  },
);
