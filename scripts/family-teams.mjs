export function parseRegistrationCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const source = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ';') { row.push(cell); cell = ''; }
    else if (char === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += char;
  }
  if (quoted) throw new Error('CSV invalide : guillemet non fermé.');
  if (cell !== '' || row.length) { row.push(cell.replace(/\r$/, '')); rows.push(row); }
  const headers = rows.shift();
  if (!headers) throw new Error('Le fichier CSV est vide.');
  const required = ['reference', 'nom', 'flag', 'mineur', 'joueur_bears', 'femme'];
  if (required.some(key => !headers.includes(key))) throw new Error('Colonnes manquantes dans le CSV des inscriptions.');
  const index = Object.fromEntries(required.map(key => [key, headers.indexOf(key)]));
  const players = [];
  const incomplete = [];
  const references = new Set();
  for (const values of rows) {
    if (values.length !== headers.length) throw new Error('Une ligne du CSV contient un nombre de colonnes incorrect.');
    if (values[index.flag] !== 'oui') continue;
    const reference = values[index.reference];
    if (!reference || references.has(reference)) throw new Error('Référence manquante ou en double dans le CSV.');
    references.add(reference);
    const answers = ['mineur', 'joueur_bears', 'femme'].map(key => values[index[key]]);
    if (!values[index.nom] || answers.some(value => !['oui', 'non'].includes(value))) {
      incomplete.push(reference);
      continue;
    }
    players.push({
      id: reference,
      name: values[index.nom],
      minor: answers[0] === 'oui',
      bears: answers[1] === 'oui',
      woman: answers[2] === 'oui',
      present: true,
    });
  }
  if (incomplete.length) throw new Error(`Réponses incomplètes pour ${incomplete.length} inscription(s) flag : ${incomplete.slice(0, 5).join(', ')}. Corrigez ces fiches avant le tirage.`);
  return players;
}

function randomFromSeed(seed) {
  let state = (seed >>> 0) || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

function shuffle(items, random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function distinctCriteriaCovered(players) {
  // Chaque personne ne peut représenter qu'un seul des trois critères.
  const reachable = new Uint8Array(8);
  reachable[0] = 1;
  for (const player of players) {
    const options = [player.woman && 1, player.minor && 2, !player.bears && 4].filter(Boolean);
    for (let mask = 7; mask >= 0; mask--) {
      if (!reachable[mask]) continue;
      for (const option of options) reachable[mask | option] = 1;
    }
  }
  if (reachable[7]) return 3;
  if (reachable[3] || reachable[5] || reachable[6]) return 2;
  if (reachable[1] || reachable[2] || reachable[4]) return 1;
  return 0;
}

export function assessTeams(teams) {
  return teams.map((players, index) => ({
    number: index + 1,
    size: players.length,
    women: players.filter(player => player.woman).length,
    minors: players.filter(player => player.minor).length,
    nonBears: players.filter(player => !player.bears).length,
    distinctCriteria: distinctCriteriaCovered(players),
  }));
}

const criteria = ['woman', 'minor', 'nonBears'];

function qualifies(player, criterion) {
  return criterion === 'nonBears' ? !player.bears : player[criterion];
}

function matchCriteria(players, required) {
  const playerRole = Array(players.length).fill(-1);
  const assign = (roleIndex, visited) => {
    for (let playerIndex = 0; playerIndex < players.length; playerIndex++) {
      if (visited.has(playerIndex) || !qualifies(players[playerIndex], required[roleIndex])) continue;
      visited.add(playerIndex);
      if (playerRole[playerIndex] === -1 || assign(playerRole[playerIndex], visited)) {
        playerRole[playerIndex] = roleIndex;
        return true;
      }
    }
    return false;
  };
  for (let roleIndex = 0; roleIndex < required.length; roleIndex++) assign(roleIndex, new Set());
  const roles = Array(required.length).fill(-1);
  playerRole.forEach((roleIndex, playerIndex) => { if (roleIndex !== -1) roles[roleIndex] = playerIndex; });
  return roles;
}

export function teamSlots(players) {
  const assigned = matchCriteria(players, criteria);
  const used = new Set(assigned.filter(index => index !== -1));
  const remaining = players.filter((_, index) => !used.has(index));
  const slots = criteria.map((role, index) => ({ role, player: assigned[index] === -1 ? null : players[assigned[index]], valid: assigned[index] !== -1 }));
  slots.push({ role: 'free', player: remaining.shift() || null, valid: true });
  slots.push({ role: 'free', player: remaining.shift() || null, valid: true });
  while (remaining.length) slots.push({ role: 'extra', player: remaining.shift(), valid: false });
  return slots;
}

export function analyzeCapacity(players) {
  const total = players.length;
  const counts = {
    women: players.filter(player => player.woman).length,
    minors: players.filter(player => player.minor).length,
    nonBears: players.filter(player => !player.bears).length,
  };
  const teamsBySize = Math.floor(total / 5);
  const nextTeams = teamsBySize + 1;
  const required = Array.from({ length: nextTeams }, () => criteria).flat();
  const coveredForNext = matchCriteria(players, required).filter(index => index !== -1).length;
  let low = 0;
  let high = teamsBySize;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const roles = Array.from({ length: middle }, () => criteria).flat();
    if (matchCriteria(players, roles).every(index => index !== -1)) low = middle;
    else high = middle - 1;
  }
  return {
    total,
    counts,
    teamsBySize,
    teamsByProfiles: low,
    nextTeams,
    placesNeeded: Math.max(0, 5 * nextTeams - total),
    representativeShortage: 3 * nextTeams - coveredForNext,
    minimumNewPeople: Math.max(5 * nextTeams - total, 3 * nextTeams - coveredForNext),
    womenNeeded: Math.max(0, nextTeams - counts.women),
    minorsNeeded: Math.max(0, nextTeams - counts.minors),
    nonBearsNeeded: Math.max(0, nextTeams - counts.nonBears),
  };
}

function linkedGroups(players, links) {
  const byId = new Map(players.map(player => [player.id, player]));
  const parent = new Map(players.map(player => [player.id, player.id]));
  const children = new Set();
  const root = id => {
    while (parent.get(id) !== id) id = parent.get(id);
    return id;
  };
  for (const link of links) {
    const child = byId.get(link?.childId);
    const relative = byId.get(link?.relativeId);
    if (!child || !relative || !child.minor || child.id === relative.id || children.has(child.id)) {
      throw new Error('Lien familial invalide : choisissez un enfant présent et un proche présent différent pour chaque enfant.');
    }
    children.add(child.id);
    parent.set(root(child.id), root(relative.id));
  }
  const groups = new Map();
  for (const player of players) {
    const id = root(player.id);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(player);
  }
  return [...groups.values()];
}

function placeLinkedGroups(groups, count, playerCount, random) {
  const base = Math.floor(playerCount / count);
  const remaining = playerCount % count;
  const capacities = Array.from({ length: count }, (_, index) => base + (index < remaining ? 1 : 0));
  const teams = Array.from({ length: count }, () => []);
  const order = shuffle(groups, random).sort((a, b) => b.length - a.length);
  if (order[0].length > capacities[0]) throw new Error('Un groupe familial est plus grand que la taille prévue des équipes.');
  let visits = 0;
  const place = index => {
    if (index === order.length) return true;
    if (++visits > 50_000) return false;
    const tried = new Set();
    for (const teamIndex of shuffle(capacities.map((_, i) => i), random)) {
      const available = capacities[teamIndex];
      if (available < order[index].length || tried.has(available)) continue;
      tried.add(available);
      capacities[teamIndex] -= order[index].length;
      teams[teamIndex].push(...order[index]);
      if (place(index + 1)) return true;
      teams[teamIndex].splice(-order[index].length);
      capacities[teamIndex] = available;
    }
    return false;
  };
  return place(0) ? teams : null;
}

export function makeTeams(players, requestedCount, seed, links = []) {
  if (!Array.isArray(players) || players.length < 2 || players.length > 200) throw new Error('Il faut entre 2 et 200 personnes présentes pour le tirage.');
  if (!Number.isInteger(requestedCount) || requestedCount < 1 || requestedCount > players.length) throw new Error('Nombre d’équipes invalide.');
  if (!Number.isInteger(seed)) throw new Error('Graine de tirage invalide.');
  if (!Array.isArray(links)) throw new Error('Liste des liens familiaux invalide.');
  const ids = new Set(players.map(player => player.id));
  if (ids.size !== players.length || players.some(player => !player.id || !player.name || ['minor', 'woman', 'bears'].some(key => typeof player[key] !== 'boolean'))) {
    throw new Error('La liste des personnes présentes est invalide.');
  }
  const groups = linkedGroups(players, links);
  const boundIds = new Set(groups.filter(group => group.length > 1).flat().map(player => player.id));
  const random = randomFromSeed(seed);
  const total = {
    women: players.filter(player => player.woman).length,
    minors: players.filter(player => player.minor).length,
    nonBears: players.filter(player => !player.bears).length,
  };
  const target = Object.fromEntries(Object.entries(total).map(([key, count]) => [key, count / requestedCount]));
  const cost = team => {
    const counts = assessTeams([team])[0];
    return ['women', 'minors', 'nonBears'].reduce((sum, key) => {
      const difference = counts[key] - target[key];
      return sum + difference * difference;
    }, (3 - counts.distinctCriteria) * 1_000_000);
  };
  const score = teams => teams.reduce((sum, team) => sum + cost(team), 0);
  let best;
  let bestScore = Infinity;
  const attempts = players.length > 100 ? 15 : Math.min(120, Math.max(35, 3000 / players.length));
  for (let attempt = 0; attempt < attempts; attempt++) {
    const teams = links.length
      ? placeLinkedGroups(groups, requestedCount, players.length, random)
      : Array.from({ length: requestedCount }, () => []);
    if (!teams) continue;
    if (!links.length) shuffle(players, random).forEach((player, index) => teams[index % requestedCount].push(player));
    for (let pass = 0; pass < (players.length > 100 ? 12 : 20); pass++) {
      let choice;
      let improvement = 0;
      for (let a = 0; a < teams.length; a++) {
        for (let b = a + 1; b < teams.length; b++) {
          const before = cost(teams[a]) + cost(teams[b]);
          for (let x = 0; x < teams[a].length; x++) {
            if (boundIds.has(teams[a][x].id)) continue;
            for (let y = 0; y < teams[b].length; y++) {
              if (boundIds.has(teams[b][y].id)) continue;
              [teams[a][x], teams[b][y]] = [teams[b][y], teams[a][x]];
              const gain = before - cost(teams[a]) - cost(teams[b]);
              [teams[a][x], teams[b][y]] = [teams[b][y], teams[a][x]];
              if (gain > improvement + 0.000001) { improvement = gain; choice = [a, b, x, y]; }
            }
          }
        }
      }
      if (!choice) break;
      const [a, b, x, y] = choice;
      [teams[a][x], teams[b][y]] = [teams[b][y], teams[a][x]];
    }
    const currentScore = score(teams);
    if (currentScore < bestScore - 0.000001) { best = teams.map(team => [...team]); bestScore = currentScore; }
  }
  if (!best) throw new Error('Impossible de répartir ces groupes familiaux dans des équipes de cette taille. Modifiez les liens ou le nombre d’équipes.');
  return { teams: best, assessment: assessTeams(best), total, seed: seed >>> 0, links: links.map(link => ({ ...link })), revision: 0 };
}

// Une équipe n'est créée que lorsque cinq joueurs, dont trois représentants
// distincts des règles, peuvent réellement y être placés.
export function makeReadyTeams(players, requestedCount, seed, links = []) {
  if (!Array.isArray(players) || players.length > 200 || !Number.isInteger(requestedCount)
    || requestedCount < 1 || !Number.isInteger(seed) || !Array.isArray(links)) {
    throw new Error('Paramètres de simulation invalides.');
  }
  const ids = new Set(players.map(player => player.id));
  if (ids.size !== players.length || players.some(player => !player.id || !player.name
    || ['minor', 'woman', 'bears'].some(key => typeof player[key] !== 'boolean'))) {
    throw new Error('La liste des personnes présentes est invalide.');
  }
  const groups = linkedGroups(players, links);
  if (groups.some(group => group.length > 5)) {
    throw new Error('Un groupe familial dépasse cinq joueurs : modifiez les liens avant le tirage.');
  }
  const groupById = new Map(groups.flatMap(group => group.map(player => [player.id, group])));
  const random = randomFromSeed(seed);
  const limit = Math.min(requestedCount, Math.floor(players.length / 5), analyzeCapacity(players).teamsByProfiles);
  let best = [];
  const feasible = (pool, count) => count === 0 || (pool.length >= count * 5
    && matchCriteria(pool, Array.from({ length: count }, () => criteria).flat()).every(index => index !== -1));

  for (let target = limit; target > best.length; target--) {
    for (let attempt = 0; attempt < (players.length > 100 ? 12 : 35) && best.length < target; attempt++) {
      let available = [...players];
      const ready = [];
      while (ready.length < target) {
        const futureCount = target - ready.length - 1;
        let chosen = null;
        for (let pick = 0; pick < 70 && !chosen; pick++) {
          const shuffled = shuffle(available, random);
          const roles = matchCriteria(shuffled, criteria);
          if (roles.some(index => index === -1)) break;
          const selectedGroups = [...new Set(roles.map(index => groupById.get(shuffled[index].id)))];
          const base = selectedGroups.flat();
          if (base.length > 5) continue;
          const baseIds = new Set(base.map(player => player.id));
          const others = shuffle(groups.filter(group => group.every(player => available.includes(player) && !baseIds.has(player.id))), random)
            .sort((a, b) => a.filter(player => player.woman || player.minor || !player.bears).length
              - b.filter(player => player.woman || player.minor || !player.bears).length);
          let visits = 0;
          const fill = (team, start) => {
            if (team.length === 5) {
              const used = new Set(team.map(player => player.id));
              const rest = available.filter(player => !used.has(player.id));
              return feasible(rest, futureCount) ? team : null;
            }
            if (++visits > 500) return null;
            for (let index = start; index < others.length; index++) {
              if (team.length + others[index].length > 5) continue;
              const result = fill([...team, ...others[index]], index + 1);
              if (result) return result;
            }
            return null;
          };
          chosen = fill(base, 0);
        }
        if (!chosen) break;
        ready.push(chosen);
        const used = new Set(chosen.map(player => player.id));
        available = available.filter(player => !used.has(player.id));
      }
      if (ready.length > best.length) best = ready;
    }
  }
  const assigned = new Set(best.flat().map(player => player.id));
  const waiting = players.filter(player => !assigned.has(player.id));
  return { teams: best, waiting, assessment: assessTeams(best), seed: seed >>> 0,
    links: links.map(link => ({ ...link })), revision: 0 };
}

export function makeSuggestedTeams(players, requestedCount, seed, links = []) {
  if (!Array.isArray(players) || players.length > 200 || !Number.isInteger(requestedCount)
    || requestedCount < 1 || requestedCount > 200 || !Number.isInteger(seed) || !Array.isArray(links)) {
    throw new Error('Paramètres de simulation invalides.');
  }
  const ids = new Set(players.map(player => player.id));
  if (ids.size !== players.length || players.some(player => !player.id || !player.name
    || ['minor', 'woman', 'bears'].some(key => typeof player[key] !== 'boolean'))) {
    throw new Error('La liste des personnes présentes est invalide.');
  }
  const groups = linkedGroups(players, links);
  if (groups.some(group => group.length > 5)) {
    throw new Error('Un groupe familial dépasse cinq joueurs : modifiez les liens avant le tirage.');
  }
  const random = randomFromSeed(seed);
  const required = Array.from({ length: requestedCount }, () => criteria).flat();
  const matched = matchCriteria(shuffle(players, random), required);
  const upperBound = Math.min(players.length, requestedCount * 2 + matched.filter(index => index !== -1).length);
  const fits = team => team.length <= 5 && teamSlots(team).every(slot => slot.role !== 'extra');
  let best = [];

  if (!links.length) {
    const shuffled = shuffle(players, random);
    const roles = matchCriteria(shuffled, required);
    const teams = Array.from({ length: requestedCount }, () => []);
    const assigned = new Set();
    roles.forEach((playerIndex, roleIndex) => {
      if (playerIndex === -1) return;
      const player = shuffled[playerIndex];
      teams[Math.floor(roleIndex / 3)].push(player);
      assigned.add(player.id);
    });
    for (const player of shuffle(players.filter(item => !assigned.has(item.id)), random)) {
      const team = teams.find(candidate => fits([...candidate, player]));
      if (!team) continue;
      team.push(player);
      assigned.add(player.id);
    }
    best = teams;
  } else {
    for (let attempt = 0; attempt < (players.length > 100 ? 30 : 100) && best.flat().length < upperBound; attempt++) {
      const teams = Array.from({ length: requestedCount }, () => []);
      const order = shuffle(groups, random);
      if (attempt % 3 === 0) order.sort((a, b) => b.length - a.length);
      else if (attempt % 3 === 1) order.sort((a, b) => a.length - b.length);
      for (const group of order) {
        const choices = shuffle(teams.map((_, index) => index), random)
          .filter(index => fits([...teams[index], ...group]))
          .sort((a, b) => {
            const gainA = distinctCriteriaCovered([...teams[a], ...group]) - distinctCriteriaCovered(teams[a]);
            const gainB = distinctCriteriaCovered([...teams[b], ...group]) - distinctCriteriaCovered(teams[b]);
            return (gainB * 10 - teams[b].length) - (gainA * 10 - teams[a].length);
          });
        if (choices.length) teams[choices[0]].push(...group);
      }
      const placed = teams.flat().length;
      const bestPlaced = best.flat().length;
      const score = current => current.filter(team => team.length === 5 && distinctCriteriaCovered(team) === 3).length * 100
        + current.reduce((sum, team) => sum + distinctCriteriaCovered(team), 0);
      if (placed > bestPlaced || (placed === bestPlaced && score(teams) > score(best))) best = teams;
    }
  }
  const teams = best.filter(team => team.length);
  const assigned = new Set(teams.flat().map(player => player.id));
  return { teams, waiting: players.filter(player => !assigned.has(player.id)), assessment: assessTeams(teams),
    seed: seed >>> 0, links: links.map(link => ({ ...link })), revision: 0 };
}

export function swapPlayers(draw, firstId, secondId) {
  const teams = draw.teams.map(team => [...team]);
  const firstTeam = teams.findIndex(team => team.some(player => player.id === firstId));
  const secondTeam = teams.findIndex(team => team.some(player => player.id === secondId));
  if (firstTeam < 0 || secondTeam < 0 || firstTeam === secondTeam) throw new Error('Choisissez deux joueurs de deux équipes différentes.');
  const firstIndex = teams[firstTeam].findIndex(player => player.id === firstId);
  const secondIndex = teams[secondTeam].findIndex(player => player.id === secondId);
  [teams[firstTeam][firstIndex], teams[secondTeam][secondIndex]] = [teams[secondTeam][secondIndex], teams[firstTeam][firstIndex]];
  for (const link of draw.links || []) {
    if (!teams.some(team => team.some(player => player.id === link.childId) && team.some(player => player.id === link.relativeId))) {
      throw new Error('Échange refusé : il séparerait un enfant du proche choisi.');
    }
  }
  const assessment = assessTeams(teams);
  for (const index of [firstTeam, secondTeam]) {
    const before = draw.assessment[index];
    const after = assessment[index];
    if (['women', 'minors', 'nonBears'].some(key => before[key] > 0 && after[key] === 0)) {
      throw new Error('Échange refusé : une équipe perdrait un profil déjà représenté.');
    }
  }
  if ([firstTeam, secondTeam].some(index => assessment[index].distinctCriteria < draw.assessment[index].distinctCriteria)) {
    throw new Error('Échange refusé : une équipe perdrait un des trois critères attribués à des joueurs différents.');
  }
  return { ...draw, teams, assessment, revision: (draw.revision || 0) + 1 };
}
