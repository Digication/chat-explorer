import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  type Relation,
} from "typeorm";
import type { Comment } from "./Comment.js";
import type { ToriTag } from "./ToriTag.js";

@Entity()
@Index(["commentId", "toriTagId"], { unique: true })
export class CommentToriTag {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar" })
  commentId!: string;

  @Column({ type: "varchar" })
  toriTagId!: string;

  @Column({ type: "varchar", nullable: true })
  sourceCommentId!: string | null;

  @Column({ type: "varchar", default: "extracted" })
  extractionMethod!: string;

  @ManyToOne("Comment", "toriTags", { onDelete: "CASCADE" })
  @JoinColumn({ name: "commentId" })
  comment!: Relation<Comment>;

  @ManyToOne("ToriTag", "commentToriTags", { onDelete: "CASCADE" })
  @JoinColumn({ name: "toriTagId" })
  toriTag!: Relation<ToriTag>;
}
