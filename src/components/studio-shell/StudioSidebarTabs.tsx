/**
 * StudioSidebarTabs — vertical icon-rail for studio sidebars.
 *
 * Fixed 56px-wide column on the left edge with vertically stacked tabs
 * (icon + tiny 2-line label). Feature-set grows downward, never sideways —
 * same pattern used by CapCut, Descript, Premiere, Resolve, Figma, VS Code.
 *
 * Active tab: subtle bg glow + gold left-border accent. Badge as a small
 * count pill top-right (dot fallback when > 0). Settings tab is pinned to
 * the bottom with `mt-auto` and separated by a hairline divider.
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
  /** Retained for API compatibility; layout is width-independent now. */
  containerWidth?: number;
}

export function StudioSidebarTabs({ tabs, settingsTab }: StudioSidebarTabsProps) {
  return (
    <TabsList
      className={cn(
        'flex flex-col items-stretch gap-1 p-1.5 h-full w-14 flex-shrink-0',
        'bg-[#050816] border-r border-[#F5C76A]/10 rounded-none overflow-y-auto',
      )}
    >
      {tabs.map(({ value, icon: Icon, label, count, glow }) => (
        <TabsTrigger
          key={value}
          value={value}
          title={count && count > 0 ? `${label} (${count})` : label}
          aria-label={label}
          className={cn(
            'relative flex flex-col items-center justify-center gap-0.5 py-2 px-1 rounded-lg',
            'text-white/50 hover:text-white/90 hover:bg-white/5 transition-all min-h-[52px]',
            'data-[state=active]:border-l-2 data-[state=active]:border-[#F5C76A]',
            glow,
          )}
        >
          <Icon className="h-[18px] w-[18px] shrink-0" />
          <span className="text-[9px] font-medium leading-tight tracking-wide uppercase text-center line-clamp-2 max-w-full break-words">
            {label}
          </span>
          {count && count > 0 ? (
            <span className="absolute top-0.5 right-0.5 min-w-[14px] h-[14px] px-1 rounded-full bg-[#F5C76A]/20 text-[#F5C76A] text-[9px] font-semibold flex items-center justify-center">
              {count > 99 ? '99+' : count}
            </span>
          ) : null}
        </TabsTrigger>
      ))}
      {settingsTab && (
        <>
          <div className="mt-auto h-px bg-[#F5C76A]/10 mx-1 my-1" />
          <TabsTrigger
            value={settingsTab.value}
            title={settingsTab.label}
            aria-label={settingsTab.label}
            className={cn(
              'relative flex flex-col items-center justify-center gap-0.5 py-2 px-1 rounded-lg',
              'text-white/40 hover:text-white/80 hover:bg-white/5 transition-all min-h-[48px]',
              'data-[state=active]:border-l-2 data-[state=active]:border-white/60 data-[state=active]:text-white data-[state=active]:bg-white/5',
            )}
          >
            <settingsTab.icon className="h-4 w-4 shrink-0" />
            <span className="text-[9px] font-medium leading-tight tracking-wide uppercase text-center line-clamp-2 max-w-full break-words">
              {settingsTab.label}
            </span>
          </TabsTrigger>
        </>
      )}
    </TabsList>
  );
}
