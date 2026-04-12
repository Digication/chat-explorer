import { describe, it, expect, vi, beforeEach } from "vitest";
import { Institution } from "../entities/Institution.js";
import { Course } from "../entities/Course.js";
import { CourseAccess } from "../entities/CourseAccess.js";
import { UserRole } from "../entities/User.js";

// ── Mock repos ──────────────────────────────────────────────────────

const institutionRepo = {
  findOne: vi.fn(),
  findOneBy: vi.fn(),
  find: vi.fn().mockResolvedValue([]),
  save: vi.fn().mockImplementation((e: Record<string, unknown>) => Promise.resolve({ ...e, id: e.id ?? "new-inst" })),
  create: vi.fn().mockImplementation((d: Record<string, unknown>) => d),
};
const courseRepo = {
  findOne: vi.fn(),
  findOneBy: vi.fn(),
  find: vi.fn().mockResolvedValue([]),
  createQueryBuilder: vi.fn(),
};
const courseAccessRepo = {
  findOne: vi.fn(),
  findOneBy: vi.fn(),
  find: vi.fn().mockResolvedValue([]),
};

vi.mock("../data-source.js", () => ({
  AppDataSource: {
    getRepository: vi.fn((entity: unknown) => {
      if (entity === Institution) return institutionRepo;
      if (entity === Course) return courseRepo;
      if (entity === CourseAccess) return courseAccessRepo;
      return { findOne: vi.fn(), findOneBy: vi.fn(), find: vi.fn().mockResolvedValue([]) };
    }),
  },
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

// ── Import under test ───────────────────────────────────────────────

import { institutionResolvers } from "./institution.js";

// ── Helpers ─────────────────────────────────────────────────────────

const digicationAdmin = {
  id: "user-1",
  name: "Admin",
  email: "a@a.com",
  role: UserRole.DIGICATION_ADMIN,
  institutionId: "inst-1",
};

const instructorUser = {
  id: "user-2",
  name: "Instructor",
  email: "i@i.com",
  role: UserRole.INSTRUCTOR,
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
  mockRequireInstitutionAccess.mockImplementation((_ctx: unknown, _id: unknown) => digicationAdmin);

  institutionRepo.findOne.mockResolvedValue(null);
  institutionRepo.find.mockResolvedValue([]);
  courseRepo.find.mockResolvedValue([]);
  courseAccessRepo.find.mockResolvedValue([]);
});

// ====================================================================

describe("institutionResolvers.Query", () => {
  it("institutions requires DIGICATION_ADMIN role", async () => {
    await expect(
      institutionResolvers.Query.institutions(null, null, makeCtx(instructorUser)),
    ).rejects.toThrow("Forbidden");
  });

  it("institutions returns all institutions sorted by name", async () => {
    const insts = [{ id: "i1", name: "Alpha" }, { id: "i2", name: "Beta" }];
    institutionRepo.find.mockResolvedValue(insts);

    const result = await institutionResolvers.Query.institutions(
      null, null, makeCtx(digicationAdmin),
    );

    expect(institutionRepo.find).toHaveBeenCalledWith({ order: { name: "ASC" } });
    expect(result).toEqual(insts);
  });

  it("institution calls requireInstitutionAccess", async () => {
    institutionRepo.findOne.mockResolvedValue({ id: "inst-1", name: "Test" });

    await institutionResolvers.Query.institution(
      null, { id: "inst-1" }, makeCtx(digicationAdmin),
    );

    expect(mockRequireInstitutionAccess).toHaveBeenCalledWith(expect.anything(), "inst-1");
  });

  it("myInstitution returns null when user has no institutionId", async () => {
    const userNoInst = { ...digicationAdmin, institutionId: null };
    mockRequireAuth.mockReturnValue(userNoInst);

    const result = await institutionResolvers.Query.myInstitution(
      null, null, makeCtx(userNoInst),
    );

    expect(result).toBeNull();
  });

  it("myInstitution returns institution for user's institutionId", async () => {
    mockRequireAuth.mockReturnValue(digicationAdmin);
    institutionRepo.findOne.mockResolvedValue({ id: "inst-1", name: "My School" });

    const result = await institutionResolvers.Query.myInstitution(
      null, null, makeCtx(digicationAdmin),
    );

    expect(institutionRepo.findOne).toHaveBeenCalledWith({ where: { id: "inst-1" } });
    expect(result).toEqual({ id: "inst-1", name: "My School" });
  });
});

describe("institutionResolvers.Mutation", () => {
  it("createInstitution duplicate name throws BAD_REQUEST", async () => {
    institutionRepo.findOne.mockResolvedValue({ id: "existing", name: "Dupe" });

    await expect(
      institutionResolvers.Mutation.createInstitution(
        null,
        { name: "Dupe" },
        makeCtx(digicationAdmin),
      ),
    ).rejects.toThrow("An institution with this name already exists");
  });

  it("createInstitution succeeds with unique name", async () => {
    institutionRepo.findOne.mockResolvedValue(null); // No existing
    institutionRepo.save.mockImplementation((e: Record<string, unknown>) => Promise.resolve({ ...e, id: "new-inst" }));

    const result = await institutionResolvers.Mutation.createInstitution(
      null,
      { name: "New School" },
      makeCtx(digicationAdmin),
    );

    expect(institutionRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: "New School" }),
    );
    expect(result).toEqual(expect.objectContaining({ name: "New School" }));
  });

  it("updateInstitution not found throws NOT_FOUND", async () => {
    institutionRepo.findOne.mockResolvedValue(null);

    await expect(
      institutionResolvers.Mutation.updateInstitution(
        null,
        { id: "missing", name: "Foo" },
        makeCtx(digicationAdmin),
      ),
    ).rejects.toThrow("Institution not found");
  });
});

describe("institutionResolvers.Institution (field resolvers)", () => {
  it("courses: admin sees all courses for the institution", async () => {
    mockRequireAuth.mockReturnValue(digicationAdmin);
    const courses = [{ id: "c1", name: "Course A" }];
    courseRepo.find.mockResolvedValue(courses);

    const parent = { id: "inst-1" } as Institution;
    const result = await institutionResolvers.Institution.courses(
      parent, null, makeCtx(digicationAdmin),
    );

    expect(courseRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { institutionId: "inst-1" },
        order: { name: "ASC" },
      }),
    );
    expect(result).toEqual(courses);
  });

  it("courses: instructor with no access returns empty array", async () => {
    mockRequireAuth.mockReturnValue(instructorUser);
    courseAccessRepo.find.mockResolvedValue([]); // No access records

    const parent = { id: "inst-1" } as Institution;
    const result = await institutionResolvers.Institution.courses(
      parent, null, makeCtx(instructorUser),
    );

    expect(result).toEqual([]);
  });
});
