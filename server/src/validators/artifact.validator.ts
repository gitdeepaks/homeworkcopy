import { z } from "zod";
import {
    createOutputRequestSchema,
    editOutputContentRequestSchema,
    renameOutputRequestSchema,
} from "@homeworkcopy/contracts";
import { workspaceIdParamSchema } from "./workspace.validator.js";

export const artifactIdParamSchema = workspaceIdParamSchema.extend({
    artifactId: z.string().trim().min(1, "Artifact id is required"),
});

export const createArtifactSchema = createOutputRequestSchema;
export const renameArtifactSchema = renameOutputRequestSchema;
export const editArtifactContentSchema = editOutputContentRequestSchema;

export type CreateArtifactInput = z.infer<typeof createArtifactSchema>;
export type RenameArtifactInput = z.infer<typeof renameArtifactSchema>;
export type EditArtifactContentInput = z.infer<
    typeof editArtifactContentSchema
>;
