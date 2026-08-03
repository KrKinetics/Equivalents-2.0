/**
 * Injects a browser client-profile storage facade that preserves athlete_* localStorage behavior.
 * Replaces direct localStorage I/O in profile load/save/list/delete/import paths.
 */

import { PROFILE_STORAGE_KEY_PREFIX } from '../src/coach/domain/clients.mjs';

function mustReplace(html, pattern, replacement, label) {
  if (typeof pattern === 'string') {
    if (!html.includes(pattern)) {
      throw new Error(`Client profile storage patch missing target: ${label}`);
    }
    return html.replace(pattern, replacement);
  }
  if (!pattern.test(html)) {
    throw new Error(`Client profile storage patch missing target: ${label}`);
  }
  return html.replace(pattern, replacement);
}

/** Match golden-master CRLF or LF. */
function rx(source) {
  return new RegExp(source.replace(/\n/g, '\\r?\\n'));
}

export function buildClientProfileStoreRuntime() {
  const prefix = PROFILE_STORAGE_KEY_PREFIX;
  return `<script id="coach-client-profile-store">
(function () {
  var PREFIX = ${JSON.stringify(prefix)};
  function profileStorageKey(name) { return PREFIX + name; }
  function listProfileKeys() {
    return Object.keys(localStorage).filter(function (k) { return k.indexOf(PREFIX) === 0; }).sort();
  }
  function loadProfileByKey(key) {
    var raw = localStorage.getItem(key);
    if (raw == null) return null;
    return JSON.parse(raw);
  }
  function saveProfile(name, data) {
    localStorage.setItem(profileStorageKey(name), JSON.stringify(data));
  }
  function removeProfileByKey(key) {
    localStorage.removeItem(key);
  }
  function hasProfile(name) {
    return localStorage.getItem(profileStorageKey(name)) != null;
  }
  window.CoachClientProfileStore = {
    PREFIX: PREFIX,
    profileStorageKey: profileStorageKey,
    listProfileKeys: listProfileKeys,
    loadProfileByKey: loadProfileByKey,
    saveProfile: saveProfile,
    removeProfileByKey: removeProfileByKey,
    hasProfile: hasProfile
  };
})();
</script>`;
}

export function applyClientProfileStoragePatches(html) {
  if (html.includes('id="coach-client-profile-store"')) {
    return html;
  }

  html = mustReplace(
    html,
    rx(`Object.keys\\(localStorage\\)\\.filter\\(k => k\\.startsWith\\('athlete_'\\)\\)\\.sort\\(\\)\\.forEach\\(key => \\{\n        const opt = document\\.createElement\\('option'\\);\n        opt\\.value = key;\n        opt\\.textContent = key\\.replace\\('athlete_', ''\\);\n        select\\.appendChild\\(opt\\);\n    \\}\\);`),
    `window.CoachClientProfileStore.listProfileKeys().forEach(key => {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = key.replace(window.CoachClientProfileStore.PREFIX, '');
        select.appendChild(opt);
    });`,
    'initProfils list keys',
  );

  html = mustReplace(
    html,
    rx(`localStorage\\.setItem\\('athlete_' \\+ nom, JSON\\.stringify\\(getProfilData\\(nom\\)\\)\\);\n    initProfils\\(\\);\n    document\\.getElementById\\('liste_profils'\\)\\.value = 'athlete_' \\+ nom;`),
    `window.CoachClientProfileStore.saveProfile(nom, getProfilData(nom));
    initProfils();
    document.getElementById('liste_profils').value = window.CoachClientProfileStore.profileStorageKey(nom);`,
    'sauvegarderProfil setItem',
  );

  html = mustReplace(
    html,
    rx(`if \\(localStorage\\.getItem\\('athlete_' \\+ nom\\) && !confirm\\('Un dossier "' \\+ nom \\+ '" existe déjà\\. Écraser \\?'\\)\\) return;\n            data\\.nom = nom;\n            data\\.savedAt = data\\.savedAt \\|\\| new Date\\(\\)\\.toISOString\\(\\);\n            localStorage\\.setItem\\('athlete_' \\+ nom, JSON\\.stringify\\(data\\)\\);\n            initProfils\\(\\);\n            document\\.getElementById\\('liste_profils'\\)\\.value = 'athlete_' \\+ nom;`),
    `if (window.CoachClientProfileStore.hasProfile(nom) && !confirm('Un dossier "' + nom + '" existe déjà. Écraser ?')) return;
            data.nom = nom;
            data.savedAt = data.savedAt || new Date().toISOString();
            window.CoachClientProfileStore.saveProfile(nom, data);
            initProfils();
            document.getElementById('liste_profils').value = window.CoachClientProfileStore.profileStorageKey(nom);`,
    'importerProfilJSON getItem/setItem',
  );

  html = mustReplace(
    html,
    rx(`const data = JSON\\.parse\\(localStorage\\.getItem\\(key\\)\\);\n    if \\(!data\\) return;\n    appliquerProfilData\\(data, key\\.replace\\('athlete_', ''\\)\\);`),
    `const data = window.CoachClientProfileStore.loadProfileByKey(key);
    if (!data) return;
    appliquerProfilData(data, key.replace(window.CoachClientProfileStore.PREFIX, ''));`,
    'chargerProfil getItem',
  );

  html = mustReplace(
    html,
    rx(`if \\(confirm\\('Supprimer définitivement le dossier de ' \\+ key\\.replace\\('athlete_', ''\\) \\+ ' \\?'\\)\\) \\{\n        localStorage\\.removeItem\\(key\\);\n        document\\.getElementById\\('nom_athlete'\\)\\.value = '';\n        document\\.getElementById\\('liste_profils'\\)\\.value = '';\n        initProfils\\(\\);\n    \\}`),
    `if (confirm('Supprimer définitivement le dossier de ' + key.replace(window.CoachClientProfileStore.PREFIX, '') + ' ?')) {
        window.CoachClientProfileStore.removeProfileByKey(key);
        document.getElementById('nom_athlete').value = '';
        document.getElementById('liste_profils').value = '';
        initProfils();
    }`,
    'supprimerProfil removeItem',
  );

  // Store must load before DOMContentLoaded handlers fire (injected before </body>).
  const bodyClose = html.lastIndexOf('</body>');
  if (bodyClose === -1) throw new Error('Cannot inject client profile storage facade');
  html = `${html.slice(0, bodyClose)}${buildClientProfileStoreRuntime()}\n${html.slice(bodyClose)}`;

  if (!html.includes('CoachClientProfileStore') || html.includes("localStorage.setItem('athlete_'")) {
    throw new Error('Client profile storage patch incomplete');
  }
  // Remaining localStorage calls must live only inside the facade runtime.
  const withoutFacade = html.replace(/<script id="coach-client-profile-store">[\s\S]*?<\/script>/, '');
  if (/(localStorage\.(getItem|setItem|removeItem|clear)|Object\.keys\(localStorage\))/.test(withoutFacade)) {
    throw new Error('Direct localStorage profile I/O remains outside the facade');
  }
  return html;
}
