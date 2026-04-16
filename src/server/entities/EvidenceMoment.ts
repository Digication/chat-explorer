import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
  type Relation,
} from "typeorm";
import type { Student } from "./Student.js";
import type { Comment } from "./Comment.js";
import type { EvidenceOutcomeLink } from "./EvidenceOutcomeLink.js";

export enum EvidenceType {
  TORI = "TORI",
  REFLECTION = "REFLECTION",
  OUTCOME = "OUTCOME",
  STRUCTURAL = "STRUCTURAL",
}

@Entity()
@Index(["studentId"])
@Index(["commentId"])
@Index(["processedAt"])
export class EvidenceMoment {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  studentId!: string;

  @Column({ type: "uuid", nullable: true })
  commentId!: string | null;

  @Column({ type: "uuid", nullable: true })
  artifactSectionId!: string | null;

  @Column({ type: "text" })
  narrative!: string;

  @Column({ type: "text" })
  sourceText!: string;

  @Column({ type: "enum", enum: EvidenceType })
  type!: EvidenceType;

  @Column({ type: "varchar" })
  modelVersion!: string;

  @CreateDateColumn({ type: "timestamptz" })
  processedAt!: Date;

  @Column({ type: "uuid", nullable: true })
  parentMomentId!: string | null;

  @Column({ type: "boolean", default: true })
  isLatest!: boolean;

  @ManyToOne("Student", { onDelete: "CASCADE" })
  @JoinColumn({ name: "studentId" })
  student!: Relation<Student>;

  @ManyToOne("Comment", { nullable: true, onDelete: "CASCADE" })
  @JoinColumn({ name: "commentId" })
  comment!: Relation<Comment> | null;

  @ManyToOne("EvidenceMoment", { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "parentMomentId" })
  parentMoment!: Relation<EvidenceMoment> | null;

  @OneToMany("EvidenceOutcomeLink", "evidenceMoment")
  outcomeLinks!: Relation<EvidenceOutcomeLink[]>;
}
