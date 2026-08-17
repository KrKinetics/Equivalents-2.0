import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeCompleteMotivationProfileV42,
  V42_DANNY_LIKE,
} from '../../src/coach/motivation/fixtures/complete-profiles-v42.mjs';
import { buildCanonicalClientIdentity } from '../../src/coach/motivation/identity/canonical-client-identity.mjs';
import { buildMotivationReportViewModel } from '../../src/coach/motivation/report/motivation-report-view-model.mjs';
import { buildMotivationReportPresentation } from '../../src/coach/motivation/report/build-motivation-report-presentation.mjs';

const DANNY = {
  id: '5a94561a-1111-4111-8111-aaaaaaaaaaaa',
  full_name: 'Danny R',
  email: 'danny@example.com',
  phone: '5145550100',
  service_type: 'complete',
};

function dannyViewModel() {
  const { result } = analyzeCompleteMotivationProfileV42(V42_DANNY_LIKE, {
    assessmentId: 'asm_danny_2g',
    clientId: DANNY.id,
    clientName: DANNY.full_name,
    completedAt: new Date('2026-08-16T12:00:00.000Z'),
  });
  return buildMotivationReportViewModel({
    report: result.report,
    identity: buildCanonicalClientIdentity(DANNY).identity,
    clientId: DANNY.id,
    clientName: DANNY.full_name,
    analysisVersion: 1,
    submittedAt: '2026-08-16T12:00:00.000Z',
    analyzedAt: '2026-08-16T12:05:00.000Z',
    provenance: result.provenance,
  });
}

test('Danny narrative polish removes mechanical phrases without mutating the snapshot', () => {
  const before = JSON.stringify(V42_DANNY_LIKE);
  const vm = dannyViewModel();
  const presentation = buildMotivationReportPresentation(vm);
  assert.equal(JSON.stringify(V42_DANNY_LIKE), before);
  const narrative = (presentation.narrative?.paragraphs || []).join(' ');
  assert.doesNotMatch(narrative, /restent hypothétiques/i);
  assert.doesNotMatch(narrative, /Les éléments les plus solides concernent/i);
  assert.doesNotMatch(narrative, /laisse penser que rigidité/i);
  assert.doesNotMatch(narrative, /laisse penser que régularité/i);
  assert.doesNotMatch(narrative, /convient; à confirmer/i);
  if (vm.coachNarrative?.paragraphs?.some((line) => /planification alimentaire|signal le mieux appuyé/i.test(line))) {
    assert.match(narrative, /demeurent toutefois à confirmer|signal le mieux appuyé/i);
  }
  for (const item of vm.interviewDetailed || []) {
    if (/budget|co[uû]t|stress|famil|horaire/i.test(item.text)) {
      assert.notEqual(item.whyItMatters, 'Identifie le moment et le contexte où l\'adhésion casse.');
    }
  }
  for (const priority of vm.coachPriorities || []) {
    assert.match(priority, /^(Planifier|Ancrer|Observer|Tester|Clarifier|Définir|Valider|Identifier|Choisir|Confirmer|Construire|Préciser|Repérer|Vérifier|Comparer|Ajuster|Déterminer|Créer|Réserver|Noter|Évaluer|Mesurer|Donner|Présenter|Utiliser|Privilégier|Éviter|Commencer|Transformer|Voir|Garder|Relier|Calibrer|Revoir)\b/);
  }
  const joinedStatus = (vm.dimensions || []).map((row) => `${row.displayLabel} · ${row.confidenceStatus || row.statusLabel || ''}`).join('\n');
  assert.doesNotMatch(joinedStatus, /Tendance à confirmer\s*·\s*À CONFIRMER/);
});
