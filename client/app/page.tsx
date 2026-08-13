import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { authRoutes, getSession } from "@/features/auth";
import { BookOpenCheckIcon, HighlighterIcon, MessageSquareTextIcon } from "lucide-react";

export default async function HomePage() {
    const session = await getSession();

    if (session) {
        redirect(authRoutes.dashboard);
    }

    return (
        <main
            id="main-content"
            className="notebook-canvas flex min-h-svh items-center justify-center p-4 sm:p-8"
        >
            <section className="ruled-paper relative w-full max-w-5xl overflow-hidden rounded-md px-8 py-16 sm:px-20 lg:px-28">
                <span className="absolute top-0 left-10 h-full w-px bg-margin-line sm:left-14" aria-hidden="true" />
                <div className="relative mx-auto max-w-3xl">
                    <p className="mb-2 font-heading text-2xl text-primary">
                        Your thinking belongs on paper.
                    </p>
                    <h1 className="font-heading text-6xl font-bold tracking-tight sm:text-7xl">
                        Homeworkcopy
                    </h1>
                    <p className="mt-5 max-w-2xl text-lg leading-7 text-graphite sm:text-xl">
                        Gather trusted sources, ask grounded questions, and turn
                        what you learn into useful study outputs.
                    </p>
                    <div className="mt-8 flex flex-wrap gap-3 text-sm font-semibold">
                        <span className="paper-tab inline-flex items-center gap-2 rounded-r-md px-3 py-2">
                            <BookOpenCheckIcon className="size-4" /> Sources
                        </span>
                        <span className="paper-tab inline-flex items-center gap-2 rounded-r-md px-3 py-2">
                            <MessageSquareTextIcon className="size-4" /> Chat
                        </span>
                        <span className="paper-tab inline-flex items-center gap-2 rounded-r-md px-3 py-2">
                            <HighlighterIcon className="size-4" /> Studio
                        </span>
                    </div>
                    <Button
                        nativeButton={false}
                        size="lg"
                        className="mt-10 min-h-11 shadow-md"
                        render={<Link href={authRoutes.login} />}
                    >
                        Open your notebook
                    </Button>
                </div>
            </section>
        </main>
    );
}
