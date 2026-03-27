

## Fix: PlatformBadge sauber gegen unbekannte Plattformen absichern

### Ursache
Die KI im Onboarding kann beliebige Plattform-Strings zurückgeben (z.B. `"youtube"`, `"YouTube"`, `"Twitter"` statt `"twitter"`). `PlatformBadge` kennt nur 5 Plattformen und crasht bei allem anderen.

### Saubere Lösung

**`src/components/ui/PlatformBadge.tsx`**

1. **YouTube zur Config hinzufügen** — YouTube ist eine unterstützte Plattform in der App (siehe `SocialMediaSettings.tsx`), fehlt aber in der Badge-Komponente
2. **Normalisierung verbessern** — Eingabe lowercase + bekannte Aliase mappen (`"twitter"` → `"x"`, `"Youtube"` → `"youtube"`)
3. **Bei unbekannter Plattform `null` zurückgeben** statt zu crashen — kein Badge statt Crash
4. **Type erweitern** um `youtube`

```tsx
import { Instagram, Music, Linkedin, Facebook, Twitter, Youtube, Globe } from "lucide-react";

const platformConfig = {
  instagram: { icon: Instagram, color: 'text-pink-500', name: 'Instagram' },
  tiktok: { icon: Music, color: 'text-foreground', name: 'TikTok' },
  linkedin: { icon: Linkedin, color: 'text-blue-700 dark:text-blue-500', name: 'LinkedIn' },
  facebook: { icon: Facebook, color: 'text-blue-600 dark:text-blue-500', name: 'Facebook' },
  x: { icon: Twitter, color: 'text-foreground', name: 'X' },
  youtube: { icon: Youtube, color: 'text-red-600', name: 'YouTube' },
};

const aliases: Record<string, string> = { twitter: 'x' };

export function PlatformBadge({ platform }: { platform: string }) {
  const key = aliases[platform.toLowerCase()] || platform.toLowerCase();
  const config = platformConfig[key as keyof typeof platformConfig];
  if (!config) return null; // Unbekannte Plattform → kein Badge, kein Crash
  // ... render
}
```

### Was sich ändert
- YouTube-Badge wird unterstützt
- Beliebige Groß-/Kleinschreibung funktioniert
- Unbekannte Plattformen werden ignoriert statt die App zu crashen
- Kein `as any` Cast mehr nötig an den Aufrufstellen

### Dateien
- `src/components/ui/PlatformBadge.tsx` — einzige Änderung

