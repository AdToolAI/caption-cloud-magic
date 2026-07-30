/**
 * Warte-Lounge-Panel — Infos oder Spiele, während der Film produziert wird.
 *
 * Der State liegt bewusst hier oben und ist vom Produktions-Polling entkoppelt:
 * ein laufendes Spiel darf durch ein Status-Update nicht zurückgesetzt werden.
 */

import { Suspense, lazy, useState } from 'react';
import { Gamepad2, Newspaper } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { InfoFeed } from '@/components/autopilot/lounge/InfoFeed';
import { StageProgressBar } from '@/components/autopilot/StageProgressBar';
import { cn } from '@/lib/utils';

const Solitaire = lazy(() => import('@/components/autopilot/lounge/games/Solitaire'));
const ChessGame = lazy(() => import('@/components/autopilot/lounge/games/ChessGame'));
const Game2048 = lazy(() => import('@/components/autopilot/lounge/games/Game2048'));

const TAB_KEY = 'autopilot.lounge.tab';
const GAME_KEY = 'autopilot.lounge.game';

type GameId = 'solitaire' | 'chess' | '2048';

const GAMES: Array<{ id: GameId; label: string }> = [
  { id: 'solitaire', label: 'Solitär' },
  { id: 'chess', label: 'Schach' },
  { id: '2048', label: '2048' },
];

interface Props {
  brandKitId?: string | null;
  language?: string;
}

export function LoungePanel({ brandKitId, language }: Props) {
  const [tab, setTab] = useState<string>(() => localStorage.getItem(TAB_KEY) ?? 'infos');
  const [game, setGame] = useState<GameId>(
    () => (localStorage.getItem(GAME_KEY) as GameId | null) ?? 'solitaire',
  );

  return (
    <Card className="border-primary/20 bg-card/60 p-4 backdrop-blur">
      <h3 className="font-display text-sm font-semibold text-foreground">Warte-Lounge</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Die Produktion läuft im Hintergrund weiter — auch wenn du hier spielst.
      </p>

      <Tabs
        value={tab}
        onValueChange={(value) => {
          setTab(value);
          localStorage.setItem(TAB_KEY, value);
        }}
        className="mt-3"
      >
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="infos" className="gap-1.5">
            <Newspaper className="h-3.5 w-3.5" />
            Infos
          </TabsTrigger>
          <TabsTrigger value="spiele" className="gap-1.5">
            <Gamepad2 className="h-3.5 w-3.5" />
            Spiele
          </TabsTrigger>
        </TabsList>

        <TabsContent value="infos" className="mt-3">
          <InfoFeed brandKitId={brandKitId} language={language} />
        </TabsContent>

        {/* forceMount: das Spiel darf beim Tab-Wechsel nicht verloren gehen. */}
        <TabsContent value="spiele" forceMount className={cn('mt-3', tab !== 'spiele' && 'hidden')}>
          <div className="mb-3 flex gap-1.5">
            {GAMES.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => {
                  setGame(entry.id);
                  localStorage.setItem(GAME_KEY, entry.id);
                }}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs transition-colors',
                  game === entry.id
                    ? 'border-primary/60 bg-primary/15 text-foreground'
                    : 'border-border/50 text-muted-foreground hover:text-foreground',
                )}
              >
                {entry.label}
              </button>
            ))}
          </div>

          <Suspense fallback={<StageProgressBar label="Spiel wird geladen" />}>
            {game === 'solitaire' && <Solitaire />}
            {game === 'chess' && <ChessGame />}
            {game === '2048' && <Game2048 />}
          </Suspense>
        </TabsContent>
      </Tabs>
    </Card>
  );
}
