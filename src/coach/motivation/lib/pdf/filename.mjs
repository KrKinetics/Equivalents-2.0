import { getReportTimestamp } from "../report-timestamp.mjs";
/** Sanitize a client name for use in a download filename. */
export function sanitizeClientNameForFilename(name) {
    const cleaned = name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase();
    return cleaned || "client";
}
export function buildCoachReportFilename(input) {
    const { filenameDate } = getReportTimestamp({
        date: input.date ?? new Date(),
        timezone: input.timezone ?? "America/Toronto",
    });
    const slug = sanitizeClientNameForFilename(input.clientName);
    const suffix = input.suffix ? `-${input.suffix}` : "";
    return `rapport-coach${suffix}-${slug}-${filenameDate}.pdf`;
}
