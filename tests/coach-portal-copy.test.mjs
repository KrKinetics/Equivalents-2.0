/**
 * Production-facing Coach portal copy (no "fictif" / demo wording in UI strings).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildWorkspaceStubProfile } from '../src/coach/workspace/workspace-client-stub.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('dashboard HTML uses production client copy', () => {
  const html = fs.readFileSync(path.join(root, 'coach-portal/dashboard.html'), 'utf8');
  assert.match(html, /Nouveau client</);
  assert.match(html, /placeholder="Nom complet du client"/);
  assert.match(html, /placeholder="Notes internes — facultatif"/);
  assert.match(
    html,
    /Organisation connectée, rôle et clients isolés et protégés par organisation\./,
  );
  assert.doesNotMatch(html, /fictif|fictive|Client démo|Données de test uniquement|isolés par RLS/i);
});

test('dashboard JS status and confirm copy is production-facing', () => {
  const src = fs.readFileSync(path.join(root, 'coach-portal/assets/dashboard.js'), 'utf8');
  assert.match(src, /Session active — accès sécurisé à votre organisation\./);
  assert.match(src, /Aucun client pour cette organisation\./);
  assert.match(src, /Client créé dans votre organisation seulement\./);
  assert.match(src, /Supprimer ce client \?/);
  assert.match(src, /Client supprimé\./);
  assert.match(src, /Nom du client :/);
  assert.match(src, /Client mis à jour\./);
  assert.doesNotMatch(src, /fictif|fictive|isolation RLS|Client démo|Données de test/i);
  // Technical column remains for Supabase insert; must not appear in UI string literals above.
  assert.match(src, /is_fictional:\s*true/);
});

test('workspace bootstrap missing-client banner omits fictif wording', () => {
  const src = fs.readFileSync(path.join(root, 'coach-portal/assets/workspace-bootstrap.mjs'), 'utf8');
  assert.match(src, /Ouvrez un client depuis le portail/);
  assert.doesNotMatch(src, /client fictif/i);
});

test('workspace stub defaults omit fictif wording from visible fields', () => {
  const stub = buildWorkspaceStubProfile({ fullName: '', notes: '' });
  assert.equal(stub.nom, 'Client');
  assert.equal(stub.coachNotes, 'Dossier client — à compléter avec le coach.');
  assert.doesNotMatch(stub.nom, /fictif/i);
  assert.doesNotMatch(stub.coachNotes, /fictif/i);
  const withNotes = buildWorkspaceStubProfile({ fullName: 'Alex', notes: 'Hydratation' });
  assert.equal(withNotes.coachNotes, 'Dossier client — Hydratation');
});
