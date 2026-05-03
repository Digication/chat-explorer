import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
  type Relation,
} from "typeorm";
import type { Student } from "./Student.js";
import type { Course } from "./Course.js";
import type { Assignment } from "./Assignment.js";
import type { Thread } from "./Thread.js";
import type { User } from "./User.js";
import type { ArtifactSection } from "./ArtifactSection.js";

/**
 * Kind of student work represented by the artifact. PAPER/PRESENTATION/CODE/
 * PORTFOLIO are uploaded documents; CONVERSATION wraps an existing chat
 * Thread so section-level analysis can treat chats and documents uniformly.
 */
export enum ArtifactType {
  PAPER = "PAPER",
  PRESENTATION = "PRESENTATION",
  CODE = "CODE",
  PORTFOLIO = "PORTFOLIO",
  CONVERSATION = "CONVERSATION",
}

/**
 * Lifecycle of an artifact:
 *   UPLOADED   -> just stored, no sections yet (rarely observed — we move
 *                 to PROCESSING as soon as parsing starts)
 *   PROCESSING -> sections created, evidence pipeline running in background
 *   ANALYZED   -> evidence generated successfully
 *   FAILED     -> analysis failed; errorMessage populated
 *   DELETED    -> soft-deleted (not shown in lists)
 */
export enum ArtifactStatus {
  UPLOADED = "UPLOADED",
  PROCESSING = "PROCESSING",
  ANALYZED = "ANALYZED",
  FAILED = "FAILED",
  DELETED = "DELETED",
}

@Entity()
@Index(["studentId"])
@Index(["courseId"])
@Index(["assignmentId"])
@Index(["threadId"])
export class Artifact {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  studentId!: string;

  @Column({ type: "uuid" })
  courseId!: string;

  @Column({ type: "uuid", nullable: true })
  assignmentId!: string | null;

  // Set when type=CONVERSATION — links this artifact to the source chat thread.
  @Column({ type: "uuid", nullable: true })
  threadId!: string | null;

  @Column({ type: "varchar" })
  title!: string;

  @Column({ type: "enum", enum: ArtifactType })
  type!: ArtifactType;

  @Column({ type: "enum", enum: ArtifactStatus, default: ArtifactStatus.UPLOADED })
  status!: ArtifactStatus;

  @Column({ type: "varchar", nullable: true })
  sourceUrl!: string | null;

  @Column({ type: "varchar", nullable: true })
  mimeType!: string | null;

  @Column({ type: "int", nullable: true })
  fileSizeBytes!: number | null;

  // Relative path under the artifacts storage root (e.g.
  // "{institutionId}/{artifactId}/{filename}"). Null for CONVERSATION type.
  @Column({ type: "varchar", nullable: true })
  storagePath!: string | null;

  // better-auth user IDs are varchar (not uuid), so uploadedById is varchar.
  @Column({ type: "varchar", nullable: true })
  uploadedById!: string | null;

  // Populated when status=FAILED.
  @Column({ type: "text", nullable: true })
  errorMessage!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  uploadedAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;

  @ManyToOne("Student", { onDelete: "CASCADE" })
  @JoinColumn({ name: "studentId" })
  student!: Relation<Student>;

  @ManyToOne("Course", { onDelete: "CASCADE" })
  @JoinColumn({ name: "courseId" })
  course!: Relation<Course>;

  @ManyToOne("Assignment", { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "assignmentId" })
  assignment!: Relation<Assignment> | null;

  @ManyToOne("Thread", { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "threadId" })
  thread!: Relation<Thread> | null;

  @ManyToOne("User", { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "uploadedById" })
  uploadedBy!: Relation<User> | null;

  @OneToMany("ArtifactSection", "artifact")
  sections!: Relation<ArtifactSection[]>;
}
