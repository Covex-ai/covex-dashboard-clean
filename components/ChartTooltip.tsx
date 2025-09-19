export function ChartTooltip({
  label,
  items,
}: {
  label?: string;
  items?: { name: string; value: number | string }[];
}) {
  return (
    <div className="recharts-default-tooltip p-2">
      {label ? <div className="text-xs text-cx-muted mb-1">{label}</div> : null}
      <div className="space-y-1">
        {(items ?? []).map((i) => (
          <div key={`${i.name}`} className="text-sm flex items-center gap-2">
            <span className="text-cx-muted">{i.name}:</span>
            <span className="text-cx-text">{i.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
