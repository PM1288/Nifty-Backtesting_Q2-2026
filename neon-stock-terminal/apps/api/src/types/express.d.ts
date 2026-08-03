import type { AuthenticatedUser } from "../auth/guard";

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthenticatedUser;
    }
  }
}

export {};
