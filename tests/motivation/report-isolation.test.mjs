/**
 * Pure unit tests (no DB) verifying assembleCoachReportSnapshotV42 never
 * leaks data across calls — neither when invoked sequentially for different
 * clients nor when invoked concurrently via Promise.all.
 */
import { describe, expect, it } from "./expect-shim.mjs";
import { ISOLATION_PROFILES, PROFILE_A, PROFILE_A_TOKEN, PROFILE_B, PROFILE_B_TOKEN, PROFILE_C, PROFILE_C_TOKEN, } from "../../src/coach/motivation/fixtures/isolation-profiles.mjs";
import { assembleCoachReportSnapshotV42 } from "../../src/coach/motivation/report/v42/assemble.mjs";
const ALL_TOKENS = [PROFILE_A_TOKEN, PROFILE_B_TOKEN, PROFILE_C_TOKEN];
const minimalScoring = {
    profileScores: {},
    nutritionScores: {},
    overallScore: 50,
    missingRequiredQuestionIds: [],
    dimensions: [],
};
function primaryDimensionFor(code) {
    if (code.startsWith("CHOICE"))
        return "choice_need";
    if (code.startsWith("EXPL"))
        return "explanation_need";
    if (code.startsWith("COACH"))
        return "coaching_receptivity";
    if (code.startsWith("STRUCT"))
        return "structure_need";
    if (code.startsWith("MOT_RES") || code.startsWith("MOT_")) {
        return "results_driven_motivation";
    }
    if (code.startsWith("EFF") || code.startsWith("CONS")) {
        return "behavioral_consistency";
    }
    if (code.startsWith("RIG"))
        return "rigidity_perfectionism";
    if (code.startsWith("LT"))
        return "long_term_orientation";
    if (code.startsWith("NUT_"))
        return "nutrition_value_awareness";
    return undefined;
}
function likertQuestion(code, id) {
    return {
        id,
        code,
        text: code,
        type: "likert",
        required: true,
        active: true,
        order: 1,
        section: "t",
        likertMin: 1,
        likertMax: 5,
        scoringDirection: "positive",
        primaryDimension: primaryDimensionFor(code),
        interpretationTags: [],
    };
}
const TEXT_TAGS = {
    GOAL_01: ["goal"],
    GOAL_02: ["goal", "success"],
    OBS_01: ["obstacle"],
    NUT_GOAL_01: ["nutrition_goal"],
    NUT_PREF_01: ["nutrition_preference"],
};
const MULTI_TAGS = {
    NUT_OBS_01: ["nutrition_obstacle"],
};
function textQuestion(code, id, tags, type = "short_text") {
    return {
        id,
        code,
        text: code,
        type,
        required: false,
        active: true,
        order: 1,
        section: "t",
        interpretationTags: tags,
    };
}
/** Builds a minimal, self-contained questions/answers pair from a profile. */
function buildProfileQuestionsAndAnswers(profile) {
    const questions = [];
    const answers = [];
    let counter = 0;
    const uid = () => `${profile.token}_q${counter++}`;
    for (const [code, value] of Object.entries(profile.likert)) {
        const id = uid();
        questions.push(likertQuestion(code, id));
        answers.push({ questionId: id, numericValue: value });
    }
    for (const [code, value] of Object.entries(profile.text)) {
        const id = uid();
        questions.push(textQuestion(code, id, TEXT_TAGS[code] ?? []));
        answers.push({ questionId: id, textValue: value });
    }
    for (const [code, values] of Object.entries(profile.multi)) {
        const id = uid();
        questions.push(textQuestion(code, id, MULTI_TAGS[code] ?? [], "multiple_choice"));
        answers.push({ questionId: id, textValue: values.join(", ") });
    }
    return { questions, answers };
}
function assembleForProfile(profile) {
    const { questions, answers } = buildProfileQuestionsAndAnswers(profile);
    return assembleCoachReportSnapshotV42({
        assessmentId: `asm_${profile.token}`,
        clientId: profile.clientId,
        clientName: profile.clientName,
        clientCoachId: "coach_shared",
        status: "completed",
        completedAt: new Date("2026-01-01T00:00:00.000Z"),
        questionnaireVersion: "questionnaire-v4.1",
        rulesetVersion: "ruleset-v4.1",
        questions,
        answers,
        scoring: minimalScoring,
        insights: [],
        contradictions: [],
    });
}
/** Simulate a request-handler style async boundary around the pure assembly call. */
async function assembleForProfileAsync(profile) {
    await Promise.resolve();
    const result = assembleForProfile(profile);
    await Promise.resolve();
    return result;
}
/** Deterministic subset of fields — excludes volatile timestamps (generatedAt). */
function keyFields(snapshot) {
    return {
        clientId: snapshot.metadata.clientId,
        clientName: snapshot.metadata.clientName,
        openAnswers: snapshot.openAnswers,
        declaredObstacles: snapshot.declaredObstacles,
        normalizedObstacles: snapshot.normalizedObstacles,
        domainInterpretations: snapshot.domainInterpretations,
        priorityInterviewQuestions: snapshot.priorityInterviewQuestions,
        initialPlan: {
            priorities: snapshot.initialPlan.priorities,
            choiceApproachLabel: snapshot.initialPlan.choiceApproachLabel,
            mainStrengths: snapshot.initialPlan.mainStrengths,
            clarifications: snapshot.initialPlan.clarifications,
            priorityInterviewQuestions: snapshot.initialPlan.priorityInterviewQuestions,
        },
        readiness: snapshot.readiness,
    };
}
function otherTokens(own) {
    return ALL_TOKENS.filter((t) => t !== own);
}
function assertNoForeignTokens(snapshot, ownToken) {
    const serialized = JSON.stringify(snapshot);
    expect(serialized).toContain(ownToken);
    for (const foreign of otherTokens(ownToken)) {
        expect(serialized).not.toContain(foreign);
    }
}
describe("report-isolation v4.2 — no cross-call state leakage", () => {
    it("builds distinct, self-consistent snapshots for profiles A, B and C", () => {
        const a = assembleForProfile(PROFILE_A);
        const b = assembleForProfile(PROFILE_B);
        const c = assembleForProfile(PROFILE_C);
        assertNoForeignTokens(a, PROFILE_A_TOKEN);
        assertNoForeignTokens(b, PROFILE_B_TOKEN);
        assertNoForeignTokens(c, PROFILE_C_TOKEN);
        expect(a.normalizedObstacles.some((n) => n.canonicalId === "food_planning")).toBe(true);
        expect(b.normalizedObstacles.some((n) => n.canonicalId === "budget")).toBe(true);
        expect(c.normalizedObstacles.some((n) => n.canonicalId === "food_schedule")).toBe(true);
        expect(a.normalizedObstacles.some((n) => n.canonicalId === "budget")).toBe(false);
        expect(b.normalizedObstacles.some((n) => n.canonicalId === "budget")).toBe(true);
    });
    it("sequential A,B,C,A,C,B,A — A reports stay identical and never leak B/C", () => {
        const order = [
            PROFILE_A,
            PROFILE_B,
            PROFILE_C,
            PROFILE_A,
            PROFILE_C,
            PROFILE_B,
            PROFILE_A,
        ];
        const results = order.map((profile) => ({
            profile,
            snapshot: assembleForProfile(profile),
        }));
        const aResults = results.filter((r) => r.profile === PROFILE_A);
        expect(aResults).toHaveLength(3);
        const aKeyFieldsSerialized = aResults.map((r) => JSON.stringify(keyFields(r.snapshot)));
        expect(aKeyFieldsSerialized[1]).toEqual(aKeyFieldsSerialized[0]);
        expect(aKeyFieldsSerialized[2]).toEqual(aKeyFieldsSerialized[0]);
        for (const { snapshot } of aResults) {
            assertNoForeignTokens(snapshot, PROFILE_A_TOKEN);
            expect(snapshot.normalizedObstacles.some((n) => n.canonicalId === "budget")).toBe(false);
            // "budget" (the B profile's declared obstacle theme) must never leak into A's obstacles.
            expect(JSON.stringify({
                declaredObstacles: snapshot.declaredObstacles,
                normalizedObstacles: snapshot.normalizedObstacles,
            })).not.toMatch(/budget/i);
        }
        // Interleaved B and C results must never contain A's or each other's token.
        for (const { profile, snapshot } of results) {
            if (profile === PROFILE_A)
                continue;
            assertNoForeignTokens(snapshot, profile.token);
        }
    });
    it("concurrent Promise.all (two rounds) — each result only contains its own token", async () => {
        const round1 = await Promise.all([
            assembleForProfileAsync(PROFILE_A),
            assembleForProfileAsync(PROFILE_B),
            assembleForProfileAsync(PROFILE_C),
        ]);
        const round2 = await Promise.all([
            assembleForProfileAsync(PROFILE_A),
            assembleForProfileAsync(PROFILE_B),
            assembleForProfileAsync(PROFILE_C),
        ]);
        const rounds = [round1, round2];
        for (const [a, b, c] of rounds) {
            assertNoForeignTokens(a, PROFILE_A_TOKEN);
            assertNoForeignTokens(b, PROFILE_B_TOKEN);
            assertNoForeignTokens(c, PROFILE_C_TOKEN);
        }
        // Same-profile results across both concurrent rounds must be identical
        // (fixed completedAt; only the volatile generatedAt metadata may differ).
        for (const idx of [0, 1, 2]) {
            expect(JSON.stringify(keyFields(round1[idx]))).toEqual(JSON.stringify(keyFields(round2[idx])));
        }
    });
    it("all three profiles remain isolated when built from the shared fixture list", () => {
        const snapshots = ISOLATION_PROFILES.map((p) => assembleForProfile(p));
        for (const snapshot of snapshots) {
            const ownToken = ISOLATION_PROFILES.find((p) => p.clientId === snapshot.metadata.clientId).token;
            assertNoForeignTokens(snapshot, ownToken);
        }
    });
});
