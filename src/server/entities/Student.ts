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
import type { Institution } from "./Institution.js";
import type { User } from "./User.js";
import type { Comment } from "./Comment.js";
import type { StudentConsent } from "./StudentConsent.js";

@Entity()
@Index(["systemId", "institutionId"], { unique: true })
export class Student {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar" })
  institutionId!: string;

  @Column({ type: "varchar" })
  systemId!: string;

  @Column({ type: "varchar", nullable: true })
  syncId!: string | null;

  @Column({ type: "varchar", nullable: true })
  firstName!: string | null;

  @Column({ type: "varchar", nullable: true })
  lastName!: string | null;

  @Column({ type: "varchar", nullable: true })
  email!: string | null;

  @Column({ type: "varchar", nullable: true })
  systemRole!: string | null;

  @Column({ type: "varchar", nullable: true })
  courseRole!: string | null;

  @Column({ type: "varchar", nullable: true })
  userId!: string | null;

  @ManyToOne("User", { nullable: true })
  @JoinColumn({ name: "userId" })
  user!: Relation<User> | null;

  @ManyToOne("Institution", "students")
  @JoinColumn({ name: "institutionId" })
  institution!: Relation<Institution>;

  @OneToMany("Comment", "student")
  comments!: Relation<Comment[]>;

  @OneToMany("StudentConsent", "student")
  consents!: Relation<StudentConsent[]>;
}
