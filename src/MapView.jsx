// src/MapView.jsx
import React, { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export default function MapView({ apiUrl }) {
  const mapRef = useRef(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    const region = process.env.REACT_APP_LOCATION_REGION;
    const mapName = process.env.REACT_APP_LOCATION_MAP_NAME;
    const apiKey  = process.env.REACT_APP_LOCATION_API_KEY;

    // Build the style URL once
    const amazonStyle = (region && mapName)
      ? `https://maps.geo.${region}.amazonaws.com/maps/v0/maps/${encodeURIComponent(mapName)}/style-descriptor`
      : null;

    try {
      const map = new maplibregl.Map({
        container: "map",
        style: amazonStyle || "https://demotiles.maplibre.org/style.json",
        center: [101.142, 4.335],
        zoom: 17,

        // IMPORTANT: pass API key as query param to avoid CORS preflight
        transformRequest: (url, resourceType) => {
          // Only touch Amazon Location map requests
          const isAmazonMaps = url.startsWith(`https://maps.geo.${region}.amazonaws.com/`);
          if (isAmazonMaps && apiKey) {
            const u = new URL(url);
            // add key=… if not present
            if (!u.searchParams.has("key")) {
              u.searchParams.set("key", apiKey);
            }
            return { url: u.toString() };
          }
          return { url };
        }
      });

      map.addControl(new maplibregl.NavigationControl(), "top-right");
      mapRef.current = map;

      map.on("load", async () => {
        try {
          // Load your layout
          const r = await fetch("/parking_slots.geojson");
          if (!r.ok) throw new Error(`geojson ${r.status}`);
          const geo = await r.json();

          // Overlay current statuses
          const statusById = new Map();
          try {
            const api = await fetch(apiUrl).then(x => x.json());
            api.forEach(d => statusById.set(d.slot_id, d.status));
          } catch (e) {
            console.warn("[MapView] API fetch failed (will render without live status):", e);
          }
          geo.features.forEach(f => {
            const id = f.properties?.slot_id;
            f.properties = f.properties || {};
            f.properties.status = statusById.get(id) || "unknown";
          });

          // Add layers
          map.addSource("slots", { type: "geojson", data: geo });
          map.addLayer({
            id: "slots-fill",
            type: "fill",
            source: "slots",
            paint: {
              "fill-color": [
                "match", ["get","status"],
                "occupied", "#d93025",
                "vacant",   "#1a7f37",
                "#9e9e9e"
              ],
              "fill-opacity": 0.5
            }
          });
          map.addLayer({
            id: "slots-outline",
            type: "line",
            source: "slots",
            paint: { "line-color": "#333", "line-width": 1 }
          });
          map.addLayer({
            id: "slots-labels",
            type: "symbol",
            source: "slots",
            layout: {
              "text-field": ["get", "slot_id"],
              "text-size": 12,
              "text-allow-overlap": true
            },
            paint: {
              "text-color": "#111",
              "text-halo-color": "#fff",
              "text-halo-width": 1
            }
          });

          // Fit to all slot geometries
          const b = new maplibregl.LngLatBounds();
          geo.features.forEach(f => {
            const coords = (f.geometry?.coordinates || []).flat(2);
            coords.forEach(([lng, lat]) => b.extend([lng, lat]));
          });
          if (!b.isEmpty()) map.fitBounds(b, { padding: 40, maxZoom: 19 });
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
        <div style={{ position: "absolute", zIndex: 2, top: 8, left: 8, background: "#fee", color: "#900", padding: 8, borderRadius: 6 }}>
          map error: {err}
        </div>
      )}
      <div id="map" style={{ height: 600, width: "100%", border: "1px solid #ccc", borderRadius: 8 }} />
    </div>
  );
}
