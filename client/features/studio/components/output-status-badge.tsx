import {
    CheckIcon,
    CircleSlashIcon,
    ClockIcon,
    Loader2Icon,
    TriangleAlertIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { OUTPUT_STATUS_LABELS, OUTPUT_TYPE_LABELS } from "../lib/constants";
import type { OutputStatus, OutputType } from "../lib/types";

type OutputStatusBadgeProps = {
    status: OutputStatus;
};

const STATUS_VARIANT: Record<
    OutputStatus,
    "default" | "secondary" | "outline" | "destructive"
> = {
    PENDING: "secondary",
    PROCESSING: "outline",
    READY: "default",
    FAILED: "destructive",
    CANCELLED: "secondary",
};

const STATUS_ICON: Record<OutputStatus, typeof CheckIcon> = {
    PENDING: ClockIcon,
    PROCESSING: Loader2Icon,
    READY: CheckIcon,
    FAILED: TriangleAlertIcon,
    CANCELLED: CircleSlashIcon,
};

/**
 * Status pill for an output. State is carried by icon and text as well as
 * color, so it survives high-contrast and color-blind viewing.
 */
export function OutputStatusBadge({ status }: OutputStatusBadgeProps) {
    const Icon = STATUS_ICON[status];

    return (
        <Badge variant={STATUS_VARIANT[status]}>
            <Icon
                aria-hidden
                className={
                    status === "PROCESSING"
                        ? "size-3 motion-safe:animate-spin"
                        : "size-3"
                }
            />
            {OUTPUT_STATUS_LABELS[status]}
        </Badge>
    );
}

export function OutputTypeBadge({ type }: { type: OutputType }) {
    return <Badge variant="outline">{OUTPUT_TYPE_LABELS[type]}</Badge>;
}
