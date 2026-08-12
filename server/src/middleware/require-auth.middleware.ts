import type { NextFunction, Request, Response } from "express";
import { getAuth } from "@clerk/express";
import type { Session } from "../lib/session.js";
import { resolveLocalUser } from "../services/auth.service.js";

declare module "express-serve-static-core" {
    interface Request {
        session: Session;
    }
}

export async function requireAuth(
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> {
    const { userId: clerkUserId } = getAuth(req);

    if (!clerkUserId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }

    try {
        const user = await resolveLocalUser(clerkUserId);

        req.session = {
            user: {
                id: user.id,
                clerkUserId,
                name: user.name,
                email: user.email,
                image: user.image,
            },
        };
        next();
    } catch (error) {
        next(error);
    }
}
