import { parseRegistrationCsv, makeTeams } from './family-teams.mjs';

const fileInput = document.querySelector('#draw-file');
const importStatus = document.querySelector('#draw-import-status');
const rosterBody = document.querySelector('#draw-roster');
const addForm = document.querySelector('#draw-add');
const teamCount = document.querySelector('#draw-count');
const generateButton = document.querySelector('#draw-generate');
const downloadButton = document.querySelector('#draw-download');
const message = document.querySelector('#draw-message');
const results = document.querySelector('#draw-results');
let roster = [];
let draw = null;
let walkInNumber = 0;

function invalidateDraw() {
  draw = null;
  results.replaceChildren();
  downloadButton.disabled = true;
  message.textContent = '';
}

function presentPlayers() { return roster.filter(player => player.present); }

function updateRosterStatus() {
  importStatus.textContent = `${roster.length} personne(s) au flag, ${presentPlayers().length} présente(s).`;
}

function refreshCount() {
  const count = presentPlayers().length;
  teamCount.max = String(Math.max(1, count));
  teamCount.value = String(Math.max(1, Math.ceil(count / 5)));
}

function renderRoster() {
  rosterBody.replaceChildren();
  roster.forEach((player, index) => {
    const row = document.createElement('tr');
    const presence = document.createElement('input');
    presence.type = 'checkbox';
    presence.checked = player.present;
    presence.setAttribute('aria-label', `Présent : ${player.name}`);
    presence.addEventListener('change', () => { player.present = presence.checked; invalidateDraw(); refreshCount(); updateRosterStatus(); });
    const first = document.createElement('td');
    first.append(presence);
    row.append(first);
    const name = document.createElement('td');
    name.textContent = player.name;
    if (player.id.startsWith('sur-place-')) name.title = 'Ajout sur place';
    row.append(name);
    for (const [key, label] of [['bears', 'Bears'], ['woman', 'Femme'], ['minor', 'Moins de 18 ans']]) {
      const cell = document.createElement('td');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = player[key];
      input.setAttribute('aria-label', `${label} : ${player.name}`);
      input.addEventListener('change', () => { player[key] = input.checked; invalidateDraw(); });
      cell.append(input);
      row.append(cell);
    }
    rosterBody.append(row);
  });
  updateRosterStatus();
}

fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  invalidateDraw();
  try {
    if (file.size > 2_000_000) throw new Error('Fichier trop volumineux pour cet outil.');
    const players = parseRegistrationCsv(await file.text());
    if (players.length > 200) throw new Error('Plus de 200 personnes au flag : préparez une liste plus courte.');
    roster = players;
    renderRoster();
    refreshCount();
  } catch (error) {
    roster = [];
    renderRoster();
    refreshCount();
    importStatus.textContent = error.message || 'Import impossible.';
  }
});

addForm.addEventListener('submit', event => {
  event.preventDefault();
  const name = document.querySelector('#draw-add-name').value.trim();
  if (name.length < 2 || roster.length >= 200) {
    message.textContent = 'Indiquez un nom valide. La liste est limitée à 200 personnes.';
    return;
  }
  roster.push({ id: `sur-place-${++walkInNumber}`, name, bears: document.querySelector('#draw-add-bears').checked, woman: document.querySelector('#draw-add-woman').checked, minor: document.querySelector('#draw-add-minor').checked, present: true });
  addForm.reset();
  invalidateDraw();
  renderRoster();
  refreshCount();
});

function textNode(tag, value, className) {
  const element = document.createElement(tag);
  element.textContent = value;
  if (className) element.className = className;
  return element;
}

function renderDraw() {
  results.replaceChildren();
  const { assessment, teams, total, seed } = draw;
  const shortages = [];
  if (total.women < teams.length) shortages.push(`femmes : ${total.women} pour ${teams.length} équipes`);
  if (total.minors < teams.length) shortages.push(`moins de 18 ans : ${total.minors} pour ${teams.length} équipes`);
  if (total.nonBears < teams.length) shortages.push(`personnes hors Bears : ${total.nonBears} pour ${teams.length} équipes`);
  const incomplete = assessment.filter(item => !item.women || !item.minors || !item.nonBears);
  const sizes = assessment.some(item => item.size !== 5);
  const notes = [`${teams.length} équipe(s), ${teams.flat().length} personne(s) présentes. Tirage n° ${seed}.`];
  if (shortages.length) notes.push(`Effectif insuffisant pour certains minimums : ${shortages.join(' ; ')}.`);
  if (incomplete.length) notes.push(`${incomplete.length} équipe(s) ne couvrent pas tous les minimums. Vérifiez et ajustez la composition.`);
  if (sizes) notes.push('Les effectifs ne sont pas tous de cinq personnes.');
  if (!shortages.length && !incomplete.length) notes.push('Chaque équipe couvre les trois minimums proposés.');
  message.textContent = notes.join(' ');
  teams.forEach((team, index) => {
    const assessmentItem = assessment[index];
    const card = document.createElement('section');
    card.className = 'family-draw-team';
    card.append(textNode('h3', `Équipe ${index + 1} · ${team.length} personne(s)`));
    const counts = textNode('p', `Femmes : ${assessmentItem.women} · Moins de 18 ans : ${assessmentItem.minors} · Hors Bears : ${assessmentItem.nonBears}`);
    if (!assessmentItem.women || !assessmentItem.minors || !assessmentItem.nonBears) counts.classList.add('family-draw-warning');
    card.append(counts);
    const list = document.createElement('ol');
    team.forEach(player => {
      const tags = [player.woman && 'femme', player.minor && '−18 ans', !player.bears && 'hors Bears'].filter(Boolean);
      list.append(textNode('li', `${player.name}${tags.length ? ` (${tags.join(', ')})` : ''}`));
    });
    card.append(list);
    results.append(card);
  });
}

generateButton.addEventListener('click', () => {
  invalidateDraw();
  try {
    const players = presentPlayers();
    const count = Number(teamCount.value);
    const seed = crypto.getRandomValues(new Uint32Array(1))[0];
    draw = makeTeams(players, count, seed);
    renderDraw();
    downloadButton.disabled = false;
  } catch (error) {
    message.textContent = error.message || 'Tirage impossible.';
  }
});

function csvCell(value) {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

downloadButton.addEventListener('click', () => {
  if (!draw) return;
  const lines = [['tirage', 'equipe', 'reference', 'nom', 'femme', 'moins_18', 'hors_bears'].join(';')];
  draw.teams.forEach((team, index) => team.forEach(player => {
    lines.push([draw.seed, index + 1, player.id, player.name, player.woman ? 'oui' : 'non', player.minor ? 'oui' : 'non', player.bears ? 'non' : 'oui'].map(value => csvCell(String(value))).join(';'));
  }));
  const url = URL.createObjectURL(new Blob(['\uFEFF', lines.join('\r\n'), '\r\n'], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `equipes-25-octobre-2026-${draw.seed}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
});
