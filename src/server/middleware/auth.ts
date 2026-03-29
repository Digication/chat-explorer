import { Request, Response, NextFunction } from "express";
import { auth } from "../auth.js";
import { fromNodeHeaders } from "better-auth/node";
import { AppDataSource } from "../data-source.js";
import { User } from "../entities/User.js";

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    name: string;
    email: string;
    image?: string | null;
    role: string;
    institutionId: string | null;
  };
  session?: {
    id: string;
    userId: string;
    expiresAt: Date;
  };
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const userRepo = AppDataSource.getRepository(User);
    const fullUser = await userRepo.findOne({
      where: { id: session.user.id },
    });

    req.user = {
      ...session.user,
      role: fullUser?.role ?? "instructor",
      institutionId: fullUser?.institutionId ?? null,
    };
    req.session = session.session;
    next();
  } catch {
    res.status(401).json({ error: "Not authenticated" });
  }
}

export async function optionalAuth(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (session) {
      const userRepo = AppDataSource.getRepository(User);
      const fullUser = await userRepo.findOne({
        where: { id: session.user.id },
      });

      req.user = {
        ...session.user,
        role: fullUser?.role ?? "instructor",
        institutionId: fullUser?.institutionId ?? null,
      };
      req.session = session.session;
    }
  } catch {
    // Ignore — user just won't be attached
  }
  next();
}
