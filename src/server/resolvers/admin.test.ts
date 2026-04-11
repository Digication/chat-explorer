/**
 * Tests for admin resolvers — inviteUser, assignRole, revokeCourseAccess,
 * users query (search), institution CRUD, updateUserInstitution.
 *
 * Run with: docker compose exec app pnpm test
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { AppDataSource } from "../data-source.js";
import { User, UserRole } from "../entities/User.js";
import { Institution } from "../entities/Institution.js";
import { Course } from "../entities/Course.js";
import { CourseAccess, AccessLevel } from "../entities/CourseAccess.js";
import { adminResolvers } from "./admin.js";
import { institutionResolvers } from "./institution.js";
import type { GraphQLContext } from "../types/context.js";

// Helpers to build a mock GraphQL context
function makeCtx(
  overrides: Partial<NonNullable<GraphQLContext["user"]>>
): GraphQLContext {
  return {
    user: {
      id: overrides.id ?? "test-admin-id",
      name: overrides.name ?? "Test Admin",
      email: overrides.email ?? "admin@test.com",
      role: overrides.role ?? UserRole.DIGICATION_ADMIN,
      institutionId: overrides.institutionId ?? null,
      image: null,
    },
  };
}

const digicationAdminCtx = makeCtx({
  id: "test-dig-admin",
  role: UserRole.DIGICATION_ADMIN,
});

// Track created entities for cleanup
const createdUserIds: string[] = [];
const createdInstitutionIds: string[] = [];
const createdCourseIds: string[] = [];

// Test institutions
let instA: Institution;
let instB: Institution;

beforeAll(async () => {
  const instRepo = AppDataSource.getRepository(Institution);

  instA = await instRepo.save(
    instRepo.create({ name: `Test Inst A ${Date.now()}`, domain: "a.edu" })
  );
  createdInstitutionIds.push(instA.id);

  instB = await instRepo.save(
    instRepo.create({ name: `Test Inst B ${Date.now()}`, domain: "b.edu" })
  );
  createdInstitutionIds.push(instB.id);
});

afterAll(async () => {
  const userRepo = AppDataSource.getRepository(User);
  const instRepo = AppDataSource.getRepository(Institution);
  const courseRepo = AppDataSource.getRepository(Course);
  const accessRepo = AppDataSource.getRepository(CourseAccess);

  // Clean up in reverse dependency order
  for (const id of createdUserIds) {
    await accessRepo.delete({ userId: id });
    await userRepo.delete(id);
  }
  for (const id of createdCourseIds) {
    await accessRepo.delete({ courseId: id });
    await courseRepo.delete(id);
  }
  for (const id of createdInstitutionIds) {
    await instRepo.delete(id);
  }
});

// ── inviteUser ────────────────────────────────────────────────────

describe("inviteUser", () => {
  it("creates user with email, name, institution, role", async () => {
    const email = `invite-test-${Date.now()}@a.edu`;
    const result = await adminResolvers.Mutation.inviteUser(
      null as any,
      {
        email,
        name: "Invited User",
        institutionId: instA.id,
        role: UserRole.INSTRUCTOR,
      },
      digicationAdminCtx
    );
    createdUserIds.push(result.id);

    expect(result.email).toBe(email);
    expect(result.name).toBe("Invited User");
    expect(result.role).toBe(UserRole.INSTRUCTOR);
    expect(result.institutionId).toBe(instA.id);
  });

  it("rejects duplicate email", async () => {
    const email = `dup-test-${Date.now()}@a.edu`;
    const result = await adminResolvers.Mutation.inviteUser(
      null as any,
      {
        email,
        name: "First User",
        institutionId: instA.id,
        role: UserRole.INSTRUCTOR,
      },
      digicationAdminCtx
    );
    createdUserIds.push(result.id);

    await expect(
      adminResolvers.Mutation.inviteUser(
        null as any,
        {
          email,
          name: "Duplicate",
          institutionId: instA.id,
          role: UserRole.INSTRUCTOR,
        },
        digicationAdminCtx
      )
    ).rejects.toThrow("A user with this email already exists");
  });

  it("institution_admin can only invite to own institution", async () => {
    const instAdminCtx = makeCtx({
      id: "inst-admin-1",
      role: UserRole.INSTITUTION_ADMIN,
      institutionId: instA.id,
    });

    await expect(
      adminResolvers.Mutation.inviteUser(
        null as any,
        {
          email: `cross-inst-${Date.now()}@b.edu`,
          name: "Cross Inst",
          institutionId: instB.id,
          role: UserRole.INSTRUCTOR,
        },
        instAdminCtx
      )
    ).rejects.toThrow("Cannot invite users to a different institution");
  });

  it("instructor cannot invite", async () => {
    const instructorCtx = makeCtx({
      id: "instructor-1",
      role: UserRole.INSTRUCTOR,
    });

    await expect(
      adminResolvers.Mutation.inviteUser(
        null as any,
        {
          email: `no-access-${Date.now()}@a.edu`,
          name: "No Access",
          institutionId: instA.id,
          role: UserRole.INSTRUCTOR,
        },
        instructorCtx
      )
    ).rejects.toThrow("Insufficient permissions");
  });
});

// ── revokeCourseAccess security ────────────────────────────────────

describe("revokeCourseAccess security", () => {
  let courseA: Course;
  let courseB: Course;
  let targetUser: User;

  beforeAll(async () => {
    const courseRepo = AppDataSource.getRepository(Course);
    const userRepo = AppDataSource.getRepository(User);
    const accessRepo = AppDataSource.getRepository(CourseAccess);

    courseA = await courseRepo.save(
      courseRepo.create({
        name: `Course A ${Date.now()}`,
        institutionId: instA.id,
      })
    );
    createdCourseIds.push(courseA.id);

    courseB = await courseRepo.save(
      courseRepo.create({
        name: `Course B ${Date.now()}`,
        institutionId: instB.id,
      })
    );
    createdCourseIds.push(courseB.id);

    targetUser = await userRepo.save(
      userRepo.create({
        id: `revoke-target-${Date.now()}`,
        email: `revoke-target-${Date.now()}@test.com`,
        name: "Revoke Target",
        role: UserRole.INSTRUCTOR,
        institutionId: instB.id,
      })
    );
    createdUserIds.push(targetUser.id);

    // Grant access to courseB
    await accessRepo.save(
      accessRepo.create({
        userId: targetUser.id,
        courseId: courseB.id,
        accessLevel: AccessLevel.COLLABORATOR,
      })
    );
  });

  it("institution_admin cannot revoke for courses outside their institution", async () => {
    const instAdminCtx = makeCtx({
      id: "inst-admin-revoke",
      role: UserRole.INSTITUTION_ADMIN,
      institutionId: instA.id,
    });

    await expect(
      adminResolvers.Mutation.revokeCourseAccess(
        null as any,
        { userId: targetUser.id, courseId: courseB.id },
        instAdminCtx
      )
    ).rejects.toThrow("Course is not in your institution");
  });

  it("digication_admin can revoke access for any course", async () => {
    const result = await adminResolvers.Mutation.revokeCourseAccess(
      null as any,
      { userId: targetUser.id, courseId: courseB.id },
      digicationAdminCtx
    );
    expect(result).toBe(true);
  });
});

// ── users query ────────────────────────────────────────────────────

describe("users query", () => {
  let searchUser: User;

  beforeAll(async () => {
    const userRepo = AppDataSource.getRepository(User);
    searchUser = await userRepo.save(
      userRepo.create({
        id: `search-user-${Date.now()}`,
        email: `searchable-${Date.now()}@a.edu`,
        name: "Searchable Person",
        role: UserRole.INSTRUCTOR,
        institutionId: instA.id,
      })
    );
    createdUserIds.push(searchUser.id);
  });

  it("filters by search term (name)", async () => {
    const result = await adminResolvers.Query.users(
      null as any,
      { search: "Searchable" },
      digicationAdminCtx
    );
    const found = result.find((u: User) => u.id === searchUser.id);
    expect(found).toBeDefined();
  });

  it("filters by search term (email)", async () => {
    const result = await adminResolvers.Query.users(
      null as any,
      { search: searchUser.email },
      digicationAdminCtx
    );
    const found = result.find((u: User) => u.id === searchUser.id);
    expect(found).toBeDefined();
  });

  it("institution_admin only sees own institution's users", async () => {
    const instAdminCtx = makeCtx({
      id: "inst-admin-users",
      role: UserRole.INSTITUTION_ADMIN,
      institutionId: instA.id,
    });

    const result = await adminResolvers.Query.users(
      null as any,
      {},
      instAdminCtx
    );

    // All returned users should be in instA
    for (const u of result) {
      expect(u.institutionId).toBe(instA.id);
    }
  });
});

// ── createInstitution ──────────────────────────────────────────────

describe("createInstitution", () => {
  it("creates institution with name, domain, slug", async () => {
    const name = `Create Test ${Date.now()}`;
    const result = await institutionResolvers.Mutation.createInstitution(
      null as any,
      { name, domain: "test.edu", slug: "test" },
      digicationAdminCtx
    );
    createdInstitutionIds.push(result.id);

    expect(result.name).toBe(name);
    expect(result.domain).toBe("test.edu");
    expect(result.slug).toBe("test");
  });

  it("rejects non-digication_admin", async () => {
    const instAdminCtx = makeCtx({
      role: UserRole.INSTITUTION_ADMIN,
      institutionId: instA.id,
    });

    await expect(
      institutionResolvers.Mutation.createInstitution(
        null as any,
        { name: `Rejected ${Date.now()}` },
        instAdminCtx
      )
    ).rejects.toThrow("Insufficient permissions");
  });
});

// ── updateInstitution ──────────────────────────────────────────────

describe("updateInstitution", () => {
  it("updates institution fields", async () => {
    const result = await institutionResolvers.Mutation.updateInstitution(
      null as any,
      { id: instA.id, domain: "updated.edu" },
      digicationAdminCtx
    );
    expect(result.domain).toBe("updated.edu");
  });

  it("returns NOT_FOUND for bad id", async () => {
    await expect(
      institutionResolvers.Mutation.updateInstitution(
        null as any,
        { id: "00000000-0000-0000-0000-000000000000", name: "Nope" },
        digicationAdminCtx
      )
    ).rejects.toThrow("Institution not found");
  });
});

// ── updateUserInstitution ──────────────────────────────────────────

describe("updateUserInstitution", () => {
  let moveUser: User;

  beforeAll(async () => {
    const userRepo = AppDataSource.getRepository(User);
    moveUser = await userRepo.save(
      userRepo.create({
        id: `move-user-${Date.now()}`,
        email: `move-${Date.now()}@test.com`,
        name: "Move User",
        role: UserRole.INSTRUCTOR,
        institutionId: instA.id,
      })
    );
    createdUserIds.push(moveUser.id);
  });

  it("assigns user to institution", async () => {
    const result = await adminResolvers.Mutation.updateUserInstitution(
      null as any,
      { userId: moveUser.id, institutionId: instB.id },
      digicationAdminCtx
    );
    expect(result.institutionId).toBe(instB.id);
  });

  it("rejects non-digication_admin", async () => {
    const instAdminCtx = makeCtx({
      role: UserRole.INSTITUTION_ADMIN,
      institutionId: instA.id,
    });

    await expect(
      adminResolvers.Mutation.updateUserInstitution(
        null as any,
        { userId: moveUser.id, institutionId: instA.id },
        instAdminCtx
      )
    ).rejects.toThrow("Insufficient permissions");
  });
});
