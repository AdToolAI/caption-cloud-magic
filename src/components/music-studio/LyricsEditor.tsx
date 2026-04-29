import { useRef } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface LyricsEditorProps {
  value: string;
  onChange: (value: string) => void;
  onAutoGenerate: () => void;
  generating?: boolean;
  disabled?: boolean;
}

const TAGS = ['[Verse]', '[Verse 1]', '[Verse 2]', '[Chorus]', '[Bridge]', '[Outro]'];

export function LyricsEditor({ value, onChange, onAutoGenerate, generating, disabled }: LyricsEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const insertTag = (tag: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const before = value.slice(0, start);
    const after = value.slice(end);
    const insertion = (before && !before.endsWith('\n\n') ? '\n\n' : '') + tag + '\n';
    const next = before + insertion + after;
    onChange(next);
    setTimeout(() => {
      ta.focus();
      const pos = (before + insertion).length;
      ta.setSelectionRange(pos, pos);
    }, 0);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">Lyrics</span>
          <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">
            Required for vocal track
          </Badge>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onAutoGenerate}
          disabled={disabled || generating}
          className="h-7 text-xs gap-1.5 text-primary hover:text-primary hover:bg-primary/10"
        >
          {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
          AI Lyrics generieren
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {TAGS.map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={() => insertTag(tag)}
            disabled={disabled}
            className={cn(
              "px-2 py-0.5 text-[11px] rounded-md border transition-colors",
              "border-primary/30 text-primary/90 hover:bg-primary/10 hover:border-primary/60",
              "disabled:opacity-40 disabled:cursor-not-allowed"
            )}
          >
            {tag}
          </button>
        ))}
      </div>

      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={"[Verse 1]\nFirst light over the city skyline\nWe were dreaming of a different time\n\n[Chorus]\nOh, we'll never look back\nWe'll never look back…"}
        className="min-h-[200px] font-mono text-sm bg-background/40 border-primary/20 focus:border-primary/60"
      />
      <p className="text-[11px] text-muted-foreground">
        Verwende <code className="text-primary/80">[Verse]</code>, <code className="text-primary/80">[Chorus]</code>, <code className="text-primary/80">[Bridge]</code> Marker für klare Songstruktur. Max. 60s Output.
      </p>
    </div>
  );
}
