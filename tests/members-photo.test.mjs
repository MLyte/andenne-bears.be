import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../scripts/membres-player.js', import.meta.url), 'utf8');
const compactSource = source.slice(source.indexOf('  async function compactPhoto('), source.indexOf('  function renderCaptcha('));

function browser({ encode = type => ({ type, size: 40000 }), bitmapFails = false, decodeFails = false, dataUrl = () => 'data:,' } = {}) {
  const calls = [];
  const canvases = [];
  let closed = false;
  let revoked = false;
  let decoded = false;
  const bitmap = { width: 3000, height: 4000, close() { closed = true; } };
  const context = {
    atob, Blob, Uint8Array,
    window: { createImageBitmap: true },
    createImageBitmap: async () => {
      if (bitmapFails) throw new Error('Bitmap decoder unavailable');
      return bitmap;
    },
    Image: class {
      naturalWidth = 3000;
      naturalHeight = 4000;
      async decode() {
        decoded = true;
        if (decodeFails) throw new Error('Invalid image');
      }
    },
    URL: { createObjectURL: () => 'blob:photo', revokeObjectURL() { revoked = true; } },
    document: { createElement() {
      const canvas = {
        toDataURL: dataUrl,
        getContext: () => ({ fillRect() {}, drawImage() {} }),
        toBlob(callback, type, quality) {
          calls.push({ type, quality, width: canvas.width, height: canvas.height });
          callback(encode(type, calls.length));
        },
      };
      canvases.push(canvas);
      return canvas;
    } },
  };
  vm.createContext(context);
  vm.runInContext(compactSource + '\nglobalThis.compact = compactPhoto;', context);
  return { compact: context.compact, calls, canvases, state: () => ({ closed, revoked, decoded }) };
}

test('WebP-capable browser retains compact WebP and releases bitmap/canvas', async () => {
  const b = browser();
  assert.equal((await b.compact({})).type, 'image/webp');
  assert.equal(b.calls[0].width, 384);
  assert.equal(b.calls[0].height, 512);
  assert.equal(b.state().closed, true);
  assert.equal(b.canvases[0].width, 0);
});

test('browser returning PNG for unsupported WebP falls back to JPEG', async () => {
  const b = browser({ encode: type => ({ type: type === 'image/webp' ? 'image/png' : type, size: type === 'image/webp' ? 300000 : 40000 }) });
  assert.equal((await b.compact({})).type, 'image/jpeg');
  assert.deepEqual(b.calls.map(call => call.type), ['image/webp', 'image/jpeg']);
});

test('null or throwing WebP encoder falls back to JPEG', async () => {
  for (const throws of [false, true]) {
    const b = browser({ encode: type => {
      if (type === 'image/webp') {
        if (throws) throw new Error('Unsupported encoder');
        return null;
      }
      return { type, size: 40000 };
    } });
    assert.equal((await b.compact({})).type, 'image/jpeg');
  }
});

test('failed bitmap decoding retries with Image and revokes the object URL', async () => {
  const b = browser({ bitmapFails: true });
  assert.equal((await b.compact({})).type, 'image/webp');
  assert.equal(b.state().decoded, true);
  assert.equal(b.state().revoked, true);
});

test('oversized encodings are reduced further and never returned above the limit', async () => {
  const b = browser({ encode: (type, count) => ({ type, size: count < 7 ? 300000 : 100000 }) });
  const result = await b.compact({});
  assert.ok(result.size <= 250 * 1024);
  assert.equal(b.calls.at(-1).height, 384);
});

test('uncompressible or unreadable photos fail and release resources', async () => {
  const b = browser({ encode: type => ({ type, size: 300000 }) });
  await assert.rejects(b.compact({}), /Impossible de réduire/);
  assert.equal(b.state().closed, true);
  assert.ok(b.canvases.every(canvas => canvas.width === 0));
  const unreadable = browser({ bitmapFails: true, decodeFails: true });
  await assert.rejects(unreadable.compact({}), /Invalid image/);
  assert.equal(unreadable.state().revoked, true);
});


test('PNG fallback from an unsupported requested encoder is accepted with its real MIME', async () => {
  const b = browser({ encode: () => ({ type: 'image/png', size: 40000 }) });
  assert.equal((await b.compact({})).type, 'image/png');
});

test('failed toBlob uses toDataURL and preserves decoded bytes and MIME', async () => {
  for (const throws of [false, true]) {
    const b = browser({ encode: () => { if (throws) throw new Error('Encoder failed'); return null; },
      dataUrl: () => 'data:image/jpeg;base64,AQIDBA==' });
    const result = await b.compact({});
    assert.equal(result.type, 'image/jpeg');
    assert.deepEqual([...new Uint8Array(await result.arrayBuffer())], [1, 2, 3, 4]);
    assert.equal(b.state().closed, true);
  }
});

test('invalid or oversized data URLs never bypass the upload budget', async () => {
  for (const value of ['data:text/html;base64,AQID', 'data:image/png;base64,' + Buffer.alloc(260000).toString('base64')]) {
    const b = browser({ encode: () => null, dataUrl: () => value });
    await assert.rejects(b.compact({}), /Impossible de réduire/);
  }
});
