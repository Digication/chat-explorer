import { AppDataSource } from "../data-source.js";
import { Student } from "../entities/Student.js";
import { User, UserRole } from "../entities/User.js";
import { sendInvitationEmail } from "../auth.js";

/**
 * Invite a student to access the app. Creates a User record with the
 * student role, links it to the existing Student data record, and sends
 * a magic link invitation email.
 *
 * Idempotent — if the student already has a userId, returns the existing user.
 */
export async function inviteStudent(
  studentId: string,
  invitedById: string
): Promise<{ userId: string; email: string }> {
  const studentRepo = AppDataSource.getRepository(Student);
  const userRepo = AppDataSource.getRepository(User);

  const student = await studentRepo.findOne({ where: { id: studentId } });
  if (!student) {
    throw new Error("Student not found");
  }

  if (!student.email) {
    throw new Error(
      "Cannot invite student without an email address. " +
      "This student's data was imported without an email."
    );
  }

  // Already invited — return existing user
  if (student.userId) {
    const existingUser = await userRepo.findOne({
      where: { id: student.userId },
    });
    if (existingUser) {
      return { userId: existingUser.id, email: existingUser.email };
    }
  }

  // Check if a User with this email already exists (e.g. faculty who is
  // also a student in another course). We don't create a second account.
  const existingByEmail = await userRepo.findOne({
    where: { email: student.email },
  });
  if (existingByEmail) {
    // Link the student record to the existing user
    student.userId = existingByEmail.id;
    await studentRepo.save(student);
    return { userId: existingByEmail.id, email: existingByEmail.email };
  }

  // Create a new User with student role
  const inviter = await userRepo.findOne({ where: { id: invitedById } });
  const inviterName = inviter?.name ?? "An administrator";

  const now = new Date();
  const newUser = userRepo.create({
    id: crypto.randomUUID(),
    email: student.email,
    name: [student.firstName, student.lastName].filter(Boolean).join(" ") || student.email,
    role: UserRole.STUDENT,
    institutionId: student.institutionId,
    emailVerified: false,
    invitedAt: now,
    lastInvitedAt: now,
    image: null,
    preferredLlmProvider: null,
    preferredLlmModel: null,
  });
  await userRepo.save(newUser);

  // Link student record to new user
  student.userId = newUser.id;
  await studentRepo.save(student);

  // Send magic link invitation email
  try {
    await sendInvitationEmail(student.email, inviterName);
  } catch {
    // User was created but email failed — admin can resend later
    console.error(
      `[student-invite] User created for ${student.email} but email send failed`
    );
  }

  return { userId: newUser.id, email: newUser.email };
}

/**
 * Invite multiple students at once. Processes each individually so one
 * failure doesn't block the others.
 */
export async function bulkInviteStudents(
  studentIds: string[],
  invitedById: string
): Promise<
  Array<{
    studentId: string;
    userId: string | null;
    email: string | null;
    error: string | null;
  }>
> {
  const results = [];

  for (const studentId of studentIds) {
    try {
      const result = await inviteStudent(studentId, invitedById);
      results.push({
        studentId,
        userId: result.userId,
        email: result.email,
        error: null,
      });
    } catch (err) {
      results.push({
        studentId,
        userId: null,
        email: null,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return results;
}
