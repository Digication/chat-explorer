import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  type Relation,
} from "typeorm";
import type { Institution } from "./Institution.js";
import type { CourseAccess } from "./CourseAccess.js";
import type { ChatSession } from "./ChatSession.js";
import type { UploadLog } from "./UploadLog.js";

export enum UserRole {
  INSTRUCTOR = "instructor",
  INSTITUTION_ADMIN = "institution_admin",
  DIGICATION_ADMIN = "digication_admin",
}

@Entity()
export class User {
  @PrimaryColumn()
  id!: string;

  @Column({ type: "varchar" })
  name!: string;

  @Column({ type: "varchar", unique: true })
  email!: string;

  @Column({ type: "varchar", nullable: true })
  image!: string | null;

  @Column({ type: "boolean", default: false })
  emailVerified!: boolean;

  @Column({ type: "enum", enum: UserRole, default: UserRole.INSTRUCTOR })
  role!: UserRole;

  @Column({ type: "varchar", nullable: true })
  institutionId!: string | null;

  @Column({ type: "varchar", nullable: true })
  preferredLlmProvider!: string | null;

  @Column({ type: "varchar", nullable: true })
  preferredLlmModel!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;

  @ManyToOne("Institution", "users", { nullable: true })
  @JoinColumn({ name: "institutionId" })
  institution!: Relation<Institution> | null;

  @OneToMany("CourseAccess", "user")
  courseAccess!: Relation<CourseAccess[]>;

  @OneToMany("ChatSession", "user")
  chatSessions!: Relation<ChatSession[]>;

  @OneToMany("UploadLog", "uploadedBy")
  uploads!: Relation<UploadLog[]>;
}
