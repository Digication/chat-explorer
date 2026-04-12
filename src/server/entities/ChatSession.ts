import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  type Relation,
} from "typeorm";
import type { User } from "./User.js";
import type { ChatMessage } from "./ChatMessage.js";

export enum ChatScope {
  SELECTION = "SELECTION",
  COURSE = "COURSE",
  CROSS_COURSE = "CROSS_COURSE",
}

@Entity()
export class ChatSession {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar" })
  userId!: string;

  @Column({ type: "varchar", nullable: true })
  institutionId!: string | null;

  @Column({ type: "varchar", nullable: true })
  title!: string | null;

  @Column({ type: "enum", enum: ChatScope, default: ChatScope.SELECTION })
  scope!: ChatScope;

  @Column({ type: "varchar", nullable: true })
  courseId!: string | null;

  @Column({ type: "varchar", nullable: true })
  assignmentId!: string | null;

  @Column({ type: "varchar", nullable: true })
  studentId!: string | null;

  @Column({ type: "text", array: true, nullable: true })
  selectedCommentIds!: string[] | null;

  @Column({ type: "text", array: true, nullable: true })
  selectedToriTags!: string[] | null;

  @Column({ type: "boolean", default: false })
  showPII!: boolean;

  @Column({ type: "varchar", nullable: true })
  llmProvider!: string | null;

  @Column({ type: "varchar", nullable: true })
  llmModel!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;

  @ManyToOne("User", "chatSessions", { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user!: Relation<User>;

  @OneToMany("ChatMessage", "session")
  messages!: Relation<ChatMessage[]>;
}
