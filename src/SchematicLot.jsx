// src/SchematicLot.jsx
import React, { useEffect, useMemo, useState } from "react";

const W = 1200;      // logical width for the SVG viewBox (responsive)
const H = 520;       // logical height for the SVG viewBox
const M = 20;        // margin inside the viewBox

export default function SchematicLot({ apiUrl }) {
  const [geo, setGeo] = useState(null);
  const [statusById, setStatusById] = useState(new Map());
  const [err, setErr] = useState("");

  // Load layout + live status
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/parking_slots.geojson");
        if (!r.ok) throw new Error(`Failed to load parking_slots.geojson (${r.status})`);
        const g = await r.json();
        setGeo(g);
      } catch (e) {
        console.error(e);
        setErr(String(e));
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const live = await fetch(apiUrl).then(x => x.json());
        const m = new Map();
        live.forEach(d => m.set(d.slot_id, d.status));
        setStatusById(m);
      } catch (e) {
        console.warn("Status fetch failed (using unknown):", e);
      }
    })();
  }, [apiUrl]);

  // Helpers to work with any polygon/multipolygon
  const getAllCoords = (geom) => {
    const out = [];
    const walk = (c) => {
      if (!c) return;
      if (typeof c[0] === "number" && typeof c[1] === "number") { out.push(c); return; }
      for (const x of c) walk(x);
    };
    walk(geom?.coordinates);
    return out;
  };

  // Compute bounds across all features
  const bounds = useMemo(() => {
    if (!geo?.features?.length) return null;
    let minLng =  Infinity, maxLng = -Infinity;
    let minLat =  Infinity, maxLat = -Infinity;
    for (const f of geo.features) {
      for (const [lng, lat] of getAllCoords(f.geometry)) {
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
    }
    return { minLng, maxLng, minLat, maxLat };
  }, [geo]);

  // Project lng/lat to SVG coords
  const project = (lng, lat) => {
    if (!bounds) return [0, 0];
    const { minLng, maxLng, minLat, maxLat } = bounds;
    const innerW = W - 2 * M;
    const innerH = H - 2 * M;
    const x = M + ((lng - minLng) / Math.max(1e-9, (maxLng - minLng))) * innerW;
    const y = M + (1 - (lat - minLat) / Math.max(1e-9, (maxLat - minLat))) * innerH; // flip Y
    return [x, y];
  };

  // For each feature, return outer-ring polygon points + label position
  const shapes = useMemo(() => {
    if (!geo?.features || !bounds) return [];
    const arr = [];
    for (const f of geo.features) {
      const id = f?.properties?.slot_id || "";
      const status = statusById.get(id) || f?.properties?.status || "unknown";

      const type = f?.geometry?.type;
      const coords = f?.geometry?.coordinates;
      if (!coords) continue;

      // Get one outer ring per geometry (if MultiPolygon, render each part)
      const polys = type === "Polygon" ? [coords] : (type === "MultiPolygon" ? coords : []);
      for (const poly of polys) {
        const outer = poly[0]; // first ring
        if (!outer?.length) continue;

        // SVG polygon points
        const points = outer.map(([lng, lat]) => project(lng, lat).join(",")).join(" ");

        // simple centroid: average of points
        let cx = 0, cy = 0;
        outer.forEach(([lng, lat]) => {
          const [x, y] = project(lng, lat);
          cx += x; cy += y;
        });
        cx /= outer.length; cy /= outer.length;

        arr.push({ id, status, points, cx, cy });
      }
    }
    return arr;
  }, [geo, bounds, statusById]);

  if (err) {
    return <div style={{ color: "#b00020" }}>Layout error: {err}</div>;
  }
  if (!bounds) {
    return <div>Loading layout…</div>;
  }

  const color = (status) =>
    status === "occupied" ? "#d93025" :
    status === "vacant"   ? "#1a7f37" :
                            "#9e9e9e";

  return (
    <div>
      <div style={{ margin: "8px 0 10px", fontWeight: 600 }}>Parking Layout</div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{ border: "1px solid #ddd", borderRadius: 8, background: "#fafafa" }}
        role="img"
        aria-label="Parking slot schematic"
      >
        {/* slots */}
        {shapes.map((s, i) => (
          <g key={`${s.id}-${i}`}>
            <polygon
              points={s.points}
              fill={color(s.status)}
              fillOpacity="0.55"
              stroke="#333"
              strokeWidth="1"
            />
            {/* label */}
            <text
              x={s.cx}
              y={s.cy}
              textAnchor="middle"
              alignmentBaseline="middle"
              style={{ fontSize: 12, fill: "#111", paintOrder: "stroke", stroke: "#fff", strokeWidth: 2 }}
            >
              {s.id}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
