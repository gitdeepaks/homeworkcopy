"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

type CopyMarkdownButtonProps = {
    text: string;
    label?: string;
};

/** Copies generated text to the clipboard and confirms it in place. */
export function CopyMarkdownButton({
    text,
    label = "Copy",
}: CopyMarkdownButtonProps) {
    const [copied, setCopied] = useState(false);
    const [failed, setFailed] = useState(false);

    async function copy() {
        try {
            await navigator.clipboard.writeText(text);
            setFailed(false);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
        } catch {
            setFailed(true);
        }
    }

    return (
        <div className="flex items-center gap-2">
            {failed ? (
                <span role="alert" className="text-xs text-destructive">
                    Copying is blocked in this browser.
                </span>
            ) : null}
            <Button variant="outline" size="sm" onClick={() => void copy()}>
                {copied ? <CheckIcon /> : <CopyIcon />}
                <span aria-live="polite">{copied ? "Copied" : label}</span>
            </Button>
        </div>
    );
}
