"use client";

import { useEffect, useState } from "react";

/**
 * Publishes a WebVTT document as a URL a `<track>` element can load.
 *
 * A `<track>` needs a URL rather than inline text, so the document is wrapped in
 * a same-origin blob. The URL is revoked when the captions change or the viewer
 * unmounts, so a reader who opens several outputs does not accumulate blobs for
 * the life of the tab.
 *
 * @param vtt - Complete WebVTT document, or `null` when there are no captions
 * @returns An object URL, or `null` while there is nothing to serve
 */
export function useCaptionTrackUrl(vtt: string | null): string | null {
    const [url, setUrl] = useState<string | null>(null);

    useEffect(() => {
        if (vtt === null) {
            setUrl(null);
            return;
        }

        const objectUrl = URL.createObjectURL(
            new Blob([vtt], { type: "text/vtt" }),
        );
        setUrl(objectUrl);

        return () => {
            URL.revokeObjectURL(objectUrl);
        };
    }, [vtt]);

    return url;
}
