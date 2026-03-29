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
import type { Assignment } from "./Assignment.js";
import type { Comment } from "./Comment.js";

@Entity()
@Index(["externalId", "assignmentId"], { unique: true })
export class Thread {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar" })
  assignmentId!: string;

  @Column({ type: "varchar" })
  externalId!: string;

  @Column({ type: "varchar" })
  name!: string;

  @Column({ type: "int", nullable: true })
  totalInputTokens!: number | null;

  @Column({ type: "int", nullable: true })
  totalOutputTokens!: number | null;

  @Column({ type: "decimal", nullable: true })
  totalCost!: number | null;

  @Column({ type: "varchar", nullable: true })
  submissionUrl!: string | null;

  @ManyToOne("Assignment", "threads")
  @JoinColumn({ name: "assignmentId" })
  assignment!: Relation<Assignment>;

  @OneToMany("Comment", "thread")
  comments!: Relation<Comment[]>;
}
