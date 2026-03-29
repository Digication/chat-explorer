import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  type Relation,
} from "typeorm";
import type { CommentToriTag } from "./CommentToriTag.js";

@Entity()
export class ToriTag {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", unique: true })
  name!: string;

  @Column({ type: "varchar" })
  domain!: string;

  @Column({ type: "int" })
  domainNumber!: number;

  @Column({ type: "varchar", nullable: true })
  categoryNumber!: string | null;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @Column({ type: "varchar", nullable: true })
  parentCategory!: string | null;

  @OneToMany("CommentToriTag", "toriTag")
  commentToriTags!: Relation<CommentToriTag[]>;
}
