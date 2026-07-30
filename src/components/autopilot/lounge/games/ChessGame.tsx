/**
 * Schach — Regeln über chess.js, Gegner über eine schlanke Material-Suche.
 * Kein Ranking, kein Speichern: nur, um Wartezeit zu überbrücken.
 */

import { useCallback, useMemo, useState } from 'react';
import { Chess, type Square } from 'chess.js';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const GLYPH: Record<string, string> = {
  p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚',
  P: '♙', N: '♘', B: '♗', R: '♖', Q: '♕', K: '♔',
};

const VALUE: Record<string, number> = { p: 1, n: 3, b: 3.2, r: 5, q: 9, k: 0 };

type Level = 'leicht' | 'mittel' | 'schwer';
const DEPTH: Record<Level, number> = { leicht: 0, mittel: 1, schwer: 2 };

function evaluate(game: Chess): number {
  // Positiv = gut für Schwarz (die KI spielt Schwarz).
  let score = 0;
  for (const row of game.board()) {
    for (const cell of row) {
      if (!cell) continue;
      const v = VALUE[cell.type] ?? 0;
      score += cell.color === 'b' ? v : -v;
    }
  }
  return score;
}

function search(game: Chess, depth: number, maximizing: boolean): number {
  if (depth === 0 || game.isGameOver()) return evaluate(game);
  const moves = game.moves();
  let best = maximizing ? -Infinity : Infinity;
  for (const move of moves) {
    game.move(move);
    const value = search(game, depth - 1, !maximizing);
    game.undo();
    best = maximizing ? Math.max(best, value) : Math.min(best, value);
  }
  return best;
}

function pickAiMove(game: Chess, level: Level): string | null {
  const moves = game.moves();
  if (moves.length === 0) return null;
  const depth = DEPTH[level];
  if (depth === 0) return moves[Math.floor(Math.random() * moves.length)];

  let bestMove = moves[0];
  let bestScore = -Infinity;
  for (const move of moves) {
    game.move(move);
    const score = search(game, depth - 1, false);
    game.undo();
    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }
  return bestMove;
}

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

export default function ChessGame() {
  const [game] = useState(() => new Chess());
  const [fen, setFen] = useState(game.fen());
  const [from, setFrom] = useState<Square | null>(null);
  const [level, setLevel] = useState<Level>('mittel');
  const [thinking, setThinking] = useState(false);

  const board = useMemo(() => new Chess(fen).board(), [fen]);
  const legalTargets = useMemo(() => {
    if (!from) return new Set<string>();
    return new Set(
      new Chess(fen)
        .moves({ square: from, verbose: true })
        .map((m) => (m as { to: string }).to),
    );
  }, [from, fen]);

  const aiTurn = useCallback(() => {
    setThinking(true);
    // Kurz auslagern, damit die UI den Zug des Spielers zuerst zeichnet.
    window.setTimeout(() => {
      const move = pickAiMove(game, level);
      if (move) game.move(move);
      setFen(game.fen());
      setThinking(false);
    }, 180);
  }, [game, level]);

  const onSquare = (square: Square, hasPiece: boolean, isOwn: boolean) => {
    if (thinking || game.isGameOver()) return;
    if (from && legalTargets.has(square)) {
      game.move({ from, to: square, promotion: 'q' });
      setFrom(null);
      setFen(game.fen());
      if (!game.isGameOver()) aiTurn();
      return;
    }
    setFrom(hasPiece && isOwn ? square : null);
  };

  const status = game.isCheckmate()
    ? game.turn() === 'w'
      ? 'Schachmatt — die KI gewinnt.'
      : 'Schachmatt — du gewinnst.'
    : game.isDraw()
      ? 'Remis.'
      : thinking
        ? 'Die KI überlegt…'
        : game.inCheck()
          ? 'Schach!'
          : 'Du bist am Zug (Weiß).';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 text-xs">
        <div className="flex gap-1">
          {(['leicht', 'mittel', 'schwer'] as Level[]).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLevel(l)}
              className={cn(
                'rounded-full border px-2.5 py-1 capitalize transition-colors',
                level === l
                  ? 'border-primary/60 bg-primary/15 text-foreground'
                  : 'border-border/50 text-muted-foreground hover:text-foreground',
              )}
            >
              {l}
            </button>
          ))}
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            game.reset();
            setFrom(null);
            setFen(game.fen());
          }}
        >
          Neu
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-primary/20">
        {board.map((row, r) => (
          <div key={r} className="flex">
            {row.map((cell, c) => {
              const square = `${FILES[c]}${8 - r}` as Square;
              const dark = (r + c) % 2 === 1;
              const selected = from === square;
              const target = legalTargets.has(square);
              return (
                <button
                  key={square}
                  type="button"
                  onClick={() => onSquare(square, !!cell, cell?.color === 'w')}
                  className={cn(
                    'relative flex aspect-square flex-1 items-center justify-center text-2xl leading-none transition-colors sm:text-3xl',
                    dark ? 'bg-black/60' : 'bg-white/10',
                    selected && 'bg-primary/30',
                    target && 'ring-1 ring-inset ring-primary/60',
                  )}
                >
                  <span className={cell?.color === 'w' ? 'text-amber-50' : 'text-amber-900'}>
                    {cell ? GLYPH[cell.color === 'w' ? cell.type.toUpperCase() : cell.type] : ''}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <p className="text-center text-xs text-muted-foreground">{status}</p>
    </div>
  );
}
