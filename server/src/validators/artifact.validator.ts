import { z } from "zod";
import { sourceSelectionSchema } from "@homeworkcopy/contracts";
import { workspaceIdParamSchema } from "./workspace.validator.js";

export const artifactTypes = [
    "SUMMARY",
    "TAKEAWAYS",
    "FLASHCARDS",
    "QUIZ",
    "MINDMAP",
    "REPORT",
] as const;

export const artifactIdParamSchema = workspaceIdParamSchema.extend({
    artifactId: z.string().trim().min(1, "Artifact id is required"),
});

export const createArtifactSchema = z.intersection(
    z.object({
        type: z.enum(artifactTypes),
        title: z.string().trim().min(1).max(120).optional(),
    }),
    sourceSelectionSchema,
);

export type CreateArtifactInput = z.infer<typeof createArtifactSchema>;
