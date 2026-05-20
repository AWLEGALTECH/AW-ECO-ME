import { useRef, useState, forwardRef, type ReactNode, type MouseEvent } from "react";
import { cn } from "@/lib/utils";

interface SpotlightCardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  /** Pass a neon color swatch to tint the hover glow: 'purple' | 'cyan' | 'emerald' */
  glowColor?: "purple" | "cyan" | "emerald" | "none";
}

const glowMap = {
  purple:  { r: 139, g: 92,  b: 246 },
  cyan:    { r: 6,   g: 182, b: 212 },
  emerald: { r: 52,  g: 211, b: 153 },
  none:    { r: 255, g: 255, b: 255 },
};

export const SpotlightCard = forwardRef<HTMLDivElement, SpotlightCardProps>(
  ({ children, className, onClick, glowColor = "purple" }, forwardedRef) => {
    const internalRef = useRef<HTMLDivElement>(null);
    const ref = (forwardedRef as React.RefObject<HTMLDivElement>) || internalRef;
    const [coords, setCoords] = useState({ x: 0, y: 0 });
    const [isHovered, setIsHovered] = useState(false);

    const { r, g, b } = glowMap[glowColor];

    const handleMove = (e: MouseEvent) => {
      const el = typeof ref === "object" && ref?.current ? ref.current : internalRef.current;
      const rect = el?.getBoundingClientRect();
      if (!rect) return;
      setCoords({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    };

    return (
      <div
        ref={ref}
        onMouseMove={handleMove}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={onClick}
        className={cn(
          // Base glass card
          "spotlight-card group relative rounded-2xl border border-white/[0.07] p-6",
          "bg-white/[0.03] backdrop-blur-md",
          "shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.05)]",
          "transition-all duration-300",
          onClick && "cursor-pointer",
          className
        )}
        style={
          isHovered
            ? {
                background: `radial-gradient(480px circle at ${coords.x}px ${coords.y}px, rgba(${r},${g},${b},0.07), rgba(255,255,255,0.02) 55%, transparent 80%)`,
                borderColor: `rgba(${r},${g},${b},0.25)`,
                boxShadow: `0 8px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(${r},${g},${b},0.15), inset 0 1px 0 rgba(255,255,255,0.07)`,
              }
            : undefined
        }
      >
        {/* Subtle top-edge shimmer line */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px rounded-t-2xl"
          style={{
            background: isHovered
              ? `linear-gradient(90deg, transparent, rgba(${r},${g},${b},0.4), transparent)`
              : "linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)",
            transition: "background 0.3s ease",
          }}
        />
        {children}
      </div>
    );
  }
);

SpotlightCard.displayName = "SpotlightCard";