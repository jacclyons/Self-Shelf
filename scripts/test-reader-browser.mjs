/**
 * Real-engine smoke tests with Chrome, no added dependencies.
 * Run: node scripts/test-reader-browser.mjs [path-to-Chrome]
 * Uses an ephemeral local HTTP server and temporary Chrome profile; both are
 * torn down on success or failure. Does not exercise WKWebView or solid RAR.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const JSZip = require('../assets/reader/jszip.jstxt');
const chromePath = process.argv[2] || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const zip = new JSZip();
for (let i = 12; i >= 1; i--) zip.file(`page${i}.png`, png);
zip.file('__MACOSX/._page.png', png);
zip.file('notes.txt', 'Not a comic page');
const cbz = await zip.generateAsync({ type: 'nodebuffer' });
const badZip = new JSZip();
badZip.file('page1.png', 'not an image');
badZip.file('page2.png', png);
const badImageCbz = await badZip.generateAsync({ type: 'nodebuffer' });
const epubZip = new JSZip();
epubZip.file('mimetype', 'application/epub+zip');
epubZip.file('META-INF/container.xml', '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
const epubChapters = [1, 2, 3, 4, 5];
epubZip.file('book.opf', `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">test</dc:identifier><dc:title>Reader test</dc:title><dc:language>en</dc:language></metadata><manifest>${epubChapters.map(n => `<item id="chapter-${n}" href="chapter-${n}.xhtml" media-type="application/xhtml+xml"/>`).join('')}<item id="css" href="publisher.css" media-type="text/css"/><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/></manifest><spine>${epubChapters.map(n => `<itemref idref="chapter-${n}"/>`).join('')}</spine></package>`);
epubZip.file('publisher.css', `
  body { font: 400 16px/1.4 "Times New Roman", serif; }
  h1 { font: bold 28px/1.2 "Palatino Linotype", serif; }
  h1 span { font-family: "Trebuchet MS", sans-serif; }
  h2 { font: italic 600 24px/1.3 Verdana, sans-serif; }
  blockquote { font: bold 18px/1.5 "Book Antiqua", serif; }
  blockquote p { font-family: "Courier New", monospace; }
  strong { font-family: Arial, sans-serif; }
  em { font-family: "Trebuchet MS", sans-serif; }
  p.prose { font-family: Verdana, sans-serif; font-size: 17px; }
  p.shorthand { font: italic 600 19px/1.6 "Trebuchet MS", sans-serif; }
  body p.important { font-family: "Courier New", monospace !important; font-weight: 700; font-size: 18px; }
  body p.important-shorthand { font: italic 700 20px/1.3 "Palatino Linotype", serif !important; }
`);
// Long chapters and intervening spine items keep the navigation cases out of
// the continuous manager's initial iframe buffer, so they exercise content hooks.
for (const n of epubChapters) {
  epubZip.file(`chapter-${n}.xhtml`, `<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter ${n}</title><link rel="stylesheet" type="text/css" href="publisher.css"/></head>
    <body data-chapter="${n}" style='font-family: "Times New Roman", serif;'>
      <h1 id="heading">Chapter ${n}: <span id="heading-span">A publisher's title</span></h1>
      <h2 id="subheading">A <span id="subheading-span" style='font-family: "Courier New", monospace !important;'>nested subtitle</span></h2>
      <blockquote id="quotation"><p id="quotation-text">A bold quotation with <strong id="quotation-strong">strong words</strong> and <em id="quotation-emphasis">italic emphasis</em>.</p></blockquote>
      <p id="paragraph" class="prose">The opening paragraph has its own family and <em id="paragraph-emphasis">a change of voice</em>.</p>
      <p id="shorthand" class="shorthand">A publisher's italic paragraph styled with a font shorthand.</p>
      <p id="important" class="important">A family declared important in the publisher stylesheet.</p>
      <p id="important-shorthand" class="important-shorthand">An important stylesheet font shorthand.</p>
      <p id="inline-family" style="font-family: Arial, sans-serif; font-weight: 600; font-size: 18px;">An inline font family.</p>
      <p id="inline-shorthand" style="font: italic 700 21px/1.4 Verdana, sans-serif;">An inline font shorthand.</p>
      <p id="inline-important" style='font-family: "Courier New", monospace !important; font-style: italic; font-weight: 700; font-size: 19px;'>An important inline family.</p>
      <p id="inline-important-shorthand" style='font: italic 700 22px/1.5 "Times New Roman", serif !important;'>An important inline font shorthand.</p>
      <p id="passage" class="prose">${'The reader followed the quiet path through the library, pausing at each shelf to discover another story. '.repeat(40)}</p>
    </body></html>`);
}
epubZip.file('nav.xhtml', `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc"><ol>${epubChapters.map(n => `<li><a href="chapter-${n}.xhtml">Chapter ${n}</a></li>`).join('')}</ol></nav></body></html>`);
const epub = await epubZip.generateAsync({ type: 'nodebuffer' });
const pdfObjects = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 300] /Contents 4 0 R /Resources << >> >>',
  '<< /Length 23 >>\nstream\n0 0 100 100 re 0.5 g f\n\nendstream',
];
let pdfSource = '%PDF-1.4\n';
const offsets = [0];
for (let i = 0; i < pdfObjects.length; i++) {
  offsets.push(Buffer.byteLength(pdfSource));
  pdfSource += `${i + 1} 0 obj\n${pdfObjects[i]}\nendobj\n`;
}
const xref = Buffer.byteLength(pdfSource);
pdfSource += `xref\n0 5\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n `).join('\n')}\ntrailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
const pdf = Buffer.from(pdfSource);

/** Stored RAR4 fixture with real CRCs; the decoder tests cover malformed headers. */
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function block(type, flags, payload) {
  const b = Buffer.alloc(7 + payload.length);
  b[2] = type;
  b.writeUInt16LE(flags, 3);
  b.writeUInt16LE(b.length, 5);
  payload.copy(b, 7);
  b.writeUInt16LE(crc32(b.subarray(2)) & 0xffff);
  return b;
}
const rarBlocks = [Buffer.from('526172211a0700', 'hex'), block(0x73, 0, Buffer.alloc(6))];
for (let i = 1; i <= 80; i++) {
  const name = Buffer.from(`page${i}.png`);
  const payload = Buffer.alloc(25 + name.length);
  payload.writeUInt32LE(png.length, 0);
  payload.writeUInt32LE(png.length, 4);
  payload[8] = 2;
  payload.writeUInt32LE(crc32(png), 9);
  payload[17] = 20;
  payload[18] = 0x30;
  payload.writeUInt16LE(name.length, 19);
  payload.writeUInt32LE(0x20, 21);
  name.copy(payload, 25);
  rarBlocks.push(block(0x74, 0x8000, payload), png);
}
rarBlocks.push(block(0x7b, 0, Buffer.alloc(0)));
const cbr = Buffer.concat(rarBlocks);
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/comic.cbz' || url.pathname === '/chunked.cbz') {
    res.setHeader('Content-Type', 'application/zip');
    if (url.pathname === '/comic.cbz') res.setHeader('Content-Length', cbz.length);
    res.write(cbz.subarray(0, 30));
    setTimeout(() => res.end(cbz.subarray(30)), 180);
    return;
  }
  if (url.pathname === '/book.epub') { res.end(epub); return; }
  if (url.pathname === '/book.pdf') { res.end(pdf); return; }
  if (url.pathname === '/comic.cbr') { res.end(cbr); return; }
  if (url.pathname === '/bad-image.cbz') { res.end(badImageCbz); return; }
  const assetName = url.pathname.slice('/reader/'.length);
  if (!url.pathname.startsWith('/reader/') || !/^[a-z.-]+$/.test(assetName)) {
    res.writeHead(404).end();
    return;
  }
  const name = assetName.endsWith('.js') ? assetName.replace(/\.js$/, '.jstxt') : assetName;
  try {
    const bytes = await readFile(path.join(root, 'assets/reader', name));
    res.setHeader('Content-Type', name.endsWith('.html') ? 'text/html' : name.endsWith('.wasm') ? 'application/wasm' : 'text/javascript');
    res.end(bytes);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
await mkdir(path.join(root, '.expo'), { recursive: true });
const profile = await mkdtemp(path.join(root, '.expo/reader-browser-'));
const chrome = spawn(chromePath, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
let socket;
const deadline = setTimeout(() => { console.error('Browser tests timed out.'); chrome.kill('SIGKILL'); }, 60_000);
try {
  const debuggerUrl = await new Promise((resolve, reject) => {
    chrome.on('error', reject);
    chrome.on('exit', code => reject(new Error(`Chrome exited (${code}) before connecting.`)));
    let text = '';
    chrome.stderr.on('data', chunk => {
      text += chunk;
      const match = text.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) resolve(match[1]);
    });
  });
  socket = new WebSocket(debuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  const pending = new Map();
  let nextId = 0;
  socket.onmessage = event => {
    const data = JSON.parse(event.data);
    if (!pending.has(data.id)) return;
    const { resolve, reject } = pending.get(data.id);
    pending.delete(data.id);
    if (data.error) reject(new Error(data.error.message));
    else resolve(data.result);
  };
  socket.onclose = () => {
    for (const { reject } of pending.values()) reject(new Error('Chrome disconnected.'));
    pending.clear();
  };
  function send(method, params = {}, sessionId) {
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const call = (method, params) => send(method, params, sessionId);
  async function evaluate(expression) {
    const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }
  async function until(expression) {
    for (let i = 0; i < 300; i++) {
      if (await evaluate(expression)) return;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error(`Condition did not complete: ${expression}`);
  }
  await call('Page.enable');
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.events = [];
    window.stats = { workers: 0, terminated: 0, loadedImage: false };
    window.ReactNativeWebView = { postMessage: function (raw) {
      const event = JSON.parse(raw);
      events.push(event);
      if (event.type === 'loaded') {
        stats.loadedImage = [...document.querySelectorAll('.page img')].some(img => img.complete && img.naturalWidth > 0 && img.style.display !== 'none');
      }
    }};
    const RealWorker = window.Worker;
    window.Worker = class extends RealWorker {
      constructor(...args) { super(...args); stats.workers++; }
      terminate() { stats.terminated++; super.terminate(); }
    };
  ` });
  async function open(file, location = '1', kind = 'comic', settings = {}) {
    await call('Page.navigate', { url: `${base}/reader/reader.html` });
    await until(`window.events?.some(event => event.type === 'ready')`);
    const opts = { kind, url: `${base}/${file}`, location, settings: { flow: 'paged', rtl: false, ...settings }, theme: {}, managedLoading: true };
    await evaluate(`window.JS.load(${JSON.stringify(opts)})`);
  }

  await open('comic.cbz', '3');
  assert.equal(await evaluate('stats.loadedImage'), true, 'loaded waits for image pixels');
  assert.equal(await evaluate(`events.find(event => event.type === 'loaded').pageCount`), 12);
  assert.equal(await evaluate(`events.filter(event => event.type === 'location').at(-1).page`), 3);
  assert.equal(await evaluate(`events.some(event => event.type === 'loading' && event.stage === 'download' && event.fraction > 0)`), true);
  await evaluate(`window.visiblePage = document.querySelectorAll('.page')[2]; window.visibleUrl = visiblePage.querySelector('img').src; window.JS.setSettings({ rtl: true });`);
  await until(`events.filter(event => event.type === 'location').at(-1).page === 10`);
  assert.equal(await evaluate(`document.querySelectorAll('.page')[9] === visiblePage && visiblePage.querySelector('img').src === visibleUrl`), true, 'RTL preserves the visible image and its URL');
  assert.equal(await evaluate(`events.filter(event => event.type === 'loaded').length`), 1, 'RTL does not reload');
  await evaluate(`for (let n = 1; n <= 12; n++) window.JS.goTo(String(n));`);
  await until(`document.querySelectorAll('.page')[11].dataset.loaded === '1'`);
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.ok(await evaluate(`document.querySelectorAll('.page img[src]').length`) <= 7, 'fast navigation bounds decoded images');
  console.log('PASS CBZ: visible-before-loaded, resume, progress, RTL and rapid navigation');

  await open('chunked.cbz');
  assert.equal(await evaluate(`events.some(event => event.type === 'loading' && event.stage === 'download' && event.bytes > 0 && event.fraction === undefined)`), true, 'unknown total reports bytes without a fake percentage');
  console.log('PASS unknown-length download progress');

  await open('comic.cbr', '20');
  assert.equal(await evaluate('stats.loadedImage'), true);
  assert.equal(await evaluate('stats.workers'), 1);
  assert.equal(await evaluate(`events.filter(event => event.type === 'location').at(-1).page`), 20);
  await until('stats.terminated === 1');
  assert.equal(await evaluate(`events.filter(event => event.type === 'error').length`), 0);
  assert.equal(await evaluate(`events.filter(event => event.type === 'loading' && event.stage === 'unpacking').at(-1).completed`), 80);
  await evaluate(`window.JS.setSettings({ rtl: true }); window.JS.goTo('79');`);
  await until(`document.querySelectorAll('.page')[78].dataset.loaded === '1'`);
  assert.equal(await evaluate('stats.workers'), 1, 'CBR revisits do not start another decoder');
  console.log('PASS CBR: real Worker/WASM, progressive resume, cleanup, RTL and revisits');

  await open('comic.cbr');
  await evaluate('window.JS.dispose()');
  assert.equal(await evaluate('stats.terminated'), 1, 'Close terminates active decoder');
  console.log('PASS decoder cancellation');

  await open('bad-image.cbz');
  assert.equal(await evaluate(`document.querySelector('.page-notice').textContent.includes('couldn’t be displayed')`), true);
  await evaluate(`window.JS.goTo('2')`);
  await until(`document.querySelectorAll('.page')[1].dataset.loaded === '1'`);
  console.log('PASS corrupt image has readable feedback and can be skipped');

  await open('book.epub', null, 'epub', { fontFamily: 'publisher', fontSize: 100, lineHeight: 1.5, margin: 24 });
  assert.equal(await evaluate(`events.some(event => event.type === 'loaded' && event.kind === 'epub')`), true);
  assert.equal(await evaluate(`events.some(event => event.type === 'error')`), false);
  console.log('PASS EPUB opening regression');

  const chapterDocument = chapter => `[...document.querySelectorAll('#epub iframe')].map(frame => frame.contentDocument).find(doc => doc?.body?.dataset.chapter === '${chapter}')`;
  async function chapterFonts(chapter) {
    await until(`!!(${chapterDocument(chapter)})`);
    return evaluate(`(() => {
      const doc = ${chapterDocument(chapter)};
      return [...doc.querySelectorAll('body, body *')].map(element => {
        const style = doc.defaultView.getComputedStyle(element);
        return { element: element.id || element.localName, family: style.fontFamily, weight: style.fontWeight, style: style.fontStyle, size: style.fontSize };
      });
    })()`);
  }
  async function setFont(fontFamily) {
    await evaluate(`window.JS.setSettings(${JSON.stringify({ fontFamily })})`);
    // Allow style changes and the reader's resize to finish before sampling.
    await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  }
  async function goToChapter(chapter) {
    await evaluate(`window.JS.goTo('chapter-${chapter}.xhtml')`);
    await until(`events.filter(event => event.type === 'location').at(-1)?.chapter === 'Chapter ${chapter}' && !!(${chapterDocument(chapter)})`);
  }

  const publisherFonts = await chapterFonts(1);
  const publisherByElement = Object.fromEntries(publisherFonts.map(font => [font.element, font]));
  // Verify the stylesheet and semantic emphasis really loaded before using
  // their computed values as the preservation/restoration baseline.
  assert.equal(publisherFonts.length, 19, 'the baseline includes the body and every text descendant');
  assert.deepEqual(publisherByElement.heading, { element: 'heading', family: '"Palatino Linotype", serif', weight: '700', style: 'normal', size: '28px' });
  assert.equal(publisherByElement['heading-span'].family, '"Trebuchet MS", sans-serif');
  assert.equal(publisherByElement['subheading-span'].style, 'italic');
  assert.equal(publisherByElement['quotation-text'].weight, '700');
  assert.equal(publisherByElement['quotation-emphasis'].style, 'italic');
  assert.equal(publisherByElement['paragraph-emphasis'].style, 'italic');
  assert.deepEqual(publisherByElement.shorthand, { element: 'shorthand', family: '"Trebuchet MS", sans-serif', weight: '600', style: 'italic', size: '19px' });
  assert.equal(publisherByElement.important.family, '"Courier New", monospace');
  assert.equal(publisherByElement['inline-important-shorthand'].size, '22px');

  async function assertChapterFont(chapter, family, message) {
    const expected = family === 'publisher' ? publisherFonts : publisherFonts.map(font => ({ ...font, family }));
    assert.deepEqual(await chapterFonts(chapter), expected, message);
  }
  const firstFont = 'Georgia, serif';
  const secondFont = 'Seravek, -apple-system, sans-serif';
  for (const family of [firstFont, secondFont, 'publisher', firstFont]) {
    await setFont(family);
    await assertChapterFont(1, family, `${family}: body and descendants change family without losing publisher weight, style or size`);
  }
  console.log('PASS EPUB fonts: nested headings, bold/italic text, CSS/inline families and shorthands, !important, two fonts and Publisher restoration');

  assert.equal(await evaluate(`!!(${chapterDocument(3)})`), false, 'the next font test chapter has not been rendered yet');
  await goToChapter(3);
  await assertChapterFont(3, firstFont, 'a newly rendered chapter honors the active font and publisher typography');
  await setFont(secondFont);
  await assertChapterFont(3, secondFont, 'a new chapter can switch to the second custom font');
  await setFont('publisher');
  await assertChapterFont(3, 'publisher', 'Publisher restores a chapter first rendered with a custom font');
  assert.equal(await evaluate(`!!(${chapterDocument(5)})`), false, 'the post-reset chapter has not been rendered yet');
  await goToChapter(5);
  await assertChapterFont(5, 'publisher', 'a newly rendered chapter after reset uses publisher fonts, not a stale override');
  await goToChapter(1);
  await assertChapterFont(1, 'publisher', 'revisiting the original chapter after reset keeps publisher fonts');
  assert.equal(await evaluate(`events.some(event => event.type === 'error')`), false);
  console.log('PASS EPUB fonts: active font in new chapters, Publisher reset, new chapters after reset and revisits');

  await open('book.pdf', '1', 'pdf');
  assert.equal(await evaluate(`events.some(event => event.type === 'loaded' && event.kind === 'pdf')`), true);
  assert.ok(await evaluate(`document.querySelector('canvas').width`) > 0);
  assert.equal(await evaluate(`events.some(event => event.type === 'error')`), false);
  console.log('PASS PDF opening regression');
} finally {
  clearTimeout(deadline);
  socket?.close();
  const exited = new Promise(resolve => chrome.once('exit', resolve));
  if (chrome.exitCode === null && chrome.signalCode === null) {
    chrome.kill('SIGTERM');
    await exited;
  }
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  await rm(profile, { recursive: true, force: true });
}
