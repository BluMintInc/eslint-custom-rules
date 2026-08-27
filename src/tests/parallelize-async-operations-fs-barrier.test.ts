import { parallelizeAsyncOperations } from '../rules/parallelize-async-operations';
import { ruleTesterTs } from '../utils/ruleTester';

/**
 * The filesystem ordering barrier (#2166).
 *
 * `writeFile(pending, data)` then `rename(pending, path)` passes no value from
 * one call to the other, so every value-based barrier reads the pair as
 * independent while the second call's precondition is the first one's side
 * effect. The `valid` cases below are the sequences a `Promise.all` rewrite
 * corrupts; the `invalid` cases are the over-suppression controls that keep the
 * barrier from degrading into "any file that imports fs is exempt".
 *
 * Three `valid` cases are marked as covered by the shared-receiver barrier as
 * well: `fs.writeFile()` beside `fs.rename()` shares a receiver, which already
 * held them before this barrier existed. They are kept because the receiver
 * coverage answers an unrelated question and lapses as soon as a file mixes
 * callee spellings, which the mixed cases beside them exercise.
 */
ruleTesterTs.run('parallelize-async-operations', parallelizeAsyncOperations, {
  valid: [
    // The issue's reproduction: writeFile needs mkdir's directory, rename needs
    // writeFile's file, and neither dependency touches a JS binding.
    `
import { mkdir, rename, writeFile } from 'node:fs/promises';
export const probe = async (dir: string, pending: string, path: string) => {
  await mkdir(dir, { recursive: true });
  await writeFile(pending, 'x');
  await rename(pending, path);
};
`,
    // The write-then-rename idiom on its own: run concurrently it either throws
    // ENOENT or publishes nothing, and which one is a race.
    `
import { rename, writeFile } from 'node:fs/promises';
export const publish = async (pending: string, path: string) => {
  await writeFile(pending, 'x');
  await rename(pending, path);
};
`,
    // The unprefixed specifier names the same module as `node:fs/promises`.
    `
import { unlink, writeFile } from 'fs/promises';
export const replace = async (a: string, b: string) => {
  await writeFile(a, 'x');
  await unlink(b);
};
`,
    // A named import used as a receiver: the operation is read off the member,
    // not off the binding. (Also held by the shared-receiver barrier.)
    `
import { promises } from 'node:fs';
export const seed = async (dir: string, file: string) => {
  await promises.mkdir(dir);
  await promises.writeFile(file, 'x');
};
`,
    // A renamed import classifies by the name it was EXPORTED under, so the
    // local spelling cannot hide the operation.
    `
import { rename as mv, writeFile as wf } from 'node:fs/promises';
export const publish = async (pending: string, path: string) => {
  await wf(pending, 'x');
  await mv(pending, path);
};
`,
    // A renamed read-only import still counts as an fs await, so the mutation
    // beside it engages the barrier.
    `
import { readFile as rf, writeFile } from 'node:fs/promises';
export const copy = async (src: string, dest: string) => {
  await rf(src);
  await writeFile(dest, 'x');
};
`,
    `
const { mkdir, writeFile } = require('node:fs/promises');
export const seed = async (dir: string, file: string) => {
  await mkdir(dir);
  await writeFile(file, 'x');
};
`,
    `
const { writeFile: wf, rename: mv } = require('fs/promises');
export const publish = async (pending: string, path: string) => {
  await wf(pending, 'x');
  await mv(pending, path);
};
`,
    // Mixed spellings share the resource while sharing no receiver, which is
    // where the shared-receiver barrier stops answering.
    `
import * as fsp from 'node:fs/promises';
import { rename } from 'node:fs/promises';
export const publish = async (pending: string, path: string) => {
  await fsp.writeFile(pending, 'x');
  await rename(pending, path);
};
`,
    // Namespace import alone. (Also held by the shared-receiver barrier.)
    `
import * as fs from 'node:fs/promises';
export const publish = async (pending: string, path: string) => {
  await fs.writeFile(pending, 'x');
  await fs.rename(pending, path);
};
`,
    // `fs.promises.writeFile` reaches the filesystem through the default
    // binding, two members deep.
    `
import fs from 'node:fs';
import { rename } from 'node:fs/promises';
export const publish = async (pending: string, path: string) => {
  await fs.promises.writeFile(pending, 'x');
  await rename(pending, path);
};
`,
    // Default import alone. (Also held by the shared-receiver barrier.)
    `
import fs from 'node:fs';
export const publish = async (pending: string, path: string) => {
  await fs.promises.writeFile(pending, 'x');
  await fs.promises.rename(pending, path);
};
`,
    `
import fs from 'fs';
import { rename } from 'node:fs/promises';
export const publish = async (pending: string, path: string) => {
  await fs.writeFile(pending, 'x');
  await rename(pending, path);
};
`,
    `
const fs = require('fs');
const { rename } = require('node:fs/promises');
export const publish = async (pending: string, path: string) => {
  await fs.promises.writeFile(pending, 'x');
  await rename(pending, path);
};
`,
    // `graceful-fs` is a drop-in wrapper over the same resource.
    `
import { rename, writeFile } from 'graceful-fs';
export const publish = async (pending: string, path: string) => {
  await writeFile(pending, 'x');
  await rename(pending, path);
};
`,
    `
const gfs = require('graceful-fs');
const { rename } = require('node:fs/promises');
export const publish = async (pending: string, path: string) => {
  await gfs.promises.writeFile(pending, 'x');
  await rename(pending, path);
};
`,
    // `require('fs').promises` is the same load one member deeper.
    `
const fsp = require('fs').promises;
const { rename } = require('node:fs/promises');
export const publish = async (pending: string, path: string) => {
  await fsp.writeFile(pending, 'x');
  await rename(pending, path);
};
`,
    // One mutation is enough: the read can observe what the write produces.
    `
import { readFile, writeFile } from 'node:fs/promises';
export const rebuild = async (src: string, dest: string) => {
  await readFile(src);
  await writeFile(dest, 'x');
};
`,
    // A `*Sync` operation performs the same mutation as its async spelling.
    `
import { mkdirSync, writeFileSync } from 'node:fs';
export const seed = async (dir: string, file: string) => {
  await mkdirSync(dir);
  await writeFileSync(file, 'x');
};
`,
    `
import { readFileSync, unlinkSync } from 'fs';
export const consume = async (src: string, tmp: string) => {
  await readFileSync(src);
  await unlinkSync(tmp);
};
`,
    // An fs export the allowlist does not enumerate classifies as mutating, so
    // an API the list has never heard of keeps the barrier rather than losing
    // it.
    `
import { readFile, futureFsApi } from 'node:fs/promises';
export const probe = async (a: string, b: string) => {
  await readFile(a);
  await futureFsApi(b);
};
`,
    `
import { frobnicate, defenestrate } from 'node:fs/promises';
export const probe = async (a: string, b: string) => {
  await frobnicate(a);
  await defenestrate(b);
};
`,
    // An unrelated await between the two fs awaits does not separate them: the
    // whole run is what the rewrite fuses.
    `
import { mkdir, writeFile } from 'node:fs/promises';
import { reportProgress } from './telemetry';
export const seed = async (dir: string, file: string, id: string) => {
  await mkdir(dir);
  await reportProgress(id);
  await writeFile(file, 'x');
};
`,
    `
import { mkdir, rm } from 'node:fs/promises';
export const reset = async (dir: string) => {
  await rm(dir, { recursive: true });
  await mkdir(dir);
};
`,
    `
import { appendFile, copyFile } from 'node:fs/promises';
export const archive = async (src: string, dest: string, log: string) => {
  await copyFile(src, dest);
  await appendFile(log, 'done');
};
`,
    // A read commutes with another read, not with a removal.
    `
import { opendir, rm } from 'node:fs/promises';
export const sweep = async (dir: string, stale: string) => {
  await opendir(dir);
  await rm(stale);
};
`,
    // Two specifier spellings of the same module still name one resource.
    `
import { writeFile } from 'fs/promises';
import { rename } from 'node:fs/promises';
export const publish = async (pending: string, path: string) => {
  await writeFile(pending, 'x');
  await rename(pending, path);
};
`,
    `
import { chmod, mkdir, writeFile } from 'node:fs/promises';
export const seed = async (dir: string, file: string) => {
  await mkdir(dir);
  await writeFile(file, 'x');
  await chmod(file, 0o600);
};
`,
    // A computed member names an operation the source does not state, so it
    // takes the mutating default.
    `
import * as fsp from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
export const probe = async (op: 'rm' | 'unlink', target: string, src: string) => {
  await fsp[op](target);
  await readFile(src);
};
`,
    // A computed STRING LITERAL member spells the operation exactly as the dot
    // form does, so it classifies the same way.
    `
import * as fsp from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
export const probe = async (target: string, src: string) => {
  await fsp['rm'](target);
  await readFile(src);
};
`,
    // Optional spellings denote the same load and the same call, so the barrier
    // has to survive them. ESTree wraps `a?.b` in a ChainExpression, and a bare
    // MemberExpression/CallExpression test sees the wrapper instead -- which
    // here withdraws the barrier rather than merely declining a report.
    `
const { mkdir, writeFile } = require?.('node:fs/promises');
export const seed = async (dir: string, file: string) => {
  await mkdir?.(dir);
  await writeFile?.(file, 'x');
};
`,
    `
const fsp = require('fs')?.promises;
const { rename } = require('node:fs/promises');
export const publish = async (pending: string, path: string) => {
  await fsp.writeFile(pending, 'x');
  await rename(pending, path);
};
`,
    `
import * as fsp from 'node:fs/promises';
export const publish = async (pending: string, path: string) => {
  await fsp?.writeFile(pending, 'x');
  await fsp?.rename(pending, path);
};
`,
    `
const fsp = require('fs')!.promises;
const { rename } = require('node:fs/promises');
export const publish = async (pending: string, path: string) => {
  await fsp.writeFile(pending, 'x');
  await rename(pending, path);
};
`,
    // Capturing the results changes nothing: the ordering never ran through a
    // value in the first place.
    `
import { mkdtemp, writeFile } from 'node:fs/promises';
export const stage = async (prefix: string, contents: string) => {
  const dir = await mkdtemp(prefix);
  const written = await writeFile('/tmp/pending', contents);
  return written;
};
`,
  ],
  invalid: [
    // Two observations commute, so the run is a latency mistake and keeps its
    // report. This is the case that stops the barrier becoming a blanket skip
    // for every file that imports fs.
    {
      code: `
import { readFile } from 'node:fs/promises';
export const load = async (a: string, b: string) => {
  const first = await readFile(a);
  const second = await readFile(b);
  return [first, second];
};
`,
      output: `
import { readFile } from 'node:fs/promises';
export const load = async (a: string, b: string) => {
  const [first, second] = await Promise.all([readFile(a), readFile(b)]);
  return [first, second];
};
`,
      errors: [{ messageId: 'parallelizeAsyncOperations' as const }],
    },
    {
      code: `
import { readFile, stat } from 'node:fs/promises';
export const inspect = async (a: string, b: string) => {
  const contents = await readFile(a);
  const info = await stat(b);
  return { contents, info };
};
`,
      output: `
import { readFile, stat } from 'node:fs/promises';
export const inspect = async (a: string, b: string) => {
  const [contents, info] = await Promise.all([readFile(a), stat(b)]);
  return { contents, info };
};
`,
      errors: [{ messageId: 'parallelizeAsyncOperations' as const }],
    },
    {
      code: `
import { lstat, readdir } from 'node:fs/promises';
export const inspect = async (dir: string, entry: string) => {
  const entries = await readdir(dir);
  const info = await lstat(entry);
  return { entries, info };
};
`,
      output: `
import { lstat, readdir } from 'node:fs/promises';
export const inspect = async (dir: string, entry: string) => {
  const [entries, info] = await Promise.all([readdir(dir), lstat(entry)]);
  return { entries, info };
};
`,
      errors: [{ messageId: 'parallelizeAsyncOperations' as const }],
    },
    {
      code: `
import { access, realpath } from 'node:fs/promises';
export const probe = async (a: string, b: string) => {
  await access(a);
  await realpath(b);
};
`,
      output: `
import { access, realpath } from 'node:fs/promises';
export const probe = async (a: string, b: string) => {
  await Promise.all([access(a), realpath(b)]);
};
`,
      errors: [{ messageId: 'parallelizeAsyncOperations' as const }],
    },
    // Stripping the `Sync` suffix has to work in the read-only direction too,
    // or every synchronous read would silently become a mutation.
    {
      code: `
import { readFileSync, statSync } from 'node:fs';
export const probe = async (a: string, b: string) => {
  const contents = await readFileSync(a);
  const info = await statSync(b);
  return { contents, info };
};
`,
      output: `
import { readFileSync, statSync } from 'node:fs';
export const probe = async (a: string, b: string) => {
  const [contents, info] = await Promise.all([readFileSync(a), statSync(b)]);
  return { contents, info };
};
`,
      errors: [{ messageId: 'parallelizeAsyncOperations' as const }],
    },
    // A renamed read-only import must resolve to its exported name, otherwise
    // the local spelling falls to the mutating default and the pair is lost.
    {
      code: `
import { readFile as rf, readlink as rl } from 'node:fs/promises';
export const probe = async (a: string, b: string) => {
  const contents = await rf(a);
  const target = await rl(b);
  return { contents, target };
};
`,
      output: `
import { readFile as rf, readlink as rl } from 'node:fs/promises';
export const probe = async (a: string, b: string) => {
  const [contents, target] = await Promise.all([rf(a), rl(b)]);
  return { contents, target };
};
`,
      errors: [{ messageId: 'parallelizeAsyncOperations' as const }],
    },
    {
      code: `
const { readFile, opendir } = require('node:fs/promises');
export const probe = async (a: string, b: string) => {
  const contents = await readFile(a);
  const dir = await opendir(b);
  return { contents, dir };
};
`,
      output: `
const { readFile, opendir } = require('node:fs/promises');
export const probe = async (a: string, b: string) => {
  const [contents, dir] = await Promise.all([readFile(a), opendir(b)]);
  return { contents, dir };
};
`,
      errors: [{ messageId: 'parallelizeAsyncOperations' as const }],
    },
    // No filesystem anywhere: the rule's bread and butter, on two distinct
    // callees with no shared receiver for another barrier to key on.
    {
      code: `
import { alpha, beta } from './m';
export const probe = async (a: string, b: string) => {
  await alpha(a);
  await beta(b);
};
`,
      output: `
import { alpha, beta } from './m';
export const probe = async (a: string, b: string) => {
  await Promise.all([alpha(a), beta(b)]);
};
`,
      errors: [{ messageId: 'parallelizeAsyncOperations' as const }],
    },
    // ONE fs await raises no ordering question: nothing else in the run touches
    // the resource it mutates.
    {
      code: `
import { writeFile } from 'node:fs/promises';
import { notify } from './notify';
export const probe = async (file: string, id: string) => {
  await writeFile(file, 'x');
  await notify(id);
};
`,
      output: `
import { writeFile } from 'node:fs/promises';
import { notify } from './notify';
export const probe = async (file: string, id: string) => {
  await Promise.all([writeFile(file, 'x'), notify(id)]);
};
`,
      errors: [{ messageId: 'parallelizeAsyncOperations' as const }],
    },
    {
      code: `
import { readFile } from 'node:fs/promises';
import { notify } from './notify';
export const probe = async (file: string, id: string) => {
  await readFile(file);
  await notify(id);
};
`,
      output: `
import { readFile } from 'node:fs/promises';
import { notify } from './notify';
export const probe = async (file: string, id: string) => {
  await Promise.all([readFile(file), notify(id)]);
};
`,
      errors: [{ messageId: 'parallelizeAsyncOperations' as const }],
    },
    // The barrier keys on the binding's ORIGIN, so a local helper that happens
    // to be spelled `writeFile` shares the name and nothing else.
    {
      code: `
const writeFile = async (path: string, data: string) => data;
const rename = async (from: string, to: string) => to;
export const probe = async (a: string, b: string) => {
  await writeFile(a, 'x');
  await rename(a, b);
};
`,
      output: `
const writeFile = async (path: string, data: string) => data;
const rename = async (from: string, to: string) => to;
export const probe = async (a: string, b: string) => {
  await Promise.all([writeFile(a, 'x'), rename(a, b)]);
};
`,
      errors: [{ messageId: 'parallelizeAsyncOperations' as const }],
    },
    {
      code: `
import { rename, writeFile } from './my-utils';
export const probe = async (pending: string, path: string) => {
  await writeFile(pending, 'x');
  await rename(pending, path);
};
`,
      output: `
import { rename, writeFile } from './my-utils';
export const probe = async (pending: string, path: string) => {
  await Promise.all([writeFile(pending, 'x'), rename(pending, path)]);
};
`,
      errors: [{ messageId: 'parallelizeAsyncOperations' as const }],
    },
    // A specifier that merely CONTAINS `fs` names some other module.
    {
      code: `
import { mkdir, writeFile } from 'memfs-like/fs-shim';
export const probe = async (dir: string, file: string) => {
  await mkdir(dir);
  await writeFile(file, 'x');
};
`,
      output: `
import { mkdir, writeFile } from 'memfs-like/fs-shim';
export const probe = async (dir: string, file: string) => {
  await Promise.all([mkdir(dir), writeFile(file, 'x')]);
};
`,
      errors: [{ messageId: 'parallelizeAsyncOperations' as const }],
    },
    {
      code: `
import { readFile } from 'fs/promises';
import { readdir } from 'node:fs/promises';
export const probe = async (file: string, dir: string) => {
  const contents = await readFile(file);
  const entries = await readdir(dir);
  return { contents, entries };
};
`,
      output: `
import { readFile } from 'fs/promises';
import { readdir } from 'node:fs/promises';
export const probe = async (file: string, dir: string) => {
  const [contents, entries] = await Promise.all([readFile(file), readdir(dir)]);
  return { contents, entries };
};
`,
      errors: [{ messageId: 'parallelizeAsyncOperations' as const }],
    },
    {
      code: `
import { access, readFile, stat } from 'node:fs/promises';
export const probe = async (a: string, b: string, c: string) => {
  await access(a);
  await readFile(b);
  await stat(c);
};
`,
      output: `
import { access, readFile, stat } from 'node:fs/promises';
export const probe = async (a: string, b: string, c: string) => {
  await Promise.all([access(a), readFile(b), stat(c)]);
};
`,
      errors: [{ messageId: 'parallelizeAsyncOperations' as const }],
    },
    {
      code: `
import { exists, readFile } from 'graceful-fs';
export const probe = async (a: string, b: string) => {
  await exists(a);
  await readFile(b);
};
`,
      output: `
import { exists, readFile } from 'graceful-fs';
export const probe = async (a: string, b: string) => {
  await Promise.all([exists(a), readFile(b)]);
};
`,
      errors: [{ messageId: 'parallelizeAsyncOperations' as const }],
    },
  ],
});
