import { permanentRedirect } from "next/navigation";
import { studioRoutes } from "@/features/studio";

type LearnPageProps = {
    params: Promise<{ id: string }>;
};

/** Learn became Studio in Phase 7. Existing links keep working. */
export default async function LearnPage({ params }: LearnPageProps) {
    const { id } = await params;
    permanentRedirect(studioRoutes.hub(id));
}
