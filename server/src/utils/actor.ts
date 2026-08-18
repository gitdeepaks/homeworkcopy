import type { Request } from "express";
import type { Actor } from "../services/notebook-access.service.js";

/**
 * The acting user, taken from the verified session and never from the request
 * body.
 *
 * Every operation that writes an audit row needs the actor's name and email
 * alongside their id, so this is the single place that shapes one.
 *
 * @param req - Authenticated request
 * @returns The actor an operation's effects are attributed to
 */
export function actorOf(req: Request): Actor {
    return {
        id: req.session.user.id,
        name: req.session.user.name,
        email: req.session.user.email,
    };
}
