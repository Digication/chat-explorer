import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  type Relation,
} from "typeorm";
import type { ChatSession } from "./ChatSession.js";

export enum ChatMessageRole {
  USER = "USER",
  ASSISTANT = "ASSISTANT",
  SYSTEM = "SYSTEM",
}

@Entity()
export class ChatMessage {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar" })
  sessionId!: string;

  @Column({ type: "enum", enum: ChatMessageRole })
  role!: ChatMessageRole;

  @Column({ type: "text" })
  content!: string;

  @Column({ type: "jsonb", nullable: true })
  contextMeta!: Record<string, unknown> | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @ManyToOne("ChatSession", "messages", { onDelete: "CASCADE" })
  @JoinColumn({ name: "sessionId" })
  session!: Relation<ChatSession>;
}
