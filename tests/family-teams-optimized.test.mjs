import test from 'node:test';
import assert from 'node:assert/strict';
import { makeOptimizedTeams, optimizationScore, assessTeams, teamSlots, teamExceptions, swapPlayers, placeWaitingPlayer } from '../scripts/family-teams.mjs';

const person = (id, woman = false, minor = false, bears = true) => ({ id: String(id), name: `Personne ${id}`, woman, minor, bears });
const currentProfiles = () => [
  ...Array.from({ length: 19 }, (_, i) => person(i + 1)),
  ...Array.from({ length: 5 }, (_, i) => person(i + 20, false, true)),
  ...Array.from({ length: 3 }, (_, i) => person(i + 25, true, false, false)),
  ...Array.from({ length: 3 }, (_, i) => person(i + 28, false, false, false)),
];
const lexicographic = (a, b) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
};

test('30 profils actuels : cinq équipes de six et quatre dérogations réparties, pour plusieurs graines', () => {
  const players = currentProfiles();
  for (const seed of [1, 42, 20261018, 987654]) {
    const draw = makeOptimizedTeams(players, 5, seed);
    assert.equal(draw.waiting.length, 0);
    assert.equal(new Set(draw.teams.flat().map(player => player.id)).size, 30);
    assert.deepEqual(draw.assessment.map(team => team.size), [6, 6, 6, 6, 6]);
    assert.deepEqual(draw.assessment.map(team => 3 - team.distinctCriteria).sort(), [0, 1, 1, 1, 1]);
    assert.ok(draw.assessment.every(team => team.minors === 1 && team.nonBears >= 1));
    assert.deepEqual(draw.assessment.map(team => team.women).sort(), [0, 0, 1, 1, 1]);
    assert.equal(draw.optimization.lowerBound, 4);
    assert.equal(draw.optimization.minimumReached, true);
    for (const team of draw.teams) {
      const slots = teamSlots(team, 6, true);
      assert.equal(slots.length, 6);
      assert.equal(new Set(slots.map(slot => slot.player.id)).size, 6);
    }
  }
});

test('reproductibilité, sans mutation de la liste ni des liens', () => {
  const players = currentProfiles();
  const links = [{ childId: '25', relativeId: '1' }, { childId: '20', relativeId: '1' }];
  const before = structuredClone({ players, links });
  const draw = makeOptimizedTeams(players, 5, 42, links);
  assert.deepEqual(draw, makeOptimizedTeams(players, 5, 42, links));
  assert.deepEqual({ players, links }, before);
  assert.equal(draw.waiting.length, 0);
  assert.ok(draw.teams.some(team => ['25', '20', '1'].every(id => team.some(player => player.id === id))));
});

test('le score correspond à la meilleure partition exhaustive d’un petit effectif', () => {
  const players = [person(1, true, true, false), person(2, true, false, false), person(3, false, true),
    person(4, false, false, false), person(5), person(6), person(7), person(8)];
  let optimum;
  for (let mask = 1; mask < (1 << players.length) - 1; mask++) {
    const teams = [players.filter((_, i) => mask & (1 << i)), players.filter((_, i) => !(mask & (1 << i)))];
    if (teams.some(team => team.length > 5)) continue;
    const score = optimizationScore(teams);
    if (!optimum || lexicographic(score, optimum) < 0) optimum = score;
  }
  assert.deepEqual(makeOptimizedTeams(players, 2, 17, [], 5).optimization.score, optimum);
});

test('effectif incomplet, capacité insuffisante et liens restent explicites', () => {
  const players = Array.from({ length: 13 }, (_, i) => person(i + 1, i === 0, i === 1));
  const draw = makeOptimizedTeams(players, 2, 7, [{ childId: '1', relativeId: '2' }]);
  assert.equal(draw.teams.flat().length, 12);
  assert.equal(draw.waiting.length, 1);
  assert.ok(draw.teams.some(team => ['1', '2'].every(id => team.some(player => player.id === id))));
  const short = makeOptimizedTeams(players.slice(0, 11), 2, 7);
  assert.equal(short.waiting.length, 0);
  assert.deepEqual(short.teams.map(team => team.length).sort(), [5, 6]);
  assert.equal(makeOptimizedTeams([], 1, 7).teams.length, 0);
});

test('groupe impossible : aucune séparation silencieuse, y compris les liens transitifs', () => {
  const players = Array.from({ length: 7 }, (_, i) => person(i + 1, true));
  const links = players.slice(1).map(player => ({ childId: player.id, relativeId: '1' }));
  assert.throws(() => makeOptimizedTeams(players, 2, 1, links), /groupe lié dépasse 6/);
  assert.throws(() => makeOptimizedTeams([person(1), person(2)], 1, 1, [{ childId: '1', relativeId: '2' }]), /Lien familial invalide/);
});

test('placement dérogatoire : confirmation requise, puis six joueurs visibles et profil inchangé', () => {
  const team = [person(1, false, true), person(2, false, false, false), person(3), person(4), person(5)];
  const waiting = [person(6), person(7)];
  const draw = { teams: [team], waiting, assessment: assessTeams([team]), teamSize: 6, links: [] };
  assert.equal(teamSlots(team, 6, true)[0].player, null);
  assert.throws(() => placeWaitingPlayer(draw, '6', 0, 0), error => error.code === 'CONFIRM_PLACEMENT');
  const changed = placeWaitingPlayer(draw, '6', 0, 0, { force: true });
  assert.equal(changed.teams[0].length, 6);
  assert.equal(changed.waiting.length, 1);
  assert.deepEqual(changed.teams[0].find(player => player.id === '6'), waiting[0]);
  assert.equal(teamSlots(changed.teams[0], 6, true)[0].valid, false);
  assert.match(teamExceptions(changed.teams[0]).join(), /Femme/);
  assert.equal(draw.teams[0].length, 5);
  assert.throws(() => placeWaitingPlayer(changed, '7', 0, 0, { force: true }), /non complète/);
});

test('un échange forcé autorise une perte de critère, mais conserve les liens avec une femme', () => {
  const teams = [[person(1, true), person(2, false, true), person(3, false, false, false), person(4), person(5), person(6)],
    [person(7), person(8), person(9), person(10), person(11), person(12)]];
  const draw = { teams, waiting: [], assessment: assessTeams(teams), teamSize: 6, links: [] };
  assert.throws(() => swapPlayers(draw, '1', '7'), error => error.code === 'CONFIRM_PLACEMENT');
  const changed = swapPlayers(draw, '1', '7', { force: true });
  assert.equal(changed.assessment[0].women, 0);
  assert.equal(draw.assessment[0].women, 1);
  assert.throws(() => swapPlayers({ ...draw, links: [{ childId: '1', relativeId: '4' }] }, '1', '7', { force: true }), /proche/);
});
