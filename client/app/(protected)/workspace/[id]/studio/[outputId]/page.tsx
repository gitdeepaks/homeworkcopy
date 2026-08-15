import { notFound } from "next/navigation";
import { requireAuth } from "@/features/auth";
import { OutputDetail } from "@/features/studio";
import { getWorkspaceOrNull } from "@/features/workspaces/lib/workspace-server";
import { WorkspaceShell } from "@/features/workspaces";

type OutputPageProps = {
    params: Promise<{ id: string; outputId: string }>;
};

export default async function OutputPage({ params }: OutputPageProps) {
    await requireAuth();
    const { id, outputId } = await params;
    const workspace = await getWorkspaceOrNull(id);

    if (!workspace) {
        notFound();
    }

    return (
        <WorkspaceShell workspace={workspace}>
            <OutputDetail workspaceId={workspace.id} outputId={outputId} />
        </WorkspaceShell>
    );
}
