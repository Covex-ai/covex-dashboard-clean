'use client';

import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';

type Row = { service: string; revenue: number };

export default function RevenueByService({ data }: { data: Row[] }) {
  return (
    <div className="panel p-4 h-[320px]">
      <div className="text-sm text-[var(--subtle)] mb-3">Revenue by service (last 30 days)</div>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barSize={28}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="service" interval={0} tickMargin={10} />
          <YAxis tickMargin={8} />
          <Tooltip
            formatter={(v: number) => [`$${v.toFixed(2)}`, 'Revenue']}
            contentStyle={{ background: 'var(--panel-2)', borderColor: 'var(--border)' }}
            labelStyle={{ color: 'var(--accent)' }}
          />
          <Bar dataKey="revenue" fill="#e7e9ee" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
