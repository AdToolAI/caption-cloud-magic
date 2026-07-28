import planen from "@/assets/hub-covers/planen.jpg";
import optimieren from "@/assets/hub-covers/optimieren.jpg";
import analysieren from "@/assets/hub-covers/analysieren.jpg";
import erstellen from "@/assets/hub-covers/erstellen.jpg";
import team from "@/assets/hub-covers/team.jpg";
import gaming from "@/assets/hub-covers/gaming.jpg";

/**
 * Hub-level cover assets in the Bond-2028 aesthetic (deep black + gold + cyan).
 * Used as the default cover for every card inside a hub. Individual items may
 * override with their own cover via `HubSubItem.cover`.
 */
export const hubCovers: Record<string, string> = {
  planen,
  optimieren,
  analysieren,
  erstellen,
  team,
  gaming,
  admin: analysieren,
};
