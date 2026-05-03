import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  type Relation,
} from "typeorm";
import type { EvidenceMoment } from "./EvidenceMoment.js";
import type { OutcomeDefinition } from "./OutcomeDefinition.js";

export enum StrengthLevel {
  EMERGING = "EMERGING",
  DEVELOPING = "DEVELOPING",
  DEMONSTRATING = "DEMONSTRATING",
  EXEMPLARY = "EXEMPLARY",
}

@Entity()
@Index(["evidenceMomentId", "outcomeDefinitionId"], { unique: true })
export class EvidenceOutcomeLink {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  evidenceMomentId!: string;

  @Column({ type: "uuid" })
  outcomeDefinitionId!: string;

  @Column({ type: "enum", enum: StrengthLevel })
  strengthLevel!: StrengthLevel;

  @Column({ type: "text", nullable: true })
  rationale!: string | null;

  @ManyToOne("EvidenceMoment", "outcomeLinks", { onDelete: "CASCADE" })
  @JoinColumn({ name: "evidenceMomentId" })
  evidenceMoment!: Relation<EvidenceMoment>;

  @ManyToOne("OutcomeDefinition", "evidenceLinks", { onDelete: "CASCADE" })
  @JoinColumn({ name: "outcomeDefinitionId" })
  outcomeDefinition!: Relation<OutcomeDefinition>;
}
