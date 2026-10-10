const config = window.membersConfig;
const app = document.getElementById('members-staff-app');
const status = document.getElementById('staff-message');
const responses = document.getElementById('members-response-list');
const field = document.getElementById('members-field');
const sideline = document.getElementById('members-sideline-list');
const unitSelect = document.getElementById('members-unit');
const search = document.getElementById('members-search');
const undoButton = document.getElementById('members-undo');
const sidelineButton = document.getElementById('members-send-sideline');
const editDialog = document.getElementById('members-edit-dialog');
const editForm = document.getElementById('members-edit-form');
const editMessage = document.getElementById('members-edit-message');
const unitNames = { attaque: 'Attaque', defense: 'Défense', kickoff: 'Kickoff', kick_return: 'Kick return', punt: 'Punt', punt_return: 'Punt return', field_goal: 'Field goal / PAT' };
let data;
let canUndo = false;
let view = 'responses';
let lineup = 'starter';
let selected = null;
let editReturnFocus = null;

for (const unit of Object.keys(config.units)) unitSelect.add(new Option(unitNames[unit], unit));

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

function playerLabel(player) {
  return `${player.name}${player.number ? ` · #${player.number}` : ''}`;
}

function openEditor(player, trigger) {
  editReturnFocus = trigger;
  editMessage.textContent = '';
  editMessage.removeAttribute('data-state');
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

function playerCard(player, role, position) {
  const card = el('button', `members-player-card${selected === player.id ? ' is-selected' : ''}`);
  card.type = 'button';
  card.dataset.player = player.id;
  card.dataset.role = role;
  card.dataset.position = position || '';
  card.draggable = true;
  card.setAttribute('aria-pressed', String(selected === player.id));
  const wishGroups = [['Attaque', player.offense], ['Défense', player.defense], ['ST', player.special_teams]];
  const wishSummary = wishGroups.map(([label, choices]) => `${label} : ${Array.isArray(choices) && choices.length ? choices.join(', ') : 'aucun choix'}`).join('. ');
  card.setAttribute('aria-label', `${playerLabel(player)} · ${role === 'sideline' ? `sideline. ${wishSummary}` : `${position}, ${role === 'starter' ? 'starter' : 'backup'}`}. Sélectionner pour échanger.`);
  card.append(playerPhoto(player), el('span', 'members-player-name', player.name));
  if (player.number) card.append(el('span', 'members-player-number', `#${player.number}`));
  if (role === 'sideline') {
    const wishes = el('span', 'members-sideline-wishes');
    for (const [label, choices] of wishGroups) {
      const row = el('span', 'members-sideline-wish');
      row.append(el('strong', '', label), el('span', '', Array.isArray(choices) && choices.length ? choices.join(' · ') : '—'));
      wishes.append(row);
    }
    card.append(wishes);
  }
  card.addEventListener('click', () => {
    if (selected && selected !== player.id) {
      const sourceOnField = Object.values(data.boards[unitSelect.value]).some(slot => slot.starter === selected || slot.backup === selected);
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
    head.append(playerPhoto(player));
    const heading = el('div');
    heading.append(el('h3', '', playerLabel(player)), el('span', `members-badge${player.approved ? ' is-approved' : ''}`, player.approved ? 'Validé' : 'À vérifier'));
    heading.append(el('span', 'members-badge is-public', player.public_profile ? 'Liste joueurs : oui' : 'Liste joueurs : non'));
    if (nameCounts.get(player.name.trim().toLocaleLowerCase('fr')) > 1) heading.append(el('span', 'members-badge is-duplicate', 'Doublon possible'));
    head.append(heading);
    card.append(head);
    const wishes = el('dl', 'members-wishes');
    for (const [label, value] of [['Attaque', player.offense.join(' · ') || '—'], ['Défense', player.defense.join(' · ') || '—'], ['Special Teams', (player.special_teams || []).join(' · ') || '—'], ['Préférence', ({ attaque: 'Attaque', defense: 'Défense', deux: 'Les deux', aucune: 'Aucune' })[player.preference] || '—']]) {
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
  const unit = unitSelect.value;
  const board = data.boards[unit];
  const players = new Map(data.players.filter(p => p.approved).map(p => [p.id, p]));
  const occupied = new Set();
  field.replaceChildren();
  for (const position of config.units[unit]) {
    const slot = el('div', 'members-position');
    slot.append(el('strong', 'members-position-label', position));
    for (const role of [lineup, lineup === 'starter' ? 'backup' : 'starter']) {
      const assigned = players.get(board[position]?.[role]);
      if (assigned) {
        occupied.add(assigned.id);
        const wrapper = el('div', `members-position-person${role !== lineup ? ' is-secondary' : ''}`);
        wrapper.append(el('small', '', role === 'starter' ? 'Starter' : 'Backup'), playerCard(assigned, role, position));
        slot.append(wrapper);
      } else {
        slot.append(dropTarget(position, role, role === 'starter' ? 'Ajouter un starter' : 'Ajouter un backup'));
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
  document.querySelectorAll('[data-lineup]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.lineup === lineup)));
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
    notify(action === 'move' ? 'Composition mise à jour.' : action === 'undo' ? 'Échange annulé.' : action === 'edit' ? 'Inscription modifiée.' : 'Réponse mise à jour.');
    return true;
  } catch (error) {
    const message = error.message || 'Enregistrement impossible.';
    if (action === 'edit') {
      editMessage.textContent = message;
      editMessage.dataset.state = 'error';
    } else notify(message, true);
    if (message.includes('changé')) {
      await load();
      if (action === 'edit') editDialog.close();
    }
    return false;
  }
}

function move(id, position, role, targetId = '') {
  if (!data.players.some(player => player.id === id && player.approved)) return;
  mutate('move', { player_id: id, unit: unitSelect.value, position: position || '', role, target_player_id: targetId });
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
document.querySelectorAll('[data-lineup]').forEach(button => button.addEventListener('click', () => { lineup = button.dataset.lineup; selected = null; render(); }));
unitSelect.addEventListener('change', () => { selected = null; renderBoard(); });
search.addEventListener('input', renderResponses);
document.getElementById('members-edit-close').addEventListener('click', () => editDialog.close());
document.getElementById('members-edit-cancel').addEventListener('click', () => editDialog.close());
editDialog.addEventListener('close', () => (editReturnFocus?.isConnected ? editReturnFocus : search).focus());
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
undoButton.addEventListener('click', () => mutate('undo'));
sidelineButton.addEventListener('click', () => { if (selected) move(selected, '', 'sideline'); });
sideline.addEventListener('dragover', event => event.preventDefault());
sideline.addEventListener('drop', event => {
  if (event.target.closest('.members-player-card')) return;
  event.preventDefault();
  const id = event.dataTransfer.getData('text/plain');
  if (id) move(id, '', 'sideline');
});
load();
