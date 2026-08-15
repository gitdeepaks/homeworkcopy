"use client";

import { StreamdownContent } from "@/shared/components/streamdown-content";
import { CopyMarkdownButton } from "./copy-markdown-button";

export function SummaryViewer({ markdown }: { markdown: string }) {
    return (
        <div className="space-y-4">
            <div className="flex justify-end">
                <CopyMarkdownButton text={markdown} label="Copy summary" />
            </div>
            <StreamdownContent content={markdown} mode="static" />
        </div>
    );
}
