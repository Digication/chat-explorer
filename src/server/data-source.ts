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

const isDev = process.env.NODE_ENV !== "production";

export const AppDataSource = new DataSource({
  type: "postgres",
  url: process.env.DATABASE_URL,
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
  migrations: [],
});
