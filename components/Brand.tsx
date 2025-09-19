"use client";

import Image from "next/image";

export default function Brand() {
  return (
    <div className="h-16 px-5 flex items-center gap-3 border-b border-cx-border">
      {/* Tiny rounded “C” tile for that badge-y feel */}
      <div className="w-6 h-6 rounded-md bg-cx-bg grid place-items-center border border-cx-border">
        <span className="text-xs text-cx-muted">C</span>
      </div>
      {/* Wordmark: use your exact SVG for full fidelity */}
      <Image
        src="/covex-wordmark.svg"       /* <- put your landing site's wordmark here */
        alt="COVEX"
        width={86}
        height={18}
        priority
      />
    </div>
  );
}
