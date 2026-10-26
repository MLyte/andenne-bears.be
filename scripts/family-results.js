const resultsStatus = document.getElementById('family-results-status');
const resultsContent = document.getElementById('family-results-content');
const ranking = document.getElementById('family-results-ranking');
const matchGroups = document.getElementById('family-results-match-groups');
const rosters = document.getElementById('family-results-rosters');
const rosterList = document.getElementById('family-results-roster-list');

function resultsNode(tag, className, value) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (value !== undefined) element.textContent = value;
  return element;
}

function validPair(pair) {
  return Array.isArray(pair) && pair.length === 2 && pair.every(id => Number.isInteger(id) && id >= 0 && id < 6) && pair[0] !== pair[1];
}

function teamName(data, id) {
  return data.teams[id].name || `Équipe ${id + 1}`;
}

function finalOrder(data) {
  const order = [];
  for (const index of [2, 1, 0]) {
    const pair = data.finals[index];
    const score = data.scores[15 + index];
    order.push(pair[score[0] > score[1] ? 0 : 1], pair[score[0] > score[1] ? 1 : 0]);
  }
  if (new Set(order).size !== 6) throw new Error('Classement incomplet');
  return order;
}

function renderRanking(data, order) {
  const standings = new Map(data.standings.map(row => [row.id, row]));
  ranking.replaceChildren(...order.map((id, index) => {
    const row = standings.get(id);
    const item = resultsNode('li', 'family-results-rank');
    const stats = resultsNode('span', 'family-results-stats');
    const diff = row.for - row.against;
    for (const [label, value] of [['V', row.wins], ['N', row.draws], ['D', row.losses], ['Diff.', diff > 0 ? `+${diff}` : diff]]) {
      const stat = resultsNode('span', '', `${label} `);
      stat.append(resultsNode('b', '', String(value)));
      stats.append(stat);
    }
    item.append(resultsNode('span', 'family-results-place', String(index + 1)), resultsNode('strong', 'family-results-team', teamName(data, id)), stats);
    return item;
  }));
}

function renderMatches(data) {
  const groups = [];
  for (let group = 0; group < 6; group++) {
    const section = resultsNode('section', 'family-results-match-group');
    section.append(resultsNode('h4', '', group < 5 ? `Tour ${group + 1}` : 'Matchs de classement'));
    const list = resultsNode('div', 'family-results-match-list');
    for (let offset = 0; offset < 3; offset++) {
      const index = group * 3 + offset;
      const pair = index < 15 ? data.matches[index] : data.finals[index - 15];
      const score = data.scores[index];
      const label = index < 15 ? `Match ${index + 1}` : ['5e et 6e places', '3e et 4e places', 'Finale'][offset];
      const card = resultsNode('article', 'family-results-match');
      card.append(resultsNode('p', 'family-results-match-label', label));
      for (const side of [0, 1]) {
        const row = resultsNode('div', `family-results-match-side${score[side] > score[1 - side] ? ' winner' : ''}`);
        row.append(resultsNode('span', '', teamName(data, pair[side])), resultsNode('strong', '', String(score[side])));
        card.append(row);
      }
      list.append(card);
    }
    section.append(list);
    groups.push(section);
  }
  matchGroups.replaceChildren(...groups);
}

function renderRosters(data, order) {
  if (!data.teams.every(team => Array.isArray(team.players) && team.players.every(name => typeof name === 'string' && name.trim()))) return;
  rosterList.replaceChildren(...order.map(id => {
    const card = resultsNode('article', 'family-results-roster');
    card.append(resultsNode('h4', '', teamName(data, id)));
    const list = resultsNode('ul');
    list.replaceChildren(...data.teams[id].players.map(name => resultsNode('li', '', name)));
    card.append(list);
    return card;
  }));
  rosters.hidden = false;
}

async function showFamilyResults() {
  try {
    const response = await fetch('tournoi-public.php', { cache: 'no-store' });
    if (!response.ok) throw new Error('Résultats indisponibles');
    const data = await response.json();
    if (!data.ready || !Array.isArray(data.teams) || data.teams.length !== 6 ||
        !Array.isArray(data.matches) || data.matches.length !== 15 || !data.matches.every(validPair) ||
        !Array.isArray(data.finals) || data.finals.length !== 3 || !data.finals.every(validPair) ||
        !Array.isArray(data.scores) || data.scores.length !== 18 ||
        !data.scores.every(score => Array.isArray(score) && score.length === 2 && score.every(value => Number.isInteger(value) && value >= 0)) ||
        !Array.isArray(data.standings) || data.standings.length !== 6) {
      resultsStatus.textContent = 'Les résultats complets ne sont pas encore disponibles.';
      return;
    }
    const order = finalOrder(data);
    renderRanking(data, order);
    renderMatches(data);
    renderRosters(data, order);
    resultsContent.hidden = false;
    resultsStatus.hidden = true;
  } catch {
    resultsStatus.textContent = 'Les résultats sont momentanément indisponibles.';
  }
}

if (resultsStatus && resultsContent) showFamilyResults();
