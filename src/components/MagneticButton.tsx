import { useRef, type ReactNode } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";
import { cn } from "@/lib/utils";

interface MagneticButtonProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  variant?: "primary" | "ghost";
}

export function MagneticButton({ children, className, onClick, variant = "primary" }: MagneticButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 300, damping: 20 });
  const springY = useSpring(y, { stiffness: 300, damping: 20 });

  const handleMove = (e: React.MouseEvent) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    x.set((e.clientX - cx) * 0.3);
    y.set((e.clientY - cy) * 0.3);
  };

  const handleLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.button
      ref={ref}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      onClick={onClick}
      style={{ x: springX, y: springY }}
      className={cn(
        "magnetic-btn relative inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold transition-colors",
        variant === "primary" &&
          "bg-gradient-to-r from-[hsl(210,80%,50%)] to-[hsl(230,70%,55%)] text-white shadow-[0_0_20px_hsla(210,80%,50%,0.3)] hover:shadow-[0_0_30px_hsla(210,80%,50%,0.5)]",
        variant === "ghost" &&
          "border border-[hsl(0,0%,20%)] text-[hsl(0,0%,70%)] hover:bg-[hsl(0,0%,12%)] hover:text-white",
        className
      )}
    >
      {children}
    </motion.button>
  );
}