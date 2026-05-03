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
import type { OutcomeFramework } from "./OutcomeFramework.js";
import type { EvidenceOutcomeLink } from "./EvidenceOutcomeLink.js";

@Entity()
@Index(["frameworkId", "code"], { unique: true })
export class OutcomeDefinition {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  frameworkId!: string;

  @Column({ type: "varchar" })
  code!: string;

  @Column({ type: "varchar" })
  name!: string;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @Column({ type: "uuid", nullable: true })
  parentId!: string | null;

  @Column({ type: "int", default: 0 })
  sortOrder!: number;

  @ManyToOne("OutcomeFramework", "outcomes", { onDelete: "CASCADE" })
  @JoinColumn({ name: "frameworkId" })
  framework!: Relation<OutcomeFramework>;

  @ManyToOne("OutcomeDefinition", { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "parentId" })
  parent!: Relation<OutcomeDefinition> | null;

  @OneToMany("OutcomeDefinition", "parent")
  children!: Relation<OutcomeDefinition[]>;

  @OneToMany("EvidenceOutcomeLink", "outcomeDefinition")
  evidenceLinks!: Relation<EvidenceOutcomeLink[]>;
}
