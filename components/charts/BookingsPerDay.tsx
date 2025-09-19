'use client';

import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, DotProps
} from 'recharts';

type Point = { day: string; count: number };

export default function BookingsPerDay({ data }: { data: Point[] }) {
  return (
    <div className="panel p-4 h-[320px]">
      <div className="text-sm text-[var(--subtle)] mb-3">Bookings per day (last 30 days)</div>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="day" tickMargin={8} />
          <YAxis allowDecimals={false} tickMargin={8} />
          <Tooltip
            contentStyle={{ background: 'var(--panel-2)', borderColor: 'var(--border)' }}
            labelStyle={{ color: 'var(--accent)' }}
          />
          <Line
            type="monotone"
            dataKey="count"
            stroke="#e7e9ee"
            strokeWidth={2}
            dot={{ r: 4, stroke: '#0ea5e9', strokeWidth: 2 }}
            activeDot={(props: DotProps) => (
              <circle cx={props.cx} cy={props.cy} r={6} fill="#0ea5e9" />
            )}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
