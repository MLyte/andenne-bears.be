(() => {
  const form = document.getElementById('camp-form');
  const status = document.getElementById('camp-form-status');
  const button = form.querySelector('button[type="submit"]');
  const nights = form.elements.namedItem('nights');
  const paymentAmount = document.getElementById('camp-payment-amount');
  const paymentDialog = document.getElementById('camp-payment-dialog');
  const prices = { deux: 120, vendredi: 80, samedi: 80, aucune: 40 };
  // Midnight after each displayed deadline, in Belgian winter time.
  const registrationCloses = Date.parse('2026-10-26T00:00:00+01:00');
  const paymentCloses = Date.parse('2026-11-09T00:00:00+01:00');
  let token = '';

  const closeForm = () => {
    form.hidden = true;
    document.getElementById('camp-registration-closed').hidden = false;
    document.getElementById('camp-registration-deadline-note').textContent = 'Les inscriptions sont closes.';
  };

  const updateCountdown = (id, deadline) => {
    const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    const countdown = document.getElementById(id);
    const units = {
      days: Math.floor(remaining / 86400),
      hours: Math.floor(remaining % 86400 / 3600),
      minutes: Math.floor(remaining % 3600 / 60),
      seconds: remaining % 60
    };
    for (const [unit, value] of Object.entries(units)) {
      countdown.querySelector(`[data-unit="${unit}"]`).textContent = String(value).padStart(2, '0');
    }
    return remaining;
  };

  const updateDeadlines = () => {
    if (updateCountdown('camp-registration-countdown', registrationCloses) === 0) closeForm();
    if (updateCountdown('camp-payment-countdown', paymentCloses) === 0) {
      document.getElementById('camp-payment-deadline-note').textContent = 'La date limite de paiement est passée.';
    }
  };
  updateDeadlines();
  setInterval(updateDeadlines, 250);

  const updatePaymentAmount = () => {
    paymentAmount.textContent = prices[nights.value]
      ? `${prices[nights.value]} €`
      : '40 €, 80 € ou 120 € selon les nuits choisies';
  };
  nights.addEventListener('change', updatePaymentAmount);

  const show = (message, success = false) => {
    status.textContent = message;
    status.classList.toggle('success', success);
    status.hidden = false;
  };
  const getToken = async () => {
    const response = await fetch('camp-registration.php?csrf=1', { credentials: 'same-origin', cache: 'no-store' });
    const data = await response.json();
    if (response.status === 410) closeForm();
    if (!response.ok || !data.csrfToken) throw new Error(data.message || 'Formulaire indisponible.');
    token = data.csrfToken;
  };

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (Date.now() >= registrationCloses) {
      closeForm();
      return;
    }
    if (!form.reportValidity()) return;
    button.disabled = true;
    show('Enregistrement en cours…');
    try {
      if (!token) await getToken();
      const body = new FormData(form);
      const amount = prices[body.get('nights')];
      const communication = `Camp Blégny — ${String(body.get('last_name')).trim()} ${String(body.get('first_name')).trim()}`;
      body.set('csrf_token', token);
      const response = await fetch(form.action, { method: 'POST', body, credentials: 'same-origin' });
      const data = await response.json();
      token = '';
      if (response.status === 410) closeForm();
      if (!response.ok || !data.success) throw new Error(data.message || 'Enregistrement impossible.');
      show(data.message, true);
      form.reset();
      updatePaymentAmount();
      document.getElementById('camp-payment-dialog-amount').textContent = `${amount} €`;
      document.getElementById('camp-payment-dialog-communication').textContent = communication;
      document.getElementById('camp-payment-dialog-reference').textContent = data.reference || '';
      if (typeof paymentDialog.showModal === 'function') paymentDialog.showModal();
    } catch (error) {
      show(error.message || 'Enregistrement impossible. Réessaie plus tard.');
      getToken().catch(() => {});
    } finally {
      button.disabled = false;
    }
  });
  if (Date.now() < registrationCloses) {
    getToken().catch(() => {
      if (!form.hidden) show('Le formulaire est momentanément indisponible. Réessaie plus tard.');
    });
  }
})();
