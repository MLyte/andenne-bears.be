const config = window.membersConfig;
const app = document.getElementById('members-staff-app');
const status = document.getElementById('staff-message');
const responses = document.getElementById('members-response-list');
const field = document.getElementById('members-field');
const sideline = document.getElementById('members-sideline-list');
const unitButtons = document.getElementById('members-units');
const search = document.getElementById('members-search');
const copyButton = document.getElementById('members-copy');
const undoButton = document.getElementById('members-undo');
const sidelineButton = document.getElementById('members-send-sideline');
const editDialog = document.getElementById('members-edit-dialog');
const editForm = document.getElementById('members-edit-form');
const editMessage = document.getElementById('members-edit-message');
const photoForm = document.getElementById('members-photo-form');
const photoMessage = document.getElementById('members-photo-message');
const photoPreview = document.getElementById('members-edit-photo-preview');
const unitNames = { attaque: 'Attaque', defense: 'Défense', kickoff: 'Kickoff', kick_return: 'Kick return', punt: 'Punt', punt_return: 'Punt return', field_goal: 'Field goal / PAT' };
let data;
let canUndo = false;
let view = 'responses';
let activeUnit = 'attaque';
let selected = null;
let editReturnFocus = null;
let photoPreviewUrl = null;

for (const unit of Object.keys(config.units)) {
  const button = el('button', '', unitNames[unit]);
  button.type = 'button';
  button.dataset.unit = unit;
  button.setAttribute('aria-pressed', String(unit === activeUnit));
  button.addEventListener('click', () => {
    activeUnit = unit;
    selected = null;
    renderBoard();
  });
  unitButtons.append(button);
}

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

function notify(text, error = false) {
  status.textContent = text;
  status.dataset.state = error ? 'error' : 'success';
}

async function compactStaffPhoto(file) {
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
        for (const type of ['image/webp', 'image/jpeg', 'image/png']) {
          let blob;
          try { blob = await new Promise(resolve => canvas.toBlob(resolve, type, quality)); }
          catch { /* Try the next encoder. */ }
          if (blob && ['image/webp', 'image/jpeg', 'image/png'].includes(blob.type)
              && blob.size > 0 && blob.size <= 250 * 1024) return blob;
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

function playerPhoto(player) {
  if (!player.photo) {
    const fallback = el('img', 'members-avatar');
    fallback.src = 'images/bears-player-placeholder.svg';
    fallback.alt = '';
    return fallback;
  }
  const img = el('img', 'members-avatar');
  img.src = `membres-photo.php?id=${player.id}`;
  img.alt = '';
  img.loading = 'lazy';
  return img;
}

// Keep the staff-only photo endpoint and place the preview outside scrollable boards.
const photoCard = el('aside', 'members-photo-card');
photoCard.id = 'members-photo-card';
photoCard.hidden = true;
document.body.append(photoCard);
let photoTrigger = null;
let photoPinned = false;
let photoHideTimer = null;

function playerWishGroups(player) {
  const main = player.preference === 'defense'
    ? [['Défense', player.defense], ['Attaque', player.offense]]
    : [['Attaque', player.offense], ['Défense', player.defense]];
  return [...main, ['Special Teams', player.special_teams]];
}

function closePhotoCard() {
  clearTimeout(photoHideTimer);
  if (photoTrigger) photoTrigger.setAttribute('aria-expanded', 'false');
  photoTrigger = null;
  photoPinned = false;
  photoCard.hidden = true;
  photoCard.replaceChildren();
}

function placePhotoCard(trigger) {
  const anchor = trigger.getBoundingClientRect();
  const width = photoCard.offsetWidth;
  const height = photoCard.offsetHeight;
  const gap = 12;
  const right = anchor.right + gap;
  const left = anchor.left - width - gap;
  const x = right + width + gap <= window.innerWidth ? right
    : left >= gap ? left : Math.max(gap, Math.min(anchor.left, window.innerWidth - width - gap));
  photoCard.style.left = `${x}px`;
  photoCard.style.top = `${Math.max(gap, Math.min(anchor.top, window.innerHeight - height - gap))}px`;
}

function showPhotoCard(player, trigger) {
  clearTimeout(photoHideTimer);
  if (photoTrigger === trigger && !photoCard.hidden) return;
  closePhotoCard();
  photoTrigger = trigger;
  trigger.setAttribute('aria-expanded', 'true');
  photoCard.setAttribute('aria-label', `Fiche de ${player.name}`);

  const portrait = el('img', 'members-photo-card-image');
  portrait.src = player.photo ? `membres-photo.php?id=${encodeURIComponent(player.id)}` : 'images/bears-player-placeholder.svg';
  portrait.alt = `Portrait de ${player.name}`;
  portrait.addEventListener('error', () => { portrait.onerror = null; portrait.src = 'images/bears-player-placeholder.svg'; }, { once: true });
  const details = el('div', 'members-photo-card-details');
  details.append(el('h3', '', playerLabel(player)));
  const preference = ({ attaque: 'Attaque', defense: 'Défense', deux: 'Attaque et défense', aucune: 'Sans préférence' })[player.preference] || 'Non indiquée';
  details.append(el('p', 'members-photo-card-preference', `Préférence : ${preference}`));
  for (const [label, choices] of playerWishGroups(player)) {
    const group = el('section', 'members-photo-card-group');
    group.append(el('h4', '', label));
    const ranked = Array.isArray(choices) ? choices.filter(Boolean) : [];
    if (ranked.length) {
      const list = el('ol');
      for (const choice of ranked) list.append(el('li', '', choice));
      group.append(list);
    } else group.append(el('p', '', 'Aucun choix indiqué'));
    details.append(group);
  }
  if (player.comment) {
    const comment = el('section', 'members-photo-card-comment');
    comment.append(el('h4', '', 'Message aux coachs'), el('p', '', player.comment));
    details.append(comment);
  }
  photoCard.replaceChildren(portrait, details);
  photoCard.hidden = false;
  placePhotoCard(trigger);
}

function schedulePhotoCardClose() {
  clearTimeout(photoHideTimer);
  if (!photoPinned) photoHideTimer = setTimeout(() => {
    if (!photoCard.matches(':hover') && !photoTrigger?.matches(':hover, :focus')) closePhotoCard();
  }, 120);
}

photoCard.addEventListener('pointerenter', () => clearTimeout(photoHideTimer));
photoCard.addEventListener('pointerleave', schedulePhotoCardClose);
document.addEventListener('pointerdown', event => {
  if (photoPinned && !photoCard.contains(event.target) && !photoTrigger?.contains(event.target)) closePhotoCard();
});
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !photoCard.hidden) closePhotoCard(); });
window.addEventListener('scroll', event => { if (!photoCard.hidden && !photoCard.contains(event.target)) closePhotoCard(); }, true);

function expandablePhoto(player) {
  const trigger = el('button', 'members-photo-open');
  trigger.type = 'button';
  trigger.setAttribute('aria-label', `Afficher la fiche de ${player.name}`);
  trigger.setAttribute('aria-controls', photoCard.id);
  trigger.setAttribute('aria-describedby', photoCard.id);
  trigger.setAttribute('aria-expanded', 'false');
  trigger.append(playerPhoto(player));
  trigger.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') showPhotoCard(player, trigger); });
  trigger.addEventListener('pointerleave', schedulePhotoCardClose);
  trigger.addEventListener('focus', () => showPhotoCard(player, trigger));
  trigger.addEventListener('blur', schedulePhotoCardClose);
  trigger.addEventListener('click', () => {
    if (photoTrigger !== trigger || photoCard.hidden) showPhotoCard(player, trigger);
    photoPinned = !photoPinned;
    if (!photoPinned && !trigger.matches(':hover, :focus')) closePhotoCard();
  });
  return trigger;
}

function playerLabel(player) {
  return `${player.name}${player.number ? ` · #${player.number}` : ''}`;
}

function openEditor(player, trigger) {
  editReturnFocus = trigger;
  editMessage.textContent = '';
  editMessage.removeAttribute('data-state');
  photoForm.reset();
  if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
  photoPreviewUrl = null;
  photoMessage.textContent = '';
  photoMessage.removeAttribute('data-state');
  photoForm.elements.namedItem('player_id').value = player.id;
  photoPreview.src = player.photo ? `membres-photo.php?id=${encodeURIComponent(player.id)}&v=${data.version}` : 'images/bears-player-placeholder.svg';
  photoPreview.alt = player.photo ? `Photo actuelle de ${player.name}` : `Aucune photo pour ${player.name}`;
  editForm.elements.namedItem('player_id').value = player.id;
  editForm.elements.namedItem('first_name').value = player.first_name || '';
  editForm.elements.namedItem('last_name').value = player.last_name || (player.first_name ? '' : player.name);
  if (!player.first_name || !player.last_name) editMessage.textContent = 'Ancienne inscription : vérifie et sépare le prénom et le nom avant d’enregistrer.';
  for (const name of ['number', 'preference', 'comment']) {
    editForm.elements.namedItem(name).value = player[name] || '';
  }
  for (const select of editForm.querySelectorAll('[data-edit-side]')) {
    const side = select.dataset.editSide;
    const rank = Number(select.dataset.editRank);
    const current = Array.isArray(player[side]) ? player[side] : [];
    const allowed = config.choices[side];
    select.required = rank === 0 && side !== 'special_teams' && current.length > 0;
    select.previousElementSibling.textContent = `${['Premier choix', 'Deuxième choix', 'Troisième choix'][rank]}${select.required ? ' *' : ''}`;
    select.replaceChildren(new Option(select.required ? 'Choisir un poste' : 'Aucun', ''));
    for (const position of [...allowed, ...current.filter(value => !allowed.includes(value))]) {
      select.add(new Option(position, position));
    }
    select.value = current[rank] || '';
  }
  editDialog.showModal();
  editDialog.scrollTop = 0;
}

function positionLabel(position) {
  const positionLabels = {
    punt_return: { L3: 'T - DL', L4: 'N - DL', R3: 'E - DL',
      L2: 'SAM - LB', L5: 'MIKE - LB', R5: 'WILL - LB', R2: 'BEAR - LB',
      L1: 'C · CB1', R1: 'C · CB2', R4: 'SS', PR: 'PR - Returner 1', PR2: 'PR - Returner 2' },
    kick_return: { L1: 'LT', L2: 'LG', FB: 'C', R2: 'RG', R1: 'RT',
      L4: 'Wing gauche', R4: 'Wing droit', L3: 'Shield gauche', R3: 'Shield droit',
      KR1: 'Returner gauche', KR2: 'Returner droit' },
    attaque: { WR1: 'X · WR1', WR2: 'Z · WR2', WR3: 'H · WR3', TE: 'Y · TE', FULLBACK: 'FULL BACK' },
    punt: { L1: 'G - WR', R1: 'G - WR', L2: 'LT', L3: 'LG', R3: 'RG', R2: 'RT', L4: 'W', R4: 'W' },
    field_goal: { L: 'X - WR', R: 'Z - WR', C: 'F', B: 'Y' },
    defense: { DT1: 'T · DT1', DT2: 'N · DT2', DE2: 'E · DE2', DE1: 'SAM - LB',
      LB1: 'MIKE - LB', LB2: 'WILL - LB', LB3: 'BEAR - LB', CB1: 'C · CB1', CB2: 'C · CB2' },
  };
  return positionLabels[activeUnit]?.[position] || position;
}

function playerCard(player, role, position) {
  const card = el('div', `members-player-card${selected === player.id ? ' is-selected' : ''}`);
  const selectButton = el('button', 'members-player-select');
  selectButton.type = 'button';
  card.dataset.player = player.id;
  card.dataset.role = role;
  card.dataset.position = position || '';
  card.draggable = true;
  selectButton.setAttribute('aria-pressed', String(selected === player.id));
  const wishGroups = playerWishGroups(player);
  const wishSummary = wishGroups.map(([label, choices]) => `${label} : ${Array.isArray(choices) && choices.length ? choices.join(', ') : 'aucun choix'}`).join('. ');
  selectButton.setAttribute('aria-label', `${playerLabel(player)} · ${role === 'sideline' ? `sideline. ${wishSummary}` : `${positionLabel(position)}, ${{ starter: 'starter', backup: 'backup', potential: 'potentiel' }[role]}`}. Sélectionner pour échanger.`);
  selectButton.append(el('span', 'members-player-name', player.name));
  if (player.number) selectButton.append(el('span', 'members-player-number', `#${player.number}`));
  if (role === 'sideline') {
    const wishes = el('span', 'members-sideline-wishes');
    for (const [label, choices] of wishGroups) {
      const row = el('span', 'members-sideline-wish');
      row.append(el('strong', '', label === 'Special Teams' ? 'ST' : label), el('span', '', Array.isArray(choices) && choices.length ? choices.join(' · ') : '—'));
      wishes.append(row);
    }
    selectButton.append(wishes);
  }
  card.append(expandablePhoto(player), selectButton);
  selectButton.addEventListener('click', () => {
    if (selected && selected !== player.id) {
      const sourceOnField = Object.values(data.boards[activeUnit]).some(slot => ['starter', 'backup', 'potential'].some(slotRole => slot[slotRole] === selected));
      if (role === 'sideline' && !sourceOnField) { selected = player.id; renderBoard(); }
      else move(selected, position, role, player.id);
    }
    else { selected = selected === player.id ? null : player.id; renderBoard(); }
  });
  card.addEventListener('dragstart', event => {
    selected = player.id;
    event.dataTransfer.setData('text/plain', player.id);
    event.dataTransfer.effectAllowed = 'move';
  });
  card.addEventListener('dragover', event => event.preventDefault());
  card.addEventListener('drop', event => {
    event.preventDefault();
    const id = event.dataTransfer.getData('text/plain');
    if (id) move(id, position, role, player.id);
  });
  return card;
}

function renderResponses() {
  closePhotoCard();
  const query = search.value.trim().toLocaleLowerCase('fr');
  const players = [...data.players].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const nameCounts = new Map();
  for (const player of players) {
    const key = player.name.trim().toLocaleLowerCase('fr');
    nameCounts.set(key, (nameCounts.get(key) || 0) + 1);
  }
  document.getElementById('response-count').textContent = `(${players.length})`;
  responses.replaceChildren();
  for (const player of players) {
    if (!`${player.name} ${player.number}`.toLocaleLowerCase('fr').includes(query)) continue;
    const card = el('article', 'members-response-card');
    const head = el('div', 'members-response-head');
    head.append(expandablePhoto(player));
    const heading = el('div');
    heading.append(el('h3', '', playerLabel(player)), el('span', `members-badge${player.approved ? ' is-approved' : ''}`, player.approved ? 'Validé' : 'À vérifier'));
    heading.append(el('span', 'members-badge is-public', player.public_profile ? 'Liste joueurs : oui' : 'Liste joueurs : non'));
    if (nameCounts.get(player.name.trim().toLocaleLowerCase('fr')) > 1) heading.append(el('span', 'members-badge is-duplicate', 'Doublon possible'));
    head.append(heading);
    card.append(head);
    const wishes = el('dl', 'members-wishes');
    const preferredWishes = player.preference === 'defense'
      ? [['Défense', player.defense], ['Attaque', player.offense]]
      : [['Attaque', player.offense], ['Défense', player.defense]];
    const wishRows = preferredWishes.map(([label, choices]) => [label, choices.join(' · ') || '—']);
    wishRows.push(['Special Teams', (player.special_teams || []).join(' · ') || '—']);
    wishRows.push(['Préférence', ({ attaque: 'Attaque', defense: 'Défense', deux: 'Les deux', aucune: 'Aucune' })[player.preference] || '—']);
    for (const [label, value] of wishRows) {
      wishes.append(el('dt', '', label), el('dd', '', value));
    }
    card.append(wishes);
    if (player.comment) card.append(el('p', 'members-comment', player.comment));
    const actions = el('div', 'members-response-actions');
    const edit = el('button', 'button', 'Modifier');
    edit.type = 'button';
    edit.addEventListener('click', () => openEditor(player, edit));
    actions.append(edit);
    if (!player.approved) {
      const approve = el('button', 'button button-primary', 'Valider le profil');
      approve.type = 'button';
      approve.addEventListener('click', () => mutate('approve', { player_id: player.id }));
      actions.append(approve);
    }
    const remove = el('button', 'button', 'Écarter la réponse');
    remove.type = 'button';
    remove.addEventListener('click', () => {
      if (confirm(`Écarter définitivement la réponse de ${player.name} et sa photo ?`)) mutate('remove', { player_id: player.id });
    });
    actions.append(remove);
    card.append(actions);
    responses.append(card);
  }
  if (!responses.children.length) responses.append(el('p', 'members-empty', query ? 'Aucun joueur ne correspond à cette recherche.' : 'Aucune réponse reçue.'));
}

function dropTarget(position, role, label) {
  const button = el('button', 'members-drop-target', label);
  button.type = 'button';
  button.addEventListener('click', () => { if (selected) move(selected, position, role); });
  button.addEventListener('dragover', event => event.preventDefault());
  button.addEventListener('drop', event => {
    event.preventDefault();
    const id = event.dataTransfer.getData('text/plain');
    if (id) move(id, position, role);
  });
  return button;
}

function renderBoard() {
  if (!data) return;
  closePhotoCard();
  const unit = activeUnit;
  copyButton.hidden = !['kick_return', 'punt', 'field_goal', 'punt_return'].includes(unit);
  copyButton.textContent = unit === 'punt_return' ? 'Copier la défense' : 'Copier la OL depuis l’attaque';
  copyButton.title = unit === 'punt_return'
    ? 'Copie les postes de la défense et garde les returners déjà placés.'
    : 'Copie LT, LG, C, RG et RT, pour les starters, backups et joueurs potentiels.';
  unitButtons.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.unit === unit)));
  const board = data.boards[unit];
  const players = new Map(data.players.filter(p => p.approved).map(p => [p.id, p]));
  const occupied = new Set();
  field.dataset.unit = unit;
  field.replaceChildren();
  for (const position of config.units[unit]) {
    const slot = el('div', 'members-position');
    slot.dataset.position = position;
    slot.append(el('strong', 'members-position-label', positionLabel(position)));
    for (const role of ['starter', 'backup', 'potential']) {
      const assigned = players.get(board[position]?.[role]);
      if (assigned) {
        occupied.add(assigned.id);
        const wrapper = el('div', `members-position-person${role !== 'starter' ? ' is-secondary' : ''}`);
        wrapper.append(el('small', '', { starter: 'Starter', backup: 'Backup', potential: 'Potentiel' }[role]), playerCard(assigned, role, position));
        slot.append(wrapper);
      } else {
        slot.append(dropTarget(position, role, `Ajouter un ${role === 'potential' ? 'joueur potentiel' : role}`));
      }
    }
    field.append(slot);
  }
  sideline.replaceChildren();
  for (const player of players.values()) {
    if (!occupied.has(player.id)) sideline.append(playerCard(player, 'sideline', ''));
  }
  if (!sideline.children.length) sideline.append(el('p', 'members-empty', 'Tous les joueurs validés ont une place dans cette unité.'));
  sidelineButton.disabled = !selected;
  undoButton.disabled = !canUndo;
  document.getElementById('members-selection-hint').textContent = selected
    ? `Joueur sélectionné : ${players.get(selected)?.name || '—'}. Choisis une place ou la sideline.`
    : 'Sélectionne un joueur, puis sa destination. Tu peux aussi le déplacer à la souris.';
}

function render() {
  app.setAttribute('aria-busy', 'false');
  document.getElementById('members-responses').hidden = view !== 'responses';
  document.getElementById('members-board-view').hidden = view !== 'board';
  document.querySelectorAll('[data-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === view)));
  renderResponses();
  renderBoard();
}

async function mutate(action, values = {}) {
  const body = new FormData();
  body.set('action', action);
  body.set('csrf_token', config.csrf);
  body.set('version', String(data.version));
  if (values instanceof FormData) {
    for (const [key, value] of values) body.append(key, value);
  } else {
    for (const [key, value] of Object.entries(values)) body.set(key, value);
  }
  try {
    const response = await fetch('membres-staff.php', { method: 'POST', body, credentials: 'same-origin' });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.message || 'Enregistrement impossible.');
    data = result.data;
    canUndo = result.undo;
    selected = null;
    render();
    notify(action === 'move' ? 'Composition mise à jour.' : action === 'copy'
      ? `Postes copiés dans la composition.${result.copy_skipped ? ` ${result.copy_skipped} place(s) laissée(s) vide(s) car le joueur est déjà placé ailleurs dans cette unité.` : ''} Tu peux annuler cette copie.`
      : action === 'undo' ? 'Dernière modification annulée.' : action === 'edit' ? 'Inscription modifiée.'
      : action === 'replace_photo' ? 'Photo remplacée.' : 'Réponse mise à jour.');
    return true;
  } catch (error) {
    const message = error.message || 'Enregistrement impossible.';
    if (action === 'edit' || action === 'replace_photo') {
      const target = action === 'edit' ? editMessage : photoMessage;
      target.textContent = message;
      target.dataset.state = 'error';
    } else notify(message, true);
    if (message.includes('changé')) {
      await load();
      if (action === 'edit' || action === 'replace_photo') editDialog.close();
    }
    return false;
  }
}

function move(id, position, role, targetId = '') {
  if (!data.players.some(player => player.id === id && player.approved)) return;
  mutate('move', { player_id: id, unit: activeUnit, position: position || '', role, target_player_id: targetId });
}

async function load() {
  try {
    const response = await fetch('membres-staff.php?data=1', { credentials: 'same-origin' });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.message || 'Chargement impossible.');
    data = result.data;
    canUndo = result.undo;
    render();
  } catch (error) { notify(error.message || 'Chargement impossible.', true); }
}

document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => { view = button.dataset.view; selected = null; render(); }));
search.addEventListener('input', renderResponses);
document.getElementById('members-edit-close').addEventListener('click', () => editDialog.close());
document.getElementById('members-edit-cancel').addEventListener('click', () => editDialog.close());
editDialog.addEventListener('close', () => {
  if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
  photoPreviewUrl = null;
  (editReturnFocus?.isConnected ? editReturnFocus : search).focus();
});
photoForm.elements.namedItem('photo').addEventListener('change', event => {
  if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
  photoPreviewUrl = null;
  const file = event.target.files?.[0];
  if (!file) return;
  photoPreviewUrl = URL.createObjectURL(file);
  photoPreview.src = photoPreviewUrl;
  photoPreview.alt = `Aperçu de la nouvelle photo : ${file.name}`;
});
editForm.addEventListener('submit', async event => {
  event.preventDefault();
  const submit = editForm.querySelector('[type="submit"]');
  submit.disabled = true;
  editMessage.textContent = 'Enregistrement en cours…';
  editMessage.removeAttribute('data-state');
  const saved = await mutate('edit', new FormData(editForm));
  submit.disabled = false;
  if (saved) editDialog.close();
});
photoForm.addEventListener('submit', async event => {
  event.preventDefault();
  const submit = photoForm.querySelector('[type="submit"]');
  submit.disabled = true;
  photoMessage.textContent = 'Préparation de la photo…';
  photoMessage.removeAttribute('data-state');
  try {
    const file = photoForm.elements.namedItem('photo').files?.[0];
    if (!file || file.size > 4 * 1024 * 1024) throw new Error('Choisis une photo de 4 Mo maximum.');
    const portrait = await compactStaffPhoto(file);
    const body = new FormData(photoForm);
    body.set('photo', portrait, 'portrait.' + ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' })[portrait.type]);
    photoMessage.textContent = 'Enregistrement de la photo en cours…';
    const saved = await mutate('replace_photo', body);
    if (saved) editDialog.close();
  } catch (error) {
    photoMessage.textContent = error.message || 'Cette photo ne peut pas être lue.';
    photoMessage.dataset.state = 'error';
  } finally {
    submit.disabled = false;
  }
});
undoButton.addEventListener('click', () => mutate('undo'));
copyButton.addEventListener('click', () => mutate('copy', { unit: activeUnit }));
sidelineButton.addEventListener('click', () => { if (selected) move(selected, '', 'sideline'); });
sideline.addEventListener('dragover', event => event.preventDefault());
sideline.addEventListener('drop', event => {
  if (event.target.closest('.members-player-card')) return;
  event.preventDefault();
  const id = event.dataTransfer.getData('text/plain');
  if (id) move(id, '', 'sideline');
});
load();
