import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { SOURCE_STATUS_LABELS } from "../lib/constants";
import type { SourceProcessingStage, SourceStatus } from "../lib/types";

const statusVariant: Record<
    SourceStatus,
    "default" | "secondary" | "outline" | "destructive"
> = {
    PENDING: "secondary",
    PROCESSING: "outline",
    READY: "default",
    FAILED: "destructive",
    DELETING: "secondary",
};

const stageLabel: Record<SourceProcessingStage, string> = {
    QUEUED: "Queued",
    UPLOADING: "Uploading",
    EXTRACTING: "Extracting",
    CHUNKING: "Chunking",
    EMBEDDING: "Embedding",
    INDEXING: "Indexing",
    READY: "Ready",
    FAILED: "Failed",
    CLEANING_UP: "Removing",
};

type SourceStatusBadgeProps = {
    status: SourceStatus;
    stage?: SourceProcessingStage;
    className?: string;
};

export function SourceStatusBadge({ status, stage, className }: SourceStatusBadgeProps) {
    return (
        <Badge
            variant={statusVariant[status]}
            className={cn("capitalize", className)}
        >
            {stage ? stageLabel[stage] : SOURCE_STATUS_LABELS[status]}
        </Badge>
    );
}
