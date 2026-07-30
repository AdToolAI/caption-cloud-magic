/**
 * Minesweeper — 9×9, 10 Minen. Flagge per Rechtsklick oder Long-Press.
 */

import { useCallback, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const SIZE = 9;
const MINES = 10;

interface Cell {
  mine: boolean;
  open: boolean;
  flag: boolean;
  around: number;
}

type Board = Cell[][];

function build(): Board {
  const board: Board = Array.from({ length: SIZE }, () =>
    Array.from({ length: SIZE }, () => ({ mine: false, open: false, flag: false, around: 0 })),
  );

  let placed = 0;
  while (placed < MINES) {
    const r = Math.floor(Math.random() * SIZE);
    const c = Math.floor(Math.random() * SIZE);
    if (board[r][c].mine) continue;
    board[r][c].mine = true;
    placed += 1;
  }

  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      board[r][c].around = neighbours(r, c).filter(([nr, nc]) => board[nr][nc].mine).length;
    }
  }
  return board;
}

function neighbours(r: number, c: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE) out.push([nr, nc]);
    }
  }
  return out;
}

function flood(board: Board, r: number, c: number): Board {
  const next = board.map((row) => row.map((cell) => ({ ...cell })));
  const stack: Array<[number, number]> = [[r, c]];
  while (stack.length) {
    const [cr, cc] = stack.pop()!;
    const cell = next[cr][cc];
    if (cell.open || cell.flag) continue;
    cell.open = true;
    if (cell.around === 0 && !cell.mine) {
      for (const [nr, nc] of neighbours(cr, cc)) {
        if (!next[nr][nc].open) stack.push([nr, nc]);
      }
    }
  }
  return next;
}

const NUMBER_COLOR = [
  '',
  'text-sky-300',
  'text-emerald-300',
  'text-amber-300',
  'text-orange-300',
  'text-rose-300',
  'text-fuchsia-300',
  'text-primary',
  'text-muted-foreground',
];

export default function Minesweeper() {
  const [board, setBoard] = useState<Board>(build);
  const [state, setState] = useState<'playing' | 'lost' | 'won'>('playing');
  const press = useRef<number | null>(null);

  const reset = () => {
    setBoard(build());
    setState('playing');
  };

  const open = useCallback(
    (r: number, c: number) => {
      if (state !== 'playing') return;
      setBoard((current) => {
        const cell = current[r][c];
        if (cell.open || cell.flag) return current;
        if (cell.mine) {
          setState('lost');
          return current.map((row) => row.map((x) => (x.mine ? { ...x, open: true } : x)));
        }
        const next = flood(current, r, c);
        const closed = next.flat().filter((x) => !x.open).length;
        if (closed === MINES) setState('won');
        return next;
      });
    },
    [state],
  );

  const toggleFlag = useCallback(
    (r: number, c: number) => {
      if (state !== 'playing') return;
      setBoard((current) =>
        current.map((row, ri) =>
          row.map((cell, ci) =>
            ri === r && ci === c && !cell.open ? { ...cell, flag: !cell.flag } : cell,
          ),
        ),
      );
    },
    [state],
  );

  const flags = board.flat().filter((cell) => cell.flag).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Minen <span className="font-mono text-foreground">{MINES - flags}</span>
        </span>
        <span className="text-foreground">
          {state === 'lost' ? 'Verloren' : state === 'won' ? 'Geschafft' : 'Im Spiel'}
        </span>
        <Button size="sm" variant="outline" onClick={reset}>
          Neu
        </Button>
      </div>

      <div
        className="grid select-none gap-1 rounded-2xl border border-primary/20 bg-black/40 p-2"
        style={{ gridTemplateColumns: `repeat(${SIZE}, minmax(0, 1fr))` }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {board.flatMap((row, r) =>
          row.map((cell, c) => (
            <button
              key={`${r}-${c}`}
              type="button"
              onClick={() => open(r, c)}
              onContextMenu={(e) => {
                e.preventDefault();
                toggleFlag(r, c);
              }}
              onTouchStart={() => {
                press.current = window.setTimeout(() => {
                  press.current = null;
                  toggleFlag(r, c);
                }, 450);
              }}
              onTouchEnd={() => {
                if (press.current) {
                  window.clearTimeout(press.current);
                  press.current = null;
                }
              }}
              className={cn(
                'flex aspect-square items-center justify-center rounded font-mono text-xs font-semibold transition-colors',
                cell.open
                  ? cell.mine
                    ? 'bg-rose-500/60 text-black'
                    : 'bg-white/10 text-foreground'
                  : 'bg-amber-200/10 text-amber-100 hover:bg-amber-200/20',
              )}
            >
              {cell.open
                ? cell.mine
                  ? '✳'
                  : cell.around > 0
                    ? <span className={NUMBER_COLOR[cell.around]}>{cell.around}</span>
                    : ''
                : cell.flag
                  ? '⚑'
                  : ''}
            </button>
          )),
        )}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Tippen zum Öffnen, Rechtsklick oder langes Drücken für die Flagge.
      </p>
    </div>
  );
}
