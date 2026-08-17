/**
 * Screen markup for the official Coach motivation report.
 * Formats a view-model only — never recalculates the engine.
 */

import { formatCoachDateTime } from '../lib/report-timestamp.mjs';

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

function formatDate(value) {
  return formatCoachDateTime(value);
}

function barPercent(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}

function heroMarkup(vm, logoSrc) {
  const logo = logoSrc
    ? `<div class="motivation-hero-brand"><div class="intake-report-logo-wrap motivation-hero-logo"><img src="${esc(logoSrc)}" alt="KR Kinetics"></div></div>`
    : '';
  const submitted = formatDate(vm.submittedAt || vm.hero?.submittedAt);
  const analyzed = formatDate(vm.analyzedAt || vm.hero?.analyzedAt);
  const version = vm.analysisVersion ?? vm.hero?.analysisVersion;
  return `
    <header class="motivation-hero" data-section="hero">
      ${logo}
      <p class="motivation-kicker">KR Kinetics</p>
      <h1 class="motivation-title">${esc(vm.title || 'Profil motivationnel')}</h1>
      <p class="motivation-identity-kicker">Athlète</p>
      <p class="motivation-client">${esc(vm.identity?.fullName || vm.clientName || '')}</p>
      <div class="motivation-hero-meta">
        ${vm.identity?.email ? `<p>Courriel : <strong>${esc(vm.identity.email)}</strong></p>` : ''}
        ${vm.identity?.phone ? `<p>Téléphone : <strong>${esc(vm.identity.phone)}</strong></p>` : ''}
        ${vm.identity?.serviceType ? `<p>Service : <strong>${esc(vm.identity.serviceType)}</strong></p>` : ''}
        ${vm.identity?.shortId ? `<p>Réf. : <strong>${esc(vm.identity.shortId)}</strong></p>` : ''}
        ${submitted ? `<p>Soumis le : <strong>${esc(submitted)}</strong></p>` : ''}
        ${analyzed ? `<p>Analysé le : <strong>${esc(analyzed)}</strong></p>` : ''}
        ${version != null ? `<span class="motivation-badge">Analyse v${esc(version)}</span>` : ''}
        ${vm.reportConfidence?.coachLabel || vm.hero?.reportConfidence?.coachLabel
          ? `<span class="motivation-badge motivation-badge-confidence">${esc(vm.reportConfidence?.coachLabel || vm.hero.reportConfidence.coachLabel)}</span>`
          : ''}
      </div>
    </header>
  `;
}

function quickReadMarkup(items) {
  if (!items?.length) return '';
  return `
    <section class="motivation-card motivation-quick-read" data-section="quick-read">
      <h2 class="motivation-section-title">Lecture rapide</h2>
      <div class="motivation-quick-grid">
        ${items.map((item) => `
          <article class="motivation-quick-item" data-quick="${esc(item.id)}">
            <p class="motivation-quick-label">${esc(item.label)}</p>
            <p class="motivation-quick-value">${esc(item.value)}</p>
            ${item.justification ? `<p class="motivation-quick-why">${esc(item.justification)}</p>` : ''}
          </article>
        `).join('')}
      </div>
    </section>
  `;
}

function summaryMarkup(lines, supports) {
  if (!lines?.length && !supports?.length) return '';
  return `
    <section class="motivation-card" data-section="summary">
      <h2 class="motivation-section-title">Synthèse</h2>
      ${(lines || []).map((line) => `<p class="motivation-prose">${esc(line)}</p>`).join('')}
      ${supports?.length ? `
        <div class="motivation-supports">
          <h3>Appuis</h3>
          <ul class="motivation-report-list">${supports.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>
        </div>
      ` : ''}
    </section>
  `;
}

function numberedMarkup(id, title, items, extraClass = '') {
  if (!items?.length) return '';
  return `
    <section class="motivation-card ${extraClass}" data-section="${esc(id)}">
      <h2 class="motivation-section-title">${esc(title)}</h2>
      <ol class="motivation-priority-list">
        ${items.map((item) => `<li>${esc(item)}</li>`).join('')}
      </ol>
    </section>
  `;
}

function vigilanceMarkup(items) {
  if (!items?.length) return '';
  return `
    <section class="motivation-card motivation-vigilance" data-section="vigilance">
      <h2 class="motivation-section-title">Points de vigilance</h2>
      <div class="motivation-vigilance-grid">
        ${items.map((item) => `<article class="motivation-vigilance-item">${esc(item)}</article>`).join('')}
      </div>
    </section>
  `;
}

function interviewMarkup(items) {
  if (!items?.length) return '';
  return `
    <section class="motivation-card" data-section="interview">
      <h2 class="motivation-section-title">À clarifier en entrevue</h2>
      <ul class="motivation-checklist">
        ${items.map((item) => `<li><span class="motivation-check" aria-hidden="true"></span><span>${esc(item)}</span></li>`).join('')}
      </ul>
    </section>
  `;
}

function dimensionRowMarkup(row) {
  const score = row.score;
  const now = score == null || score === '' ? '' : String(score);
  const tendency = row.tendency || row.displayLabel || '—';
  const confidence = row.confidenceStatus || row.evidenceBadge || row.confidence || '';
  const pct = barPercent(row.technicalScore ?? score);
  const direction = row.signalDirection || 'neutral';
  return `
    <div class="motivation-dimension" data-dimension="${esc(row.id || row.label)}" data-direction="${esc(direction)}" data-claim="${esc(row.claimStrength || '')}">
      <div class="motivation-dimension-head">
        <p class="motivation-dimension-name">${esc(row.label)}</p>
        <p class="motivation-dimension-score">${esc(tendency)}</p>
      </div>
      ${confidence ? `<p class="motivation-dimension-confidence">Statut : ${esc(confidence)}</p>` : ''}
      ${row.technicalDirection ? `<p class="motivation-dimension-confidence">${esc(row.technicalDirection)}</p>` : ''}
      <div
        class="motivation-dimension-track"
        role="progressbar"
        aria-valuemin="0"
        aria-valuemax="100"
        ${now === '' ? '' : `aria-valuenow="${esc(now)}"`}
        aria-label="${esc(row.label)}"
      >
        <span class="motivation-dimension-bar motivation-dimension-bar-${esc(direction)}" style="width:${pct}%"></span>
      </div>
      ${row.coachMeaning || row.interpretation ? `<p class="motivation-dimension-meaning">${esc(row.coachMeaning || row.interpretation)}</p>` : ''}
    </div>
  `;
}

function dimensionsMarkup(vm) {
  const factors = vm.decisionFactors?.length ? vm.decisionFactors : (vm.dimensions || []).slice(0, 8);
  const groups = vm.dimensionGroups || [];
  if (!factors.length && !groups.length) return '';
  return `
    <section class="motivation-card" data-section="dimensions">
      <h2 class="motivation-section-title">Facteurs de décision</h2>
      <div class="motivation-dimension-list">
        ${factors.map(dimensionRowMarkup).join('')}
      </div>
      ${groups.length ? `
        <details class="motivation-all-dimensions">
          <summary>Voir les 20 dimensions</summary>
          ${groups.map((group) => `
            <h3>${esc(group.title)}</h3>
            <div class="motivation-dimension-list">
              ${group.items.map(dimensionRowMarkup).join('')}
            </div>
          `).join('')}
        </details>
      ` : ''}
    </section>
  `;
}

function nutritionList(title, items) {
  if (!items?.length) return '';
  return `<h3>${esc(title)}</h3><ul class="motivation-report-list">${items.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>`;
}

function nutritionMarkup(nutrition, action = null, organized = null) {
  if (action?.cards?.length) {
    return `
      <section class="motivation-card" data-section="nutrition">
        <h2 class="motivation-section-title">Nutrition</h2>
        ${action.cards.map((card) => `
          <article class="motivation-nutrition-card" data-stance="${esc(card.stance || '')}">
            <h3>${esc(card.title)} <span class="motivation-evidence">${esc(card.stance || '')}</span></h3>
            ${card.athleteSaid ? `<p class="motivation-prose"><strong>Ce que l'athlète a dit.</strong> ${esc(card.athleteSaid)}</p>` : ''}
            ${card.suggested ? `<p class="motivation-prose"><strong>Ce que ça suggère.</strong> ${esc(card.suggested)}</p>` : ''}
            ${card.toTest ? `<p class="motivation-prose"><strong>À tester.</strong> ${esc(card.toTest)}</p>` : ''}
          </article>
        `).join('')}
      </section>
    `;
  }
  const blocks = organized || nutrition;
  if (!blocks) return '';
  const parts = [
    nutritionList('Ce que l\'athlète a dit', blocks.said),
    nutritionList('Ce que ça suggère', blocks.suggested || blocks.lecture),
    nutritionList('À confirmer', blocks.confirm),
    nutritionList('À tester', blocks.test || blocks.actions),
    nutritionList('Obstacles', blocks.obstacles),
  ].filter(Boolean);
  if (blocks.structure && !blocks.confirm?.length) {
    parts.splice(2, 0, `<h3>Structure suggérée</h3><p class="motivation-prose">${esc(blocks.structure)}</p>`);
  }
  if (!parts.length) return '';
  return `
    <section class="motivation-card" data-section="nutrition">
      <h2 class="motivation-section-title">Nutrition</h2>
      ${blocks.evidenceNote ? `<p class="motivation-evidence">${esc(blocks.evidenceNote)}</p>` : ''}
      ${parts.join('')}
    </section>
  `;
}

function weekPlanMarkup(weeks, testable = null) {
  if (!weeks?.length) return '';
  const historical = testable === false
    || (testable == null && !weeks.every((week) => week.observe && week.validationCriterion));
  return `
    <section class="motivation-card" data-section="four-week-plan">
      <h2 class="motivation-section-title">Plan 4 semaines</h2>
      ${historical ? '<p class="motivation-plan-legacy">Plan issu de l\'analyse historique</p>' : ''}
      <div class="motivation-week-grid">
        ${weeks.map((week) => `
          <article class="motivation-week-card" data-week="${esc(week.week)}">
            <p class="motivation-week-kicker">Semaine ${esc(week.week)}</p>
            <h3>${esc(week.title || `Semaine ${week.week}`)}</h3>
            ${!historical && week.objective ? `<p class="motivation-prose"><strong>Objectif.</strong> ${esc(week.objective)}</p>` : ''}
            ${!historical && week.coachAction ? `<p class="motivation-prose"><strong>Action Coach.</strong> ${esc(week.coachAction)}</p>` : ''}
            ${!historical && week.observe ? `<p class="motivation-prose"><strong>Ce qu'on observe.</strong> ${esc(week.observe)}</p>` : ''}
            ${!historical && week.validationCriterion ? `<p class="motivation-prose"><strong>Critère de validation.</strong> ${esc(week.validationCriterion)}</p>` : ''}
            ${historical && (week.objective || week.focus) ? `<p class="motivation-prose">${esc(week.objective || week.focus)}</p>` : ''}
            ${historical && week.actions?.length ? `<ul class="motivation-report-list">${week.actions.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>` : ''}
            ${historical && week.observe ? `<p class="motivation-prose"><strong>Observer.</strong> ${esc(week.observe)}</p>` : ''}
            ${historical && week.validationCriterion ? `<p class="motivation-prose"><strong>Validation.</strong> ${esc(week.validationCriterion)}</p>` : ''}
          </article>
        `).join('')}
      </div>
    </section>
  `;
}

function verbatimMarkup(items) {
  if (!items?.length) return '';
  return `
    <section class="motivation-card" data-section="verbatims">
      <h2 class="motivation-section-title">Voix de l'athlète</h2>
      ${items.map((item) => `
        <blockquote class="motivation-verbatim">
          <p class="motivation-verbatim-kicker">Verbatim client</p>
          <p class="motivation-verbatim-quote">« ${esc(item.verbatim)} »</p>
          <p class="motivation-verbatim-source">Question source : ${esc(item.questionText || item.questionCode)}</p>
        </blockquote>
      `).join('')}
    </section>
  `;
}

function technicalMarkup(provenance) {
  const rows = [
    ['Questionnaire', provenance.questionnaireVersion],
    ['Ruleset', provenance.rulesetVersion],
    ['Modèle de rapport', provenance.reportModelVersion],
    ['Version d’analyse', provenance.analysisVersion != null ? String(provenance.analysisVersion) : ''],
    ['Empreinte', provenance.contentHash],
    ['Renderer PDF', provenance.pdfRenderer],
    ['Soumission', formatDate(provenance.submittedAt)],
    ['Analyse', formatDate(provenance.analyzedAt)],
  ].filter(([, value]) => value);
  if (!rows.length) return '';
  return `
    <section class="motivation-card motivation-report-tech" data-section="technical">
      <details>
        <summary class="motivation-section-title">Informations techniques</summary>
        ${rows.map(([label, value]) => `
          <div class="intake-report-row">
            <p class="intake-report-label">${esc(label)}</p>
            <p class="intake-report-answer">${esc(value)}</p>
          </div>
        `).join('')}
      </details>
    </section>
  `;
}

function portraitMarkup(sections) {
  if (!sections?.length) return '';
  return `
    <section class="motivation-card" data-section="portrait-coach">
      <h2 class="motivation-section-title">Mode d'emploi de l'athlète</h2>
      ${sections.map((section) => `
        <article class="motivation-portrait-block">
          <h3>${esc(section.title)}</h3>
          ${(section.paragraphs || []).map((line) => `<p class="motivation-prose">${esc(line)}</p>`).join('')}
        </article>
      `).join('')}
    </section>
  `;
}

function briefMarkup(brief) {
  if (!brief) return '';
  const rows = [
    ['Objectif prioritaire', brief.primaryGoal],
    ['Pourquoi maintenant', brief.whyNow],
    ['Définition de réussite', brief.successDefinition],
    ['Reprise', brief.recoveryStrategy],
    ['Structure', brief.structurePreference],
    ['Choix', brief.choicePreference],
    ['Communication', brief.communicationPreference],
    ['Focus alimentaire', brief.nutritionFocus],
  ].filter(([, value]) => value);
  if (!rows.length) return '';
  return `
    <section class="motivation-card" data-section="operating-brief">
      <h2 class="motivation-section-title">Synthèse opérationnelle</h2>
      ${rows.map(([label, value]) => `
        <div class="intake-report-row">
          <p class="intake-report-label">${esc(label)}</p>
          <p class="intake-report-answer">${esc(value)}</p>
        </div>
      `).join('')}
    </section>
  `;
}

function riskBucketsMarkup(buckets, conflicts) {
  if (!buckets && !conflicts?.length) return '';
  const blocks = [
    ['Risques à prévenir', buckets?.risksToPrevent, 'risks'],
    ['Hypothèses à tester', buckets?.hypothesesToTest, 'hypotheses'],
    ['Contradictions à résoudre', buckets?.contradictionsToResolve, 'contradictions'],
  ].filter(([, items]) => items?.length);
  return `
    <section class="motivation-card motivation-vigilance" data-section="risk-buckets">
      <h2 class="motivation-section-title">Risques / hypothèses à valider</h2>
      ${blocks.map(([title, items, id]) => `
        <div class="motivation-risk-bucket" data-bucket="${esc(id)}">
          <h3>${esc(title)}</h3>
          <ul class="motivation-report-list">${items.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>
        </div>
      `).join('')}
      ${(conflicts || []).map((item) => `
        <article class="motivation-conflict">
          <h3>${esc(item.title || 'CONTRADICTION À CLARIFIER')}</h3>
          ${item.sourceA ? `<p class="motivation-prose"><strong>Source A.</strong> ${esc(item.sourceA)}</p>` : ''}
          ${item.sourceB ? `<p class="motivation-prose"><strong>Source B.</strong> ${esc(item.sourceB)}</p>` : ''}
          ${item.coachImplication ? `<p class="motivation-prose">${esc(item.coachImplication)}</p>` : ''}
          ${item.validationQuestion ? `<p class="motivation-conflict-q">${esc(item.validationQuestion)}</p>` : ''}
        </article>
      `).join('')}
    </section>
  `;
}

function interviewDetailedMarkup(items) {
  if (!items?.length) return '';
  return `
    <section class="motivation-card" data-section="interview">
      <h2 class="motivation-section-title">Préparer l'entrevue</h2>
      <ul class="motivation-checklist">
        ${items.map((item) => `
          <li>
            <span class="motivation-check" aria-hidden="true"></span>
            <span>
              ${esc(item.text || item)}
              ${item.whyItMatters ? `<small class="motivation-interview-why">${esc(item.whyItMatters)}</small>` : ''}
            </span>
          </li>
        `).join('')}
      </ul>
    </section>
  `;
}

export function buildMotivationReportMarkup(viewModel, { logoSrc = '' } = {}) {
  const vm = viewModel || {};
  return `
    <article class="intake-report motivation-report">
      ${heroMarkup(vm, logoSrc)}
      <div class="motivation-report-body">
        ${quickReadMarkup(vm.quickRead)}
        ${vm.coachDecisionBrief ? `
        <section class="motivation-card" data-section="decision-brief">
          <h2 class="motivation-section-title">Brief de coaching</h2>
          ${vm.coachDecisionBrief.athleteGoal ? `<p class="motivation-prose"><strong>Objectif de l'athlète.</strong> « ${esc(vm.coachDecisionBrief.athleteGoal)} »</p>` : ''}
          ${vm.coachDecisionBrief.successDescribed ? `<p class="motivation-prose"><strong>Réussite décrite.</strong> « ${esc(vm.coachDecisionBrief.successDescribed)} »</p>` : ''}
          <p class="motivation-prose"><strong>Pourquoi maintenant.</strong> ${esc(vm.coachDecisionBrief.whyNowCaptured ? vm.coachDecisionBrief.whyNow : 'À clarifier en entrevue')}</p>
          ${vm.coachDecisionBrief.startActions?.length ? `<h3>Dès le départ</h3><ol class="motivation-priority-list">${vm.coachDecisionBrief.startActions.map((item) => `<li>${esc(item)}</li>`).join('')}</ol>` : ''}
          ${vm.coachDecisionBrief.avoidAtStart?.length ? `<h3>À éviter au départ</h3><ul class="motivation-report-list">${vm.coachDecisionBrief.avoidAtStart.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>` : ''}
          ${vm.coachDecisionBrief.confirmNow?.length ? `<h3>À confirmer</h3><ul class="motivation-report-list">${vm.coachDecisionBrief.confirmNow.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>` : ''}
        </section>` : ''}
        ${portraitMarkup(vm.portraitCoach)}
        ${briefMarkup(vm.athleteOperatingBrief)}
        ${numberedMarkup('priorities', 'Priorités Coach', vm.coachPriorities, 'motivation-priorities')}
        ${riskBucketsMarkup(vm.riskBuckets, vm.conflicts)}
        ${interviewDetailedMarkup(vm.interviewDetailed?.length ? vm.interviewDetailed : vm.interviewQuestions)}
        ${verbatimMarkup(vm.verbatims)}
        ${dimensionsMarkup(vm)}
        ${nutritionMarkup(vm.nutrition, vm.nutritionAction, vm.nutritionOrganized)}
        ${weekPlanMarkup(vm.fourWeekPlan, vm.fourWeekPlanTestable)}
        ${technicalMarkup(vm.provenance || vm.technical || {})}
      </div>
      <footer class="motivation-report-footer">Confidentiel — usage Coach KR Kinetics. Outil de coaching, non médical, non diagnostique.</footer>
    </article>
  `;
}
