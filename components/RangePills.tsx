"use client";

type Props = {
  value: number;                // 7 | 30 | 90
  onChange: (days: number) => void;
  compact?: boolean;
  ariaLabel?: string;
};

export default function RangePills({ value, onChange, compact, ariaLabel }: Props) {
  const items = [7, 30, 90];
  return (
    <div className="c-pills" aria-label={ariaLabel ?? "Range selector"}>
      {items.map((d) => (
        <button
          key={d}
          type="button"
          className="c-pill"
            data-active={value === d}
          onClick={() => onChange(d)}
        >
          {d}d
        </button>
      ))}
    </div>
  );
}
