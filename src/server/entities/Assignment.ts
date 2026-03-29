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
import type { Course } from "./Course.js";
import type { Thread } from "./Thread.js";

@Entity()
@Index(["externalId", "courseId"], { unique: true })
export class Assignment {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar" })
  courseId!: string;

  @Column({ type: "varchar" })
  externalId!: string;

  @Column({ type: "varchar" })
  name!: string;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @Column({ type: "varchar", nullable: true })
  url!: string | null;

  @Column({ type: "timestamptz", nullable: true })
  createdDate!: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  dueDate!: Date | null;

  @Column({ type: "decimal", nullable: true })
  gradeMaxPoints!: number | null;

  @Column({ type: "text", nullable: true })
  intendedOutcomes!: string | null;

  @Column({ type: "varchar", nullable: true })
  aiAssistantId!: string | null;

  @Column({ type: "varchar", nullable: true })
  aiAssistantName!: string | null;

  @Column({ type: "text", nullable: true })
  aiAssistantDescription!: string | null;

  @Column({ type: "text", nullable: true })
  aiAssistantInstruction!: string | null;

  @Column({ type: "text", nullable: true })
  aiAssistantRestriction!: string | null;

  @Column({ type: "varchar", nullable: true })
  aiAssistantRole!: string | null;

  @Column({ type: "text", nullable: true })
  aiAssistantTags!: string | null;

  @Column({ type: "varchar", nullable: true })
  aiAssistantGradeLevel!: string | null;

  @Column({ type: "varchar", nullable: true })
  aiAssistantResponseLength!: string | null;

  @Column({ type: "varchar", nullable: true })
  aiAssistantVisibility!: string | null;

  @Column({ type: "boolean", default: false })
  aiAssistantReflections!: boolean;

  @Column({ type: "boolean", default: false })
  aiAssistantGenerateAnswers!: boolean;

  @Column({ type: "varchar", nullable: true })
  aiAssistantIntendedAudience!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  importedAt!: Date;

  @ManyToOne("Course", "assignments")
  @JoinColumn({ name: "courseId" })
  course!: Relation<Course>;

  @OneToMany("Thread", "assignment")
  threads!: Relation<Thread[]>;
}
