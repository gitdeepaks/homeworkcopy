import { Router } from "express";
import {
    createMemory,
    deleteMemory,
    listMemories,
    updateMemory,
} from "../controllers/memory.controller.js";
import { requireAuth } from "../middleware/require-auth.middleware.js";
import { asyncHandler } from "../utils/async-handler.js";
import { memoryMutationRateLimit } from "../middleware/rate-limit.middleware.js";

export const memoryRoutes = Router();

memoryRoutes.use(requireAuth);

memoryRoutes.get("/", asyncHandler(listMemories));
memoryRoutes.post("/", memoryMutationRateLimit, asyncHandler(createMemory));
memoryRoutes.patch("/:memoryId", memoryMutationRateLimit, asyncHandler(updateMemory));
memoryRoutes.delete("/:memoryId", memoryMutationRateLimit, asyncHandler(deleteMemory));
