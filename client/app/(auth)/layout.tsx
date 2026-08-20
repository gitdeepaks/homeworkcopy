import Link from "next/link";

/**
 * What the product commits to, stated as numbered clauses.
 *
 * Sign-in is the one screen every reader passes through, so it carries the
 * three constraints the product is actually built on rather than feature bullets.
 */
const CLAUSES = [
    {
        number: "i",
        text: "Only the sources you add can answer you.",
    },
    {
        number: "ii",
        text: "Every citation opens the page, chunk, or timestamp behind it.",
    },
    {
        number: "iii",
        text: "External processors stay off until you turn them on.",
    },
] as const;

export default function AuthLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <main
            id="main-content"
            className="auth-desk relative isolate flex min-h-svh items-center justify-center overflow-hidden p-4 sm:p-6 lg:p-10"
        >
            <section className="auth-notebook relative grid w-full max-w-5xl overflow-hidden rounded-sm border border-hairline lg:min-h-[min(660px,calc(100svh-5rem))] lg:grid-cols-2">
                {/* The imprint page. Hidden on small screens, where the only
                    thing worth showing is the button that signs you in. */}
                <div className="auth-notebook-copy relative hidden flex-col justify-between border-r border-hairline px-12 py-11 lg:flex">
                    <div>
                        <Link
                            href="/"
                            className="marginalia press-underline inline-block text-ink"
                        >
                            Homeworkcopy
                        </Link>

                        <h1 className="mt-16 font-display text-[3.5rem] leading-[0.9] font-semibold tracking-[-0.03em]">
                            Turn sources
                            <br />
                            into
                            <br />
                            <span className="text-primary italic">
                                understanding
                            </span>
                        </h1>

                        <ol className="mt-14 space-y-5">
                            {CLAUSES.map((clause) => (
                                <li
                                    key={clause.number}
                                    className="flex gap-3 border-t border-ink/10 pt-4"
                                >
                                    {/* Fixed width: the numerals differ in
                                        width, and a hanging indent only reads
                                        as one if the text starts in a column. */}
                                    <span className="w-6 shrink-0 pt-0.5 font-mono text-xs tracking-widest text-primary">
                                        {clause.number}
                                    </span>
                                    <span className="text-sm leading-relaxed text-graphite">
                                        {clause.text}
                                    </span>
                                </li>
                            ))}
                        </ol>
                    </div>

                    <p className="marginalia">
                        Sources · Chat · Studio
                    </p>
                </div>

                {/* The signing sheet. */}
                <div className="relative flex items-center justify-center bg-paper px-6 py-14 sm:px-12 lg:px-14">
                    <p
                        aria-hidden="true"
                        className="marginalia absolute top-7 right-8 hidden lg:block"
                    >
                        <span className="text-primary">§</span> Sign in
                    </p>
                    <div className="w-full max-w-sm">{children}</div>
                </div>
            </section>
        </main>
    );
}
