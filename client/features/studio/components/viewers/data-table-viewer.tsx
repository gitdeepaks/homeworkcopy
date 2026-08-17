"use client";

import { useState } from "react";
import Link from "next/link";
import { PlusIcon, Trash2Icon } from "lucide-react";
import {
    DATA_TABLE_CELL_MAX_LENGTH,
    DATA_TABLE_ROW_MAX,
    editOutputContentRequestSchema,
    SLIDE_TITLE_MAX_LENGTH,
    type DataTable,
    type OutputSourceLabel,
} from "@homeworkcopy/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { sourceRoutes } from "@/features/sources";
import { useUpdateOutputContent } from "../../hooks/use-outputs";
import { segmentSources } from "../../lib/audio";
import { nextElementId, removeAt, replaceAt } from "../../lib/editing";

type DataTableViewerProps = {
    workspaceId: string;
    outputId: string;
    tables: readonly DataTable[];
    sourceLabels: readonly OutputSourceLabel[];
    /** False while the output is still generating or already failed. */
    canEdit: boolean;
};

/**
 * Extracted data tables, each row linking back to the sources it was read from.
 *
 * Cells are plain text on purpose: a figure or date is shown exactly as the
 * sources wrote it, so an extraction never quietly reformats evidence. Wide
 * tables scroll inside their own container rather than stretching the page.
 *
 * The caller remounts this component whenever the stored tables change, so a
 * regeneration can never leave a stale draft that Save would write back over
 * the new content.
 */
export function DataTableViewer({
    workspaceId,
    outputId,
    tables,
    sourceLabels,
    canEdit,
}: DataTableViewerProps) {
    const [draft, setDraft] = useState<DataTable[] | null>(null);
    const [validationError, setValidationError] = useState<string | null>(null);
    const updateContent = useUpdateOutputContent(workspaceId);

    const isEditing = draft !== null;
    const shown = draft ?? tables;

    function updateTable(tableIndex: number, next: DataTable) {
        setDraft((current) =>
            replaceAt(current ?? [...tables], tableIndex, next),
        );
    }

    async function handleSave() {
        if (!draft) {
            return;
        }

        const parsed = editOutputContentRequestSchema.safeParse({
            type: "DATA_TABLE",
            tables: draft,
        });

        if (!parsed.success) {
            setValidationError(
                `These tables cannot be saved yet: ${parsed.error.issues[0]?.message ?? "check every row has one cell per column"}.`,
            );
            return;
        }

        setValidationError(null);
        try {
            await updateContent.mutateAsync({ outputId, input: parsed.data });
        } catch {
            return;
        }
        setDraft(null);
    }

    return (
        <div>
            {canEdit ? (
                <div className="flex flex-wrap items-center justify-end gap-1.5">
                    {isEditing ? (
                        <>
                            <Button
                                variant="ghost"
                                size="sm"
                                disabled={updateContent.isPending}
                                onClick={() => {
                                    setDraft(null);
                                    setValidationError(null);
                                }}
                            >
                                Cancel
                            </Button>
                            <Button
                                size="sm"
                                disabled={updateContent.isPending}
                                onClick={() => void handleSave()}
                            >
                                {updateContent.isPending ? <Spinner /> : null}
                                Save tables
                            </Button>
                        </>
                    ) : (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setDraft([...tables])}
                        >
                            Edit tables
                        </Button>
                    )}
                </div>
            ) : null}

            {validationError ? (
                <p
                    role="alert"
                    className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
                >
                    {validationError}
                </p>
            ) : null}

            {updateContent.error ? (
                <p
                    role="alert"
                    className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
                >
                    {updateContent.error.message}
                </p>
            ) : null}

            <div className="mt-4 space-y-6">
                {shown.map((table, tableIndex) => (
                    <section
                        key={table.id}
                        aria-labelledby={`table-${table.id}-title`}
                    >
                        {isEditing ? (
                            <Input
                                aria-label={`Title for table ${tableIndex + 1}`}
                                value={table.title}
                                maxLength={SLIDE_TITLE_MAX_LENGTH}
                                onChange={(event) =>
                                    updateTable(tableIndex, {
                                        ...table,
                                        title: event.target.value,
                                    })
                                }
                            />
                        ) : (
                            <h3
                                id={`table-${table.id}-title`}
                                className="font-heading text-lg font-bold"
                            >
                                {table.title}
                            </h3>
                        )}

                        {table.caption && !isEditing ? (
                            <p className="mt-1 text-sm text-muted-foreground">
                                {table.caption}
                            </p>
                        ) : null}

                        <div className="mt-3 overflow-x-auto rounded-xl border">
                            <table className="w-full border-collapse text-sm">
                                <caption className="sr-only">
                                    {table.title}
                                    {table.caption ? `. ${table.caption}` : ""}
                                </caption>
                                <thead>
                                    <tr className="border-b bg-muted/30">
                                        {table.columns.map(
                                            (column, columnIndex) => (
                                                <th
                                                    key={`${table.id}-c${String(columnIndex)}`}
                                                    scope="col"
                                                    className="px-3 py-2 text-left font-semibold"
                                                >
                                                    {isEditing ? (
                                                        <Input
                                                            aria-label={`Label for column ${columnIndex + 1}`}
                                                            value={column.label}
                                                            maxLength={
                                                                SLIDE_TITLE_MAX_LENGTH
                                                            }
                                                            onChange={(event) =>
                                                                updateTable(
                                                                    tableIndex,
                                                                    {
                                                                        ...table,
                                                                        columns:
                                                                            replaceAt(
                                                                                table.columns,
                                                                                columnIndex,
                                                                                {
                                                                                    ...column,
                                                                                    label: event
                                                                                        .target
                                                                                        .value,
                                                                                },
                                                                            ),
                                                                    },
                                                                )
                                                            }
                                                        />
                                                    ) : (
                                                        column.label
                                                    )}
                                                </th>
                                            ),
                                        )}
                                        <th
                                            scope="col"
                                            className="px-3 py-2 text-left font-semibold"
                                        >
                                            Sources
                                        </th>
                                        {isEditing ? (
                                            <th scope="col" className="px-3 py-2">
                                                <span className="sr-only">
                                                    Actions
                                                </span>
                                            </th>
                                        ) : null}
                                    </tr>
                                </thead>
                                <tbody>
                                    {table.rows.map((row, rowIndex) => {
                                        const sources = segmentSources(
                                            sourceLabels,
                                            row.sourceLabels,
                                        );

                                        return (
                                            <tr
                                                key={row.id}
                                                className="border-b last:border-b-0"
                                            >
                                                {row.cells.map(
                                                    (cell, cellIndex) => (
                                                        <td
                                                            key={`${row.id}-${String(cellIndex)}`}
                                                            className="px-3 py-2 align-top"
                                                        >
                                                            {isEditing ? (
                                                                <Input
                                                                    aria-label={`Row ${rowIndex + 1}, ${table.columns[cellIndex]?.label ?? `column ${cellIndex + 1}`}`}
                                                                    value={cell}
                                                                    maxLength={
                                                                        DATA_TABLE_CELL_MAX_LENGTH
                                                                    }
                                                                    onChange={(
                                                                        event,
                                                                    ) =>
                                                                        updateTable(
                                                                            tableIndex,
                                                                            {
                                                                                ...table,
                                                                                rows: replaceAt(
                                                                                    table.rows,
                                                                                    rowIndex,
                                                                                    {
                                                                                        ...row,
                                                                                        cells: replaceAt(
                                                                                            row.cells,
                                                                                            cellIndex,
                                                                                            event
                                                                                                .target
                                                                                                .value,
                                                                                        ),
                                                                                    },
                                                                                ),
                                                                            },
                                                                        )
                                                                    }
                                                                />
                                                            ) : cell ? (
                                                                cell
                                                            ) : (
                                                                <span className="text-muted-foreground">
                                                                    <span
                                                                        aria-hidden
                                                                    >
                                                                        —
                                                                    </span>
                                                                    <span className="sr-only">
                                                                        Not
                                                                        stated in
                                                                        the
                                                                        sources
                                                                    </span>
                                                                </span>
                                                            )}
                                                        </td>
                                                    ),
                                                )}
                                                <td className="px-3 py-2 align-top">
                                                    {sources.length > 0 ? (
                                                        <ul className="flex flex-wrap gap-1">
                                                            {sources.map(
                                                                (source) => (
                                                                    <li
                                                                        key={
                                                                            source.label
                                                                        }
                                                                    >
                                                                        <Link
                                                                            href={sourceRoutes.detail(
                                                                                workspaceId,
                                                                                source.sourceId,
                                                                            )}
                                                                            title={
                                                                                source.title
                                                                            }
                                                                            className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                                                                        >
                                                                            {
                                                                                source.label
                                                                            }
                                                                        </Link>
                                                                    </li>
                                                                ),
                                                            )}
                                                        </ul>
                                                    ) : (
                                                        <span className="text-xs text-muted-foreground">
                                                            Uncited
                                                        </span>
                                                    )}
                                                </td>
                                                {isEditing ? (
                                                    <td className="px-3 py-2 align-top">
                                                        {table.rows.length >
                                                        1 ? (
                                                            <Button
                                                                variant="ghost"
                                                                size="icon-sm"
                                                                onClick={() =>
                                                                    updateTable(
                                                                        tableIndex,
                                                                        {
                                                                            ...table,
                                                                            rows: removeAt(
                                                                                table.rows,
                                                                                rowIndex,
                                                                            ),
                                                                        },
                                                                    )
                                                                }
                                                            >
                                                                <Trash2Icon />
                                                                <span className="sr-only">
                                                                    Remove row{" "}
                                                                    {rowIndex +
                                                                        1}
                                                                </span>
                                                            </Button>
                                                        ) : null}
                                                    </td>
                                                ) : null}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {isEditing && table.rows.length < DATA_TABLE_ROW_MAX ? (
                            <Button
                                variant="outline"
                                size="sm"
                                className="mt-2"
                                onClick={() =>
                                    updateTable(tableIndex, {
                                        ...table,
                                        rows: [
                                            ...table.rows,
                                            {
                                                id: nextElementId(
                                                    "r",
                                                    table.rows,
                                                ),
                                                cells: table.columns.map(
                                                    () => "",
                                                ),
                                                sourceLabels: [],
                                            },
                                        ],
                                    })
                                }
                            >
                                <PlusIcon />
                                Add row
                            </Button>
                        ) : null}
                    </section>
                ))}
            </div>
        </div>
    );
}
