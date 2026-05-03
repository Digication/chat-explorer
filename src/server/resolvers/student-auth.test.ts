/**
 * Tests for student auth resolvers — myStudentProfile query,
 * inviteStudent and bulkInviteStudents mutations, students query.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { AppDataSource } from "../data-source.js";
import { User, UserRole } from "../entities/User.js";
import { Institution } from "../entities/Institution.js";
import { Student } from "../entities/Student.js";
import { studentAuthResolvers } from "./student-auth.js";
import type { GraphQLContext } from "../types/context.js";

// Mock the email sending so tests don't try to send real emails
vi.mock("../auth.js", () => ({
  sendInvitationEmail: vi.fn().mockResolvedValue(undefined),
}));

function makeCtx(
  overrides: Partial<NonNullable<GraphQLContext["user"]>>
): GraphQLContext {
  return {
    user: {
      id: overrides.id ?? "test-id",
      name: overrides.name ?? "Test User",
      email: overrides.email ?? "test@test.com",
      role: overrides.role ?? UserRole.DIGICATION_ADMIN,
      institutionId: overrides.institutionId ?? null,
      image: null,
    },
  };
}

const unauthCtx: GraphQLContext = { user: null };

// Track entities for cleanup
const createdUserIds: string[] = [];
const createdStudentIds: string[] = [];
let testInstitution: Institution;
let testStudent: Student;
let studentUser: User;

beforeAll(async () => {
  const instRepo = AppDataSource.getRepository(Institution);
  const studentRepo = AppDataSource.getRepository(Student);
  const userRepo = AppDataSource.getRepository(User);

  testInstitution = await instRepo.save(
    instRepo.create({
      name: `Test Inst StudentAuth ${Date.now()}`,
      domain: "studentauth.edu",
    })
  );

  // Create a test student (data record, not a user yet)
  testStudent = await studentRepo.save(
    studentRepo.create({
      institutionId: testInstitution.id,
      systemId: `student-test-${Date.now()}`,
      firstName: "Alice",
      lastName: "Student",
      email: `alice-${Date.now()}@studentauth.edu`,
    })
  );
  createdStudentIds.push(testStudent.id);

  // Create a student user linked to the test student
  studentUser = userRepo.create({
    id: crypto.randomUUID(),
    name: "Alice Student",
    email: testStudent.email!,
    role: UserRole.STUDENT,
    institutionId: testInstitution.id,
    emailVerified: true,
    image: null,
    preferredLlmProvider: null,
    preferredLlmModel: null,
  });
  await userRepo.save(studentUser);
  createdUserIds.push(studentUser.id);

  // Link student record to user
  testStudent.userId = studentUser.id;
  await studentRepo.save(testStudent);
});

afterAll(async () => {
  const userRepo = AppDataSource.getRepository(User);
  const studentRepo = AppDataSource.getRepository(Student);
  const instRepo = AppDataSource.getRepository(Institution);

  for (const id of createdStudentIds) {
    await studentRepo.delete(id);
  }
  for (const id of createdUserIds) {
    await userRepo.delete(id);
  }
  if (testInstitution) {
    await instRepo.delete(testInstitution.id);
  }
});

describe("myStudentProfile", () => {
  it("returns the student record for a logged-in student user", async () => {
    const ctx = makeCtx({
      id: studentUser.id,
      role: UserRole.STUDENT,
    });

    const result = await studentAuthResolvers.Query.myStudentProfile(
      null,
      {},
      ctx
    );
    expect(result).toBeTruthy();
    expect(result!.id).toBe(testStudent.id);
    expect(result!.firstName).toBe("Alice");
  });

  it("rejects non-student roles", async () => {
    const ctx = makeCtx({ role: UserRole.INSTRUCTOR });
    await expect(
      studentAuthResolvers.Query.myStudentProfile(null, {}, ctx)
    ).rejects.toThrow("Insufficient permissions");
  });

  it("rejects unauthenticated requests", async () => {
    await expect(
      studentAuthResolvers.Query.myStudentProfile(null, {}, unauthCtx)
    ).rejects.toThrow("Not authenticated");
  });
});

describe("students query", () => {
  it("returns students for the given institution", async () => {
    const ctx = makeCtx({ role: UserRole.DIGICATION_ADMIN });
    const result = await studentAuthResolvers.Query.students(
      null,
      { institutionId: testInstitution.id },
      ctx
    );
    expect(Array.isArray(result)).toBe(true);
    expect(result.some((s: Student) => s.id === testStudent.id)).toBe(true);
  });

  it("filters students by search term", async () => {
    const ctx = makeCtx({ role: UserRole.DIGICATION_ADMIN });
    const result = await studentAuthResolvers.Query.students(
      null,
      { institutionId: testInstitution.id, search: "Alice" },
      ctx
    );
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].firstName).toBe("Alice");
  });

  it("rejects non-admin roles", async () => {
    const ctx = makeCtx({ role: UserRole.INSTRUCTOR });
    await expect(
      studentAuthResolvers.Query.students(
        null,
        { institutionId: testInstitution.id },
        ctx
      )
    ).rejects.toThrow("Insufficient permissions");
  });

  it("institution admin cannot list other institutions students", async () => {
    const ctx = makeCtx({
      role: UserRole.INSTITUTION_ADMIN,
      institutionId: "other-institution-id",
    });
    const result = await studentAuthResolvers.Query.students(
      null,
      { institutionId: testInstitution.id },
      ctx
    );
    expect(result).toEqual([]);
  });
});

describe("inviteStudent mutation", () => {
  it("requires admin role", async () => {
    const ctx = makeCtx({ role: UserRole.INSTRUCTOR });
    await expect(
      studentAuthResolvers.Mutation.inviteStudent(
        null,
        { studentId: testStudent.id },
        ctx
      )
    ).rejects.toThrow("Insufficient permissions");
  });

  it("returns existing user for already-invited student (idempotent)", async () => {
    const ctx = makeCtx({
      id: "admin-inviter",
      role: UserRole.DIGICATION_ADMIN,
    });
    const result = await studentAuthResolvers.Mutation.inviteStudent(
      null,
      { studentId: testStudent.id },
      ctx
    );
    expect(result.userId).toBe(studentUser.id);
    expect(result.email).toBe(studentUser.email);
  });
});
