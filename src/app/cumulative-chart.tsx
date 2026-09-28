"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { YearRow } from "@/lib/model";
import { formatCompactDollars, formatDollars } from "@/lib/format";

interface Props {
  years: YearRow[];
  /** First year cumulative cash turns non-negative, or null. */
  paybackYear: number | null;
}

/**
 * Cumulative after-tax cash difference (program − keep working), year by year.
 * One series, so no legend: the heading names it. The crossover — the year the
 * line reaches zero — is marked with a dot and called out on the axis.
 */
export default function CumulativeChart({ years, paybackYear }: Props) {
  const data = years.map((y) => ({ year: y.k, cumDiff: y.cumDiff }));
  const crossover =
    paybackYear === null
      ? null
      : (data.find((d) => d.year === paybackYear) ?? null);

  return (
    <div className="h-64 w-full sm:h-72">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 16, right: 16, bottom: 4, left: 4 }}
        >
          <CartesianGrid stroke="var(--hairline)" vertical={false} />
          <XAxis
            dataKey="year"
            tickLine={false}
            axisLine={{ stroke: "var(--hairline)" }}
            tick={{ fill: "var(--muted)", fontSize: 12 }}
            tickMargin={8}
          />
          <YAxis
            tickFormatter={formatCompactDollars}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--muted)", fontSize: 12 }}
            width={64}
          />
          <ReferenceLine y={0} stroke="var(--muted)" />
          <Tooltip
            cursor={{ stroke: "var(--muted)" }}
            formatter={(value) => [
              formatDollars(Number(value)),
              "Cumulative difference",
            ]}
            labelFormatter={(label) => `Year ${label}`}
            contentStyle={{
              background: "var(--surface)",
              border: "1px solid var(--hairline)",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: "var(--ink)", fontWeight: 600 }}
            itemStyle={{ color: "var(--ink-secondary)" }}
          />
          <Line
            type="linear"
            dataKey="cumDiff"
            name="Cumulative difference"
            stroke="var(--accent)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }}
            isAnimationActive={false}
          />
          {crossover && (
            <ReferenceDot
              x={crossover.year}
              y={crossover.cumDiff}
              r={5}
              fill="var(--accent)"
              stroke="var(--surface)"
              strokeWidth={2}
              label={{
                value: `Pays off in year ${crossover.year}`,
                position: "top",
                fill: "var(--ink-secondary)",
                fontSize: 12,
              }}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
