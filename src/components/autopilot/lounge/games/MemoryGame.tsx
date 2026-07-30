/**
 * Memory / Pairs — 16 Karten, Bond-Gold-Rücken. Zug- und Zeitzähler.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const SYMBOLS = ['★', '♠', '♦', '☾', '⚑', '✧', '❖', '⌘'];

interface Card {
  id: number;
  symbol: string;
  open: boolean;
  done: boolean;
}

function deal(): Card[] {
  const cards = [...SYMBOLS, ...SYMBOLS].map((symbol, id) => ({
    id,
    symbol,
    open: false,
    done: false,
  }));
  for (let i = cards.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

export default function MemoryGame() {
  const [cards, setCards] = useState<Card[]>(deal);
  const [moves, setMoves] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const lock = useRef(false);

  const done = cards.every((card) => card.done);

  useEffect(() => {
    if (done) return;
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [done]);

  const open = cards.filter((card) => card.open && !card.done);

  useEffect(() => {
    if (open.length !== 2) return;
    lock.current = true;
    const [a, b] = open;
    const match = a.symbol === b.symbol;
    const id = window.setTimeout(
      () => {
        setCards((current) =>
          current.map((card) =>
            card.id === a.id || card.id === b.id
              ? { ...card, open: match, done: match }
              : card,
          ),
        );
        lock.current = false;
      },
      match ? 320 : 700,
    );
    return () => window.clearTimeout(id);
  }, [open]);

  const time = useMemo(
    () => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`,
    [seconds],
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Züge <span className="font-mono text-foreground">{moves}</span>
        </span>
        <span>
          Zeit <span className="font-mono text-foreground">{time}</span>
        </span>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setCards(deal());
            setMoves(0);
            setSeconds(0);
            lock.current = false;
          }}
        >
          Neu
        </Button>
      </div>

      <div className="grid select-none grid-cols-4 gap-2 rounded-2xl border border-primary/20 bg-black/40 p-2">
        {cards.map((card) => (
          <button
            key={card.id}
            type="button"
            onClick={() => {
              if (lock.current || card.open || card.done) return;
              setMoves((m) => m + 1);
              setCards((current) =>
                current.map((entry) => (entry.id === card.id ? { ...entry, open: true } : entry)),
              );
            }}
            className={cn(
              'flex aspect-square items-center justify-center rounded-lg text-xl transition-all duration-200',
              card.done
                ? 'bg-primary/25 text-primary'
                : card.open
                  ? 'bg-white/10 text-foreground'
                  : 'bg-gradient-to-br from-amber-300/25 to-amber-600/10 text-transparent hover:from-amber-300/35',
            )}
          >
            {card.open || card.done ? card.symbol : '·'}
          </button>
        ))}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        {done ? `Alle Paare in ${moves} Zügen — ${time}.` : 'Zwei Karten aufdecken, Paare merken.'}
      </p>
    </div>
  );
}
