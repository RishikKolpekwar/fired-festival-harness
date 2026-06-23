"use client";

import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";

interface RotatingEarthProps {
  width?: number;
  height?: number;
  className?: string;
}

export default function RotatingEarth({
  width = 560,
  height = 560,
  className = "",
}: RotatingEarthProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    if (!context) return;

    const cw = Math.min(width, window.innerWidth - 40);
    const ch = Math.min(height, window.innerHeight - 100);
    const radius = Math.min(cw, ch) / 2.1;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = cw * dpr;
    canvas.height = ch * dpr;
    canvas.style.width = `${cw}px`;
    canvas.style.height = `${ch}px`;
    context.scale(dpr, dpr);

    const projection = d3
      .geoOrthographic()
      .scale(radius)
      .translate([cw / 2, ch / 2])
      .clipAngle(90);
    const path = d3.geoPath().projection(projection).context(context);

    const pointInPolygon = (
      point: [number, number],
      polygon: number[][],
    ): boolean => {
      const [x, y] = point;
      let inside = false;
      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [xi, yi] = polygon[i];
        const [xj, yj] = polygon[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
          inside = !inside;
      }
      return inside;
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pointInFeature = (point: [number, number], feature: any): boolean => {
      const g = feature.geometry;
      if (g.type === "Polygon") {
        if (!pointInPolygon(point, g.coordinates[0])) return false;
        for (let i = 1; i < g.coordinates.length; i++)
          if (pointInPolygon(point, g.coordinates[i])) return false;
        return true;
      } else if (g.type === "MultiPolygon") {
        for (const poly of g.coordinates) {
          if (pointInPolygon(point, poly[0])) {
            let inHole = false;
            for (let i = 1; i < poly.length; i++)
              if (pointInPolygon(point, poly[i])) {
                inHole = true;
                break;
              }
            if (!inHole) return true;
          }
        }
        return false;
      }
      return false;
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dotsIn = (feature: any, spacing = 16) => {
      const dots: [number, number][] = [];
      const [[minLng, minLat], [maxLng, maxLat]] = d3.geoBounds(feature);
      const step = spacing * 0.08;
      for (let lng = minLng; lng <= maxLng; lng += step)
        for (let lat = minLat; lat <= maxLat; lat += step)
          if (pointInFeature([lng, lat], feature)) dots.push([lng, lat]);
      return dots;
    };

    const allDots: { lng: number; lat: number }[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let land: any;

    const render = () => {
      context.clearRect(0, 0, cw, ch);
      const scale = projection.scale();
      const sf = scale / radius;

      context.beginPath();
      context.arc(cw / 2, ch / 2, scale, 0, 2 * Math.PI);
      context.fillStyle = "#05060a";
      context.fill();
      context.strokeStyle = "rgba(124,192,255,0.5)";
      context.lineWidth = 1.5 * sf;
      context.stroke();

      if (land) {
        const graticule = d3.geoGraticule();
        context.beginPath();
        path(graticule());
        context.strokeStyle = "rgba(124,192,255,0.12)";
        context.lineWidth = 1 * sf;
        context.stroke();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        land.features.forEach((f: any) => {
          context.beginPath();
          path(f);
          context.strokeStyle = "rgba(160,200,255,0.35)";
          context.lineWidth = 1 * sf;
          context.stroke();
        });

        allDots.forEach((dot) => {
          const p = projection([dot.lng, dot.lat]);
          if (p && p[0] >= 0 && p[0] <= cw && p[1] >= 0 && p[1] <= ch) {
            context.beginPath();
            context.arc(p[0], p[1], 1.1 * sf, 0, 2 * Math.PI);
            context.fillStyle = "rgba(124,192,255,0.65)";
            context.fill();
          }
        });
      }
    };

    const load = async () => {
      try {
        const res = await fetch(
          "https://raw.githubusercontent.com/martynafford/natural-earth-geojson/refs/heads/master/110m/physical/ne_110m_land.json",
        );
        if (!res.ok) throw new Error("load failed");
        land = await res.json();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        land.features.forEach((f: any) =>
          dotsIn(f, 16).forEach(([lng, lat]) => allDots.push({ lng, lat })),
        );
        render();
      } catch {
        setError("could not load globe");
      }
    };

    const rotation: [number, number] = [0, -12];
    let autoRotate = true;
    const speed = 0.32;
    const timer = d3.timer(() => {
      if (autoRotate) {
        rotation[0] += speed;
        projection.rotate(rotation);
        render();
      }
    });

    const onDown = (event: MouseEvent) => {
      autoRotate = false;
      const sx = event.clientX;
      const sy = event.clientY;
      const sr: [number, number] = [rotation[0], rotation[1]];
      const move = (e: MouseEvent) => {
        rotation[0] = sr[0] + (e.clientX - sx) * 0.5;
        rotation[1] = Math.max(-90, Math.min(90, sr[1] - (e.clientY - sy) * 0.5));
        projection.rotate(rotation);
        render();
      };
      const up = () => {
        document.removeEventListener("mousemove", move);
        document.removeEventListener("mouseup", up);
        setTimeout(() => (autoRotate = true), 400);
      };
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
    };
    canvas.addEventListener("mousedown", onDown);

    load();

    return () => {
      timer.stop();
      canvas.removeEventListener("mousedown", onDown);
    };
  }, [width, height]);

  if (error) {
    return (
      <div className={`flex items-center justify-center ${className}`}>
        <span className="font-mono text-xs text-[#6a7283]">{error}</span>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <canvas ref={canvasRef} className="h-auto w-full" />
    </div>
  );
}
