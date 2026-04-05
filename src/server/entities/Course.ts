import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
  type Relation,
} from "typeorm";
import type { Institution } from "./Institution.js";
import type { Assignment } from "./Assignment.js";
import type { CourseAccess } from "./CourseAccess.js";
import type { StudentConsent } from "./StudentConsent.js";

@Entity()
@Index(["externalId", "institutionId"], { unique: true, where: '"externalId" IS NOT NULL' })
export class Course {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar" })
  institutionId!: string;

  @Column({ type: "varchar", nullable: true })
  externalId!: string | null;

  @Column({ type: "varchar" })
  name!: string;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @Column({ type: "varchar", nullable: true })
  url!: string | null;

  @Column({ type: "timestamptz", nullable: true })
  startDate!: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  endDate!: Date | null;

  @Column({ type: "varchar", nullable: true })
  courseNumber!: string | null;

  @Column({ type: "varchar", nullable: true })
  syncId!: string | null;

  @Column({ type: "varchar", nullable: true })
  faculty!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;

  @ManyToOne("Institution", "courses")
  @JoinColumn({ name: "institutionId" })
  institution!: Relation<Institution>;

  @OneToMany("Assignment", "course")
  assignments!: Relation<Assignment[]>;

  @OneToMany("CourseAccess", "course")
  courseAccess!: Relation<CourseAccess[]>;

  @OneToMany("StudentConsent", "course")
  studentConsents!: Relation<StudentConsent[]>;
}
