import type {
    Source,
    SourceChunk,
    SourceChunksResponse,
    SourceStatus,
    SourceType,
    CreateSourceInput,
    ImportWebsiteInput,
    ImportYoutubeInput,
    SourceProcessingStage,
} from "@homeworkcopy/contracts";

export type {
    Source,
    SourceChunk,
    SourceChunksResponse,
    SourceStatus,
    SourceType,
    CreateSourceInput,
    ImportWebsiteInput,
    ImportYoutubeInput,
    SourceProcessingStage,
};

export type SourceFilters = {
    q?: string | undefined;
    type?: SourceType | undefined;
    status?: SourceStatus | undefined;
};
