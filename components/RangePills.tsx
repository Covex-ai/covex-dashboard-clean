"use client";

type Range = "7d" | "30d" | "90d";

export default function RangePills({
  value,
  onChange,
  className = "",
}: {
  value: Range;
  onChange: (v: Range) => void;
  className?: string;
}) {
  const opts: Range[] = ["7d", "30d", "90d"];
  return (
    <div className={`flex gap-2 ${className}`}>
      {opts.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={`btn-pill ${opt === value ? "btn-pill--active" : ""}`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}
