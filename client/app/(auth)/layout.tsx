export default function AuthLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <main
            id="main-content"
            className="notebook-canvas flex min-h-svh flex-col items-center justify-center p-4 md:p-10"
        >
            <div className="w-full max-w-md">{children}</div>
        </main>
    );
}
