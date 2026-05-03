import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
  type Relation,
} from "typeorm";
import type { Artifact } from "./Artifact.js";
import type { Comment } from "./Comment.js";
import type { EvidenceMoment } from "./EvidenceMoment.js";

/**
 * Shape of a section within an artifact. Document artifacts produce
 * PARAGRAPH / SECTION / HEADING / CODE_BLOCK; CONVERSATION artifacts
 * produce COMMENT (one per USER comment in the wrapped thread).
 */
export enum SectionType {
  PARAGRAPH = "PARAGRAPH",
  SECTION = "SECTION",
  SLIDE = "SLIDE",
  CODE_BLOCK = "CODE_BLOCK",
  HEADING = "HEADING",
  COMMENT = "COMMENT",
}

@Entity()
@Index(["artifactId"])
@Index(["commentId"])
export class ArtifactSection {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  artifactId!: string;

  // Set when parent artifact is CONVERSATION — points to the source Comment.
  @Column({ type: "uuid", nullable: true })
  commentId!: string | null;

  @Column({ type: "int" })
  sequenceOrder!: number;

  @Column({ type: "varchar", nullable: true })
  title!: string | null;

  @Column({ type: "text" })
  content!: string;

  @Column({ type: "enum", enum: SectionType })
  type!: SectionType;

  // Simple whitespace word count; used for display and rough size estimation.
  @Column({ type: "int", default: 0 })
  wordCount!: number;

  @ManyToOne("Artifact", "sections", { onDelete: "CASCADE" })
  @JoinColumn({ name: "artifactId" })
  artifact!: Relation<Artifact>;

  @ManyToOne("Comment", { nullable: true, onDelete: "CASCADE" })
  @JoinColumn({ name: "commentId" })
  comment!: Relation<Comment> | null;

  @OneToMany("EvidenceMoment", "artifactSection")
  evidenceMoments!: Relation<EvidenceMoment[]>;
}
