#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const showdownRoot = path.resolve(root, '..', 'pokemon-showdown');

const relumiSinglesPath = path.join(showdownRoot, 'data', 'random-battles', 'gen8relumi', 'sets.json');
const relumiDoublesPath = path.join(showdownRoot, 'data', 'random-battles', 'gen8relumi', 'doubles-sets.json');

const {Dex} = require(path.join(showdownRoot, 'dist', 'sim', 'dex'));
const dex = Dex.mod('gen8relumi');

function uniq(arr) {
  return [...new Set(arr.filter(Boolean))];
}

function roleKey(role, index) {
  return index === 1 ? role : `${role} ${index}`;
}

function convertRelumiSets(rawSets) {
  const out = {};

  for (const [speciesID, entry] of Object.entries(rawSets)) {
    if (!entry || !Array.isArray(entry.sets) || !entry.sets.length) continue;
    const species = dex.species.get(speciesID);
    const speciesName = species?.exists ? species.name : speciesID;

    const roles = {};
    const roleCount = {};
    const allMoves = [];
    const allAbilities = [];
    const allItems = [];
    const allTeraTypes = [];

    for (const set of entry.sets) {
      const role = set.role || 'Randoms';
      roleCount[role] = (roleCount[role] || 0) + 1;
      const key = roleKey(role, roleCount[role]);

      const moves = uniq(set.movepool || []);
      const abilities = uniq(set.abilities || []);
      const items = uniq(set.item || []);
      const teraTypes = uniq(set.teraTypes || []);

      roles[key] = {
        moves,
        abilities,
        items,
        teraTypes,
      };

      allMoves.push(...moves);
      allAbilities.push(...abilities);
      allItems.push(...items);
      allTeraTypes.push(...teraTypes);
    }

    const firstSet = entry.sets[0];
    out[speciesName] = {
      level: entry.level,
      ability: firstSet.abilities && firstSet.abilities[0],
      abilities: uniq(allAbilities),
      item: firstSet.item && firstSet.item[0],
      items: uniq(allItems),
      nature: firstSet.nature && firstSet.nature[0],
      evs: firstSet.evs || {},
      moves: uniq(allMoves),
      teraTypes: uniq(allTeraTypes),
      roles,
    };
  }

  return out;
}

function buildSpecies() {
  const species = {'(No Pokemon)': {types: ['Normal'], bs: {hp: 1, at: 1, df: 1, sa: 1, sd: 1, sp: 1}, weightkg: 1}};
  for (const sp of dex.species.all()) {
    if (!sp?.exists || !sp.name) continue;
    species[sp.name] = {
      types: sp.types,
      bs: {
        hp: sp.baseStats.hp,
        at: sp.baseStats.atk,
        df: sp.baseStats.def,
        sa: sp.baseStats.spa,
        sd: sp.baseStats.spd,
        sp: sp.baseStats.spe,
      },
      weightkg: sp.weightkg || 0.1,
      gender: sp.gender,
      nfe: !!sp.nfe,
      abilities: {0: Object.values(sp.abilities || {})[0] || ''},
      otherFormes: sp.otherFormes,
      baseSpecies: sp.baseSpecies !== sp.name ? sp.baseSpecies : undefined,
    };
  }
  return species;
}

function buildMoves() {
  const moves = {'(No Move)': {bp: 0, category: 'Status', type: 'Normal'}};
  for (const mv of dex.moves.all()) {
    if (!mv?.exists || !mv.name || mv.name === '(No Move)') continue;
    const flags = mv.flags || {};
    const out = {
      bp: mv.basePower || 0,
      type: mv.type,
      category: mv.category,
      secondaries: !!mv.secondaries,
      target: mv.target,
      recoil: mv.recoil,
      hasCrashDamage: !!mv.hasCrashDamage,
      mindBlownRecoil: !!mv.mindBlownRecoil,
      struggleRecoil: !!mv.struggleRecoil,
      willCrit: !!mv.willCrit,
      drain: mv.drain,
      priority: mv.priority || 0,
      self: mv.self,
      ignoreDefensive: !!mv.ignoreDefensive,
      overrideOffensiveStat: mv.overrideOffensiveStat,
      overrideDefensiveStat: mv.overrideDefensiveStat,
      overrideOffensivePokemon: mv.overrideOffensivePokemon,
      overrideDefensivePokemon: mv.overrideDefensivePokemon,
      breaksProtect: !!mv.breaksProtect,
      isZ: !!mv.isZ,
      isMax: !!mv.isMax,
      multihit: mv.multihit,
      multiaccuracy: !!mv.multiaccuracy,
      zp: mv.zMove?.basePower,
      maxPower: mv.maxMove?.basePower,
      makesContact: !!flags.contact,
      isPunch: !!flags.punch,
      isBite: !!flags.bite,
      isBullet: !!flags.bullet,
      isSound: !!flags.sound,
      isPulse: !!flags.pulse,
      isSlicing: !!flags.slicing,
      isWind: !!flags.wind,
    };

    for (const [k, v] of Object.entries(out)) {
      if (
        v === undefined ||
        v === null ||
        v === false ||
        (typeof v === 'number' && k === 'priority' && v === 0)
      ) {
        delete out[k];
      }
    }

    moves[mv.name] = out;
  }
  return moves;
}

function buildAbilities() {
  return dex.abilities
    .all()
    .filter(a => a?.exists && a.name && a.name !== '(No Ability)')
    .map(a => a.name)
    .sort((a, b) => a.localeCompare(b));
}

function buildItems() {
  return dex.items
    .all()
    .filter(i => i?.exists && i.name)
    .map(i => i.name)
    .sort((a, b) => a.localeCompare(b));
}

function writeJS(filePath, varName, obj) {
  const body = JSON.stringify(obj);
  const content = `window.${varName} = ${body};\n`;
  fs.writeFileSync(filePath, content);
}

function main() {
  const singlesRaw = JSON.parse(fs.readFileSync(relumiSinglesPath, 'utf8'));
  const doublesRaw = JSON.parse(fs.readFileSync(relumiDoublesPath, 'utf8'));

  const randomSingles = convertRelumiSets(singlesRaw);
  const randomDoubles = convertRelumiSets(doublesRaw);

  const species = buildSpecies();
  const moves = buildMoves();
  const abilities = buildAbilities();
  const items = buildItems();

  const dataDir = path.join(root, 'src', 'js', 'data');
  fs.mkdirSync(dataDir, {recursive: true});

  writeJS(path.join(dataDir, 'relumi-random-sets.js'), 'RELUMI_RANDOM_BATTLE', randomSingles);
  writeJS(path.join(dataDir, 'relumi-random-doubles-sets.js'), 'RELUMI_RANDOM_DOUBLES_BATTLE', randomDoubles);
  writeJS(path.join(dataDir, 'relumi-dex-overrides.js'), 'RELUMI_DEX_OVERRIDES', {
    species,
    moves,
    abilities,
    items,
  });

  console.log('Generated Relumi random set and dex override data for damage-calc.');
}

main();
