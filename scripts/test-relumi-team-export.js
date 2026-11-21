#!/usr/bin/env node
'use strict';

// Focused tests for the fork-specific in-game team export module.
// The module is a browser IIFE, so it runs in a minimal vm sandbox with the
// globals the calculator page provides (window, localStorage, setdex).

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sourcePath = path.join(__dirname, '..', 'src', 'js', 'relumi-team-export.js');
const source = fs.readFileSync(sourcePath, 'utf8');

function makeSet(overrides) {
  return Object.assign({
    level: 100,
    abilities: ['Static'],
    items: [],
    moves: [],
    nature: 'Hardy',
  }, overrides);
}

function loadModule(sandbox) {
  sandbox.window = sandbox;
  sandbox.console = console;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, {filename: sourcePath});
  if (typeof sandbox.initRelumiTeamExportData !== 'function') {
    throw new Error('relumi-team-export.js did not expose initRelumiTeamExportData');
  }
  sandbox.initRelumiTeamExportData();
  return sandbox;
}

const tests = [];
function test(name, fn) {
  tests.push({name, fn});
}

test('exports an in-game team in Showdown paste format', () => {
  const sandbox = loadModule({
    localStorage: {},
    RELUMI_INGAME_TEAMS: {
      Pikachu: {
        7: makeSet({
          level: 50,
          items: ['Light Ball'],
          evs: {hp: 4, at: 0, df: 0, sa: 252, sd: 0, sp: 0},
          ivs: {hp: 31, at: 0, df: 31, sa: 31, sd: 31, sp: 31},
          moves: ['Thunderbolt', 'Quick Attack'],
        }),
      },
      Garchomp: {7: makeSet({abilities: ['Rough Skin'], moves: ['Earthquake']})},
    },
    RELUMI_INGAME_TRAINER_TEAMS: {7: ['Pikachu', 'Garchomp']},
  });

  assert.strictEqual(sandbox.exportInGameTeamText('7'), [
    'Pikachu @ Light Ball',
    'Ability: Static',
    'Level: 50',
    'EVs: 4 HP / 252 SpA',
    'Hardy Nature',
    'IVs: 0 Atk',
    '- Thunderbolt',
    '- Quick Attack',
    '',
    'Garchomp',
    'Ability: Rough Skin',
    'Hardy Nature',
    '- Earthquake',
  ].join('\n'));
});

test('normalizes cosmetic formes in sets and trainer rosters', () => {
  const sandbox = loadModule({
    localStorage: {},
    RELUMI_INGAME_TEAMS: {
      'Minior-Red': {1: makeSet({moves: ['Tackle']})},
      'Minior-Blue': {1: makeSet({moves: ['Tackle']})},
      Pikachu: {1: makeSet({moves: ['Thunder Shock']})},
    },
    RELUMI_INGAME_TRAINER_TEAMS: {1: ['Minior-Red', 'Minior-Blue', 'Pikachu']},
  });

  // Compare as JSON: values created inside the vm context have foreign prototypes.
  assert.strictEqual(JSON.stringify(sandbox.RELUMI_INGAME_TRAINER_TEAMS[1]), '["Minior","Pikachu"]');
  assert.ok(sandbox.RELUMI_INGAME_TEAMS.Minior);
  assert.strictEqual(sandbox.RELUMI_INGAME_TEAMS['Minior-Red'], undefined);
  // The collapsed roster still exports the single shared Minior set.
  assert.ok(sandbox.exportInGameTeamText('1').indexOf('- Tackle') !== -1);
});

test('custom sets take precedence over generated trainer sets', () => {
  const customSet = {
    isCustomSet: true,
    trainerId: 'Team Rocket',
    teamSlot: 1,
    level: 50,
    ability: 'Static',
    item: '',
    evs: {hp: 0, at: 0, df: 0, sa: 0, sd: 0, sp: 0},
    moves: ['Volt Tackle'],
    nature: 'Adamant',
  };
  const sandbox = loadModule({
    localStorage: {
      customsets: JSON.stringify({
        Pikachu: {'Team Rocket': customSet},
      }),
    },
    RELUMI_INGAME_TEAMS: {
      Pikachu: {'Team Rocket': makeSet({moves: ['Thunder Shock']})},
    },
    RELUMI_INGAME_TRAINER_TEAMS: {'Team Rocket': ['Pikachu']},
  });
  sandbox.setdex = {Pikachu: {'Team Rocket': customSet}};

  assert.strictEqual(sandbox.getTeamMemberSetKey('Pikachu', 'Team Rocket', 0), 'Team Rocket');
  assert.strictEqual(sandbox.exportInGameTeamText('Team Rocket'), [
    'Pikachu',
    'Ability: Static',
    'Level: 50',
    'Adamant Nature',
    '- Volt Tackle',
  ].join('\n'));
});

test('resolves numbered battle tower teams to their own sets', () => {
  const sandbox = loadModule({
    localStorage: {},
    RELUMI_INGAME_TEAMS: {
      Pikachu: {
        'bt-7': makeSet({moves: ['Thunder Shock'], trainerId: 'bt-7', team: ['Pikachu', 'Garchomp'], teamSlot: 1}),
        'bt-7-2': makeSet({moves: ['Volt Tackle'], trainerId: 'bt-7-2', team: ['Pikachu'], teamSlot: 1}),
      },
      Garchomp: {
        'bt-7': makeSet({moves: ['Earthquake'], trainerId: 'bt-7', team: ['Pikachu', 'Garchomp'], teamSlot: 2}),
      },
    },
    RELUMI_INGAME_TRAINER_TEAMS: {'bt-7': ['Pikachu', 'Garchomp'], 'bt-7-2': ['Pikachu']},
  });

  // The base team must not pick up the numbered team's set for the same species.
  assert.strictEqual(sandbox.getTeamMemberSetKey('Pikachu', 'bt-7', 0), 'bt-7');
  assert.strictEqual(sandbox.getTeamMemberSetKey('Pikachu', 'bt-7-2', 0), 'bt-7-2');
  assert.ok(sandbox.exportInGameTeamText('bt-7').indexOf('- Thunder Shock') !== -1);
  assert.ok(sandbox.exportInGameTeamText('bt-7-2').indexOf('- Volt Tackle') !== -1);
});

test('keeps a repeated battle tower species on its own slot set', () => {
  const sandbox = loadModule({
    localStorage: {},
    RELUMI_INGAME_TEAMS: {
      Pikachu: {
        'bt-9': makeSet({moves: ['Thunder Shock'], trainerId: 'bt-9', team: ['Pikachu', 'Pikachu'], teamSlot: 1}),
        'bt-9-s2': makeSet({moves: ['Quick Attack'], trainerId: 'bt-9', team: ['Pikachu', 'Pikachu'], teamSlot: 2}),
      },
    },
    RELUMI_INGAME_TRAINER_TEAMS: {'bt-9': ['Pikachu', 'Pikachu']},
  });

  assert.strictEqual(sandbox.getTeamMemberSetKey('Pikachu', 'bt-9', 0), 'bt-9');
  assert.strictEqual(sandbox.getTeamMemberSetKey('Pikachu', 'bt-9', 1), 'bt-9-s2');
  assert.strictEqual(sandbox.exportInGameTeamText('bt-9'), [
    'Pikachu',
    'Ability: Static',
    'Hardy Nature',
    '- Thunder Shock',
    '',
    'Pikachu',
    'Ability: Static',
    'Hardy Nature',
    '- Quick Attack',
  ].join('\n'));
});

test('rebuilds custom teams from storage ordered by team slot', () => {
  const sandbox = loadModule({
    localStorage: {
      customsets: JSON.stringify({
        Bulbasaur: {'Team A': {isCustomSet: true, trainerId: 'Team A', teamSlot: 2}},
        Pikachu: {'Team A': {isCustomSet: true, trainerId: 'Team A', teamSlot: 1}},
      }),
    },
  });

  assert.strictEqual(JSON.stringify(sandbox.RELUMI_CUSTOM_INGAME_TRAINER_TEAMS['Team A']), '["Pikachu","Bulbasaur"]');
});

test('ignores corrupt stored custom sets instead of throwing', () => {
  const sandbox = loadModule({
    localStorage: {customsets: '{not json'},
    RELUMI_INGAME_TEAMS: {},
    RELUMI_INGAME_TRAINER_TEAMS: {},
  });

  assert.strictEqual(JSON.stringify(sandbox.RELUMI_CUSTOM_INGAME_TRAINER_TEAMS), '{}');
  assert.strictEqual(sandbox.exportInGameTeamText('Team A'), '');
  assert.strictEqual(sandbox.exportInGameTeamText(''), '');
});

let failures = 0;
for (const {name, fn} of tests) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    failures++;
    console.error(`not ok - ${name}`);
    console.error(err.stack);
  }
}

if (failures) {
  console.error(`\n${failures} of ${tests.length} relumi team export tests failed`);
  process.exit(1);
}
console.log(`\n${tests.length} relumi team export tests passed`);
