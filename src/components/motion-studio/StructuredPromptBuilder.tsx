// Block K-1 — Structured Prompt Builder
//
// Slot-based prompt UI that complements the free-text editor. Users can
// switch between "📝 Free Text" and "🧱 Structured" mode. In structured
// mode, six labeled fields capture Subject / Action / Setting / Time-Weather
// / Style / Negative — each with an inline ✨ AI-Suggest button (powered by
// the `structured-prompt-compose` edge function in `mode: 'suggest'`).
//
// Polishing (Block K-Polish):
// - K-P2: drag-reorder via @dnd-kit/sortable (Negative pinned to end)
// - K-P3: per-slot 3-step in-memory undo (history popover)
// - K-P4: tabIndex={-1} on action buttons → Tab cycles only through inputs
//
// The component owns NO state for slot values — all changes are forwarded to
// the parent so the SceneCard remains the single source of truth for
// `promptSlots` and `promptSlotOrder`.

import { useMemo, useRef, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Sparkles, Loader2, Dices, Save, Wand2, GripVertical, Undo2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import {
  SLOT_KEYS,
  SLOT_META,
  hasAnySlot,
  type PromptSlots,
} from '@/lib/motion-studio/structuredPromptStitcher';
import {
  evaluatePromptLength,
  clipSourceToModelKey,
  MODEL_PROMPT_LIMITS,
  type PromptModelKey,
} from '@/lib/motion-studio/promptTokenLimits';

interface StructuredPromptBuilderProps {
  slots: PromptSlots;
  onChange: (slots: PromptSlots) => void;
  /** Used to size token-limit warnings to the actual target model. */
  clipSource: string;
  /** Free-text fallback used as context when generating slot suggestions. */
  contextHint?: string;
  /** Currently composed prompt (final stitched + enriched) — for token bar. */
  composedPrompt: string;
  language: string;
  /** Optional: user-defined slot order. Negative is always pinned last. */
  order?: Array<keyof PromptSlots>;
  /** Persist a new order (without negative — it's added back automatically). */
  onOrderChange?: (order: Array<keyof PromptSlots>) => void;
  onInspireMe?: () => void;
  onSavePreset?: () => void;
  onOpenStylePresets?: () => void;
}

const t = (lang: string, de: string, en: string, es: string) =>
  lang === 'de' ? de : lang === 'es' ? es : en;

// Negative slot is always pinned at the end (some models only respect it
// when it's the trailing instruction).
const REORDERABLE_KEYS = SLOT_KEYS.filter((k) => k !== 'negative');

function resolveOrder(custom?: Array<keyof PromptSlots>): Array<keyof PromptSlots> {
  if (!custom || custom.length === 0) return SLOT_KEYS;
  const validReorderable = custom.filter(
    (k): k is keyof PromptSlots => REORDERABLE_KEYS.includes(k as any)
  );
  // Append any reorderable keys missing from the custom order (forward-compat).
  for (const k of REORDERABLE_KEYS) {
    if (!validReorderable.includes(k)) validReorderable.push(k);
  }
  return [...validReorderable, 'negative'];
}

interface SlotRowProps {
  slotKey: keyof PromptSlots;
  value: string;
  language: string;
  isSuggesting: boolean;
  history: string[];
  onUpdate: (key: keyof PromptSlots, value: string) => void;
  onRequestSuggestion: (key: keyof PromptSlots) => void;
  onRestoreHistory: (key: keyof PromptSlots, value: string) => void;
  draggable: boolean;
}

function SlotRow({
  slotKey,
  value,
  language,
  isSuggesting,
  history,
  onUpdate,
  onRequestSuggestion,
  onRestoreHistory,
  draggable,
}: SlotRowProps) {
  const meta = SLOT_META[slotKey];
  const InputComp: any = meta.multiline ? Textarea : Input;

  const sortable = useSortable({ id: slotKey, disabled: !draggable });
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = sortable;

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 30 : 'auto',
  };

  return (
    <div ref={setNodeRef} style={style} className="space-y-0.5">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
          {draggable && (
            <button
              type="button"
              tabIndex={-1}
              aria-label={t(language, 'Slot verschieben', 'Reorder slot', 'Reordenar campo')}
              className="cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-foreground touch-none"
              {...attributes}
              {...listeners}
            >
              <GripVertical className="h-3 w-3" />
            </button>
          )}
          {!draggable && <span className="w-3" />}
          <span>{meta.icon}</span>
          <span>{meta.label[language as 'de' | 'en' | 'es'] ?? meta.label.en}</span>
          {!draggable && (
            <Badge variant="outline" className="h-3.5 px-1 text-[8px] uppercase">
              {t(language, 'Ende', 'End', 'Final')}
            </Badge>
          )}
        </Label>
        <div className="flex items-center gap-0.5">
          {history.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  tabIndex={-1}
                  aria-label={t(language, 'Verlauf', 'History', 'Historial')}
                  className="h-5 px-1 text-[9px] text-muted-foreground hover:text-foreground"
                  title={t(language, 'Letzte Werte', 'Recent values', 'Valores recientes')}
                >
                  <Undo2 className="h-2.5 w-2.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                side="top"
                className="w-64 p-1.5 space-y-1"
              >
                <div className="text-[10px] text-muted-foreground px-1.5 py-0.5">
                  {t(language, 'Letzte Werte', 'Recent values', 'Valores recientes')}
                </div>
                {history.map((h, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => onRestoreHistory(slotKey, h)}
                    className="w-full text-left text-[10px] px-1.5 py-1 rounded hover:bg-muted line-clamp-2"
                    title={h}
                  >
                    {h}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          )}
          <Button
            size="sm"
            variant="ghost"
            tabIndex={-1}
            aria-label={t(language, 'KI-Vorschlag', 'AI suggestion', 'Sugerencia IA')}
            className="h-5 px-1.5 text-[9px] gap-1 text-primary/70 hover:text-primary"
            onClick={() => onRequestSuggestion(slotKey)}
            disabled={isSuggesting}
          >
            {isSuggesting ? (
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
            ) : (
              <Sparkles className="h-2.5 w-2.5" />
            )}
            {t(language, 'KI', 'AI', 'IA')}
          </Button>
        </div>
      </div>
      <InputComp
        value={value}
        onChange={(e: any) => onUpdate(slotKey, e.target.value)}
        placeholder={meta.placeholder[language as 'de' | 'en' | 'es'] ?? meta.placeholder.en}
        className="h-8 text-[11px] py-1 px-2"
        rows={meta.multiline ? 2 : undefined}
      />
    </div>
  );
}

export default function StructuredPromptBuilder({
  slots,
  onChange,
  clipSource,
  contextHint,
  composedPrompt,
  language,
  order,
  onOrderChange,
  onInspireMe,
  onSavePreset,
  onOpenStylePresets,
}: StructuredPromptBuilderProps) {
  const [suggestingSlot, setSuggestingSlot] = useState<keyof PromptSlots | null>(null);
  // K-P3: per-slot in-memory undo history (max 3 entries, newest first).
  const [history, setHistory] = useState<Record<string, string[]>>({});
  // Track previous values to push to history when an external change overwrites.
  const previousSlotsRef = useRef<PromptSlots>(slots);

  const modelKey: PromptModelKey = clipSourceToModelKey(clipSource) ?? 'ai-sora';
  const limit = MODEL_PROMPT_LIMITS[modelKey];
  const status = evaluatePromptLength(composedPrompt, modelKey);

  const effectiveOrder = useMemo(() => resolveOrder(order), [order]);
  const reorderableIds = useMemo(
    () => effectiveOrder.filter((k) => k !== 'negative'),
    [effectiveOrder]
  );

  const pushHistory = (key: keyof PromptSlots, oldValue: string) => {
    if (!oldValue.trim()) return;
    setHistory((prev) => {
      const arr = prev[key] ?? [];
      if (arr[0] === oldValue) return prev; // skip duplicates
      const next = [oldValue, ...arr.filter((v) => v !== oldValue)].slice(0, 3);
      return { ...prev, [key]: next };
    });
  };

  const updateSlot = (key: keyof PromptSlots, value: string) => {
    const old = previousSlotsRef.current[key] ?? '';
    if (old && old !== value) pushHistory(key, old);
    const next = { ...slots, [key]: value };
    previousSlotsRef.current = next;
    onChange(next);
  };

  const restoreHistory = (key: keyof PromptSlots, value: string) => {
    const current = slots[key] ?? '';
    if (current && current !== value) pushHistory(key, current);
    const next = { ...slots, [key]: value };
    previousSlotsRef.current = next;
    onChange(next);
  };

  const requestSuggestion = async (key: keyof PromptSlots) => {
    setSuggestingSlot(key);
    try {
      const { data, error } = await supabase.functions.invoke(
        'structured-prompt-compose',
        {
          body: {
            mode: 'suggest',
            slot: key,
            slots,
            language,
            targetModel: modelKey,
            contextHint: contextHint?.slice(0, 600) ?? '',
          },
        }
      );
      if (error) throw error;
      const suggestion: string | undefined = data?.suggestion;
      if (suggestion) {
        updateSlot(key, suggestion);
        toast({
          title: t(language, '✨ Vorschlag eingefügt', '✨ Suggestion inserted', '✨ Sugerencia insertada'),
        });
      } else {
        throw new Error('Empty suggestion');
      }
    } catch (e: any) {
      console.error('[StructuredPromptBuilder] suggest failed', e);
      toast({
        title: t(language, 'KI-Vorschlag fehlgeschlagen', 'AI suggestion failed', 'Fallo la sugerencia IA'),
        description: e?.message ?? '',
        variant: 'destructive',
      });
    } finally {
      setSuggestingSlot(null);
    }
  };

  const counted = hasAnySlot(slots);
  const filledCount = SLOT_KEYS.filter((k) => (slots[k] ?? '').trim().length > 0).length;

  const tokenBarColor =
    status.level === 'over'
      ? 'bg-destructive'
      : status.level === 'warn'
      ? 'bg-amber-500'
      : 'bg-primary';

  // K-P2: drag handlers
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = reorderableIds as Array<keyof PromptSlots>;
    const from = ids.indexOf(active.id as keyof PromptSlots);
    const to = ids.indexOf(over.id as keyof PromptSlots);
    if (from < 0 || to < 0) return;
    const nextReorderable = arrayMove(ids, from, to);
    onOrderChange?.(nextReorderable);
  };

  return (
    <div className="space-y-2 rounded-md border border-primary/30 bg-gradient-to-br from-primary/5 to-background/40 p-2">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-primary">
          <Wand2 className="h-3 w-3" />
          {t(language, 'Strukturierter Builder', 'Structured Builder', 'Constructor estructurado')}
          {counted && (
            <Badge variant="secondary" className="h-4 px-1 text-[9px]">
              {filledCount}/{SLOT_KEYS.length}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          {onOpenStylePresets && (
            <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] gap-1" onClick={onOpenStylePresets}>
              <Sparkles className="h-3 w-3" />
              {t(language, 'Styles', 'Styles', 'Estilos')}
            </Button>
          )}
          {onInspireMe && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[10px] gap-1"
              onClick={onInspireMe}
              title={t(language, 'Würfle eine Szene', 'Roll a scene', 'Lanza una escena')}
            >
              <Dices className="h-3 w-3" />
            </Button>
          )}
          {onSavePreset && counted && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[10px] gap-1"
              onClick={onSavePreset}
              title={t(language, 'Als Style speichern', 'Save as style', 'Guardar como estilo')}
            >
              <Save className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {/* Slots — drag-reorderable except Negative */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={reorderableIds} strategy={verticalListSortingStrategy}>
          <div className="grid gap-1.5">
            {effectiveOrder.map((key) => (
              <SlotRow
                key={key}
                slotKey={key}
                value={slots[key] ?? ''}
                language={language}
                isSuggesting={suggestingSlot === key}
                history={history[key] ?? []}
                onUpdate={updateSlot}
                onRequestSuggestion={requestSuggestion}
                onRestoreHistory={restoreHistory}
                draggable={key !== 'negative'}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* Token Bar — live preview of composed prompt length vs model limit */}
      <div className="space-y-1 pt-1 border-t border-border/50">
        <div className="flex items-center justify-between text-[9px]">
          <span className="text-muted-foreground">
            {t(language, 'Länge', 'Length', 'Longitud')} ({limit.label})
          </span>
          <span
            className={
              status.level === 'over'
                ? 'text-destructive font-semibold'
                : status.level === 'warn'
                ? 'text-amber-500'
                : 'text-muted-foreground'
            }
          >
            {status.count} / {limit.hard} {limit.unit === 'words' ? (language === 'de' ? 'Wörter' : language === 'es' ? 'palabras' : 'words') : (language === 'de' ? 'Zeichen' : language === 'es' ? 'caracteres' : 'chars')}
          </span>
        </div>
        <div className="h-1 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full transition-all ${tokenBarColor}`}
            style={{ width: `${status.percent}%` }}
          />
        </div>
        {status.level === 'over' && (
          <p className="text-[9px] text-destructive">
            {t(
              language,
              `⚠ Über dem Limit von ${limit.hard} ${limit.unit === 'words' ? 'Wörtern' : 'Zeichen'} — ${limit.label} schneidet ab.`,
              `⚠ Over the ${limit.hard}-${limit.unit} limit — ${limit.label} will truncate.`,
              `⚠ Por encima del límite de ${limit.hard} ${limit.unit === 'words' ? 'palabras' : 'caracteres'} — ${limit.label} truncará.`
            )}
          </p>
        )}
      </div>
    </div>
  );
}
