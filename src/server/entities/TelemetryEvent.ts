import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  type Relation,
} from "typeorm";
import type { User } from "./User.js";
import type { Institution } from "./Institution.js";

@Index(["userId", "createdAt"])
@Index(["institutionId", "createdAt"])
@Index(["eventCategory", "createdAt"])
@Entity()
export class TelemetryEvent {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar" })
  userId!: string;

  @Column({ type: "uuid", nullable: true })
  institutionId!: string | null;

  // Plain strings (not Postgres enums) so new event types don't need a migration
  @Column({ type: "varchar", length: 50 })
  eventCategory!: string;

  @Column({ type: "varchar", length: 100 })
  eventAction!: string;

  // Flexible per-event payload — each event category defines its own shape
  @Column({ type: "jsonb", nullable: true })
  metadata!: Record<string, unknown> | null;

  @Column({ type: "varchar", nullable: true })
  pageUrl!: string | null;

  // Browser session identifier (generated client-side via sessionStorage)
  @Column({ type: "varchar", length: 64 })
  sessionId!: string;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @ManyToOne("User", { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user!: Relation<User>;

  @ManyToOne("Institution", { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "institutionId" })
  institution!: Relation<Institution> | null;
}
