import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { copyFile, mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';

const source = join(dirname(fileURLToPath(import.meta.url)), '..', 'tirage-equipes.php');

async function freePort() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

test('sauvegarde explicite, rechargement CSV et conflit de version', async () => {
  const root = await mkdtemp(join(tmpdir(), 'bears-draw-test-'));
  const web = join(root, 'web');
  const storage = join(root, 'storage');
  await mkdir(join(web, 'config'), { recursive: true });
  await mkdir(storage);
  await copyFile(source, join(web, 'tirage-equipes.php'));
  await writeFile(join(web, 'config', 'family-day-config.php'), "<?php return ['storage_dir' => __DIR__ . '/../../storage'];");
  await writeFile(join(web, 'login.php'), "<?php session_start(); $_SESSION['family_dashboard_until'] = time() + 3600; $_SESSION['family_dashboard_csrf'] = 'test-token'; echo 'ok';");
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const server = spawn('php', ['-S', `127.0.0.1:${port}`, '-t', web], { stdio: 'ignore' });
  try {
    let login;
    for (let attempt = 0; attempt < 40; attempt++) {
      try { login = await fetch(`${origin}/login.php`); break; } catch { await new Promise(resolve => setTimeout(resolve, 50)); }
    }
    assert.ok(login, 'Le serveur PHP démarre');
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie')?.split(';')[0];
    assert.ok(cookie);
    const request = (method, state, version) => fetch(`${origin}/tirage-equipes.php`, {
      method, headers: { Cookie: cookie, ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
      body: method === 'POST' ? JSON.stringify({ csrf: 'test-token', version, state }) : undefined,
    });
    const initial = await (await request('GET')).json();
    assert.equal(initial.state, null);
    const state = {
      roster: [
        { id: 'ABCDEF1234', name: 'Alice Martin', bears: false, woman: true, minor: false, present: true },
        { id: '1234ABCDEF', name: 'Bob Martin', bears: true, woman: false, minor: true, present: true },
        { id: 'sur-place-1', name: 'Charlie Martin', bears: true, woman: false, minor: false, present: false },
      ],
      teams: [['ABCDEF1234', '1234ABCDEF']], waiting: [],
      links: [{ childId: '1234ABCDEF', relativeId: 'ABCDEF1234' }],
      seed: 42, teamCount: 1, revision: 1,
    };
    const saved = await request('POST', state, initial.version);
    assert.equal(saved.status, 200, await saved.text());
    const loaded = await (await request('GET')).json();
    assert.deepEqual(loaded.state, state);
    const csv = await readFile(join(storage, 'family-teams-2026.csv'), 'utf8');
    assert.match(csv, /Alice Martin/);
    const stale = await request('POST', state, initial.version);
    assert.equal(stale.status, 409);
    const invalid = structuredClone(state);
    invalid.waiting = ['ABCDEF1234'];
    const rejected = await request('POST', invalid, loaded.version);
    assert.equal(rejected.status, 422);
    assert.equal((await (await request('GET')).json()).version, loaded.version);
  } finally {
    server.kill();
    assert.ok((await realpath(root)).startsWith((await realpath(tmpdir())) + sep));
    await rm(root, { recursive: true, force: true });
  }
});
