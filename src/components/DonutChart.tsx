import { useState } from "react";
import { PieChart, Pie, Cell, Sector, ResponsiveContainer } from "recharts";

const COLORS = [
  "hsl(270, 100%, 50%)",
  "hsl(270, 80%, 65%)",
  "hsl(270, 60%, 40%)",
  "hsl(0, 0%, 55%)",
  "hsl(270, 40%, 75%)",
  "hsl(0, 0%, 40%)",
];

interface DonutChartProps {
  data: { name: string; value: number }[];
  height?: number;
  emptyMessage?: string;
  onSliceClick?: (name: string) => void;
}

const renderActiveShape = (props: any) => {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload, percent, value } = props;
  return (
    <g>
      <text x={cx} y={cy - 8} textAnchor="middle" fill="hsl(0,0%,100%)" fontSize={14} fontWeight={600}>
        {payload.name}
      </text>
      <text x={cx} y={cy + 14} textAnchor="middle" fill="hsl(0,0%,69%)" fontSize={12}>
        {value} ({(percent * 100).toFixed(0)}%)
      </text>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 8}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        style={{ filter: "drop-shadow(0 0 8px hsla(270,100%,50%,0.3))" }}
      />
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius - 4}
        outerRadius={innerRadius - 1}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
    </g>
  );
};

export function DonutChart({ data, height = 280, emptyMessage = "Sem dados", onSliceClick }: DonutChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | undefined>(undefined);
  const total = data.reduce((s, d) => s + d.value, 0);

  if (!data.length) {
    return <p className="text-center text-muted-foreground py-8">{emptyMessage}</p>;
  }

  return (
    <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
      <div className="w-full sm:flex-1 min-w-0">
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            <Pie
              activeIndex={activeIndex}
              activeShape={renderActiveShape}
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={85}
              dataKey="value"
              onMouseEnter={(_, index) => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(undefined)}
              onClick={(_, index) => onSliceClick?.(data[index].name)}
              style={onSliceClick ? { cursor: "pointer" } : undefined}
              animationBegin={0}
              animationDuration={800}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="hsl(var(--card))" strokeWidth={2} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-row flex-wrap sm:flex-col gap-2 sm:min-w-[140px] justify-center">
        {data.map((entry, i) => (
          <div
            key={entry.name}
            className="flex items-center gap-2 text-sm cursor-pointer transition-opacity"
            style={{ opacity: activeIndex !== undefined && activeIndex !== i ? 0.4 : 1 }}
            onMouseEnter={() => setActiveIndex(i)}
            onMouseLeave={() => setActiveIndex(undefined)}
            onClick={() => onSliceClick?.(entry.name)}
          >
            <span
              className="h-2.5 w-2.5 rounded-full shrink-0"
              style={{ backgroundColor: COLORS[i % COLORS.length] }}
            />
            <span className="text-muted-foreground truncate">{entry.name}</span>
            <span className="ml-auto font-medium text-foreground tabular-nums">
              {total > 0 ? ((entry.value / total) * 100).toFixed(0) : 0}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}