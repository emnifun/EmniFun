#!/usr/bin/env node
/**
 * Generate the Game 1 accepted five-letter vocabulary.
 *
 * Runtime stays fully local. This script is only for rebuilding the generated
 * dataset when the selected source wordlists are refreshed.
 *
 * Usage:
 *   node scripts/generate-game1-vocabulary.mjs
 */

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'data/game1/valid-guesses.json');

const SOURCE_URLS = {
  mobySingle: 'https://raw.githubusercontent.com/fordsfords/moby_words_2/main/single.txt',
  mobyNames: 'https://raw.githubusercontent.com/fordsfords/moby_words_2/main/names.txt',
  mobyPlaces: 'https://raw.githubusercontent.com/fordsfords/moby_words_2/main/places.txt',
  mobyAcronyms: 'https://raw.githubusercontent.com/fordsfords/moby_words_2/main/acronyms.txt',
  wordnik: 'https://raw.githubusercontent.com/wordnik/wordlist/main/wordlist-20210729.txt'
};

async function fetchText(url, label) {
  let response;
  try {
    response = await fetch(url);
  } catch (error) {
    throw new Error('Could not download ' + label + ': ' + error.message);
  }
  if (!response.ok) {
    throw new Error('Could not download ' + label + ': HTTP ' + response.status);
  }
  return response.text();
}

function normalizedLines(text) {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function fiveLetterSet(text, quoted = false) {
  const words = new Set();
  for (const line of normalizedLines(text)) {
    const value = (quoted ? line.replace(/^\"|\"$/g, '') : line).toLowerCase();
    if (/^[a-z]{5}$/.test(value)) words.add(value);
  }
  return words;
}

const sourceText = Object.fromEntries(await Promise.all(
  Object.entries(SOURCE_URLS).map(async ([label, url]) => [label, await fetchText(url, label)])
));

const mobySingle = fiveLetterSet(sourceText.mobySingle);
const wordnik = fiveLetterSet(sourceText.wordnik, true);
const mobyNames = fiveLetterSet(sourceText.mobyNames);
const mobyPlaces = fiveLetterSet(sourceText.mobyPlaces);
const acronymLines = normalizedLines(sourceText.mobyAcronyms);
const mobyUppercaseAcronyms = new Set(acronymLines.filter((line) => /^[A-Z]{5}$/.test(line)).map((line) => line.toLowerCase()));
const mobyLowercaseAbbreviations = new Set(acronymLines.filter((line) => /^[a-z]{5}$/.test(line)).map((line) => line.toLowerCase()));

const combined = new Set([...mobySingle, ...wordnik]);
const excluded = new Set();
for (const word of mobySingle) {
  const sourceConflict = mobyNames.has(word) || mobyPlaces.has(word) || mobyUppercaseAcronyms.has(word) || mobyLowercaseAbbreviations.has(word);
  if (!wordnik.has(word) && sourceConflict) excluded.add(word);
}
for (const word of wordnik) {
  const sourceConflict = mobyNames.has(word) || mobyPlaces.has(word) || mobyUppercaseAcronyms.has(word) || mobyLowercaseAbbreviations.has(word);
  if (!mobySingle.has(word) && sourceConflict) excluded.add(word);
}

const words = [...combined].filter((word) => !excluded.has(word)).sort();
const output = {"description":"Comprehensive accepted five-letter English vocabulary for EmniFun Game 1.","generatedWordCount":words.length,"artificialMaximum":null,"sourceCandidateCounts":{"mobySingle":mobySingle.size,"wordnik":wordnik.size,"combinedBeforeFiltering":combined.size,"excludedAfterFiltering":excluded.size},"sourceStrategy":["Moby Words II single-word list as the broad lexical base.","Wordnik open wordlist as an independent supplementary lexical source."],"sources":[{"name":"Moby Words II","file":"single.txt","repository":"fordsfords/moby_words_2","url":"https://github.com/fordsfords/moby_words_2","license":"Public domain source; mirror modifications dedicated to CC0 1.0.","role":"Broad single-word English vocabulary; source documentation states it excludes proper names, acronyms, and compound words/phrases."},{"name":"Wordnik Wordlist","file":"wordlist-20210729.txt","repository":"wordnik/wordlist","url":"https://github.com/wordnik/wordlist","license":"MIT License","role":"Independent supplementary English wordlist for games."}],"filtering":["Normalize source entries to lowercase.","Keep only exactly five ASCII alphabetic letters A-Z.","Deduplicate the combined source vocabulary.","Do not cap the vocabulary by a target size.","Preserve uncommon, archaic, variant, and legitimate inflected English words when supported by the selected lexical sources.","For entries introduced only by the supplementary Wordnik source, exclude entries that the Moby source classifies as names, places, or abbreviations/acronyms when the entry has no Moby single-word support.","For Moby single-word entries that conflict with its name/place/abbreviation side lists, keep them when Wordnik independently supports the word; otherwise exclude the source-flagged entry.","For abbreviation filtering, obvious all-uppercase or lowercase abbreviation entries are treated as exclusions; title-case English terms can remain when supported as ordinary vocabulary.","No runtime dictionary API is used; the final vocabulary is shipped locally."],"pipelineNote":"The checked-in vocabulary is generated automatically by scripts/generate-game1-vocabulary.mjs from the selected source files. The generator applies filtering rules and writes this file; it does not manually type or cap the vocabulary."};
output.words = words;
output.generatedWordCount = words.length;

await writeFile(OUTPUT, JSON.stringify(output, null, 2) + '\n', 'utf8');
console.log('Generated ' + words.length.toLocaleString() + ' five-letter words.');