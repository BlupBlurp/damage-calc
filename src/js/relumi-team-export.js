/* global setdex */
/* Relumi in-game team export (Showdown paste format) — shared by calc UI and raw.html */
(function () {
	var LEGACY_STATS = ['hp', 'at', 'df', 'sa', 'sd', 'sp'];
	var DISPLAY_STATS = {hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe'};
	var LEGACY_TO_STAT = {hp: 'hp', at: 'atk', df: 'def', sa: 'spa', sd: 'spd', sp: 'spe', sl: 'spc'};

	function startsWith(str, prefix) {
		return (str || '').slice(0, prefix.length) === prefix;
	}

	function normalizeInGameTeamData() {
		if (typeof window.RELUMI_INGAME_TEAMS === 'undefined') return;
		var COSMETIC_BASES = ['Furfrou', 'Arbok', 'Magikarp', 'Vivillon', 'Minior', 'Alcremie', 'Smeargle'];
		var cosmeticIndex = {};
		for (var i = 0; i < COSMETIC_BASES.length; i++) cosmeticIndex[COSMETIC_BASES[i]] = true;

		function getBaseForm(name) {
			var dash = name.indexOf('-');
			if (dash === -1) return null;
			var base = name.substring(0, dash);
			return cosmeticIndex[base] ? base : null;
		}

		var teams = window.RELUMI_INGAME_TEAMS;
		var keys = Object.keys(teams);
		for (var k = 0; k < keys.length; k++) {
			var speciesName = keys[k];
			var base = getBaseForm(speciesName);
			if (!base) continue;
			if (!teams[base]) teams[base] = {};
			var setNames = Object.keys(teams[speciesName]);
			for (var s = 0; s < setNames.length; s++) {
				var setKey = setNames[s];
				if (!teams[base][setKey]) teams[base][setKey] = teams[speciesName][setKey];
			}
			delete teams[speciesName];
		}

		if (typeof window.RELUMI_INGAME_TRAINER_TEAMS !== 'undefined') {
			var trainerTeams = window.RELUMI_INGAME_TRAINER_TEAMS;
			var tids = Object.keys(trainerTeams);
			for (var t = 0; t < tids.length; t++) {
				var roster = trainerTeams[tids[t]];
				if (!Array.isArray(roster)) continue;
				var hasCosmeticMember = false;
				for (var m = 0; m < roster.length; m++) {
					if (getBaseForm(roster[m])) hasCosmeticMember = true;
				}
				for (var n = 0; n < roster.length; n++) {
					var normalized = getBaseForm(roster[n]);
					if (normalized) roster[n] = normalized;
				}
				if (hasCosmeticMember) {
					var deduped = [];
					var seen = {};
					for (var d = 0; d < roster.length; d++) {
						if (seen[roster[d]]) continue;
						seen[roster[d]] = true;
						deduped.push(roster[d]);
					}
					trainerTeams[tids[t]] = deduped;
				}
			}
		}
	}

	function rebuildCustomInGameTrainerTeamsFromStorage() {
		window.RELUMI_CUSTOM_INGAME_TRAINER_TEAMS = {};
		if (!window.localStorage || !localStorage.customsets) return;

		var customsets = JSON.parse(localStorage.customsets);
		var teamsById = {};
		for (var species in customsets) {
			for (var setKey in customsets[species]) {
				var set = customsets[species][setKey];
				if (!set || !set.isCustomSet) continue;
				var teamId = set.trainerId ? String(set.trainerId) : String(setKey).replace(/-\d+$/, '');
				if (!teamsById[teamId]) teamsById[teamId] = [];
				teamsById[teamId].push({
					species: species,
					slot: set.teamSlot || teamsById[teamId].length + 1
				});
			}
		}
		var teamIds = Object.keys(teamsById);
		for (var t = 0; t < teamIds.length; t++) {
			var members = teamsById[teamIds[t]];
			members.sort(function (a, b) {return a.slot - b.slot;});
			var roster = [];
			for (var m = 0; m < members.length; m++) roster.push(members[m].species);
			if (roster.length) window.RELUMI_CUSTOM_INGAME_TRAINER_TEAMS[teamIds[t]] = roster;
		}
	}

	function getTrainerTeamRoster(trainerId) {
		if (!trainerId) return null;
		var id = String(trainerId);
		if (window.RELUMI_CUSTOM_INGAME_TRAINER_TEAMS && window.RELUMI_CUSTOM_INGAME_TRAINER_TEAMS[id]) {
			return window.RELUMI_CUSTOM_INGAME_TRAINER_TEAMS[id];
		}
		if (window.RELUMI_INGAME_TRAINER_TEAMS && window.RELUMI_INGAME_TRAINER_TEAMS[id]) {
			return window.RELUMI_INGAME_TRAINER_TEAMS[id];
		}
		return null;
	}

	function resolveTeamMemberSetKey(speciesName, trainerId, occurrence) {
		var id = String(trainerId);
		var occ = occurrence || 0;

		if (typeof setdex !== 'undefined' && setdex[speciesName]) {
			var customMatches = [];
			for (var setKey in setdex[speciesName]) {
				var set = setdex[speciesName][setKey];
				if (!set || !set.isCustomSet) continue;
				if (String(set.trainerId) !== id && setKey !== id && !startsWith(setKey, id + '-')) continue;
				customMatches.push({key: setKey, slot: set.teamSlot || customMatches.length + 1});
			}
			if (customMatches.length) {
				customMatches.sort(function (a, b) {return a.slot - b.slot;});
				var customPick = customMatches[occ] || customMatches[0];
				return customPick.key;
			}
		}

		if (window.RELUMI_INGAME_TEAMS && window.RELUMI_INGAME_TEAMS[speciesName]) {
			var speciesSets = window.RELUMI_INGAME_TEAMS[speciesName];
			var trainerKeys = [];
			for (var trainerKey in speciesSets) {
				if (trainerKey === id || startsWith(trainerKey, id + '-')) {
					trainerKeys.push(trainerKey);
				}
			}
			trainerKeys.sort();
			if (trainerKeys[occ]) return trainerKeys[occ];
			if (trainerKeys[0]) return trainerKeys[0];
		}

		return id;
	}

	function getInGameSetForMember(speciesName, trainerId, occurrence) {
		var setKey = resolveTeamMemberSetKey(speciesName, trainerId, occurrence);
		if (typeof setdex !== 'undefined' && setdex[speciesName] && setdex[speciesName][setKey]) {
			return setdex[speciesName][setKey];
		}
		if (window.RELUMI_INGAME_TEAMS && window.RELUMI_INGAME_TEAMS[speciesName]) {
			return window.RELUMI_INGAME_TEAMS[speciesName][setKey] || null;
		}
		return null;
	}

	function exportSpeciesNameForShowdown(speciesName) {
		switch (speciesName) {
		case 'Aegislash-Shield':
		case 'Aegislash-Both':
			return 'Aegislash';
		default:
			return speciesName;
		}
	}

	function serializeStats(array, separator) {
		var text = '';
		for (var i = 0; i < array.length; i++) {
			text += (i < array.length - 1) ? array[i] + separator : array[i];
		}
		return text;
	}

	function formatSetAsShowdown(speciesName, set) {
		if (!set) return '';
		var name = exportSpeciesNameForShowdown(speciesName);
		var gender = set.gender || 'N';
		var text = name;
		if (gender && gender !== 'N') text += ' (' + gender + ')';
		var item = set.item || (set.items && set.items.length ? set.items[0] : '');
		if (item) text += ' @ ' + item;
		text += '\n';

		var ability = set.ability || (set.abilities && set.abilities.length ? set.abilities[0] : '');
		if (ability) text += 'Ability: ' + ability + '\n';

		var level = set.level === undefined ? 100 : set.level;
		if (level !== 100) text += 'Level: ' + level + '\n';

		if (set.teraType) text += 'Tera Type: ' + set.teraType + '\n';

		var evLine = [];
		if (set.evs) {
			for (var e = 0; e < LEGACY_STATS.length; e++) {
				var legacyEv = LEGACY_STATS[e];
				var evVal = typeof set.evs[legacyEv] !== 'undefined' ? set.evs[legacyEv] :
					(typeof set.evs[LEGACY_TO_STAT[legacyEv]] !== 'undefined' ? set.evs[LEGACY_TO_STAT[legacyEv]] : 0);
				if (evVal > 0) evLine.push(evVal + ' ' + DISPLAY_STATS[LEGACY_TO_STAT[legacyEv]]);
			}
		}
		if (evLine.length) text += 'EVs: ' + serializeStats(evLine, ' / ') + '\n';

		if (set.nature) text += set.nature + ' Nature\n';

		var ivLine = [];
		if (set.ivs) {
			for (var v = 0; v < LEGACY_STATS.length; v++) {
				var legacyIv = LEGACY_STATS[v];
				var ivVal = typeof set.ivs[legacyIv] !== 'undefined' ? set.ivs[legacyIv] :
					(typeof set.ivs[LEGACY_TO_STAT[legacyIv]] !== 'undefined' ? set.ivs[LEGACY_TO_STAT[legacyIv]] : 31);
				if (ivVal < 31) ivLine.push(ivVal + ' ' + DISPLAY_STATS[LEGACY_TO_STAT[legacyIv]]);
			}
		}
		if (ivLine.length) text += 'IVs: ' + serializeStats(ivLine, ' / ') + '\n';

		var moveList = set.moves || [];
		for (var m = 0; m < moveList.length; m++) {
			if (moveList[m]) text += '- ' + moveList[m] + '\n';
		}

		return text.trim();
	}

	function exportInGameTeamText(trainerId) {
		var team = getTrainerTeamRoster(trainerId);
		if (!team || !team.length) return '';

		var blocks = [];
		var speciesOccurrence = {};
		for (var i = 0; i < team.length; i++) {
			var member = team[i];
			var occurrence = speciesOccurrence[member] || 0;
			speciesOccurrence[member] = occurrence + 1;
			var set = getInGameSetForMember(member, trainerId, occurrence);
			var block = formatSetAsShowdown(member, set);
			if (block) blocks.push(block);
		}
		return blocks.join('\n\n');
	}

	function initRelumiTeamExportData() {
		normalizeInGameTeamData();
		rebuildCustomInGameTrainerTeamsFromStorage();
	}

	window.initRelumiTeamExportData = initRelumiTeamExportData;
	window.exportInGameTeamText = exportInGameTeamText;
	window.getTrainerTeamRosterForExport = getTrainerTeamRoster;
})();
