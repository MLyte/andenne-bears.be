const status = document.getElementById('members-tournament-status');
const list = document.getElementById('members-tournament-list');

async function showTournamentRanking() {
  try {
    const response = await fetch('tournoi-public.php', { cache: 'no-store' });
    if (!response.ok) throw new Error('Scores indisponibles');
    const data = await response.json();
    const scores = data.scores;
    const finals = data.finals;
    if (!data.ready || !Array.isArray(data.teams) || data.teams.length !== 6 ||
        !Array.isArray(scores) || scores.length !== 18 ||
        !Array.isArray(finals) || finals.length !== 3) {
      status.textContent = 'Le classement final n’est pas encore disponible.';
      return;
    }

    const order = [];
    for (const index of [2, 1, 0]) {
      const pair = finals[index];
      const score = scores[15 + index];
      if (!Array.isArray(pair) || pair.length !== 2 || !Array.isArray(score) ||
          score.length !== 2 || !score.every(Number.isInteger) || score[0] === score[1] ||
          !pair.every(id => Number.isInteger(id) && id >= 0 && id < 6)) {
        status.textContent = 'Le classement final n’est pas encore disponible.';
        return;
      }
      const winner = score[0] > score[1] ? 0 : 1;
      order.push(pair[winner], pair[1 - winner]);
    }
    if (new Set(order).size !== 6) throw new Error('Classement incomplet');

    list.replaceChildren(...order.map(id => {
      const item = document.createElement('li');
      item.textContent = data.teams[id].name || `Équipe ${id + 1}`;
      return item;
    }));
    list.hidden = false;
    status.hidden = true;
  } catch {
    status.textContent = 'Le classement est momentanément indisponible.';
  }
}

if (status && list) showTournamentRanking();
