"use client";

import { useEffect, useRef } from "react";

export function AnimatedGridBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    let time = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    const drawWaterGrid = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const centerX = canvas.width / 2;
      const horizonY = canvas.height * 0.35;
      const gridSpacing = 40;
      const horizontalLines = 25;

      ctx.lineWidth = 1;

      // Draw horizontal lines with wave distortion
      for (let i = 0; i <= horizontalLines; i++) {
        const progress = i / horizontalLines;
        // Perspective: lines get closer together near horizon
        const y = horizonY + (canvas.height - horizonY) * Math.pow(progress, 1.8);

        // Wave parameters - calmer, slower waves
        const waveAmplitude = 3 + progress * 8;
        const waveFrequency = 0.02 - progress * 0.008;
        const waveSpeed = time * 0.0006;

        // Alpha fades near horizon
        const alpha = 0.08 + progress * 0.12;
        ctx.strokeStyle = `rgba(59, 130, 246, ${alpha})`;

        ctx.beginPath();

        for (let x = 0; x <= canvas.width; x += 3) {
          // Multiple sine waves for organic water feel
          const wave1 = Math.sin(x * waveFrequency + waveSpeed) * waveAmplitude;
          const wave2 = Math.sin(x * waveFrequency * 1.5 - waveSpeed * 0.7) * waveAmplitude * 0.5;
          const wave3 = Math.sin(x * waveFrequency * 0.5 + waveSpeed * 0.3 + i * 0.2) * waveAmplitude * 0.3;

          const waveY = y + wave1 + wave2 + wave3;

          if (x === 0) {
            ctx.moveTo(x, waveY);
          } else {
            ctx.lineTo(x, waveY);
          }
        }
        ctx.stroke();
      }

      // Draw vertical lines with perspective and wave distortion
      // Need more lines to fill the wider spread at the bottom
      const bottomWidth = canvas.width * 3;
      const totalLines = Math.ceil(bottomWidth / gridSpacing) + 1;

      for (let i = 0; i <= totalLines; i++) {
        // Position lines to span from beyond left edge to beyond right edge at bottom
        const baseX = -canvas.width * 1 + (i / totalLines) * bottomWidth;

        // Calculate where this line converges at horizon
        const perspectiveX = centerX + (baseX - centerX) * 0.1;

        // Alpha based on distance from center
        const distFromCenter = Math.abs(centerX - (baseX + perspectiveX) / 2) / (canvas.width / 2);
        const alpha = Math.max(0.06, 0.15 - distFromCenter * 0.06);
        ctx.strokeStyle = `rgba(59, 130, 246, ${alpha})`;

        ctx.beginPath();

        const steps = 50;
        for (let j = 0; j <= steps; j++) {
          const progress = j / steps;
          const y = horizonY + (canvas.height - horizonY) * Math.pow(progress, 1.8);

          // Interpolate x position with perspective (from horizon point to base)
          const x = perspectiveX + (baseX - perspectiveX) * progress;

          // Add wave distortion to vertical lines too
          const waveOffset = Math.sin(y * 0.02 + time * 0.0004 + i * 0.5) * (2 + progress * 4);

          if (j === 0) {
            ctx.moveTo(x + waveOffset, y);
          } else {
            ctx.lineTo(x + waveOffset, y);
          }
        }
        ctx.stroke();
      }

      // Subtle glow/reflection at horizon
      const gradient = ctx.createLinearGradient(0, horizonY - 50, 0, horizonY + 100);
      gradient.addColorStop(0, "rgba(59, 130, 246, 0)");
      gradient.addColorStop(0.5, `rgba(59, 130, 246, ${0.03 + Math.sin(time * 0.0003) * 0.015})`);
      gradient.addColorStop(1, "rgba(59, 130, 246, 0)");

      ctx.fillStyle = gradient;
      ctx.fillRect(0, horizonY - 50, canvas.width, 150);

      time += 16;
      animationId = requestAnimationFrame(drawWaterGrid);
    };

    resize();
    drawWaterGrid();

    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animationId);
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
