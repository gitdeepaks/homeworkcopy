"use client";

import { useEffect, useMemo, useState } from "react";
import {
    DEFAULT_AUDIO_OVERVIEW_OPTIONS,
    OUTPUT_FOCUS_MAX_LENGTH,
    OUTPUT_TITLE_MAX_LENGTH,
    type AudioOverviewStyle,
    type AudioVoiceProfile,
    type OutputLength,
} from "@homeworkcopy/contracts";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    NativeSelect,
    NativeSelectOption,
} from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useSources } from "@/features/sources";
import { resolveSourceSelection } from "@/features/sources/lib/grounding";
import { useNotebookUiStore } from "@/features/workspaces/stores/notebook-ui-store";
import {
    AUDIO_STYLE_LABELS,
    AUDIO_STYLES,
    AUDIO_VOICE_LABELS,
    AUDIO_VOICES,
    CREATABLE_OUTPUT_GROUPS,
    OUTPUT_GROUP_LABELS,
    OUTPUT_LENGTH_LABELS,
    OUTPUT_LENGTHS,
    OUTPUT_LOCALES,
    OUTPUT_TYPE_DESCRIPTIONS,
    OUTPUT_TYPE_LABELS,
} from "../lib/constants";
import { useStudioCapabilities } from "../hooks/use-capabilities";
import { useCreateOutput } from "../hooks/use-outputs";
import type { OutputType } from "../lib/types";

type CreateOutputDialogProps = {
    workspaceId: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

const EMPTY_SOURCE_IDS: string[] = [];

export function CreateOutputDialog({
    workspaceId,
    open,
    onOpenChange,
}: CreateOutputDialogProps) {
    const [type, setType] = useState<OutputType>("SUMMARY");
    const [title, setTitle] = useState("");
    const [focus, setFocus] = useState("");
    const [length, setLength] = useState<OutputLength>("standard");
    const [locale, setLocale] = useState("en");
    const [audioStyle, setAudioStyle] = useState<AudioOverviewStyle>(
        DEFAULT_AUDIO_OVERVIEW_OPTIONS.style,
    );
    const [audioVoice, setAudioVoice] = useState<AudioVoiceProfile>(
        DEFAULT_AUDIO_OVERVIEW_OPTIONS.voice,
    );
    const [changingSources, setChangingSources] = useState(false);
    const [overrideSourceIds, setOverrideSourceIds] = useState<string[] | null>(
        null,
    );

    const createOutput = useCreateOutput(workspaceId);
    const {
        data: sources = [],
        isLoading: sourcesLoading,
        error: sourcesError,
    } = useSources(workspaceId);
    const selectionMode = useNotebookUiStore(
        (state) =>
            state.byNotebook[workspaceId]?.sourceSelectionMode ?? "all-ready",
    );
    const selectedSourceIds = useNotebookUiStore(
        (state) =>
            state.byNotebook[workspaceId]?.selectedSourceIds ?? EMPTY_SOURCE_IDS,
    );

    const notebookSelection = resolveSourceSelection(
        sources,
        selectionMode,
        selectedSourceIds,
    );
    const selection = overrideSourceIds
        ? resolveSourceSelection(sources, "custom", overrideSourceIds)
        : notebookSelection;

    const readySources = useMemo(
        () => sources.filter((source) => source.status === "READY"),
        [sources],
    );
    const processingSourceCount = sources.filter(
        (source) =>
            source.status === "PENDING" || source.status === "PROCESSING",
    ).length;

    // Reopening the dialog should always start from the notebook's selection.
    useEffect(() => {
        if (!open) {
            setOverrideSourceIds(null);
            setChangingSources(false);
        }
    }, [open]);

    const { data: capabilities } = useStudioCapabilities();
    const audioAvailable = capabilities?.audioOverview === true;
    const isAudio = type === "AUDIO_OVERVIEW";
    const canGenerate =
        !sourcesLoading &&
        !sourcesError &&
        selection.canUseSelection &&
        (!isAudio || audioAvailable);

    /** A type the reader may pick right now, given sources and configuration. */
    function isTypeAvailable(outputType: OutputType): boolean {
        return (
            !sourcesLoading &&
            !sourcesError &&
            selection.canUseSelection &&
            (outputType !== "AUDIO_OVERVIEW" || audioAvailable)
        );
    }

    function toggleSource(sourceId: string) {
        const current = overrideSourceIds ?? selection.effectiveSourceIds;
        setOverrideSourceIds(
            current.includes(sourceId)
                ? current.filter((id) => id !== sourceId)
                : [...current, sourceId],
        );
    }

    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault();

        if (!canGenerate) {
            return;
        }

        try {
            await createOutput.mutateAsync({
                type,
                title: title.trim() || undefined,
                options: {
                    length,
                    locale,
                    focus: focus.trim() || undefined,
                    ...(isAudio
                        ? { audio: { style: audioStyle, voice: audioVoice } }
                        : {}),
                },
                ...selection.request,
            });
        } catch {
            return;
        }

        setTitle("");
        setFocus("");
        onOpenChange(false);
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90svh] max-w-2xl overflow-y-auto">
                <form onSubmit={(event) => void handleSubmit(event)}>
                    <DialogHeader>
                        <DialogTitle>Create output</DialogTitle>
                        <DialogDescription>
                            Uses exactly the sources listed below. Generation
                            continues in the background.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-4 py-4">
                        {sourcesLoading ? (
                            <div
                                role="status"
                                className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground"
                            >
                                <Spinner />
                                Checking source readiness…
                            </div>
                        ) : sourcesError ? (
                            <p
                                role="alert"
                                className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
                            >
                                Could not verify source readiness. Close this
                                dialog and try again.
                            </p>
                        ) : selection.exceedsSourceLimit ? (
                            <p
                                role="alert"
                                className="rounded-md border border-amber-600/40 bg-amber-500/10 px-3 py-2 text-sm"
                            >
                                Choose at most 50 sources before creating an
                                output.
                            </p>
                        ) : selection.unavailableSourceIds.length > 0 ? (
                            <p
                                role="alert"
                                className="rounded-md border border-amber-600/40 bg-amber-500/10 px-3 py-2 text-sm"
                            >
                                One or more selected sources are unavailable.
                                Use Change sources to update the selection.
                            </p>
                        ) : readySources.length === 0 ? (
                            <p
                                role="status"
                                className="rounded-md border border-amber-600/40 bg-amber-500/10 px-3 py-2 text-sm"
                            >
                                {processingSourceCount > 0
                                    ? `${processingSourceCount} source${processingSourceCount === 1 ? " is" : "s are"} still processing. You can create an output when at least one source is ready.`
                                    : "Add and process at least one source before creating an output."}
                            </p>
                        ) : selection.effectiveSourceIds.length === 0 ? (
                            <p
                                role="status"
                                className="rounded-md border border-amber-600/40 bg-amber-500/10 px-3 py-2 text-sm"
                            >
                                Select at least one ready source before creating
                                an output.
                            </p>
                        ) : null}

                        {createOutput.error ? (
                            <p
                                role="alert"
                                className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
                            >
                                {createOutput.error.message}
                            </p>
                        ) : null}

                        <fieldset className="grid gap-3">
                            <legend className="text-sm font-medium">Type</legend>
                            {CREATABLE_OUTPUT_GROUPS.map(
                                ({ group, types }) => (
                                    <div key={group} className="grid gap-2">
                                        <p className="text-xs tracking-wide text-muted-foreground uppercase">
                                            {OUTPUT_GROUP_LABELS[group]}
                                        </p>
                                        <div className="grid gap-2 sm:grid-cols-2">
                                            {types.map((outputType) => {
                                                const available =
                                                    isTypeAvailable(outputType);
                                                const unsupported =
                                                    outputType ===
                                                        "AUDIO_OVERVIEW" &&
                                                    !audioAvailable;

                                                return (
                                                    <label
                                                        key={outputType}
                                                        className={`cursor-pointer rounded-2xl border px-3 py-3 text-left transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring ${
                                                            available
                                                                ? "hover:bg-muted/50"
                                                                : "cursor-not-allowed opacity-60"
                                                        }`}
                                                    >
                                                        <input
                                                            type="radio"
                                                            name="output-type"
                                                            className="sr-only"
                                                            value={outputType}
                                                            checked={
                                                                type ===
                                                                outputType
                                                            }
                                                            disabled={
                                                                !available
                                                            }
                                                            onChange={() =>
                                                                setType(
                                                                    outputType,
                                                                )
                                                            }
                                                        />
                                                        <span className="block text-sm font-medium">
                                                            {
                                                                OUTPUT_TYPE_LABELS[
                                                                    outputType
                                                                ]
                                                            }
                                                        </span>
                                                        <span className="mt-1 block text-xs text-muted-foreground">
                                                            {unsupported
                                                                ? "Not available: this deployment has no speech provider or media storage configured."
                                                                : OUTPUT_TYPE_DESCRIPTIONS[
                                                                      outputType
                                                                  ]}
                                                        </span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ),
                            )}
                        </fieldset>

                        <div className="rounded-2xl border p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-sm" aria-live="polite">
                                    {selection.effectiveSourceIds.length} source
                                    {selection.effectiveSourceIds.length === 1
                                        ? ""
                                        : "s"}{" "}
                                    selected
                                    {overrideSourceIds
                                        ? " for this output"
                                        : " in this notebook"}
                                </p>
                                <div className="flex items-center gap-1.5">
                                    {overrideSourceIds ? (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() =>
                                                setOverrideSourceIds(null)
                                            }
                                        >
                                            Use notebook selection
                                        </Button>
                                    ) : null}
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        aria-expanded={changingSources}
                                        onClick={() =>
                                            setChangingSources(
                                                (value) => !value,
                                            )
                                        }
                                    >
                                        {changingSources
                                            ? "Done"
                                            : "Change sources"}
                                    </Button>
                                </div>
                            </div>

                            {changingSources ? (
                                <ul className="mt-3 max-h-52 space-y-1 overflow-y-auto">
                                    {readySources.length === 0 ? (
                                        <li className="text-sm text-muted-foreground">
                                            No ready sources yet.
                                        </li>
                                    ) : (
                                        readySources.map((source) => {
                                            const checked =
                                                selection.effectiveSourceIds.includes(
                                                    source.id,
                                                );
                                            return (
                                                <li
                                                    key={source.id}
                                                    className="flex items-center gap-2 rounded-md px-1 py-1.5"
                                                >
                                                    <Checkbox
                                                        id={`output-source-${source.id}`}
                                                        checked={checked}
                                                        onCheckedChange={() =>
                                                            toggleSource(
                                                                source.id,
                                                            )
                                                        }
                                                    />
                                                    <Label
                                                        htmlFor={`output-source-${source.id}`}
                                                        className="min-w-0 flex-1 truncate text-sm font-normal"
                                                    >
                                                        {source.title}
                                                    </Label>
                                                </li>
                                            );
                                        })
                                    )}
                                </ul>
                            ) : null}
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="grid gap-2">
                                <Label htmlFor="output-length">Depth</Label>
                                <NativeSelect
                                    className="w-full"
                                    id="output-length"
                                    value={length}
                                    disabled={!canGenerate}
                                    onChange={(event) => {
                                        const next = OUTPUT_LENGTHS.find(
                                            (option) =>
                                                option === event.target.value,
                                        );
                                        if (next) {
                                            setLength(next);
                                        }
                                    }}
                                >
                                    {OUTPUT_LENGTHS.map((option) => (
                                        <NativeSelectOption
                                            key={option}
                                            value={option}
                                        >
                                            {OUTPUT_LENGTH_LABELS[option]}
                                        </NativeSelectOption>
                                    ))}
                                </NativeSelect>
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="output-locale">Language</Label>
                                <NativeSelect
                                    className="w-full"
                                    id="output-locale"
                                    value={locale}
                                    disabled={!canGenerate}
                                    onChange={(event) =>
                                        setLocale(event.target.value)
                                    }
                                >
                                    {OUTPUT_LOCALES.map((option) => (
                                        <NativeSelectOption
                                            key={option.value}
                                            value={option.value}
                                        >
                                            {option.label}
                                        </NativeSelectOption>
                                    ))}
                                </NativeSelect>
                            </div>
                        </div>

                        {isAudio ? (
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="grid gap-2">
                                    <Label htmlFor="audio-style">Format</Label>
                                    <NativeSelect
                                        className="w-full"
                                        id="audio-style"
                                        value={audioStyle}
                                        disabled={!canGenerate}
                                        onChange={(event) => {
                                            const next = AUDIO_STYLES.find(
                                                (option) =>
                                                    option ===
                                                    event.target.value,
                                            );
                                            if (next) {
                                                setAudioStyle(next);
                                            }
                                        }}
                                    >
                                        {AUDIO_STYLES.map((option) => (
                                            <NativeSelectOption
                                                key={option}
                                                value={option}
                                            >
                                                {AUDIO_STYLE_LABELS[option]}
                                            </NativeSelectOption>
                                        ))}
                                    </NativeSelect>
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="audio-voice">Voice</Label>
                                    <NativeSelect
                                        className="w-full"
                                        id="audio-voice"
                                        value={audioVoice}
                                        disabled={!canGenerate}
                                        onChange={(event) => {
                                            const next = AUDIO_VOICES.find(
                                                (option) =>
                                                    option ===
                                                    event.target.value,
                                            );
                                            if (next) {
                                                setAudioVoice(next);
                                            }
                                        }}
                                    >
                                        {AUDIO_VOICES.map((option) => (
                                            <NativeSelectOption
                                                key={option}
                                                value={option}
                                            >
                                                {AUDIO_VOICE_LABELS[option]}
                                            </NativeSelectOption>
                                        ))}
                                    </NativeSelect>
                                </div>
                            </div>
                        ) : null}

                        <div className="grid gap-2">
                            <Label htmlFor="output-focus">
                                Focus (optional)
                            </Label>
                            <Textarea
                                id="output-focus"
                                value={focus}
                                rows={2}
                                maxLength={OUTPUT_FOCUS_MAX_LENGTH}
                                placeholder="What should this output pay special attention to?"
                                disabled={!canGenerate}
                                onChange={(event) =>
                                    setFocus(event.target.value)
                                }
                            />
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="output-title">
                                Title (optional)
                            </Label>
                            <Input
                                id="output-title"
                                value={title}
                                maxLength={OUTPUT_TITLE_MAX_LENGTH}
                                onChange={(event) =>
                                    setTitle(event.target.value)
                                }
                                placeholder="Custom title"
                                disabled={!canGenerate}
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            disabled={createOutput.isPending || !canGenerate}
                        >
                            {createOutput.isPending ? <Spinner /> : null}
                            Generate
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
