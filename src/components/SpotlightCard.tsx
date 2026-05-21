import { useRef, useState, forwardRef, type ReactNode, type MouseEvent } from "react";
import { cn } from "@/lib/utils";

interface SpotlightCardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

export const SpotlightCard = forwardRef<HTMLDivElement, SpotlightCardProps>(
  ({ children, className, onClick }, forwardedRef) => {
    const internalRef = useRef<HTMLDivElement>(null);
    const ref = (forwardedRef as React.RefObject<HTMLDivElement>) || internalRef;
    const [coords, setCoords] = useState({ x: 0, y: 0 });
    const [isHovered, setIsHovered] = useState(false);

    const handleMove = (e: MouseEvent) => {
      const el = typeof ref === "object" && ref?.current ? ref.current : internalRef.current;
      const rect = el?.getBoundingClientRect();
      if (!rect) return;
      setCoords({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    };

    // Glow puxa o --primary do tema (HSL → usado direto em hsla)
    const glow = "hsl(var(--primary))";
    const glowAlpha = (a: number) => `hsla(var(--primary-h, var(--primary)) / ${a})`;

    return (
      <div
        ref={ref}
        onMouseMove={handleMove}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={onClick}
        className={cn(
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
                background: `radial-gradient(480px circle at ${coords.x}px ${coords.y}px, hsla(var(--primary) / 0.08), rgba(255,255,255,0.02) 55%, transparent 80%)`,
                borderColor: `hsla(var(--primary) / 0.30)`,
                boxShadow: `0 8px 40px rgba(0,0,0,0.5), 0 0 0 1px hsla(var(--primary) / 0.18), inset 0 1px 0 rgba(255,255,255,0.07)`,
              }
            : undefined
        }
      >
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px rounded-t-2xl"
          style={{
            background: isHovered
              ? `linear-gradient(90deg, transparent, hsla(var(--primary) / 0.5), transparent)`
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
