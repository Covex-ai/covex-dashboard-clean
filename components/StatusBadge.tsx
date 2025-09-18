// components/StatusBadge.tsx
export type ApptStatus = 'Booked' | 'Rescheduled' | 'Cancelled' | 'Inquiry';

export default function StatusBadge({ status }: { status: ApptStatus }) {
  const styles: Record<ApptStatus, string> = {
    Booked:      'bg-[#0b2a17] text-[#7ee2a8] border border-[#124a2a]',
    Rescheduled: 'bg-[#2b1f00] text-[#f5c451] border border-[#6a4f00]',
    Cancelled:   'bg-[#2a0f12] text-[#ff8fa0] border border-[#5c1b24]',
    Inquiry:     'bg-[#1b2330] text-[#9aa2ad] border border-[#22262e]',
  };
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs ${styles[status]}`}>
      {status}
    </span>
  );
}
