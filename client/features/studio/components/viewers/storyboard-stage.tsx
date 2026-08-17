import type { VideoScene } from "@homeworkcopy/contracts";
import { cn } from "@/lib/utils";

type StoryboardStageProps = {
    /** Deck title, shown as a running header. */
    title: string;
    /** Scene currently on screen. The first scene doubles as the thumbnail. */
    scene: VideoScene;
    /** Position of this scene, for the `2 / 9` counter. */
    index: number;
    total: number;
    /** Compact rendering for a Studio card thumbnail. */
    compact?: boolean;
};

/**
 * One frame of a video-style explainer.
 *
 * The frame is real DOM rather than a rendered image, so it scales with the
 * reader's text size, keeps theme contrast, and stays selectable and readable by
 * a screen reader — none of which a rasterized thumbnail would do. Showing the
 * first scene is what gives the output its thumbnail.
 */
export function StoryboardStage({
    title,
    scene,
    index,
    total,
    compact = false,
}: StoryboardStageProps) {
    return (
        <div
            className={cn(
                "flex aspect-video min-h-0 w-full flex-col justify-center overflow-hidden rounded-xl border bg-paper px-4 py-3 shadow-sm",
                compact ? "gap-1" : "gap-2 px-6 py-5",
            )}
        >
            <div className="flex items-baseline justify-between gap-2 text-muted-foreground">
                <p
                    className={cn(
                        "truncate",
                        compact ? "text-[0.625rem]" : "text-xs",
                    )}
                >
                    {title}
                </p>
                <p
                    className={cn(
                        "shrink-0 font-mono tabular-nums",
                        compact ? "text-[0.625rem]" : "text-xs",
                    )}
                >
                    {index + 1} / {total}
                </p>
            </div>

            <p
                className={cn(
                    "font-heading leading-tight font-bold",
                    compact ? "line-clamp-2 text-sm" : "text-xl sm:text-2xl",
                )}
            >
                {scene.title}
            </p>

            <ul
                className={cn(
                    "space-y-1",
                    compact
                        ? "line-clamp-2 text-[0.625rem] leading-snug"
                        : "text-sm sm:text-base",
                )}
            >
                {(compact ? scene.bullets.slice(0, 2) : scene.bullets).map(
                    (bullet, bulletIndex) => (
                        <li
                            key={`${scene.id}-${String(bulletIndex)}`}
                            className="flex gap-2"
                        >
                            <span aria-hidden className="text-margin-line">
                                —
                            </span>
                            <span className="min-w-0">{bullet}</span>
                        </li>
                    ),
                )}
            </ul>
        </div>
    );
}
