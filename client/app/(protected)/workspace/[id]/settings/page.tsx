import { notFound } from "next/navigation";
import { requireAuth } from "@/features/auth";
import { getWorkspaceOrNull } from "@/features/workspaces/lib/workspace-server";
import { WorkspaceShell } from "@/features/workspaces";
import { WorkspaceSettingsForm } from "@/features/workspaces/components/workspace-settings-form";

type WorkspaceSettingsPageProps = {
    params: Promise<{ id: string }>;
};

export default async function WorkspaceSettingsPage({
    params,
}: WorkspaceSettingsPageProps) {
    await requireAuth();
    const { id } = await params;
    const workspace = await getWorkspaceOrNull(id);

    if (!workspace) {
        notFound();
    }

    // Settings are the owner's: renaming and deleting decide what the notebook
    // is for everyone in it. A collaborator following a stale link is told the
    // page is not theirs rather than shown a form the server would refuse.
    if (workspace.role !== "OWNER") {
        notFound();
    }

    return (
        <WorkspaceShell workspace={workspace}>
            <WorkspaceSettingsForm workspace={workspace} />
        </WorkspaceShell>
    );
}
