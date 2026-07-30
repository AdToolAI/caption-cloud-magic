/**
 * Klondike-Solitär — Klick-Steuerung (Karte wählen, Ziel wählen).
 * Bewusst schlank: keine Drag-Bibliothek, kein Persistieren.
 */

import { useCallback, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Suit = '♠' | '♥' | '♦' | '♣';
interface Card {
  id: string;
  suit: Suit;
  rank: number; // 1 = Ass
  faceUp: boolean;
}

const SUITS: Suit[] = ['♠', '♥', '♦', '♣'];
const RANK_LABEL = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'B', 'D', 'K'];

const isRed = (suit: Suit) => suit === '♥' || suit === '♦';

interface State {
  stock: Card[];
  waste: Card[];
  foundations: Card[][];
  tableau: Card[][];
}

function buildDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (let rank = 1; rank <= 13; rank += 1) {
      deck.push({ id: `${suit}${rank}`, suit, rank, faceUp: false });
    }
  }
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function deal(): State {
  const deck = buildDeck();
  const tableau: Card[][] = [];
  for (let col = 0; col < 7; col += 1) {
    const pile = deck.splice(0, col + 1).map((card, index) => ({
      ...card,
      faceUp: index === col,
    }));
    tableau.push(pile);
  }
  return { stock: deck, waste: [], foundations: [[], [], [], []], tableau };
}

type Source =
  | { kind: 'waste' }
  | { kind: 'tableau'; pile: number; index: number }
  | { kind: 'foundation'; pile: number };

function canStack(card: Card, onto: Card | undefined): boolean {
  if (!onto) return card.rank === 13;
  return isRed(card.suit) !== isRed(onto.suit) && card.rank === onto.rank - 1;
}

function canFound(card: Card, pile: Card[]): boolean {
  const top = pile[pile.length - 1];
  if (!top) return card.rank === 1;
  return top.suit === card.suit && card.rank === top.rank + 1;
}

function CardFace({ card, className }: { card: Card; className?: string }) {
  if (!card.faceUp) {
    return (
      <div
        className={cn(
          'flex h-14 w-10 items-center justify-center rounded-md border border-primary/30 bg-gradient-to-br from-amber-900/50 to-black text-primary/40',
          className,
        )}
      >
        ✦
      </div>
    );
  }
  return (
    <div
      className={cn(
        'flex h-14 w-10 flex-col items-center justify-center rounded-md border border-white/20 bg-neutral-100 font-semibold leading-none',
        isRed(card.suit) ? 'text-red-600' : 'text-neutral-900',
        className,
      )}
    >
      <span className="text-xs">{RANK_LABEL[card.rank]}</span>
      <span className="text-sm">{card.suit}</span>
    </div>
  );
}

export default function Solitaire() {
  const [state, setState] = useState<State>(deal);
  const [source, setSource] = useState<Source | null>(null);

  const won = useMemo(
    () => state.foundations.every((pile) => pile.length === 13),
    [state.foundations],
  );

  const drawStock = useCallback(() => {
    setSource(null);
    setState((s) => {
      if (s.stock.length === 0) {
        return { ...s, stock: s.waste.map((c) => ({ ...c, faceUp: false })).reverse(), waste: [] };
      }
      const next = [...s.stock];
      const card = next.pop()!;
      return { ...s, stock: next, waste: [...s.waste, { ...card, faceUp: true }] };
    });
  }, []);

  /** Karten, die aktuell bewegt werden sollen. */
  const takeCards = (s: State, src: Source): Card[] => {
    if (src.kind === 'waste') return s.waste.slice(-1);
    if (src.kind === 'foundation') return s.foundations[src.pile].slice(-1);
    return s.tableau[src.pile].slice(src.index);
  };

  const removeCards = (s: State, src: Source): State => {
    if (src.kind === 'waste') return { ...s, waste: s.waste.slice(0, -1) };
    if (src.kind === 'foundation') {
      const foundations = s.foundations.map((p, i) => (i === src.pile ? p.slice(0, -1) : p));
      return { ...s, foundations };
    }
    const tableau = s.tableau.map((pile, i) => {
      if (i !== src.pile) return pile;
      const rest = pile.slice(0, src.index);
      if (rest.length > 0) rest[rest.length - 1] = { ...rest[rest.length - 1], faceUp: true };
      return rest;
    });
    return { ...s, tableau };
  };

  const moveToTableau = (target: number) => {
    if (!source) return;
    setState((s) => {
      const cards = takeCards(s, source);
      const top = s.tableau[target][s.tableau[target].length - 1];
      if (cards.length === 0 || !top || !top.faceUp ? !canStack(cards[0], top) : !canStack(cards[0], top)) {
        return s;
      }
      const cleared = removeCards(s, source);
      const tableau = cleared.tableau.map((pile, i) => (i === target ? [...pile, ...cards] : pile));
      return { ...cleared, tableau };
    });
    setSource(null);
  };

  const moveToFoundation = (target: number) => {
    if (!source) return;
    setState((s) => {
      const cards = takeCards(s, source);
      if (cards.length !== 1 || !canFound(cards[0], s.foundations[target])) return s;
      const cleared = removeCards(s, source);
      const foundations = cleared.foundations.map((pile, i) =>
        i === target ? [...pile, cards[0]] : pile,
      );
      return { ...cleared, foundations };
    });
    setSource(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{won ? 'Gewonnen — sauber gespielt.' : 'Karte antippen, dann Ziel antippen.'}</span>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setState(deal());
            setSource(null);
          }}
        >
          Neu
        </Button>
      </div>

      <div className="flex items-start gap-2">
        <button type="button" onClick={drawStock} aria-label="Karte ziehen">
          {state.stock.length > 0 ? (
            <CardFace card={{ id: 'back', suit: '♠', rank: 1, faceUp: false }} />
          ) : (
            <div className="flex h-14 w-10 items-center justify-center rounded-md border border-dashed border-primary/30 text-xs text-muted-foreground">
              ↻
            </div>
          )}
        </button>

        <button
          type="button"
          onClick={() => state.waste.length > 0 && setSource({ kind: 'waste' })}
          aria-label="Ablage"
        >
          {state.waste.length > 0 ? (
            <CardFace
              card={state.waste[state.waste.length - 1]}
              className={source?.kind === 'waste' ? 'ring-2 ring-primary' : undefined}
            />
          ) : (
            <div className="h-14 w-10 rounded-md border border-dashed border-white/15" />
          )}
        </button>

        <div className="ml-auto flex gap-2">
          {state.foundations.map((pile, i) => (
            <button
              key={i}
              type="button"
              onClick={() => (source ? moveToFoundation(i) : setSource({ kind: 'foundation', pile: i }))}
              aria-label={`Ass-Stapel ${i + 1}`}
            >
              {pile.length > 0 ? (
                <CardFace card={pile[pile.length - 1]} />
              ) : (
                <div className="flex h-14 w-10 items-center justify-center rounded-md border border-dashed border-primary/25 text-xs text-primary/50">
                  {SUITS[i]}
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2">
        {state.tableau.map((pile, pileIndex) => (
          <div
            key={pileIndex}
            className="min-h-[7rem] space-y-[-2.6rem] rounded-md p-0.5"
            onClick={() => {
              if (source && pile.length === 0) moveToTableau(pileIndex);
            }}
          >
            {pile.length === 0 && (
              <button
                type="button"
                onClick={() => moveToTableau(pileIndex)}
                className="h-14 w-10 rounded-md border border-dashed border-white/15"
                aria-label="Leerer Stapel"
              />
            )}
            {pile.map((card, index) => {
              const selected =
                source?.kind === 'tableau' &&
                source.pile === pileIndex &&
                index >= source.index;
              return (
                <button
                  key={card.id}
                  type="button"
                  className="block"
                  onClick={() => {
                    if (source && index === pile.length - 1) {
                      moveToTableau(pileIndex);
                      return;
                    }
                    if (card.faceUp) setSource({ kind: 'tableau', pile: pileIndex, index });
                  }}
                >
                  <CardFace card={card} className={selected ? 'ring-2 ring-primary' : undefined} />
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
