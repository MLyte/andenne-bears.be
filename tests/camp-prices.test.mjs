import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

test('camp prices are visible without choosing a category and stay after registration reset', async () => {
  const html = await readFile(new URL('../camp-blegny.html', import.meta.url), 'utf8');
  const script = await readFile(new URL('../scripts/camp-registration.js', import.meta.url), 'utf8');
  const nightsHtml = html.match(/<select id="camp-nights"[^>]*>(.*?)<\/select>/s)[1];
  const options = [...nightsHtml.matchAll(/<option value="([^"]+)">([^<]+)<\/option>/g)]
    .map(([, value, textContent]) => ({ value, textContent }))
    .filter(option => option.value);
  assert.equal(options.length, 4);
  const initialLabels = options.map(option => option.textContent);
  assert.deepEqual(initialLabels.map(label => label.split(' · ').at(-1)), ['120 €', '80 €', '80 €', '40 €']);
  const shirtHtml = html.match(/<select id="camp-shirt-size"[^>]*>(.*?)<\/select>/s)?.[1];
  assert.ok(shirtHtml);
  assert.deepEqual([...shirtHtml.matchAll(/<option value="([^"]+)">/g)].map(([, size]) => size), ['3XL', '2XL', 'XL', 'L', 'M', 'S']);
  const events = {};
  const role = { value: 'Junior', addEventListener: (name, handler) => { events[name] = handler; } };
  const nights = { value: 'samedi', options, addEventListener: (name, handler) => { events[`nights:${name}`] = handler; } };
  const button = {};
  const status = { classList: { toggle() {} } };
  const paymentAmount = {};
  const dialogAmount = {};
  const dialogCommunication = {};
  const dialogReference = {};
  const paymentDialog = { showModal() { this.opened = true; } };
  const form = {
    action: 'camp-registration.php',
    querySelector: () => button,
    elements: { namedItem: name => name === 'nights' ? nights : null },
    reportValidity: () => true,
    addEventListener: (name, handler) => { events[name] = handler; },
    reset: () => { role.value = ''; nights.value = ''; },
  };
  const elements = {
    'camp-form': form, 'camp-form-status': status,
    'camp-payment-amount': paymentAmount, 'camp-payment-dialog': paymentDialog,
    'camp-payment-dialog-amount': dialogAmount,
    'camp-payment-dialog-communication': dialogCommunication,
    'camp-payment-dialog-reference': dialogReference,
  };
  runInNewContext(script, {
    document: { getElementById: id => elements[id] },
    FormData: class { set() {} get(name) { return { nights: 'samedi', last_name: 'Dupont', first_name: 'Sam' }[name]; } },
    fetch: async () => ({ ok: true, json: async () => ({ csrfToken: 'test', success: true, message: 'Inscription enregistrée.', reference: 'ABC123' }) }),
  });
  events['nights:change']();
  assert.equal(paymentAmount.textContent, '80 €');
  for (const category of ['Senior', 'Staff']) {
    role.value = category;
    if (events.change) events.change();
    assert.deepEqual(options.map(option => option.textContent), initialLabels);
    assert.equal(nights.value, 'samedi');
  }
  role.value = 'Junior';
  if (events.change) events.change();
  assert.deepEqual(options.map(option => option.textContent), initialLabels);
  await events.submit({ preventDefault() {} });
  assert.equal(button.disabled, false);
  assert.equal(status.textContent, 'Inscription enregistrée.');
  assert.equal(paymentAmount.textContent, '40 €, 80 € ou 120 € selon les nuits choisies');
  assert.equal(dialogAmount.textContent, '80 €');
  assert.equal(dialogCommunication.textContent, 'Camp Blégny — Dupont Sam');
  assert.equal(dialogReference.textContent, 'ABC123');
  assert.equal(paymentDialog.opened, true);
  assert.match(html, /BE50 0014 5931 8318/);
  assert.deepEqual(options.map(option => option.textContent), initialLabels);
  const saturdayBreakfast = html.match(/<article class="meal breakfast day-start"><strong>Samedi<\/strong>.*?<\/article>/)[0];
  assert.doesNotMatch(saturdayBreakfast, /U20 welcomed/);
  assert.match(html, /<time>08h30<\/time>.*?Séance théorique · accueil des U20/);
});
