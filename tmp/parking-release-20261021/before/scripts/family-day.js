const form = document.querySelector('#family-form');
const result = document.querySelector('#family-result');
const flag = document.querySelector('#family-flag');
const meal = document.querySelector('#family-meal');
const help = document.querySelector('#family-help');
const helpChoice = document.querySelector('#family-help-choice');
const burgerQuantity = document.querySelector('#family-burger-quantity');
const burgerCount = document.querySelector('#family-burger-count');
const volunteer = document.querySelector('#family-volunteer');
const wallosVolunteer = document.querySelector('#family-wallos-volunteer');
const mealClosedNotice = document.querySelector('#family-meal-closed');
const mealCta = document.querySelector('#family-meal-cta');
const mealClosedCta = document.querySelector('#family-meal-closed-cta');
const heroRegister = document.querySelector('#family-hero-register');
const compositionNote = document.querySelector('#family-composition-note');
const player = document.querySelector('#family-player');
const minorGroup = document.querySelector('#family-minor');
const woman = document.querySelector('#family-woman');
const guardian = document.querySelector('#family-guardian');
const guardianConsent = document.querySelector('#guardian-consent');
const button = form.querySelector('button[type="submit"]');
const countsStatus = document.querySelector('#family-counts-status');
const countKeys = ['total', 'women', 'under18', 'nonMembers', 'members', 'burgers'];
const countFormatter = new Intl.NumberFormat('fr-BE');
const burgerScene = document.querySelector('.family-burgers-scene');
let hasCounts = false;

function updateBurgerHat(count) {
  setFamilyBurgerPortrait(burgerScene, count);
}

function applyBurgerAvailability(open) {
  if (typeof open !== 'boolean') return;
  meal.disabled = !open;
  if (!open) meal.checked = false;
  mealClosedNotice.hidden = open;
  mealCta.hidden = !open;
  mealClosedCta.hidden = open;
  heroRegister.firstChild.textContent = open
    ? 'M’inscrire au flag / réserver mon repas '
    : 'M’inscrire au tournoi de flag ';
  document.querySelector('#signup-title').textContent = open
    ? 'Inscris-toi. Réserve ta place à table.'
    : 'Inscris-toi au tournoi de flag.';
  button.textContent = open
    ? 'Confirmer mon inscription / ma réservation'
    : 'Confirmer mon inscription au tournoi';
  updateFields();
}

const shareCopyButton = document.querySelector('#family-share-copy');
const shareInstagramLink = document.querySelector('#family-share-instagram');
const shareFeedback = document.querySelector('#family-share-feedback');
const shareUrl = document.querySelector('link[rel="canonical"]').href;
async function copyShareLink(successMessage) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(shareUrl);
    } else {
      const field = document.createElement('textarea');
      field.value = shareUrl;
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.append(field);
      field.select();
      const copied = document.execCommand('copy');
      field.remove();
      if (!copied) throw new Error('Copie indisponible.');
    }
    shareFeedback.textContent = successMessage;
  } catch {
    shareFeedback.textContent = `Copie cette adresse : ${shareUrl}`;
  }
}
shareCopyButton.addEventListener('click', () => { void copyShareLink('Lien copié !'); });
shareInstagramLink.addEventListener('click', () => {
  void copyShareLink('Lien copié !');
});

async function refreshCounts() {
  try {
    const response = await fetch('family-day.php?counts=1', { credentials: 'same-origin', cache: 'no-store' });
    const data = await response.json();
    const counts = data.counts;
    if (!response.ok || typeof data.burgerReservationsOpen !== 'boolean' || !counts || !countKeys.every(key => Number.isSafeInteger(counts[key]) && counts[key] >= 0)
      || counts.members + counts.nonMembers !== counts.total
      || counts.women > counts.total || counts.under18 > counts.total) {
      throw new Error('Compteur indisponible.');
    }
    countKeys.forEach(key => {
      document.querySelector(`[data-count="${key}"]`).textContent = countFormatter.format(counts[key]);
    });
    updateBurgerHat(counts.burgers);
    applyBurgerAvailability(data.burgerReservationsOpen);
    hasCounts = true;
    countsStatus.hidden = true;
  } catch {
    countsStatus.textContent = hasCounts
      ? 'Mise à jour momentanément indisponible. Les derniers chiffres affichés peuvent être anciens.'
      : 'Compteur momentanément indisponible.';
    countsStatus.hidden = false;
  }
}

refreshCounts();
setInterval(() => { if (!document.hidden) refreshCounts(); }, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshCounts(); });

function showChoice(group, visible) {
  group.hidden = !visible;
  group.querySelectorAll('input').forEach(input => {
    input.disabled = !visible;
    input.required = visible;
    if (!visible) input.checked = false;
  });
}

function updateFields() {
  const canHelp = meal.checked && !flag.checked;
  helpChoice.hidden = !canHelp;
  help.disabled = !canHelp;
  if (!canHelp) help.checked = false;
  burgerQuantity.hidden = !meal.checked;
  burgerCount.disabled = !meal.checked;
  burgerCount.required = meal.checked;
  if (!meal.checked) burgerCount.value = '';
  volunteer.hidden = !meal.checked;
  wallosVolunteer.disabled = !meal.checked;
  if (!meal.checked) wallosVolunteer.checked = false;
  compositionNote.hidden = !flag.checked;
  showChoice(player, flag.checked);
  showChoice(minorGroup, flag.checked);
  const minor = form.querySelector('input[name="minor"]:checked')?.value === 'yes';
  showChoice(woman, flag.checked);
  guardian.hidden = !minor;
  guardianConsent.required = minor;
  guardianConsent.disabled = !minor;
  if (!minor) guardianConsent.checked = false;
  document.querySelector('#family-email-label').textContent = minor ? 'Adresse e-mail du responsable légal *' : 'Adresse e-mail de contact *';
}

form.addEventListener('change', updateFields);

document.querySelectorAll('[data-family-choice]').forEach(link => {
  link.addEventListener('click', () => {
    if (form.hidden) return;
    const choice = link.dataset.familyChoice === 'flag'
      ? flag
      : meal;
    if (!choice.disabled) choice.checked = true;
    updateFields();
  });
});

async function fetchToken() {
  const response = await fetch('family-day.php?csrf=1', { credentials: 'same-origin', cache: 'no-store' });
  const data = await response.json();
  if (!response.ok || !data.csrfToken || typeof data.burgerReservationsOpen !== 'boolean') throw new Error(data.message || 'Formulaire indisponible.');
  applyBurgerAvailability(data.burgerReservationsOpen);
  form.elements.csrf_token.value = data.csrfToken;
  return true;
}

updateFields();
if (!button.disabled) {
  button.disabled = true;
  fetchToken()
    .then(() => { button.disabled = false; })
    .catch(error => { showResult(error.message || 'Inscriptions momentanément indisponibles. Rechargez la page plus tard.', false); });
}

function showResult(message, success) {
  result.textContent = message;
  result.className = 'contact-result ' + (success ? 'is-success' : 'is-error');
  result.hidden = false;
  result.focus();
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (button.disabled) return;
  if (!form.querySelector('input[name="activities[]"]:checked')) {
    showResult('Choisissez au moins une activité.', false);
    return;
  }
  if (!form.reportValidity()) return;
  button.disabled = true;
  result.hidden = true;
  try {
    const response = await fetch(form.action, { method: 'POST', body: new FormData(form), credentials: 'same-origin', headers: { Accept: 'application/json' } });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.message || 'Envoi impossible.');
    form.hidden = true;
    showResult(data.message, true);
    refreshCounts();
  } catch (error) {
    showResult(error.message || 'Envoi impossible. Réessayez plus tard.', false);
    try { await fetchToken(); } catch { /* The form stays visible while submissions are unavailable. */ }
  } finally {
    button.disabled = false;
  }
});
