"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { TaskRow, getTaskRowHeight } from "@/components/dashboard/TaskRow";
import { buildRowOffsets, getRowWindow } from "@/components/dashboard/taskWindow";
import type { HydrationTask } from "@/types/hydration";

/** Viewport height before measurement, equal to the container max height. */
const FALLBACK_VIEWPORT_HEIGHT = 600;

/**
 * Windowed task list. Only the rows in and near the viewport are in the DOM.
 * Each row has a fixed slot height from its data, so offsets come from prefix
 * sums without DOM measurement. List items carry aria-setsize and
 * aria-posinset so screen readers report the full list size.
 */
export function VirtualTaskList({ tasks }: { tasks: HydrationTask[] }): React.JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(FALLBACK_VIEWPORT_HEIGHT);

  const offsets = useMemo(() => buildRowOffsets(tasks.map(getTaskRowHeight)), [tasks]);
  const { start, end } = getRowWindow(offsets, scrollTop, viewportHeight);
  const totalHeight = offsets[tasks.length];

  useEffect(() => {
    const element = scrollRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      setViewportHeight(element.clientHeight || FALLBACK_VIEWPORT_HEIGHT);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  const handleScroll = (): void => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      if (scrollRef.current) setScrollTop(scrollRef.current.scrollTop);
    });
  };

  const visibleRows: React.JSX.Element[] = [];
  for (let index = start; index < end; index += 1) {
    const task = tasks[index];
    visibleRows.push(
      <li
        key={task.id}
        aria-posinset={index + 1}
        aria-setsize={tasks.length}
        className="absolute inset-x-0 pb-2"
        style={{ top: offsets[index], height: offsets[index + 1] - offsets[index] }}
      >
        <TaskRow task={task} fixedHeight />
      </li>,
    );
  }

  return (
    <div
      ref={scrollRef}
      role="region"
      aria-label={`Task list, ${tasks.length} tasks`}
      tabIndex={0}
      onScroll={handleScroll}
      className="max-h-[600px] overflow-y-auto pr-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ol aria-label="Hydration tasks" className="relative" style={{ height: totalHeight }}>
        {visibleRows}
      </ol>
    </div>
  );
}
