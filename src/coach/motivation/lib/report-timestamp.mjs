/**
 * Single report timestamp helper — America/Toronto by default.
 * Used for visible date, filename, PDF metadata, and tests.
 */
export function getReportTimestamp(params) {
    const timezone = params.timezone ?? "America/Toronto";
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
