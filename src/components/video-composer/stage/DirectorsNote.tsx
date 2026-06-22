import type { ReactNode } from "react";

interface DirectorsNoteProps {
  label?: string;
  children: ReactNode;
  className?: string;
}

/**
 * DirectorsNote — italic Playfair quote with a left gold rail.
 * Replaces the generic "Pro-Tipp" banner with a cinematic note from the director.
 */
export default function DirectorsNote({
  label = "DIRECTOR'S NOTE",
  children,
  className = "",
}: DirectorsNoteProps) {
  return (
    <aside
      className={`relative rounded-lg bg-[hsl(43_90%_68%/0.04)] pl-5 pr-4 py-3 ${className}`}
    >
      <span
        aria-hidden
        className="absolute left-0 top-2 bottom-2 w-[2px] rounded-full"
        style={{
          background:
            "linear-gradient(180deg, hsla(43,90%,68%,0.85), hsla(43,90%,68%,0.15))",
          boxShadow: "0 0 8px hsla(43,90%,68%,0.4)",
        }}
      />
      <p className="font-mono text-[9px] uppercase tracking-[0.35em] text-amber-200/80">
        {label}
      </p>
      <div
        className="mt-1.5 text-sm leading-relaxed text-amber-50/85 italic"
        style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
      >
        {children}
      </div>
    </aside>
  );
}
