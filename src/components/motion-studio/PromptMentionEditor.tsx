// Motion Studio Pro – Prompt editor with @-mention autocomplete (Phase 4)
//
// Wraps a regular <Textarea> with a floating dropdown that appears whenever
// the user types `@` followed by 0+ alphanumeric chars. Selecting an item
// inserts its (sanitized) name into the prompt. Library entries are loaded
// via useMotionStudioLibrary so the same source-of-truth feeds the editor
// and the resolveMentions() pipeline at generation time.
//
// Visual style follows the James Bond 2028 design system (semantic tokens
// only — no hard-coded colors).

import { useMemo, useRef, useState, useEffect } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { User, MapPin, AtSign } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMotionStudioLibrary } from '@/hooks/useMotionStudioLibrary';
import {
  findMentions,
  getActiveMentionTrigger,
} from '@/lib/motion-studio/mentionParser';
import type {
  MotionStudioCharacter,
  MotionStudioLocation,
} from '@/types/motion-studio';

interface PromptMentionEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  disabled?: boolean;
}

interface Suggestion {
  kind: 'character' | 'location';
  id: string;
  name: string;
  description: string;
  thumbnail: string | null;
}

const MAX_SUGGESTIONS = 8;

/** Convert a free-form name into a valid `@token` (no spaces, no punctuation). */
function nameToToken(name: string): string {
  return name.trim().replace(/\s+/g, '_').replace(/[^A-Za-z0-9_\-]/g, '');
}

function buildSuggestions(
  query: string,
  characters: MotionStudioCharacter[],
  locations: MotionStudioLocation[]
): Suggestion[] {
  const q = query.toLowerCase();
  const charSugg: Suggestion[] = characters
    .filter((c) => c.name && (q === '' || c.name.toLowerCase().includes(q)))
    .map((c) => ({
      kind: 'character' as const,
      id: c.id,
      name: c.name,
      description: c.description || c.signature_items || '',
      thumbnail: c.reference_image_url,
    }));
  const locSugg: Suggestion[] = locations
    .filter((l) => l.name && (q === '' || l.name.toLowerCase().includes(q)))
    .map((l) => ({
      kind: 'location' as const,
      id: l.id,
      name: l.name,
      description: l.description || l.lighting_notes || '',
      thumbnail: l.reference_image_url,
    }));
  return [...charSugg, ...locSugg].slice(0, MAX_SUGGESTIONS);
}

export default function PromptMentionEditor({
  value,
  onChange,
  placeholder,
  rows = 3,
  className,
  disabled,
}: PromptMentionEditorProps) {
  const { characters, locations } = useMotionStudioLibrary();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [trigger, setTrigger] = useState<{ query: string; start: number } | null>(
    null
  );
  const [activeIndex, setActiveIndex] = useState(0);

  const suggestions = useMemo(() => {
    if (!trigger) return [];
    return buildSuggestions(trigger.query, characters, locations);
  }, [trigger, characters, locations]);

  // Reset highlight when suggestions change
  useEffect(() => {
    setActiveIndex(0);
  }, [suggestions.length, trigger?.query]);

  const resolvedMentions = useMemo(
    () => findMentions(value, characters, locations),
    [value, characters, locations]
  );

  const updateTrigger = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    const t = getActiveMentionTrigger(value, ta.selectionStart ?? 0);
    setTrigger(t);
  };

  const insertSuggestion = (s: Suggestion) => {
    if (!trigger) return;
    const token = nameToToken(s.name);
    const before = value.slice(0, trigger.start);
    const afterStart = trigger.start + 1 + trigger.query.length;
    const after = value.slice(afterStart);
    // Insert `@<token> ` (trailing space for nicer UX).
    const next = `${before}@${token} ${after}`;
    onChange(next);
    setTrigger(null);
    // Restore caret after insertion
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      const newCaret = before.length + 1 + token.length + 1;
      ta.focus();
      ta.setSelectionRange(newCaret, newCaret);
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!trigger || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(
        (i) => (i - 1 + suggestions.length) % suggestions.length
      );
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      insertSuggestion(suggestions[activeIndex]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setTrigger(null);
    }
  };

  return (
    <div className="relative">
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          // updateTrigger after value commits in next tick
          requestAnimationFrame(updateTrigger);
        }}
        onKeyDown={handleKeyDown}
        onKeyUp={updateTrigger}
        onClick={updateTrigger}
        onBlur={() => {
          // Defer so click on dropdown still registers
          setTimeout(() => setTrigger(null), 150);
        }}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        className={cn('text-xs bg-background/50 resize-none', className)}
      />

      {/* Mention summary chips below the editor */}
      {resolvedMentions.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1 items-center">
          <AtSign className="h-3 w-3 text-primary/70" />
          {resolvedMentions.map((m, i) => (
            <Badge
              key={`${m.id}-${i}`}
              variant="outline"
              className={cn(
                'text-[9px] h-4 px-1.5 border-primary/40 bg-primary/5 text-primary',
                m.kind === 'location' &&
                  'border-accent/40 bg-accent/5 text-accent'
              )}
            >
              {m.kind === 'character' ? (
                <User className="h-2 w-2 mr-0.5" />
              ) : (
                <MapPin className="h-2 w-2 mr-0.5" />
              )}
              {m.name}
            </Badge>
          ))}
        </div>
      )}

      {/* Autocomplete dropdown */}
      {trigger && suggestions.length > 0 && (
        <div
          className="absolute left-0 right-0 mt-1 z-50 rounded-md border border-border/60 bg-popover shadow-xl overflow-hidden max-h-64 overflow-y-auto"
          // Prevent the textarea from losing focus on mousedown
          onMouseDown={(e) => e.preventDefault()}
        >
          <div className="px-2 py-1 text-[9px] uppercase tracking-wider text-muted-foreground bg-muted/40 border-b border-border/40">
            Library — {suggestions.length} match{suggestions.length === 1 ? '' : 'es'}
          </div>
          {suggestions.map((s, i) => {
            const Icon = s.kind === 'character' ? User : MapPin;
            const isActive = i === activeIndex;
            return (
              <button
                key={`${s.kind}-${s.id}`}
                type="button"
                onClick={() => insertSuggestion(s)}
                onMouseEnter={() => setActiveIndex(i)}
                className={cn(
                  'w-full flex items-center gap-2 px-2 py-1.5 text-left text-xs transition-colors',
                  isActive
                    ? 'bg-primary/15 text-foreground'
                    : 'hover:bg-muted/60 text-foreground/90'
                )}
              >
                {s.thumbnail ? (
                  <img
                    src={s.thumbnail}
                    alt=""
                    className="h-7 w-7 rounded object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="h-7 w-7 rounded bg-muted/60 flex items-center justify-center flex-shrink-0">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium truncate">{s.name}</span>
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[8px] h-3 px-1 border-border/40',
                        s.kind === 'character'
                          ? 'text-primary border-primary/30'
                          : 'text-accent border-accent/30'
                      )}
                    >
                      {s.kind}
                    </Badge>
                  </div>
                  {s.description && (
                    <p className="text-[10px] text-muted-foreground truncate">
                      {s.description}
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Empty-state hint */}
      {trigger && suggestions.length === 0 && (
        <div
          className="absolute left-0 right-0 mt-1 z-50 rounded-md border border-dashed border-border/60 bg-popover/95 px-3 py-2 text-[10px] text-muted-foreground"
          onMouseDown={(e) => e.preventDefault()}
        >
          Keine Library-Treffer für „@{trigger.query}". Lege Charaktere &
          Locations unter <span className="text-primary">/motion-studio/library</span> an.
        </div>
      )}
    </div>
  );
}
