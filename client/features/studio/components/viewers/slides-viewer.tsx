"use client";

import { useState } from "react";
import Link from "next/link";
import { PlusIcon, Trash2Icon } from "lucide-react";
import {
    editOutputContentRequestSchema,
    SLIDE_BULLET_MAX,
    SLIDE_MAX,
    SLIDE_MIN,
    SLIDE_TITLE_MAX_LENGTH,
    type OutputSourceLabel,
    type SlideDeck,
} from "@homeworkcopy/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { sourceRoutes } from "@/features/sources";
import { useUpdateOutputContent } from "../../hooks/use-outputs";
import { segmentSources } from "../../lib/audio";
import {
    itemsToLines,
    linesToItems,
    nextElementId,
    removeAt,
    replaceAt,
} from "../../lib/editing";

type SlidesViewerProps = {
    workspaceId: string;
    outputId: string;
    deck: SlideDeck;
    sourceLabels: readonly OutputSourceLabel[];
    /** False while the output is still generating or already failed. */
    canEdit: boolean;
};

/**
 * Slide deck viewer with in-place section editing.
 *
 * Edits are validated against the same contract the generator satisfies before
 * they are sent, so a saved deck always renders. Citations are shown but not
 * editable — see `lib/editing.ts` for why.
 *
 * The caller remounts this component whenever the stored deck changes, so a
 * regeneration can never leave a stale draft that Save would write back over
 * the new content.
 */
export function SlidesViewer({
    workspaceId,
    outputId,
    deck,
    sourceLabels,
    canEdit,
}: SlidesViewerProps) {
    const [draft, setDraft] = useState<SlideDeck | null>(null);
    const [validationError, setValidationError] = useState<string | null>(null);
    const updateContent = useUpdateOutputContent(workspaceId);

    const isEditing = draft !== null;
    const slides = draft?.slides ?? deck.slides;

    function updateSlide(index: number, patch: Partial<SlideDeck["slides"][number]>) {
        setDraft((current) => {
            const base = current ?? deck;
            const slide = base.slides[index];
            if (!slide) {
                return base;
            }
            return {
                ...base,
                slides: replaceAt(base.slides, index, { ...slide, ...patch }),
            };
        });
    }

    async function handleSave() {
        if (!draft) {
            return;
        }

        const parsed = editOutputContentRequestSchema.safeParse({
            type: "SLIDES",
            deck: draft,
        });

        if (!parsed.success) {
            setValidationError(
                `This deck cannot be saved yet: ${parsed.error.issues[0]?.message ?? "check every slide has a title and at least one bullet"}.`,
            );
            return;
        }

        setValidationError(null);
        try {
            await updateContent.mutateAsync({
                outputId,
                input: parsed.data,
            });
        } catch {
            return;
        }
        setDraft(null);
    }

    return (
        <div>
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                    {isEditing ? (
                        <div className="grid gap-2">
                            <div className="grid gap-1.5">
                                <Label htmlFor="deck-title">Deck title</Label>
                                <Input
                                    id="deck-title"
                                    value={draft.title}
                                    maxLength={SLIDE_TITLE_MAX_LENGTH}
                                    onChange={(event) =>
                                        setDraft({
                                            ...draft,
                                            title: event.target.value,
                                        })
                                    }
                                />
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="deck-subtitle">
                                    Subtitle (optional)
                                </Label>
                                <Input
                                    id="deck-subtitle"
                                    value={draft.subtitle ?? ""}
                                    maxLength={SLIDE_TITLE_MAX_LENGTH}
                                    onChange={(event) => {
                                        const value = event.target.value.trim();
                                        setDraft({
                                            ...draft,
                                            ...(value
                                                ? { subtitle: event.target.value }
                                                : { subtitle: undefined }),
                                        });
                                    }}
                                />
                            </div>
                        </div>
                    ) : (
                        <>
                            <h3 className="font-heading text-xl font-bold">
                                {deck.title}
                            </h3>
                            {deck.subtitle ? (
                                <p className="text-sm text-muted-foreground">
                                    {deck.subtitle}
                                </p>
                            ) : null}
                        </>
                    )}
                </div>

                {canEdit ? (
                    <div className="flex shrink-0 items-center gap-1.5">
                        {isEditing ? (
                            <>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={updateContent.isPending}
                                    onClick={() => {
                                        setDraft(null);
                                        setValidationError(null);
                                    }}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    size="sm"
                                    disabled={updateContent.isPending}
                                    onClick={() => void handleSave()}
                                >
                                    {updateContent.isPending ? (
                                        <Spinner />
                                    ) : null}
                                    Save deck
                                </Button>
                            </>
                        ) : (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setDraft(deck)}
                            >
                                Edit slides
                            </Button>
                        )}
                    </div>
                ) : null}
            </div>

            {validationError ? (
                <p
                    role="alert"
                    className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
                >
                    {validationError}
                </p>
            ) : null}

            {updateContent.error ? (
                <p
                    role="alert"
                    className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
                >
                    {updateContent.error.message}
                </p>
            ) : null}

            <ol className="mt-4 space-y-3">
                {slides.map((slide, index) => {
                    const sources = segmentSources(
                        sourceLabels,
                        slide.sourceLabels,
                    );

                    return (
                        <li
                            key={slide.id}
                            className="rounded-2xl border bg-paper p-4 shadow-sm"
                        >
                            <div className="flex items-baseline justify-between gap-2">
                                <p className="font-mono text-xs text-muted-foreground tabular-nums">
                                    Slide {index + 1}
                                </p>
                                {isEditing && slides.length > SLIDE_MIN ? (
                                    <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        onClick={() =>
                                            setDraft({
                                                ...draft,
                                                slides: removeAt(
                                                    draft.slides,
                                                    index,
                                                ),
                                            })
                                        }
                                    >
                                        <Trash2Icon />
                                        <span className="sr-only">
                                            Remove slide {index + 1}
                                        </span>
                                    </Button>
                                ) : null}
                            </div>

                            {isEditing ? (
                                <div className="mt-2 grid gap-3">
                                    <div className="grid gap-1.5">
                                        <Label htmlFor={`${slide.id}-title`}>
                                            Title
                                        </Label>
                                        <Input
                                            id={`${slide.id}-title`}
                                            value={slide.title}
                                            maxLength={SLIDE_TITLE_MAX_LENGTH}
                                            onChange={(event) =>
                                                updateSlide(index, {
                                                    title: event.target.value,
                                                })
                                            }
                                        />
                                    </div>
                                    <div className="grid gap-1.5">
                                        <Label htmlFor={`${slide.id}-bullets`}>
                                            Bullets (one per line, up to{" "}
                                            {SLIDE_BULLET_MAX})
                                        </Label>
                                        <Textarea
                                            id={`${slide.id}-bullets`}
                                            rows={4}
                                            defaultValue={itemsToLines(
                                                slide.bullets,
                                            )}
                                            onChange={(event) =>
                                                updateSlide(index, {
                                                    bullets: linesToItems(
                                                        event.target.value,
                                                    ),
                                                })
                                            }
                                        />
                                    </div>
                                    <div className="grid gap-1.5">
                                        <Label htmlFor={`${slide.id}-notes`}>
                                            Speaker notes (optional)
                                        </Label>
                                        <Textarea
                                            id={`${slide.id}-notes`}
                                            rows={3}
                                            defaultValue={
                                                slide.speakerNotes ?? ""
                                            }
                                            onChange={(event) => {
                                                const value =
                                                    event.target.value.trim();
                                                updateSlide(index, {
                                                    speakerNotes: value
                                                        ? event.target.value
                                                        : undefined,
                                                });
                                            }}
                                        />
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <p className="mt-1 font-heading text-lg font-bold">
                                        {slide.title}
                                    </p>
                                    <ul className="mt-2 space-y-1 text-sm">
                                        {slide.bullets.map(
                                            (bullet, bulletIndex) => (
                                                <li
                                                    key={`${slide.id}-${String(bulletIndex)}`}
                                                    className="flex gap-2"
                                                >
                                                    <span
                                                        aria-hidden
                                                        className="text-margin-line"
                                                    >
                                                        —
                                                    </span>
                                                    <span>{bullet}</span>
                                                </li>
                                            ),
                                        )}
                                    </ul>
                                    {slide.speakerNotes ? (
                                        <p className="mt-3 border-t pt-2 text-sm text-muted-foreground">
                                            <span className="font-medium">
                                                Notes:{" "}
                                            </span>
                                            {slide.speakerNotes}
                                        </p>
                                    ) : null}
                                </>
                            )}

                            {sources.length > 0 ? (
                                <ul className="mt-3 flex flex-wrap gap-1.5">
                                    {sources.map((source) => (
                                        <li key={source.label}>
                                            <Link
                                                href={sourceRoutes.detail(
                                                    workspaceId,
                                                    source.sourceId,
                                                )}
                                                className="inline-flex max-w-[16rem] items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                                            >
                                                <span className="font-medium">
                                                    {source.label}
                                                </span>
                                                <span className="truncate text-muted-foreground">
                                                    {source.title}
                                                </span>
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            ) : null}
                        </li>
                    );
                })}
            </ol>

            {isEditing && slides.length < SLIDE_MAX ? (
                <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() =>
                        setDraft({
                            ...draft,
                            slides: [
                                ...draft.slides,
                                {
                                    id: nextElementId("sl", draft.slides),
                                    title: "New slide",
                                    bullets: ["Add a talking point"],
                                    sourceLabels: [],
                                },
                            ],
                        })
                    }
                >
                    <PlusIcon />
                    Add slide
                </Button>
            ) : null}
        </div>
    );
}
