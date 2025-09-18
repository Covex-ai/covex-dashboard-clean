export function When({ ts }: { ts?: string | null }) {
  if (!ts) return null;
  const t = new Date(ts).getTime();
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
  const str =
    mins < 1 ? 'just now' :
    mins < 60 ? `${mins}m ago` :
    mins < 60 * 24 ? `${Math.round(mins / 60)}h ago` :
    `${Math.round(mins / 1440)}d ago`;
  return <span className="text-[11px] text-[#9aa2ad] ml-2">• {str}</span>;
}
