"use client";

import {
  AreaSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useRef } from "react";

import { formatNumber, formatTimestamp } from "@/lib/format";
import type { TimeSeriesPoint } from "@/types/market";

type MarketChartProps = {
  data: TimeSeriesPoint[];
  /** Whether points are intraday, which switches axis and readout to show time of day. */
  intraday: boolean;
  unit: string;
  /** Accessible description of the chart, e.g. "UCPI, 1M". */
  label: string;
  className?: string;
};

// Neutral graphite treatment: the chart should read as structure, not compete
// with the hero or pre-empt a brand palette.
const LINE_COLOR = "#262626";
const AREA_TOP = "rgba(38, 38, 38, 0.10)";
const AREA_BOTTOM = "rgba(38, 38, 38, 0)";
const AXIS_TEXT = "#737373";
const GRID_COLOR = "#f0f0f0";
const CROSSHAIR_COLOR = "#a3a3a3";
const FONT_FAMILY =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/**
 * Historical index chart on TradingView Lightweight Charts.
 *
 * The chart instance is created once per mount and sized by the library's
 * own ResizeObserver (`autoSize`). Data and range-dependent options are
 * pushed into the existing instance when props change. The crosshair
 * readout is written straight into a DOM node so pointer movement never
 * re-renders React.
 */
export function MarketChart({ data, intraday, unit, label, className }: MarketChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const readoutRef = useRef<HTMLParagraphElement>(null);
  const instanceRef = useRef<{ chart: IChartApi; series: ISeriesApi<"Area"> } | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: AXIS_TEXT,
        fontFamily: FONT_FAMILY,
        fontSize: 11,
      },
      localization: {
        locale: "en-US",
        priceFormatter: (price: number) => formatNumber(price),
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: GRID_COLOR },
      },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.15, bottom: 0.1 } },
      timeScale: { borderVisible: false, fixLeftEdge: true, fixRightEdge: true },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: { color: CROSSHAIR_COLOR, style: LineStyle.Solid, labelBackgroundColor: LINE_COLOR },
        horzLine: { color: CROSSHAIR_COLOR, style: LineStyle.Solid, labelBackgroundColor: LINE_COLOR },
      },
      // Keep page scrolling and zooming predictable: no wheel capture.
      handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { mouseWheel: false, pinch: true, axisPressedMouseMove: true, axisDoubleClickReset: true },
    });

    const series = chart.addSeries(AreaSeries, {
      lineColor: LINE_COLOR,
      lineWidth: 2,
      topColor: AREA_TOP,
      bottomColor: AREA_BOTTOM,
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerRadius: 4,
      priceFormat: { type: "price", precision: 2, minMove: 0.01 },
    });

    instanceRef.current = { chart, series };

    return () => {
      instanceRef.current = null;
      chart.remove();
    };
  }, []);

  useEffect(() => {
    const instance = instanceRef.current;
    if (!instance) return;
    const { chart, series } = instance;

    series.setData(data.map((point) => ({ time: point.time as UTCTimestamp, value: point.value })));
    chart.applyOptions({ timeScale: { timeVisible: intraday, secondsVisible: false } });
    chart.timeScale().fitContent();

    const readout = readoutRef.current;
    const handleCrosshairMove = (params: MouseEventParams) => {
      if (!readout) return;
      const point = params.seriesData.get(series);
      if (params.time === undefined || !point || !("value" in point)) {
        readout.textContent = "";
        return;
      }
      readout.textContent = `${formatTimestamp(params.time as number, intraday)} · ${formatNumber(point.value)} ${unit}`;
    };
    chart.subscribeCrosshairMove(handleCrosshairMove);

    return () => {
      chart.unsubscribeCrosshairMove(handleCrosshairMove);
      if (readout) readout.textContent = "";
    };
  }, [data, intraday, unit]);

  return (
    <div className={["flex min-h-0 flex-col", className].filter(Boolean).join(" ")}>
      <p
        ref={readoutRef}
        className="h-5 shrink-0 text-right text-xs tabular-nums text-neutral-500"
      />
      <div
        ref={containerRef}
        role="img"
        aria-label={label}
        className="min-h-0 flex-1"
      />
    </div>
  );
}
