import { ruleTesterTs } from '../utils/ruleTester';
import { preferSettingsObject } from '../rules/prefer-settings-object';

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
    // Third-party module member constructors
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
  ],
  invalid: [
    // Too many parameters
    {
      code: `function createUser(name: string, age: number, isAdmin: boolean) { return { name, age, isAdmin }; }`,
      errors: [{ messageId: 'tooManyParams', data: { count: 3 } }],
    },
    {
      code: `const createUser = (name: string, age: number, isAdmin: boolean) => ({ name, age, isAdmin });`,
      errors: [{ messageId: 'tooManyParams', data: { count: 3 } }],
    },
    // Same type parameters
    {
      code: `function sendEmail(to: string, from: string) { console.log(to, from); }`,
      options: [{ checkSameTypeParameters: true }],
      errors: [{ messageId: 'sameTypeParams' }],
    },
    // Method signatures
    {
      code: `
        interface UserService {
          createUser(name: string, age: number, isAdmin: boolean): void;
        }
      `,
      errors: [{ messageId: 'tooManyParams', data: { count: 3 } }],
    },
    // Function types
    {
      code: `type CreateUser = (name: string, age: number, isAdmin: boolean) => void;`,
      errors: [{ messageId: 'tooManyParams', data: { count: 3 } }],
    },
    // Default parameters
    {
      code: `function configureServer(port: number = 8080, hostname: string = 'localhost', ssl: boolean = false) {}`,
      errors: [{ messageId: 'tooManyParams', data: { count: 3 } }],
    },
  ],
});
