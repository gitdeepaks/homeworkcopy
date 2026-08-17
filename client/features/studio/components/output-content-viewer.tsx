"use client";

import { parseOutputContent, readOutputMetadata } from "@homeworkcopy/contracts";
import { linkSourceMarkers, mapOutputProse } from "../lib/citations";
import type { StudioOutput } from "../lib/types";
import { AudioOverviewViewer } from "./viewers/audio-overview-viewer";
import { BriefingViewer } from "./viewers/briefing-viewer";
import { DataTableViewer } from "./viewers/data-table-viewer";
import { FaqViewer } from "./viewers/faq-viewer";
import { FlashcardsViewer } from "./viewers/flashcards-viewer";
import { MindMapViewer } from "./viewers/mindmap-viewer";
import { QuizViewer } from "./viewers/quiz-viewer";
import { ReportViewer } from "./viewers/report-viewer";
import { SlidesViewer } from "./viewers/slides-viewer";
import { StudyGuideViewer } from "./viewers/study-guide-viewer";
import { SummaryViewer } from "./viewers/summary-viewer";
import { TakeawaysViewer } from "./viewers/takeaways-viewer";
import { TimelineViewer } from "./viewers/timeline-viewer";
import { VideoExplainerViewer } from "./viewers/video-explainer-viewer";

type OutputContentViewerProps = {
    output: StudioOutput;
    workspaceId: string;
};

/**
 * Renders generated content after validating it against the contract for its
 * type, so a malformed record shows a clear message instead of breaking.
 */
export function OutputContentViewer({
    output,
    workspaceId,
}: OutputContentViewerProps) {
    const parsed = parseOutputContent(output.type, output.content);
    const sourceLabels = readOutputMetadata(output.metadata)?.sourceLabels ?? [];
    const content = parsed
        ? mapOutputProse(parsed, (text) =>
              linkSourceMarkers(text, sourceLabels, workspaceId),
          )
        : null;

    if (!content) {
        return (
            <p role="alert" className="py-8 text-center text-sm text-muted-foreground">
                This output could not be read. Regenerate it to rebuild the
                content.
            </p>
        );
    }

    switch (content.type) {
        case "SUMMARY":
            return <SummaryViewer markdown={content.data.markdown} />;
        case "TAKEAWAYS":
            return <TakeawaysViewer items={content.data.items} />;
        case "FLASHCARDS":
            return <FlashcardsViewer cards={content.data.cards} />;
        case "QUIZ":
            return <QuizViewer questions={content.data.questions} />;
        case "MINDMAP":
            return (
                <MindMapViewer
                    workspaceId={workspaceId}
                    nodes={content.data.nodes}
                    edges={content.data.edges}
                />
            );
        case "REPORT":
            return (
                <ReportViewer
                    markdown={content.data.markdown}
                    sections={content.data.sections}
                />
            );
        case "STUDY_GUIDE":
            return <StudyGuideViewer guide={content.data} />;
        case "FAQ":
            return <FaqViewer items={content.data.items} />;
        case "TIMELINE":
            return <TimelineViewer events={content.data.events} />;
        case "BRIEFING":
            return <BriefingViewer briefing={content.data} />;
        case "AUDIO_OVERVIEW":
            return (
                <AudioOverviewViewer
                    workspaceId={workspaceId}
                    outputId={output.id}
                    title={output.title}
                    content={content.data}
                    sourceLabels={sourceLabels}
                />
            );
        case "VIDEO_EXPLAINER":
            return (
                <VideoExplainerViewer
                    workspaceId={workspaceId}
                    outputId={output.id}
                    title={output.title}
                    content={content.data}
                    sourceLabels={sourceLabels}
                />
            );
        case "SLIDES":
            return (
                <SlidesViewer
                    // Remounting on every stored change discards a draft that a
                    // regeneration has made stale.
                    key={output.updatedAt}
                    workspaceId={workspaceId}
                    outputId={output.id}
                    deck={content.data.deck}
                    sourceLabels={sourceLabels}
                    canEdit={output.status === "READY"}
                />
            );
        case "DATA_TABLE":
            return (
                <DataTableViewer
                    key={output.updatedAt}
                    workspaceId={workspaceId}
                    outputId={output.id}
                    tables={content.data.tables}
                    sourceLabels={sourceLabels}
                    canEdit={output.status === "READY"}
                />
            );
    }
}
