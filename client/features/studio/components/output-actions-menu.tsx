"use client";

import { useState } from "react";
import {
    CopyIcon,
    DownloadIcon,
    MoreVerticalIcon,
    PencilIcon,
    RefreshCwIcon,
    SquareIcon,
    Trash2Icon,
} from "lucide-react";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OUTPUT_TITLE_MAX_LENGTH } from "@homeworkcopy/contracts";
import {
    useCancelOutput,
    useDeleteOutput,
    useDuplicateOutput,
    useRegenerateOutput,
    useRenameOutput,
} from "../hooks/use-outputs";
import { outputFileName, outputToMarkdown } from "../lib/export";
import { isOutputGenerating, type StudioOutput } from "../lib/types";

type OutputActionsMenuProps = {
    output: StudioOutput;
    /** Called after a delete succeeds, so a detail view can navigate away. */
    onDeleted?: () => void;
};

function downloadMarkdown(output: StudioOutput) {
    const blob = new Blob([outputToMarkdown(output)], {
        type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = outputFileName(output);
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

/**
 * Rename, regenerate, duplicate, export, cancel, and delete actions for one
 * output. Every destructive or costly action confirms first.
 */
export function OutputActionsMenu({
    output,
    onDeleted,
}: OutputActionsMenuProps) {
    const [renameOpen, setRenameOpen] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [title, setTitle] = useState(output.title);

    const renameOutput = useRenameOutput(output.workspaceId);
    const regenerateOutput = useRegenerateOutput(output.workspaceId);
    const duplicateOutput = useDuplicateOutput(output.workspaceId);
    const cancelOutput = useCancelOutput(output.workspaceId);
    const deleteOutput = useDeleteOutput(output.workspaceId);

    const generating = isOutputGenerating(output.status);
    const error =
        renameOutput.error ??
        regenerateOutput.error ??
        duplicateOutput.error ??
        cancelOutput.error ??
        deleteOutput.error;

    async function handleRename() {
        const nextTitle = title.trim();
        if (!nextTitle) {
            return;
        }
        try {
            await renameOutput.mutateAsync({
                outputId: output.id,
                title: nextTitle,
            });
        } catch {
            return;
        }
        setRenameOpen(false);
    }

    async function handleDelete() {
        try {
            await deleteOutput.mutateAsync(output.id);
        } catch {
            return;
        }
        setDeleteOpen(false);
        onDeleted?.();
    }

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger
                    render={
                        <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Actions for ${output.title}`}
                        />
                    }
                >
                    <MoreVerticalIcon />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem
                        onClick={() => {
                            setTitle(output.title);
                            setRenameOpen(true);
                        }}
                    >
                        <PencilIcon />
                        Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        disabled={output.status !== "READY"}
                        onClick={() => downloadMarkdown(output)}
                    >
                        <DownloadIcon />
                        Export Markdown
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {generating ? (
                        <DropdownMenuItem
                            disabled={cancelOutput.isPending}
                            onClick={() => cancelOutput.mutate(output.id)}
                        >
                            <SquareIcon />
                            Stop generating
                        </DropdownMenuItem>
                    ) : (
                        <DropdownMenuItem
                            disabled={regenerateOutput.isPending}
                            onClick={() => regenerateOutput.mutate(output.id)}
                        >
                            <RefreshCwIcon />
                            {output.status === "READY"
                                ? "Regenerate"
                                : "Retry generation"}
                        </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                        disabled={duplicateOutput.isPending}
                        onClick={() => duplicateOutput.mutate(output.id)}
                    >
                        <CopyIcon />
                        Duplicate
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                        variant="destructive"
                        onClick={() => setDeleteOpen(true)}
                    >
                        <Trash2Icon />
                        Delete
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            {error ? (
                <p role="alert" className="mt-2 text-xs text-destructive">
                    {error.message}
                </p>
            ) : null}

            <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Rename output</DialogTitle>
                        <DialogDescription>
                            Only the title changes. The generated content and its
                            sources stay exactly as they are.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-2">
                        <Label htmlFor={`rename-output-${output.id}`}>
                            Title
                        </Label>
                        <Input
                            id={`rename-output-${output.id}`}
                            value={title}
                            maxLength={OUTPUT_TITLE_MAX_LENGTH}
                            autoFocus
                            onChange={(event) => setTitle(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                    void handleRename();
                                }
                            }}
                        />
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setRenameOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            disabled={!title.trim() || renameOutput.isPending}
                            onClick={() => void handleRename()}
                        >
                            Save
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            Delete “{output.title}”?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            This removes the generated output from your notebook.
                            Your sources are not affected. This cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Keep output</AlertDialogCancel>
                        <AlertDialogAction
                            variant="destructive"
                            disabled={deleteOutput.isPending}
                            onClick={() => void handleDelete()}
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
