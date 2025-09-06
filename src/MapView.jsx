import React, { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export default function MapView({ apiUrl }) {
  const mapRef = useRef(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  // Recursively collect [lng,lat] pairs from any GeoJSON coordinate tree
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
    try {
      const map = new maplibregl.Map({
        container: "map",
        // Esri World Street Map for clearer basemap context
        style: {
          version: 8,
          sources: {
            esri: {
              type: "raster",
              tiles: [
                "https://services.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"
              ],
              tileSize: 256,
              attribution: "&copy; Esri &mdash; Esri, DeLorme, NAVTEQ"
            }
          },
          layers: [
            {
              id: "esri",
              type: "raster",
              source: "esri",
              minzoom: 0,
              maxzoom: 22
            }
          ]
        },
        center: [101.139, 4.3386], // UTAR Kampar Block M coordinates
        zoom: 19 // Close zoom to see parking slots
      });

      map.addControl(new maplibregl.NavigationControl(), "top-right");
      mapRef.current = map;

      map.on("load", async () => {
        try {
          setLoading(false);

          // 1) Load parking layout
          const r = await fetch("/parking_slots.geojson");
          if (!r.ok) throw new Error(`Failed to load parking_slots.geojson (HTTP ${r.status})`);
          const geo = await r.json();

          // 2) Load live status or fall back to demo data
          let statusById = new Map();
          try {
            if (apiUrl && !apiUrl.includes("PASTE_YOUR") && !apiUrl.includes("YOUR_API_GATEWAY_URL_HERE")) {
              const live = await fetch(apiUrl).then(x => x.json());
              live.forEach(d => statusById.set(d.slot_id, d.status));
            } else {
              // Demo data for development
              ['A1','A3','A5','A15','A20','A25'].forEach(id => statusById.set(id,'occupied'));
              ['A2','A4','A6','A10','A16','A30'].forEach(id => statusById.set(id,'vacant'));
            }
          } catch (e) {
            console.warn("[MapView] Live status fetch failed; using demo data:", e);
            ['A1','A3','A5','A15','A20','A25'].forEach(id => statusById.set(id,'occupied'));
          }

          // 3) Merge status with layout
          geo.features.forEach(f => {
            const id = f?.properties?.slot_id;
            f.properties = { ...f.properties, slot_id: id || "", status: statusById.get(id) || "unknown" };
          });

          // 4) Add parking slots to map
          map.addSource("slots", { type: "geojson", data: geo });

          map.addLayer({
            id: "slots-fill",
            type: "fill",
            source: "slots",
            paint: {
              "fill-color": [
                "match", ["get", "status"],
                "occupied", "#d93025",
                "vacant", "#1a7f37",
                "#9e9e9e"
              ],
              "fill-opacity": 0.8
            }
          });

          map.addLayer({
            id: "slots-outline",
            type: "line",
            source: "slots",
            paint: {
              "line-color": "#222",
              "line-width": 1.5
            }
          });

          map.addLayer({
            id: "slots-labels",
            type: "symbol",
            source: "slots",
            layout: {
              "text-field": ["get", "slot_id"],
              "text-size": 10,
              "text-allow-overlap": true
            },
            paint: {
              "text-color": "#fff",
              "text-halo-color": "#000",
              "text-halo-width": 2
            }
          });

          // 5) Fit map to parking area bounds
          const bounds = new maplibregl.LngLatBounds();
          for (const f of geo.features) {
            const positions = collectPositions(f.geometry.coordinates);
            positions.forEach(([lng, lat]) => bounds.extend([lng, lat]));
          }
          if (!bounds.isEmpty()) {
            map.fitBounds(bounds, { padding: 40, maxZoom: 21 });
          }

          // 6) Interactions
          map.on("mousemove", "slots-fill", () => {
            map.getCanvas().style.cursor = "pointer";
          });
          map.on("mouseleave", "slots-fill", () => {
            map.getCanvas().style.cursor = "";
          });
          map.on("click", "slots-fill", (e) => {
            const feature = e.features?.[0];
            if (!feature) return;
            const { slot_id, status, last_updated } = feature.properties || {};
            const statusColor =
              status === "occupied" ? "#d93025" :
              status === "vacant" ? "#1a7f37" : "#666";
            new maplibregl.Popup({ closeButton: true })
              .setLngLat(e.lngLat)
              .setHTML(`
                <div style="font-family: system-ui; padding: 12px;">
                  <div style="font-weight: bold; font-size: 14px; margin-bottom: 8px;">
                    Parking Slot ${slot_id}
                  </div>
                  <div style="margin: 6px 0;">
                    Status: <span style="color: ${statusColor}; font-weight: bold; text-transform: capitalize;">${status}</span>
                  </div>
                  ${last_updated ? `<div style="color: #666; font-size: 12px; margin-top: 6px;">Updated: ${last_updated}</div>` : ""}
                </div>
              `)
              .addTo(map);
          });
        } catch (e) {
          console.error("[MapView] Setup error:", e);
          setErr(`Map setup failed: ${e.message}`);
          setLoading(false);
        }
      });

      map.on("error", (e) => {
        console.error("[MapView] Map error:", e);
        setErr(`Map error: ${e?.error?.message || e.message || "Unknown error"}`);
        setLoading(false);
      });

      return () => {
        if (mapRef.current) {
          mapRef.current.remove();
        }
      };
    } catch (e) {
      console.error("[MapView] Constructor failed:", e);
      setErr(`Failed to initialize map: ${e.message}`);
      setLoading(false);
    }
  }, [apiUrl]);

  return (
    <div style={{ position: "relative" }}>
      {loading && (
        <div style={{
          position: "absolute",
          zIndex: 1000,
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          background: "rgba(255, 255, 255, 0.9)",
          padding: 20,
          borderRadius: 8,
          textAlign: "center"
        }}>
          <div>Loading map...</div>
          <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
            Initializing map for UTAR Kampar Block M
          </div>
        </div>
      )}

      {err && (
        <div style={{
          position: "absolute",
          zIndex: 1000,
          top: 10,
          left: 10,
          right: 10,
          background: "#fee2e2",
          color: "#991b1b",
          padding: 16,
          borderRadius: 8,
          border: "1px solid #fecaca",
          fontSize: 14,
          lineHeight: 1.4,
          whiteSpace: "pre-line"
        }}>
          <strong>⚠️ Map Error:</strong>
          <div style={{ marginTop: 8 }}>{err}</div>
        </div>
      )}

      <div
        id="map"
        style={{
          height: 640,
          width: "100%",
          border: "1px solid #ccc",
          borderRadius: 8,
          backgroundColor: loading ? "#f5f5f5" : "transparent"
        }}
      />
    </div>
  );
}
