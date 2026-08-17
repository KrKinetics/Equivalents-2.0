/**
 * Canonical IntakeReportViewModel.
 * Owns field order, French labels, display aliases, empty-value filtering,
 * phone formatting, section grouping, submitted date, client identity,
 * and safe formatted answer values. Web and PDF must consume this only.
 */

import { buildIntakeAnthropometricsView } from '../intake/intake-anthropometrics.mjs';

export const INTAKE_REPORT_TITLE = 'RAPPORT DE PRÉ-ENTREVUE';
export const INTAKE_REPORT_FOOTER = 'KR KINETICS — Pré-entrevue confidentielle';

/** Canonical KR Kinetics business timezone (Quebec / Eastern). Never host/browser TZ. */
export const INTAKE_REPORT_TIMEZONE = 'America/Toronto';

/** Stored keys that must never appear on the coach-facing report. */
export const INTAKE_REPORT_OMITTED_KEYS = Object.freeze(['consent', 'completed_step']);

export const INTAKE_REPORT_LABELS = Object.freeze({
  email: 'Courriel',
  phone: 'Téléphone',
  objective_primary: 'Objectif principal',
  objective_detail: 'Résultat recherché',
  deadline: 'Échéance ou événement',
  activity_level: 'Niveau d’activité',
  work_type: 'Type de travail',
  schedule: 'Horaire',
  medications_status: 'Médicaments ou suppléments',
  medications_details: 'Détails — médicaments',
  allergies_status: 'Allergies ou intolérances',
  allergies_details: 'Détails — allergies',
  restriction_status: 'Blessure, restriction ou condition',
  restriction_details: 'Détails — restriction',
  challenges: 'Principaux défis',
  foods_avoid: 'Aliments évités',
  interview_priority: 'Priorité pour la première rencontre',
  other_info: 'Autre information utile',
});

/** Legacy stored values remapped for coach display only. */
export const INTAKE_REPORT_ANSWER_ALIASES = Object.freeze({
  'Perdre du poids': 'Perte de masse adipeuse',
});

export const INTAKE_REPORT_SECTIONS = Object.freeze([
  Object.freeze({
    id: 'profile',
    title: 'PROFIL DU CLIENT',
    fields: Object.freeze(['email', 'phone']),
  }),
  Object.freeze({
    id: 'objective',
    title: 'OBJECTIF & CONTEXTE',
    fields: Object.freeze(['objective_primary', 'objective_detail', 'deadline']),
  }),
  Object.freeze({
    id: 'lifestyle',
    title: 'MODE DE VIE',
    fields: Object.freeze(['activity_level', 'work_type', 'schedule']),
  }),
  Object.freeze({
    id: 'health',
    title: 'SANTÉ & RESTRICTIONS',
    fields: Object.freeze([
      'medications_status',
      'medications_details',
      'allergies_status',
      'allergies_details',
      'restriction_status',
      'restriction_details',
    ]),
  }),
  Object.freeze({
    id: 'habits',
    title: 'HABITUDES & DÉFIS',
    fields: Object.freeze(['challenges', 'foods_avoid']),
  }),
  Object.freeze({
    id: 'priority',
    title: 'PRIORITÉ POUR LA PREMIÈRE RENCONTRE',
    fields: Object.freeze(['interview_priority']),
  }),
  Object.freeze({
    id: 'other',
    title: 'AUTRE INFORMATION UTILE',
    fields: Object.freeze(['other_info']),
  }),
]);

const OMITTED = new Set(INTAKE_REPORT_OMITTED_KEYS);

/**
 * Display-only North American phone formatting. Does not alter stored values.
 * @param {unknown} value
 * @returns {string}
 */
export function formatIntakeReportPhone(value) {
  if (value == null || value === '') return '';
  const raw = String(value).trim();
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) {
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `${digits.slice(1, 4)} ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return raw;
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isEmptyIntakeAnswer(value) {
  if (value == null) return true;
  if (typeof value === 'boolean') return false;
  if (typeof value === 'number') return !Number.isFinite(value);
  if (Array.isArray(value)) return value.every((item) => isEmptyIntakeAnswer(item));
  return String(value).trim() === '';
}

/**
 * @param {unknown} value
 * @param {string} [key]
 * @returns {string}
 */
export function formatIntakeReportAnswer(value, key = '') {
  if (Array.isArray(value)) {
    return value
      .map((item) => formatIntakeReportAnswer(item, key))
      .filter((item) => item && item !== '—')
      .join(' · ');
  }
  if (value === true) return 'Oui';
  if (value === false) return 'Non';
  if (key === 'phone') return formatIntakeReportPhone(value);
  const text = String(value ?? '').trim();
  if (!text) return '';
  return INTAKE_REPORT_ANSWER_ALIASES[text] || text;
}

/**
 * @param {unknown} iso
 * @returns {string}
 */
export function formatIntakeReportSubmittedAt(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('fr-CA', {
    timeZone: INTAKE_REPORT_TIMEZONE,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

/**
 * @param {unknown} iso
 * @returns {string}
 */
export function intakeReportSubmittedDateIso(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: INTAKE_REPORT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * @param {{
 *   clientName?: unknown,
 *   submittedAt?: unknown,
 *   answers?: unknown,
 * }} [input]
 */
export function buildIntakeReportViewModel(input = {}) {
  const clientName = String(input.clientName || '').trim() || 'Client';
  const submittedAtIso = typeof input.submittedAt === 'string' ? input.submittedAt : '';
  const answers = input.answers && typeof input.answers === 'object' && !Array.isArray(input.answers)
    ? input.answers
    : {};

  const sections = [];
  for (const section of INTAKE_REPORT_SECTIONS) {
    const rows = [];
    for (const key of section.fields) {
      if (OMITTED.has(key)) continue;
      const raw = answers[key];
      if (isEmptyIntakeAnswer(raw)) continue;
      const display = formatIntakeReportAnswer(raw, key);
      if (!display) continue;
      rows.push({
        key,
        label: INTAKE_REPORT_LABELS[key] || key,
        display,
      });
    }
    if (rows.length) {
      sections.push({
        id: section.id,
        title: section.title,
        rows,
      });
    }
  }

  return {
    title: INTAKE_REPORT_TITLE,
    clientName,
    submittedAtIso,
    submittedAtDisplay: formatIntakeReportSubmittedAt(submittedAtIso),
    submittedDateIso: intakeReportSubmittedDateIso(submittedAtIso),
    footer: INTAKE_REPORT_FOOTER,
    anthropometrics: buildIntakeAnthropometricsView(answers),
    sections,
  };
}
