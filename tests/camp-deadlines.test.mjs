import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const script = await readFile(new URL('../scripts/camp-registration.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../camp-blegny.html', import.meta.url), 'utf8');

function renderAt(instant) {
  const displays = {};
  const countdown = id => ({
    querySelector(selector) {
      const unit = selector.match(/data-unit="([^"]+)"/)[1];
      return displays[`${id}:${unit}`] ??= {};
    },
  });
  const form = {
    hidden: false,
    querySelector: () => ({}),
    elements: { namedItem: () => ({ value: '', addEventListener() {} }) },
    addEventListener() {},
  };
  const closed = { hidden: true };
  const registrationNote = {};
  const paymentNote = {};
  const elements = {
    'camp-form': form,
    'camp-form-status': {},
    'camp-payment-amount': {},
    'camp-payment-dialog': {},
    'camp-registration-closed': closed,
    'camp-registration-deadline-note': registrationNote,
    'camp-payment-deadline-note': paymentNote,
    'camp-registration-countdown': countdown('registration'),
    'camp-payment-countdown': countdown('payment'),
  };
  class TestDate extends Date {
    static now() { return Date.parse(instant); }
  }
  runInNewContext(script, {
    document: { getElementById: id => elements[id] },
    Date: TestDate,
    setInterval() {},
    fetch: async () => ({ ok: true, json: async () => ({ csrfToken: 'test' }) }),
  });
  return { form, closed, registrationNote, paymentNote, displays };
}

test('Belgian registration deadline includes the last second, then closes the form', () => {
  assert.match(html, /25 octobre 2026 à 23 h 59 min 59 s/);
  const lastSecond = renderAt('2026-10-25T23:59:59+01:00');
  assert.equal(lastSecond.form.hidden, false);
  assert.equal(lastSecond.displays['registration:seconds'].textContent, '01');

  const closed = renderAt('2026-10-26T00:00:00+01:00');
  assert.equal(closed.form.hidden, true);
  assert.equal(closed.closed.hidden, false);
  assert.equal(closed.displays['registration:seconds'].textContent, '00');
});

test('payment countdown runs beyond registration and ends on 8 November', () => {
  assert.match(html, /8 novembre 2026 à 23 h 59 min 59 s/);
  const lastSecond = renderAt('2026-11-08T23:59:59+01:00');
  assert.equal(lastSecond.form.hidden, true);
  assert.equal(lastSecond.displays['payment:seconds'].textContent, '01');

  const expired = renderAt('2026-11-09T00:00:00+01:00');
  assert.equal(expired.displays['payment:seconds'].textContent, '00');
  assert.match(expired.paymentNote.textContent, /passée/);
});
