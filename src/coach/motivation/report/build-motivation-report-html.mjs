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
      <p class="motivation-client">${esc(vm.clientName || 'Client')}</p>
      <div class="motivation-hero-meta">
        ${submitted ? `<p>Soumis le : <strong>${esc(submitted)}</strong></p>` : ''}
        ${analyzed ? `<p>Analysé le : <strong>${esc(analyzed)}</strong></p>` : ''}
        ${version != null ? `<span class="motivation-badge">Analyse v${esc(version)}</span>` : ''}
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

function dimensionsMarkup(dimensions) {
  if (!dimensions?.length) return '';
  return `
    <section class="motivation-card" data-section="dimensions">
      <h2 class="motivation-section-title">Dimensions</h2>
      <div class="motivation-dimension-list">
        ${dimensions.map((row) => {
          const score = row.score;
          const now = score == null || score === '' ? '' : String(score);
          const pct = barPercent(score);
          return `
            <div class="motivation-dimension" data-dimension="${esc(row.id || row.label)}">
              <div class="motivation-dimension-head">
                <p class="motivation-dimension-name">${esc(row.label)}</p>
                <p class="motivation-dimension-score">${esc(now === '' ? '—' : now)}</p>
              </div>
              <div
                class="motivation-dimension-track"
                role="progressbar"
                aria-valuemin="0"
                aria-valuemax="100"
                ${now === '' ? '' : `aria-valuenow="${esc(now)}"`}
                aria-label="${esc(row.label)}"
              >
                <span class="motivation-dimension-bar" style="width:${pct}%"></span>
              </div>
              ${row.evidenceBadge ? `<span class="motivation-evidence">${esc(row.evidenceBadge)}</span>` : ''}
            </div>
          `;
        }).join('')}
      </div>
    </section>
  `;
}

function nutritionMarkup(nutrition) {
  if (!nutrition) return '';
  const blocks = [];
  if (nutrition.lecture?.length) {
    blocks.push(`<h3>Lecture nutrition</h3>${nutrition.lecture.map((line) => `<p class="motivation-prose">${esc(line)}</p>`).join('')}`);
  }
  if (nutrition.structure) {
    blocks.push(`<h3>Structure suggérée</h3><p class="motivation-prose">${esc(nutrition.structure)}</p>`);
  }
  if (nutrition.obstacles?.length) {
    blocks.push(`<h3>Obstacles</h3><ul class="motivation-report-list">${nutrition.obstacles.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>`);
  }
  if (nutrition.actions?.length) {
    blocks.push(`<h3>Actions prioritaires</h3><ul class="motivation-report-list">${nutrition.actions.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>`);
  }
  if (!blocks.length) return '';
  return `
    <section class="motivation-card" data-section="nutrition">
      <h2 class="motivation-section-title">Nutrition</h2>
      ${blocks.join('')}
    </section>
  `;
}

function weekPlanMarkup(weeks) {
  if (!weeks?.length) return '';
  return `
    <section class="motivation-card" data-section="four-week-plan">
      <h2 class="motivation-section-title">Plan 4 semaines</h2>
      <div class="motivation-week-grid">
        ${weeks.map((week) => `
          <article class="motivation-week-card" data-week="${esc(week.week)}">
            <p class="motivation-week-kicker">Semaine ${esc(week.week)}</p>
            <h3>${esc(week.title || `Semaine ${week.week}`)}</h3>
            ${week.focus ? `<p class="motivation-prose">${esc(week.focus)}</p>` : ''}
            ${week.actions?.length ? `<ul class="motivation-report-list">${week.actions.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>` : ''}
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
      <h2 class="motivation-section-title">Réponses ouvertes</h2>
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

export function buildMotivationReportMarkup(viewModel, { logoSrc = '' } = {}) {
  const vm = viewModel || {};
  return `
    <article class="intake-report motivation-report">
      ${heroMarkup(vm, logoSrc)}
      <div class="motivation-report-body">
        ${quickReadMarkup(vm.quickRead)}
        ${summaryMarkup(vm.summary, vm.supports)}
        ${numberedMarkup('priorities', 'Priorités Coach', vm.coachPriorities, 'motivation-priorities')}
        ${vigilanceMarkup(vm.vigilance)}
        ${interviewMarkup(vm.interviewQuestions)}
        ${dimensionsMarkup(vm.dimensions)}
        ${nutritionMarkup(vm.nutrition)}
        ${weekPlanMarkup(vm.fourWeekPlan)}
        ${verbatimMarkup(vm.verbatims)}
        ${technicalMarkup(vm.provenance || vm.technical || {})}
      </div>
      <footer class="motivation-report-footer">Confidentiel — usage Coach KR Kinetics</footer>
    </article>
  `;
}
