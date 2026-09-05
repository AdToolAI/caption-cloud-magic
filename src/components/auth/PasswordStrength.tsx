import { Check, X } from "lucide-react";
import { tx } from "@/lib/i18nText";

export const PASSWORD_MIN_LENGTH = 8;

export interface PasswordRule {
  id: string;
  label: string;
  met: boolean;
}

export function evaluatePassword(password: string): { rules: PasswordRule[]; score: number; valid: boolean } {
  const rules: PasswordRule[] = [
    {
      id: "length",
      label: tx({
        de: `Mindestens ${PASSWORD_MIN_LENGTH} Zeichen`,
        en: `At least ${PASSWORD_MIN_LENGTH} characters`,
        es: `Al menos ${PASSWORD_MIN_LENGTH} caracteres`,
      }),
      met: password.length >= PASSWORD_MIN_LENGTH,
    },
    {
      id: "letters",
      label: tx({
        de: "Enthält Buchstaben",
        en: "Contains letters",
        es: "Contiene letras",
      }),
      met: /\p{L}/u.test(password),
    },
    {
      id: "number-or-symbol",
      label: tx({
        de: "Enthält eine Zahl oder ein Sonderzeichen",
        en: "Contains a number or symbol",
        es: "Contiene un número o símbolo",
      }),
      met: /[\d\W_]/.test(password),
    },
  ];

  // Strength is informational only — the first three rules decide validity.
  let score = 0;
  if (password.length >= PASSWORD_MIN_LENGTH) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password) && /[\W_]/.test(password)) score += 1;

  return { rules, score, valid: rules.every((r) => r.met) };
}

const STRENGTH_LABELS = () => [
  tx({ de: "Sehr schwach", en: "Very weak", es: "Muy débil" }),
  tx({ de: "Schwach", en: "Weak", es: "Débil" }),
  tx({ de: "Solide", en: "Decent", es: "Aceptable" }),
  tx({ de: "Stark", en: "Strong", es: "Fuerte" }),
  tx({ de: "Sehr stark", en: "Very strong", es: "Muy fuerte" }),
];

export const PasswordStrength = ({ password }: { password: string }) => {
  if (!password) return null;

  const { rules, score } = evaluatePassword(password);
  const labels = STRENGTH_LABELS();

  return (
    <div className="space-y-2 pt-1" aria-live="polite">
      <div className="flex items-center gap-2">
        <div className="flex h-1.5 flex-1 gap-1">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`h-full flex-1 rounded-full transition-colors ${
                i < score
                  ? score <= 1
                    ? "bg-destructive"
                    : score === 2
                      ? "bg-warning"
                      : "bg-primary"
                  : "bg-muted"
              }`}
            />
          ))}
        </div>
        <span className="text-xs text-muted-foreground">{labels[score]}</span>
      </div>
      <ul className="space-y-1">
        {rules.map((rule) => (
          <li
            key={rule.id}
            className={`flex items-center gap-1.5 text-xs ${
              rule.met ? "text-muted-foreground" : "text-muted-foreground/70"
            }`}
          >
            {rule.met ? (
              <Check className="h-3 w-3 text-primary" aria-hidden="true" />
            ) : (
              <X className="h-3 w-3 opacity-60" aria-hidden="true" />
            )}
            {rule.label}
          </li>
        ))}
      </ul>
    </div>
  );
};
