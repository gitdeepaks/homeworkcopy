import {
    SOURCE_SELECTION_MAX,
    type SourceSelection,
    type SourceSelectionMode,
} from "@homeworkcopy/contracts";
import type { Source } from "./types";

export type ResolvedSourceSelection = {
    request: SourceSelection;
    effectiveSourceIds: string[];
    unavailableSourceIds: string[];
    readySourceIds: string[];
    canUseSelection: boolean;
    exceedsSourceLimit: boolean;
};

export function resolveSourceSelection(
    sources: Source[],
    selectionMode: SourceSelectionMode,
    selectedSourceIds: string[],
): ResolvedSourceSelection {
    const readySourceIds = sources
        .filter((source) => source.status === "READY")
        .map((source) => source.id);

    if (selectionMode === "all-ready") {
        const exceedsSourceLimit = readySourceIds.length > SOURCE_SELECTION_MAX;
        return {
            request: { selectionMode, sourceIds: readySourceIds },
            effectiveSourceIds: readySourceIds,
            unavailableSourceIds: [],
            readySourceIds,
            canUseSelection: readySourceIds.length > 0 && !exceedsSourceLimit,
            exceedsSourceLimit,
        };
    }

    const readyIdSet = new Set(readySourceIds);
    const effectiveSourceIds = selectedSourceIds.filter((sourceId) =>
        readyIdSet.has(sourceId),
    );
    const unavailableSourceIds = selectedSourceIds.filter(
        (sourceId) => !readyIdSet.has(sourceId),
    );

    return {
        request: { selectionMode, sourceIds: selectedSourceIds },
        effectiveSourceIds,
        unavailableSourceIds,
        readySourceIds,
        canUseSelection:
            selectedSourceIds.length > 0 &&
            unavailableSourceIds.length === 0 &&
            selectedSourceIds.length <= SOURCE_SELECTION_MAX,
        exceedsSourceLimit: selectedSourceIds.length > SOURCE_SELECTION_MAX,
    };
}
