import {
  Entity,
  PrimaryColumn,
  Column,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
  type Relation,
} from "typeorm";
import type { User } from "./User.js";

@Entity()
export class UserState {
  @PrimaryColumn()
  userId!: string;

  @Column({ type: "jsonb", default: "{}" })
  state!: Record<string, unknown>;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;

  @OneToOne("User")
  @JoinColumn({ name: "userId" })
  user!: Relation<User>;
}
