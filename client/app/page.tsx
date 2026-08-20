import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { authRoutes, getSession } from "@/features/auth";

/**
 * The three things the product does, set as an index rather than a card grid.
 * Numbered because an index is numbered, and because three boxes in a row is
 * the one layout every landing page already has.
 */
const INDEX = [
    {
        number: "01",
        title: "Collect",
        body: "PDFs, recordings, websites, YouTube, and pasted notes are ingested into one notebook, with every stage of processing visible.",
    },
    {
        number: "02",
        title: "Interrogate",
        body: "Ask questions answered only from the sources you selected. Nothing else enters the context — not the web, not the model's memory.",
    },
    {
        number: "03",
        title: "Publish",
        body: "Fourteen study outputs generated from the same grounded material: flashcards, quizzes, mind maps, briefings, audio overviews.",
    },
] as const;

export default async function HomePage() {
    const session = await getSession();

    if (session) {
        redirect(authRoutes.dashboard);
    }

    return (
        <main
            id="main-content"
            className="notebook-canvas min-h-svh px-5 pb-20 sm:px-8 lg:px-12"
        >
            {/* Masthead. A press names itself in a rule across the top of the
                page, not in a floating pill. */}
            <header className="mx-auto flex max-w-[84rem] items-baseline justify-between gap-6 border-b border-hairline py-5">
                <p className="marginalia">Homeworkcopy</p>
                <p className="marginalia hidden sm:block">
                    Source-grounded research notebook
                </p>
                <Link
                    href={authRoutes.login}
                    className="marginalia press-underline text-ink"
                >
                    Sign in
                </Link>
            </header>

            <div className="stagger mx-auto max-w-[84rem]" style={{ "--stagger-step": "90ms" }}>
                {/* Hero. The headline is set large enough to be a texture in its
                    own right; the specimen beside it proves the claim instead of
                    repeating it. */}
                <section
                    className="grid gap-12 pt-14 pb-16 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16 lg:pt-24 lg:pb-24"
                >
                    <div>
                        <p className="marginalia mb-7">
                            <span className="text-primary">§</span> Est. for
                            coursework you have to defend
                        </p>

                        <h1 className="font-display text-[clamp(3.25rem,9vw,7.5rem)] leading-[0.86] font-semibold tracking-[-0.035em]">
                            Answers
                            <br />
                            you can
                            <br />
                            <span className="italic" style={{ fontVariationSettings: '"WONK" 1, "SOFT" 30' }}>
                                check
                            </span>
                            <span className="text-primary">.</span>
                        </h1>

                        <div className="mt-10 flex max-w-xl flex-col gap-8 sm:flex-row sm:items-end">
                            <p className="text-lg leading-relaxed text-graphite">
                                Add the sources you trust. Ask against them. Every
                                sentence comes back with a citation that opens the
                                exact page, chunk, or timestamp behind it.
                            </p>
                        </div>

                        <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-4">
                            <Button
                                nativeButton={false}
                                size="lg"
                                className="group min-h-12 gap-2.5 px-7 text-base"
                                render={<Link href={authRoutes.login} />}
                            >
                                Open a notebook
                                <ArrowRightIcon className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
                            </Button>
                            <p className="marginalia">
                                Free while you are studying
                            </p>
                        </div>
                    </div>

                    {/* The specimen: one cited answer, rendered the way the app
                        renders it. Decorative here, so it is hidden from the
                        accessibility tree rather than read aloud out of context. */}
                    <div
                        aria-hidden="true"
                        className="relative hidden select-none lg:block"
                    >
                        <div className="ruled-paper absolute inset-0 -rotate-[1.4deg] rounded-sm border border-hairline" />
                        <div className="paper-sheet relative rotate-[0.6deg] rounded-sm p-8">
                            <p className="marginalia running-head mb-6">
                                Answer · Thermodynamics
                            </p>
                            <p className="drop-cap font-display text-[1.35rem] leading-[1.55]">
                                Entropy in an isolated system never decreases,
                                which is why the arrow of time has a direction at
                                all
                                <sup className="ml-0.5 font-sans text-[0.6em] font-semibold text-primary">
                                    1
                                </sup>
                                . The statistical reading is stronger still: there
                                are simply far more disordered arrangements than
                                ordered ones
                                <sup className="ml-0.5 font-sans text-[0.6em] font-semibold text-primary">
                                    2
                                </sup>
                                .
                            </p>

                            <div className="mt-7 space-y-2.5 border-t border-hairline pt-5">
                                {[
                                    { n: "1", src: "Callen, Thermodynamics", loc: "p. 27" },
                                    { n: "2", src: "MIT 8.333 — Lecture 4", loc: "12:04" },
                                ].map((citation) => (
                                    <p
                                        key={citation.n}
                                        className="flex items-baseline gap-3 font-mono text-[0.72rem] text-graphite"
                                    >
                                        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/12 text-[0.65rem] font-semibold text-primary">
                                            {citation.n}
                                        </span>
                                        <span className="truncate text-ink">
                                            {citation.src}
                                        </span>
                                        <span className="ml-auto shrink-0 tabular-nums">
                                            {citation.loc}
                                        </span>
                                    </p>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>

                {/* Index of what the product does. Rules, not boxes. */}
                <section
                    className="border-t border-hairline pt-14"
                >
                    <h2 className="marginalia running-head mb-10">Contents</h2>
                    <ol className="grid gap-x-12 gap-y-10 md:grid-cols-3">
                        {INDEX.map((entry) => (
                            <li
                                key={entry.number}
                                className="group border-t border-ink/12 pt-5"
                            >
                                <p className="font-mono text-xs font-medium tracking-widest text-primary">
                                    {entry.number}
                                </p>
                                <h3 className="mt-3 font-display text-3xl font-semibold tracking-tight">
                                    {entry.title}
                                </h3>
                                <p className="mt-3 text-sm leading-relaxed text-graphite">
                                    {entry.body}
                                </p>
                            </li>
                        ))}
                    </ol>
                </section>

                {/* Colophon. The constraints are the product, so they get stated
                    plainly at the foot of the page. */}
                <section
                    className="mt-20 border-t border-hairline pt-8"
                >
                    <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
                        <p className="marginalia max-w-md leading-relaxed">
                            Retrieval is scoped to one notebook. Half-processed
                            sources stay out. External processors are opt-in.
                        </p>
                        <Link
                            href={authRoutes.login}
                            className="font-display text-2xl font-semibold press-underline"
                        >
                            Start reading →
                        </Link>
                    </div>
                </section>
            </div>
        </main>
    );
}
