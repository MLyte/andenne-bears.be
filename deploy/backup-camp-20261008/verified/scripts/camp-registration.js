(() => {
  const form = document.getElementById('camp-form');
  const status = document.getElementById('camp-form-status');
  const button = form.querySelector('button[type="submit"]');
  let token = '';

  const show = (message, success = false) => {
    status.textContent = message;
    status.classList.toggle('success', success);
    status.hidden = false;
  };
  const getToken = async () => {
    const response = await fetch('camp-registration.php?csrf=1', { credentials: 'same-origin', cache: 'no-store' });
    const data = await response.json();
    if (!response.ok || !data.csrfToken) throw new Error(data.message || 'Formulaire indisponible.');
    token = data.csrfToken;
  };

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    button.disabled = true;
    show('Enregistrement en cours…');
    try {
      if (!token) await getToken();
      const body = new FormData(form);
      body.set('csrf_token', token);
      const response = await fetch(form.action, { method: 'POST', body, credentials: 'same-origin' });
      const data = await response.json();
      token = '';
      if (!response.ok || !data.success) throw new Error(data.message || 'Enregistrement impossible.');
      show(data.message, true);
      form.reset();
    } catch (error) {
      show(error.message || 'Enregistrement impossible. Réessaie plus tard.');
      getToken().catch(() => {});
    } finally {
      button.disabled = false;
    }
  });
  getToken().catch(() => show('Le formulaire est momentanément indisponible. Réessaie plus tard.'));
})();
