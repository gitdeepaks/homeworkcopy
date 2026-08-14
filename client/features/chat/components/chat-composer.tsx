"use client";

import {
    groundingModeSchema,
    type GroundingMode,
} from "@homeworkcopy/contracts";
import { BookOpenIcon, Loader2Icon, SendIcon } from "lucide-react";
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
                            disabled={disabled || isStreaming}
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
                    <p
                        role="alert"
                        className="text-xs text-amber-700 dark:text-amber-300"
                    >
                        {selectionWarning}
                    </p>
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
                        disabled={disabled || isStreaming}
                    />
                    <Button
                        type="submit"
                        size="icon"
                        disabled={disabled || isStreaming || !value.trim()}
                    >
                        {isStreaming ? (
                            <Loader2Icon className="animate-spin" />
                        ) : (
                            <SendIcon />
                        )}
                    </Button>
                </div>
            </div>
        </form>
    );
}
