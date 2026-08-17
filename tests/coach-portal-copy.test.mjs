/**
 * Production-facing Coach portal copy (no "fictif" / demo wording in UI strings).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildWorkspaceStubProfile } from '../src/coach/workspace/workspace-client-stub.mjs';
import {
  PUBLIC_SITE_RETURN_LABEL,
  PUBLIC_SITE_URL,
} from '../coach-portal/assets/public-site.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('login page has a real return link to the public KR Kinetics site', () => {
  const html = fs.readFileSync(path.join(root, 'coach-portal/login.html'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'coach-portal/assets/portal.css'), 'utf8');
  const titleIdx = html.indexOf('<h1>Connexion Coach</h1>');
  const linkIdx = html.indexOf('class="public-site-return"');
  assert.ok(titleIdx > -1, 'expected Connexion Coach title');
  assert.ok(linkIdx > -1 && linkIdx < titleIdx, 'return link must appear above Connexion Coach');
  assert.match(
    html,
    new RegExp(
      `<a\\s+class="public-site-return"\\s+href="${PUBLIC_SITE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}">\\s*${PUBLIC_SITE_RETURN_LABEL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*</a>`,
    ),
  );
  assert.doesNotMatch(html, /public-site-return[^>]*target=/i);
  assert.doesNotMatch(html, /history\.back\s*\(/);
  assert.equal(PUBLIC_SITE_URL, 'https://www.krkinetics.com/fr');
  assert.equal(PUBLIC_SITE_RETURN_LABEL, '← Retour au site KR Kinetics');
  assert.match(css, /\.public-site-return:hover\b/);
  assert.match(css, /\.public-site-return:focus-visible\b/);
});

test('dashboard HTML uses production client copy', () => {
  const html = fs.readFileSync(path.join(root, 'coach-portal/dashboard.html'), 'utf8');
  assert.match(html, /Nouveau client</);
  assert.match(html, /placeholder="Nom complet du client"/);
  assert.match(html, /placeholder="Notes internes — facultatif"/);
  assert.match(html, /Clients classés par service, pré-entrevues et structure alimentaire\./);
  assert.match(html, /<label for="service_type">Service<\/label>/);
  assert.doesNotMatch(html, /fictif|fictive|Client démo|Données de test uniquement|isolés par RLS/i);
});

test('dashboard JS status and confirm copy is production-facing and creates real clients', () => {
  const src = fs.readFileSync(path.join(root, 'coach-portal/assets/dashboard.js'), 'utf8');
  assert.match(src, /Session active — accès sécurisé à votre organisation\./);
  assert.match(src, /Aucun client/);
  assert.match(src, /Client créé dans votre organisation seulement\./);
  assert.match(src, /Supprimer ce client \?/);
  assert.match(src, /Client supprimé\./);
  assert.match(src, /editDialog\.showModal\(\)/);
  assert.match(src, /Client mis à jour\./);
  assert.doesNotMatch(src, /fictif|fictive|isolation RLS|Client démo|Données de test/i);
  assert.match(src, /is_fictional:\s*false/);
  assert.doesNotMatch(src, /is_fictional:\s*true/);
});

test('workspace bootstrap missing-client banner omits fictif wording', () => {
  const src = fs.readFileSync(path.join(root, 'coach-portal/assets/workspace-bootstrap.mjs'), 'utf8');
  assert.match(src, /Ouvrez un client depuis le portail/);
  assert.doesNotMatch(src, /client fictif/i);
  assert.match(src, /\.eq\('is_fictional', false\)/);
});

test('workspace stub defaults omit fictif wording from visible fields and identify a real dossier', () => {
  const stub = buildWorkspaceStubProfile({ fullName: '', notes: '' });
  assert.equal(stub.nom, 'Client');
  assert.equal(stub.coachNotes, 'Dossier client — à compléter avec le coach.');
  assert.equal(stub.workspaceMeta.fictional, false);
  assert.doesNotMatch(stub.nom, /fictif/i);
  assert.doesNotMatch(stub.coachNotes, /fictif/i);
  const withNotes = buildWorkspaceStubProfile({ fullName: 'Alex', notes: 'Hydratation' });
  assert.equal(withNotes.coachNotes, 'Dossier client — Hydratation');
  assert.equal(withNotes.workspaceMeta.fictional, false);
});
