"use client";

import { useEffect, useState } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type CopyLinkFieldProps = {
    label: string;
    url: string;
    description?: string;
};

/**
 * A link the reader is expected to copy and send.
 *
 * The input is read-only rather than disabled so the URL stays selectable and
 * announced, and the copy result is reported through a live region because a
 * silently changing icon tells a screen-reader user nothing.
 */
export function CopyLinkField({ label, url, description }: CopyLinkFieldProps) {
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!copied) return;
        const timer = setTimeout(() => setCopied(false), 2_000);
        return () => clearTimeout(timer);
    }, [copied]);

    return (
        <div className="space-y-1.5">
            <div className="flex items-center gap-2">
                <Input
                    readOnly
                    value={url}
                    aria-label={label}
                    onFocus={(event) => event.currentTarget.select()}
                    className="font-mono text-xs"
                />
                <Button
                    variant="outline"
                    className="min-h-11 shrink-0"
                    onClick={() => {
                        void navigator.clipboard
                            .writeText(url)
                            .then(() => setCopied(true))
                            // Clipboard access can be denied; the URL is still
                            // on screen and selectable, so this is not fatal.
                            .catch(() => setCopied(false));
                    }}
                >
                    {copied ? <CheckIcon aria-hidden /> : <CopyIcon aria-hidden />}
                    {copied ? "Copied" : "Copy"}
                </Button>
            </div>
            <p aria-live="polite" className="sr-only">
                {copied ? "Link copied to clipboard" : ""}
            </p>
            {description ? (
                <p className="text-xs text-muted-foreground">{description}</p>
            ) : null}
        </div>
    );
}
