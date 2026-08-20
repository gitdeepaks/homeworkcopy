"use client";

import { GlobeIcon, BrainIcon } from "lucide-react";
import type {
    PrivacyPreferences,
    UpdatePrivacyPreferences,
} from "@homeworkcopy/contracts";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

/**
 * One consent switch, described in terms of what turning it on causes.
 *
 * The description names the provider and says plainly that content leaves the
 * product, because that is the fact the reader is deciding about. A control that
 * says "improve your experience" is not consent, it is decoration.
 */
type ControlDefinition = {
    key: keyof PrivacyPreferences;
    title: string;
    icon: typeof GlobeIcon;
    description: string;
    consequence: string;
};

const CONTROLS: readonly ControlDefinition[] = [
    {
        key: "learnedMemory",
        title: "Memory",
        icon: BrainIcon,
        description:
            "Homeworkcopy notices stable facts and preferences in your chats and brings them into later answers.",
        consequence:
            "Your questions and answers are sent to Mem0, which stores them. With this off, nothing about you is kept there — including memories you write by hand — and existing memories can still be viewed and deleted.",
    },
    {
        key: "webSearch",
        title: "Web grounding",
        icon: GlobeIcon,
        description:
            "Lets a question reach beyond your sources to current information on the web.",
        consequence:
            "Your question is sent to Tavily to run the search. With this off, web-grounded chat is unavailable and answers come only from your notebook's sources.",
    },
];

export function ConsentControls({
    preferences,
    onChange,
    isPending,
}: {
    preferences: PrivacyPreferences;
    onChange: (input: UpdatePrivacyPreferences) => void;
    isPending: boolean;
}) {
    return (
        <div className="space-y-3">
            {CONTROLS.map((control) => {
                const Icon = control.icon;
                const enabled = preferences[control.key];
                const inputId = `privacy-${control.key}`;

                return (
                    <div key={control.key} className="paper-sheet rounded-md p-4">
                        <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0 flex-1 space-y-2">
                                <div className="flex items-center gap-2">
                                    <Icon className="size-4 shrink-0" />
                                    <Label
                                        htmlFor={inputId}
                                        className="font-medium"
                                    >
                                        {control.title}
                                    </Label>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    {control.description}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    {control.consequence}
                                </p>
                            </div>
                            <Switch
                                id={inputId}
                                checked={enabled}
                                disabled={isPending}
                                onCheckedChange={(checked) => {
                                    onChange({ [control.key]: checked });
                                }}
                            />
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
