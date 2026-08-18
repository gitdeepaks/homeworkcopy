"use client";

import { useState } from "react";
import Link from "next/link";
import { SettingsIcon, Share2Icon, UsersIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    CHAT_MODEL_LABELS,
    CHAT_MODELS,
    isChatModelId,
    useChatPreferences,
} from "@/features/chat/stores/chat-preferences";
import { ShareDialog } from "@/features/collaboration/components/share-dialog";
import { can } from "@/features/collaboration/lib/permissions";
import { workspaceRoutes } from "../lib/routes";
import type { Workspace } from "../lib/types";

type WorkspaceHeaderActionsProps = {
    workspace: Workspace;
};

export function WorkspaceHeaderActions({
    workspace,
}: WorkspaceHeaderActionsProps) {
    const storedPrefs = useChatPreferences(
        (state) => state.byWorkspace[workspace.id],
    );
    const getPrefs = useChatPreferences((state) => state.getPrefs);
    const setModel = useChatPreferences((state) => state.setModel);
    const prefs = storedPrefs ?? getPrefs(workspace.id, workspace.defaultModel);
    const [shareOpen, setShareOpen] = useState(false);
    // Everyone who can see the notebook can see who else can; only the owner
    // can change it, and the dialog itself enforces that distinction.
    const canOpenSharing = can(workspace.role, "member:read");
    const canManageSharing = can(workspace.role, "share:manage");

    return (
        <div className="flex items-center gap-2">
            <Select
                value={prefs.model}
                onValueChange={(value) => {
                    if (isChatModelId(value)) {
                        setModel(workspace.id, value);
                    }
                }}
            >
                <SelectTrigger className="hidden h-8 w-[140px] sm:flex">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {CHAT_MODELS.map((model) => (
                        <SelectItem key={model} value={model}>
                            {CHAT_MODEL_LABELS[model]}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>

            {canOpenSharing ? (
                <Button
                    variant="ghost"
                    size="icon-sm"
                    className="size-11"
                    onClick={() => setShareOpen(true)}
                >
                    {canManageSharing ? (
                        <Share2Icon aria-hidden />
                    ) : (
                        <UsersIcon aria-hidden />
                    )}
                    <span className="sr-only">
                        {canManageSharing
                            ? "Share this notebook"
                            : "See who has access"}
                    </span>
                </Button>
            ) : null}

            {can(workspace.role, "notebook:update") ? (
                <Button
                    nativeButton={false}
                    variant="ghost"
                    size="icon-sm"
                    render={
                        <Link href={workspaceRoutes.settings(workspace.id)} />
                    }
                >
                    <SettingsIcon />
                    <span className="sr-only">Notebook settings</span>
                </Button>
            ) : null}

            <ShareDialog
                workspaceId={workspace.id}
                notebookTitle={workspace.title}
                open={shareOpen}
                onOpenChange={setShareOpen}
            />
        </div>
    );
}
