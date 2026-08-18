import type { Express } from "express";
import { artifactRoutes } from "./artifact.routes.js";
import { capabilityRoutes } from "./capability.routes.js";
import { chatRoutes, conversationRoutes } from "./chat.routes.js";
import {
    collaborationRoutes,
    shareRedemptionRoutes,
} from "./collaboration.routes.js";
import { memoryRoutes } from "./memory.routes.js";
import { noteRoutes } from "./note.routes.js";
import { sourceRoutes } from "./source.routes.js";
import { workspaceRoutes } from "./workspace.routes.js";

export function registerRoutes(app: Express): void {
    workspaceRoutes.use("/:workspaceId/sources", sourceRoutes);
    workspaceRoutes.use("/:workspaceId/conversations", conversationRoutes);
    workspaceRoutes.use("/:workspaceId/chat", chatRoutes);
    workspaceRoutes.use("/:workspaceId/artifacts", artifactRoutes);
    workspaceRoutes.use("/:workspaceId/notes", noteRoutes);
    workspaceRoutes.use("/:workspaceId", collaborationRoutes);
    app.use("/api/workspaces", workspaceRoutes);
    app.use("/api", shareRedemptionRoutes);
    app.use("/api/memory", memoryRoutes);
    app.use("/api/capabilities", capabilityRoutes);
}