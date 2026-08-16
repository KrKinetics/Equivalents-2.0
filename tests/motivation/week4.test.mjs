import { describe, expect, it } from "./expect-shim.mjs";
import { computeWeek4TargetDate, resolveWeek4FollowUpStatus, WEEK4_FOLLOW_UP_DAYS, } from "../../src/coach/motivation/lib/week4.mjs";
describe("week4 target date", () => {
    it("adds exactly 28 days", () => {
        const submitted = new Date("2026-01-01T12:00:00.000Z");
        const target = computeWeek4TargetDate(submitted);
        expect(target).not.toBeNull();
        const expected = new Date(submitted);
        expected.setUTCDate(expected.getUTCDate() + WEEK4_FOLLOW_UP_DAYS);
        expect(target.toISOString()).toBe(expected.toISOString());
    });
    it("resolves statuses consistently", () => {
        const submitted = new Date("2026-01-01T00:00:00.000Z");
        expect(resolveWeek4FollowUpStatus({
            submittedAt: submitted,
            hasFollowUp: true,
            now: new Date("2026-03-01T00:00:00.000Z"),
        })).toBe("completed");
        expect(resolveWeek4FollowUpStatus({
            submittedAt: submitted,
            hasFollowUp: false,
            now: new Date("2026-01-10T00:00:00.000Z"),
        })).toBe("not_due");
        expect(resolveWeek4FollowUpStatus({
            submittedAt: submitted,
            hasFollowUp: false,
            now: new Date("2026-01-30T00:00:00.000Z"),
        })).toBe("pending");
        expect(resolveWeek4FollowUpStatus({
            submittedAt: submitted,
            hasFollowUp: false,
            now: new Date("2026-02-20T00:00:00.000Z"),
        })).toBe("overdue");
    });
});
