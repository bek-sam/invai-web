import { cn } from "@invai/ui";
import { Link } from "@tanstack/react-router";
import type * as React from "react";
import { useTranslation } from "react-i18next";
import { type Lang, setLang } from "../i18n";

/**
 * Chrome for the public help and legal pages (T-21-5). These routes sit outside `/_app` -- they
 * must render for a signed-out visitor reading the Terms before creating an account -- so this
 * is a small header of its own rather than `AppFrame`, which requires a signed-in `me`.
 */
export function PublicContentLayout({
  children,
  wide = false,
}: {
  children: React.ReactNode;
  wide?: boolean;
}) {
  const { i18n } = useTranslation();
  const lang = i18n.language.startsWith("es") ? "es" : "en";
  return (
    <div className="min-h-dvh bg-background">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6">
        <Link to="/" className="flex items-center gap-2 font-semibold">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
            In
          </span>
          <span>InvAI</span>
        </Link>
        <LanguageToggle lang={lang} />
      </header>
      <main className={cn("mx-auto w-full px-4 py-8 sm:px-6", wide ? "max-w-3xl" : "max-w-2xl")}>
        {children}
      </main>
    </div>
  );
}

function LanguageToggle({ lang }: { lang: Lang }) {
  return (
    <div className="flex items-center gap-1 text-sm">
      <LangButton lang="en" active={lang === "en"} label="English" />
      <span className="text-muted-foreground" aria-hidden>
        ·
      </span>
      <LangButton lang="es" active={lang === "es"} label="Español" />
    </div>
  );
}

function LangButton({ lang, active, label }: { lang: Lang; active: boolean; label: string }) {
  return (
    <button
      type="button"
      onClick={() => void setLang(lang)}
      aria-pressed={active}
      className={cn(
        "rounded px-1.5 py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}
