import { describe, it, expect, vi, beforeEach } from "vitest";
import { Student } from "../entities/Student.js";
import { UserRole } from "../entities/User.js";
import { ConsentStatus } from "../entities/StudentConsent.js";

// ── Mock services ───────────────────────────────────────────────────

const mockGetStudentConsent = vi.fn();
const mockSetStudentConsent = vi.fn().mockResolvedValue({ id: "sc-1", status: ConsentStatus.EXCLUDED });
const mockSetAllStudentsConsent = vi.fn();

vi.mock("../services/consent.js", () => ({
  getStudentConsent: (...args: unknown[]) => mockGetStudentConsent(...args),
  setStudentConsent: (...args: unknown[]) => mockSetStudentConsent(...args),
  setAllStudentsConsent: (...args: unknown[]) => mockSetAllStudentsConsent(...args),
}));

const mockCacheInvalidate = vi.fn();
vi.mock("../services/analytics/cache.js", () => ({
  cacheInvalidate: (...args: unknown[]) => mockCacheInvalidate(...args),
}));

// ── Mock auth middleware ────────────────────────────────────────────

const mockRequireAuth = vi.fn();
const mockRequireRole = vi.fn();
const mockRequireInstitutionAccess = vi.fn();

vi.mock("./middleware/auth.js", () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
  requireInstitutionAccess: (...args: unknown[]) => mockRequireInstitutionAccess(...args),
}));

// ── Mock data source ────────────────────────────────────────────────

const mockStudentRepo = {
  findOne: vi.fn(),
  findOneBy: vi.fn(),
  count: vi.fn().mockResolvedValue(10),
};
const mockGetRawOne = vi.fn().mockResolvedValue({ count: "3" });

vi.mock("../data-source.js", () => ({
  AppDataSource: {
    getRepository: vi.fn((entity: unknown) => {
      if (entity === Student) return mockStudentRepo;
      return { findOne: vi.fn(), findOneBy: vi.fn(), find: vi.fn().mockResolvedValue([]) };
    }),
    createQueryBuilder: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      getRawOne: (...args: unknown[]) => mockGetRawOne(...args),
    })),
  },
}));

// ── Import under test ───────────────────────────────────────────────

import { consentResolvers } from "./consent.js";

// ── Helpers ─────────────────────────────────────────────────────────

const adminUser = {
  id: "user-1",
  name: "Admin",
  email: "a@a.com",
  role: UserRole.INSTITUTION_ADMIN,
  institutionId: "inst-1",
};

function makeCtx(user: Record<string, unknown> | null = null) {
  return { user } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockImplementation((ctx: { user: unknown }) => {
    if (!ctx.user) throw new Error("Not authenticated");
    return ctx.user;
  });
  mockRequireRole.mockImplementation((ctx: { user: Record<string, unknown> | null }, roles: string[]) => {
    const user = ctx.user;
    if (!user) throw new Error("Not authenticated");
    if (!roles.includes(user.role as string)) throw new Error("Forbidden");
    return user;
  });
  mockRequireInstitutionAccess.mockImplementation(() => adminUser);
  mockSetStudentConsent.mockResolvedValue({ id: "sc-1", status: ConsentStatus.EXCLUDED });
});

// ====================================================================

describe("consentResolvers.Query", () => {
  it("studentConsent calls requireInstitutionAccess", async () => {
    mockGetStudentConsent.mockResolvedValue({ status: ConsentStatus.INCLUDED });

    await consentResolvers.Query.studentConsent(
      null,
      { studentId: "s1", institutionId: "inst-1" },
      makeCtx(adminUser),
    );

    expect(mockRequireInstitutionAccess).toHaveBeenCalledWith(
      expect.anything(),
      "inst-1",
    );
  });

  it("studentConsent delegates to getStudentConsent service", async () => {
    mockGetStudentConsent.mockResolvedValue({ status: ConsentStatus.INCLUDED });

    await consentResolvers.Query.studentConsent(
      null,
      { studentId: "s1", institutionId: "inst-1" },
      makeCtx(adminUser),
    );

    expect(mockGetStudentConsent).toHaveBeenCalledWith("s1", "inst-1");
  });
});

describe("consentResolvers.Mutation", () => {
  it("setStudentConsent calls requireRole with admin roles", async () => {
    await consentResolvers.Mutation.setStudentConsent(
      null,
      { input: { studentId: "s1", institutionId: "inst-1", status: ConsentStatus.EXCLUDED } },
      makeCtx(adminUser),
    );

    expect(mockRequireRole).toHaveBeenCalledWith(
      expect.anything(),
      [UserRole.INSTITUTION_ADMIN, UserRole.DIGICATION_ADMIN],
    );
  });

  it("setStudentConsent calls cacheInvalidate after success", async () => {
    await consentResolvers.Mutation.setStudentConsent(
      null,
      { input: { studentId: "s1", institutionId: "inst-1", status: ConsentStatus.EXCLUDED } },
      makeCtx(adminUser),
    );

    expect(mockCacheInvalidate).toHaveBeenCalledWith(
      expect.objectContaining({ institutionId: "inst-1" }),
    );
  });

  it("bulkSetConsent loops through studentIds", async () => {
    await consentResolvers.Mutation.bulkSetConsent(
      null,
      {
        studentIds: ["s1", "s2", "s3"],
        institutionId: "inst-1",
        status: ConsentStatus.EXCLUDED,
      },
      makeCtx(adminUser),
    );

    expect(mockSetStudentConsent).toHaveBeenCalledTimes(3);
  });

  it("bulkSetConsent calls cacheInvalidate once after all updates", async () => {
    await consentResolvers.Mutation.bulkSetConsent(
      null,
      {
        studentIds: ["s1", "s2", "s3"],
        institutionId: "inst-1",
        status: ConsentStatus.EXCLUDED,
      },
      makeCtx(adminUser),
    );

    // cacheInvalidate should be called exactly once, not 3 times
    expect(mockCacheInvalidate).toHaveBeenCalledTimes(1);
  });

  it("bulkSetConsent returns correct count", async () => {
    const result = await consentResolvers.Mutation.bulkSetConsent(
      null,
      {
        studentIds: ["s1", "s2", "s3"],
        institutionId: "inst-1",
        status: ConsentStatus.EXCLUDED,
      },
      makeCtx(adminUser),
    );

    expect(result).toEqual({ updated: 3 });
  });
});
