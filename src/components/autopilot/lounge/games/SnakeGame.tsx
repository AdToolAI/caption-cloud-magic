/**
 * Snake — Tastatur + Wisch, Highscore lokal. Feste Tickrate, pausierbar.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const SIZE = 14;
const TICK_MS = 160;
const STORAGE_KEY = 'autopilot.lounge.snake.best';

type Point = { x: number; y: number };
type Dir = 'left' | 'right' | 'up' | 'down';

const DELTA: Record<Dir, Point> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
};

const OPPOSITE: Record<Dir, Dir> = { left: 'right', right: 'left', up: 'down', down: 'up' };

function randomFood(snake: Point[]): Point {
  for (;;) {
    const p = { x: Math.floor(Math.random() * SIZE), y: Math.floor(Math.random() * SIZE) };
    if (!snake.some((s) => s.x === p.x && s.y === p.y)) return p;
  }
}

const START: Point[] = [
  { x: 6, y: 7 },
  { x: 5, y: 7 },
  { x: 4, y: 7 },
];

export default function SnakeGame() {
  const [snake, setSnake] = useState<Point[]>(START);
  const [food, setFood] = useState<Point>(() => randomFood(START));
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => Number(localStorage.getItem(STORAGE_KEY) ?? 0));
  const [dead, setDead] = useState(false);
  const dir = useRef<Dir>('right');
  const pending = useRef<Dir>('right');
  const touch = useRef<Point | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);

  const reset = () => {
    setSnake(START);
    setFood(randomFood(START));
    setScore(0);
    setDead(false);
    dir.current = 'right';
    pending.current = 'right';
  };

  const steer = useCallback((next: Dir) => {
    if (OPPOSITE[next] === dir.current) return;
    pending.current = next;
  }, []);

  useEffect(() => {
    if (dead) return;
    const id = window.setInterval(() => {
      dir.current = pending.current;
      setSnake((current) => {
        const delta = DELTA[dir.current];
        const head = { x: current[0].x + delta.x, y: current[0].y + delta.y };

        if (
          head.x < 0 ||
          head.y < 0 ||
          head.x >= SIZE ||
          head.y >= SIZE ||
          current.some((s) => s.x === head.x && s.y === head.y)
        ) {
          setDead(true);
          return current;
        }

        const eats = head.x === food.x && head.y === food.y;
        const next = [head, ...current];
        if (eats) {
          setScore((s) => {
            const value = s + 1;
            setBest((b) => {
              if (value > b) localStorage.setItem(STORAGE_KEY, String(value));
              return Math.max(b, value);
            });
            return value;
          });
          setFood(randomFood(next));
        } else {
          next.pop();
        }
        return next;
      });
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [dead, food]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const map: Record<string, Dir> = {
        ArrowLeft: 'left',
        ArrowRight: 'right',
        ArrowUp: 'up',
        ArrowDown: 'down',
      };
      const next = map[event.key];
      if (!next) return;
      const box = boardRef.current?.getBoundingClientRect();
      if (!box || box.bottom < 0 || box.top > window.innerHeight) return;
      event.preventDefault();
      steer(next);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [steer]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Punkte <span className="font-mono text-foreground">{score}</span>
        </span>
        <span>
          Bestwert <span className="font-mono text-foreground">{best}</span>
        </span>
        <Button size="sm" variant="outline" onClick={reset}>
          Neu
        </Button>
      </div>

      <div
        ref={boardRef}
        className="grid select-none gap-px rounded-2xl border border-primary/20 bg-black/40 p-2 touch-none"
        style={{ gridTemplateColumns: `repeat(${SIZE}, minmax(0, 1fr))` }}
        onTouchStart={(e) => {
          touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }}
        onTouchEnd={(e) => {
          const start = touch.current;
          if (!start) return;
          const dx = e.changedTouches[0].clientX - start.x;
          const dy = e.changedTouches[0].clientY - start.y;
          touch.current = null;
          if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
          steer(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
        }}
      >
        {Array.from({ length: SIZE * SIZE }, (_, index) => {
          const x = index % SIZE;
          const y = Math.floor(index / SIZE);
          const isHead = snake[0].x === x && snake[0].y === y;
          const isBody = !isHead && snake.some((s) => s.x === x && s.y === y);
          const isFood = food.x === x && food.y === y;
          return (
            <div
              key={index}
              className={cn(
                'aspect-square rounded-[2px]',
                isHead
                  ? 'bg-primary'
                  : isBody
                    ? 'bg-primary/50'
                    : isFood
                      ? 'bg-rose-400/80'
                      : 'bg-white/5',
              )}
            />
          );
        })}
      </div>

      <div className="flex items-center justify-center gap-1.5 sm:hidden">
        {(
          [
            ['left', '←'],
            ['up', '↑'],
            ['down', '↓'],
            ['right', '→'],
          ] as Array<[Dir, string]>
        ).map(([d, glyph]) => (
          <Button key={d} size="sm" variant="outline" onClick={() => steer(d)}>
            {glyph}
          </Button>
        ))}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        {dead ? 'Vorbei — neu starten.' : 'Pfeiltasten, Wischen oder Buttons.'}
      </p>
    </div>
  );
}
