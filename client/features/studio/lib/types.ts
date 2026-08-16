import type {
    JsonReadValue,
    OutputGenerationOptionsRequest,
    OutputGenerationStage,
    OutputStatus,
    OutputType,
    SourceSelection,
} from "@homeworkcopy/contracts";

export type { OutputGenerationStage, OutputStatus, OutputType };

/** A Studio output as returned by the API. */
export type StudioOutput = {
    id: string;
    workspaceId: string;
    type: OutputType;
    title: string;
    content: JsonReadValue;
    contentVersion: number;
    sourceIds: string[];
    status: OutputStatus;
    stage: OutputGenerationStage;
    attemptCount: number;
    cancelledAt: string | null;
    metadata: JsonReadValue;
    createdAt: string;
    updatedAt: string;
};

export type CreateOutputInput = SourceSelection & {
    type: OutputType;
    title?: string;
    options?: OutputGenerationOptionsRequest;
};

/** Whether an output is still working towards a result. */
export function isOutputGenerating(status: OutputStatus): boolean {
    return status === "PENDING" || status === "PROCESSING";
}
