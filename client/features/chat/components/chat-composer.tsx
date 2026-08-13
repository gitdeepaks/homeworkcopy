"use client";

import { GlobeIcon, Loader2Icon, SendIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type ChatComposerProps = {
  onSubmit: (text: string) => void;
  disabled?: boolean;
  isStreaming?: boolean;
  webSearchEnabled?: boolean;
  onWebSearchChange?: (enabled: boolean) => void;
  value: string;
  onValueChange: (value: string) => void;
};

export function ChatComposer({
  onSubmit,
  disabled = false,
  isStreaming = false,
  webSearchEnabled = false,
  onWebSearchChange,
  value,
  onValueChange,
}: ChatComposerProps) {
  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const text = value.trim();
    if (!text || disabled || isStreaming) {
      return;
    }

    onSubmit(text);
    onValueChange("");
  }

  return (
    <form onSubmit={handleSubmit} className="border-t bg-background p-4">
      <div className="mx-auto flex max-w-3xl flex-col gap-2">
        {onWebSearchChange ? (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={webSearchEnabled ? "secondary" : "outline"}
              className={cn(
                "rounded-full",
                webSearchEnabled && "border-primary/30",
              )}
              onClick={() => onWebSearchChange(!webSearchEnabled)}
              disabled={disabled || isStreaming}
            >
              <GlobeIcon />
              Web search
            </Button>
            {webSearchEnabled ? (
              <span className="text-xs text-muted-foreground">
                Tavily will search the web when needed
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="flex items-end gap-2">
          <Textarea
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
            placeholder="Ask about your sources…"
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
