"use client";

import Link from "next/link";
import { readOutputMetadata } from "@homeworkcopy/contracts";
import { SourceTypeIcon, sourceRoutes } from "@/features/sources";
import type { StudioOutput } from "../lib/types";

type OutputSourceReferencesProps = {
    output: StudioOutput;
};

/**
 * The exact sources this output was generated from, captured when it was
 * created so the list stays truthful after the notebook changes.
 */
export function OutputSourceReferences({
    output,
}: OutputSourceReferencesProps) {
    const snapshot = readOutputMetadata(output.metadata)?.sourceSnapshot;

    if (!snapshot || snapshot.sources.length === 0) {
        if (output.sourceIds.length === 0) {
            return null;
        }

        return (
            <section aria-labelledby={`output-sources-${output.id}`}>
                <h3
                    id={`output-sources-${output.id}`}
                    className="text-sm font-semibold"
                >
                    Sources used
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                    Generated from {output.sourceIds.length} notebook source
                    {output.sourceIds.length === 1 ? "" : "s"}.
                </p>
            </section>
        );
    }

    return (
        <section aria-labelledby={`output-sources-${output.id}`}>
            <h3
                id={`output-sources-${output.id}`}
                className="text-sm font-semibold"
            >
                Sources used ({snapshot.sources.length})
            </h3>
            <ul className="mt-2 flex flex-wrap gap-2">
                {snapshot.sources.map((source) => (
                    <li key={source.id}>
                        <Link
                            href={sourceRoutes.detail(
                                output.workspaceId,
                                source.id,
                            )}
                            className="flex max-w-xs items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        >
                            <SourceTypeIcon
                                type={source.type}
                                className="size-3.5 shrink-0"
                            />
                            <span className="truncate">{source.title}</span>
                        </Link>
                    </li>
                ))}
            </ul>
        </section>
    );
}
