import { notFound } from "next/navigation";
import { requireAuth } from "@/features/auth";
import { StudioHub } from "@/features/studio";
import { getWorkspaceOrNull } from "@/features/workspaces/lib/workspace-server";
import { WorkspaceShell } from "@/features/workspaces";

type StudioPageProps = {
    params: Promise<{ id: string }>;
};

export default async function StudioPage({ params }: StudioPageProps) {
    await requireAuth();
    const { id } = await params;
    const workspace = await getWorkspaceOrNull(id);

    if (!workspace) {
        notFound();
    }

    return (
        <WorkspaceShell workspace={workspace}>
            <StudioHub workspaceId={workspace.id} />
        </WorkspaceShell>
    );
}
