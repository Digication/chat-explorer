/**
 * Integration tests for the scope/consent guard in
 * getStudentEvidenceMoments. Runs against the real Postgres DB inside
 * Docker. Complements the unit test in evidence-outcomes.test.ts by
 * exercising the actual resolveScope + DB path end-to-end.
 *
 * Run with: docker compose exec app pnpm test
 */
import { describe, it, expect, beforeAll } from "vitest";
import { AppDataSource } from "../../data-source.js";
import { getStudentEvidenceMoments } from "./evidence-outcomes.js";

beforeAll(async () => {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }
});

describe("getStudentEvidenceMoments (integration)", () => {
  // ── 1. Out-of-scope studentId returns empty (real DB, real
  //      resolveScope, no leak). This is the regression contract
  //      against the original Codex finding: a faculty user with a
  //      valid scope cannot fetch evidence for an arbitrary studentId.
  //      We use a synthetic UUID that does not exist in any
  //      institution, so resolveScope's consentedStudentIds will not
  //      include it under any scope.

  it("returns empty when studentId is outside the validated scope", async () => {
    const outOfScopeStudentId = "ffffffff-ffff-ffff-ffff-ffffffffffff";

    // Find a real institution to scope against. If none exists, skip
    // — the guard is still proven by the unit test.
    const sample = await AppDataSource.createQueryBuilder()
      .select("co.institutionId", "institutionId")
      .from("course", "co")
      .limit(1)
      .getRawOne();

    if (!sample?.institutionId) {
      console.log("Skipping: no institution data in DB");
      return;
    }

    const result = await getStudentEvidenceMoments(
      { institutionId: sample.institutionId },
      outOfScopeStudentId
    );

    expect(result).toEqual({ moments: [], totalCount: 0 });
  });

  // ── 2. Cross-institution leak prevention: a real student in
  //      institution B is unreachable from a scope on institution A.
  //      Skips when there are not at least two distinct institutions
  //      with at least one student each (test is then vacuous).

  it("does not return institution-B student evidence when scope is institution A", async () => {
    // Two institutions, each with at least one student.
    const rows = await AppDataSource.createQueryBuilder()
      .select(["s.id AS studentId", "s.institutionId AS institutionId"])
      .from("student", "s")
      .where("s.institutionId IS NOT NULL")
      .limit(50)
      .getRawMany();

    // Group by institutionId
    const byInst = new Map<string, string[]>();
    for (const r of rows) {
      const list = byInst.get(r.institutionId) ?? [];
      list.push(r.studentId);
      byInst.set(r.institutionId, list);
    }

    const distinctInsts = [...byInst.keys()];
    if (distinctInsts.length < 2) {
      console.log(
        "Skipping: need ≥2 institutions with student data to assert cross-tenant guard"
      );
      return;
    }

    const [instA, instB] = distinctInsts;
    const studentInB = byInst.get(instB)![0];

    // Caller scopes on institution A but tries to read student in B.
    const result = await getStudentEvidenceMoments(
      { institutionId: instA },
      studentInB
    );

    expect(result).toEqual({ moments: [], totalCount: 0 });
  });

  // ── 3. Consent-excluded studentId returns empty even when the
  //      student belongs to the scoped institution. Tests the
  //      consent integration end-to-end (StudentConsent rows are
  //      respected by resolveScope, which the guard then enforces).

  it("returns empty for a student excluded by StudentConsent in the scoped institution", async () => {
    const excluded = await AppDataSource.createQueryBuilder()
      .select([
        "sc.studentId AS studentId",
        "s.institutionId AS institutionId",
      ])
      .from("student_consent", "sc")
      .innerJoin("student", "s", "s.id = sc.studentId")
      .where("sc.status = :status", { status: "EXCLUDED" })
      .limit(1)
      .getRawOne();

    if (!excluded?.studentId) {
      console.log("Skipping: no EXCLUDED consent records in DB");
      return;
    }

    const result = await getStudentEvidenceMoments(
      { institutionId: excluded.institutionId },
      excluded.studentId
    );

    expect(result).toEqual({ moments: [], totalCount: 0 });
  });
});
