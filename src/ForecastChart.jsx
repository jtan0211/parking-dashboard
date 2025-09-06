import React, { useEffect, useState } from "react";
import { holtWintersAdditive } from "./forecast";

export default function ForecastChart({ hourlyApi }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(hourlyApi);
        const json = await res.json();
        setData(json);
      } catch (e) {
        setError(String(e));
      }
    })();
  }, [hourlyApi]);

  if (error) return <div style={{color:"#b91c1c"}}>Error: {error}</div>;
  if (!data) return <div>Loading hourly series…</div>;

  const y = data.series.map(p => Math.max(0, Math.min(1, p.occupancyRate)));
  if (y.length < 48) {
    return <div>Need at least 48 hourly points to forecast. Keep collecting data…</div>;
  }

  const { pred } = holtWintersAdditive(y, 24, 0.3, 0.1, 0.3, 24);
  const history = data.series.map(p => ({ x: new Date(p.t), y: p.occupancyRate }));
  const futureStart = data.series[data.series.length - 1].t + 3600000;
  const forecast = pred.map((v, i) => ({ x: new Date(futureStart + i*3600000), y: Math.max(0, Math.min(1, v)) }));

  // Minimal SVG chart (swap to Chart.js/Recharts if you like)
  const all = [...history, ...forecast];
  const W = 900, H = 300, pad = 40;
  const xs = all.map(d => d.x.getTime());
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const scaleX = t => pad + ((t - minX) / (maxX - minX || 1)) * (W - 2*pad);
  const scaleY = v => H - pad - v * (H - 2*pad);
  const path = arr => arr.map((d,i)=> (i? "L":"M") + scaleX(d.x.getTime()) + "," + scaleY(d.y)).join(" ");

  return (
    <div>
      <h3>Hourly Occupancy — History & 24h Forecast</h3>
      <svg width={W} height={H} role="img" aria-label="Occupancy forecast">
        <line x1={pad} y1={H-pad} x2={W-pad} y2={H-pad} stroke="#999"/>
        <line x1={pad} y1={pad}   x2={pad}   y2={H-pad} stroke="#999"/>
        <path d={path(history)} fill="none" stroke="#0ea5e9" strokeWidth="2"/>
        <path d={path(forecast)} fill="none" stroke="#f59e0b" strokeDasharray="6,6" strokeWidth="2"/>
      </svg>
      <p><span style={{color:"#0ea5e9"}}>Blue</span> = history, <span style={{color:"#f59e0b"}}>Orange dashed</span> = forecast (next 24h).</p>
    </div>
  );
}
