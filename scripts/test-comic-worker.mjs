/**
 * Run with: node --test scripts/test-comic-worker.mjs
 *
 * A classic-worker VM shim uses real structured-clone transfers and forbids all
 * network loading. In-memory stored RAR4 fixtures exercise the actual vendored
 * JS + WASM without external dependencies, archivers, or extra fixture files.
 * These fixtures do not claim coverage of compressed solid RAR or RAR5 records.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createContext, Script } from 'node:vm';

const workerSource = readFileSync(new URL('../assets/reader/comic-worker.jstxt', import.meta.url), 'utf8');
const vendorSource = readFileSync(new URL('../assets/reader/unrar.jstxt', import.meta.url), 'utf8');
const wasmBytes = readFileSync(new URL('../assets/reader/unrar.wasm', import.meta.url));
const ARCHIVE_PATH = '_defaultUnrarJS_.rar';

function arrayBuffer(bytes) {
  return Uint8Array.from(bytes).buffer;
}

function worker({ decoder, vendor = false, beforePost = () => {} } = {}) {
  const messages = [];
  const transfers = [];
  let yields = 0;
  const noNetwork = () => { throw new Error('The worker must not load external resources.'); };
  const context = createContext({
    ArrayBuffer,
    Uint8Array,
    TextDecoder,
    WebAssembly,
    console,
    UnrarJS: decoder,
    location: { href: 'blob:comic-worker-test' },
    importScripts: noNetwork,
    fetch: noNetwork,
    XMLHttpRequest: class { constructor() { noNetwork(); } },
    setTimeout(callback, delay) {
      yields++;
      return setTimeout(callback, delay);
    },
    clearTimeout,
    postMessage(message, transfer = []) {
      beforePost(message, transfer);
      transfers.push({ type: message.type, buffers: [...transfer] });
      messages.push(structuredClone(message, { transfer: [...transfer] }));
    },
  });
  context.self = context;
  new Script((vendor ? vendorSource : '') + '\n' + workerSource, {
    filename: 'comic-worker-bundle.js',
  }).runInContext(context, { timeout: 1000 });
  return {
    context,
    messages,
    transfers,
    get yields() { return yields; },
    dispatch(message) { return context.onmessage({ data: message }); },
    open(data = new ArrayBuffer(1), wasmBinary = arrayBuffer(wasmBytes)) {
      return this.dispatch({ data, wasmBinary });
    },
  };
}

function entry(name, flags = {}, extraction = Uint8Array.of(1, 2, 3)) {
  return { fileHeader: { name, flags: { directory: false, encrypted: false, ...flags } }, extraction };
}

function decoderError(reason, message = 'Decoder failure') {
  return Object.assign(new Error(message), { reason });
}

/** Model the vendor's retained files, fd mismatch, and cleanup after (not finally around) loops. */
function mockDecoder(entries, { arcFlags = {}, createError, listError, extractError, extractionEntries = entries } = {}) {
  const state = {
    createCalls: 0,
    listCalls: 0,
    extractCalls: 0,
    closeCalls: 0,
    listVisited: [],
    extractVisited: [],
    selected: [],
    listExhausted: false,
    extractExhausted: false,
    peakOutputs: 0,
  };
  let currentFd = 2;
  const extractor = {
    _archive: null,
    dataFiles: { [ARCHIVE_PATH]: { fd: 1 } },
    dataFileMap: { 1: ARCHIVE_PATH },
    getExtractedFileName(name) { return '*Extracted*/' + name; },
    closeArc() {
      assert.ok(this._archive, 'An archive must never be deleted twice.');
      state.closeCalls++;
      this._archive = null;
    },
    fail(error) {
      this.closeArc();
      throw error;
    },
    getFileList() {
      state.listCalls++;
      this._archive = {};
      return {
        arcHeader: { flags: arcFlags },
        fileHeaders: (function* () {
          for (const file of entries) {
            state.listVisited.push(file.fileHeader.name);
            yield file.fileHeader;
          }
          if (listError) extractor.fail(listError);
          state.listExhausted = true;
          extractor.closeArc();
        })(),
      };
    },
    extract(options) {
      state.extractCalls++;
      assert.equal(state.extractCalls, 1, 'Extraction is strictly single-pass.');
      assert.equal(state.listExhausted, true, 'Listing must finish before extraction opens an archive.');
      assert.equal(typeof options.files, 'function', 'A predicate avoids the vendor filename-array early exit.');
      this._archive = {};
      if (extractError) this.fail(extractError);
      return {
        arcHeader: { flags: arcFlags },
        files: (function* () {
          for (const file of extractionEntries) {
            state.extractVisited.push(file.fileHeader.name);
            if (file.error) extractor.fail(file.error);
            if (!options.files(file.fileHeader)) continue;
            state.selected.push(file.fileHeader.name);
            const path = extractor.getExtractedFileName(file.fileHeader.name);
            const fd = currentFd++;
            extractor.dataFiles[path] = { fd: currentFd++, file: { readAll: () => file.extraction } };
            extractor.dataFileMap[fd] = path;
            state.peakOutputs = Math.max(state.peakOutputs, Object.keys(extractor.dataFiles).length - 1);
            yield file;
          }
          state.extractExhausted = true;
          extractor.closeArc();
        })(),
      };
    },
  };
  return {
    state,
    extractor,
    api: {
      async createExtractorFromData(options) {
        state.createCalls++;
        state.options = options;
        if (createError) throw createError;
        return extractor;
      },
    },
  };
}

function assertFailure(subject, pattern) {
  const errors = subject.messages.filter(message => message.type === 'error');
  assert.equal(errors.length, 1);
  assert.deepEqual(Object.keys(errors[0]).sort(), ['message', 'type']);
  assert.match(errors[0].message, pattern);
  assert.equal(subject.messages.at(-1), errors[0], 'Error must be terminal.');
  assert.equal(subject.messages.some(message => message.type === 'done'), false);
}

function assertDisposed(extractor) {
  assert.equal(extractor._archive, null);
  assert.deepEqual(Object.keys(extractor.dataFiles), []);
  assert.deepEqual(Object.keys(extractor.dataFileMap), []);
}

test('exact protocol, archive order, image predicate, complete listing and single extraction pass', async () => {
  const names = ['book/page10.JPG', 'book/page2.jpeg', '3.png', '4.GIF', '5.webp', '6.avif', 'book\\7.bmp'];
  const entries = [
    entry('notes.txt'),
    ...names.map(name => entry(name)),
    entry('directory.jpg', { directory: true }),
    entry('__MACOSX/book/cover.jpg'),
    entry('book/__MACOSX/cover.png'),
    entry('book\\__MACOSX\\cover.png'),
    entry('._cover.jpg'),
    entry('book/._cover.png'),
    entry('book\\._cover.png'),
    entry('._book/cover.jpg'),
    entry('book/.hidden.jpg'),
    entry('book\\.hidden.jpg'),
    entry('image.svg'),
    entry('image.tiff'),
    entry('image.jpg.txt'),
    entry('trailing-notes.txt'),
  ];
  const mock = mockDecoder(entries, { arcFlags: { solid: true } });
  const subject = worker({
    decoder: mock.api,
    beforePost(message, transfer) {
      if (message.type === 'entries') {
        assert.equal(mock.state.listExhausted, true);
        assert.equal(mock.state.extractCalls, 0);
        assert.equal(mock.extractor._archive, null);
      }
      if (message.type === 'page') {
        assert.equal(transfer.length, 1);
        assert.equal(transfer[0], message.data);
        assert.ok(message.data instanceof ArrayBuffer);
        assert.equal(mock.state.selected.length, subject.messages.filter(item => item.type === 'page').length + 1,
          'Transfer each page before requesting the next one, never spread the extraction iterator.');
      }
      if (message.type === 'progress') {
        assert.deepEqual(Object.keys(mock.extractor.dataFiles), [ARCHIVE_PATH], 'Release output before reporting preparation.');
        assert.deepEqual(Object.keys(mock.extractor.dataFileMap), ['1']);
      }
      if (message.type === 'done') {
        assert.equal(mock.state.extractExhausted, true);
        assertDisposed(mock.extractor);
      }
    },
  });
  const data = new ArrayBuffer(12);
  const wasmBinary = new ArrayBuffer(24);
  await subject.dispatch(structuredClone({ data, wasmBinary }, { transfer: [data, wasmBinary] }));

  assert.equal(data.byteLength, 0, 'The host can transfer the archive.');
  assert.equal(wasmBinary.byteLength, 0, 'The host can transfer WASM.');
  assert.equal(mock.state.options.data.byteLength, 12);
  assert.equal(mock.state.options.wasmBinary.byteLength, 24);
  assert.equal(mock.state.createCalls, 1);
  assert.equal(mock.state.listCalls, 1);
  assert.equal(mock.state.extractCalls, 1);
  assert.equal(mock.state.closeCalls, 2);
  assert.deepEqual(mock.state.listVisited, entries.map(file => file.fileHeader.name));
  assert.deepEqual(mock.state.extractVisited, mock.state.listVisited);
  assert.deepEqual(mock.state.selected, names);
  assert.equal(mock.state.peakOutputs, 1);
  assert.equal(subject.yields, names.length);
  assert.deepEqual(subject.messages, [
    { type: 'entries', names },
    { type: 'progress', completed: 0, total: names.length },
    ...names.flatMap((name, index) => [
      { type: 'page', name, data: arrayBuffer([1, 2, 3]) },
      { type: 'progress', completed: index + 1, total: names.length },
    ]),
    { type: 'done' },
  ]);
  for (const transfer of subject.transfers) {
    assert.equal(transfer.buffers.length, transfer.type === 'page' ? 1 : 0);
    if (transfer.type === 'page') assert.equal(transfer.buffers[0].byteLength, 0, 'The outgoing buffer was really transferred.');
  }
});

test('transfers independent, exact-sized ArrayBuffers without detaching WASM or decoder views', async () => {
  const memory = new WebAssembly.Memory({ initial: 1 });
  const heap = new Uint8Array(memory.buffer);
  heap.set([90, 10, 20, 30, 91], 16);
  const backing = Uint8Array.of(80, 40, 50, 81);
  const owned = Uint8Array.of(60, 70);
  const entries = [
    entry('wasm.png', {}, heap.subarray(17, 20)),
    entry('offset.png', {}, backing.subarray(1, 3)),
    entry('owned.png', {}, owned),
  ];
  const mock = mockDecoder(entries);
  const subject = worker({
    decoder: mock.api,
    beforePost(message, transfer) {
      if (message.type !== 'page') return;
      const original = entries.find(file => file.fileHeader.name === message.name).extraction;
      assert.notEqual(transfer[0], original.buffer);
      assert.notEqual(transfer[0], memory.buffer);
      assert.equal(message.data.byteLength, original.byteLength);
    },
  });
  await subject.open();
  assert.equal(subject.messages.at(-1).type, 'done');
  assert.deepEqual(subject.messages.filter(message => message.type === 'page').map(message => [...new Uint8Array(message.data)]), [
    [10, 20, 30], [40, 50], [60, 70],
  ]);
  assert.equal(memory.buffer.byteLength, 65536);
  assert.deepEqual([...heap.subarray(16, 21)], [90, 10, 20, 30, 91]);
  assert.deepEqual([...backing], [80, 40, 50, 81]);
  assert.deepEqual([...owned], [60, 70]);
  heap.fill(0);
  backing.fill(0);
  owned.fill(0);
  assert.deepEqual([...new Uint8Array(subject.messages.find(message => message.type === 'page').data)], [10, 20, 30]);
  assertDisposed(mock.extractor);
});

test('many pages are transferred incrementally with at most one cached output and fd', async () => {
  const entries = Array.from({ length: 80 }, (_, index) => entry(index + '.png'));
  const mock = mockDecoder(entries);
  let delivered = 0;
  let resumedPageReady = false;
  const subject = worker({
    decoder: mock.api,
    beforePost(message) {
      if (message.type === 'page') {
        assert.equal(mock.state.selected.length, ++delivered, 'No eager extraction or batching.');
        assert.equal(mock.state.extractExhausted, false);
        assert.equal(Object.keys(mock.extractor.dataFiles).length, 2, 'Only input archive and current output.');
        assert.equal(Object.keys(mock.extractor.dataFileMap).length, 2);
        if (message.name === '23.png') resumedPageReady = true;
        if (delivered > 24) assert.equal(resumedPageReady, true);
      }
    },
  });
  await subject.open();
  assert.equal(subject.messages.at(-1).type, 'done');
  assert.equal(delivered, entries.length);
  assert.equal(subject.yields, entries.length);
  assert.equal(mock.state.peakOutputs, 1);
  assertDisposed(mock.extractor);
});

test('duplicate image names and empty/non-image-only comics fail after listing, before extraction', async t => {
  for (const [name, entries, pattern] of [
    ['duplicate', [entry('page.png'), entry('page.png'), entry('tail.txt')], /duplicate image names/i],
    ['empty', [], /no supported images/i],
    ['no images', [entry('notes.txt'), entry('folder.png', { directory: true })], /no supported images/i],
  ]) {
    await t.test(name, async () => {
      const mock = mockDecoder(entries);
      const subject = worker({ decoder: mock.api });
      await subject.open();
      assertFailure(subject, pattern);
      assert.equal(subject.messages.length, 1);
      assert.equal(mock.state.listExhausted, true);
      assert.equal(mock.state.extractCalls, 0);
      assertDisposed(mock.extractor);
    });
  }
});

test('one untagged request per worker, including during initialization and after completion', async () => {
  const mock = mockDecoder([entry('page.png')]);
  const subject = worker({ decoder: mock.api });
  const opening = subject.open();
  await subject.open();
  await opening;
  await subject.open();
  assert.equal(mock.state.createCalls, 1);
  assert.equal(mock.state.extractCalls, 1);
  assert.equal(subject.messages.filter(message => message.type === 'done').length, 1);
});

test('invalid/missing binary inputs, zero bytes and missing decoder fail without loading resources', async t => {
  for (const [message, pattern] of [
    [null, /ArrayBuffers/],
    [{}, /ArrayBuffers/],
    [{ data: new Uint8Array(1), wasmBinary: new ArrayBuffer(1) }, /ArrayBuffers/],
    [{ data: new ArrayBuffer(1), wasmBinary: new Uint8Array(1) }, /ArrayBuffers/],
    [{ data: new ArrayBuffer(0), wasmBinary: new ArrayBuffer(1) }, /file is empty/i],
    [{ data: new ArrayBuffer(1), wasmBinary: new ArrayBuffer(0) }, /decoder failed to load/i],
  ]) {
    await t.test(String(pattern), async () => {
      const mock = mockDecoder([]);
      const subject = worker({ decoder: mock.api });
      await subject.dispatch(message);
      assertFailure(subject, pattern);
      assert.equal(mock.state.createCalls, 0);
      await subject.open();
      assert.equal(subject.messages.length, 1, 'A failed worker is still one-shot.');
    });
  }
  for (const decoder of [undefined, {}]) {
    const subject = worker({ decoder });
    await subject.open();
    assertFailure(subject, /decoder failed to load/i);
  }
});

test('encryption (including non-images) and multipart flags reject before entries/extraction', async t => {
  for (const [arcFlags, flags, listError, pattern] of [
    [{ headerEncrypted: true }, {}, undefined, /encrypted|password/i],
    [{}, { encrypted: true }, undefined, /encrypted|password/i],
    [{ volume: true }, {}, undefined, /multi-part.*single-volume/i],
    [{ volume: true }, {}, decoderError('ERAR_EREAD'), /multi-part/i],
    [{ headerEncrypted: true }, {}, decoderError('ERAR_BAD_DATA'), /encrypted/i],
  ]) {
    await t.test(String(pattern), async () => {
      const mock = mockDecoder([entry('page.png'), entry('tail.txt', flags)], { arcFlags, listError });
      const subject = worker({ decoder: mock.api });
      await subject.open();
      assertFailure(subject, pattern);
      assert.equal(subject.messages.length, 1);
      assert.equal(mock.state.listExhausted, !listError);
      assert.deepEqual(mock.state.listVisited, ['page.png', 'tail.txt']);
      assert.equal(mock.state.extractCalls, 0);
      assertDisposed(mock.extractor);
    });
  }
});

test('vendor reason codes and recognizable failures map to actionable errors', async t => {
  for (const [reason, message, pattern] of [
    ['ERAR_MISSING_PASSWORD', 'Decoder failure', /password|encrypted/i],
    ['ERAR_BAD_PASSWORD', 'Decoder failure', /password|encrypted/i],
    ['ERAR_BAD_ARCHIVE', 'Decoder failure', /not a valid CBR\/RAR/i],
    ['ERAR_UNKNOWN_FORMAT', 'Decoder failure', /unsupported.*CBZ/i],
    ['ERAR_BAD_DATA', 'Decoder failure', /corrupt or incomplete/i],
    ['ERAR_EREAD', 'Decoder failure', /corrupt or incomplete/i],
    ['ERAR_EREFERENCE', 'Decoder failure', /missing or unsupported.*reference/i],
    ['ERAR_EOPEN', 'Decoder failure', /could not be opened.*another volume/i],
    ['ERAR_NO_MEMORY', 'Decoder failure', /not enough memory/i],
    ['ERAR_UNKNOWN', 'Password required', /password|encrypted/i],
    ['ERAR_UNKNOWN', 'Missing volume part02.rar', /multi-part/i],
    ['ERAR_UNKNOWN', 'Unexpected decoder problem', /Unexpected decoder problem/],
  ]) {
    await t.test(reason + ': ' + message, async () => {
      const mock = mockDecoder([], { createError: decoderError(reason, message) });
      const subject = worker({ decoder: mock.api });
      await subject.open();
      assertFailure(subject, pattern);
      assert.equal(subject.messages.length, 1);
      assert.equal(mock.state.extractCalls, 0);
    });
  }
  for (const error of ['A decoder string failure', null]) {
    const subject = worker({ decoder: { async createExtractorFromData() { throw error; } } });
    await subject.open();
    assertFailure(subject, error ? /A decoder string failure/ : /Could not open this comic\./);
  }
});

test('listing corruption never publishes partial entries or starts extraction', async () => {
  const mock = mockDecoder([entry('page.png')], { listError: decoderError('ERAR_BAD_DATA') });
  const subject = worker({ decoder: mock.api });
  await subject.open();
  assertFailure(subject, /corrupt/i);
  assert.equal(subject.messages.length, 1);
  assert.equal(mock.state.extractCalls, 0);
  assert.equal(mock.state.closeCalls, 1);
  assertDisposed(mock.extractor);
});

test('opening extraction can fail after entries without done or double cleanup', async () => {
  const mock = mockDecoder([entry('page.png')], { extractError: decoderError('ERAR_BAD_PASSWORD') });
  const subject = worker({ decoder: mock.api });
  await subject.open();
  assertFailure(subject, /password/i);
  assert.deepEqual(subject.messages.map(message => message.type), ['entries', 'progress', 'error']);
  assert.equal(mock.state.extractCalls, 1);
  assert.equal(mock.state.closeCalls, 2);
  assertDisposed(mock.extractor);
});

test('trailing non-image header corruption is not masked by reaching total progress', async () => {
  const mock = mockDecoder([
    entry('page.png'),
    { ...entry('tail.txt'), error: decoderError('ERAR_BAD_DATA') },
  ]);
  const subject = worker({ decoder: mock.api });
  await subject.open();
  assertFailure(subject, /corrupt/i);
  assert.deepEqual(subject.messages.map(message => message.type), ['entries', 'progress', 'page', 'progress', 'error']);
  assert.deepEqual(subject.messages.at(-2), { type: 'progress', completed: 1, total: 1 });
  assert.deepEqual(mock.state.extractVisited, ['page.png', 'tail.txt']);
  assert.equal(mock.state.extractCalls, 1);
  assertDisposed(mock.extractor);
});

test('missing, reordered, extra, zero-byte and truncated outputs cannot silently complete', async t => {
  const truncated = entry('page.png');
  truncated.fileHeader.unpSize = 100;
  for (const [name, extractionEntries, pattern] of [
    ['missing page', [], /corrupt/i],
    ['different name', [entry('other.png')], /corrupt/i],
    ['extra page', [entry('page.png'), entry('extra.png')], /corrupt/i],
    ['missing bytes', [entry('page.png', {}, null)], /could not be extracted/i],
    ['skipped bytes', [entry('page.png', {}, 'skipped')], /could not be extracted/i],
    ['empty image', [entry('page.png', {}, new Uint8Array())], /empty/i],
    ['short image', [truncated], /corrupt/i],
    ['late encryption', [entry('page.png', { encrypted: true })], /encrypted/i],
  ]) {
    await t.test(name, async () => {
      const mock = mockDecoder([entry('page.png')], { extractionEntries });
      const subject = worker({ decoder: mock.api });
      await subject.open();
      assertFailure(subject, pattern);
      assertDisposed(mock.extractor);
    });
  }
});

test('delivery failures close directly, release output and do not decompress remaining pages', async () => {
  const mock = mockDecoder([entry('page1.png'), entry('page2.png'), entry('tail.txt')]);
  const subject = worker({
    decoder: mock.api,
    beforePost(message) {
      if (message.type === 'page') throw new Error('Transfer failed');
      if (message.type === 'error') assertDisposed(mock.extractor);
    },
  });
  await subject.open();
  assertFailure(subject, /Transfer failed/);
  assert.equal(mock.state.extractExhausted, false, 'Do not waste decompression after a delivery failure.');
  assert.deepEqual(mock.state.extractVisited, ['page1.png']);
  assert.equal(mock.state.closeCalls, 2);
  assert.deepEqual(subject.messages.map(message => message.type), ['entries', 'progress', 'error']);
});

test('unsupported file-reference failure after a delivered page is terminal and releases all resources', async () => {
  const mock = mockDecoder([
    entry('page1.png'),
    { ...entry('page2.png'), error: decoderError('ERAR_EREFERENCE') },
  ]);
  const subject = worker({ decoder: mock.api });
  await subject.open();
  assertFailure(subject, /unsupported.*reference.*CBZ/i);
  assert.equal(subject.messages.filter(message => message.type === 'page').length, 1);
  assertDisposed(mock.extractor);
});

/** RAR4 stores the low 16 bits of CRC32 for block headers and full CRC32 for files. */
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function rarBlock(type, flags, payload = Buffer.alloc(0)) {
  const block = Buffer.alloc(7 + payload.length);
  block[2] = type;
  block.writeUInt16LE(flags, 3);
  block.writeUInt16LE(block.length, 5);
  payload.copy(block, 7);
  block.writeUInt16LE(crc32(block.subarray(2)) & 0xffff, 0);
  return block;
}

/** Minimal uncompressed RAR4 fixture; payloads are transported, not image-decoded. */
function storedRar(files, { volume = false } = {}) {
  const blocks = [Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00]), rarBlock(0x73, volume ? 1 : 0, Buffer.alloc(6))];
  for (const { name, data = Buffer.alloc(0), directory = false, corrupt = false, encrypted = false } of files) {
    const filename = Buffer.from(name);
    const payload = Buffer.alloc(25 + filename.length);
    payload.writeUInt32LE(data.length, 0);
    payload.writeUInt32LE(data.length, 4);
    payload[8] = 2;
    payload.writeUInt32LE((crc32(data) ^ (corrupt ? 1 : 0)) >>> 0, 9);
    payload[17] = 20;
    payload[18] = 0x30;
    payload.writeUInt16LE(filename.length, 19);
    payload.writeUInt32LE(directory ? 0x10 : 0x20, 21);
    filename.copy(payload, 25);
    blocks.push(rarBlock(0x74, 0x8000 | (directory ? 0xe0 : 0) | (encrypted ? 4 : 0), payload), data);
  }
  blocks.push(rarBlock(0x7b, 0));
  return arrayBuffer(Buffer.concat(blocks));
}

function observeRealDecoder(subject, onCreate) {
  const api = subject.context.UnrarJS;
  subject.context.UnrarJS = {
    async createExtractorFromData(options) {
      const extractor = await api.createExtractorFromData(options);
      onCreate(extractor);
      return extractor;
    },
  };
}

test('actual JS + WASM: stored RAR, multi-chunk output, progressive transfers and bounded file store', { timeout: 10000 }, async () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC1lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
  const large = Buffer.alloc(400000, 0x5a);
  const expected = new Map([['page10.png', png], ['page2.png', large]]);
  let extractor;
  let extractCalls = 0;
  let selected = 0;
  let delivered = 0;
  const subject = worker({
    vendor: true,
    beforePost(message, transfer) {
      if (message.type === 'entries') assert.equal(extractor._archive, null);
      if (message.type === 'page') {
        assert.equal(selected, ++delivered, 'Real decoder must not prepare the next page before transfer.');
        const path = extractor.getExtractedFileName(message.name);
        const retained = extractor.dataFiles[path].file.readAll();
        assert.notEqual(retained.buffer, extractor.unrar.HEAPU8.buffer);
        assert.notEqual(transfer[0], retained.buffer);
        assert.deepEqual(Buffer.from(retained), expected.get(message.name));
        assert.deepEqual(Object.keys(extractor.dataFiles).sort(), [ARCHIVE_PATH, path].sort());
        assert.equal(Object.keys(extractor.dataFileMap).length, 2);
      }
      if (message.type === 'progress') {
        assert.deepEqual(Object.keys(extractor.dataFiles), [ARCHIVE_PATH]);
        assert.deepEqual(Object.keys(extractor.dataFileMap), ['1']);
      }
      if (message.type === 'done') assertDisposed(extractor);
    },
  });
  observeRealDecoder(subject, instance => {
    extractor = instance;
    const extract = extractor.extract.bind(extractor);
    extractor.extract = options => {
      extractCalls++;
      assert.equal(typeof options.files, 'function');
      return extract({ files: header => {
        const include = options.files(header);
        if (include) selected++;
        return include;
      } });
    };
  });
  const archive = storedRar([
    { name: 'notes.txt', data: Buffer.from('before images') },
    { name: 'page10.png', data: png },
    { name: 'folder.png', directory: true },
    { name: '__MACOSX/._page10.png', data: png },
    { name: '._page2.png', data: png },
    { name: 'page2.png', data: large },
    { name: 'tail.txt', data: Buffer.from('after images') },
  ]);
  await subject.open(archive);
  assert.deepEqual(subject.messages[0], { type: 'entries', names: [...expected.keys()] });
  assert.equal(subject.messages.at(-1).type, 'done', JSON.stringify(subject.messages.at(-1)));
  assert.equal(extractCalls, 1);
  const pages = subject.messages.filter(message => message.type === 'page');
  assert.equal(pages.length, 2);
  for (const page of pages) assert.deepEqual(Buffer.from(page.data), expected.get(page.name));
  assertDisposed(extractor);
  assert.ok(extractor.unrar.HEAPU8.byteLength > 0, 'WASM memory remains valid until the host terminates the worker.');
});

test('actual decoder rejects empty, invalid, corrupt, duplicate, encrypted and volume fixtures', { timeout: 10000 }, async t => {
  for (const [name, archive, pattern] of [
    ['empty', storedRar([]), /no supported images/i],
    ['non-images only', storedRar([{ name: 'notes.txt' }]), /no supported images/i],
    ['invalid', arrayBuffer(Buffer.from('not a RAR archive')), /not a valid|corrupt|unsupported/i],
    ['bad CRC', storedRar([{ name: 'page.png', data: Buffer.from('bad CRC'), corrupt: true }]), /corrupt/i],
    ['duplicate names', storedRar([{ name: 'page.png' }, { name: 'page.png' }]), /duplicate image names/i],
    ['empty image', storedRar([{ name: 'page.png' }]), /empty/i],
    ['encrypted flag', storedRar([{ name: 'page.png', data: Buffer.alloc(16), encrypted: true }]), /password|encrypted/i],
    ['volume flag', storedRar([{ name: 'page.png', data: Buffer.from('page') }], { volume: true }), /multi-part/i],
  ]) {
    await t.test(name, async () => {
      const subject = worker({ vendor: true });
      let extractor;
      observeRealDecoder(subject, instance => { extractor = instance; });
      await subject.open(archive);
      assertFailure(subject, pattern);
      assertDisposed(extractor);
    });
  }
});

test('actual decoder releases partially delivered output on a later CRC failure', { timeout: 10000 }, async () => {
  const subject = worker({ vendor: true });
  let extractor;
  observeRealDecoder(subject, instance => { extractor = instance; });
  await subject.open(storedRar([
    { name: 'page1.png', data: Buffer.from('first page') },
    { name: 'page2.png', data: Buffer.from('bad second page'), corrupt: true },
    { name: 'page3.png', data: Buffer.from('never delivered') },
  ]));
  assertFailure(subject, /corrupt/i);
  assert.deepEqual(subject.messages.filter(message => message.type === 'page').map(message => message.name), ['page1.png']);
  assert.deepEqual(subject.messages.filter(message => message.type === 'progress'), [
    { type: 'progress', completed: 0, total: 3 },
    { type: 'progress', completed: 1, total: 3 },
  ]);
  assertDisposed(extractor);
});
