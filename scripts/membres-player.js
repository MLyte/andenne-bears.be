const dialog = document.getElementById('members-depth-dialog');
const form = document.getElementById('members-form');
const rosterDialog = document.getElementById('members-roster-dialog');
const rosterButton = document.getElementById('members-open-roster');

if (rosterDialog && rosterButton) {
  rosterButton.addEventListener('click', () => {
    rosterDialog.showModal();
    rosterDialog.scrollTop = 0;
  });
  rosterDialog.querySelector('[data-close-members-roster]').addEventListener('click', () => rosterDialog.close());
  rosterDialog.addEventListener('close', () => rosterButton.focus());
}

if (dialog && form) {
  const openButton = document.getElementById('members-open-form');
  const closeButtons = dialog.querySelectorAll('[data-close-members-dialog]');
  const captcha = document.getElementById('members-turnstile');
  const captchaScript = document.getElementById('members-turnstile-script');
  const photo = document.getElementById('members-photo');
  const preview = document.getElementById('members-photo-preview');
  const message = document.getElementById('members-message');
  const button = form.querySelector('button[type="submit"]');
  const success = document.getElementById('members-success');
  let widgetId = null;
  let objectUrl = null;

  function showMessage(text, error = false) {
    message.textContent = text;
    message.dataset.state = error ? 'error' : '';
  }

  async function compactPhoto(file) {
    let image;
    let temporaryUrl;
    try {
      if (window.createImageBitmap) {
        try { image = await createImageBitmap(file); } catch { /* Try the image decoder below. */ }
      }
      if (!image) {
        temporaryUrl = URL.createObjectURL(file);
        image = new Image();
        image.src = temporaryUrl;
        await image.decode();
      }
      const width = image.width || image.naturalWidth;
      const height = image.height || image.naturalHeight;
      if (!width || !height) throw new Error('Photo illisible.');
      for (const [maxSide, quality] of [[512, .78], [512, .62], [384, .58], [320, .48]]) {
        const scale = Math.min(1, maxSide / Math.max(width, height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        try {
          const context = canvas.getContext('2d');
          if (!context) throw new Error('Préparation de la photo indisponible. Réessaie.');
          context.fillStyle = '#fff';
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          // Some browsers decode WebP but cannot encode it: toBlob returns PNG.
          const supportedTypes = ['image/webp', 'image/jpeg', 'image/png'];
          const usable = blob => blob && supportedTypes.includes(blob.type)
            && blob.size > 0 && blob.size <= 250 * 1024;
          for (const type of supportedTypes) {
            let blob;
            try {
              blob = await new Promise(resolve => canvas.toBlob(resolve, type, quality));
            } catch { /* Retry via the synchronous canvas encoder below. */ }
            if (usable(blob)) return blob;
            try {
              const encoded = canvas.toDataURL(type, quality);
              const match = /^data:(image\/(?:jpeg|webp|png));base64,(.+)$/.exec(encoded);
              if (!match) continue;
              const binary = atob(match[2]);
              if (!binary.length || binary.length > 250 * 1024) continue;
              const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
              blob = new Blob([bytes], { type: match[1] });
              if (usable(blob)) return blob;
            } catch { /* Try the next format or a smaller canvas. */ }
          }
        } finally {
          canvas.width = canvas.height = 0;
        }
      }
      throw new Error('Impossible de réduire cette photo. Choisis-en une autre.');
    } finally {
      image?.close?.();
      if (temporaryUrl) URL.revokeObjectURL(temporaryUrl);
    }
  }

  function renderCaptcha() {
    if (!dialog.open || widgetId !== null || !window.turnstile) return;
    widgetId = window.turnstile.render('#members-turnstile', {
      sitekey: captcha.dataset.sitekey,
      theme: 'auto',
    });
    showMessage('');
  }

  openButton.addEventListener('click', () => {
    dialog.showModal();
    dialog.scrollTop = 0;
    if (success.hidden) {
      if (window.turnstile) renderCaptcha();
      else {
        showMessage('Chargement de la vérification anti-robot…');
        window.setTimeout(() => {
          if (dialog.open && !window.turnstile) showMessage('La vérification anti-robot ne répond pas. Réessaie plus tard.', true);
        }, 8000);
      }
    }
  });
  captchaScript.addEventListener('load', renderCaptcha);
  captchaScript.addEventListener('error', () => showMessage('La vérification anti-robot ne peut pas charger. Réessaie plus tard.', true));
  closeButtons.forEach(close => close.addEventListener('click', () => dialog.close()));
  dialog.addEventListener('close', () => {
    if (success.hidden && widgetId !== null && window.turnstile) window.turnstile.reset(widgetId);
    openButton.focus();
  });

  photo.addEventListener('change', () => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    const file = photo.files[0];
    preview.hidden = !file;
    if (file) {
      objectUrl = URL.createObjectURL(file);
      preview.src = objectUrl;
    } else preview.removeAttribute('src');
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const data = new FormData(form);
    const sides = ['offense', 'defense', 'special_teams'];
    if (!data.get('offense[]') || !data.get('defense[]')) {
      showMessage('Choisis un premier poste en attaque et en défense.', true);
      document.getElementById('positions-title').scrollIntoView({ behavior: 'smooth' });
      return;
    }
    for (const side of sides) {
      const selected = data.getAll(`${side}[]`).filter(Boolean);
      if (new Set(selected).size !== selected.length) {
        showMessage('Choisis des postes différents dans chaque unité.', true);
        return;
      }
    }
    const file = photo.files[0];
    if (file && file.size > 4 * 1024 * 1024) {
      showMessage('La photo doit faire au maximum 4 Mo.', true);
      return;
    }
    const token = widgetId !== null && window.turnstile ? window.turnstile.getResponse(widgetId) : '';
    if (!token) {
      showMessage('Termine la vérification anti-robot avant de transmettre tes souhaits.', true);
      captcha.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    data.set('cf-turnstile-response', token);
    button.disabled = true;
    button.textContent = 'Envoi en cours…';
    showMessage('Vérification et enregistrement en cours…');
    try {
      if (file) {
        showMessage('Préparation de la photo…');
        const portrait = await compactPhoto(file);
        data.set('photo', portrait, 'portrait.' + ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' })[portrait.type]);
      }
      const response = await fetch(form.action, { method: 'POST', body: data, credentials: 'same-origin' });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Envoi impossible.');
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      form.hidden = true;
      success.hidden = false;
      success.focus();
      dialog.scrollTop = 0;
      openButton.textContent = 'Souhaits transmis';
    } catch (error) {
      showMessage(error.message || 'Envoi impossible. Réessaie.', true);
      if (window.turnstile && widgetId !== null) window.turnstile.reset(widgetId);
      button.disabled = false;
      button.textContent = 'Transmettre mes souhaits';
    }
  });
}
