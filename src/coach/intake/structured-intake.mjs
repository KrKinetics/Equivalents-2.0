/**
 * Versioned projection of a submitted pre-interview.
 * Only the form's structured coaching fields are returned.
 * Contact, consent, and medical answers stay out.
 */

export const STRUCTURED_INTAKE_VERSION = 1;

const OBJECTIVES = new Set([
  "Perte de masse adipeuse",
  "Prendre de la masse musculaire",
  "Améliorer ma composition corporelle",
  "Améliorer mon énergie et mes habitudes",
  "Améliorer mes performances",
  "Mieux structurer mon alimentation",
]);

const ACTIVITY = new Set([
  "Très peu actif",
  "Légèrement actif",
  "Modérément actif",
  "Très actif",
  "Entraînement sportif régulier",
]);

const WORK = new Set([
  "Assis ou peu actif",
  "Partiellement actif",
  "Très actif physiquement",
  "Variable",
  "Ne s\u2019applique pas",
]);

const SCHEDULE = new Set([
  "Régulier",
  "Variable",
  "Quarts de soir ou de nuit",
  "Ne s\u2019applique pas",
]);

const CHALLENGES = new Set([
  "Manque de temps",
  "Manque de préparation",
  "Horaire irrégulier",
  "Fringales ou faim",
  "Portions",
  "Repas au restaurant",
  "Manque d\u2019idées",
  "Constance",
  "Alimentation émotionnelle",
  "Contexte familial ou social",
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function choice(value, allowed) {
  return typeof value === "string" && allowed.has(value) ? value : null;
}

function note(value, max) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

export function projectStructuredIntake(row, scope = {}) {
  if (!row || row.status !== "submitted") return null;
  if (typeof row.id !== "string" || !UUID_RE.test(row.id)) return null;
  if (typeof row.submitted_at !== "string" || !row.submitted_at.trim()) return null;
  if (scope.clientId && String(row.client_id || "") !== String(scope.clientId)) return null;
  if (scope.organizationId && String(row.organization_id || "") !== String(scope.organizationId)) return null;
  const raw = row.answers && typeof row.answers === "object" && !Array.isArray(row.answers) ? row.answers : {};
  const challenges = Array.isArray(raw.challenges)
    ? [...new Set(raw.challenges.filter((item) => CHALLENGES.has(item)))].slice(0, 10)
    : [];
  return {
    version: STRUCTURED_INTAKE_VERSION,
    responseId: row.id,
    submittedAt: row.submitted_at,
    answers: {
      objectivePrimary: choice(raw.objective_primary, OBJECTIVES),
      objectiveDetail: note(raw.objective_detail, 240),
      activityLevel: choice(raw.activity_level, ACTIVITY),
      workType: choice(raw.work_type, WORK),
      schedule: choice(raw.schedule, SCHEDULE),
      challenges,
      foodsAvoid: note(raw.foods_avoid, 300),
      deadline: note(raw.deadline, 160),
    },
  };
}
