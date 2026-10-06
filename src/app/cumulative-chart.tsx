"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { YearRow } from "@/lib/model";
import type { BandPoint } from "@/lib/scenarios";
import { formatCompactDollars, formatDollars } from "@/lib/format";

interface Props {
  /** The selected scenario's years; its line is drawn solid. */
  years: YearRow[];
  /** First year cumulative cash turns non-negative, or null. */
  paybackYear: number | null;
  /** Pessimistic-to-optimistic range, shaded behind the line. */
  band?: BandPoint[];
}

/**
 * Cumulative after-tax cash difference (program − keep working), year by year.
 * The selected scenario is the line; the shaded band runs from the pessimistic
 * to the optimistic scenario, so the spread of outcomes shows at a glance. The
 * crossover — the year the line reaches zero — is marked with a dot.
 */
export default function CumulativeChart({ years, paybackYear, band }: Props) {
  const data = years.map((y, i) => ({
    year: y.k,
    cumDiff: y.cumDiff,
    range: band?.[i] ? [band[i].low, band[i].high] : undefined,
  }));
  const crossover =
    paybackYear === null
      ? null
      : (data.find((d) => d.year === paybackYear) ?? null);

  return (
    <div className="h-64 w-full sm:h-72">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
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
          {band && (
            <Area
              type="linear"
              dataKey="range"
              name="Pessimistic to optimistic"
              fill="var(--accent)"
              fillOpacity={0.15}
              stroke="none"
              activeDot={false}
              isAnimationActive={false}
            />
          )}
          <Tooltip
            cursor={{ stroke: "var(--muted)" }}
            formatter={(value, name) =>
              Array.isArray(value)
                ? [
                    `${formatDollars(Number(value[0]))} to ${formatDollars(Number(value[1]))}`,
                    name,
                  ]
                : [formatDollars(Number(value)), "Cumulative difference"]
            }
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
                // A label centred over the dot runs off the plot when payback
                // lands near either end of the horizon. Anchor it on the side
                // with room: text runs left of a dot in the right half, and
                // right of one in the left half.
                content: ({ viewBox }) => {
                  if (!viewBox || !("x" in viewBox)) return null;
                  const cx = viewBox.x + viewBox.width / 2;
                  const onRight = crossover.year > (data.length + 1) / 2;
                  return (
                    <text
                      x={onRight ? cx - 4 : cx + 4}
                      y={viewBox.y - 6}
                      textAnchor={onRight ? "end" : "start"}
                      fill="var(--ink-secondary)"
                      fontSize={12}
                    >
                      Pays off in year {crossover.year}
                    </text>
                  );
                },
              }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
