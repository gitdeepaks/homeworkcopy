"use client";

import type { NotebookMember, NotebookMemberRole } from "@homeworkcopy/contracts";
import { CrownIcon, Trash2Icon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    NativeSelect,
    NativeSelectOption,
} from "@/components/ui/native-select";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "../lib/permissions";

type MemberListProps = {
    members: NotebookMember[];
    /** Whether the reader may change roles and remove people. */
    canManage: boolean;
    /** The reader, so their own row can be marked and left alone. */
    currentUserId: string;
    pendingUserId: string | null;
    onChangeRole: (userId: string, role: NotebookMemberRole) => void;
    onRemove: (member: NotebookMember) => void;
    onTransfer: (member: NotebookMember) => void;
};

function initials(name: string): string {
    const parts = name.trim().split(/\s+/).slice(0, 2);
    const letters = parts.map((part) => part[0] ?? "").join("");
    return letters.toUpperCase() || "?";
}

/**
 * Who can reach this notebook, and at what level.
 *
 * Roles are shown as text and changed through a real `<select>`, so the control
 * is keyboard operable, screen-reader announced, and usable on a phone without
 * any custom key handling.
 */
export function MemberList({
    members,
    canManage,
    currentUserId,
    pendingUserId,
    onChangeRole,
    onRemove,
    onTransfer,
}: MemberListProps) {
    return (
        <ul className="divide-y rounded-md border">
            {members.map((member) => {
                const isOwner = member.role === "OWNER";
                const isSelf = member.userId === currentUserId;
                const busy = pendingUserId === member.userId;

                return (
                    <li
                        key={member.userId}
                        className="flex flex-wrap items-center gap-3 p-3"
                    >
                        <Avatar className="size-9">
                            {member.image ? (
                                <AvatarImage src={member.image} alt="" />
                            ) : null}
                            <AvatarFallback>
                                {initials(member.name)}
                            </AvatarFallback>
                        </Avatar>

                        <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                                {member.name}
                                {isSelf ? (
                                    <span className="ml-1 text-muted-foreground">
                                        (you)
                                    </span>
                                ) : null}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                                {member.email}
                            </p>
                        </div>

                        {isOwner ? (
                            <Badge variant="secondary" className="gap-1">
                                <CrownIcon aria-hidden className="size-3" />
                                {ROLE_LABELS.OWNER}
                            </Badge>
                        ) : canManage ? (
                            <NativeSelect
                                className="w-32"
                                aria-label={`Role for ${member.name}`}
                                value={member.role}
                                disabled={busy}
                                onChange={(event) => {
                                    const next = event.target.value;
                                    // The options are a fixed pair; anything
                                    // else is not a role this control offers.
                                    if (next === "EDITOR" || next === "VIEWER") {
                                        onChangeRole(member.userId, next);
                                    }
                                }}
                            >
                                <NativeSelectOption value="EDITOR">
                                    {ROLE_LABELS.EDITOR}
                                </NativeSelectOption>
                                <NativeSelectOption value="VIEWER">
                                    {ROLE_LABELS.VIEWER}
                                </NativeSelectOption>
                            </NativeSelect>
                        ) : (
                            <Badge variant="outline">
                                {ROLE_LABELS[member.role]}
                            </Badge>
                        )}

                        {canManage && !isOwner ? (
                            <div className="flex items-center gap-1">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="min-h-11"
                                    disabled={busy}
                                    onClick={() => onTransfer(member)}
                                >
                                    Make owner
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    className="size-11 text-destructive"
                                    disabled={busy}
                                    onClick={() => onRemove(member)}
                                >
                                    <Trash2Icon aria-hidden />
                                    <span className="sr-only">
                                        Remove {member.name}
                                    </span>
                                </Button>
                            </div>
                        ) : null}

                        <p className="w-full text-xs text-muted-foreground">
                            {ROLE_DESCRIPTIONS[member.role]}
                        </p>
                    </li>
                );
            })}
        </ul>
    );
}
