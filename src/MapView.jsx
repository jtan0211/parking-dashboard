// src/MapView.jsx
import React, { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export default function MapView({ apiUrl }) {
  const mapRef = useRef(null);
  const [err, setErr] = useState("");

  // Recursively collect [lng,lat] pairs from any GeoJSON geometry
  function collectPositions(coords, out = []) {
    if (!coords) return out;
    if (typeof coords[0] === "number" && typeof coords[1] === "number") {
      out.push(coords);
      return out;
    }
    for (const c of coords) collectPositions(c, out);
    return out;
  }

  useEffect(() => {
    const region  = process.env.REACT_APP_LOCATION_REGION;      // ap-southeast-1
    const mapName = process.env.REACT_APP_LOCATION_MAP_NAME;     // UTARParkingMap
    const apiKey  = process.env.REACT_APP_LOCATION_API_KEY;      // v1.public...

    const styleBase = `https://maps.geo.${region}.amazonaws.com/maps/v0/maps/${mapName}/style-descriptor`;
    const styleUrl  = `${styleBase}?key=${encodeURIComponent(apiKey)}`;

    try {
      const map = new maplibregl.Map({
        container: "map",
        style: styleUrl,
        center: [101.142, 4.335],
        zoom: 17,
        // IMPORTANT: append ?key=... to ALL Amazon Location requests (tiles/glyphs/sprites)
        transformRequest: (url) => {
          if (url.startsWith(`https://maps.geo.${region}.amazonaws.com/`)) {
            if (url.includes("key=")) return { url };
            const sep = url.includes("?") ? "&" : "?";
            return { url: `${url}${sep}key=${encodeURIComponent(apiKey)}` };
          }
          return { url };
        }
      });

      map.addControl(new maplibregl.NavigationControl(), "top-right");
      mapRef.current = map;

      map.on("load", async () => {
        try {
          // 1) Load your drawn layout
          const r = await fetch("/parking_slots.geojson");
          if (!r.ok) throw new Error(`Failed to load parking_slots.geojson (HTTP ${r.status})`);
          const geo = await r.json();

          // 2) Merge live status (optional)
          let statusById = new Map();
          try {
            const live = await fetch(apiUrl).then(x => x.json());
            live.forEach(d => statusById.set(d.slot_id, d.status));
          } catch (e) {
            // ok to continue without live data
            console.warn("[MapView] Live status fetch failed:", e);
          }

          geo.features.forEach(f => {
            const id = f?.properties?.slot_id;
            f.properties = f.properties || {};
            f.properties.slot_id = id || f.properties.slot_id || "";
            f.properties.status = statusById.get(id) || f.properties.status || "unknown";
          });

          // 3) Add as a source & layers
          map.addSource("slots", { type: "geojson", data: geo });

          map.addLayer({
            id: "slots-fill",
            type: "fill",
            source: "slots",
            paint: {
              "fill-color": [
                "match", ["get", "status"],
                "occupied", "#d93025",
                "vacant",   "#1a7f37",
                /* default */ "#9e9e9e"
              ],
              "fill-opacity": 0.5
            }
          });

          map.addLayer({
            id: "slots-outline",
            type: "line",
            source: "slots",
            paint: { "line-color": "#2f2f2f", "line-width": 1 }
          });

          map.addLayer({
            id: "slots-labels",
            type: "symbol",
            source: "slots",
            layout: {
              "text-field": [
                "format",
                ["get", "slot_id"], { "font-scale": 1.0 },
                "\n",
                ["get", "status"], { "font-scale": 0.8 }
              ],
              "text-size": 12,
              "text-allow-overlap": true,
              "symbol-z-order": "source"
            },
            paint: {
              "text-color": "#111",
              "text-halo-color": "#ffffff",
              "text-halo-width": 1.2
            }
          });

          // 4) Fit to your geometry
          const bounds = new maplibregl.LngLatBounds();
          for (const f of geo.features) {
            const pos = collectPositions(f?.geometry?.coordinates);
            pos.forEach(([lng, lat]) => bounds.extend([lng, lat]));
          }
          if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 40, maxZoom: 19 });
        } catch (e) {
          console.error("[MapView] init error:", e);
          setErr(String(e));
        }
      });

      map.on("error", (e) => {
        console.error("[MapView] map error:", e?.error || e);
      });

      return () => map.remove();
    } catch (e) {
      console.error("[MapView] constructor failed:", e);
      setErr(String(e));
    }
  }, [apiUrl]);

  return (
    <div style={{ position: "relative" }}>
      {err && (
        <div style={{
          position: "absolute", zIndex: 2, top: 8, left: 8,
          background: "#fee", color: "#900", padding: 8, borderRadius: 6
        }}>
          Map error: {err}
        </div>
      )}
      <div id="map" style={{ height: 600, width: "100%", border: "1px solid #ccc", borderRadius: 8 }} />
    </div>
  );
}
