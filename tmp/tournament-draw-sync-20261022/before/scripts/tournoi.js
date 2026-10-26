import { schedule } from './tournoi-schedule.js?v=1';
const $ = id => document.getElementById(id);
let data, busy = false, dirty = false;
const node = (tag, text) => { const e = document.createElement(tag); e.textContent = text; return e; };
function status(text, error = false) { $('status').textContent = text; $('status').classList.toggle('error', error); }
async function request(payload) {
  const response = await fetch('tournoi-api.php', { credentials: 'same-origin', cache: 'no-store', ...(payload ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, csrf: data.csrf, version: data.version }) } : {}) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Enregistrement impossible.');
  return result;
}
async function save(payload) {
  if (busy) return;
  const submitted = payload.action === 'score' ? `match-${payload.match}` : payload.action;
  const pending = [...document.querySelectorAll('form[data-dirty]')].filter(f => f.id !== submitted).map(f => [f.id, Object.fromEntries(new FormData(f))]);
  busy = true;
  const disabled = [...document.querySelectorAll('button,input,select')].map(b => [b, b.disabled]);
  disabled.forEach(([b]) => { b.disabled = true; });
  status('Enregistrement en cours…');
  try {
    data = await request(payload); dirty = false; render();
    document.querySelectorAll('form[data-dirty]').forEach(f => delete f.dataset.dirty);
    for (const [id, values] of pending) {
      const form = $(id); if (!form) continue;
      for (const [key, value] of Object.entries(values)) if (form.elements[key]) form.elements[key].value = value;
      form.dataset.dirty = 'true'; dirty = true;
    }
    status(`Enregistré dans l’espace organisateur.${dirty ? ' D’autres champs modifiés restent à enregistrer.' : ''}`);
  }
  catch (error) { status(error.message, true); }
  finally { busy = false; disabled.forEach(([b, value]) => { if (b.isConnected) b.disabled = value; }); $('validate').disabled = !$('accept').checked; }
}
const clock = minutes => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
function render() {
  $('content').hidden = false;
  const state = data.state, teams = state?.teams || data.preview;
  $('validation').hidden = !!state; $('live').hidden = !state;
  $('teams').replaceChildren(...teams.map(team => {
    const card = document.createElement('article'), list = document.createElement('ul');
    list.append(...team.players.map(p => node('li', p.name)));
    card.append(node('h3', `${team.name} · ${team.players.length} joueurs`), list);
    for (const exception of team.exceptions) { const p = node('p', `Dérogation : ${exception}`); p.className = 'exception'; card.append(p); }
    return card;
  }));
  if (!state) return;
  for (const [key, value] of Object.entries(state.settings)) $('settings').elements[key].value = value;
  const planning = schedule(state.settings, data.matches);
  $('timing').textContent = `18 matchs · ${6 * state.settings.minutes} minutes de jeu par équipe · début ${state.settings.start} · fin prévisionnelle ${clock(planning.end)}. ${planning.end > 13 * 60 ? 'Attention : ce planning dépasse le repas annoncé à 13 h.' : 'Le planning tient avant le repas annoncé à 13 h.'} Prévoir le briefing avant le premier match.`;
  const count = state.scores.slice(0, 15).filter(s => s !== null).length;
  $('progress').textContent = `${count}/15 rencontres de championnat enregistrées.`;
  const standings = [...data.standings];
  if (state.tieOrder) standings.sort((a,b) => b.points-a.points || (b.for-b.against)-(a.for-a.against) || b.for-a.for || state.tieOrder.indexOf(a.id)-state.tieOrder.indexOf(b.id));
  $('standings').replaceChildren(...standings.map((r, index) => {
    const tr = document.createElement('tr');
    tr.append(...[index + 1, teams[r.id].name, r.played, r.wins, r.draws, r.losses, r.for, r.against, r.for-r.against, r.points].map(v => node('td', v))); return tr;
  }));
  $('ties').hidden = count !== 15 || !!data.finals;
  const pairs = [...data.matches, ...(data.finals || [null,null,null])];
  const labels = ['5e / 6e place','3e / 4e place','Finale'];
  $('matches').replaceChildren(...pairs.map((pair, id) => {
    const form = document.createElement('form'); form.className = 'match'; form.id = `match-${id}`;
    const slot = planning.slots[id];
    const title = id < 15 ? `Match ${id + 1} · tour ${Math.floor(id / 3)+1}` : labels[id-15];
    form.append(node('p', `${clock(slot.time)} · terrain ${slot.field} · ${title} — ${pair ? pair.map(i => teams[i].name).join(' / ') : 'En attente du classement départagé'}`));
    if (!pair) return form;
    pair.forEach((team, side) => {
      const label = node('label', teams[team].name), input = document.createElement('input');
      Object.assign(input, { type: 'number', min: '0', max: '200', step: '1', required: true, name: `score${side}`, value: state.scores[id]?.[side] ?? '' });
      input.setAttribute('aria-label', `${title}, score ${teams[team].name}`); label.append(input); form.append(label);
    });
    const button = node('button', 'Enregistrer'); button.className = 'button'; button.type = 'submit'; form.append(button);
    const saved = state.scores[id];
    form.append(node('span', saved ? `Enregistré : ${saved[0]}–${saved[1]}` : 'À jouer'));
    if (saved) {
      const clear = node('button', 'Effacer le score'); clear.type = 'button'; clear.className = 'button';
      clear.addEventListener('click', () => { if (confirm(`Effacer le résultat de ${title} ?`)) save({ action: 'score', match: id, score: null }); }); form.append(clear);
    }
    form.addEventListener('submit', event => { event.preventDefault(); save({ action: 'score', match: id, score: [Number(form.elements.score0.value), Number(form.elements.score1.value)] }); });
    return form;
  }));
  $('podium').replaceChildren();
  if (!data.finals || state.scores.slice(15).some(s => s === null)) $('podium').append(node('li', 'Le classement final apparaîtra après les trois matchs de classement.'));
  else {
    for (const i of [2,1,0]) {
      const pair = data.finals[i], scores = state.scores[15+i], winner = scores[0] > scores[1] ? 0 : 1;
      $('podium').append(node('li', teams[pair[winner]].name), node('li', teams[pair[1-winner]].name));
    }
  }
}
$('accept').addEventListener('change', () => { $('validate').disabled = !$('accept').checked; });
$('validate').addEventListener('click', () => save({ action: 'validate', acceptExceptions: $('accept').checked }));
$('settings').addEventListener('submit', event => {
  event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget));
  for (const key of ['minutes','transition','fields','break']) values[key] = Number(values[key]);
  save({ action: 'settings', settings: values });
});
$('three-fields').addEventListener('click', () => {
  const settings = { start: '09:15', minutes: 20, transition: 10, fields: 3, break: 15 };
  for (const [key, value] of Object.entries(settings)) $('settings').elements[key].value = value;
  $('settings').dataset.dirty = 'true'; dirty = true;
  status('Planning trois terrains préparé. Clique sur « Enregistrer les horaires » pour l’appliquer.');
});
$('ties').addEventListener('submit', event => { event.preventDefault(); save({ action: 'ties', order: event.currentTarget.elements.order.value.split(',').map(v => Number(v.trim())-1) }); });
$('print').addEventListener('click', () => window.print());
document.addEventListener('input', event => { if (event.target.closest('#live')) { dirty = true; const form = event.target.closest('form'); if (form) form.dataset.dirty = 'true'; } });
window.addEventListener('beforeunload', event => { if (dirty || busy) { event.preventDefault(); event.returnValue = ''; } });
try { data = await request(); render(); status(data.state ? 'Équipes validées. Les résultats enregistrés sont chargés.' : 'Vérifie les équipes et les dérogations, puis valide pour ouvrir les scores.'); }
catch (error) { status(error.message, true); }
