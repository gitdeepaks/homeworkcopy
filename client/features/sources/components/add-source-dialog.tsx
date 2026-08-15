"use client";

import { useState, type DragEvent } from "react";
import {
    CheckCircle2Icon,
    FileTextIcon,
    Globe2Icon,
    PlusIcon,
    RotateCcwIcon,
    Trash2Icon,
    UploadCloudIcon,
    VideoIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
    useCreateSource,
    useImportWebsiteSource,
    useImportYoutubeSource,
    useUploadPdfSource,
} from "../hooks/use-sources";
import {
    validatePastedSource,
    validatePdfFiles,
    validateWebsiteSource,
    validateYoutubeSource,
} from "../lib/source-validation";
import type {
    CreateSourceInput,
    ImportWebsiteInput,
    ImportYoutubeInput,
} from "../lib/types";

type AddSourceDialogProps = {
    workspaceId: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess?: (sourceId: string) => void;
};

type Picker = "files" | "website" | "youtube" | "text";
type QueueStatus = "waiting" | "submitting" | "queued" | "failed";
type QueueBase = {
    id: string;
    label: string;
    status: QueueStatus;
    error?: string;
    sourceId?: string;
};
type FileQueueItem = QueueBase & { kind: "file"; file: File };
type TextQueueItem = QueueBase & { kind: "text"; input: CreateSourceInput };
type WebsiteQueueItem = QueueBase & { kind: "website"; input: ImportWebsiteInput };
type YoutubeQueueItem = QueueBase & { kind: "youtube"; input: ImportYoutubeInput };
type QueueItem = FileQueueItem | TextQueueItem | WebsiteQueueItem | YoutubeQueueItem;

const PICKERS: Array<{
    id: Picker;
    label: string;
    description: string;
    icon: typeof UploadCloudIcon;
}> = [
    { id: "files", label: "Upload files", description: "PDF, up to 10 MB", icon: UploadCloudIcon },
    { id: "website", label: "Website", description: "Import an article", icon: Globe2Icon },
    { id: "youtube", label: "YouTube", description: "Use the transcript", icon: VideoIcon },
    { id: "text", label: "Paste text", description: "Text or Markdown", icon: FileTextIcon },
];

function queueId(): string {
    return crypto.randomUUID();
}

export function AddSourceDialog({
    workspaceId,
    open,
    onOpenChange,
    onSuccess,
}: AddSourceDialogProps) {
    const createSource = useCreateSource(workspaceId);
    const uploadPdf = useUploadPdfSource(workspaceId);
    const importWebsite = useImportWebsiteSource(workspaceId);
    const importYoutube = useImportYoutubeSource(workspaceId);
    const [picker, setPicker] = useState<Picker>("files");
    const [items, setItems] = useState<QueueItem[]>([]);
    const [formError, setFormError] = useState<string | null>(null);
    const [url, setUrl] = useState("");
    const [title, setTitle] = useState("");
    const [content, setContent] = useState("");
    const [textType, setTextType] = useState<"TEXT" | "MARKDOWN">("TEXT");

    const isSubmitting = items.some((item) => item.status === "submitting");
    const actionableItems = items.filter(
        (item) => item.status === "waiting" || item.status === "failed",
    );

    function reset() {
        setPicker("files");
        setItems([]);
        setFormError(null);
        setUrl("");
        setTitle("");
        setContent("");
        setTextType("TEXT");
    }

    function handleOpenChange(nextOpen: boolean) {
        if (!nextOpen && isSubmitting) return;
        if (!nextOpen) reset();
        onOpenChange(nextOpen);
    }

    function updateItem(
        id: string,
        status: QueueStatus,
        error?: string,
        sourceId?: string,
    ) {
        setItems((current) =>
            current.map((item) =>
                item.id === id ? { ...item, status, error, sourceId } : item,
            ),
        );
    }

    function addFiles(files: File[]) {
        setFormError(null);
        const validationError = validatePdfFiles(files);
        if (validationError) {
            setFormError(validationError);
            return;
        }
        const availableSlots = Math.max(0, 10 - items.length);
        if (files.length > availableSlots) {
            setFormError("The import queue supports up to 10 items.");
            return;
        }
        setItems((current) => [
            ...current,
            ...files.map<FileQueueItem>((file) => ({
                id: queueId(),
                kind: "file",
                file,
                label: file.name,
                status: "waiting",
            })),
        ]);
    }

    function handleDrop(event: DragEvent<HTMLDivElement>) {
        event.preventDefault();
        if (!isSubmitting) addFiles(Array.from(event.dataTransfer.files));
    }

    function addUrlItem() {
        setFormError(null);
        if (items.length >= 10) {
            setFormError("The import queue supports up to 10 items.");
            return;
        }
        if (picker === "website") {
            const input: ImportWebsiteInput = { url, ...(title.trim() ? { title } : {}) };
            const validationError = validateWebsiteSource(input);
            if (validationError) return setFormError(validationError);
            setItems((current) => [
                ...current,
                { id: queueId(), kind: "website", input, label: title.trim() || url, status: "waiting" },
            ]);
        } else {
            const input: ImportYoutubeInput = { url, ...(title.trim() ? { title } : {}) };
            const validationError = validateYoutubeSource(input);
            if (validationError) return setFormError(validationError);
            setItems((current) => [
                ...current,
                { id: queueId(), kind: "youtube", input, label: title.trim() || url, status: "waiting" },
            ]);
        }
        setUrl("");
        setTitle("");
    }

    function addTextItem() {
        setFormError(null);
        if (items.length >= 10) {
            setFormError("The import queue supports up to 10 items.");
            return;
        }
        const input: CreateSourceInput = { type: textType, title, content };
        const validationError = validatePastedSource(input);
        if (validationError) return setFormError(validationError);
        setItems((current) => [
            ...current,
            { id: queueId(), kind: "text", input, label: title.trim(), status: "waiting" },
        ]);
        setTitle("");
        setContent("");
    }

    async function submitItem(item: QueueItem) {
        updateItem(item.id, "submitting");
        try {
            const source = item.kind === "file"
                ? await uploadPdf.mutateAsync({ file: item.file, idempotencyKey: item.id })
                : item.kind === "text"
                  ? await createSource.mutateAsync({ input: item.input, idempotencyKey: item.id })
                  : item.kind === "website"
                    ? await importWebsite.mutateAsync({ input: item.input, idempotencyKey: item.id })
                    : await importYoutube.mutateAsync({ input: item.input, idempotencyKey: item.id });
            updateItem(item.id, "queued", undefined, source.id);
            onSuccess?.(source.id);
        } catch (submitError) {
            updateItem(
                item.id,
                "failed",
                submitError instanceof Error ? submitError.message : "Import failed. Try again.",
            );
        }
    }

    async function submitQueue() {
        await Promise.all(actionableItems.map((item) => submitItem(item)));
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Add sources</DialogTitle>
                    <DialogDescription>
                        Build a batch, then keep working while Homeworkcopy prepares each source.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Choose a source type">
                    {PICKERS.map((option) => {
                        const Icon = option.icon;
                        return (
                            <button
                                key={option.id}
                                type="button"
                                aria-pressed={picker === option.id}
                                className={cn(
                                    "min-h-24 rounded-sm border bg-paper p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                                    picker === option.id && "border-primary bg-primary/5 shadow-[inset_3px_0_0_var(--primary)]",
                                )}
                                onClick={() => {
                                    setPicker(option.id);
                                    setFormError(null);
                                }}
                            >
                                <Icon className="mb-2 size-5" />
                                <span className="block text-sm font-semibold">{option.label}</span>
                                <span className="mt-1 block text-xs text-muted-foreground">{option.description}</span>
                            </button>
                        );
                    })}
                </div>

                <div className="rounded-sm border border-dashed border-border bg-muted/25 p-4">
                    {picker === "files" ? (
                        <div
                            className="grid min-h-36 place-items-center rounded-sm border border-dashed bg-paper px-4 text-center"
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={handleDrop}
                        >
                            <div>
                                <UploadCloudIcon className="mx-auto mb-2 size-7 text-primary" />
                                <p className="text-sm font-medium">Drop PDFs here</p>
                                <p className="mt-1 text-xs text-muted-foreground">Multiple files are supported. 10 MB per file.</p>
                                <Button nativeButton={false} variant="outline" size="sm" className="mt-3" render={<Label htmlFor="source-files" />}>
                                    Upload files
                                </Button>
                                <Input
                                    id="source-files"
                                    type="file"
                                    accept="application/pdf,.pdf"
                                    multiple
                                    className="sr-only"
                                    disabled={isSubmitting}
                                    onChange={(event) => addFiles(Array.from(event.target.files ?? []))}
                                />
                            </div>
                        </div>
                    ) : picker === "text" ? (
                        <div className="grid gap-3">
                            <div className="flex gap-2" aria-label="Pasted content format">
                                <Button type="button" size="xs" variant={textType === "TEXT" ? "secondary" : "outline"} onClick={() => setTextType("TEXT")}>Plain text</Button>
                                <Button type="button" size="xs" variant={textType === "MARKDOWN" ? "secondary" : "outline"} onClick={() => setTextType("MARKDOWN")}>Markdown</Button>
                            </div>
                            <SourceField id="source-title" label="Title" value={title} onChange={setTitle} placeholder="Lecture notes" />
                            <div className="grid gap-2">
                                <Label htmlFor="source-content">Content</Label>
                                <Textarea id="source-content" rows={7} value={content} onChange={(event) => setContent(event.target.value)} placeholder="Paste source material here..." />
                            </div>
                            <Button type="button" variant="outline" onClick={addTextItem}><PlusIcon /> Add to queue</Button>
                        </div>
                    ) : (
                        <div className="grid gap-3">
                            <SourceField
                                id="source-url"
                                label={picker === "website" ? "Website URL" : "YouTube URL"}
                                value={url}
                                onChange={setUrl}
                                placeholder={picker === "website" ? "https://example.com/article" : "https://youtube.com/watch?v=..."}
                                type="url"
                            />
                            <SourceField id="source-url-title" label="Title (optional)" value={title} onChange={setTitle} placeholder="Source title" />
                            <Button type="button" variant="outline" onClick={addUrlItem}><PlusIcon /> Add to queue</Button>
                        </div>
                    )}
                </div>

                {formError ? <p role="alert" className="text-sm text-destructive">{formError}</p> : null}

                {items.length > 0 ? (
                    <section aria-labelledby="import-queue-title" className="grid gap-2">
                        <div className="flex items-center justify-between">
                            <h3 id="import-queue-title" className="font-heading text-lg font-semibold">Import queue</h3>
                            <span className="text-xs text-muted-foreground">{items.length}/10 items</span>
                        </div>
                        <ul className="max-h-56 space-y-2 overflow-y-auto" aria-live="polite">
                            {items.map((item) => (
                                <li key={item.id} className="flex min-h-14 items-center gap-3 rounded-sm border bg-paper px-3 py-2">
                                    {item.status === "submitting" ? <Spinner /> : item.status === "queued" ? <CheckCircle2Icon className="size-4 text-emerald-700" /> : <FileTextIcon className="size-4 text-muted-foreground" />}
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium">{item.label}</p>
                                        <p className={cn("text-xs text-muted-foreground", item.status === "failed" && "text-destructive")}>
                                            {item.status === "waiting" ? "Waiting" : item.status === "submitting" ? item.kind === "file" ? "Uploading" : "Submitting" : item.status === "queued" ? "Queued for extraction" : item.error}
                                        </p>
                                    </div>
                                    {item.status === "failed" ? (
                                        <Button type="button" variant="ghost" size="icon-sm" onClick={() => void submitItem(item)}><RotateCcwIcon /><span className="sr-only">Retry {item.label}</span></Button>
                                    ) : null}
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon-sm"
                                        disabled={item.status === "submitting"}
                                        onClick={() => setItems((current) => current.filter((candidate) => candidate.id !== item.id))}
                                    >
                                        <Trash2Icon /><span className="sr-only">Remove {item.label}</span>
                                    </Button>
                                </li>
                            ))}
                        </ul>
                    </section>
                ) : null}

                <DialogFooter className="gap-2 sm:justify-between">
                    <Button type="button" variant="ghost" disabled={isSubmitting} onClick={() => handleOpenChange(false)}>Close</Button>
                    <Button type="button" disabled={actionableItems.length === 0 || isSubmitting} onClick={() => void submitQueue()}>
                        {isSubmitting ? <Spinner /> : null}
                        Import {actionableItems.length || ""} source{actionableItems.length === 1 ? "" : "s"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function SourceField({
    id,
    label,
    value,
    onChange,
    placeholder,
    type = "text",
}: {
    id: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    type?: "text" | "url";
}) {
    return (
        <div className="grid gap-2">
            <Label htmlFor={id}>{label}</Label>
            <Input
                id={id}
                type={type}
                inputMode={type === "url" ? "url" : "text"}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                placeholder={placeholder}
            />
        </div>
    );
}
