import { useMemo, useState } from "react";
import { PieChart, Pie, Cell, Sector, ResponsiveContainer } from "recharts";
import { AnimatePresence, motion } from "framer-motion";
import { useTheme } from "@/hooks/useTheme";

// 4 tons do accent + 2 cinzas neutros. Recharts seta fill direto no SVG,
// que nao expande var(), entao computo os hsl() literais por paleta.
const PALETTES: Record<string, string[]> = {
  default: [
    "hsl(270, 100%, 62%)",
    "hsl(270, 80%, 72%)",
    "hsl(270, 65%, 46%)",
    "hsl(270, 40%, 78%)",
    "hsl(0, 0%, 55%)",
    "hsl(0, 0%, 38%)",
  ],
  "midnight-blue": [
    "hsl(222, 90%, 58%)",
    "hsl(222, 75%, 72%)",
    "hsl(222, 80%, 40%)",
    "hsl(222, 45%, 78%)",
    "hsl(0, 0%, 55%)",
    "hsl(0, 0%, 38%)",
  ],
  "space-gray": [
    "hsl(215, 18%, 62%)",
    "hsl(215, 12%, 75%)",
    "hsl(215, 20%, 45%)",
    "hsl(215, 8%, 82%)",
    "hsl(0, 0%, 55%)",
    "hsl(0, 0%, 38%)",
  ],
};

interface DonutChartProps {
  data: { name: string; value: number }[];
  height?: number;
  emptyMessage?: string;
  onSliceClick?: (name: string) => void;
}

const renderActiveShape = (props: any) => {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
  return (
    <Sector
      cx={cx}
      cy={cy}
      innerRadius={innerRadius}
      outerRadius={outerRadius + 3}
      startAngle={startAngle}
      endAngle={endAngle}
      fill={fill}
    />
  );
};

export function DonutChart({ data, height = 280, emptyMessage = "Sem dados", onSliceClick }: DonutChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | undefined>(undefined);
  const { palette } = useTheme();
  const COLORS = useMemo(() => PALETTES[palette] || PALETTES.default, [palette]);
  const total = data.reduce((s, d) => s + d.value, 0);

  if (!data.length) {
    return <p className="text-center text-muted-foreground py-8">{emptyMessage}</p>;
  }

  const active = activeIndex !== undefined ? data[activeIndex] : undefined;
  const activePct = active && total > 0 ? Math.round((active.value / total) * 100) : 0;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
      <div className="relative w-full sm:flex-1 min-w-0" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              activeIndex={activeIndex}
              activeShape={renderActiveShape}
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={62}
              outerRadius={90}
              paddingAngle={1.5}
              cornerRadius={4}
              dataKey="value"
              onMouseEnter={(_, index) => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(undefined)}
              onClick={(_, index) => onSliceClick?.(data[index].name)}
              style={onSliceClick ? { cursor: "pointer" } : undefined}
              animationBegin={0}
              animationDuration={650}
              animationEasing="ease-out"
            >
              {data.map((_, i) => (
                <Cell
                  key={i}
                  fill={COLORS[i % COLORS.length]}
                  stroke="transparent"
                  style={{
                    transition: "opacity 240ms ease, filter 240ms ease",
                    opacity: activeIndex === undefined || activeIndex === i ? 1 : 0.35,
                    outline: "none",
                  }}
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        {/* Center label — animated with Framer Motion */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <AnimatePresence mode="wait">
            {active ? (
              <motion.div
                key={active.name}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
              >
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground max-w-[120px] truncate mx-auto">
                  {active.name}
                </p>
                <p className="text-2xl font-medium tabular-nums mt-0.5">{active.value}</p>
                <p className="text-[11px] text-muted-foreground tabular-nums">{activePct}%</p>
              </motion.div>
            ) : (
              <motion.div
                key="total"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
              >
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Total</p>
                <p className="text-2xl font-medium tabular-nums mt-0.5">{total}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="flex flex-row flex-wrap sm:flex-col gap-1.5 sm:min-w-[150px] justify-center">
        {data.map((entry, i) => {
          const pct = total > 0 ? Math.round((entry.value / total) * 100) : 0;
          const isActive = activeIndex === i;
          const isDimmed = activeIndex !== undefined && !isActive;
          return (
            <div
              key={entry.name}
              className="flex items-center gap-2 text-sm cursor-pointer rounded-md px-2 py-1 transition-all duration-200"
              style={{
                opacity: isDimmed ? 0.4 : 1,
                background: isActive ? "rgba(255,255,255,0.04)" : "transparent",
              }}
              onMouseEnter={() => setActiveIndex(i)}
              onMouseLeave={() => setActiveIndex(undefined)}
              onClick={() => onSliceClick?.(entry.name)}
            >
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0 transition-transform duration-200"
                style={{
                  backgroundColor: COLORS[i % COLORS.length],
                  transform: isActive ? "scale(1.3)" : "scale(1)",
                }}
              />
              <span className="text-muted-foreground truncate flex-1">{entry.name}</span>
              <span className="font-medium text-foreground tabular-nums">{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
