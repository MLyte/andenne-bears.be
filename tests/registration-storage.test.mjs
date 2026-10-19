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
    const campHeader = 'reference;date_utc;nom;prenom;categorie;exigence_alimentaire;allergies;autres;logement';
    await writeFile(join(storage, 'camp-blegny-2026.csv'), campHeader + '\nABCDEF5678;2026-10-12T12:00:00+00:00;Ancien;Camille;Junior;;;;oui\n');
    const legacyCampPage = await (await get('/suivi-camp-blegny.php')).text();
    assert.match(legacyCampPage, /camp-dashboard-amount">Nuits à préciser/);
    assert.match(legacyCampPage, /is-unpaid">Non/);
    const legacyExport = await (await post('/suivi-camp-blegny.php', { action: 'download', csrf_token: 'test-token' })).text();
    assert.match(legacyExport, /logement;paye;nuits;taille_tshirt;montant_eur/);
    assert.match(legacyExport, /;oui;non;a_preciser;;\r?\n/);
    const camp = await post('/camp-registration.php', { csrf_token: 'test-token', company: '', last_name: 'Test', first_name: 'Élodie', role: 'Senior', no_lodging: 'oui', shirt_size: 'XL', diet: '', allergies: '', other: '', paid: 'oui' });
    const campResult = await camp.json();
    assert.equal(camp.status, 200, JSON.stringify(campResult));
    const campPage = await (await get('/suivi-camp-blegny.php')).text();
    assert.match(campPage, /Élodie/);
    assert.match(campPage, /camp-dashboard-amount">40 €/);
    assert.doesNotMatch(campPage, /name="paid" value="oui" checked/);
    const campFile = join(storage, 'camp-blegny-2026.csv');
    const initialCampCsv = await readFile(campFile, 'utf8');
    assert.match(initialCampCsv, /logement;paye/);
    assert.match(initialCampCsv, /;oui;non/);
    assert.match(initialCampCsv, /;non;non/); // Public input cannot mark a payment as received.
    const campUpdate = { action: 'update', csrf_token: 'test-token', reference: campResult.reference, version: campPage.match(/name="version" value="([a-f0-9]{64})"/)[1], date: '2026-10-13T14:00', last_name: 'Test', first_name: 'Élodie', role: 'Senior', lodging: 'non', shirt_size: 'XL', diet: '', allergies: '', other: '', paid: 'oui' };
    assert.equal((await post('/suivi-camp-blegny.php', { ...campUpdate, csrf_token: 'invalid' })).status, 403);
    assert.equal((await post('/suivi-camp-blegny.php', { ...campUpdate, paid: 'maybe' })).status, 422);
    assert.equal(await readFile(campFile, 'utf8'), initialCampCsv);
    assert.equal((await post('/suivi-camp-blegny.php', campUpdate)).status, 303);
    assert.equal((await post('/suivi-camp-blegny.php', campUpdate)).status, 409);
    const paidCampPage = await (await get('/suivi-camp-blegny.php')).text();
    assert.match(paidCampPage, /is-paid">Oui/);
    assert.match(paidCampPage, /name="paid" value="oui" checked/);
    const campExport = await (await post('/suivi-camp-blegny.php', { action: 'download', csrf_token: 'test-token' })).text();
    assert.match(campExport, /;non;oui;aucune;XL;40/);
    campUpdate.version = paidCampPage.match(/name="version" value="([a-f0-9]{64})"/)[1];
    campUpdate.lodging = 'oui';
    assert.equal((await post('/suivi-camp-blegny.php', campUpdate)).status, 303);
    assert.match(await (await post('/suivi-camp-blegny.php', { action: 'download', csrf_token: 'test-token' })).text(), /;oui;oui;a_preciser;XL;\r?\n/);
    campUpdate.version = (await (await get('/suivi-camp-blegny.php')).text()).match(/name="version" value="([a-f0-9]{64})"/)[1];
    campUpdate.nights = 'samedi';
    assert.equal((await post('/suivi-camp-blegny.php', campUpdate)).status, 303);
    const saturdayPage = await (await get('/suivi-camp-blegny.php')).text();
    assert.match(saturdayPage, /camp-dashboard-amount">80 €/);
    assert.match(saturdayPage, /<strong>1<\/strong> lits samedi soir/);
    assert.match(saturdayPage, /name="paid" value="oui" checked/);
    assert.match(await (await post('/suivi-camp-blegny.php', { action: 'download', csrf_token: 'test-token' })).text(), /;oui;oui;samedi;XL;80\r?\n/);
    campUpdate.version = (await (await get('/suivi-camp-blegny.php')).text()).match(/name="version" value="([a-f0-9]{64})"/)[1];
    delete campUpdate.paid; // Browsers omit unchecked checkboxes.
    assert.equal((await post('/suivi-camp-blegny.php', campUpdate)).status, 303);
    assert.doesNotMatch(await (await get('/suivi-camp-blegny.php')).text(), /name="paid" value="oui" checked/);
    for (const role of ['Junior', 'Senior', 'Staff']) {
      for (const nights of ['vendredi', 'samedi', 'deux', 'aucune']) {
        const freshLogin = await fetch(`${origin}/login.php`);
        const freshCookie = freshLogin.headers.get('set-cookie').split(';')[0];
        const response = await fetch(`${origin}/camp-registration.php`, {
          method: 'POST', headers: { Cookie: freshCookie },
          body: new URLSearchParams({ csrf_token: 'test-token', last_name: 'Nuits', first_name: 'Camille', role, nights, shirt_size: 'M', paid: 'oui' }),
        });
        const registration = await response.json();
        assert.equal(response.status, 200, `${role}/${nights}: ${JSON.stringify(registration)}`);
        const csv = await readFile(campFile, 'utf8');
        const saved = csv.split(/\r?\n/).find(line => line.startsWith(registration.reference + ';'));
        assert.ok(saved.endsWith(`;${nights === 'aucune' ? 'non' : 'oui'};non;${nights};M`), saved);
      }
    }
    const pricedExport = await (await post('/suivi-camp-blegny.php', { action: 'download', csrf_token: 'test-token' })).text();
    const commonRates = { aucune: '40', vendredi: '80', samedi: '80', deux: '120', a_preciser: '' };
    const expectedRates = { Junior: commonRates, Senior: commonRates, Staff: commonRates };
    const pricedRows = pricedExport.trimEnd().split(/\r?\n/).slice(1);
    assert.equal(pricedRows.length, 14);
    for (const line of pricedRows) {
      const row = line.split(';');
      assert.equal(row[12], expectedRates[row[4]][row[10]], `${row[4]}/${row[10]}`);
    }
    const beforeDelete = await (await get('/suivi-camp-blegny.php')).text();
    const deleteVersion = beforeDelete.match(new RegExp(`name="reference" value="${campResult.reference}"[^>]*><input type="hidden" name="version" value="([a-f0-9]{64})"`))[1];
    const deletion = { action: 'delete', csrf_token: 'test-token', reference: campResult.reference, version: deleteVersion, confirm_delete: 'oui' };
    assert.equal((await post('/suivi-camp-blegny.php', { ...deletion, csrf_token: 'invalid' })).status, 403);
    assert.equal((await post('/suivi-camp-blegny.php', { ...deletion, confirm_delete: '' })).status, 422);
    assert.equal((await post('/suivi-camp-blegny.php', { ...deletion, version: '0'.repeat(64) })).status, 409);
    assert.equal((await post('/suivi-camp-blegny.php', deletion)).status, 303);
    assert.doesNotMatch(await readFile(campFile, 'utf8'), new RegExp(campResult.reference));
    const afterDelete = await (await get('/suivi-camp-blegny.php?deleted=1')).text();
    assert.match(afterDelete, /Inscription supprimée/);
    assert.match(afterDelete, /<strong>13<\/strong> inscriptions/);
    assert.equal((await post('/suivi-camp-blegny.php', deletion)).status, 404);
    const invalidLogin = await fetch(`${origin}/login.php`);
    const invalidCookie = invalidLogin.headers.get('set-cookie').split(';')[0];
    const csvBeforeInvalid = await readFile(campFile, 'utf8');
    const invalidNights = await fetch(`${origin}/camp-registration.php`, {
      method: 'POST', headers: { Cookie: invalidCookie },
      body: new URLSearchParams({ csrf_token: 'test-token', last_name: 'Nuits', first_name: 'Camille', role: 'Junior', nights: 'a_preciser', shirt_size: 'M' }),
    });
    assert.equal(invalidNights.status, 422);
    assert.equal(await readFile(campFile, 'utf8'), csvBeforeInvalid);
    const invalidSizeLogin = await fetch(`${origin}/login.php`);
    const invalidSizeCookie = invalidSizeLogin.headers.get('set-cookie').split(';')[0];
    const invalidSize = await fetch(`${origin}/camp-registration.php`, {
      method: 'POST', headers: { Cookie: invalidSizeCookie },
      body: new URLSearchParams({ csrf_token: 'test-token', last_name: 'Nuits', first_name: 'Camille', role: 'Junior', nights: 'samedi', shirt_size: '4XL' }),
    });
    assert.equal(invalidSize.status, 422);
    assert.equal(await readFile(campFile, 'utf8'), csvBeforeInvalid);
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
