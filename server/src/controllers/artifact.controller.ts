import type { Request, Response } from "express";
import {
    cancelArtifactForWorkspace,
    createArtifactForWorkspace,
    deleteArtifactForWorkspace,
    duplicateArtifactForWorkspace,
    getArtifactAudioForWorkspace,
    getArtifactForWorkspace,
    listArtifactsForWorkspace,
    regenerateArtifactForWorkspace,
    renameArtifactForWorkspace,
    updateArtifactContentForWorkspace,
} from "../services/artifact.service.js";
import {
    artifactIdParamSchema,
    createArtifactSchema,
    editArtifactContentSchema,
    renameArtifactSchema,
} from "../validators/artifact.validator.js";
import { workspaceIdParamSchema } from "../validators/workspace.validator.js";

export async function listArtifacts(req: Request, res: Response) {
    const { workspaceId } = workspaceIdParamSchema.parse(req.params);
    const artifacts = await listArtifactsForWorkspace(
        workspaceId,
        req.session.user.id,
    );
    res.json(artifacts);
}

export async function getArtifact(req: Request, res: Response) {
    const { workspaceId, artifactId } = artifactIdParamSchema.parse(req.params);
    const artifact = await getArtifactForWorkspace(
        workspaceId,
        artifactId,
        req.session.user.id,
    );
    res.json(artifact);
}

export async function getArtifactAudio(req: Request, res: Response) {
    const { workspaceId, artifactId } = artifactIdParamSchema.parse(req.params);
    const access = await getArtifactAudioForWorkspace(
        workspaceId,
        artifactId,
        req.session.user.id,
    );

    // Signed URLs are short-lived; a cached copy would outlive its signature.
    res.set("Cache-Control", "private, no-store");
    res.json(access);
}

export async function createArtifact(req: Request, res: Response) {
    const { workspaceId } = workspaceIdParamSchema.parse(req.params);
    const input = createArtifactSchema.parse(req.body);
    const artifact = await createArtifactForWorkspace(
        workspaceId,
        req.session.user.id,
        input,
    );
    res.status(201).json(artifact);
}

export async function renameArtifact(req: Request, res: Response) {
    const { workspaceId, artifactId } = artifactIdParamSchema.parse(req.params);
    const { title } = renameArtifactSchema.parse(req.body);
    const artifact = await renameArtifactForWorkspace(
        workspaceId,
        artifactId,
        req.session.user.id,
        title,
    );
    res.json(artifact);
}

export async function updateArtifactContent(req: Request, res: Response) {
    const { workspaceId, artifactId } = artifactIdParamSchema.parse(req.params);
    const input = editArtifactContentSchema.parse(req.body);
    const artifact = await updateArtifactContentForWorkspace(
        workspaceId,
        artifactId,
        req.session.user.id,
        input,
    );
    res.json(artifact);
}

export async function regenerateArtifact(req: Request, res: Response) {
    const { workspaceId, artifactId } = artifactIdParamSchema.parse(req.params);
    const artifact = await regenerateArtifactForWorkspace(
        workspaceId,
        artifactId,
        req.session.user.id,
    );
    res.status(202).json(artifact);
}

export async function duplicateArtifact(req: Request, res: Response) {
    const { workspaceId, artifactId } = artifactIdParamSchema.parse(req.params);
    const artifact = await duplicateArtifactForWorkspace(
        workspaceId,
        artifactId,
        req.session.user.id,
    );
    res.status(201).json(artifact);
}

export async function cancelArtifact(req: Request, res: Response) {
    const { workspaceId, artifactId } = artifactIdParamSchema.parse(req.params);
    const artifact = await cancelArtifactForWorkspace(
        workspaceId,
        artifactId,
        req.session.user.id,
    );
    res.json(artifact);
}

export async function deleteArtifact(req: Request, res: Response) {
    const { workspaceId, artifactId } = artifactIdParamSchema.parse(req.params);
    await deleteArtifactForWorkspace(
        workspaceId,
        artifactId,
        req.session.user.id,
    );
    res.status(204).send();
}
