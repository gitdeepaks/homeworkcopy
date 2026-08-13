import { BookOpenIcon, CheckIcon, MessageSquareTextIcon, SparklesIcon } from "lucide-react";

export default function AuthLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <main
            id="main-content"
            className="auth-desk relative isolate flex min-h-svh items-center justify-center overflow-hidden p-3 sm:p-6 lg:p-10"
        >
            <section className="auth-notebook relative grid min-h-[min(680px,calc(100svh-1.5rem))] w-full max-w-6xl overflow-hidden rounded-md border border-border lg:grid-cols-2">
                <div className="auth-notebook-copy relative hidden flex-col justify-between overflow-hidden border-r border-border/70 px-14 py-12 lg:flex">
                    <div>
                        <div className="mb-14 flex items-center gap-3 font-heading text-3xl font-bold text-primary">
                            <span className="flex size-11 items-center justify-center rounded-sm bg-sticky-yellow text-2xl shadow-sm">
                                H
                            </span>
                            Homeworkcopy
                        </div>
                        <p className="font-heading text-2xl text-primary">
                            Today&apos;s study plan
                        </p>
                        <h1 className="mt-2 max-w-md font-heading text-6xl font-bold leading-[0.95] tracking-tight">
                            Turn sources into understanding.
                        </h1>
                        <ul className="mt-10 space-y-4 text-base text-graphite">
                            <li className="flex items-center gap-3">
                                <CheckIcon className="size-5 text-primary" strokeWidth={3} />
                                Add trusted reading material
                            </li>
                            <li className="flex items-center gap-3">
                                <CheckIcon className="size-5 text-primary" strokeWidth={3} />
                                Ask questions with citations
                            </li>
                            <li className="flex items-center gap-3">
                                <CheckIcon className="size-5 text-primary" strokeWidth={3} />
                                Create useful study outputs
                            </li>
                        </ul>
                    </div>
                    <div className="flex gap-3" aria-hidden="true">
                        <span className="paper-tab flex items-center gap-2 rounded-r-md px-3 py-2 text-sm font-semibold">
                            <BookOpenIcon className="size-4" /> Sources
                        </span>
                        <span className="paper-tab flex items-center gap-2 rounded-r-md px-3 py-2 text-sm font-semibold">
                            <MessageSquareTextIcon className="size-4" /> Chat
                        </span>
                        <span className="paper-tab flex items-center gap-2 rounded-r-md px-3 py-2 text-sm font-semibold">
                            <SparklesIcon className="size-4" /> Studio
                        </span>
                    </div>
                </div>

                <div className="relative flex items-center justify-center px-5 py-10 sm:px-12 lg:px-16">
                    <span className="absolute top-0 right-8 rounded-b-sm bg-sticky-coral px-4 py-2 font-heading text-lg font-bold text-foreground shadow-sm sm:right-14">
                        Sign in
                    </span>
                    <div className="absolute inset-y-0 left-0 hidden w-8 -translate-x-1/2 bg-linear-to-r from-transparent via-foreground/8 to-transparent lg:block" aria-hidden="true" />
                    <div className="w-full max-w-md">{children}</div>
                </div>
            </section>
        </main>
    );
}
