"use client";

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
import { Spinner } from "@/components/ui/spinner";

type LeaveNotebookDialogProps = {
    notebookTitle: string | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: () => Promise<void>;
    isPending?: boolean;
    error?: string | null;
};

/**
 * Confirms giving up your own access to someone else's notebook.
 *
 * Worth confirming even though nothing is destroyed: getting back in needs a new
 * invitation from the owner, which the copy says plainly.
 */
export function LeaveNotebookDialog({
    notebookTitle,
    open,
    onOpenChange,
    onConfirm,
    isPending = false,
    error = null,
}: LeaveNotebookDialogProps) {
    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Leave this notebook?</AlertDialogTitle>
                    <AlertDialogDescription>
                        You will lose access to{" "}
                        <span className="font-medium text-foreground">
                            {notebookTitle ?? "this notebook"}
                        </span>
                        . Nothing in it is deleted, but you will need a new
                        invitation from the owner to get back in.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                {error ? (
                    <p role="alert" className="text-sm text-destructive">
                        {error}
                    </p>
                ) : null}
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={isPending}>
                        Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                        variant="destructive"
                        disabled={isPending}
                        onClick={(event) => {
                            event.preventDefault();
                            void onConfirm();
                        }}
                    >
                        {isPending ? <Spinner /> : null}
                        Leave notebook
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
