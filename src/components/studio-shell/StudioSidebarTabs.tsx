/**
 * StudioSidebarTabs — responsive Radix Tabs header for studio sidebars.
 *
 * Renders three layouts based on the available container width:
 *  - `< 200 px` Rail: icon-only column, tooltip via `title`, badge as dot.
 *  - `200–360 px` Compact: 3-col icon + tiny truncated label, badge top-right.
 *  - `>= 360 px` Expanded: full 3-col icon + uppercase label + badge.
 *
 * Settings tab is always rendered in its own row. Uses shadcn Tabs
 * primitives so Radix keyboard/ARIA semantics stay intact.
 */

import type { ComponentType } from 'react';
import { TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

export interface StudioSidebarTab {
  value: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
  count?: number;
  /** Radix `data-[state=active]` glow classes for the active state. */
  glow?: string;
}

export interface StudioSidebarTabsProps {
  tabs: StudioSidebarTab[];
  settingsTab?: StudioSidebarTab;
  /** Measured container width in px; drives which layout renders. */
  containerWidth: number;
}

const RAIL_BREAKPOINT = 200;
const COMPACT_BREAKPOINT = 360;

export function StudioSidebarTabs({ tabs, settingsTab, containerWidth }: StudioSidebarTabsProps) {
  const mode: 'rail' | 'compact' | 'expanded' =
    containerWidth > 0 && containerWidth < RAIL_BREAKPOINT
      ? 'rail'
      : containerWidth < COMPACT_BREAKPOINT
        ? 'compact'
        : 'expanded';

  if (mode === 'rail') {
    return (
      <TabsList className="flex flex-col gap-1 p-1.5 bg-[#050816] border-b border-[#F5C76A]/10 h-auto rounded-none w-full">
        {tabs.map(({ value, icon: Icon, label, count, glow }) => (
          <TabsTrigger
            key={value}
            value={value}
            title={count && count > 0 ? `${label} (${count})` : label}
            aria-label={label}
            className={cn(
              'relative flex items-center justify-center h-9 w-9 mx-auto rounded-lg text-white/50 hover:text-white/80 hover:bg-white/5 transition-all',
              glow,
            )}
          >
            <Icon className="h-4 w-4" />
            {count && count > 0 ? (
              <span className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-[#F5C76A] shadow-[0_0_6px_rgba(245,199,106,0.8)]" />
            ) : null}
          </TabsTrigger>
        ))}
        {settingsTab && (
          <TabsTrigger
            value={settingsTab.value}
            title={settingsTab.label}
            aria-label={settingsTab.label}
            className="mt-1 flex items-center justify-center h-8 w-8 mx-auto rounded-lg data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/40 hover:text-white/70 hover:bg-white/5 transition-all"
          >
            <settingsTab.icon className="h-3.5 w-3.5" />
          </TabsTrigger>
        )}
      </TabsList>
    );
  }

  const showLabel = mode !== 'rail';
  const isExpanded = mode === 'expanded';

  return (
    <TabsList className="flex flex-col gap-1 p-1.5 bg-[#050816] border-b border-[#F5C76A]/10 h-auto rounded-none w-full">
      <div className="grid grid-cols-3 gap-1 w-full">
        {tabs.map(({ value, icon: Icon, label, count, glow }) => (
          <TabsTrigger
            key={value}
            value={value}
            title={label}
            className={cn(
              'relative flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-lg text-white/50 hover:text-white/80 hover:bg-white/5 transition-all min-w-0',
              glow,
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {showLabel && (
              <span
                className={cn(
                  'text-[10px] font-medium leading-none tracking-wide uppercase truncate max-w-full',
                  !isExpanded && 'text-[9px]',
                )}
              >
                {label}
              </span>
            )}
            {count && count > 0 ? (
              <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-[#F5C76A]/20 text-[#F5C76A] text-[9px] font-semibold flex items-center justify-center">
                {count > 99 ? '99+' : count}
              </span>
            ) : null}
          </TabsTrigger>
        ))}
      </div>
      {settingsTab && (
        <TabsTrigger
          value={settingsTab.value}
          title={settingsTab.label}
          className="flex items-center justify-center gap-1.5 py-1 rounded-lg data-[state=active]:bg-white/10 data-[state=active]:text-white data-[state=active]:shadow-[0_0_8px_rgba(255,255,255,0.1)] text-white/40 hover:text-white/70 hover:bg-white/5 transition-all"
        >
          <settingsTab.icon className="h-3 w-3" />
          <span className="text-[10px] tracking-wide uppercase truncate">{settingsTab.label}</span>
        </TabsTrigger>
      )}
    </TabsList>
  );
}
