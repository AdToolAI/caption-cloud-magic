/**
 * 2048 — Tastatur + Wisch, Highscore lokal. Reiner Zeitvertreib.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Grid = number[][];

const SIZE = 4;
const STORAGE_KEY = 'autopilot.lounge.2048.best';

function emptyGrid(): Grid {
  return Array.from({ length: SIZE }, () => Array<number>(SIZE).fill(0));
}

function addTile(grid: Grid): Grid {
  const free: Array<[number, number]> = [];
  grid.forEach((row, r) => row.forEach((v, c) => v === 0 && free.push([r, c])));
  if (free.length === 0) return grid;
  const [r, c] = free[Math.floor(Math.random() * free.length)];
  const next = grid.map((row) => [...row]);
  next[r][c] = Math.random() < 0.9 ? 2 : 4;
  return next;
}

function newGame(): Grid {
  return addTile(addTile(emptyGrid()));
}

function slideRow(row: number[]): { row: number[]; gained: number } {
  const values = row.filter((v) => v !== 0);
  const out: number[] = [];
  let gained = 0;
  for (let i = 0; i < values.length; i += 1) {
    if (values[i] === values[i + 1]) {
      out.push(values[i] * 2);
      gained += values[i] * 2;
      i += 1;
    } else {
      out.push(values[i]);
    }
  }
  while (out.length < SIZE) out.push(0);
  return { row: out, gained };
}

function rotate(grid: Grid): Grid {
  return grid[0].map((_, c) => grid.map((row) => row[c]).reverse());
}

function move(grid: Grid, dir: 'left' | 'right' | 'up' | 'down') {
  let work = grid.map((row) => [...row]);
  const turns = { left: 0, up: 1, right: 2, down: 3 }[dir];
  for (let i = 0; i < turns; i += 1) work = rotate(work);

  let gained = 0;
  work = work.map((row) => {
    const res = slideRow(row);
    gained += res.gained;
    return res.row;
  });

  for (let i = 0; i < (4 - turns) % 4; i += 1) work = rotate(work);
  const moved = JSON.stringify(work) !== JSON.stringify(grid);
  return { grid: work, gained, moved };
}

function isDead(grid: Grid): boolean {
  return (['left', 'right', 'up', 'down'] as const).every((dir) => !move(grid, dir).moved);
}

const TILE_STYLE: Record<number, string> = {
  0: 'bg-white/5 text-transparent',
  2: 'bg-amber-200/15 text-amber-100',
  4: 'bg-amber-200/25 text-amber-100',
  8: 'bg-amber-400/30 text-amber-50',
  16: 'bg-amber-400/40 text-amber-50',
  32: 'bg-amber-500/45 text-amber-50',
  64: 'bg-amber-500/60 text-black',
  128: 'bg-amber-400/75 text-black',
  256: 'bg-amber-400/85 text-black',
  512: 'bg-amber-300 text-black',
  1024: 'bg-amber-200 text-black',
  2048: 'bg-amber-100 text-black',
};

export default function Game2048() {
  const [grid, setGrid] = useState<Grid>(newGame);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState<number>(() => Number(localStorage.getItem(STORAGE_KEY) ?? 0));
  const touch = useRef<{ x: number; y: number } | null>(null);

  const apply = useCallback((dir: 'left' | 'right' | 'up' | 'down') => {
    setGrid((current) => {
      const res = move(current, dir);
      if (!res.moved) return current;
      setScore((s) => {
        const next = s + res.gained;
        setBest((b) => {
          if (next > b) {
            localStorage.setItem(STORAGE_KEY, String(next));
            return next;
          }
          return b;
        });
        return next;
      });
      return addTile(res.grid);
    });
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const map: Record<string, 'left' | 'right' | 'up' | 'down'> = {
        ArrowLeft: 'left',
        ArrowRight: 'right',
        ArrowUp: 'up',
        ArrowDown: 'down',
      };
      const dir = map[event.key];
      if (!dir) return;
      event.preventDefault();
      apply(dir);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [apply]);

  const dead = isDead(grid);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Punkte <span className="font-mono text-foreground">{score}</span>
        </span>
        <span>
          Bestwert <span className="font-mono text-foreground">{best}</span>
        </span>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setGrid(newGame());
            setScore(0);
          }}
        >
          Neu
        </Button>
      </div>

      <div
        className="grid select-none grid-cols-4 gap-2 rounded-2xl border border-primary/20 bg-black/40 p-2"
        onTouchStart={(e) => {
          touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }}
        onTouchEnd={(e) => {
          const start = touch.current;
          if (!start) return;
          const dx = e.changedTouches[0].clientX - start.x;
          const dy = e.changedTouches[0].clientY - start.y;
          if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
          apply(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
          touch.current = null;
        }}
      >
        {grid.flatMap((row, r) =>
          row.map((value, c) => (
            <div
              key={`${r}-${c}`}
              className={cn(
                'flex aspect-square items-center justify-center rounded-lg font-mono text-lg font-semibold transition-colors',
                TILE_STYLE[value] ?? 'bg-amber-100 text-black',
              )}
            >
              {value || '·'}
            </div>
          )),
        )}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        {dead ? 'Kein Zug mehr möglich — neu starten.' : 'Pfeiltasten oder wischen.'}
      </p>
    </div>
  );
}
