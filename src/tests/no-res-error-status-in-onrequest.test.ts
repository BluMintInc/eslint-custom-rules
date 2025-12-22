import { ruleTesterTs } from '../utils/ruleTester';
import { requireHttpsErrorInOnRequestHandlers } from '../rules/no-res-error-status-in-onrequest';

const parserOptions = {
  ecmaVersion: 2020 as const,
  sourceType: 'module' as const,
};

ruleTesterTs.run(
  'no-res-error-status-in-onrequest',
  requireHttpsErrorInOnRequestHandlers,
  {
    valid: [
      {
        code: `
          import onRequest from 'functions/src/v2/https/onRequest';
          export const handler = onRequest((req, res) => {
            res.status(200).json({ ok: true });
          });
        `,
        parserOptions,
      },
      {
        code: `
          import onRequest from 'functions/src/v2/https/onRequest';
          export default onRequest((req, res) => res.sendStatus(201));
        `,
        parserOptions,
      },
      {
        code: `
          import onRequest from 'functions/src/v2/https/onRequest';
          export default onRequest((req) => {
            return 'noop';
          });
        `,
        parserOptions,
      },
      {
        code: `
          import onRequest from 'functions/src/v2/https/onRequest';
          export default onRequest((req) => {
            validateRequest(req);
            return { ok: true };
          });
        `,
        parserOptions,
      },
      {
        code: `
          import onRequest from 'firebase-functions/v2/https';
          export default onRequest((req, res) => {
            res.status(500).send('outside scope');
          });
        `,
        parserOptions,
      },
      {
        code: `
          function handler(req, res) {
            res.status(500).send('ok');
          }
        `,
        parserOptions,
      },
      {
        code: `
          import onRequest from 'functions/src/v2/https/onRequest';
          export default onRequest((req, res) => {
            res.status(302).redirect('/foo');
          });
        `,
        parserOptions,
      },
      {
        code: `
          import onRequest from 'functions/src/v2/https/onRequest';
          const handler = (req, res) => {
            res.status(204).end();
          };
          export default onRequest({ cors: true }, handler);
        `,
        parserOptions,
      },
      {
        code: `
          import onRequest from 'functions/src/v2/https/onRequest';
          import { HttpsError } from 'functions/src/util/errors/HttpsError';
          export default onRequest((req) => {
            throw new HttpsError('failed-precondition', 'oops', { detail: true });
          });
        `,
        parserOptions,
      },
      {
        code: `
          import onRequest from 'functions/src/v2/https/onRequest';
          export default onRequest((req, res) => {
            logRequest(req);
            res.status(200).send('ok');
          });
        `,
        parserOptions,
      },
      {
        code: `
          import onRequest from 'functions/src/v2/https/onRequest';
          export default onRequest((req, res) => {
            const reply = () => res.status(200).send('fine');
            reply();
          });
        `,
        parserOptions,
      },
      {
        code: `
          import onRequest from 'functions/src/v2/https/onRequest';

          function handler(req, res) {
            res.status(200).send('ok');
          }

          function makeLocalHelper() {
            function handler(req, res) {
              res.status(500).send('not the onRequest handler');
            }
            return handler;
          }

          makeLocalHelper();
          export default onRequest(handler);
        `,
        parserOptions,
      },
      {
        code: `
          import onRequest from 'functions/src/v2/https/onRequest';

          export default onRequest(((req, res) => {
            res.status(200).send('ok');
          }) satisfies (req: unknown, res: { status: (code: number) => { send: (body: string) => void } }) => void);
        `,
        parserOptions,
      },
    ],
    invalid: [
      {
        code: `
          import onRequest from 'functions/src/v2/https/onRequest';
          export default onRequest((req, res) => {
            res.status(500).json({ message: 'boom' });
          });
        `,
        parserOptions,
        errors: [{ messageId: 'useHttpsErrorForStatus' }],
      },
      {
        code: `
          import onRequest from 'functions/src/v2/https/onRequest';
          export default onRequest((req, res) => {
            res.sendStatus(404);
          });
        `,
        parserOptions,
        errors: [{ messageId: 'useHttpsErrorForStatus' }],
      },
      {
        code: `
          import onRequest from 'functions/src/v2/https/onRequest';
          export default onRequest((req, res) => {
            res.status(403).send('Forbidden');
          });
        `,
        parserOptions,
        errors: [{ messageId: 'useHttpsErrorForStatus' }],
      },
      {
        code: `
          import onRequest from 'functions/src/v2/https/onRequest';
          export default onRequest((req, res) => {
            res.status(429).end();
          });
        `,
        parserOptions,
        errors: [{ messageId: 'useHttpsErrorForStatus' }],
      },
      {
        code: `
          import onRequest from 'functions/src/v2/https/onRequest';
          export default onRequest((req, res) => {
            res.status(502).json({ message: 'Downstream unavailable' });
          });
        `,
        parserOptions,
        errors: [{ messageId: 'useHttpsErrorForStatus' }],
      },
      {
        code: `
          import onRequest from 'functions/src/v2/https/onRequest';
          export default onRequest((req, res) => {
            res.status(isAuth ? 401 : 400).json({ message: 'bad' });
          });
        `,
        parserOptions,
        errors: [{ messageId: 'useHttpsErrorForComputedStatus' }],
      },
      {
        code: `
          import onRequest from 'functions/src/v2/https/onRequest';
          export default onRequest((req, res) => {
            const status = getStatus();
            res.status(status).json({ message: 'dynamic' });
          });
        `,
        parserOptions,
        errors: [{ messageId: 'useHttpsErrorForComputedStatus' }],
      },
      {
        code: `
          import onRequest from 'functions/src/v2/https/onRequest';
          export default onRequest((req, res) => {
            const status = getStatus();
            res.sendStatus(status);
          });
        `,
        parserOptions,
        errors: [{ messageId: 'useHttpsErrorForComputedStatus' }],
      },
      {
        code: `
          import onRequest from 'functions/src/v2/https/onRequest';
          export default onRequest((req, res) => {
            badRequest(res, { reason: 'missing' });
          });
        `,
        parserOptions,
        errors: [{ messageId: 'useHttpsErrorForWrapper' }],
      },
      {
        code: `
          import onRequest from 'functions/src/v2/https/onRequest';
          function handler(req, res) {
            res.status(409).send('exists');
          }
          export default onRequest(handler);
        `,
        parserOptions,
        errors: [{ messageId: 'useHttpsErrorForStatus' }],
      },
      {
        code: `
          import onRequest from 'functions/src/v2/https/onRequest';
          const handler = (req, res) => {
            res.status(502).json({ detail: 'upstream' });
          };
          export default onRequest({ region: 'us-central1' }, handler);
        `,
        parserOptions,
        errors: [{ messageId: 'useHttpsErrorForStatus' }],
      },
      {
        code: `
          import onRequest from 'functions/src/v2/https/onRequest';
          function handler(req, res) {
            res.status(500).send('boom');
          }
          export default onRequest(handler!);
        `,
        parserOptions,
        errors: [{ messageId: 'useHttpsErrorForStatus' }],
      },
      {
        code: `
          import onRequest from 'functions/src/v2/https/onRequest';
          export default onRequest((req, res) => {
            const reply = () => res.sendStatus(500);
            reply();
          });
        `,
        parserOptions,
        errors: [{ messageId: 'useHttpsErrorForStatus' }],
      },
      {
        code: `
          import onRequest from 'functions/src/v2/https/onRequest';

          const handler = ((req, res) => {
            res.status(500).send('boom');
          }) satisfies (req: unknown, res: { status: (code: number) => { send: (body: string) => void } }) => void;

          export default onRequest(handler);
        `,
        parserOptions,
        errors: [{ messageId: 'useHttpsErrorForStatus' }],
      },
      {
        code: `
          import onRequest from 'functions/src/v2/https/onRequest';

          export default onRequest(((req, res) => {
            res.sendStatus(404);
          }) satisfies (req: unknown, res: { sendStatus: (code: number) => void }) => void);
        `,
        parserOptions,
        errors: [{ messageId: 'useHttpsErrorForStatus' }],
      },
      {
        code: `
          import onRequest from 'functions/src/v2/https/onRequest';

          const handler = ((req, res) => {
            res.status(500).send('boom');
          }) as (req: unknown, res: { status: (code: number) => { send: (body: string) => void } }) => void satisfies (
            req: unknown,
            res: { status: (code: number) => { send: (body: string) => void } }
          ) => void;

          export default onRequest(handler);
        `,
        parserOptions,
        errors: [{ messageId: 'useHttpsErrorForStatus' }],
      },
      {
        code: `
          import onRequest from 'functions/src/v2/https/onRequest';

          export default onRequest(<(req: unknown, res: { sendStatus: (code: number) => void }) => void>((req, res) => {
            res.sendStatus(500);
          }));
        `,
        parserOptions,
        errors: [{ messageId: 'useHttpsErrorForStatus' }],
      },
    ],
  },
);
