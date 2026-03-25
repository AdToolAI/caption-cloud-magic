interface StatusPillProps {
  status: string;
}

const statusConfig: Record<string, { label: string; color: string }> = {
  draft: { label: 'Entwurf', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  scheduled: { label: 'Geplant', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  published: { label: 'Veröffentlicht', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  failed: { label: 'Fehlgeschlagen', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  suggested: { label: 'Vorgeschlagen', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
  missed: { label: 'Verpasst', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
};

const fallbackConfig = { label: 'Unbekannt', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' };

export function StatusPill({ status }: StatusPillProps) {
  const config = statusConfig[status] ?? fallbackConfig;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-full ${config.color}`}>
      {config.label}
    </span>
  );
}
