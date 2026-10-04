"use client";

import { useState } from "react";
import type { HourlyRow } from "@/lib/soulwinning/admin";

/**
 * Charts are hand-drawn SVG rather than a charting dependency: three small
 * fixed forms, one palette, and full control of the hover layer.
 *
 * Palette: #3398e1 and #f54911 — both existing site tokens, validated for
 * colour-vision separation (ΔE 27.3 worst adjacent pair under protanopia) and
 * for 3:1 contrast against the white card surface.
 */

const CYAN = "#3398e1";
const VERMILLION = "#f54911";
const GRID = "#e8e6e5";
const INK = "#0c0a09";
const MUTED = "#a8a29e";

const PAD = { top: 16, right: 16, bottom: 26, left: 38 };

function hourLabel(hour: number): string {
  if (hour === 0) return "12a";
  if (hour === 12) return "12p";
  return hour < 12 ? `${hour}a` : `${hour - 12}p`;
}

/** With a small or empty dataset [0, max/2, max] collapses to repeated values,
 *  which React sees as duplicate keys. */
function axisTicks(max: number): number[] {
  return [...new Set([0, Math.round(max / 2), max])];
}

function EmptyPlot({ height }: { height: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-lg border border-dashed border-[#e8e6e5] text-xs text-[#a8a29e]"
      style={{ height }}
    >
      No souls logged yet.
    </div>
  );
}

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[#e8e6e5] bg-white p-4 sm:p-5">
      <h3 className="font-roobert text-base text-[#0c0a09]">{title}</h3>
      <p className="mb-3 text-xs text-[#a8a29e]">{subtitle}</p>
      {children}
    </section>
  );
}

/** Souls per hour — magnitude by time bucket, so bars. */
export function SoulsPerHourChart({ rows }: { rows: HourlyRow[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 640;
  const height = 200;
  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;

  const max = Math.max(...rows.map((row) => row.souls), 1);
  const bandW = plotW / Math.max(rows.length, 1);
  const barW = Math.max(bandW - 3, 2); // 2px+ gap between adjacent bars

  const ticks = axisTicks(max);

  if (rows.length === 0) {
    return (
      <Card title="Souls per hour" subtitle="Counted entries by hour of the day (Accra time)">
        <EmptyPlot height={200} />
      </Card>
    );
  }

  return (
    <Card title="Souls per hour" subtitle="Counted entries by hour of the day (Accra time)">
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-[200px] w-full min-w-[520px]" role="img">
          {ticks.map((tick) => {
            const y = PAD.top + plotH - (tick / max) * plotH;
            return (
              <g key={tick}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y} y2={y} stroke={GRID} strokeWidth={1} />
                <text x={PAD.left - 8} y={y + 4} textAnchor="end" fontSize={10} fill={MUTED}>
                  {tick}
                </text>
              </g>
            );
          })}

          {rows.map((row, index) => {
            const barH = (row.souls / max) * plotH;
            const x = PAD.left + index * bandW + (bandW - barW) / 2;
            const y = PAD.top + plotH - barH;
            return (
              <g key={row.hour} onMouseEnter={() => setHover(index)} onMouseLeave={() => setHover(null)}>
                {/* Hit target spans the whole band, not just the bar. */}
                <rect x={PAD.left + index * bandW} y={PAD.top} width={bandW} height={plotH} fill="transparent" />
                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={Math.max(barH, row.souls > 0 ? 2 : 0)}
                  rx={2}
                  fill={CYAN}
                  opacity={hover === null || hover === index ? 1 : 0.45}
                />
                {index % 3 === 0 && (
                  <text x={x + barW / 2} y={height - 8} textAnchor="middle" fontSize={10} fill={MUTED}>
                    {hourLabel(row.hour)}
                  </text>
                )}
              </g>
            );
          })}

          {hover !== null && rows[hover] && (
            <g>
              <text
                x={Math.min(PAD.left + hover * bandW + bandW / 2, width - 60)}
                y={PAD.top - 4}
                textAnchor="middle"
                fontSize={11}
                fill={INK}
                fontWeight={500}
              >
                {hourLabel(rows[hover].hour)} · {rows[hover].souls}
              </text>
            </g>
          )}
        </svg>
      </div>
    </Card>
  );
}

/** Cumulative total — one series climbing, so a line with a soft fill. */
export function CumulativeChart({ rows }: { rows: HourlyRow[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 640;
  const height = 200;
  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;

  const max = Math.max(...rows.map((row) => row.cumulative), 1);
  const x = (index: number) => PAD.left + (index / Math.max(rows.length - 1, 1)) * plotW;
  const y = (value: number) => PAD.top + plotH - (value / max) * plotH;

  if (rows.length === 0) {
    return (
      <Card title="Cumulative total" subtitle="Souls won so far, hour by hour">
        <EmptyPlot height={200} />
      </Card>
    );
  }

  const line = rows.map((row, index) => `${index === 0 ? "M" : "L"}${x(index)},${y(row.cumulative)}`).join(" ");
  const area = `${line} L${x(rows.length - 1)},${PAD.top + plotH} L${x(0)},${PAD.top + plotH} Z`;
  const last = rows[rows.length - 1];

  return (
    <Card title="Cumulative total" subtitle="Souls won so far, hour by hour">
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-[200px] w-full min-w-[520px]"
          role="img"
          onMouseLeave={() => setHover(null)}
        >
          {axisTicks(max).map((tick) => (
            <g key={tick}>
              <line
                x1={PAD.left}
                x2={width - PAD.right}
                y1={y(tick)}
                y2={y(tick)}
                stroke={GRID}
                strokeWidth={1}
              />
              <text x={PAD.left - 8} y={y(tick) + 4} textAnchor="end" fontSize={10} fill={MUTED}>
                {tick}
              </text>
            </g>
          ))}

          <path d={area} fill={CYAN} opacity={0.08} />
          <path d={line} fill="none" stroke={CYAN} strokeWidth={2} strokeLinejoin="round" />

          {rows.map((row, index) => (
            <rect
              key={row.hour}
              x={x(index) - plotW / rows.length / 2}
              y={PAD.top}
              width={plotW / rows.length}
              height={plotH}
              fill="transparent"
              onMouseEnter={() => setHover(index)}
            />
          ))}

          {hover !== null && (
            <g>
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={PAD.top}
                y2={PAD.top + plotH}
                stroke={MUTED}
                strokeWidth={1}
                strokeDasharray="3 3"
              />
              <circle cx={x(hover)} cy={y(rows[hover].cumulative)} r={5} fill={CYAN} stroke="#ffffff" strokeWidth={2} />
              <text
                x={Math.min(Math.max(x(hover), PAD.left + 30), width - PAD.right - 30)}
                y={PAD.top - 4}
                textAnchor="middle"
                fontSize={11}
                fill={INK}
                fontWeight={500}
              >
                {hourLabel(rows[hover].hour)} · {rows[hover].cumulative}
              </text>
            </g>
          )}

          {/* Direct label rather than a legend: one series needs no legend box. */}
          {last && last.cumulative > 0 && (
            <text x={width - PAD.right} y={y(last.cumulative) - 8} textAnchor="end" fontSize={11} fill={INK}>
              {last.cumulative}
            </text>
          )}

          {rows.map((row, index) =>
            index % 3 === 0 ? (
              <text key={row.hour} x={x(index)} y={height - 8} textAnchor="middle" fontSize={10} fill={MUTED}>
                {hourLabel(row.hour)}
              </text>
            ) : null
          )}
        </svg>
      </div>
    </Card>
  );
}

/** Two rates over time — two series, so a legend is always present. */
export function RatesChart({ rows }: { rows: HourlyRow[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 640;
  const height = 210;
  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;

  const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);
  const x = (index: number) => PAD.left + (index / Math.max(rows.length - 1, 1)) * plotW;
  const y = (value: number) => PAD.top + plotH - (value / 100) * plotH;

  const series = [
    { key: "tongues", label: "Spoke in tongues", color: CYAN, values: rows.map((r) => pct(r.tongues, r.souls)) },
    { key: "church", label: "Coming to church", color: VERMILLION, values: rows.map((r) => pct(r.church, r.souls)) },
  ];

  if (rows.length === 0) {
    return (
      <Card title="Rates over time" subtitle="Share of each hour's souls, as a percentage">
        <EmptyPlot height={210} />
      </Card>
    );
  }

  return (
    <Card title="Rates over time" subtitle="Share of each hour's souls, as a percentage">
      {/* Legend: identity is never colour-alone, so each swatch carries its name. */}
      <div className="mb-2 flex flex-wrap gap-4">
        {series.map((item) => (
          <span key={item.key} className="flex items-center gap-1.5 text-xs text-[#78716c]">
            <span className="h-2 w-2 rounded-full" style={{ background: item.color }} aria-hidden />
            {item.label}
          </span>
        ))}
      </div>

      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-[210px] w-full min-w-[520px]"
          role="img"
          onMouseLeave={() => setHover(null)}
        >
          {[0, 50, 100].map((tick) => (
            <g key={tick}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(tick)} y2={y(tick)} stroke={GRID} strokeWidth={1} />
              <text x={PAD.left - 8} y={y(tick) + 4} textAnchor="end" fontSize={10} fill={MUTED}>
                {tick}%
              </text>
            </g>
          ))}

          {series.map((item) => (
            <path
              key={item.key}
              d={rows.map((_, index) => `${index === 0 ? "M" : "L"}${x(index)},${y(item.values[index])}`).join(" ")}
              fill="none"
              stroke={item.color}
              strokeWidth={2}
              strokeLinejoin="round"
            />
          ))}

          {rows.map((row, index) => (
            <rect
              key={row.hour}
              x={x(index) - plotW / rows.length / 2}
              y={PAD.top}
              width={plotW / rows.length}
              height={plotH}
              fill="transparent"
              onMouseEnter={() => setHover(index)}
            />
          ))}

          {hover !== null && (
            <g>
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={PAD.top}
                y2={PAD.top + plotH}
                stroke={MUTED}
                strokeWidth={1}
                strokeDasharray="3 3"
              />
              {series.map((item) => (
                <circle
                  key={item.key}
                  cx={x(hover)}
                  cy={y(item.values[hover])}
                  r={5}
                  fill={item.color}
                  stroke="#ffffff"
                  strokeWidth={2}
                />
              ))}
              <text
                x={Math.min(Math.max(x(hover), PAD.left + 60), width - PAD.right - 60)}
                y={PAD.top - 4}
                textAnchor="middle"
                fontSize={11}
                fill={INK}
                fontWeight={500}
              >
                {hourLabel(rows[hover].hour)} · tongues {Math.round(series[0].values[hover])}% · church{" "}
                {Math.round(series[1].values[hover])}%
              </text>
            </g>
          )}

          {rows.map((row, index) =>
            index % 3 === 0 ? (
              <text key={row.hour} x={x(index)} y={height - 8} textAnchor="middle" fontSize={10} fill={MUTED}>
                {hourLabel(row.hour)}
              </text>
            ) : null
          )}
        </svg>
      </div>
    </Card>
  );
}
