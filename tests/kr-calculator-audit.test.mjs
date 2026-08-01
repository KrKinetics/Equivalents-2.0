/**
 * Independent science/UI audit controls (ported from SCIENCE_UI_REVIEW package).
 * Starts a local static server for coach-calculator/.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COACH_DIR = path.join(ROOT, 'coach-calculator');
const PROFILE_PATH = path.join(ROOT, 'reports', 'coach-calculator-restoration', 'xavier-profile-export.json');

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ({
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.pdf': 'application/pdf',
  })[ext] || 'application/octet-stream';
}

function startServer(rootDir) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    let rel = decodeURIComponent(url.pathname || '/');
    if (!rel || rel === '/') rel = '/index.html';
    const safeRel = path.normalize(rel).replace(/^(\.\.[/\\])+/, '').replace(/^[/\\]+/, '');
    const filePath = path.join(rootDir, safeRel);
    if (!filePath.startsWith(rootDir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType(filePath) });
    fs.createReadStream(filePath).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, origin: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

const { server, origin } = await startServer(COACH_DIR);
const virtualConsole = new VirtualConsole();
const runtimeErrors = [];
virtualConsole.on('jsdomError', (error) => {
  if (!String(error.message).includes('Not implemented: HTMLCanvasElement')) runtimeErrors.push(error.message);
});
virtualConsole.on('error', (message) => {
  if (!String(message).startsWith('coach-data.json:')) runtimeErrors.push(String(message));
});

try {
  const dom = await JSDOM.fromURL(`${origin}/`, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    virtualConsole,
  });

  await new Promise((resolve) => {
    if (dom.window.document.readyState === 'complete') return resolve();
    dom.window.addEventListener('load', resolve, { once: true });
  });
  await new Promise((resolve) => setTimeout(resolve, 300));
  await dom.window.waitForFunction
    ? null
    : null;
  await new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      if (dom.window.COACH_DATA?.totalFoods === 287) return resolve();
      if (Date.now() - started > 15000) return resolve();
      setTimeout(tick, 50);
    };
    tick();
  });

  const { window } = dom;
  const { document } = window;
  window.alert = () => {};
  window.confirm = () => true;

  function setValue(id, value) {
    const el = document.getElementById(id);
    assert.ok(el, `missing #${id}`);
    el.value = String(value);
  }

  function runScenario({ sexe, age, kg, cm, activite, method = 'nasem2023' }) {
    setValue('sexe', sexe);
    setValue('age', age);
    setValue('poids_unit', 'kg');
    setValue('poids', kg);
    setValue('grandeur_unit', 'cm');
    setValue('grandeur_cm', cm);
    setValue('activite', activite);
    window.changerMethodeEnergetique(method);
    return Number(document.getElementById('tdee-out').textContent);
  }

  const scenarios = [
    { input: { sexe: 'H', age: 30, kg: 83.9146, cm: 180, activite: 'modere' }, expected: 3189 },
    { input: { sexe: 'F', age: 37, kg: 63.5029, cm: 160, activite: 'modere' }, expected: 2281 },
    { input: { sexe: 'H', age: 40, kg: 68.0389, cm: 172.72, activite: 'modere' }, expected: 2780 },
    { input: { sexe: 'F', age: 75, kg: 60, cm: 160, activite: 'sedentaire' }, expected: 1677 },
    { input: { sexe: 'H', age: 17, kg: 70, cm: 175, activite: 'modere' }, expected: 3342 },
  ];

  const nasemCoefficients = {
    H: {
      youth: {
        sedentaire: [-447.51, 3.68, 13.01, 13.15], leger: [19.12, 3.68, 8.62, 20.28],
        modere: [-388.19, 3.68, 12.66, 20.46], actif: [-671.75, 3.68, 15.38, 23.25],
      },
      adult: {
        sedentaire: [753.07, -10.83, 6.50, 14.10], leger: [581.47, -10.83, 8.30, 14.94],
        modere: [1004.82, -10.83, 6.52, 15.91], actif: [-517.88, -10.83, 15.61, 19.11],
      },
    },
    F: {
      youth: {
        sedentaire: [55.59, -22.25, 8.43, 17.07], leger: [-297.54, -22.25, 12.77, 14.73],
        modere: [-189.55, -22.25, 11.74, 18.34], actif: [-709.59, -22.25, 18.22, 14.25],
      },
      adult: {
        sedentaire: [584.90, -7.01, 5.72, 11.71], leger: [575.77, -7.01, 6.60, 12.14],
        modere: [710.25, -7.01, 6.54, 12.34], actif: [511.83, -7.01, 9.07, 12.56],
      },
    },
  };

  function growthAllowance(sexe, age) {
    if (age === 3) return sexe === 'H' ? 20 : 15;
    if (age <= 8) return 15;
    if (age <= 13) return sexe === 'H' ? 25 : 30;
    return 20;
  }

  function referenceNasem({ sexe, age, kg, cm, activite }) {
    const youth = age < 19;
    const [constant, ageFactor, heightFactor, weightFactor] =
      nasemCoefficients[sexe][youth ? 'youth' : 'adult'][activite];
    return Math.round(
      constant + ageFactor * age + heightFactor * cm + weightFactor * kg + (youth ? growthAllowance(sexe, age) : 0),
    );
  }

  for (const scenario of scenarios) {
    assert.equal(runScenario(scenario.input), scenario.expected, JSON.stringify(scenario.input));
  }

  let matrixChecks = 0;
  for (const sexe of ['H', 'F']) {
    for (const age of [5, 13, 18, 19, 40, 75]) {
      const kg = age < 10 ? 24 : age < 15 ? 48 : sexe === 'H' ? 82 : 64;
      const cm = age < 10 ? 122 : age < 15 ? 158 : sexe === 'H' ? 180 : 165;
      let previous = 0;
      for (const activite of ['sedentaire', 'leger', 'modere', 'actif']) {
        const input = { sexe, age, kg, cm, activite };
        const actual = runScenario(input);
        assert.equal(actual, referenceNasem(input), `NASEM matrix ${JSON.stringify(input)}`);
        assert.ok(actual > previous, `activity should increase EER ${JSON.stringify(input)}`);
        previous = actual;
        matrixChecks += 1;
      }
    }
  }

  setValue('sexe', 'H');
  setValue('age', 40);
  setValue('poids_unit', 'lbs');
  setValue('poids', 180.779);
  setValue('grandeur_unit', 'ft');
  setValue('grandeur_ft', 5);
  setValue('grandeur_in', 10.866);
  setValue('activite', 'modere');
  window.changerMethodeEnergetique('nasem2023');
  assert.equal(
    Number(document.getElementById('tdee-out').textContent),
    referenceNasem({ sexe: 'H', age: 40, kg: 82, cm: 180, activite: 'modere' }),
  );

  assert.equal(
    runScenario({ sexe: 'H', age: 30, kg: 83.9146, cm: 180, activite: 'modere', method: 'iom2005' }),
    3259,
    'IOM 2005 historical result must remain reproducible',
  );

  runScenario({ sexe: 'H', age: 17, kg: 70, cm: 175, activite: 'modere' });
  assert.equal(document.querySelector('.goal-card.active')?.dataset.multiplier, '1.0');
  assert.match(document.getElementById('scientific-scope').textContent, /Mineur/);

  runScenario({ sexe: 'H', age: 36, kg: 95.25, cm: 185.42, activite: 'modere' });
  const target = window.computeTargetsForJour('entrainement');
  assert.equal(target.kcal, target.pro * 4 + target.glu * 4 + target.lip * 9);
  assert.ok(target.pro > 0 && target.glu > 0 && target.lip > 0);

  const legacy = JSON.parse(fs.readFileSync(PROFILE_PATH, 'utf8'));
  assert.equal(window.migrateProfilData(legacy).energyEquationVersion, legacy.energyEquationVersion === 'nasem2023' ? 'nasem2023' : 'iom2005');
  legacy.energyEquationVersion = 'nasem2023';
  window.appliquerProfilData(legacy, 'Xavier Tremblay');
  const saved = window.getProfilData('Xavier Tremblay');
  assert.equal(saved.version, 3);
  assert.equal(saved.energyEquationVersion, 'nasem2023');

  const training = window.getJourSnapshot('entrainement');
  const rest = window.getClientPdfRestSnapshot();
  const pdfHtml = window.buildFullPDFHTML(training, rest, 'Xavier Tremblay', '2026-07-31', 'Maintien', 'Maintien');
  assert.match(pdfHtml, /pdf-brand-header/);
  assert.match(pdfHtml, /#071B41/);
  assert.match(pdfHtml, /#ED1136/);
  assert.match(pdfHtml, /data:image\/png;base64,/);
  assert.equal((pdfHtml.match(/<div class="pdf-a4-page">/g) || []).length, rest ? 2 : 1);

  const html = fs.readFileSync(path.join(COACH_DIR, 'index.html'), 'utf8');
  assert.match(html, /linear-gradient\(135deg,#071B41/);
  assert.match(html, /window\.FEATURE_DA_ENABLED = false/);
  assert.match(html, /287 \/ 287 aliments vérifiés|287 aliments vérifiés/);
  assert.equal(runtimeErrors.length, 0, runtimeErrors.join('\n'));

  console.log(`PASS ${scenarios.length + matrixChecks + 11} checks — energy matrix, unit parity, macros, profiles, branding, PDF structure, protected mode`);
  dom.window.close();
} finally {
  server.close();
}
