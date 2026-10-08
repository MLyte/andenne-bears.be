import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeCapacity, parseRegistrationCsv, assessTeams, makeReadyTeams, makeSuggestedTeams, makeTeams, swapPlayers, teamSlots } from '../scripts/family-teams.mjs';

const person = (id, woman, minor, bears) => ({ id: String(id), name: `Personne ${id}`, woman, minor, bears });

test('importe les critères indépendants, même quand ils se recoupent', () => {
  const csv = '\uFEFFreference;nom;flag;mineur;joueur_bears;femme;email_contact\r\nA1;"Nom; Test";oui;oui;oui;oui;secret@example.invalid\r\nA2;Spectateur;non;non;non;non;autre@example.invalid\r\n';
  assert.deepEqual(parseRegistrationCsv(csv), [{ id: 'A1', name: 'Nom; Test', minor: true, bears: true, woman: true, present: true }]);
});

test('refuse une ancienne inscription sans réponse femme', () => {
  assert.throws(() => parseRegistrationCsv('reference;nom;flag;mineur;joueur_bears;femme\nA1;Test;oui;oui;non;\n'), /incomplètes/);
});

test('répartit chaque personne une seule fois et couvre les trois minima quand possible', () => {
  const players = [
    person(1, true, true, true), person(2, false, true, true), person(3, false, false, false), person(4, false, false, true), person(5, false, false, true),
    person(6, true, true, true), person(7, false, true, true), person(8, false, false, false), person(9, false, false, true), person(10, false, false, true),
  ];
  const first = makeTeams(players, 2, 12345);
  assert.deepEqual(first.teams.map(team => team.length), [5, 5]);
  assert.deepEqual(new Set(first.teams.flat().map(player => player.id)).size, 10);
  assert.ok(first.assessment.every(team => team.distinctCriteria === 3));
  assert.deepEqual(first.teams.map(team => team.map(player => player.id)), makeTeams(players, 2, 12345).teams.map(team => team.map(player => player.id)));
  const ready = makeReadyTeams(players, 2, 12345);
  assert.equal(ready.teams.length, 2);
  assert.equal(ready.waiting.length, 0);
});

test('un seul joueur ne peut pas représenter les trois critères', () => {
  const team = [person(1, true, true, false), ...[2, 3, 4, 5].map(id => person(id, false, false, true))];
  assert.equal(assessTeams([team])[0].distinctCriteria, 1);
  assert.equal(makeTeams(team, 1, 1).assessment[0].distinctCriteria, 1);
});

test('les critères peuvent être attribués à trois joueurs distincts même si leurs profils se recoupent', () => {
  const team = [person(1, true, true, true), person(2, false, true, true), person(3, false, false, false), person(4, false, false, true), person(5, false, false, true)];
  assert.equal(assessTeams([team])[0].distinctCriteria, 3);
});

test('signale les minima manquants quand les effectifs sont insuffisants', () => {
  const draw = makeTeams([person(1, true, false, true), person(2, false, true, true), person(3, false, false, false), person(4, false, false, true), person(5, false, false, true), person(6, false, false, true)], 2, 1);
  assert.equal(draw.teams.flat().length, 6);
  assert.equal(draw.assessment.filter(team => team.women === 0).length, 1);
  assert.equal(draw.assessment.filter(team => team.minors === 0).length, 1);
  assert.equal(draw.assessment.filter(team => team.nonBears === 0).length, 1);
});

test('place un enfant avec le proche choisi et conserve trois représentants distincts', () => {
  const players = [
    person(1, false, true, true), person(2, false, false, true), person(3, true, false, true), person(4, false, false, false), person(5, false, false, true),
    person(6, false, true, true), person(7, false, false, true), person(8, true, false, true), person(9, false, false, false), person(10, false, false, true),
  ];
  const links = [{ childId: '1', relativeId: '2' }, { childId: '6', relativeId: '7' }];
  const draw = makeTeams(players, 2, 12345, links);
  assert.deepEqual(draw.teams.map(team => team.length), [5, 5]);
  assert.ok(links.every(link => draw.teams.some(team => team.some(player => player.id === link.childId) && team.some(player => player.id === link.relativeId))));
  assert.ok(draw.assessment.every(team => team.distinctCriteria === 3));
});

test('refuse un échange qui sépare un enfant de son proche', () => {
  const players = [person(1, false, true, true), person(2, false, false, true), person(3, true, false, true), person(4, false, false, false), person(5, false, false, true), person(6, false, true, true), person(7, false, false, true), person(8, true, false, true), person(9, false, false, false), person(10, false, false, true)];
  const draw = makeTeams(players, 2, 12345, [{ childId: '1', relativeId: '2' }]);
  const other = draw.teams.find(team => !team.some(player => player.id === '1'))[0];
  assert.throws(() => swapPlayers(draw, '1', other.id), /séparerait un enfant/);
});

test('garde deux enfants avec le même proche et refuse un groupe trop grand', () => {
  const players = [person(1, false, true, true), person(2, false, true, true), person(3, true, false, true), person(4, false, false, false), person(5, false, false, true), person(6, true, false, true), person(7, false, true, true), person(8, false, false, false), person(9, false, false, true), person(10, false, false, true)];
  const links = [{ childId: '1', relativeId: '3' }, { childId: '2', relativeId: '3' }];
  const draw = makeTeams(players, 2, 12345, links);
  assert.ok(draw.teams.some(team => ['1', '2', '3'].every(id => team.some(player => player.id === id))));
  assert.throws(() => makeTeams(players, 5, 12345, links), /groupe familial est plus grand/);
});

test('autorise un échange valide et refuse de perdre un critère distinct', () => {
  const players = [
    person(1, true, false, true), person(2, false, true, true), person(3, false, false, false), person(4, false, false, true), person(5, false, false, true),
    person(6, true, false, true), person(7, false, true, true), person(8, false, false, false), person(9, false, false, true), person(10, false, false, true),
  ];
  const draw = makeTeams(players, 2, 12345);
  const first = draw.teams[0].find(player => !player.woman && !player.minor && player.bears);
  const second = draw.teams[1].find(player => !player.woman && !player.minor && player.bears);
  const changed = swapPlayers(draw, first.id, second.id);
  assert.equal(changed.revision, 1);
  assert.ok(changed.assessment.every(team => team.distinctCriteria === 3));
  const woman = changed.teams[0].find(player => player.woman);
  const other = changed.teams[1].find(player => !player.woman && !player.minor && player.bears);
  assert.throws(() => swapPlayers(changed, woman.id, other.id), /perdrait un profil déjà représenté/);
});

test('affiche trois cases de règles avec trois personnes distinctes, puis deux places libres', () => {
  const players = [person(1, true, true, true), person(2, false, true, true), person(3, false, false, false), person(4, false, false, true)];
  const slots = teamSlots(players);
  assert.deepEqual(slots.map(slot => slot.role), ['woman', 'minor', 'nonBears', 'free', 'free']);
  assert.deepEqual(slots.slice(0, 3).map(slot => slot.valid), [true, true, true]);
  assert.equal(new Set(slots.filter(slot => slot.player).map(slot => slot.player.id)).size, 4);
  assert.equal(slots.filter(slot => !slot.player).length, 1);
});

test('ne met aucun joueur non admissible dans une case de règle', () => {
  const slots = teamSlots([person(1, false, true, true), person(2, false, false, true)]);
  assert.equal(slots[0].player, null);
  assert.equal(slots[2].player, null);
  assert.deepEqual(slots.filter(slot => slot.player).map(slot => slot.player.id).sort(), ['1', '2']);
});

test('suggère des équipes incomplètes et laisse vides les cases de règle sans profil admissible', () => {
  const players = [
    person(1, true, false, true), person(2, false, true, true), person(3, false, false, false),
    ...Array.from({ length: 13 }, (_, index) => person(index + 4, false, false, true)),
  ];
  const draw = makeSuggestedTeams(players, 4, 2026);
  assert.equal(draw.teams.length, 4);
  assert.equal(draw.teams.flat().length, 11);
  assert.equal(draw.waiting.length, 5);
  assert.equal(draw.assessment.filter(team => team.size === 5 && team.distinctCriteria === 3).length, 1);
  for (const team of draw.teams) {
    const slots = teamSlots(team);
    assert.equal(slots.length, 5);
    assert.equal(slots.filter(slot => slot.player).length, team.length);
    assert.ok(slots.slice(0, 3).every(slot => !slot.player || slot.valid));
  }
});

test('place les 16 joueurs quand les profils permettent huit cases de règle distinctes', () => {
  const players = [
    ...Array.from({ length: 3 }, (_, index) => person(index + 1, true, false, true)),
    ...Array.from({ length: 4 }, (_, index) => person(index + 4, false, true, true)),
    person(8, false, false, false),
    ...Array.from({ length: 8 }, (_, index) => person(index + 9, false, false, true)),
  ];
  const draw = makeSuggestedTeams(players, 4, 1234);
  assert.equal(draw.waiting.length, 0);
  assert.equal(draw.teams.flat().length, 16);
  assert.ok(draw.teams.every(team => teamSlots(team).length === 5));
  assert.equal(new Set(draw.teams.flat().map(player => player.id)).size, 16);
});

test('ne sépare pas un groupe familial dans les équipes suggérées', () => {
  const players = [
    person(1, true, false, true), person(2, false, true, true), person(3, false, false, false),
    person(4, false, true, true), person(5, false, false, true), person(6, false, false, true),
    person(7, false, false, true),
  ];
  const draw = makeSuggestedTeams(players, 2, 77, [{ childId: '4', relativeId: '5' }]);
  const group = team => team.some(player => player.id === '4') === team.some(player => player.id === '5');
  assert.ok(draw.teams.every(group));
  assert.ok(group(draw.waiting));
  assert.ok(draw.teams.every(team => teamSlots(team).length === 5));
});

test('crée seulement les équipes conformes et place tous les autres joueurs en attente', () => {
  const players = [
    person(1, true, false, true), person(2, false, true, true), person(3, false, false, false),
    ...Array.from({ length: 13 }, (_, index) => person(index + 4, false, false, true)),
  ];
  const draw = makeReadyTeams(players, 4, 2026);
  assert.equal(draw.teams.length, 1);
  assert.equal(draw.waiting.length, 11);
  assert.equal(draw.assessment[0].size, 5);
  assert.equal(draw.assessment[0].distinctCriteria, 3);
  assert.equal(new Set([...draw.teams.flat(), ...draw.waiting].map(player => player.id)).size, 16);
  assert.ok(teamSlots(draw.teams[0]).slice(0, 3).every(slot => slot.valid && slot.player));
});

test('attend les profils manquants avant de créer une équipe et garde les proches ensemble', () => {
  const players = [
    person(1, true, false, true), person(2, false, true, true), person(3, false, false, false),
    person(4, false, false, true), person(5, false, false, true),
    person(6, false, true, true), person(7, false, false, true),
  ];
  const links = [{ childId: '6', relativeId: '7' }];
  const draw = makeReadyTeams(players, 2, 7, links);
  assert.equal(draw.teams.length, 1);
  const location = id => draw.teams.findIndex(team => team.some(player => player.id === id));
  assert.equal(location('6'), location('7'));
  assert.equal(makeReadyTeams(players.slice(3), 1, 7).teams.length, 0);
});

test('garde une équipe conforme quand les liens familiaux empêchent de former la seconde', () => {
  const players = [
    person(1, true, true, true), person(2, true, false, false),
    person(3, false, true, true), person(4, false, true, true), person(5, false, true, true),
    person(6, false, true, true), person(7, false, false, false),
    person(8, false, false, true), person(9, false, false, true), person(10, false, false, true),
  ];
  const links = [1, 3, 4, 5].map(id => ({ childId: String(id), relativeId: '2' }));
  const draw = makeReadyTeams(players, 2, 99, links);
  assert.equal(draw.teams.length, 1);
  assert.equal(draw.waiting.length, 5);
  assert.ok(draw.teams[0].some(player => player.id === '2'));
  assert.equal(draw.assessment[0].distinctCriteria, 3);
});

test('calcule les besoins critiques du prochain seuil sans compter une personne deux fois', () => {
  const players = [
    ...Array.from({ length: 11 }, (_, i) => person(i + 1, false, false, true)),
    ...Array.from({ length: 4 }, (_, i) => person(i + 12, false, true, true)),
    person(16, false, false, false),
  ];
  const analysis = analyzeCapacity(players);
  assert.equal(analysis.teamsBySize, 3);
  assert.equal(analysis.teamsByProfiles, 0);
  assert.equal(analysis.nextTeams, 4);
  assert.equal(analysis.placesNeeded, 4);
  assert.equal(analysis.womenNeeded, 4);
  assert.equal(analysis.nonBearsNeeded, 3);
  assert.equal(analysis.minimumNewPeople, 7);
  const simulation = makeReadyTeams(players, 4, 2026);
  assert.equal(simulation.teams.length, 0);
  assert.equal(simulation.waiting.length, 16);
});
