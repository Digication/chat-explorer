import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "./auth.js";
import { UserRole } from "../entities/User.js";

export function requireRole(...allowedRoles: UserRole[]) {
  return (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): void => {
    if (!req.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    if (!allowedRoles.includes(req.user.role as UserRole)) {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }

    next();
  };
}

export function requireInstitutionAccess(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  if (req.user.role === UserRole.DIGICATION_ADMIN) {
    next();
    return;
  }

  const targetInstitutionId =
    req.params.institutionId || req.body?.institutionId;

  if (!targetInstitutionId) {
    next();
    return;
  }

  if (req.user.institutionId !== targetInstitutionId) {
    res
      .status(403)
      .json({ error: "You do not have access to this institution" });
    return;
  }

  next();
}
