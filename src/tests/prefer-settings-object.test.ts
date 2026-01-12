import { ruleTesterTs, ruleTesterJsx } from '../utils/ruleTester';
import { preferSettingsObject } from '../rules/prefer-settings-object';

const tooManyParamsTemplate =
  "Function accepts {{count}} positional parameters (limit {{minimum}}). Long positional lists hide each argument's meaning and make call sites easy to mis-order. Pass a single settings object so callers name each field and keep the call readable.";

const sameTypeParamsTemplate =
  'Function receives {{paramCount}} positional parameters including multiple "{{type}}" values. Repeated types in positional arguments invite swapped values and force callers to remember parameter order. Replace the positional list with a settings object so each value is labeled and self-documenting.';

describe('prefer-settings-object messages', () => {
  it('exposes educational copy', () => {
    expect(preferSettingsObject.meta.messages.tooManyParams).toBe(
      tooManyParamsTemplate,
    );
    expect(preferSettingsObject.meta.messages.sameTypeParams).toBe(
      sameTypeParamsTemplate,
    );
  });
});

// Run non-JSX tests
ruleTesterTs.run('prefer-settings-object', preferSettingsObject, {
  valid: [
    // Functions with less than 3 parameters
    {
      code: `function twoParams(a: string, b: number) { return a + b; }`,
    },
    {
      code: `const arrowFn = (a: string, b: number) => a + b;`,
    },
    // Functions with different types
    {
      code: `function diffTypes(a: string, b: number) { return a + b; }`,
      options: [{ checkSameTypeParameters: true }],
    },
    // Bug fix test case: Function with different types and default values
    {
      code: `function findFunctionFiles(subdirectory: string = './', skipScripts: boolean = true) { return []; }`,
      options: [{ checkSameTypeParameters: true }],
    },
    // Ignored variadic functions
    {
      code: `function sum(...numbers: number[]) { return numbers.reduce((a, b) => a + b, 0); }`,
      options: [{ ignoreVariadicFunctions: true }],
    },
    // Ignored bound methods
    {
      code: `app.get('/user', (req: Request, res: Response, next: NextFunction) => {});`,
      options: [{ ignoreBoundMethods: true }],
    },
    // Already using settings object
    {
      code: `
        type Settings = { name: string; age: number; isAdmin: boolean; };
        function createUser({ name, age, isAdmin }: Settings) { return { name, age, isAdmin }; }
      `,
    },
    // Built-in Promise constructor
    {
      code: `
        await new Promise<webpack.Stats>((resolvePromise, rejectPromise) => {
          webpack(config, (err, stats) => {
            if (err || !stats) {
              rejectPromise(err ?? new Error('No stats returned from webpack'));
            } else {
              new PackageGenerator(pathing).writePackageJson();
              resolvePromise(stats);
            }
          });
        });
      `,
    },
    // Other built-in constructors
    {
      code: `
        const map = new Map<string, string>((entries) => {});
        const set = new Set<string>((values) => {});
        const date = new Date(year, month, day);
        const regex = new RegExp(pattern, flags);
        const error = new Error(message, options);
      `,
    },
    // Third-party module constructors
    {
      code: `
        import { Server } from 'socket.io';
        import { Client } from '@elastic/elasticsearch';
        import { Sequelize } from 'sequelize';
        import { MongoClient } from 'mongodb';
        import { Redis } from 'ioredis';
        import { Worker } from 'worker_threads';
        import { Transform } from 'stream';
        import { EventEmitter } from 'events';

        const io = new Server(httpServer, { cors: { origin: '*' } });
        const elastic = new Client({ node: 'http://localhost:9200' });
        const sequelize = new Sequelize('database', 'user', 'pass');
        const mongo = new MongoClient('mongodb://localhost:27017');
        const redis = new Redis({ host: 'localhost', port: 6379 });
        const worker = new Worker('./worker.js', { workerData: data });
        const transform = new Transform({ transform: (chunk, encoding, callback) => {} });
        const emitter = new EventEmitter();
      `,
    },
    // Third-party testing frameworks
    {
      code: `
        import { Test } from '@nestjs/testing';
        import { MockInstance } from 'vitest';
        import { TestBed } from '@angular/core/testing';
        import { TestingModule } from '@nestjs/testing';
        import { MockedClass } from 'jest-mock';

        const moduleRef = new Test.TestingModule(metadata);
        const mock = new MockInstance(fn);
        const testBed = new TestBed();
        const module = new TestingModule(imports);
        const mockedClass = new MockedClass();
      `,
    },
    // Third-party UI component libraries
    {
      code: `
        import { Modal } from 'antd';
        import { Dialog } from '@mui/material';
        import { Toast } from '@chakra-ui/react';
        import { Popover } from '@headlessui/react';
        import { Notification } from 'element-plus';

        const modal = new Modal({ title: 'Hello', content: 'World' });
        const dialog = new Dialog({ open: true });
        const toast = new Toast({ title: 'Success' });
        const popover = new Popover({ placement: 'bottom' });
        const notification = new Notification({ message: 'Done' });
      `,
    },
    // Third-party imported functions with same type parameters
    {
      code: `
        import { compareStrings } from '@string-compare';
        import { mergeArrays } from '@data/array-utils';
        import { joinPaths } from 'filesystem/path';
        import { combineStyles } from 'ui';

        // Two parameters of same type
        compareStrings('hello', 'world');
        mergeArrays([1, 2], [3, 4]);
        joinPaths('/root', '/subfolder');
        combineStyles('color: red', 'font-size: 12px');
      `,
      options: [{ checkSameTypeParameters: true }],
    },
    // Third-party imported functions with multiple parameters
    {
      code: `
        import { configureDatabase } from '@config';
        import { createApiEndpoint } from 'endpoints';
        import { setupLogger } from '@logging/setup';
        import { initializeWidget } from 'widgets/core';

        // Functions with 3+ parameters
        configureDatabase('localhost', 5432, 'mydb', true);
        createApiEndpoint('/users', 'GET', true, ['admin'], { cache: true });
        setupLogger('app', 'debug', true, './logs', 500);
        initializeWidget('sidebar', 'left', true, { theme: 'dark' }, onInit);
      `,
    },
    // Third-party imported class methods with multiple parameters
    {
      code: `
        import { DatabaseClient } from 'db/client';
        import { ApiService } from '@api/service';
        import { Logger } from 'logging';

        const db = new DatabaseClient();
        const api = new ApiService();
        const logger = new Logger();

        // Class methods with multiple parameters
        db.query('SELECT * FROM users', ['active'], { timeout: 5000 }, true);
        api.request('GET', '/users', { id: 1 }, true, headers);
        logger.log('error', 'Failed to connect', { attempt: 3 }, true, 'db');
      `,
    },
    // Third-party imported utility functions with mixed parameter types
    {
      code: `
        import { formatData } from 'utils/formatter';
        import { validateInput } from '@validation/core';
        import { transformConfig } from '@config';

        // Mixed parameter types and counts
        formatData('user', { id: 1 }, true, ['name', 'email']);
        validateInput(data, schema, true, options, onError);
        transformConfig(baseConfig, overrides, true, plugins, context);
      `,
    },
    // Different types with destructuring
    {
      code: `
        type DocSetterTransactionOptions = { transaction: any; converterOptions?: any };
        class DocSetterTransaction {
          constructor(
            collectionRef: CollectionReference,
            { transaction, ...converterOptions }: DocSetterTransactionOptions
          ) {}
        }
      `,
      options: [{ checkSameTypeParameters: true }],
    },
    // Functions with A/B pattern parameters
    {
      code: `
        // Parameters with A/B pattern should be ignored
        export const toMembershipPath = (groupIdA: string, groupIdB: string) => {
          const [firstId, secondId] = [groupIdA, groupIdB].sort();
          return toMembershipPathKnown(\`\${firstId}-\${secondId}\`);
        };

        // Another example with A/B pattern
        function compareValues(valueA: number, valueB: number) {
          return valueA - valueB;
        }
      `,
      options: [{ checkSameTypeParameters: true }],
    },
  ],
  invalid: [
    // Too many parameters
    {
      code: `function createUser(name: string, age: number, isAdmin: boolean) { return { name, age, isAdmin }; }`,
      errors: [{ messageId: 'tooManyParams', data: { count: 3, minimum: 3 } }],
    },
    {
      code: `const createUser = (name: string, age: number, isAdmin: boolean) => ({ name, age, isAdmin });`,
      errors: [{ messageId: 'tooManyParams', data: { count: 3, minimum: 3 } }],
    },
    // Same type parameters
    {
      code: `function sendEmail(to: string, from: string) { console.log(to, from); }`,
      options: [{ checkSameTypeParameters: true }],
      errors: [
        {
          messageId: 'sameTypeParams',
          data: { paramCount: 2, type: 'string' },
        },
      ],
    },
    // Method signatures
    {
      code: `
        interface UserService {
          createUser(name: string, age: number, isAdmin: boolean): void;
        }
      `,
      errors: [{ messageId: 'tooManyParams', data: { count: 3, minimum: 3 } }],
    },
    // Function types
    {
      code: `type CreateUser = (name: string, age: number, isAdmin: boolean) => void;`,
      errors: [{ messageId: 'tooManyParams', data: { count: 3, minimum: 3 } }],
    },
    // Default parameters
    {
      code: `function configureServer(port: number = 8080, hostname: string = 'localhost', ssl: boolean = false) {}`,
      errors: [{ messageId: 'tooManyParams', data: { count: 3, minimum: 3 } }],
    },
  ],
});

// Run JSX tests separately
ruleTesterJsx.run('prefer-settings-object', preferSettingsObject, {
  valid: [
    // React component test
    {
      code: `
        import React from 'react';
        import * as PIXI from 'pixi.js';
        import * as THREE from 'three';
        import * as monaco from 'monaco-editor';
        import * as Phaser from 'phaser';

        class MyComponent extends React.Component {
          render() {
            return <div>Hello</div>;
          }
        }

        const sprite = new PIXI.Sprite(texture);
        const scene = new THREE.Scene();
        const editor = new monaco.editor.Editor(element, options);
        const game = new Phaser.Game(config);
      `,
    },
  ],
  invalid: [],
});
