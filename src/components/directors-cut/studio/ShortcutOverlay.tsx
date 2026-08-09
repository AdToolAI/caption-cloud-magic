import { tx } from "@/lib/i18nText";
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
  { keys: ['Space'], label: tx({ de: 'Play / Pause', en: 'Play / Pause', es: 'Reproducir / Pausa' }), category: 'Playback' },
  { keys: ['J'], label: tx({ de: 'Rückwärts (Shuttle)', en: 'Reverse (Shuttle)', es: 'Retroceder (Shuttle)' }), category: 'Playback' },
  { keys: ['K'], label: tx({ de: 'Pause', en: 'Pause', es: 'Pausa' }), category: 'Playback' },
  { keys: ['L'], label: tx({ de: 'Vorwärts (Shuttle)', en: 'Forward (Shuttle)', es: 'Avanzar (Shuttle)' }), category: 'Playback' },
  { keys: ['←'], label: tx({ de: '1 Frame zurück', en: '1 frame back', es: '1 fotograma atrás' }), category: 'Playback' },
  { keys: ['→'], label: tx({ de: '1 Frame vor', en: '1 frame forward', es: '1 fotograma adelante' }), category: 'Playback' },
  { keys: ['⇧', '←'], label: tx({ de: '1 Sekunde zurück', en: '1 second back', es: '1 segundo atrás' }), category: 'Playback' },
  { keys: ['⇧', '→'], label: '1 Sekunde vor', category: 'Playback' },
  { keys: ['Home'], label: tx({ de: 'Zum Anfang', en: 'To beginning', es: 'Al principio' }), category: 'Playback' },
  { keys: ['End'], label: tx({ de: 'Zum Ende', en: 'To end', es: 'Al final' }), category: 'Playback' },

  // Editing
  { keys: ['S'], label: tx({ de: 'Am Playhead teilen (Split)', en: 'Split at playhead', es: 'Dividir en el cabezal de reproducción' }), category: 'Editing' },
  { keys: ['Delete'], label: tx({ de: 'Ripple Delete (Lücke schließen)', en: 'Ripple delete (close gap)', es: 'Eliminación con desplazamiento (cerrar hueco)' }), category: 'Editing' },
  { keys: ['⌥', 'Delete'], label: tx({ de: 'Delete (Lücke bleibt)', en: 'Delete (gap remains)', es: 'Eliminar (el hueco permanece)' }), category: 'Editing' },
  { keys: ['⌘', 'Z'], label: tx({ de: 'Rückgängig', en: 'Undo', es: 'Deshacer' }), category: 'Editing' },
  { keys: ['⌘', '⇧', 'Z'], label: tx({ de: 'Wiederherstellen', en: 'Redo', es: 'Rehacer' }), category: 'Editing' },
  { keys: ['⌘', 'D'], label: tx({ de: 'Duplizieren', en: 'Duplicate', es: 'Duplicar' }), category: 'Editing' },
  { keys: ['I'], label: tx({ de: 'In-Marker setzen', en: 'Set in-marker', es: 'Establecer marcador de entrada' }), category: 'Editing' },
  { keys: ['O'], label: tx({ de: 'Out-Marker setzen', en: 'Set out-marker', es: 'Establecer marcador de salida' }), category: 'Editing' },

  // Selection
  { keys: ['⌘', 'A'], label: tx({ de: 'Alles auswählen', en: 'Select everything', es: 'Selecciona todo' }), category: 'Selection' },
  { keys: ['⇧', 'Klick'], label: tx({ de: 'Range-Select', en: 'Range select', es: 'Selección de rango' }), category: 'Selection' },
  { keys: ['⌘', 'Klick'], label: tx({ de: 'Zur Auswahl hinzufügen', en: 'Add to selection', es: 'Añadir a la selección' }), category: 'Selection' },
  { keys: ['Esc'], label: tx({ de: 'Auswahl aufheben', en: 'Deselect', es: 'Anular selección' }), category: 'Selection' },

  // Navigation
  { keys: ['?'], label: tx({ de: 'Diese Übersicht öffnen', en: 'Open this overview', es: 'Abrir este resumen' }), category: 'Navigation' },
  { keys: ['+', '−'], label: tx({ de: 'Timeline-Zoom', en: 'Timeline zoom', es: 'Zoom de línea de tiempo' }), category: 'Navigation' },
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
            Pro-Editing Shortcuts für den Universal Cut. Drücke <kbd className="px-1 border border-white/20 rounded text-[10px]">?</kbd> {tx({ de: "jederzeit, um diese Übersicht zu öffnen.", en: "anytime to open this overview.", es: "en cualquier momento para abrir este resumen." })}
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
          <Input
            autoFocus
            placeholder={tx({ de: "Shortcut suchen …", en: "Search shortcut...", es: "Buscar atajo..." })}
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
            <p className="text-center text-sm text-white/40 py-8">{tx({ de: "Keine Treffer.", en: "No results.", es: "Sin resultados." })}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
