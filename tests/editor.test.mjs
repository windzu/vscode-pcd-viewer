import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import Module from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const file = Buffer.alloc(1024).subarray(19, 24);
file.set([1, 2, 3, 4, 5]);
const writes = [];
const mock = {
    workspace: {
        fs: { readFile: async () => file, writeFile: async (uri, data) => writes.push(data) },
        onDidChangeConfiguration: () => ({ dispose() {} }),
        getConfiguration: () => ({ get: (name, fallback) => name === 'maxPreviewPoints' ? 250000 : fallback }),
    },
    EventEmitter: class { event() {} },
    Uri: { joinPath: (...parts) => parts.join('/') },
};
const originalLoad = Module._load;
Module._load = function(request, ...args) { return request === 'vscode' ? mock : originalLoad.call(this, request, ...args); };
const { PcdEditorProvider } = require('../out/editor.js');
Module._load = originalLoad;

test('custom document saves the exact original buffer view and frees it on disposal', async () => {
    const provider = new PcdEditorProvider({ subscriptions: [] });
    const uri = { scheme: 'file', toString: () => 'file:///test.pcd' };
    const document = await provider.openCustomDocument(uri, {}, {});
    assert.equal(document.documentData.byteLength, 5);
    assert.equal(document.documentData.byteOffset, 19);
    await provider.saveCustomDocument(document, {});
    assert.equal(writes.at(-1).buffer, file.buffer);
    assert.equal(writes.at(-1).constructor, Uint8Array);
    assert.equal(Buffer.isBuffer(writes.at(-1)), false);
    assert.deepEqual(Array.from(writes.at(-1)), [1, 2, 3, 4, 5]);
    document.dispose();
    assert.equal(document.documentData.length, 0);
});

test('webview initialization sends exact file bytes, preview settings and a packaged worker URI', async () => {
    const provider = new PcdEditorProvider({ subscriptions: [], extensionUri: '/extension' });
    const uri = { scheme: 'file', toString: () => 'file:///test.pcd' };
    const document = await provider.openCustomDocument(uri, {}, {});
    const messages = [];
    let receive;
    let visibilityChanged;
    const panel = {
        visible: true,
        onDidChangeViewState: listener => { visibilityChanged = listener; return { dispose() {} }; },
        onDidDispose: () => ({ dispose() {} }),
        webview: {
            asWebviewUri: uri => uri,
            onDidReceiveMessage: listener => { receive = listener; },
            postMessage: message => messages.push(message),
        },
    };
    await provider.resolveCustomEditor(document, panel, {});
    assert.match(panel.webview.html, /data-worker-uri="\/extension\/out\/pcd-worker.js"/);
    receive({ type: 'ready' });
    const init = messages.find(message => message.type === 'init');
    assert.equal(init.body.value.buffer, file.buffer);
    assert.equal(init.body.value.byteOffset, 19);
    assert.equal(init.body.value.constructor, Uint8Array);
    assert.equal(Buffer.isBuffer(init.body.value), false);
    assert.equal(init.body.fileSize, 5);
    assert.equal(init.body.maxPoints, 250000);
    receive({ type: 'reload', fullResolution: true });
    assert.equal(messages.at(-1).body.maxPoints, 0);
    receive({ type: 'reload', fullResolution: false });
    assert.equal(messages.at(-1).body.maxPoints, 250000);
    panel.visible = false;
    visibilityChanged();
    assert.deepEqual(messages.at(-1), { type: 'visibility', body: { visible: false } });
    panel.visible = true;
    visibilityChanged();
    assert.equal(messages.at(-1).body.visible, true);
});
