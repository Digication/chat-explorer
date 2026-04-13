import "reflect-metadata";
import { DataSource } from "typeorm";
import {
  Institution,
  User,
  Course,
  Assignment,
  Thread,
  Student,
  Comment,
  ToriTag,
  CommentToriTag,
  StudentConsent,
  CourseAccess,
  UploadLog,
  ChatSession,
  ChatMessage,
  UserState,
  CommentReflectionClassification,
} from "./entities/index.js";
import { Initial1775574106489 } from "./migrations/1775574106489-Initial.js";
import { AddBetterAuthTables1775574200000 } from "./migrations/1775574200000-AddBetterAuthTables.js";
import { AddReflectionClassification1775574300000 } from "./migrations/1775574300000-AddReflectionClassification.js";
import { AddInstitutionIdToChatSession1775574400000 } from "./migrations/1775574400000-AddInstitutionIdToChatSession.js";
import { AddInvitationTracking1775574500000 } from "./migrations/1775574500000-AddInvitationTracking.js";
import { AddUserDeactivated1775574600000 } from "./migrations/1775574600000-AddUserDeactivated.js";

const isDev = process.env.NODE_ENV !== "production";

export const AppDataSource = new DataSource({
  type: "postgres",
  url: process.env.DATABASE_URL,
  // In dev, TypeORM auto-syncs schema from entities. In production, we use
  // explicit migrations so schema changes are tracked and reviewable.
  synchronize: isDev,
  logging: isDev,
  entities: [
    Institution,
    User,
    Course,
    Assignment,
    Thread,
    Student,
    Comment,
    ToriTag,
    CommentToriTag,
    StudentConsent,
    CourseAccess,
    UploadLog,
    ChatSession,
    ChatMessage,
    UserState,
    CommentReflectionClassification,
  ],
  migrations: [
    Initial1775574106489,
    AddBetterAuthTables1775574200000,
    AddReflectionClassification1775574300000,
    AddInstitutionIdToChatSession1775574400000,
    AddInvitationTracking1775574500000,
    AddUserDeactivated1775574600000,
  ],
});
