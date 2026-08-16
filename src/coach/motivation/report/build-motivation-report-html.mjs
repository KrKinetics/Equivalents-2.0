/**
 * Screen markup for the official Coach motivation report.
 * Formats a view-model only — never recalculates the engine.
 */

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
  if (!value) return '';
  try {
    return new Intl.DateTimeFormat('fr-CA', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return String(value);
  }
}

function sectionMarkup(section) {
  const lines = (section.lines || []).map((line) => `<p class="intake-report-answer">${esc(line)}</p>`).join('');
  const items = (section.items || []).length
    ? `<ul class="motivation-report-list">${section.items.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>`
    : '';
  const rows = (section.rows || []).map((row) => `
    <div class="intake-report-row">
      <p class="intake-report-label">${esc(row.label)}</p>
      <p class="intake-report-answer">${esc(row.value)}</p>
    </div>
  `).join('');
  return `
    <section class="intake-report-section" data-section="${esc(section.id)}">
      <h2 class="intake-report-section-title">${esc(section.title)}</h2>
      ${lines}${items}${rows}
    </section>
  `;
}

function provenanceMarkup(provenance) {
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
    <section class="intake-report-section motivation-report-tech" data-section="provenance">
      <h2 class="intake-report-section-title">Informations techniques</h2>
      ${rows.map(([label, value]) => `
        <div class="intake-report-row">
          <p class="intake-report-label">${esc(label)}</p>
          <p class="intake-report-answer">${esc(value)}</p>
        </div>
      `).join('')}
    </section>
  `;
}

export function buildMotivationReportMarkup(viewModel, { logoSrc = '' } = {}) {
  const vm = viewModel || {};
  const logo = logoSrc
    ? `<div class="intake-report-logo-wrap"><img src="${esc(logoSrc)}" alt="KR Kinetics"></div>`
    : '';
  const submitted = formatDate(vm.submittedAt);
  return `
    <article class="intake-report motivation-report">
      <header class="intake-report-header">
        ${logo}
        <p class="intake-report-kicker">KR Kinetics</p>
        <h1 class="intake-report-title">${esc(vm.title || 'Profil motivationnel')}</h1>
        <p class="intake-report-client">${esc(vm.clientName || 'Client')}</p>
        ${submitted ? `<p class="intake-report-submitted">${esc(submitted)}</p>` : ''}
      </header>
      <div class="intake-report-rule"></div>
      <div class="intake-report-body">
        ${(vm.sections || []).map(sectionMarkup).join('')}
        ${provenanceMarkup(vm.provenance || {})}
      </div>
      <footer class="intake-report-footer">Confidentiel — usage Coach KR Kinetics</footer>
    </article>
  `;
}
