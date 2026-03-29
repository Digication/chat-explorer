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
import type { Course } from "./Course.js";

export enum AccessLevel {
  OWNER = "owner",
  COLLABORATOR = "collaborator",
}

@Entity()
@Index(["userId", "courseId"], { unique: true })
export class CourseAccess {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar" })
  userId!: string;

  @Column({ type: "varchar" })
  courseId!: string;

  @Column({ type: "enum", enum: AccessLevel })
  accessLevel!: AccessLevel;

  @Column({ type: "varchar", nullable: true })
  grantedById!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  grantedAt!: Date;

  @ManyToOne("User", "courseAccess", { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user!: Relation<User>;

  @ManyToOne("Course", "courseAccess", { onDelete: "CASCADE" })
  @JoinColumn({ name: "courseId" })
  course!: Relation<Course>;
}
