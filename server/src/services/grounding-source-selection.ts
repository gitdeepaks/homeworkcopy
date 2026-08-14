import {
    SOURCE_SELECTION_MAX,
    type SourceSelection,
    type SourceStatus,
} from "@homeworkcopy/contracts";
import { SourceSelectionError } from "../types/app-error.js";

type GroundingSource = {
    id: string;
    status: SourceStatus;
};

export function validateGroundingSourceCandidates<Source extends GroundingSource>(
    selection: SourceSelection,
    candidates: Source[],
): Source[] {
    if (selection.selectionMode === "all-ready") {
        const readySources = candidates.filter(
            (source) => source.status === "READY",
        );
        if (readySources.length === 0) {
            throw new SourceSelectionError(
                "NO_READY_SOURCES",
                "No ready sources are available for grounding.",
            );
        }
        if (readySources.length > SOURCE_SELECTION_MAX) {
            throw new SourceSelectionError(
                "SOURCE_SELECTION_UNAVAILABLE",
                `This notebook has more than ${SOURCE_SELECTION_MAX} ready sources. Choose a custom subset.`,
            );
        }
        return readySources;
    }

    const candidatesById = new Map(
        candidates.map((source) => [source.id, source]),
    );
    const orderedSources = selection.sourceIds.flatMap((sourceId) => {
        const source = candidatesById.get(sourceId);
        return source ? [source] : [];
    });
    if (
        orderedSources.length !== selection.sourceIds.length ||
        orderedSources.some((source) => source.status !== "READY")
    ) {
        throw new SourceSelectionError(
            "SOURCE_SELECTION_UNAVAILABLE",
            "One or more selected sources are unavailable or not ready. Update the selection and try again.",
        );
    }
    return orderedSources;
}
