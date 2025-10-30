interface StatusPillProps {
  status: 'draft' | 'scheduled' | 'published' | 'failed';
}

const statusConfig = {
  draft: { label: 'Entwurf', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  scheduled: { label: 'Geplant', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  published: { label: 'Veröffentlicht', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  failed: { label: 'Fehlgeschlagen', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
};

export function StatusPill({ status }: StatusPillProps) {
  const config = statusConfig[status];
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-full ${config.color}`}>
      {config.label}
    </span>
  );
}
