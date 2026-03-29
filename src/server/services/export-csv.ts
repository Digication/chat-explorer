import { Parser } from "json2csv";
import { AppDataSource } from "../data-source.js";
import { Comment } from "../entities/Comment.js";
import { Thread } from "../entities/Thread.js";
import { Student } from "../entities/Student.js";
import { CommentToriTag } from "../entities/CommentToriTag.js";
import { ToriTag } from "../entities/ToriTag.js";
import { StudentConsent, ConsentStatus } from "../entities/StudentConsent.js";
import { IsNull } from "typeorm";

/**
 * Collects the IDs of students whose consent status is EXCLUDED
 * for a given institution (and optionally course).
 */
async function getExcludedStudentIds(
  institutionId: string,
  courseId?: string
): Promise<Set<string>> {
  const consentRepo = AppDataSource.getRepository(StudentConsent);
  const excluded = new Set<string>();

  // Institution-wide exclusions (courseId is null)
  const instExclusions = await consentRepo.find({
    where: {
      institutionId,
      courseId: IsNull(),
      status: ConsentStatus.EXCLUDED,
    },
    select: ["studentId"],
  });
  for (const exc of instExclusions) {
    excluded.add(exc.studentId);
  }

  // Course-level exclusions
  if (courseId) {
    const courseExclusions = await consentRepo.find({
      where: {
        institutionId,
        courseId,
        status: ConsentStatus.EXCLUDED,
      },
      select: ["studentId"],
    });
    for (const exc of courseExclusions) {
      excluded.add(exc.studentId);
    }
  }

  return excluded;
}

/**
 * Count the words in a string (splitting on whitespace).
 */
function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Exports all comments for a course as CSV.
 *
 * Columns: thread_name, comment_id, role, student_name, text,
 *          tori_tags (comma-separated), word_count, timestamp
 *
 * Students whose consent status is EXCLUDED are filtered out.
 */
export async function exportRawDataCsv(
  courseId: string,
  institutionId: string,
  assignmentId?: string
): Promise<string> {
  // 1. Determine which students to exclude
  const excludedIds = await getExcludedStudentIds(institutionId, courseId);

  // 2. Build the comment query, joining through thread -> assignment -> course
  const commentRepo = AppDataSource.getRepository(Comment);
  const qb = commentRepo
    .createQueryBuilder("c")
    .innerJoinAndSelect("c.thread", "t")
    .innerJoin("t.assignment", "a")
    .innerJoin("a.course", "co")
    .where("co.institutionId = :institutionId", { institutionId })
    .andWhere("a.courseId = :courseId", { courseId });

  if (assignmentId) {
    qb.andWhere("t.assignmentId = :assignmentId", { assignmentId });
  }

  qb.orderBy("t.name", "ASC").addOrderBy("c.orderIndex", "ASC");

  const comments = await qb.getMany();

  // 3. Collect all unique student IDs so we can load names in one query
  const studentIds = [
    ...new Set(
      comments.map((c) => c.studentId).filter((id): id is string => id !== null)
    ),
  ];

  // Load student names
  const studentMap = new Map<string, string>();
  if (studentIds.length > 0) {
    const studentRepo = AppDataSource.getRepository(Student);
    const students = await studentRepo
      .createQueryBuilder("s")
      .where("s.id IN (:...ids)", { ids: studentIds })
      .getMany();
    for (const s of students) {
      const name = [s.firstName, s.lastName].filter(Boolean).join(" ") || s.systemId;
      studentMap.set(s.id, name);
    }
  }

  // 4. Load TORI tags for all comment IDs in one query
  const commentIds = comments.map((c) => c.id);
  const toriTagMap = new Map<string, string[]>(); // commentId -> tag names

  if (commentIds.length > 0) {
    const cttRepo = AppDataSource.getRepository(CommentToriTag);
    const tagRepo = AppDataSource.getRepository(ToriTag);

    // Load all tags for reference
    const allTags = await tagRepo.find();
    const tagLookup = new Map(allTags.map((t) => [t.id, t.name]));

    // Load associations in batches to avoid parameter limits
    const batchSize = 500;
    for (let i = 0; i < commentIds.length; i += batchSize) {
      const batch = commentIds.slice(i, i + batchSize);
      const associations = await cttRepo
        .createQueryBuilder("ctt")
        .where("ctt.commentId IN (:...ids)", { ids: batch })
        .getMany();

      for (const assoc of associations) {
        if (!toriTagMap.has(assoc.commentId)) {
          toriTagMap.set(assoc.commentId, []);
        }
        const tagName = tagLookup.get(assoc.toriTagId) ?? assoc.toriTagId;
        toriTagMap.get(assoc.commentId)!.push(tagName);
      }
    }
  }

  // 5. Build rows, filtering out excluded students
  const rows = comments
    .filter((c) => {
      // Keep the comment if it has no student, or if the student is not excluded
      if (!c.studentId) return true;
      return !excludedIds.has(c.studentId);
    })
    .map((c) => ({
      thread_name: c.thread?.name ?? "",
      comment_id: c.id,
      role: c.role,
      student_name: c.studentId ? (studentMap.get(c.studentId) ?? "") : "",
      text: c.text,
      tori_tags: (toriTagMap.get(c.id) ?? []).join(", "),
      word_count: countWords(c.text),
      timestamp: c.timestamp ? c.timestamp.toISOString() : "",
    }));

  // 6. Convert to CSV
  const fields = [
    "thread_name",
    "comment_id",
    "role",
    "student_name",
    "text",
    "tori_tags",
    "word_count",
    "timestamp",
  ];

  const parser = new Parser({ fields });
  return parser.parse(rows);
}

/**
 * Exports a TORI tag frequency summary as CSV.
 *
 * Columns: tag_name, domain, count, percent
 *
 * Consent filtering is handled by only counting comments from consented students.
 */
export async function exportToriSummaryCsv(
  courseId: string,
  institutionId: string
): Promise<string> {
  // 1. Determine which students to exclude
  const excludedIds = await getExcludedStudentIds(institutionId, courseId);

  // 2. Get all USER comments for this course (consent-filtered)
  const commentRepo = AppDataSource.getRepository(Comment);
  const qb = commentRepo
    .createQueryBuilder("c")
    .innerJoin("c.thread", "t")
    .innerJoin("t.assignment", "a")
    .innerJoin("a.course", "co")
    .where("co.institutionId = :institutionId", { institutionId })
    .andWhere("a.courseId = :courseId", { courseId })
    .andWhere("c.role = :role", { role: "USER" });

  const comments = await qb.getMany();

  // Filter out excluded students
  const consentedComments = comments.filter((c) => {
    if (!c.studentId) return true;
    return !excludedIds.has(c.studentId);
  });

  const commentIds = consentedComments.map((c) => c.id);

  if (commentIds.length === 0) {
    const parser = new Parser({ fields: ["tag_name", "domain", "count", "percent"] });
    return parser.parse([]);
  }

  // 3. Count TORI tag occurrences
  const cttRepo = AppDataSource.getRepository(CommentToriTag);
  const tagRepo = AppDataSource.getRepository(ToriTag);
  const allTags = await tagRepo.find();
  const tagLookup = new Map(allTags.map((t) => [t.id, t]));

  const tagCounts = new Map<string, number>();
  let totalAssociations = 0;

  const batchSize = 500;
  for (let i = 0; i < commentIds.length; i += batchSize) {
    const batch = commentIds.slice(i, i + batchSize);
    const associations = await cttRepo
      .createQueryBuilder("ctt")
      .where("ctt.commentId IN (:...ids)", { ids: batch })
      .getMany();

    for (const assoc of associations) {
      tagCounts.set(assoc.toriTagId, (tagCounts.get(assoc.toriTagId) ?? 0) + 1);
      totalAssociations++;
    }
  }

  // 4. Build rows sorted by count descending
  const rows = [...tagCounts.entries()]
    .map(([tagId, count]) => {
      const tag = tagLookup.get(tagId);
      return {
        tag_name: tag?.name ?? "Unknown",
        domain: tag?.domain ?? "Unknown",
        count,
        percent:
          totalAssociations > 0
            ? Math.round((count / totalAssociations) * 10000) / 100
            : 0,
      };
    })
    .sort((a, b) => b.count - a.count);

  const parser = new Parser({
    fields: ["tag_name", "domain", "count", "percent"],
  });
  return parser.parse(rows);
}
