import { analyzeCapacity, assessTeams, placeWaitingPlayer, swapPlayers, teamSlots, teamExceptions } from './family-teams.js?v=10';

const workspace = document.querySelector('#draw-workspace');
const dataStatus = document.querySelector('#draw-data-status');
const rosterBody = document.querySelector('#draw-roster');
const addForm = document.querySelector('#draw-add');
const teamCount = document.querySelector('#draw-count');
const generateButton = document.querySelector('#draw-generate');
const downloadButton = document.querySelector('#draw-download');
const saveButton = document.querySelector('#draw-save');
const saveStatus = document.querySelector('#draw-save-status');
const message = document.querySelector('#draw-message');
const results = document.querySelector('#draw-results');
const waitingSection = document.querySelector('#draw-waiting');
const waitingPlayers = document.querySelector('#draw-waiting-players');
const familyForm = document.querySelector('#draw-family-add');
const childSelect = document.querySelector('#draw-child');
const relativeSelect = document.querySelector('#draw-relative');
const familyStatus = document.querySelector('#draw-family-status');
const familyList = document.querySelector('#draw-family-links');
const swapStatus = document.querySelector('#draw-swap-status');
let roster = [];
let familyLinks = [];
let draw = null;
let selectedId = null;
let draggedId = null;
let walkInNumber = 0;
let incompleteCount = 0;
let saveCsrf = '';
let saveVersion = '';
let dirty = false;
let changeToken = 0;
let simulationWorker = null;
let previousDraw = null;
const undoButton = document.querySelector('#draw-undo');
const teamSize = 6;

function markDirty() {
  dirty = true;
  changeToken++;
  saveButton.disabled = !draw;
  saveStatus.textContent = 'Modifications non sauvées. Clique sur « Sauver » pour les conserver.';
}

function snapshot() {
  return {
    roster, teams: draw.teams.map(team => team.map(player => player.id)),
    waiting: (draw.waiting || []).map(player => player.id), links: familyLinks,
    seed: draw.seed, teamCount: Number(teamCount.value), revision: draw.revision || 0,
  };
}

function presentPlayers() { return roster.filter(player => player.present); }

function textNode(tag, value, className) {
  const element = document.createElement(tag);
  element.textContent = value;
  if (className) element.className = className;
  return element;
}

function fillSelect(select, people, placeholder) {
  select.replaceChildren(new Option(placeholder, ''));
  for (const person of people) select.add(new Option(`${person.name} (${person.id})`, person.id));
}

function renderFamilyLinks() {
  const present = presentPlayers();
  fillSelect(childSelect, present.filter(player => (player.minor || player.woman) && !familyLinks.some(link => link.childId === player.id)), 'Choisir un enfant ou une femme');
  fillSelect(relativeSelect, present, 'Choisir un proche');
  familyList.replaceChildren();
  for (const link of familyLinks) {
    const child = roster.find(player => player.id === link.childId);
    const relative = roster.find(player => player.id === link.relativeId);
    const item = document.createElement('li');
    item.append(document.createTextNode(`${child.name} avec ${relative.name} `));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'button';
    remove.textContent = 'Retirer ce lien';
    remove.setAttribute('aria-label', `Retirer le lien entre ${child.name} et ${relative.name}`);
    remove.addEventListener('click', () => {
      familyLinks = familyLinks.filter(entry => entry !== link);
      renderFamilyLinks();
      familyStatus.textContent = 'Lien retiré. La simulation a été recalculée.';
      simulate();
    });
    item.append(remove);
    familyList.append(item);
  }
}

function refreshCount(reset = false) {
  const count = presentPlayers().length;
  const possible = Math.max(1, Math.ceil(count / teamSize));
  teamCount.max = String(Math.max(possible, Math.ceil(count / 5), draw?.teams.length || 0));
  if (reset || !teamCount.dataset.manual) teamCount.value = String(possible);
  else if (Number(teamCount.value) > Number(teamCount.max)) teamCount.value = teamCount.max;
}

function setProgress(id, labelId, current, target) {
  const progress = document.querySelector(id);
  progress.max = target;
  progress.value = Math.min(current, target);
  progress.classList.toggle('is-low', current < target);
  document.querySelector(labelId).textContent = `${current}/${target}`;
}

function renderOverview() {
  const analysis = analyzeCapacity(presentPlayers(), teamSize);
  document.querySelector('#draw-total').textContent = String(analysis.total);
  document.querySelector('#draw-by-size').textContent = String(analysis.teamsBySize);
  document.querySelector('#draw-by-profiles').textContent = String(analysis.teamsByProfiles);
  document.querySelector('#draw-next-title').textContent = `Pour viser ${analysis.nextTeams} équipes de six`;
  const places = `${analysis.placesNeeded} ${analysis.placesNeeded > 1 ? 'places manquent' : 'place manque'}`;
  const recruits = `${analysis.minimumNewPeople} ${analysis.minimumNewPeople > 1 ? 'nouvelles personnes' : 'nouvelle personne'}`;
  document.querySelector('#draw-next-summary').textContent = `${places} au seuil de ${teamSize * analysis.nextTeams} joueurs. Avec les profils actuels, il faut au moins ${recruits} aux profils adaptés pour couvrir les critères de ${analysis.nextTeams} équipes avec des représentants distincts.`;
  setProgress('#draw-progress-places', '#draw-places-label', analysis.total, teamSize * analysis.nextTeams);
  setProgress('#draw-progress-women', '#draw-women-label', analysis.counts.women, analysis.nextTeams);
  setProgress('#draw-progress-minors', '#draw-minors-label', analysis.counts.minors, analysis.nextTeams);
  setProgress('#draw-progress-nonbears', '#draw-nonbears-label', analysis.counts.nonBears, analysis.nextTeams);
  const needs = [
    analysis.womenNeeded && `${analysis.womenNeeded} ${analysis.womenNeeded > 1 ? 'femmes' : 'femme'}`,
    analysis.minorsNeeded && `${analysis.minorsNeeded} ${analysis.minorsNeeded > 1 ? 'personnes' : 'personne'} de moins de 18 ans`,
    analysis.nonBearsNeeded && `${analysis.nonBearsNeeded} ${analysis.nonBearsNeeded > 1 ? 'personnes' : 'personne'} hors Bears`,
  ].filter(Boolean);
  document.querySelector('#draw-overview-note').textContent = `${needs.length ? `Besoins par profil : ${needs.join(' · ')}. ` : ''}Chaque critère doit être représenté par une personne différente. Les joueurs sont placés même si des critères manquent ; les dérogations restent visibles. Les liens avec un proche peuvent limiter les répartitions possibles${incompleteCount ? ` ; ${incompleteCount} inscription(s) au flag ont des réponses incomplètes dans le suivi` : ''}.`;
}

function renderRoster() {
  rosterBody.replaceChildren();
  for (const player of roster) {
    const row = document.createElement('tr');
    const presence = document.createElement('input');
    presence.type = 'checkbox';
    presence.checked = player.present;
    presence.setAttribute('aria-label', `Présent : ${player.name}`);
    presence.addEventListener('change', () => {
      player.present = presence.checked;
      if (!player.present) familyLinks = familyLinks.filter(link => link.childId !== player.id && link.relativeId !== player.id);
      refreshCount(); renderFamilyLinks(); renderOverview(); simulate();
    });
    const first = document.createElement('td');
    first.append(presence);
    row.append(first);
    const name = textNode('td', player.name);
    if (player.id.startsWith('sur-place-')) name.title = 'Ajout sur place';
    row.append(name);
    for (const [key, label] of [['bears', 'Bears'], ['woman', 'Femme'], ['minor', 'Moins de 18 ans']]) {
      const cell = document.createElement('td');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = player[key];
      input.setAttribute('aria-label', `${label} : ${player.name}`);
      input.addEventListener('change', () => {
        player[key] = input.checked;
        if (!player.minor && !player.woman) familyLinks = familyLinks.filter(link => link.childId !== player.id);
        renderFamilyLinks(); renderOverview(); simulate();
      });
      cell.append(input);
      row.append(cell);
    }
    rosterBody.append(row);
  }
  renderFamilyLinks();
}

function initials(name) {
  return name.trim().split(/\s+/).slice(0, 2).map(word => word[0]?.toLocaleUpperCase('fr') || '').join('');
}

const roleLabels = { woman: 'Femme', minor: 'Moins de 18 ans', nonBears: 'Hors Bears', free: 'Place libre', extra: 'En surnombre' };

function updateSelection() {
  document.querySelectorAll('#draw-results .family-draw-player, #draw-waiting-players .family-draw-player').forEach(button => {
    const selected = button.dataset.playerId === selectedId;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', selected ? 'true' : 'false');
  });
}

function applyManualChange(operation, successMessage) {
  try {
    let changed;
    try { changed = operation(false); }
    catch (error) {
      if (error.code !== 'CONFIRM_PLACEMENT') throw error;
      if (!window.confirm(`${error.message}\n\nConfirmer ce placement avec dérogation ?`)) {
        swapStatus.textContent = 'Placement annulé.';
        return;
      }
      changed = operation(true);
    }
    previousDraw = draw;
    draw = changed;
    undoButton.disabled = false;
    selectedId = null;
    renderDraw();
    markDirty();
    swapStatus.textContent = successMessage;
  } catch (error) {
    selectedId = null;
    updateSelection();
    swapStatus.textContent = error.message || 'Placement impossible.';
  }
}

function exchange(firstId, secondId) {
  applyManualChange(force => swapPlayers(draw, firstId, secondId, { force }), 'Échange effectué. Les dérogations éventuelles sont indiquées dans les équipes.');
}

function placePlayer(playerId, teamIndex, slotIndex) {
  applyManualChange(force => placeWaitingPlayer(draw, playerId, teamIndex, slotIndex, { force }), 'Joueur placé. Les cases sont réorganisées selon les profils et les dérogations restent visibles.');
}

function clearDragTargets() {
  draggedId = null;
  swapTargets().forEach(target => {
    target.classList.remove('is-drop-target', 'can-swap', 'cannot-swap');
  });
}

function swapTargets() {
  return document.querySelectorAll('#draw-results .family-draw-slot, #draw-waiting-players [data-player-id]');
}

function enablePlayerInteraction(button, target, id) {
  button.addEventListener('click', () => choosePlayer(id));
  button.addEventListener('dragstart', event => {
    event.dataTransfer.setData('text/plain', id);
    event.dataTransfer.effectAllowed = 'move';
    button.classList.add('is-dragging');
    draggedId = id;
    swapTargets().forEach(other => {
      if (other.dataset.playerId === id) return;
      try {
        if (other.dataset.teamIndex !== undefined) {
          placeWaitingPlayer(draw, id, Number(other.dataset.teamIndex), Number(other.dataset.slotIndex));
        } else {
          swapPlayers(draw, id, other.dataset.playerId);
        }
        other.classList.add('can-swap');
      } catch (error) {
        other.classList.add(error.code === 'CONFIRM_PLACEMENT' ? 'can-swap' : 'cannot-swap');
      }
    });
  });
  button.addEventListener('dragend', () => { button.classList.remove('is-dragging'); clearDragTargets(); });
  target.addEventListener('dragover', event => {
    if (!target.classList.contains('can-swap')) return;
    event.preventDefault(); event.dataTransfer.dropEffect = 'move'; target.classList.add('is-drop-target');
  });
  target.addEventListener('dragleave', () => target.classList.remove('is-drop-target'));
  target.addEventListener('drop', event => {
    if (!target.classList.contains('can-swap')) return;
    event.preventDefault();
    const sourceId = event.dataTransfer.getData('text/plain');
    clearDragTargets();
    if (sourceId && sourceId !== id) exchange(sourceId, id);
  });
}

function enableEmptyInteraction(button, target, teamIndex, slotIndex) {
  button.addEventListener('click', () => {
    if (selectedId) placePlayer(selectedId, teamIndex, slotIndex);
    else swapStatus.textContent = 'Choisis d’abord un joueur de la liste d’attente.';
  });
  target.addEventListener('dragover', event => {
    if (!target.classList.contains('can-swap')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    target.classList.add('is-drop-target');
  });
  target.addEventListener('dragleave', () => target.classList.remove('is-drop-target'));
  target.addEventListener('drop', event => {
    if (!target.classList.contains('can-swap')) return;
    event.preventDefault();
    const sourceId = event.dataTransfer.getData('text/plain');
    clearDragTargets();
    if (sourceId) placePlayer(sourceId, teamIndex, slotIndex);
  });
}

function choosePlayer(id) {
  if (selectedId === id) {
    selectedId = null;
    swapStatus.textContent = 'Sélection annulée.';
    updateSelection();
  } else if (selectedId) {
    exchange(selectedId, id);
  } else {
    selectedId = id;
    swapStatus.textContent = 'Joueur sélectionné. Choisis un autre joueur à échanger ou une case vide où le placer.';
    updateSelection();
  }
}

function playerTags(player, team) {
  const tags = [player.woman && 'Femme', player.minor && '−18 ans', !player.bears && 'Hors Bears'].filter(Boolean);
  const link = draw.links?.find(entry => entry.childId === player.id);
  const relative = link && team.find(person => person.id === link.relativeId);
  if (relative) tags.push(`Avec ${relative.name}`);
  return tags;
}

function renderDraw() {
  results.replaceChildren();
  waitingPlayers.replaceChildren();
  const { assessment, teams, waiting, seed } = draw;
  waitingSection.hidden = waiting.length === 0;
  document.body.classList.toggle('has-draw-waiting', waiting.length > 0);
  waitingSection.querySelector('h3').textContent = teams.length
    ? 'En attente d’une équipe supplémentaire' : 'En attente d’une première équipe';
  for (const player of waiting) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'family-draw-waiting-card family-draw-player';
    card.draggable = true;
    card.dataset.playerId = player.id;
    card.setAttribute('aria-pressed', 'false');
    card.setAttribute('aria-label', `${player.name}, en attente. Sélectionner pour placer dans une case vide ou échanger avec un joueur placé.`);
    card.append(textNode('span', initials(player.name), 'family-draw-avatar'));
    const details = document.createElement('span');
    details.className = 'family-draw-player-text';
    details.append(textNode('strong', player.name));
    const tags = playerTags(player, waiting);
    if (tags.length) details.append(textNode('small', tags.join(' · ')));
    card.append(details);
    enablePlayerInteraction(card, card, player.id);
    waitingPlayers.append(card);
  }
  const complete = assessment.filter(item => item.size === teamSize && item.distinctCriteria === 3).length;
  const missing = assessment.reduce((sum, item) => sum + 3 - item.distinctCriteria, 0);
  const quality = draw.optimization ? (draw.optimization.minimumReached
    ? 'Minimum de critères manquants atteint pour ce nombre d’équipes.'
    : 'Meilleure répartition trouvée ; le minimum absolu n’est pas établi.') : '';
  message.textContent = `${teams.length} équipe(s), dont ${complete} complète(s) et conforme(s) · ${teams.flat().length} joueur(s) placé(s) · ${waiting.length} en attente · ${missing} critère(s) manquant(s). ${quality} Tirage n° ${seed}${draw.revision ? ` · ${draw.revision} modification(s)` : ''}.`;
  downloadButton.disabled = false;
  teams.forEach((team, teamIndex) => {
    const assessmentItem = assessment[teamIndex];
    const card = document.createElement('article');
    card.className = `family-draw-team${assessmentItem.size === teamSize && assessmentItem.distinctCriteria === 3 ? ' is-complete' : ' is-provisional'}`;
    const heading = document.createElement('div');
    heading.className = 'family-draw-team-heading';
    heading.append(textNode('h3', `Équipe ${teamIndex + 1}`));
    heading.append(textNode('span', `${team.length}/${teamSize} joueurs`, 'family-draw-team-size'));
    card.append(heading);
    const slots = document.createElement('ol');
    slots.className = 'family-draw-slots';
    teamSlots(team, teamSize, true).forEach((slot, slotIndex) => {
      const row = document.createElement('li');
      row.className = `family-draw-slot${slotIndex < 3 ? ' is-rule' : ''}${slotIndex < 3 && !slot.valid ? ' is-missing' : ''}${!slot.player ? ' is-empty' : ''}`;
      row.append(textNode('span', `${String(slotIndex + 1).padStart(2, '0')} · ${roleLabels[slot.role]}`, 'family-draw-slot-label'));
      if (slotIndex < 3 && !slot.valid) row.append(textNode('span', slot.player ? 'Dérogation' : 'Critère manquant', 'family-draw-slot-alert'));
      if (slot.player) {
        row.dataset.playerId = slot.player.id;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'family-draw-player';
        button.draggable = true;
        button.dataset.playerId = slot.player.id;
        button.setAttribute('aria-pressed', 'false');
        button.setAttribute('aria-label', `${slot.player.name}, équipe ${teamIndex + 1}, case ${roleLabels[slot.role]}. Sélectionner pour échanger.`);
        button.append(textNode('span', initials(slot.player.name), 'family-draw-avatar'));
        const description = document.createElement('span');
        description.className = 'family-draw-player-text';
        description.append(textNode('strong', slot.player.name));
        const tags = playerTags(slot.player, team);
        if (tags.length) description.append(textNode('small', tags.join(' · ')));
        button.append(description);
        enablePlayerInteraction(button, row, slot.player.id);
        row.append(button);
      } else {
        row.dataset.teamIndex = String(teamIndex);
        row.dataset.slotIndex = String(slotIndex);
        const button = textNode('button', 'Ajouter un joueur ici', 'family-draw-empty family-draw-empty-button');
        button.type = 'button';
        button.setAttribute('aria-label', `Ajouter un joueur en attente à l’équipe ${teamIndex + 1}, case ${roleLabels[slot.role]}`);
        enableEmptyInteraction(button, row, teamIndex, slotIndex);
        row.append(button);
      }
      slots.append(row);
    });
    card.append(slots);
    card.append(textNode('p', `${assessmentItem.distinctCriteria}/3 règles couvertes par des joueurs différents`, assessmentItem.distinctCriteria === 3 ? 'family-draw-team-ok' : 'family-draw-warning'));
    card.append(textNode('p', `${assessmentItem.size - assessmentItem.nonBears} Bears · ${assessmentItem.minors} moins de 18 ans · ${assessmentItem.women} femme(s) · ${assessmentItem.nonBears} hors Bears`));
    for (const exception of teamExceptions(team)) card.append(textNode('p', exception, 'family-draw-warning'));
    results.append(card);
  });
  updateSelection();
}

function simulate() {
  simulationWorker?.terminate();
  simulationWorker = null;
  previousDraw = null;
  undoButton.disabled = true;
  selectedId = null;
  swapStatus.textContent = '';
  results.replaceChildren();
  waitingSection.hidden = true;
  document.body.classList.remove('has-draw-waiting');
  waitingPlayers.replaceChildren();
  downloadButton.disabled = true;
  const players = presentPlayers();
  if (!players.length) {
    draw = { teams: [], waiting: [], assessment: [], seed: 0, links: [], revision: 0, teamSize };
    renderDraw();
    message.textContent = 'Aucun joueur présent. Les choix de présence peuvent être sauvés.';
    markDirty();
    return;
  }
  try {
    draw = null;
    markDirty();
    message.textContent = 'Recherche d’une répartition : participation, dérogations, puis équilibre des profils…';
    const worker = new Worker('./scripts/family-teams-worker.js?v=1', { type: 'module' });
    simulationWorker = worker;
    worker.onmessage = ({ data }) => {
      if (worker !== simulationWorker) return;
      if (data.progress) {
        message.textContent = `Recherche de la répartition : ${data.progress.done}/${data.progress.total} recherches terminées.`;
        return;
      }
      worker.terminate();
      simulationWorker = null;
      if (data.error) { message.textContent = data.error; return; }
      draw = data.draw;
      renderDraw();
      markDirty();
    };
    worker.onerror = () => {
      worker.terminate(); simulationWorker = null;
      message.textContent = 'Le calcul n’a pas pu aboutir. Relance la simulation.';
    };
    worker.postMessage({ players, count: Number(teamCount.value), seed: crypto.getRandomValues(new Uint32Array(1))[0], links: familyLinks });
  } catch (error) {
    draw = null;
    message.textContent = error.message || 'Simulation impossible.';
    markDirty();
  }
}

async function loadCurrentRoster() {
  try {
    const [response, savedResponse] = await Promise.all([
      fetch('suivi-inscriptions.php?team_roster=1', { credentials: 'same-origin', cache: 'no-store' }),
      fetch('tirage-equipes.php', { credentials: 'same-origin', cache: 'no-store' }),
    ]);
    if (response.status === 401) throw new Error('Connecte-toi d’abord dans le suivi des inscriptions, puis reviens ici pour voir la simulation.');
    if (!response.ok) throw new Error('Impossible de lire les inscriptions actuelles. Réessaie après avoir ouvert le suivi.');
    if (!savedResponse.ok) throw new Error('Impossible de lire le tirage sauvegardé. Réessaie après avoir ouvert le suivi.');
    const data = await response.json();
    const saved = await savedResponse.json();
    if (!data.success || !Array.isArray(data.players) || !Number.isInteger(data.incomplete)
      || data.players.some(player => !player.id || !player.name || ['minor', 'bears', 'woman', 'present'].some(key => typeof player[key] !== 'boolean'))) {
      throw new Error('Les inscriptions reçues sont incomplètes ou invalides.');
    }
    roster = data.players;
    saveCsrf = saved.csrf;
    saveVersion = saved.version;
    incompleteCount = data.incomplete;
    const updated = new Date(data.generatedAt);
    dataStatus.textContent = `${roster.length} inscription(s) au flag chargée(s) depuis le suivi${Number.isNaN(updated.getTime()) ? '' : ` · état du ${updated.toLocaleString('fr-BE', { dateStyle: 'short', timeStyle: 'short' })}`}${incompleteCount ? ` · ${incompleteCount} fiche(s) à compléter dans le suivi` : ''}.`;
    workspace.hidden = false;
    if (saved.state) {
      const state = saved.state;
      const current = new Map(data.players.map(player => [player.id, player]));
      const retained = state.roster.filter(player => player.id.startsWith('sur-place-') || current.has(player.id));
      const renamed = retained.filter(player => !player.id.startsWith('sur-place-') && player.name !== current.get(player.id).name).length;
      const known = new Set(retained.map(player => player.id));
      const added = data.players.filter(player => !known.has(player.id));
      roster = [...retained.map(player => player.id.startsWith('sur-place-') ? player : { ...player, name: current.get(player.id).name }), ...added];
      const byId = new Map(roster.map(player => [player.id, player]));
      familyLinks = state.links.filter(link => byId.has(link.childId) && byId.has(link.relativeId));
      const teams = state.teams.map(team => team.map(id => byId.get(id)).filter(Boolean)).filter(team => team.length);
      const placed = new Set(teams.flat().map(player => player.id));
      const waiting = state.waiting.map(id => byId.get(id)).filter(player => player && !placed.has(player.id));
      const accounted = new Set([...placed, ...waiting.map(player => player.id)]);
      waiting.push(...roster.filter(player => player.present && !accounted.has(player.id)));
      draw = { teams, waiting, assessment: assessTeams(teams), links: familyLinks.map(link => ({ ...link })), seed: state.seed, revision: state.revision, teamSize };
      walkInNumber = Math.max(0, ...roster.filter(player => player.id.startsWith('sur-place-')).map(player => Number(player.id.slice(10)) || 0));
      teamCount.value = String(state.teamCount);
      teamCount.dataset.manual = 'true';
      refreshCount();
      renderRoster();
      renderOverview();
      renderDraw();
      if (added.length || retained.length !== state.roster.length || renamed) {
        markDirty();
        saveStatus.textContent = `Inscriptions modifiées depuis la sauvegarde (${added.length} ajoutée(s), ${state.roster.length - retained.length} retirée(s), ${renamed} nom(s) corrigé(s)). Vérifie puis sauve le tirage actualisé.`;
      } else {
        dirty = false;
        saveButton.disabled = true;
        saveStatus.textContent = 'Dernier tirage sauvegardé chargé.';
      }
    } else {
      renderRoster();
      refreshCount(true);
      renderOverview();
      simulate();
      saveStatus.textContent = 'Aucun tirage sauvegardé. Clique sur « Sauver » pour conserver cette simulation.';
    }
  } catch (error) {
    workspace.hidden = true;
    dataStatus.textContent = error.message || 'Chargement des inscriptions impossible.';
  }
}

addForm.addEventListener('submit', event => {
  event.preventDefault();
  const name = document.querySelector('#draw-add-name').value.trim();
  if (name.length < 2 || roster.length >= 200) {
    message.textContent = 'Indique un nom valide. La simulation est limitée à 200 personnes.';
    return;
  }
  const player = { id: `sur-place-${++walkInNumber}`, name, bears: document.querySelector('#draw-add-bears').checked, woman: document.querySelector('#draw-add-woman').checked, minor: document.querySelector('#draw-add-minor').checked, present: true };
  roster.push(player);
  addForm.reset();
  if (draw) {
    draw = { ...draw, waiting: [...(draw.waiting || []), player], optimization: undefined };
    previousDraw = null;
    undoButton.disabled = true;
    teamCount.dataset.manual = 'true';
    renderRoster(); refreshCount(); renderOverview(); renderDraw(); markDirty();
    swapStatus.textContent = `${name} ajouté en attente. Sélectionne cette personne puis une case ou un joueur dans une équipe.`;
  } else {
    renderRoster(); refreshCount(); renderOverview(); simulate();
  }
});

familyForm.addEventListener('submit', event => {
  event.preventDefault();
  const childId = childSelect.value;
  const relativeId = relativeSelect.value;
  if (!childId || !relativeId || childId === relativeId) {
    familyStatus.textContent = 'Choisis un enfant ou une femme et un autre joueur présent comme proche.';
    return;
  }
  familyLinks.push({ childId, relativeId });
  renderFamilyLinks();
  familyStatus.textContent = 'Lien ajouté. La simulation garde ces deux personnes ensemble.';
  simulate();
});

teamCount.addEventListener('change', () => { teamCount.dataset.manual = 'true'; simulate(); });
generateButton.addEventListener('click', simulate);
undoButton.addEventListener('click', () => {
  if (!previousDraw) return;
  draw = { ...previousDraw, revision: (draw.revision || 0) + 1 };
  previousDraw = null;
  selectedId = null;
  undoButton.disabled = true;
  renderDraw(); markDirty();
  swapStatus.textContent = 'Dernier déplacement annulé.';
});

saveButton.addEventListener('click', async () => {
  if (!draw || !dirty) return;
  const state = snapshot();
  const submittedToken = changeToken;
  saveButton.disabled = true;
  saveStatus.textContent = 'Enregistrement du tirage…';
  try {
    const response = await fetch('tirage-equipes.php', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csrf: saveCsrf, version: saveVersion, state }),
    });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.error || 'Enregistrement impossible.');
    saveVersion = result.version;
    if (changeToken === submittedToken) {
      dirty = false;
      saveStatus.textContent = 'Tirage enregistré. Il sera rechargé à la prochaine ouverture.';
    } else {
      saveStatus.textContent = 'Le tirage a changé pendant l’enregistrement. Clique à nouveau sur « Sauver ».';
    }
  } catch (error) {
    saveStatus.textContent = error.message || 'Enregistrement impossible. Les changements restent dans cette page.';
  } finally {
    saveButton.disabled = !dirty || !draw;
  }
});

window.addEventListener('beforeunload', event => {
  if (!dirty) return;
  event.preventDefault();
  event.returnValue = '';
});

function csvCell(value) {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

downloadButton.addEventListener('click', () => {
  if (!draw) return;
  const lines = [['tirage', 'equipe', 'reference', 'nom', 'femme', 'moins_18', 'hors_bears', 'proche_avec', 'statut_equipe', 'derogations'].join(';')];
  draw.teams.forEach((team, index) => team.forEach(player => {
    const link = draw.links?.find(entry => entry.childId === player.id);
    const valid = draw.assessment[index].size === teamSize && draw.assessment[index].distinctCriteria === 3;
    lines.push([draw.seed, index + 1, player.id, player.name, player.woman ? 'oui' : 'non', player.minor ? 'oui' : 'non', player.bears ? 'non' : 'oui', link?.relativeId || '', valid ? 'conforme' : 'provisoire', teamExceptions(team).join(' | ')].map(value => csvCell(String(value))).join(';'));
  }));
  draw.waiting.forEach(player => {
    const link = draw.links?.find(entry => entry.childId === player.id);
    lines.push([draw.seed, '', player.id, player.name, player.woman ? 'oui' : 'non', player.minor ? 'oui' : 'non', player.bears ? 'non' : 'oui', link?.relativeId || '', 'en_attente', ''].map(value => csvCell(String(value))).join(';'));
  });
  const url = URL.createObjectURL(new Blob(['\uFEFF', lines.join('\r\n'), '\r\n'], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${draw.waiting.length || draw.assessment.some(item => item.size !== teamSize || item.distinctCriteria !== 3) ? 'simulation-equipes' : 'equipes'}-25-octobre-2026-${draw.seed}${draw.revision ? `-modifie-${draw.revision}` : ''}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
});

loadCurrentRoster();
