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
import type { Thread } from "./Thread.js";
import type { Student } from "./Student.js";
import type { CommentToriTag } from "./CommentToriTag.js";

export enum CommentRole {
  USER = "USER",
  ASSISTANT = "ASSISTANT",
  SYSTEM = "SYSTEM",
}

@Entity()
@Index(["externalId", "threadId"], { unique: true })
export class Comment {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar" })
  threadId!: string;

  @Column({ type: "varchar", nullable: true })
  studentId!: string | null;

  @Column({ type: "varchar" })
  externalId!: string;

  @Column({ type: "enum", enum: CommentRole })
  role!: CommentRole;

  @Column({ type: "text" })
  text!: string;

  @Column({ type: "timestamptz", nullable: true })
  timestamp!: Date | null;

  @Column({ type: "int" })
  orderIndex!: number;

  @Column({ type: "int", nullable: true })
  totalComments!: number | null;

  @Column({ type: "varchar", nullable: true })
  grade!: string | null;

  @Column({ type: "varchar", nullable: true })
  uploadedById!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  importedAt!: Date;

  @ManyToOne("Thread", "comments")
  @JoinColumn({ name: "threadId" })
  thread!: Relation<Thread>;

  @ManyToOne("Student", "comments", { nullable: true })
  @JoinColumn({ name: "studentId" })
  student!: Relation<Student> | null;

  @OneToMany("CommentToriTag", "comment")
  toriTags!: Relation<CommentToriTag[]>;
}
