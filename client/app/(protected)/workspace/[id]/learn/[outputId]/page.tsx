import { permanentRedirect } from "next/navigation";
import { studioRoutes } from "@/features/studio";

type LearnOutputPageProps = {
    params: Promise<{ id: string; outputId: string }>;
};

/** Learn became Studio in Phase 7. Existing output links keep working. */
export default async function LearnOutputPage({
    params,
}: LearnOutputPageProps) {
    const { id, outputId } = await params;
    permanentRedirect(studioRoutes.detail(id, outputId));
}
