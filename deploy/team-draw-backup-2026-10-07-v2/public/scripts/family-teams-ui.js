import { analyzeCapacity, makeSuggestedTeams, swapPlayers, teamSlots } from './family-teams.js?v=7';

const workspace = document.querySelector('#draw-workspace');
const dataStatus = document.querySelector('#draw-data-status');
const rosterBody = document.querySelector('#draw-roster');
const addForm = document.querySelector('#draw-add');
const teamCount = document.querySelector('#draw-count');
const generateButton = document.querySelector('#draw-generate');
const downloadButton = document.querySelector('#draw-download');
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
  fillSelect(childSelect, present.filter(player => player.minor && !familyLinks.some(link => link.childId === player.id)), 'Choisir un enfant');
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
  const possible = Math.max(1, Math.ceil(count / 5));
  teamCount.max = String(possible);
  if (reset || !teamCount.dataset.manual) teamCount.value = String(possible);
  else if (Number(teamCount.value) > possible) teamCount.value = String(possible);
}

function setProgress(id, labelId, current, target) {
  const progress = document.querySelector(id);
  progress.max = target;
  progress.value = Math.min(current, target);
  progress.classList.toggle('is-low', current < target);
  document.querySelector(labelId).textContent = `${current}/${target}`;
}

function renderOverview() {
  const analysis = analyzeCapacity(presentPlayers());
  document.querySelector('#draw-total').textContent = String(analysis.total);
  document.querySelector('#draw-by-size').textContent = String(analysis.teamsBySize);
  document.querySelector('#draw-by-profiles').textContent = String(analysis.teamsByProfiles);
  document.querySelector('#draw-next-title').textContent = `Pour viser ${analysis.nextTeams} équipes de cinq`;
  const places = `${analysis.placesNeeded} ${analysis.placesNeeded > 1 ? 'places manquent' : 'place manque'}`;
  const recruits = `${analysis.minimumNewPeople} ${analysis.minimumNewPeople > 1 ? 'nouvelles personnes' : 'nouvelle personne'}`;
  document.querySelector('#draw-next-summary').textContent = `${places} au seuil de ${5 * analysis.nextTeams} joueurs. Avec les profils actuels, il faut au moins ${recruits} aux profils adaptés pour couvrir les critères de ${analysis.nextTeams} équipes avec des représentants distincts.`;
  setProgress('#draw-progress-places', '#draw-places-label', analysis.total, 5 * analysis.nextTeams);
  setProgress('#draw-progress-women', '#draw-women-label', analysis.counts.women, analysis.nextTeams);
  setProgress('#draw-progress-minors', '#draw-minors-label', analysis.counts.minors, analysis.nextTeams);
  setProgress('#draw-progress-nonbears', '#draw-nonbears-label', analysis.counts.nonBears, analysis.nextTeams);
  const needs = [
    analysis.womenNeeded && `${analysis.womenNeeded} ${analysis.womenNeeded > 1 ? 'femmes' : 'femme'}`,
    analysis.minorsNeeded && `${analysis.minorsNeeded} ${analysis.minorsNeeded > 1 ? 'personnes' : 'personne'} de moins de 18 ans`,
    analysis.nonBearsNeeded && `${analysis.nonBearsNeeded} ${analysis.nonBearsNeeded > 1 ? 'personnes' : 'personne'} hors Bears`,
  ].filter(Boolean);
  document.querySelector('#draw-overview-note').textContent = `${needs.length ? `Besoins par profil : ${needs.join(' · ')}. ` : 'Les profils requis sont présents en nombre suffisant. '}Une nouvelle personne peut avoir plusieurs de ces profils, mais chaque équipe doit attribuer ses trois règles à trois joueurs différents. Ce minimum ne garantit pas que tous les inscrits tiendront dans ${analysis.nextTeams} équipes de cinq ; la répartition finale reste à vérifier${incompleteCount ? ` ; ${incompleteCount} inscription(s) au flag ont des réponses incomplètes dans le suivi` : ''}.`;
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
        if (key === 'minor' && !player.minor) familyLinks = familyLinks.filter(link => link.childId !== player.id);
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
  results.querySelectorAll('.family-draw-player').forEach(button => {
    const selected = button.dataset.playerId === selectedId;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', selected ? 'true' : 'false');
  });
}

function exchange(firstId, secondId) {
  try {
    draw = swapPlayers(draw, firstId, secondId);
    selectedId = null;
    renderDraw();
    swapStatus.textContent = 'Échange effectué. Les règles couvertes et les liens familiaux sont préservés.';
  } catch (error) {
    selectedId = null;
    updateSelection();
    swapStatus.textContent = error.message || 'Échange impossible.';
  }
}

function clearDragTargets() {
  draggedId = null;
  results.querySelectorAll('.family-draw-slot').forEach(row => row.classList.remove('is-drop-target', 'can-swap', 'cannot-swap'));
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
    swapStatus.textContent = 'Joueur sélectionné. Choisis un joueur d’une autre équipe.';
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
  waitingSection.querySelector('h3').textContent = teams.length
    ? 'En attente d’une équipe supplémentaire' : 'En attente d’une première équipe';
  for (const player of waiting) {
    const card = document.createElement('article');
    card.className = 'family-draw-waiting-card';
    card.append(textNode('span', initials(player.name), 'family-draw-avatar'));
    const details = document.createElement('span');
    details.className = 'family-draw-player-text';
    details.append(textNode('strong', player.name));
    const tags = playerTags(player, waiting);
    if (tags.length) details.append(textNode('small', tags.join(' · ')));
    card.append(details);
    waitingPlayers.append(card);
  }
  const complete = assessment.filter(item => item.size === 5 && item.distinctCriteria === 3).length;
  message.textContent = `${teams.length} équipe(s) suggérée(s), dont ${complete} conforme(s) · ${teams.flat().length} joueur(s) placé(s) · ${waiting.length} en attente · tirage n° ${seed}${draw.revision ? ` · ${draw.revision} échange(s)` : ''}.`;
  downloadButton.disabled = false;
  teams.forEach((team, teamIndex) => {
    const assessmentItem = assessment[teamIndex];
    const card = document.createElement('article');
    card.className = `family-draw-team${assessmentItem.size === 5 && assessmentItem.distinctCriteria === 3 ? ' is-complete' : ' is-provisional'}`;
    const heading = document.createElement('div');
    heading.className = 'family-draw-team-heading';
    heading.append(textNode('h3', `Équipe ${teamIndex + 1}`));
    heading.append(textNode('span', `${team.length}/5 joueurs`, 'family-draw-team-size'));
    card.append(heading);
    const slots = document.createElement('ol');
    slots.className = 'family-draw-slots';
    teamSlots(team).forEach((slot, slotIndex) => {
      const row = document.createElement('li');
      row.className = `family-draw-slot${slotIndex < 3 ? ' is-rule' : ''}${slotIndex < 3 && !slot.valid ? ' is-missing' : ''}${!slot.player ? ' is-empty' : ''}`;
      row.append(textNode('span', `${String(slotIndex + 1).padStart(2, '0')} · ${roleLabels[slot.role]}`, 'family-draw-slot-label'));
      if (slotIndex < 3 && !slot.valid) row.append(textNode('span', 'À compléter', 'family-draw-slot-alert'));
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
        button.addEventListener('click', () => choosePlayer(slot.player.id));
        button.addEventListener('dragstart', event => {
          event.dataTransfer.setData('text/plain', slot.player.id);
          event.dataTransfer.effectAllowed = 'move';
          button.classList.add('is-dragging');
          draggedId = slot.player.id;
          results.querySelectorAll('.family-draw-slot[data-player-id]').forEach(target => {
            if (target.dataset.playerId === draggedId) return;
            try {
              swapPlayers(draw, draggedId, target.dataset.playerId);
              target.classList.add('can-swap');
            } catch {
              target.classList.add('cannot-swap');
            }
          });
        });
        button.addEventListener('dragend', () => { button.classList.remove('is-dragging'); clearDragTargets(); });
        row.addEventListener('dragover', event => {
          if (!row.classList.contains('can-swap')) return;
          event.preventDefault(); event.dataTransfer.dropEffect = 'move'; row.classList.add('is-drop-target');
        });
        row.addEventListener('dragleave', () => row.classList.remove('is-drop-target'));
        row.addEventListener('drop', event => {
          if (!row.classList.contains('can-swap')) return;
          event.preventDefault(); clearDragTargets();
          const sourceId = event.dataTransfer.getData('text/plain');
          if (sourceId && sourceId !== slot.player.id) exchange(sourceId, slot.player.id);
        });
        row.append(button);
      } else row.append(textNode('span', 'En attente d’un joueur', 'family-draw-empty'));
      slots.append(row);
    });
    card.append(slots);
    card.append(textNode('p', `${assessmentItem.distinctCriteria}/3 règles couvertes par des joueurs différents`, assessmentItem.distinctCriteria === 3 ? 'family-draw-team-ok' : 'family-draw-warning'));
    results.append(card);
  });
  updateSelection();
}

function simulate() {
  selectedId = null;
  swapStatus.textContent = '';
  results.replaceChildren();
  waitingSection.hidden = true;
  waitingPlayers.replaceChildren();
  downloadButton.disabled = true;
  const players = presentPlayers();
  if (!players.length) {
    draw = null;
    message.textContent = 'Aucun joueur présent pour simuler des équipes.';
    return;
  }
  try {
    draw = makeSuggestedTeams(players, Number(teamCount.value), crypto.getRandomValues(new Uint32Array(1))[0], familyLinks);
    renderDraw();
  } catch (error) {
    draw = null;
    message.textContent = error.message || 'Simulation impossible.';
  }
}

async function loadCurrentRoster() {
  try {
    const response = await fetch('suivi-inscriptions.php?team_roster=1', { credentials: 'same-origin', cache: 'no-store' });
    if (response.status === 401) throw new Error('Connecte-toi d’abord dans le suivi des inscriptions, puis reviens ici pour voir la simulation.');
    if (!response.ok) throw new Error('Impossible de lire les inscriptions actuelles. Réessaie après avoir ouvert le suivi.');
    const data = await response.json();
    if (!data.success || !Array.isArray(data.players) || !Number.isInteger(data.incomplete)
      || data.players.some(player => !player.id || !player.name || ['minor', 'bears', 'woman', 'present'].some(key => typeof player[key] !== 'boolean'))) {
      throw new Error('Les inscriptions reçues sont incomplètes ou invalides.');
    }
    roster = data.players;
    incompleteCount = data.incomplete;
    const updated = new Date(data.generatedAt);
    dataStatus.textContent = `${roster.length} inscription(s) au flag chargée(s) depuis le suivi${Number.isNaN(updated.getTime()) ? '' : ` · état du ${updated.toLocaleString('fr-BE', { dateStyle: 'short', timeStyle: 'short' })}`}${incompleteCount ? ` · ${incompleteCount} fiche(s) à compléter dans le suivi` : ''}.`;
    workspace.hidden = false;
    renderRoster();
    refreshCount(true);
    renderOverview();
    simulate();
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
  roster.push({ id: `sur-place-${++walkInNumber}`, name, bears: document.querySelector('#draw-add-bears').checked, woman: document.querySelector('#draw-add-woman').checked, minor: document.querySelector('#draw-add-minor').checked, present: true });
  addForm.reset();
  renderRoster(); refreshCount(); renderOverview(); simulate();
});

familyForm.addEventListener('submit', event => {
  event.preventDefault();
  const childId = childSelect.value;
  const relativeId = relativeSelect.value;
  if (!childId || !relativeId || childId === relativeId) {
    familyStatus.textContent = 'Choisis un enfant et un autre joueur présent de sa famille.';
    return;
  }
  familyLinks.push({ childId, relativeId });
  renderFamilyLinks();
  familyStatus.textContent = 'Lien ajouté. La simulation garde ces deux personnes ensemble.';
  simulate();
});

teamCount.addEventListener('change', () => { teamCount.dataset.manual = 'true'; simulate(); });
generateButton.addEventListener('click', simulate);

function csvCell(value) {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

downloadButton.addEventListener('click', () => {
  if (!draw) return;
  const lines = [['tirage', 'equipe', 'reference', 'nom', 'femme', 'moins_18', 'hors_bears', 'proche_avec', 'statut_equipe'].join(';')];
  draw.teams.forEach((team, index) => team.forEach(player => {
    const link = draw.links?.find(entry => entry.childId === player.id);
    const valid = draw.assessment[index].size === 5 && draw.assessment[index].distinctCriteria === 3;
    lines.push([draw.seed, index + 1, player.id, player.name, player.woman ? 'oui' : 'non', player.minor ? 'oui' : 'non', player.bears ? 'non' : 'oui', link?.relativeId || '', valid ? 'conforme' : 'provisoire'].map(value => csvCell(String(value))).join(';'));
  }));
  draw.waiting.forEach(player => {
    const link = draw.links?.find(entry => entry.childId === player.id);
    lines.push([draw.seed, '', player.id, player.name, player.woman ? 'oui' : 'non', player.minor ? 'oui' : 'non', player.bears ? 'non' : 'oui', link?.relativeId || '', 'en_attente'].map(value => csvCell(String(value))).join(';'));
  });
  const url = URL.createObjectURL(new Blob(['\uFEFF', lines.join('\r\n'), '\r\n'], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${draw.waiting.length || draw.assessment.some(item => item.size !== 5 || item.distinctCriteria !== 3) ? 'simulation-equipes' : 'equipes'}-25-octobre-2026-${draw.seed}${draw.revision ? `-modifie-${draw.revision}` : ''}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
});

loadCurrentRoster();
