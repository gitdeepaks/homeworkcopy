"use client";

import {
    groundingModeSchema,
    type GroundingMode,
} from "@homeworkcopy/contracts";
import { BookOpenIcon, SendIcon, SquareIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type ChatComposerProps = {
    onSubmit: (text: string) => void;
    disabled?: boolean;
    isStreaming?: boolean;
    groundingMode: GroundingMode;
    onGroundingModeChange: (mode: GroundingMode) => void;
    selectedSourceCount: number;
    selectionWarning?: string;
    value: string;
    onValueChange: (value: string) => void;
    onStop: () => void;
    onSourceAction: () => void;
    editing?: boolean;
    onCancelEdit?: () => void;
};

export function ChatComposer({
    onSubmit,
    disabled = false,
    isStreaming = false,
    groundingMode,
    onGroundingModeChange,
    selectedSourceCount,
    selectionWarning,
    value,
    onValueChange,
    onStop,
    onSourceAction,
    editing = false,
    onCancelEdit,
}: ChatComposerProps) {
    function handleSubmit(event: React.FormEvent) {
        event.preventDefault();
        const text = value.trim();
        if (!text || disabled || isStreaming) return;
        onSubmit(text);
        onValueChange("");
    }

    return (
        <form onSubmit={handleSubmit} className="border-t bg-background p-4">
            <div className="mx-auto flex max-w-3xl flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                        <BookOpenIcon className="size-3.5" />
                        {selectedSourceCount} source
                        {selectedSourceCount === 1 ? "" : "s"} selected
                    </span>
                    <label className="ml-auto flex items-center gap-1.5">
                        Answer with
                        <select
                            value={groundingMode}
                            onChange={(event) =>
                                onGroundingModeChange(
                                    groundingModeSchema.parse(event.target.value),
                                )
                            }
                            disabled={isStreaming}
                            className="h-8 rounded-md border bg-paper px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <option value="notebook">Notebook only</option>
                            <option value="notebook-web">Notebook + web</option>
                            <option value="notebook-general">
                                Notebook + general knowledge
                            </option>
                        </select>
                    </label>
                </div>

                {selectionWarning ? (
                    <div className="flex items-center justify-between gap-2 text-xs text-amber-700 dark:text-amber-300">
                        <p role="alert">{selectionWarning}</p>
                        <Button type="button" variant="link" size="sm" onClick={onSourceAction}>
                            Choose sources
                        </Button>
                    </div>
                ) : null}

                {editing ? (
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Editing your question. Sending will replace later answers.</span>
                        <Button type="button" variant="ghost" size="sm" onClick={onCancelEdit}>
                            Cancel
                        </Button>
                    </div>
                ) : null}

                <div className="flex items-end gap-2">
                    <Textarea
                        value={value}
                        onChange={(event) => onValueChange(event.target.value)}
                        placeholder="Ask about your sources..."
                        rows={1}
                        className="min-h-11 max-h-40 resize-none"
                        onKeyDown={(event) => {
                            if (event.key === "Enter" && !event.shiftKey) {
                                event.preventDefault();
                                handleSubmit(event);
                            }
                        }}
                        disabled={isStreaming}
                    />
                    {isStreaming ? (
                        <Button type="button" size="icon" variant="destructive" onClick={onStop} aria-label="Stop generating">
                            <SquareIcon />
                        </Button>
                    ) : (
                        <Button
                            type="submit"
                            size="icon"
                            disabled={disabled || !value.trim()}
                            aria-label="Send message"
                        >
                            <SendIcon />
                        </Button>
                    )}
                </div>
            </div>
        </form>
    );
}
