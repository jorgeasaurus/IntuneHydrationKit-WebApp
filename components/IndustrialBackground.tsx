"use client";

import { useEffect, useRef } from "react";

const GRID_SIZE = 40;
const LINE_COLOR = "148, 163, 184"; // slate-400

export function IndustrialBackground(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    let time = 0;

    function resize(): void {
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }

    function drawGrid(): void {
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const isDark = document.documentElement.classList.contains("dark");
      const baseAlpha = isDark ? 0.08 : 0.06;
      const accentAlpha = isDark ? 0.4 : 0.25;

      // Draw base grid
      ctx.strokeStyle = `rgba(${LINE_COLOR}, ${baseAlpha})`;
      ctx.lineWidth = 1;

      // Vertical lines
      for (let x = 0; x <= canvas.width; x += GRID_SIZE) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }

      // Horizontal lines
      for (let y = 0; y <= canvas.height; y += GRID_SIZE) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      // Draw flowing accent lines (vertical)
      const accentLineCount = 5;
      for (let i = 0; i < accentLineCount; i++) {
        const baseX = (canvas.width / (accentLineCount + 1)) * (i + 1);
        const offset = Math.sin(time * 0.0005 + i * 1.5) * 100;
        const x = baseX + offset;

        // Gradient line
        const gradient = ctx.createLinearGradient(x, 0, x, canvas.height);
        gradient.addColorStop(0, `rgba(0, 180, 255, 0)`);
        gradient.addColorStop(0.3, `rgba(0, 180, 255, ${accentAlpha * 0.5})`);
        gradient.addColorStop(0.5, `rgba(0, 180, 255, ${accentAlpha})`);
        gradient.addColorStop(0.7, `rgba(0, 180, 255, ${accentAlpha * 0.5})`);
        gradient.addColorStop(1, `rgba(0, 180, 255, 0)`);

        ctx.strokeStyle = gradient;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }

      // Draw scan line
      const scanY = ((time * 0.02) % (canvas.height + 200)) - 100;
      const scanGradient = ctx.createLinearGradient(0, scanY - 50, 0, scanY + 50);
      scanGradient.addColorStop(0, `rgba(0, 180, 255, 0)`);
      scanGradient.addColorStop(0.5, `rgba(0, 180, 255, ${isDark ? 0.15 : 0.08})`);
      scanGradient.addColorStop(1, `rgba(0, 180, 255, 0)`);

      ctx.fillStyle = scanGradient;
      ctx.fillRect(0, scanY - 50, canvas.width, 100);

      // Draw corner decorations
      const cornerSize = 60;
      const cornerAlpha = isDark ? 0.3 : 0.2;
      ctx.strokeStyle = `rgba(0, 180, 255, ${cornerAlpha})`;
      ctx.lineWidth = 2;

      // Top-left corner
      ctx.beginPath();
      ctx.moveTo(0, cornerSize);
      ctx.lineTo(0, 0);
      ctx.lineTo(cornerSize, 0);
      ctx.stroke();

      // Top-right corner
      ctx.beginPath();
      ctx.moveTo(canvas.width - cornerSize, 0);
      ctx.lineTo(canvas.width, 0);
      ctx.lineTo(canvas.width, cornerSize);
      ctx.stroke();

      // Bottom-left corner
      ctx.beginPath();
      ctx.moveTo(0, canvas.height - cornerSize);
      ctx.lineTo(0, canvas.height);
      ctx.lineTo(cornerSize, canvas.height);
      ctx.stroke();

      // Bottom-right corner
      ctx.beginPath();
      ctx.moveTo(canvas.width - cornerSize, canvas.height);
      ctx.lineTo(canvas.width, canvas.height);
      ctx.lineTo(canvas.width, canvas.height - cornerSize);
      ctx.stroke();

      // Draw data points at intersections (sparse)
      const dotSpacing = GRID_SIZE * 4;
      for (let x = dotSpacing; x < canvas.width; x += dotSpacing) {
        for (let y = dotSpacing; y < canvas.height; y += dotSpacing) {
          const pulse = Math.sin(time * 0.002 + x * 0.01 + y * 0.01) * 0.5 + 0.5;
          const dotAlpha = baseAlpha * 2 + pulse * baseAlpha * 2;

          ctx.fillStyle = `rgba(0, 180, 255, ${dotAlpha})`;
          ctx.beginPath();
          ctx.arc(x, y, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Vignette effect using radial gradient
      const vignetteGradient = ctx.createRadialGradient(
        canvas.width / 2,
        canvas.height / 2,
        0,
        canvas.width / 2,
        canvas.height / 2,
        Math.max(canvas.width, canvas.height) * 0.7
      );
      vignetteGradient.addColorStop(0, "rgba(0, 0, 0, 0)");
      vignetteGradient.addColorStop(0.5, "rgba(0, 0, 0, 0)");
      vignetteGradient.addColorStop(1, `rgba(0, 0, 0, ${isDark ? 0.4 : 0.15})`);

      ctx.fillStyle = vignetteGradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      time += 16;
      animationId = requestAnimationFrame(drawGrid);
    }

    resize();
    drawGrid();

    window.addEventListener("resize", resize);

    // Listen for theme changes
    const observer = new MutationObserver(() => {
      // Theme changed, animation will pick up new values
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animationId);
      observer.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-0 pointer-events-none"
      aria-hidden="true"
    />
  );
}
