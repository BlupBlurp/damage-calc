#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const showdownRoot = path.resolve(root, '..', 'pokemon-showdown');

const relumiSinglesPath = path.join(showdownRoot, 'data', 'random-battles', 'gen8relumi', 'sets.json');
const relumiDoublesPath = path.join(showdownRoot, 'data', 'random-battles', 'gen8relumi', 'doubles-sets.json');
const trainerTablePath = path.join(showdownRoot, 'game-files', 'TrainerTable.json');
const abilityNamesPath = path.join(showdownRoot, 'game-files', 'english_ss_tokusei.json');
const moveNamesPath = path.join(showdownRoot, 'game-files', 'english_ss_wazaname.json');

const {Dex} = require(path.join(showdownRoot, 'dist', 'sim', 'dex'));
const dex = Dex.mod('gen8relumi');

const NATURE_NAMES_BY_ID = [
  'Hardy',
  'Lonely',
  'Brave',
  'Adamant',
  'Naughty',
  'Bold',
  'Docile',
  'Relaxed',
  'Impish',
  'Lax',
  'Timid',
  'Hasty',
  'Serious',
  'Jolly',
  'Naive',
  'Modest',
  'Mild',
  'Quiet',
  'Bashful',
  'Rash',
  'Calm',
  'Gentle',
  'Sassy',
  'Careful',
  'Quirky',
];

function uniq(arr) {
  return [...new Set(arr.filter(Boolean))];
}

function roleKey(role, index) {
  return index === 1 ? role : `${role} ${index}`;
}

function getLabelString(entry) {
  if (!entry || !entry.wordDataArray || !entry.wordDataArray.length) return '';
  const firstWord = entry.wordDataArray[0];
  if (!firstWord || typeof firstWord.str !== 'string') return '';
  return firstWord.str.trim();
}

function extractIndexedNames(labelDataArray) {
  const map = new Map();
  for (const entry of labelDataArray || []) {
    if (!entry || typeof entry.arrayIndex !== 'number') continue;
    map.set(entry.arrayIndex, getLabelString(entry));
  }
  return map;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeTrainerEvs(rawEvs) {
  const out = {
    hp: clamp(Number(rawEvs.hp) || 0, 0, 252),
    atk: clamp(Number(rawEvs.atk) || 0, 0, 252),
    def: clamp(Number(rawEvs.def) || 0, 0, 252),
    spa: clamp(Number(rawEvs.spa) || 0, 0, 252),
    spd: clamp(Number(rawEvs.spd) || 0, 0, 252),
    spe: clamp(Number(rawEvs.spe) || 0, 0, 252),
  };
  if (!Object.values(out).some(v => v > 0)) return undefined;
  return out;
}

function normalizeTrainerIvs(rawIvs) {
  const out = {
    hp: clamp(Number(rawIvs.hp) || 0, 0, 31),
    atk: clamp(Number(rawIvs.atk) || 0, 0, 31),
    def: clamp(Number(rawIvs.def) || 0, 0, 31),
    spa: clamp(Number(rawIvs.spa) || 0, 0, 31),
    spd: clamp(Number(rawIvs.spd) || 0, 0, 31),
    spe: clamp(Number(rawIvs.spe) || 0, 0, 31),
  };
  if (!Object.values(out).some(v => v > 0)) return undefined;
  return out;
}

function getSpeciesByMonsAndForm(monsNo, formNo) {
  const allSpecies = dex.species.all();
  const base = allSpecies.find(sp => sp?.exists && sp.num === monsNo && (!sp.forme || sp.baseSpecies === sp.name));
  if (!base) return null;
  if (!formNo) return base;

  const ordered = [];
  if (Array.isArray(base.formeOrder) && base.formeOrder.length) {
    for (const name of base.formeOrder) ordered.push(name);
  } else {
    ordered.push(base.name);
    if (Array.isArray(base.otherFormes)) {
      for (const name of base.otherFormes) ordered.push(name);
    }
  }
  if (ordered[0] !== base.name) ordered.unshift(base.name);
  const candidate = ordered[formNo] || ordered[0];
  const species = dex.species.get(candidate);
  if (species?.exists) return species;

  if (Array.isArray(base.otherFormes) && formNo - 1 >= 0 && formNo - 1 < base.otherFormes.length) {
    const alt = dex.species.get(base.otherFormes[formNo - 1]);
    if (alt?.exists) return alt;
  }
  return base;
}

function buildInGameTeams() {
  const trainerTable = JSON.parse(fs.readFileSync(trainerTablePath, 'utf8'));
  const abilityNames = extractIndexedNames(JSON.parse(fs.readFileSync(abilityNamesPath, 'utf8')).labelDataArray || []);
  const moveNames = extractIndexedNames(JSON.parse(fs.readFileSync(moveNamesPath, 'utf8')).labelDataArray || []);

  const itemNameByNo = new Map();
  for (const item of dex.items.all()) {
    if (!item?.exists || !Number.isFinite(item.num) || item.num <= 0) continue;
    if (!itemNameByNo.has(item.num)) itemNameByNo.set(item.num, item.name);
  }

  const setsBySpecies = {};
  const trainerTeams = {};

  for (const row of trainerTable.TrainerPoke || []) {
    const trainerIdNumber = Number(row.ID || 0);
    if (!trainerIdNumber || trainerIdNumber > 2000) continue;
    const trainerId = String(trainerIdNumber);

    const members = [];
    for (let slot = 1; slot <= 6; slot++) {
      const monsNo = Number(row[`P${slot}MonsNo`] || 0);
      if (!monsNo) continue;

      const formNo = Number(row[`P${slot}FormNo`] || 0);
      const species = getSpeciesByMonsAndForm(monsNo, formNo);
      if (!species || !species.exists || !species.name) continue;

      const moveList = [];
      for (let m = 1; m <= 4; m++) {
        const moveNo = Number(row[`P${slot}Waza${m}`] || 0);
        if (!moveNo) continue;
        const moveName = (moveNames.get(moveNo) || '').trim();
        if (!moveName || moveName === '---') continue;
        const move = dex.moves.get(moveName);
        if (!move?.exists || !move.name || moveList.includes(move.name)) continue;
        moveList.push(move.name);
      }

      const abilityNo = Number(row[`P${slot}Tokusei`] || 0);
      const abilityName = (abilityNames.get(abilityNo) || '').trim();
      const ability = dex.abilities.get(abilityName);
      const fallbackAbilities = Object.values(species.abilities || {}).filter(Boolean);
      const abilities = ability?.exists ? [ability.name] : (fallbackAbilities.length ? [fallbackAbilities[0]] : ['No Ability']);

      const itemNo = Number(row[`P${slot}Item`] || 0);
      const itemName = itemNameByNo.get(itemNo);

      const natureNo = Number(row[`P${slot}Seikaku`] || 0);
      const natureName = NATURE_NAMES_BY_ID[natureNo] || 'Hardy';

      const evs = normalizeTrainerEvs({
        hp: row[`P${slot}EffortHp`],
        atk: row[`P${slot}EffortAtk`],
        def: row[`P${slot}EffortDef`],
        spa: row[`P${slot}EffortSpAtk`],
        spd: row[`P${slot}EffortSpDef`],
        spe: row[`P${slot}EffortAgi`],
      });
      const ivs = normalizeTrainerIvs({
        hp: row[`P${slot}TalentHp`],
        atk: row[`P${slot}TalentAtk`],
        def: row[`P${slot}TalentDef`],
        spa: row[`P${slot}TalentSpAtk`],
        spd: row[`P${slot}TalentSpDef`],
        spe: row[`P${slot}TalentAgi`],
      });

      const set = {
        level: Number(row[`P${slot}Level`] || 100),
        abilities,
        items: itemName ? [itemName] : [],
        nature: natureName,
        moves: moveList,
        teraTypes: species.types ? species.types.slice() : ['Normal'],
        role: 'Trainer Team',
        trainerId,
      };
      if (evs) set.evs = evs;
      if (ivs) set.ivs = ivs;

      members.push({
        speciesName: species.name,
        slot,
        set,
      });
    }

    if (!members.length) continue;
    const teamNames = members.map(member => member.speciesName);
    trainerTeams[trainerId] = teamNames;

    for (const member of members) {
      if (!setsBySpecies[member.speciesName]) setsBySpecies[member.speciesName] = {};

      let setName = trainerId;
      if (setsBySpecies[member.speciesName][setName]) {
        setName = `${trainerId}-${member.slot}`;
      }
      member.set.team = teamNames;
      member.set.teamSlot = member.slot;
      setsBySpecies[member.speciesName][setName] = member.set;
    }
  }

  return {setsBySpecies, trainerTeams};
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

function writeJSGlobalBundle(filePath, entries) {
  const lines = entries.map(([varName, obj]) => `window.${varName} = ${JSON.stringify(obj)};`);
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`);
}

function main() {
  const singlesRaw = JSON.parse(fs.readFileSync(relumiSinglesPath, 'utf8'));
  const doublesRaw = JSON.parse(fs.readFileSync(relumiDoublesPath, 'utf8'));

  const randomSingles = convertRelumiSets(singlesRaw);
  const randomDoubles = convertRelumiSets(doublesRaw);
  const inGameTeams = buildInGameTeams();

  const species = buildSpecies();
  const moves = buildMoves();
  const abilities = buildAbilities();
  const items = buildItems();

  const dataDir = path.join(root, 'src', 'js', 'data');
  fs.mkdirSync(dataDir, {recursive: true});

  writeJS(path.join(dataDir, 'relumi-random-sets.js'), 'RELUMI_RANDOM_BATTLE', randomSingles);
  writeJS(path.join(dataDir, 'relumi-random-doubles-sets.js'), 'RELUMI_RANDOM_DOUBLES_BATTLE', randomDoubles);
  writeJSGlobalBundle(path.join(dataDir, 'relumi-ingame-teams.js'), [
    ['RELUMI_INGAME_TEAMS', inGameTeams.setsBySpecies],
    ['RELUMI_INGAME_TRAINER_TEAMS', inGameTeams.trainerTeams],
  ]);
  writeJS(path.join(dataDir, 'relumi-dex-overrides.js'), 'RELUMI_DEX_OVERRIDES', {
    species,
    moves,
    abilities,
    items,
  });

  console.log('Generated Relumi random sets, in-game trainer teams, and dex override data for damage-calc.');
}

main();
