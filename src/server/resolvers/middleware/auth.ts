import { GraphQLError } from "graphql";
import { AppDataSource } from "../../data-source.js";
import { CourseAccess } from "../../entities/CourseAccess.js";
import { Course } from "../../entities/Course.js";
import { UserRole } from "../../entities/User.js";
import type { GraphQLContext } from "../../types/context.js";

/**
 * Throws if the user is not logged in.
 */
export function requireAuth(ctx: GraphQLContext) {
  if (!ctx.user) {
    throw new GraphQLError("Not authenticated", {
      extensions: { code: "UNAUTHENTICATED" },
    });
  }
  return ctx.user;
}

/**
 * Throws if the user's role is not in the allowed list.
 */
export function requireRole(
  ctx: GraphQLContext,
  allowedRoles: string[]
) {
  const user = requireAuth(ctx);
  if (!allowedRoles.includes(user.role)) {
    throw new GraphQLError("Insufficient permissions", {
      extensions: { code: "FORBIDDEN" },
    });
  }
  return user;
}

/**
 * Checks that the user has CourseAccess for this course,
 * or is an institution_admin for the course's institution,
 * or is a digication_admin.
 */
export async function requireCourseAccess(
  ctx: GraphQLContext,
  courseId: string
) {
  const user = requireAuth(ctx);

  if (user.role === UserRole.DIGICATION_ADMIN) return user;

  // Check institution admin access
  if (user.role === UserRole.INSTITUTION_ADMIN) {
    const courseRepo = AppDataSource.getRepository(Course);
    const course = await courseRepo.findOne({ where: { id: courseId } });
    if (course && course.institutionId === user.institutionId) return user;
  }

  // Check direct course access
  const accessRepo = AppDataSource.getRepository(CourseAccess);
  const access = await accessRepo.findOne({
    where: { userId: user.id, courseId },
  });
  if (access) return user;

  throw new GraphQLError("You do not have access to this course", {
    extensions: { code: "FORBIDDEN" },
  });
}

/**
 * Checks the user belongs to this institution or is a digication_admin.
 */
export function requireInstitutionAccess(
  ctx: GraphQLContext,
  institutionId: string
) {
  const user = requireAuth(ctx);
  if (user.role === UserRole.DIGICATION_ADMIN) return user;
  if (user.institutionId === institutionId) return user;

  throw new GraphQLError("You do not have access to this institution", {
    extensions: { code: "FORBIDDEN" },
  });
}
