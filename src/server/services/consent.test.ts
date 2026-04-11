import { describe, it, expect, vi, beforeEach } from "vitest";
import { StudentConsent, ConsentStatus } from "../entities/StudentConsent.js";
import { CourseAccess } from "../entities/CourseAccess.js";
import { UserRole } from "../entities/User.js";

// ── Per-entity mock repos ────────────────────────────────────────
const consentRepo = {
  findOne: vi.fn(),
  findOneBy: vi.fn(),
  find: vi.fn().mockResolvedValue([]),
  save: vi.fn().mockImplementation((r) => Promise.resolve({ ...r, updatedAt: new Date() })),
  create: vi.fn().mockImplementation((data) => data),
  count: vi.fn(),
};
const courseAccessRepo = {
  findOne: vi.fn(),
  findOneBy: vi.fn(),
};
const mockGetRawMany = vi.fn();

vi.mock("../data-source.js", () => ({
  AppDataSource: {
    getRepository: vi.fn((entity: unknown) => {
      if (entity === StudentConsent) return consentRepo;
      if (entity === CourseAccess) return courseAccessRepo;
      return { findOne: vi.fn(), findOneBy: vi.fn(), find: vi.fn().mockResolvedValue([]) };
    }),
    createQueryBuilder: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      getRawMany: mockGetRawMany,
    })),
  },
}));

import {
  getStudentConsent,
  isStudentExcluded,
  setStudentConsent,
  setAllStudentsConsent,
} from "./consent.js";

beforeEach(() => {
  // mockReset clears call history AND the once-queue on individual mocks.
  // We do this instead of vi.resetAllMocks() to avoid wiping the
  // AppDataSource.getRepository entity-routing implementation.
  consentRepo.find.mockReset();
  consentRepo.findOne.mockReset();
  consentRepo.findOneBy.mockReset();
  consentRepo.save.mockReset();
  consentRepo.create.mockReset();
  consentRepo.count.mockReset();
  courseAccessRepo.findOne.mockReset();
  courseAccessRepo.findOneBy.mockReset();
  mockGetRawMany.mockReset();

  // Restore default implementations
  consentRepo.find.mockResolvedValue([]);
  consentRepo.findOne.mockResolvedValue(null);
  consentRepo.findOneBy.mockResolvedValue(null);
  consentRepo.save.mockImplementation((r) =>
    Promise.resolve({ ...r, updatedAt: new Date() })
  );
  consentRepo.create.mockImplementation((data) => data);
  courseAccessRepo.findOne.mockResolvedValue(null);
  courseAccessRepo.findOneBy.mockResolvedValue(null);
});

// ── getStudentConsent ────────────────────────────────────────────

describe("getStudentConsent", () => {
  it("returns mapped records for a student with consent entries", async () => {
    const now = new Date();
    consentRepo.find.mockResolvedValue([
      {
        studentId: "s1",
        institutionId: "i1",
        courseId: null,
        status: ConsentStatus.INCLUDED,
        updatedById: "u1",
        updatedAt: now,
      },
      {
        studentId: "s1",
        institutionId: "i1",
        courseId: "c1",
        status: ConsentStatus.EXCLUDED,
        updatedById: "u1",
        updatedAt: now,
      },
    ]);

    const result = await getStudentConsent("s1", "i1");
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      studentId: "s1",
      institutionId: "i1",
      courseId: null,
      status: ConsentStatus.INCLUDED,
      updatedById: "u1",
    });
    expect(result[1].courseId).toBe("c1");
    expect(result[1].status).toBe(ConsentStatus.EXCLUDED);
  });

  it("returns empty array for unknown student", async () => {
    consentRepo.find.mockResolvedValue([]);
    const result = await getStudentConsent("unknown", "i1");
    expect(result).toEqual([]);
  });
});

// ── isStudentExcluded ────────────────────────────────────────────

describe("isStudentExcluded", () => {
  it("returns true for institution-wide exclusion", async () => {
    consentRepo.findOne
      .mockResolvedValueOnce({ status: ConsentStatus.EXCLUDED }) // institution-wide
      .mockResolvedValueOnce(null);                              // course-level (never reached)

    const result = await isStudentExcluded("s1", "i1", "c1");
    expect(result).toBe(true);
  });

  it("returns true for course-level exclusion when no institution-wide", async () => {
    // First call (institution-wide) returns null, second call (course-level) returns excluded
    consentRepo.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ status: ConsentStatus.EXCLUDED });

    const result = await isStudentExcluded("s1", "i1", "c1");
    expect(result).toBe(true);
    expect(consentRepo.findOne).toHaveBeenCalledTimes(2);
  });

  it("returns false when neither exclusion exists", async () => {
    // Both calls return null — default is already null from beforeEach, but be explicit
    consentRepo.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    const result = await isStudentExcluded("s1", "i1", "c1");
    expect(result).toBe(false);
  });

  it("checks institution-wide (courseId: IsNull) first", async () => {
    consentRepo.findOne
      .mockResolvedValueOnce({ status: ConsentStatus.EXCLUDED })
      .mockResolvedValueOnce(null);

    await isStudentExcluded("s1", "i1", "c1");

    // First call should have used IsNull() for courseId — TypeORM IsNull() is a FindOperator object, not null
    const firstCallWhere = consentRepo.findOne.mock.calls[0][0].where;
    // The courseId should be a FindOperator (IsNull), not a plain string
    expect(firstCallWhere.courseId).toBeDefined();
    expect(firstCallWhere.studentId).toBe("s1");
  });
});

// ── setStudentConsent — RBAC ─────────────────────────────────────

describe("setStudentConsent RBAC", () => {
  const baseInput = {
    studentId: "s1",
    institutionId: "i1",
    courseId: null as string | null,
    status: ConsentStatus.INCLUDED,
  };

  it("DIGICATION_ADMIN can set consent regardless of institution", async () => {
    const user = {
      id: "u1",
      role: UserRole.DIGICATION_ADMIN,
      institutionId: "different-institution",
    };
    consentRepo.findOne.mockResolvedValue(null);

    await expect(setStudentConsent(baseInput, user)).resolves.toBeDefined();
    expect(consentRepo.save).toHaveBeenCalledOnce();
  });

  it("INSTITUTION_ADMIN at same institution can set consent", async () => {
    const user = {
      id: "u1",
      role: UserRole.INSTITUTION_ADMIN,
      institutionId: "i1",
    };
    consentRepo.findOne.mockResolvedValue(null);

    await expect(setStudentConsent(baseInput, user)).resolves.toBeDefined();
    expect(consentRepo.save).toHaveBeenCalledOnce();
  });

  it("INSTITUTION_ADMIN at different institution throws permission error", async () => {
    const user = {
      id: "u1",
      role: UserRole.INSTITUTION_ADMIN,
      institutionId: "other-institution",
    };

    await expect(setStudentConsent(baseInput, user)).rejects.toThrow("permission");
  });

  it("INSTRUCTOR with courseId and CourseAccess can set consent", async () => {
    const user = {
      id: "u1",
      role: UserRole.INSTRUCTOR,
      institutionId: "i1",
    };
    const inputWithCourse = { ...baseInput, courseId: "c1" };

    courseAccessRepo.findOne.mockResolvedValue({ userId: "u1", courseId: "c1" });
    consentRepo.findOne.mockResolvedValue(null);

    await expect(setStudentConsent(inputWithCourse, user)).resolves.toBeDefined();
    expect(consentRepo.save).toHaveBeenCalledOnce();
  });

  it("INSTRUCTOR without courseId throws (cannot set institution-wide)", async () => {
    const user = {
      id: "u1",
      role: UserRole.INSTRUCTOR,
      institutionId: "i1",
    };

    await expect(setStudentConsent(baseInput, user)).rejects.toThrow("permission");
  });

  it("INSTRUCTOR without CourseAccess throws", async () => {
    const user = {
      id: "u1",
      role: UserRole.INSTRUCTOR,
      institutionId: "i1",
    };
    const inputWithCourse = { ...baseInput, courseId: "c1" };

    courseAccessRepo.findOne.mockResolvedValue(null);

    await expect(setStudentConsent(inputWithCourse, user)).rejects.toThrow("permission");
  });

  it("upserts existing record — updates status on same record", async () => {
    const user = {
      id: "u1",
      role: UserRole.DIGICATION_ADMIN,
      institutionId: "i1",
    };
    const existingRecord = {
      studentId: "s1",
      institutionId: "i1",
      courseId: null,
      status: ConsentStatus.INCLUDED,
      updatedById: "u1",
      updatedAt: new Date(),
    };
    consentRepo.findOne.mockResolvedValue(existingRecord);

    await setStudentConsent({ ...baseInput, status: ConsentStatus.EXCLUDED }, user);

    expect(consentRepo.create).not.toHaveBeenCalled();
    expect(consentRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: ConsentStatus.EXCLUDED })
    );
  });
});

// ── setAllStudentsConsent ────────────────────────────────────────

describe("setAllStudentsConsent", () => {
  it("counts updated students correctly", async () => {
    const user = {
      id: "u1",
      role: UserRole.DIGICATION_ADMIN,
      institutionId: "i1",
    };

    mockGetRawMany.mockResolvedValue([
      { studentId: "s1" },
      { studentId: "s2" },
      { studentId: "s3" },
    ]);
    consentRepo.findOne.mockResolvedValue(null);

    const result = await setAllStudentsConsent("c1", "i1", ConsentStatus.EXCLUDED, user);

    expect(result).toEqual({ updated: 3 });
    expect(consentRepo.save).toHaveBeenCalledTimes(3);
  });
});
