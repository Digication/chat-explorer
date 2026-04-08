import {
  Entity,
  PrimaryColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  CreateDateColumn,
  type Relation,
} from "typeorm";
import type { Comment } from "./Comment.js";

// The 4 categories of the Hatton & Smith (1995) reflection framework.
// See `.claude/plans/03-reflection-depth.md` and the project memory file
// `project_reflection_framework.md` for the operational definitions.
export enum ReflectionCategory {
  DESCRIPTIVE_WRITING = "DESCRIPTIVE_WRITING",
  DESCRIPTIVE_REFLECTION = "DESCRIPTIVE_REFLECTION",
  DIALOGIC_REFLECTION = "DIALOGIC_REFLECTION",
  CRITICAL_REFLECTION = "CRITICAL_REFLECTION",
}

// One row per USER comment. Persisted so the labels are stable across
// scope filters and so we don't pay LLM cost on every Insights page load.
@Entity()
@Index(["category"])
export class CommentReflectionClassification {
  // PK + FK to Comment. CASCADE so deleting a comment cleans up its label.
  @PrimaryColumn({ type: "uuid" })
  commentId!: string;

  @Column({ type: "enum", enum: ReflectionCategory })
  category!: ReflectionCategory;

  // Short verbatim quote (≤200 chars) from the comment that justifies
  // the label. Shown to instructors in drill-downs.
  @Column({ type: "text", nullable: true })
  evidenceQuote!: string | null;

  // One-sentence model rationale. Drill-down only — never in tables.
  @Column({ type: "text", nullable: true })
  rationale!: string | null;

  // e.g. "google/gemini-2.5-flash@2026-04-08". Lets us re-classify
  // selectively when we tune the prompt or swap models.
  @Column({ type: "varchar" })
  classifierVersion!: string;

  // Model self-reported, 0–1. Stored for diagnostics — NEVER shown.
  @Column({ type: "float", nullable: true })
  confidence!: number | null;

  @CreateDateColumn({ type: "timestamptz" })
  classifiedAt!: Date;

  @ManyToOne("Comment", { onDelete: "CASCADE" })
  @JoinColumn({ name: "commentId" })
  comment!: Relation<Comment>;
}
