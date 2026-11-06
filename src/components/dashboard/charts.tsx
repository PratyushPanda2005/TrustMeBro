"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts"

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import { amount, date, pct } from "@/lib/trade/format"
import type { ScorePoint } from "@/lib/trade/types"

function NoData() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>No data yet</EmptyTitle>
        <EmptyDescription>
          This fills in once deals have settled.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

/** Monthly totals. Series stack, so one axis always holds. */
export function MonthlyBars({
  data,
  series,
}: {
  data: Record<string, number | string>[]
  series: { key: string; label: string }[]
}) {
  if (data.length === 0) return <NoData />
  const config: ChartConfig = Object.fromEntries(
    series.map((item, index) => [
      item.key,
      { label: item.label, color: `var(--chart-${index + 1})` },
    ]),
  )
  return (
    <ChartContainer config={config} className="h-64 w-full">
      <BarChart accessibilityLayer data={data}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="month" tickLine={false} axisLine={false} />
        <YAxis
          width={52}
          tickLine={false}
          axisLine={false}
          tickFormatter={amount}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        {series.length > 1 ? (
          <ChartLegend content={<ChartLegendContent />} />
        ) : null}
        {series.map((item, index) => (
          <Bar
            key={item.key}
            dataKey={item.key}
            stackId="total"
            fill={`var(--color-${item.key})`}
            maxBarSize={44}
            stroke="var(--card)"
            strokeWidth={2}
            radius={index === series.length - 1 ? [4, 4, 0, 0] : 0}
          />
        ))}
      </BarChart>
    </ChartContainer>
  )
}

/** Score after each event. `transform` turns the stored bps into what's shown. */
export function ScoreLine({
  history,
  label,
  transform = (bps) => bps,
}: {
  history: ScorePoint[]
  label: string
  transform?: (bps: number) => number
}) {
  const data = history.map((point) => ({
    when: date(point.at),
    score: transform(point.scoreBps) / 100,
  }))
  const config: ChartConfig = { score: { label, color: "var(--chart-1)" } }
  return (
    <ChartContainer config={config} className="h-64 w-full">
      <LineChart accessibilityLayer data={data} margin={{ left: 8, right: 16 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="when"
          tickLine={false}
          axisLine={false}
          minTickGap={32}
        />
        <YAxis
          width={44}
          domain={[0, 100]}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value: number) => `${value}%`}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value) => (
                <span className="tabular-nums">
                  {label}: {pct(Number(value) * 100)}
                </span>
              )}
            />
          }
        />
        <Line
          dataKey="score"
          type="monotone"
          isAnimationActive={false}
          stroke="var(--color-score)"
          strokeWidth={2}
          dot={{
            r: 4,
            strokeWidth: 2,
            stroke: "var(--card)",
            fill: "var(--color-score)",
          }}
        />
      </LineChart>
    </ChartContainer>
  )
}
