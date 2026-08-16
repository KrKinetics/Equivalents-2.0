/**
 * Single report timestamp helper — America/Toronto by default.
 * Used for visible date, filename, PDF metadata, and tests.
 */

export const COACH_REPORT_TIMEZONE = 'America/Toronto';

/**
 * Visible Coach date/time. Web and PDF must use this so hours stay aligned.
 * Example: "16 août 2026, 15 h 55"
 */
export function formatCoachDateTime(value, timezone = COACH_REPORT_TIMEZONE) {
    if (value == null || value === '') return '';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('fr-CA', {
        timeZone: timezone,
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(date);
}

export function getReportTimestamp(params) {
    const timezone = params.timezone ?? COACH_REPORT_TIMEZONE;
    const date = params.date;
    const displayDate = new Intl.DateTimeFormat("fr-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "long",
        day: "numeric",
    }).format(date);
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(date);
    const year = parts.find((p) => p.type === "year")?.value ?? "0000";
    const month = parts.find((p) => p.type === "month")?.value ?? "01";
    const day = parts.find((p) => p.type === "day")?.value ?? "01";
    const filenameDate = `${year}-${month}-${day}`;
    return {
        displayDate,
        filenameDate,
        pdfMetadataDate: date,
        timezone,
    };
}
