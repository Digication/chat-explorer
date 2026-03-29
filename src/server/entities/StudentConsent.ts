import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  type Relation,
} from "typeorm";
import type { Student } from "./Student.js";
import type { Institution } from "./Institution.js";
import type { Course } from "./Course.js";

export enum ConsentStatus {
  INCLUDED = "INCLUDED",
  EXCLUDED = "EXCLUDED",
}

@Entity()
@Index(["studentId", "institutionId", "courseId"], { unique: true })
export class StudentConsent {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar" })
  studentId!: string;

  @Column({ type: "varchar" })
  institutionId!: string;

  @Column({ type: "varchar", nullable: true })
  courseId!: string | null;

  @Column({ type: "enum", enum: ConsentStatus })
  status!: ConsentStatus;

  @Column({ type: "varchar" })
  updatedById!: string;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @ManyToOne("Student", "consents", { onDelete: "CASCADE" })
  @JoinColumn({ name: "studentId" })
  student!: Relation<Student>;

  @ManyToOne("Institution")
  @JoinColumn({ name: "institutionId" })
  institution!: Relation<Institution>;

  @ManyToOne("Course", "studentConsents", { nullable: true, onDelete: "CASCADE" })
  @JoinColumn({ name: "courseId" })
  course!: Relation<Course> | null;
}
