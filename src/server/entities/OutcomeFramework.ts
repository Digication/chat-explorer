import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  type Relation,
} from "typeorm";
import type { Institution } from "./Institution.js";
import type { OutcomeDefinition } from "./OutcomeDefinition.js";

export enum FrameworkType {
  TORI = "TORI",
  GEN_ED = "GEN_ED",
  ABET = "ABET",
  NURSING = "NURSING",
  CUSTOM = "CUSTOM",
}

@Entity()
export class OutcomeFramework {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  institutionId!: string;

  @Column({ type: "varchar" })
  name!: string;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @Column({ type: "enum", enum: FrameworkType })
  type!: FrameworkType;

  @Column({ type: "boolean", default: false })
  isDefault!: boolean;

  @Column({ type: "boolean", default: true })
  isActive!: boolean;

  @Column({ type: "boolean", default: false })
  isSystem!: boolean;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;

  @ManyToOne("Institution", { nullable: false })
  @JoinColumn({ name: "institutionId" })
  institution!: Relation<Institution>;

  @OneToMany("OutcomeDefinition", "framework")
  outcomes!: Relation<OutcomeDefinition[]>;
}
