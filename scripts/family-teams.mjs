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

export function assessTeams(teams) {
  return teams.map((players, index) => ({
    number: index + 1,
    size: players.length,
    women: players.filter(player => player.woman).length,
    minors: players.filter(player => player.minor).length,
    nonBears: players.filter(player => !player.bears).length,
  }));
}

export function makeTeams(players, requestedCount, seed) {
  if (!Array.isArray(players) || players.length < 2 || players.length > 200) throw new Error('Il faut entre 2 et 200 personnes présentes pour le tirage.');
  if (!Number.isInteger(requestedCount) || requestedCount < 1 || requestedCount > players.length) throw new Error('Nombre d’équipes invalide.');
  if (!Number.isInteger(seed)) throw new Error('Graine de tirage invalide.');
  const ids = new Set(players.map(player => player.id));
  if (ids.size !== players.length || players.some(player => !player.id || !player.name || ['minor', 'woman', 'bears'].some(key => typeof player[key] !== 'boolean'))) {
    throw new Error('La liste des personnes présentes est invalide.');
  }
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
      return sum + (counts[key] === 0 ? 1000 : 0) + difference * difference;
    }, 0);
  };
  const score = teams => teams.reduce((sum, team) => sum + cost(team), 0);
  let best;
  let bestScore = Infinity;
  const attempts = players.length > 100 ? 15 : Math.min(120, Math.max(35, 3000 / players.length));
  for (let attempt = 0; attempt < attempts; attempt++) {
    const shuffled = shuffle(players, random);
    const teams = Array.from({ length: requestedCount }, () => []);
    shuffled.forEach((player, index) => teams[index % requestedCount].push(player));
    for (let pass = 0; pass < (players.length > 100 ? 12 : 20); pass++) {
      let choice;
      let improvement = 0;
      for (let a = 0; a < teams.length; a++) {
        for (let b = a + 1; b < teams.length; b++) {
          const before = cost(teams[a]) + cost(teams[b]);
          for (let x = 0; x < teams[a].length; x++) {
            for (let y = 0; y < teams[b].length; y++) {
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
  return { teams: best, assessment: assessTeams(best), total, seed: seed >>> 0 };
}
