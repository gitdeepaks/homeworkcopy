"use client";

import type { StudyGuideOutputContent } from "@homeworkcopy/contracts";
import { StreamdownContent } from "@/shared/components/streamdown-content";

type StudyGuideViewerProps = {
    guide: StudyGuideOutputContent;
};

export function StudyGuideViewer({ guide }: StudyGuideViewerProps) {
    return (
        <article className="space-y-8">
            <section aria-labelledby="study-guide-overview">
                <h3
                    id="study-guide-overview"
                    className="font-heading text-lg font-semibold"
                >
                    Overview
                </h3>
                <StreamdownContent
                    content={guide.overview}
                    mode="static"
                    className="prose prose-sm dark:prose-invert mt-2 max-w-none"
                />
            </section>

            <ol className="space-y-6">
                {guide.sections.map((section, index) => (
                    <li
                        key={`${section.title}-${index}`}
                        className="paper-sheet rounded-md p-4"
                    >
                        <h3 className="font-heading text-lg font-semibold">
                            {section.title}
                        </h3>
                        <StreamdownContent
                            content={section.summary}
                            mode="static"
                            className="prose prose-sm dark:prose-invert mt-2 max-w-none"
                        />

                        <h4 className="mt-4 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                            Key points
                        </h4>
                        <ul className="mt-2 space-y-1.5">
                            {section.keyPoints.map((point, pointIndex) => (
                                <li
                                    key={pointIndex}
                                    className="flex gap-2 text-sm"
                                >
                                    <span
                                        aria-hidden
                                        className="mt-2 size-1.5 shrink-0 rounded-full bg-primary"
                                    />
                                    <StreamdownContent
                                        content={point}
                                        mode="static"
                                        className="prose prose-sm dark:prose-invert min-w-0 max-w-none [&_p]:my-0"
                                    />
                                </li>
                            ))}
                        </ul>

                        {section.studyPrompts.length > 0 ? (
                            <>
                                <h4 className="mt-4 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                                    Study prompts
                                </h4>
                                <ul className="mt-2 space-y-1.5">
                                    {section.studyPrompts.map(
                                        (prompt, promptIndex) => (
                                            <li
                                                key={promptIndex}
                                                className="rounded-md border border-dashed px-3 py-2 text-sm"
                                            >
                                                {prompt}
                                            </li>
                                        ),
                                    )}
                                </ul>
                            </>
                        ) : null}
                    </li>
                ))}
            </ol>

            {guide.glossary.length > 0 ? (
                <section aria-labelledby="study-guide-glossary">
                    <h3
                        id="study-guide-glossary"
                        className="font-heading text-lg font-semibold"
                    >
                        Glossary
                    </h3>
                    <dl className="mt-2 grid gap-3 sm:grid-cols-2">
                        {guide.glossary.map((entry, index) => (
                            <div
                                key={`${entry.term}-${index}`}
                                className="rounded-md border p-3"
                            >
                                <dt className="text-sm font-semibold">
                                    {entry.term}
                                </dt>
                                <dd className="mt-1 text-sm text-muted-foreground">
                                    <StreamdownContent
                                        content={entry.definition}
                                        mode="static"
                                        className="prose prose-sm dark:prose-invert max-w-none [&_p]:my-0"
                                    />
                                </dd>
                            </div>
                        ))}
                    </dl>
                </section>
            ) : null}
        </article>
    );
}
