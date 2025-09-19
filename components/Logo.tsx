export default function Logo() {
  return (
    <div className="flex items-center gap-2">
      <div className="h-6 w-6 rounded-md bg-white/5 ring-1 ring-[#22262e] flex items-center justify-center">
        <span className="text-[10px] tracking-widest text-[var(--accent)]">C</span>
      </div>
      <span className="font-semibold tracking-widest text-[var(--text)]">
        COVEX
      </span>
    </div>
  );
}
