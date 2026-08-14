"use client";

import {
    createContext,
    useContext,
    useEffect,
    useState,
    type ReactNode,
} from "react";

export type Theme = "light" | "dark" | "system";
type ResolvedTheme = Exclude<Theme, "system">;

type ThemeContextValue = {
    theme: Theme | undefined;
    resolvedTheme: ResolvedTheme | undefined;
    setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const THEME_STORAGE_KEY = "theme";

function isTheme(value: string | null): value is Theme {
    return value === "light" || value === "dark" || value === "system";
}

function resolveTheme(theme: Theme): ResolvedTheme {
    if (theme !== "system") return theme;
    return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
}

function applyTheme(theme: Theme): ResolvedTheme {
    const resolved = resolveTheme(theme);
    document.documentElement.classList.toggle("dark", resolved === "dark");
    document.documentElement.style.colorScheme = resolved;
    return resolved;
}

type ThemeProviderProps = {
    children: ReactNode;
    defaultTheme?: Theme;
};

export function ThemeProvider({
    children,
    defaultTheme = "system",
}: ThemeProviderProps) {
    const [theme, setThemeState] = useState<Theme>();
    const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>();

    useEffect(() => {
        const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
        const initialTheme = isTheme(storedTheme) ? storedTheme : defaultTheme;
        setThemeState(initialTheme);
        setResolvedTheme(applyTheme(initialTheme));

        const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
        const handleSystemChange = () => {
            const currentTheme = localStorage.getItem(THEME_STORAGE_KEY);
            if (currentTheme === "system" || !isTheme(currentTheme)) {
                setResolvedTheme(applyTheme("system"));
            }
        };
        mediaQuery.addEventListener("change", handleSystemChange);
        return () => mediaQuery.removeEventListener("change", handleSystemChange);
    }, [defaultTheme]);

    function setTheme(nextTheme: Theme) {
        localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
        setThemeState(nextTheme);
        setResolvedTheme(applyTheme(nextTheme));
    }

    return (
        <ThemeContext value={{ theme, resolvedTheme, setTheme }}>
            {children}
        </ThemeContext>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error("useTheme must be used within ThemeProvider");
    }
    return context;
}
