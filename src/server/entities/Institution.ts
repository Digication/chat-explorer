import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  type Relation,
} from "typeorm";
import type { User } from "./User.js";
import type { Course } from "./Course.js";
import type { Student } from "./Student.js";

@Entity()
export class Institution {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", unique: true })
  name!: string;

  @Column({ type: "varchar", nullable: true })
  domain!: string | null;

  @Column({ type: "varchar", nullable: true, unique: true })
  slug!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;

  @OneToMany("User", "institution")
  users!: Relation<User[]>;

  @OneToMany("Course", "institution")
  courses!: Relation<Course[]>;

  @OneToMany("Student", "institution")
  students!: Relation<Student[]>;
}
