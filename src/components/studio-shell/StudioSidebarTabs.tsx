/**
 * StudioSidebarTabs — icon-only vertical rail for studio sidebars.
 *
 * Fixed 56 px column on the left edge with vertically stacked icon buttons.
 * Labels are shown via Radix Tooltip on hover (right side) — same pattern used
 * by CapCut, Premiere, DaVinci Resolve, Figma, VS Code. No text under the icon,
 * so long labels ("Untertitel", "Einstellungen") can't clip.
 */

import type { ComponentType } from 'react';
import { TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
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
  /** Retained for API compatibility. */
  containerWidth?: number;
}

export function StudioSidebarTabs({ tabs, settingsTab }: StudioSidebarTabsProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <TabsList
        className={cn(
          'flex flex-col items-stretch gap-1 p-1.5 h-full w-14 flex-shrink-0',
          'bg-[#050816] border-r border-[#F5C76A]/10 rounded-none overflow-y-auto',
        )}
      >
        {tabs.map(({ value, icon: Icon, label, count, glow }) => (
          <Tooltip key={value}>
            <TooltipTrigger asChild>
              <TabsTrigger
                value={value}
                aria-label={label}
                className={cn(
                  'relative flex items-center justify-center py-3 px-1 rounded-lg min-h-[48px]',
                  'text-white/50 hover:text-white/90 hover:bg-white/5 transition-all',
                  'data-[state=active]:border-l-2 data-[state=active]:border-[#F5C76A]',
                  glow,
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {count && count > 0 ? (
                  <span className="absolute top-0.5 right-0.5 min-w-[14px] h-[14px] px-1 rounded-full bg-[#F5C76A]/20 text-[#F5C76A] text-[9px] font-semibold flex items-center justify-center">
                    {count > 99 ? '99+' : count}
                  </span>
                ) : null}
              </TabsTrigger>
            </TooltipTrigger>
            <TooltipContent side="right" className="bg-background/95 backdrop-blur-xl border-border shadow-xl">
              <p className="font-medium text-xs">
                {label}
                {count && count > 0 ? <span className="ml-1.5 text-[#F5C76A]">({count})</span> : null}
              </p>
            </TooltipContent>
          </Tooltip>
        ))}
        {settingsTab && (
          <>
            <div className="mt-auto h-px bg-[#F5C76A]/10 mx-1 my-1" />
            <Tooltip>
              <TooltipTrigger asChild>
                <TabsTrigger
                  value={settingsTab.value}
                  aria-label={settingsTab.label}
                  className={cn(
                    'relative flex items-center justify-center py-3 px-1 rounded-lg min-h-[48px]',
                    'text-white/40 hover:text-white/80 hover:bg-white/5 transition-all',
                    'data-[state=active]:border-l-2 data-[state=active]:border-white/60 data-[state=active]:text-white data-[state=active]:bg-white/5',
                  )}
                >
                  <settingsTab.icon className="h-5 w-5 shrink-0" />
                </TabsTrigger>
              </TooltipTrigger>
              <TooltipContent side="right" className="bg-background/95 backdrop-blur-xl border-border shadow-xl">
                <p className="font-medium text-xs">{settingsTab.label}</p>
              </TooltipContent>
            </Tooltip>
          </>
        )}
      </TabsList>
    </TooltipProvider>
  );
}
