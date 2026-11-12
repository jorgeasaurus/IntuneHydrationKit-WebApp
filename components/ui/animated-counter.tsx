"use client";

import { useEffect, useRef, useState } from "react";
import {
  useInView,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "framer-motion";

interface AnimatedCounterProps {
  value: number;
  direction?: "up" | "down";
  className?: string;
  duration?: number;
}

/**
 * Shrink the observer root only at the top and bottom. A horizontal inset
 * stops counters near the viewport edges (for example on a 375px phone)
 * from entering view, so they stay at their start value.
 */
const IN_VIEW_MARGIN = "-100px 0px -100px 0px";

export function AnimatedCounter({
  value,
  direction = "up",
  className = "",
  duration = 1.5,
}: AnimatedCounterProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const prefersReducedMotion = useReducedMotion() ?? false;
  const startValue = direction === "down" ? value : 0;
  const endValue = direction === "down" ? 0 : value;
  const motionValue = useMotionValue(startValue);
  const springValue = useSpring(motionValue, {
    damping: 50,
    stiffness: 100,
    duration: duration * 1000,
  });
  const isInView = useInView(ref, { once: true, margin: IN_VIEW_MARGIN });
  const [displayValue, setDisplayValue] = useState(startValue);

  useEffect(() => {
    if (isInView && !prefersReducedMotion) {
      motionValue.set(endValue);
    }
  }, [motionValue, isInView, endValue, prefersReducedMotion]);

  useEffect(() => {
    const unsubscribe = springValue.on("change", (latest) => {
      setDisplayValue(Math.round(latest));
    });
    return () => unsubscribe();
  }, [springValue]);

  const renderedValue = prefersReducedMotion ? endValue : displayValue;

  return (
    <span ref={ref} className={className}>
      {renderedValue.toLocaleString()}
    </span>
  );
}
