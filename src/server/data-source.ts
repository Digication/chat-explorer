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
} from "./entities/index.js";
import { Initial1775574106489 } from "./migrations/1775574106489-Initial.js";

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
  ],
  migrations: [Initial1775574106489],
});
