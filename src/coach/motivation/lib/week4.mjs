/** Single source of truth for week-4 follow-up target date (28 days after submission). */
export const WEEK4_FOLLOW_UP_DAYS = 28;
export function computeWeek4TargetDate(submittedAt) {
    if (!submittedAt)
        return null;
    const base = submittedAt instanceof Date ? submittedAt : new Date(submittedAt);
    if (Number.isNaN(base.getTime()))
        return null;
    const target = new Date(base.getTime());
    target.setUTCDate(target.getUTCDate() + WEEK4_FOLLOW_UP_DAYS);
    return target;
}
export function resolveWeek4FollowUpStatus(input) {
    if (input.hasFollowUp)
        return "completed";
    const target = computeWeek4TargetDate(input.submittedAt);
    if (!target)
        return "not_due";
    const now = input.now ?? new Date();
    if (now.getTime() < target.getTime())
        return "not_due";
    // Due: pending for first 7 days after target, then overdue
    const overdueAfter = target.getTime() + 7 * 24 * 60 * 60 * 1000;
    if (now.getTime() >= overdueAfter)
        return "overdue";
    return "pending";
}
export function week4StatusLabelFr(status) {
    switch (status) {
        case "not_due":
            return "Pas encore dû";
        case "pending":
            return "À compléter";
        case "completed":
            return "Complété";
        case "overdue":
            return "En retard";
        default:
            return status;
    }
}
