import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Keyboard, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Welle 6 — Keyboard Shortcut Overlay.
 * Triggered by pressing `?` (or via a toolbar button) inside the editor.
 */

interface Shortcut {
  keys: string[];
  label: string;
  category: 'Playback' | 'Editing' | 'Selection' | 'Navigation';
}

const SHORTCUTS: Shortcut[] = [
  // Playback
  { keys: ['Space'], label: 'Play / Pause', category: 'Playback' },
  { keys: ['J'], label: 'Rückwärts (Shuttle)', category: 'Playback' },
  { keys: ['K'], label: 'Pause', category: 'Playback' },
  { keys: ['L'], label: 'Vorwärts (Shuttle)', category: 'Playback' },
  { keys: ['←'], label: '1 Frame zurück', category: 'Playback' },
  { keys: ['→'], label: '1 Frame vor', category: 'Playback' },
  { keys: ['⇧', '←'], label: '1 Sekunde zurück', category: 'Playback' },
  { keys: ['⇧', '→'], label: '1 Sekunde vor', category: 'Playback' },
  { keys: ['Home'], label: 'Zum Anfang', category: 'Playback' },
  { keys: ['End'], label: 'Zum Ende', category: 'Playback' },

  // Editing
  { keys: ['S'], label: 'Am Playhead teilen (Split)', category: 'Editing' },
  { keys: ['Delete'], label: 'Ripple Delete (Lücke schließen)', category: 'Editing' },
  { keys: ['⌥', 'Delete'], label: 'Delete (Lücke bleibt)', category: 'Editing' },
  { keys: ['⌘', 'Z'], label: 'Rückgängig', category: 'Editing' },
  { keys: ['⌘', '⇧', 'Z'], label: 'Wiederherstellen', category: 'Editing' },
  { keys: ['⌘', 'D'], label: 'Duplizieren', category: 'Editing' },
  { keys: ['I'], label: 'In-Marker setzen', category: 'Editing' },
  { keys: ['O'], label: 'Out-Marker setzen', category: 'Editing' },

  // Selection
  { keys: ['⌘', 'A'], label: 'Alles auswählen', category: 'Selection' },
  { keys: ['⇧', 'Klick'], label: 'Range-Select', category: 'Selection' },
  { keys: ['⌘', 'Klick'], label: 'Zur Auswahl hinzufügen', category: 'Selection' },
  { keys: ['Esc'], label: 'Auswahl aufheben', category: 'Selection' },

  // Navigation
  { keys: ['?'], label: 'Diese Übersicht öffnen', category: 'Navigation' },
  { keys: ['+', '−'], label: 'Timeline-Zoom', category: 'Navigation' },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ShortcutOverlay: React.FC<Props> = ({ open, onOpenChange }) => {
  const [query, setQuery] = useState('');

  const grouped = useMemo(() => {
    const filtered = SHORTCUTS.filter(
      (s) =>
        !query ||
        s.label.toLowerCase().includes(query.toLowerCase()) ||
        s.keys.join('').toLowerCase().includes(query.toLowerCase()),
    );
    const groups: Record<string, Shortcut[]> = {};
    for (const s of filtered) {
      (groups[s.category] ??= []).push(s);
    }
    return groups;
  }, [query]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-[#0a0a1a]/95 backdrop-blur-xl border-[#F5C76A]/20 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#F5C76A]">
            <Keyboard className="h-5 w-5" />
            Tastatur-Shortcuts
          </DialogTitle>
          <DialogDescription className="text-white/50">
            Pro-Editing Shortcuts für den Universal Cut. Drücke <kbd className="px-1 border border-white/20 rounded text-[10px]">?</kbd> jederzeit, um diese Übersicht zu öffnen.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
          <Input
            autoFocus
            placeholder="Shortcut suchen …"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-[#F5C76A]/30"
          />
        </div>

        <div className="max-h-[60vh] overflow-y-auto pr-2 space-y-5">
          {Object.entries(grouped).map(([category, items]) => (
            <section key={category}>
              <h3 className="text-[11px] uppercase tracking-widest text-[#F5C76A]/70 font-semibold mb-2">
                {category}
              </h3>
              <ul className="space-y-1">
                {items.map((s, i) => (
                  <li
                    key={`${category}-${i}`}
                    className={cn(
                      'flex items-center justify-between px-3 py-2 rounded-md',
                      'bg-white/[0.03] hover:bg-white/[0.06] transition-colors border border-white/5',
                    )}
                  >
                    <span className="text-sm text-white/80">{s.label}</span>
                    <div className="flex items-center gap-1">
                      {s.keys.map((k, ki) => (
                        <React.Fragment key={ki}>
                          {ki > 0 && <span className="text-white/30 text-xs">+</span>}
                          <kbd className="min-w-[26px] px-2 py-0.5 text-[11px] font-mono text-cyan-200 bg-cyan-500/10 border border-cyan-500/30 rounded">
                            {k}
                          </kbd>
                        </React.Fragment>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {Object.keys(grouped).length === 0 && (
            <p className="text-center text-sm text-white/40 py-8">Keine Treffer.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
