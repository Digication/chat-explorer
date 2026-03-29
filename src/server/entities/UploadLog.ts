import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  type Relation,
} from "typeorm";
import type { User } from "./User.js";
import type { Institution } from "./Institution.js";

@Entity()
export class UploadLog {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar" })
  uploadedById!: string;

  @Column({ type: "varchar" })
  institutionId!: string;

  @Column({ type: "varchar" })
  originalFilename!: string;

  @Column({ type: "int" })
  totalRows!: number;

  @Column({ type: "int" })
  newComments!: number;

  @Column({ type: "int" })
  skippedDuplicates!: number;

  @Column({ type: "int" })
  newThreads!: number;

  @Column({ type: "int" })
  newStudents!: number;

  @Column({ type: "int", default: 0 })
  newCourses!: number;

  @Column({ type: "int", default: 0 })
  newAssignments!: number;

  @Column({ type: "int" })
  toriTagsExtracted!: number;

  // Path to the saved copy of the original CSV file (relative to project root)
  @Column({ type: "varchar", nullable: true })
  filePath!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  uploadedAt!: Date;

  @ManyToOne("User", "uploads")
  @JoinColumn({ name: "uploadedById" })
  uploadedBy!: Relation<User>;

  @ManyToOne("Institution")
  @JoinColumn({ name: "institutionId" })
  institution!: Relation<Institution>;
}
