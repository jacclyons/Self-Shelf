/**
 * Run with Node 22.13+ (built-ins only): node --test scripts/test-reader-storage.mjs
 *
 * Execute the storage twins with an in-memory Expo filesystem. Transfers can
 * leave partial writes or resolve after abort, and moves mutate the File URI,
 * matching the native behaviours that make cancel/retry cleanup race-prone.
 * These tests do not replace an on-device filesystem/network smoke test.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { createContext, Script } from 'node:vm';

const item = { Id: 'book-1', Container: 'epub' };
const session = { token: 'test-token' };
const root = 'file:///documents/.jellyshelf';
const cacheUri = `${root}/cache/book-1.epub`;
const pinnedUri = `${root}/books/book-1.epub`;
const publicNames = [
  'bookForReading', 'downloadBook', 'ensureReaderEngine', 'cacheSize',
  'isDownloaded', 'localBookFile', 'canDownload',
];

function loadStorage(twin, globals) {
  const source = readFileSync(new URL(`../src/lib/${twin}`, import.meta.url), 'utf8');
  const executable = stripTypeScriptTypes(source.replace(/^import .*;\r?\n/gm, ''))
    .replace(/^export /gm, '');
  const context = createContext({ AbortController, ...globals });
  new Script(`${executable}\nglobalThis.storage = { ${publicNames.join(', ')} };`, {
    filename: twin,
  }).runInContext(context, { timeout: 1000 });
  return context.storage;
}

function harness() {
  const files = new Map();
  const directories = new Set(['file:///documents/']);
  const rows = new Map();
  const kv = new Map();
  const transfers = [];
  const moves = [];
  const deleted = [];
  const assets = [];
  const faults = { move: null, delete: new Set(), assetFailures: 0 };
  const join = (parts) => parts.map((part) => (part.uri ?? part).replace(/\/$/, '')).join('/');

  class Directory {
    constructor(...parts) { this.uri = `${join(parts)}/`; }
    get exists() { return directories.has(this.uri); }
    create() { directories.add(this.uri); }
    delete() {
      for (const uri of files.keys()) if (uri.startsWith(this.uri)) files.delete(uri);
      for (const uri of directories) if (uri.startsWith(this.uri)) directories.delete(uri);
    }
    list() {
      const isChild = (uri) => uri.startsWith(this.uri) && uri !== this.uri &&
        !uri.slice(this.uri.length).replace(/\/$/, '').includes('/');
      return [
        ...[...files.keys()].filter(isChild).map((uri) => new File(uri)),
        ...[...directories].filter(isChild).map((uri) => new Directory(uri)),
      ];
    }
  }

  class File {
    constructor(...parts) { this.uri = join(parts); }
    get exists() { return files.has(this.uri); }
    get name() { return this.uri.split('/').pop(); }
    get parentDirectory() { return new Directory(this.uri.slice(0, this.uri.lastIndexOf('/'))); }
    get size() { return files.get(this.uri) ?? 0; }
    get lastModified() { return 0; }
    delete() {
      if (faults.delete.has(this.uri)) throw new Error('Cannot delete staging file');
      assert.ok(this.exists, `Cannot delete missing file: ${this.uri}`);
      deleted.push(this.uri);
      files.delete(this.uri);
    }
    copySync(target) {
      assert.ok(this.exists);
      files.set(target.uri, this.size);
    }
    moveSync(target, options) {
      if (faults.move) throw faults.move;
      assert.ok(this.exists);
      assert.ok(target.parentDirectory.exists);
      assert.ok(!target.exists || options?.overwrite, 'Move must explicitly allow overwriting.');
      moves.push({ from: this.uri, to: target.uri });
      files.set(target.uri, this.size);
      files.delete(this.uri);
      this.uri = target.uri;
    }
    static downloadFileAsync(url, target, options) {
      assert.ok(target.parentDirectory.exists);
      assert.equal(target.exists, false, 'Each transfer needs a fresh staging path.');
      return new Promise((resolve, reject) => {
        transfers.push({
          uri: target.uri,
          url,
          options,
          write(size) { files.set(this.uri, size); },
          progress(bytesWritten, totalBytes) { options.onProgress({ bytesWritten, totalBytes }); },
          succeed(size = 100) {
            this.write(size);
            resolve(new File(this.uri));
          },
          fail(error = new Error('Network interrupted')) { reject(error); },
        });
      });
    }
  }

  const globals = {
    Directory, File, Paths: { document: 'file:///documents/' }, randomUUID,
    __DEV__: false,
    require: (path) => path,
    Asset: {
      fromModule(module) {
        const localUri = `file:///bundle/${module.split('/').pop()}`;
        return {
          localUri,
          async downloadAsync() {
            assets.push(module);
            if (faults.assetFailures > 0) {
              faults.assetFailures--;
              throw new Error('Asset unavailable');
            }
            files.set(localUri, 100);
          },
        };
      },
    },
    downloadUrl: (_session, id) => `https://server.invalid/Items/${id}/Download`,
    downloadHeaders: () => ({ Authorization: 'test-auth' }),
    isLocalId: (id) => id.startsWith('local:'),
    formatOf: () => 'epub',
    getDownload: (id) => rows.get(id),
    forgetDownload: (id) => rows.delete(id),
    recordDownload: (row) => rows.set(row.item_id, row),
    listDownloads: () => [...rows.values()],
    kvGet: (key, fallback) => kv.get(key) ?? fallback,
    kvSet: (key, value) => kv.set(key, value),
  };
  return {
    storage: loadStorage('storage.ts', globals), globals,
    files, directories, rows, kv, transfers, moves, deleted, assets, faults,
  };
}

for (const method of ['bookForReading', 'downloadBook']) {
  const targetUri = method === 'bookForReading' ? cacheUri : pinnedUri;

  test(`${method}: failure removes only its partial file; retry publishes a complete copy`, async () => {
    const h = harness();
    const untouched = `${root}/cache/another.epub`;
    h.files.set(untouched, 12);
    const first = h.storage[method](session, item);
    const failed = assert.rejects(first.promise, /Network interrupted/);
    const transfer = h.transfers[0];
    transfer.write(40);
    assert.notEqual(transfer.uri, targetUri);
    assert.equal(h.files.has(targetUri), false);
    assert.equal(h.storage.cacheSize(), method === 'bookForReading' ? 12 : 0);
    transfer.fail();
    await failed;
    assert.equal(h.files.has(transfer.uri), false);
    assert.equal(h.files.get(untouched), 12);
    assert.equal(h.rows.size, 0);
    assert.equal(h.kv.has('cache.opened'), false);

    const retry = h.storage[method](session, item);
    assert.notEqual(h.transfers[1].uri, transfer.uri);
    h.transfers[1].succeed(100);
    assert.equal((await retry.promise).uri, targetUri);
    assert.equal(h.files.get(targetUri), 100);
    assert.equal(h.files.has(h.transfers[1].uri), false);
    assert.equal(h.moves.length, 1);
    assert.equal(h.rows.size, method === 'downloadBook' ? 1 : 0);
    if (method === 'downloadBook') {
      assert.equal(h.rows.get(item.Id).uri, pinnedUri);
      assert.equal(h.rows.get(item.Id).size, 100);
    } else {
      assert.equal(h.storage.cacheSize(), 112);
      assert.equal(typeof h.kv.get('cache.opened')['book-1.epub'], 'number');
    }
  });

  for (const completion of ['success', 'failure']) {
    test(`${method}: cancelled attempt settles with ${completion} after retry, without damaging it`, async () => {
      const h = harness();
      const progress = [];
      const first = h.storage[method](session, item, (...args) => progress.push(args));
      const failed = assert.rejects(first.promise,
        completion === 'success' ? { name: 'AbortError' } : /Network interrupted/);
      const old = h.transfers[0];
      old.write(20);
      old.progress(20, 100);
      first.cancel();
      first.cancel();
      assert.equal(old.options.signal.aborted, true);
      const retry = h.storage[method](session, item);
      assert.notEqual(old.uri, h.transfers[1].uri);
      h.transfers[1].succeed(200);
      await retry.promise;
      old.progress(30, 100);
      if (completion === 'success') old.succeed(50);
      else old.fail();
      await failed;
      assert.deepEqual(progress, [[0.2, 20]]);
      assert.equal(h.files.has(old.uri), false);
      assert.equal(h.files.get(targetUri), 200);
      assert.equal(h.moves.length, 1);
      assert.equal(h.rows.size, method === 'downloadBook' ? 1 : 0);
      if (method === 'downloadBook') assert.equal(h.rows.get(item.Id).size, 200);
      retry.cancel();
      assert.equal(h.files.get(targetUri), 200, 'Cancel after success must not unlink the published file.');
    });
  }

  test(`${method}: cancellation between SDK resolution and promotion rejects`, async () => {
    const h = harness();
    const handle = h.storage[method](session, item);
    const failed = assert.rejects(handle.promise, { name: 'AbortError' });
    h.transfers[0].succeed();
    handle.cancel();
    await failed;
    assert.equal(h.files.has(targetUri), false);
    assert.equal(h.files.has(h.transfers[0].uri), false);
    assert.equal(h.rows.size, 0);
  });

  test(`${method}: promotion failure cleans staging and does not record a book`, async () => {
    const h = harness();
    h.faults.move = new Error('Rename failed');
    const handle = h.storage[method](session, item);
    const failed = assert.rejects(handle.promise, /Rename failed/);
    h.transfers[0].succeed();
    await failed;
    assert.equal(h.files.has(targetUri), false);
    assert.equal(h.files.has(h.transfers[0].uri), false);
    assert.equal(h.rows.size, 0);
    assert.equal(h.kv.has('cache.opened'), false);
  });
}

test('failed cleanup preserves the download error; abandoned and active staging stay outside cache accounting/eviction', async () => {
  const h = harness();
  const first = h.storage.bookForReading(session, item);
  const failed = assert.rejects(first.promise, /Network interrupted/);
  const abandoned = h.transfers[0];
  abandoned.write(2 * 1024 ** 3);
  h.faults.delete.add(abandoned.uri);
  abandoned.fail();
  await failed;
  assert.equal(h.storage.cacheSize(), 0);
  h.faults.delete.clear();

  const active = h.storage.bookForReading(session, { ...item, Id: 'book-2' });
  const activeFailed = assert.rejects(active.promise, /Network interrupted/);
  h.transfers[1].write(2 * 1024 ** 3);
  const retry = h.storage.bookForReading(session, item);
  h.transfers[2].succeed(100);
  await retry.promise;
  assert.equal(h.storage.cacheSize(), 100);
  assert.equal(h.files.has(abandoned.uri), true, 'No sweep of pre-existing artifacts.');
  assert.equal(h.files.has(h.transfers[1].uri), true, 'Trimming must not remove an active transfer.');
  assert.deepEqual(Object.keys(h.kv.get('cache.opened')), ['book-1.epub']);
  active.cancel();
  h.transfers[1].fail();
  await activeFailed;
});

test('existing cached and pinned books remain hits; pinning a complete cache still moves it', async () => {
  const h = harness();
  h.directories.add(`${root}/cache/`);
  h.files.set(cacheUri, 123);
  const cached = h.storage.bookForReading(session, item);
  cached.cancel();
  assert.equal((await cached.promise).uri, cacheUri);
  const pinned = await h.storage.downloadBook(session, item).promise;
  assert.equal(pinned.uri, pinnedUri);
  assert.equal(h.files.has(cacheUri), false);
  assert.equal(h.files.get(pinnedUri), 123);
  for (const method of ['bookForReading', 'downloadBook']) {
    const handle = h.storage[method](session, item);
    handle.cancel();
    assert.equal((await handle.promise).uri, pinnedUri);
  }
  assert.equal(h.transfers.length, 0);
  assert.equal(h.storage.isDownloaded(item.Id), true);
});

test('an unrecorded pinned target is not deleted on failure, and is replaced only by a completed transfer', async () => {
  const h = harness();
  h.files.set(pinnedUri, 25);
  const first = h.storage.downloadBook(session, item);
  const failed = assert.rejects(first.promise, /Network interrupted/);
  assert.equal(h.files.get(pinnedUri), 25);
  h.transfers[0].write(10);
  h.transfers[0].fail();
  await failed;
  assert.equal(h.files.get(pinnedUri), 25);
  assert.equal(h.storage.isDownloaded(item.Id), false);
  const retry = h.storage.downloadBook(session, item);
  h.transfers[1].succeed(100);
  await retry.promise;
  assert.equal(h.files.get(pinnedUri), 100);
  assert.equal(h.storage.isDownloaded(item.Id), true);
});

test('concurrent successful reads each clean their own staging file', async () => {
  const h = harness();
  const first = h.storage.bookForReading(session, item);
  const second = h.storage.bookForReading(session, item);
  assert.notEqual(h.transfers[0].uri, h.transfers[1].uri);
  h.transfers[1].succeed();
  await second.promise;
  h.transfers[0].succeed();
  await first.promise;
  assert.equal(h.storage.cacheSize(), 100);
  for (const transfer of h.transfers) assert.equal(h.files.has(transfer.uri), false);
});

test('progress retains fraction/bytes, unknown length stays zero, and authentication is forwarded', async () => {
  const h = harness();
  const progress = [];
  const handle = h.storage.bookForReading(session, item, (...args) => progress.push(args));
  const transfer = h.transfers[0];
  assert.equal(transfer.options.headers.Authorization, 'test-auth');
  assert.equal(transfer.url, 'https://server.invalid/Items/book-1/Download');
  transfer.progress(10, -1);
  transfer.progress(20, 100);
  transfer.succeed(100);
  await handle.promise;
  assert.deepEqual(progress, [[0, 10], [0.2, 20]]);
});

test('engine setup shares in-flight work, retries rejection, and publishes version 10 with the comic worker', async () => {
  const h = harness();
  h.kv.set('engine.version', 9);
  h.files.set(`${root}/engine/reader.html`, 9);
  h.faults.assetFailures = 1;
  const first = h.storage.ensureReaderEngine();
  assert.equal(h.storage.ensureReaderEngine(), first);
  await assert.rejects(first, /Asset unavailable/);
  assert.equal(h.kv.get('engine.version'), 9);

  const retry = h.storage.ensureReaderEngine();
  assert.notEqual(retry, first);
  assert.equal(await retry, `${root}/engine/reader.html`);
  assert.equal(h.kv.get('engine.version'), 10);
  assert.ok(h.assets.includes('../../assets/reader/comic-worker.jstxt'));
  assert.equal(h.files.has(`${root}/engine/comic-worker.js`), true);
  assert.equal(h.files.has(`${root}/engine/comic-worker.jstxt`), false);
  assert.equal(h.storage.ensureReaderEngine(), retry);
});

test('web twin keeps the same handles without starting a native transfer', async () => {
  const h = harness();
  const web = loadStorage('storage.web.ts', h.globals);
  assert.equal(await web.ensureReaderEngine(), '/reader/reader.html');
  assert.equal(web.canDownload, false);
  assert.equal(web.cacheSize(), 0);
  for (const method of ['bookForReading', 'downloadBook']) {
    const handle = web[method](session, item, () => assert.fail('Web must not report native download progress.'));
    handle.cancel();
    assert.equal((await handle.promise).uri,
      'https://server.invalid/Items/book-1/Download?ApiKey=test-token&api_key=test-token');
  }
  assert.equal(h.transfers.length, 0);
});
