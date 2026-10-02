import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRegistrationCsv, makeTeams } from '../scripts/family-teams.mjs';

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
    person(1, true, true, false), person(2, false, false, true), person(3, false, false, true), person(4, false, false, true), person(5, false, false, true),
    person(6, true, true, false), person(7, false, false, true), person(8, false, false, true), person(9, false, false, true), person(10, false, false, true),
  ];
  const first = makeTeams(players, 2, 12345);
  assert.deepEqual(first.teams.map(team => team.length), [5, 5]);
  assert.deepEqual(new Set(first.teams.flat().map(player => player.id)).size, 10);
  assert.ok(first.assessment.every(team => team.women >= 1 && team.minors >= 1 && team.nonBears >= 1));
  assert.deepEqual(first.teams.map(team => team.map(player => player.id)), makeTeams(players, 2, 12345).teams.map(team => team.map(player => player.id)));
});

test('signale les minima manquants quand les effectifs sont insuffisants', () => {
  const draw = makeTeams([person(1, true, false, true), person(2, false, true, true), person(3, false, false, false), person(4, false, false, true), person(5, false, false, true), person(6, false, false, true)], 2, 1);
  assert.equal(draw.teams.flat().length, 6);
  assert.equal(draw.assessment.filter(team => team.women === 0).length, 1);
  assert.equal(draw.assessment.filter(team => team.minors === 0).length, 1);
  assert.equal(draw.assessment.filter(team => team.nonBears === 0).length, 1);
});
