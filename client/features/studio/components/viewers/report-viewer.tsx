"use client";

import type { ReportOutputContent } from "@homeworkcopy/contracts";
import { StreamdownContent } from "@/shared/components/streamdown-content";
import { CopyMarkdownButton } from "./copy-markdown-button";

type ReportViewerProps = {
    markdown: string;
    sections?: ReportOutputContent["sections"];
};

export function ReportViewer({ markdown, sections }: ReportViewerProps) {
    return (
        <div className="space-y-8">
            <div className="flex justify-end">
                <CopyMarkdownButton text={markdown} label="Copy report" />
            </div>

            <StreamdownContent content={markdown} mode="static" />

            {sections && sections.length > 0 ? (
                <div className="space-y-6 border-t pt-6">
                    {sections.map((section, index) => (
                        <section key={index} className="space-y-2">
                            <h3 className="font-heading text-lg font-semibold">
                                {section.title}
                            </h3>
                            <StreamdownContent
                                content={section.content}
                                mode="static"
                            />
                        </section>
                    ))}
                </div>
            ) : null}
        </div>
    );
}
