/**
 * Characterization tests for Coach client-profile localStorage facade.
 * Uses an isolated in-memory storage — never touches a real browser profile.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMemoryStorage,
  createClientProfileStore,
  createLocalStorageClientProfileStore,
} from '../src/coach/services/storage/client-profile-store.mjs';
import { PROFILE_STORAGE_KEY_PREFIX, profileStorageKey } from '../src/coach/domain/clients.mjs';
import {
  applyClientProfileStoragePatches,
  buildClientProfileStoreRuntime,
} from '../scripts/coach-calculator-storage.mjs';

function sampleProfile(nom, extras = {}) {
  return {
    version: 2,
    nom,
    savedAt: '2026-08-02T12:00:00.000Z',
    activeJour: 'entrainement',
    sexe: 'H',
    age: '30',
    poids: '185',
    poids_unit: 'lbs',
    grandeur_unit: 'cm',
    grandeur_cm: '180',
    grandeur_ft: '5',
    grandeur_in: '11',
    activite: 'modere',
    macroRatio: '25,45,30',
    macroMode: 'preset',
    macroCustomG: 45,
    macroCustomL: 30,
    proteinesMode: 'gkg',
    proteinesParKg: 2,
    proteinesPct: 25,
    goalMultiplier: 1,
    jourReposActif: true,
    coachNotes: 'Hydratation prioritaire — café éé',
    jours: {
      entrainement: { banque: { pro: '2' }, repartition: { 0: '2' } },
      repos: { banque: { pro: '0' }, repartition: {} },
    },
    ...extras,
  };
}

const PROFILE_HTML_SNIPPET = `<!DOCTYPE html><html><body>
<script>
function initProfils() {
    const select = document.getElementById('liste_profils');
    select.innerHTML = '<option value="">— Charger un dossier existant —</option>';
    Object.keys(localStorage).filter(k => k.startsWith('athlete_')).sort().forEach(key => {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = key.replace('athlete_', '');
        select.appendChild(opt);
    });
}
function sauvegarderProfil() {
    const nom = document.getElementById('nom_athlete').value.trim();
    if (!nom) { alert("Veuillez entrer un nom d'athlète pour sauvegarder."); return; }
    localStorage.setItem('athlete_' + nom, JSON.stringify(getProfilData(nom)));
    initProfils();
    document.getElementById('liste_profils').value = 'athlete_' + nom;
    alert('✅ Dossier de ' + nom + ' sauvegardé !');
}
function importerProfilJSON(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const data = JSON.parse(e.target.result);
            if (!data.sexe || (!data.banque && !data.jours)) throw new Error('format');
            let nom = (data.nom || '').trim();
            if (!nom) {
                nom = prompt("Nom de l'athlète pour ce dossier importé :", file.name.replace(/\\.json$/i, ''));
                if (!nom || !nom.trim()) return;
                nom = nom.trim();
            }
            if (localStorage.getItem('athlete_' + nom) && !confirm('Un dossier "' + nom + '" existe déjà. Écraser ?')) return;
            data.nom = nom;
            data.savedAt = data.savedAt || new Date().toISOString();
            localStorage.setItem('athlete_' + nom, JSON.stringify(data));
            initProfils();
            document.getElementById('liste_profils').value = 'athlete_' + nom;
            appliquerProfilData(data, nom);
            alert('✅ Dossier de ' + nom + ' importé avec succès !');
        } catch (err) {
            alert('Fichier JSON invalide. Vérifiez que c\\'est un export de ce calculateur.');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}
function chargerProfil() {
    const key = document.getElementById('liste_profils').value;
    if (!key) return;
    const data = JSON.parse(localStorage.getItem(key));
    if (!data) return;
    appliquerProfilData(data, key.replace('athlete_', ''));
}
function supprimerProfil() {
    const key = document.getElementById('liste_profils').value;
    if (!key) { alert('Sélectionnez un profil à supprimer.'); return; }
    if (confirm('Supprimer définitivement le dossier de ' + key.replace('athlete_', '') + ' ?')) {
        localStorage.removeItem(key);
        document.getElementById('nom_athlete').value = '';
        document.getElementById('liste_profils').value = '';
        initProfils();
    }
}
</script>
</body></html>`;

test('empty storage lists no profiles', () => {
  const store = createClientProfileStore(createMemoryStorage());
  assert.deepEqual(store.listProfileKeys(), []);
  assert.deepEqual(store.listProfileNames(), []);
  assert.equal(store.hasProfile('Xavier'), false);
  assert.equal(store.loadProfile('Xavier'), null);
});

test('save/load single profile preserves compact JSON and accents', () => {
  const memory = createMemoryStorage();
  const store = createClientProfileStore(memory);
  const profile = sampleProfile('José Émile');
  store.saveProfile('José Émile', profile);
  assert.equal(memory.getItem(profileStorageKey('José Émile')), JSON.stringify(profile));
  assert.deepEqual(store.loadProfile('José Émile'), profile);
  assert.deepEqual(store.listProfileNames(), ['José Émile']);
});

test('multiple profiles sort by storage key', () => {
  const store = createClientProfileStore(createMemoryStorage());
  store.saveProfile('Zoé', sampleProfile('Zoé'));
  store.saveProfile('Alex', sampleProfile('Alex'));
  store.saveProfile('Marc', sampleProfile('Marc'));
  assert.deepEqual(store.listProfileNames(), ['Alex', 'Marc', 'Zoé']);
  assert.deepEqual(
    store.listProfileKeys(),
    ['athlete_Alex', 'athlete_Marc', 'athlete_Zoé'],
  );
});

test('metric and imperial unit fields round-trip unchanged', () => {
  const store = createClientProfileStore(createMemoryStorage());
  const imperial = sampleProfile('Pat', {
    poids: '185',
    poids_unit: 'lbs',
    grandeur_unit: 'ft',
    grandeur_ft: '5',
    grandeur_in: '11',
  });
  const metric = sampleProfile('Sam', {
    poids: '84',
    poids_unit: 'kg',
    grandeur_unit: 'cm',
    grandeur_cm: '180',
  });
  store.saveProfile('Pat', imperial);
  store.saveProfile('Sam', metric);
  assert.deepEqual(store.loadProfile('Pat'), imperial);
  assert.deepEqual(store.loadProfile('Sam'), metric);
});

test('missing key and empty string behave like current UI paths', () => {
  const memory = createMemoryStorage();
  const store = createClientProfileStore(memory);
  assert.equal(store.loadProfileByKey('athlete_Missing'), null);
  memory.setItem('athlete_Empty', '');
  assert.throws(() => store.loadProfileByKey('athlete_Empty'));
});

test('invalid JSON throws and does not remove the key', () => {
  const memory = createMemoryStorage({ athlete_Broken: '{not-json' });
  const store = createClientProfileStore(memory);
  assert.throws(() => store.loadProfile('Broken'));
  assert.equal(memory.getItem('athlete_Broken'), '{not-json');
});

test('incomplete object is returned as-is (no silent repair)', () => {
  const store = createClientProfileStore(createMemoryStorage());
  const incomplete = { nom: 'Incomplet', sexe: 'F' };
  store.saveProfile('Incomplet', incomplete);
  assert.deepEqual(store.loadProfile('Incomplet'), incomplete);
});

test('null values inside profile JSON are preserved', () => {
  const store = createClientProfileStore(createMemoryStorage());
  const withNulls = sampleProfile('Nullish', { coachNotes: null, macroCustomG: null });
  store.saveProfile('Nullish', withNulls);
  assert.deepEqual(store.loadProfile('Nullish'), withNulls);
});

test('brand KR/Elevate are not stored in profile keys (UI-only today)', () => {
  const store = createClientProfileStore(createMemoryStorage());
  store.saveProfile('Client', sampleProfile('Client'));
  assert.deepEqual(store.listProfileKeys(), ['athlete_Client']);
  assert.equal(store.listProfileKeys().some((k) => /elevate|kr/i.test(k) && k !== 'athlete_Client'), false);
});

test('removeProfileByKey only deletes the selected athlete key', () => {
  const memory = createMemoryStorage();
  const store = createClientProfileStore(memory);
  store.saveProfile('A', sampleProfile('A'));
  store.saveProfile('B', sampleProfile('B'));
  store.removeProfileByKey('athlete_A');
  assert.equal(store.loadProfile('A'), null);
  assert.deepEqual(store.loadProfile('B').nom, 'B');
  assert.equal(memory.getItem('athlete_A'), null);
});

test('existing athlete_ keys remain readable without renaming', () => {
  const legacy = sampleProfile('Legacy');
  const memory = createMemoryStorage({
    athlete_Legacy: JSON.stringify(legacy),
    unrelated_pref: 'keep-me',
  });
  const store = createClientProfileStore(memory);
  assert.deepEqual(store.loadProfile('Legacy'), legacy);
  assert.equal(memory.getItem('unrelated_pref'), 'keep-me');
  assert.equal(PROFILE_STORAGE_KEY_PREFIX, 'athlete_');
});

test('runtime injection script uses athlete_ prefix and never clears storage', () => {
  const runtime = buildClientProfileStoreRuntime();
  assert.match(runtime, /athlete_/);
  assert.match(runtime, /localStorage\.setItem/);
  assert.match(runtime, /localStorage\.getItem/);
  assert.match(runtime, /localStorage\.removeItem/);
  assert.doesNotMatch(runtime, /localStorage\.clear\s*\(/);
});

test('HTML patch routes profile I/O through facade and is idempotent', () => {
  const once = applyClientProfileStoragePatches(PROFILE_HTML_SNIPPET);
  const twice = applyClientProfileStoragePatches(once);
  assert.equal(once, twice);
  assert.match(once, /id="coach-client-profile-store"/);
  assert.match(once, /CoachClientProfileStore\.saveProfile/);
  assert.match(once, /CoachClientProfileStore\.loadProfileByKey/);
  assert.match(once, /CoachClientProfileStore\.listProfileKeys/);
  assert.match(once, /CoachClientProfileStore\.removeProfileByKey/);
  assert.match(once, /CoachClientProfileStore\.hasProfile/);
  const withoutFacade = once.replace(/<script id="coach-client-profile-store">[\s\S]*?<\/script>/, '');
  assert.doesNotMatch(withoutFacade, /localStorage\.(getItem|setItem|removeItem|clear)/);
});

test('createLocalStorageClientProfileStore factory is exported', () => {
  assert.equal(typeof createLocalStorageClientProfileStore, 'function');
});
