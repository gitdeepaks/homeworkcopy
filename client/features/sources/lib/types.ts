import type {
    Source,
    SourceChunk,
    SourceChunksResponse,
    SourceStatus,
    SourceType,
} from "@homeworkcopy/contracts";

export type { Source, SourceChunk, SourceChunksResponse, SourceStatus, SourceType };

export type SourceFilters = {
    q?: string;
    type?: SourceType;
    status?: SourceStatus;
};

export type CreateTextSourceInput = {
    type: "TEXT";
    title: string;
    content: string;
};

export type CreateMarkdownSourceInput = {
    type: "MARKDOWN";
    title: string;
    content: string;
};

export type CreateSourceInput =
    | CreateTextSourceInput
    | CreateMarkdownSourceInput;

export type ImportWebsiteInput = {
    url: string;
    title?: string;
};

export type ImportYoutubeInput = {
    url: string;
    title?: string;
};
