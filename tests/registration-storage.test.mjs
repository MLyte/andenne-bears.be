import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { copyFile, mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
test('legacy forms, dashboard edits, exports, stale conflicts, and fail-closed SQL switch', async () => {
  const root = await mkdtemp(join(tmpdir(), 'bears-storage-test-'));
  const web = join(root, 'web');
  const storage = join(root, 'storage');
  await mkdir(join(web, 'config'), { recursive: true });
  await mkdir(storage);
  for (const name of ['family-day.php', 'camp-registration.php', 'suivi-inscriptions.php', 'suivi-camp-blegny.php', 'private-backup.php', 'bears-storage.php']) {
    await copyFile(join(repo, name), join(web, name));
  }
  await writeFile(join(web, 'config/family-day-config.php'), `<?php return ['storage_dir' => __DIR__ . '/../../storage', 'registration_open' => true, 'export_username' => 'test', 'export_password_hash' => password_hash('fixture-only', PASSWORD_DEFAULT)];`);
  await writeFile(join(web, 'login.php'), `<?php session_start(); foreach (['family', 'camp'] as $kind) { $_SESSION[$kind . '_dashboard_until'] = time() + 3600; $_SESSION[$kind . '_dashboard_csrf'] = 'test-token'; $_SESSION[$kind . '_csrf'] = 'test-token'; $_SESSION[$kind . '_started'] = time() - 10; } echo 'ok';`);
  const socket = createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  const server = spawn('php', ['-S', `127.0.0.1:${port}`, '-t', web], { stdio: 'ignore' });
  try {
    let login;
    for (let attempt = 0; attempt < 80; attempt++) {
      try { login = await fetch(`${origin}/login.php`); break; } catch { await new Promise(resolve => setTimeout(resolve, 50)); }
    }
    assert.equal(login?.status, 200);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const get = path => fetch(origin + path, { headers: { Cookie: cookie } });
    const post = (path, data) => fetch(origin + path, { method: 'POST', redirect: 'manual', headers: { Cookie: cookie }, body: new URLSearchParams(data) });
    const family = await post('/family-day.php', { csrf_token: 'test-token', company: '', name: 'Élodie Test', email: 'fixture@example.invalid', 'activities[]': 'flag', minor: 'no', bears_player: 'yes', woman: 'yes' });
    const result = await family.json();
    assert.equal(family.status, 200, JSON.stringify(result));
    const counts = await (await get('/family-day.php?counts=1')).json();
    assert.equal(counts.counts.total, 1);
    const dashboard = await (await get('/suivi-inscriptions.php')).text();
    assert.match(dashboard, /Élodie Test/);
    const version = dashboard.match(/name="version" value="([a-f0-9]{64})"/)[1];
    const update = { action: 'update', csrf_token: 'test-token', reference: result.reference, version, date: '2026-10-12T14:00', name: 'Élodie Corrigée', email: 'fixture@example.invalid', flag: 'oui', burgers: '0', volunteer: 'non', day_help: 'non', minor: 'non', guardian: '', bears_player: 'oui', woman: 'oui' };
    assert.equal((await post('/suivi-inscriptions.php', update)).status, 303);
    assert.equal((await post('/suivi-inscriptions.php', update)).status, 409);
    const exported = await (await post('/suivi-inscriptions.php', { action: 'download', csrf_token: 'test-token' })).text();
    assert.match(exported, /Élodie Corrigée/);
    const camp = await post('/camp-registration.php', { csrf_token: 'test-token', company: '', last_name: 'Test', first_name: 'Élodie', role: 'Senior', no_lodging: 'oui', diet: '', allergies: '', other: '' });
    assert.equal(camp.status, 200, await camp.text());
    const campPage = await (await get('/suivi-camp-blegny.php')).text();
    assert.match(campPage, /Élodie/);
    assert.match(await (await post('/suivi-camp-blegny.php', { action: 'download', csrf_token: 'test-token' })).text(), /Senior/);
    const before = await readFile(join(storage, 'family-day-2026.csv'), 'utf8');
    await writeFile(join(storage, '.mysql-active'), 'bears-mysql-v1\n');
    // Missing SQL credentials must never fall back to the now-obsolete CSV.
    const unavailable = await get('/family-day.php?counts=1');
    assert.equal(unavailable.status, 503);
    assert.equal((await unavailable.json()).success, false);
    assert.equal((await get('/suivi-inscriptions.php')).status, 503);
    assert.equal((await get('/suivi-camp-blegny.php')).status, 503);
    assert.equal(await readFile(join(storage, 'family-day-2026.csv'), 'utf8'), before);
  } finally {
    server.kill();
    await new Promise(resolve => server.exitCode !== null ? resolve() : server.once('exit', resolve));
    assert.ok((await realpath(root)).startsWith((await realpath(tmpdir())) + sep));
    await rm(root, { recursive: true, force: true });
  }
});
