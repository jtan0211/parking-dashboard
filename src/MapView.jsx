import React, { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export default function MapView({ apiUrl }) {
  const mapRef = useRef(null);
  const [err, setErr] = useState("");

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
    const region  = process.env.REACT_APP_LOCATION_REGION;     // e.g. ap-southeast-1
    const mapName = process.env.REACT_APP_LOCATION_MAP_NAME;    // e.g. UTARParkingMap
    const apiKey  = process.env.REACT_APP_LOCATION_API_KEY;     // v1.public...

    const styleBase = `https://maps.geo.${region}.amazonaws.com/maps/v0/maps/${mapName}/style-descriptor`;
    const styleUrl  = `${styleBase}?key=${encodeURIComponent(apiKey)}`;

    try {
      const map = new maplibregl.Map({
        container: "map",
        style: styleUrl,
        center: [101.142, 4.335],   // any midpoint; we will fit to bounds after load
        zoom: 17,
        // append ?key=... to *all* Amazon Location requests (style, tiles, sprites, glyphs)
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
          // 1) Load your hand-drawn layout from /public
          const r = await fetch("/parking_slots.geojson");
          if (!r.ok) throw new Error(`Failed to load parking_slots.geojson (HTTP ${r.status})`);
          const geo = await r.json();

          // 2) Merge live status from the API (optional, we fall back to "unknown")
          let statusById = new Map();
          try {
            const live = await fetch(apiUrl).then(x => x.json());
            live.forEach(d => statusById.set(d.slot_id, d.status));
          } catch (e) {
            console.warn("[MapView] Live status fetch failed; using unknown:", e);
          }

          geo.features.forEach(f => {
            const id = f?.properties?.slot_id;
            f.properties = f.properties || {};
            f.properties.slot_id = id || f.properties.slot_id || "";
            f.properties.status  = statusById.get(id) || f.properties.status || "unknown";
          });

          // 3) Add as source + 3 layers (fill, outline, labels)
          map.addSource("slots", { type: "geojson", data: geo });

          map.addLayer({
            id: "slots-fill",
            type: "fill",
            source: "slots",
            paint: {
              "fill-color": [
                "match", ["get", "status"],
                "occupied", "#d93025",  // red
                "vacant",   "#1a7f37",  // green
                /* default */ "#9e9e9e"
              ],
              "fill-opacity": 0.52
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
              // show slot_id on first line, status on second line
              "text-field": [
                "format",
                ["get", "slot_id"], { "font-scale": 1.0 },
                "\n",
                ["get", "status"],  { "font-scale": 0.85 }
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

          // 4) Fit to the exact geometry you drew
          const bounds = new maplibregl.LngLatBounds();
          for (const f of geo.features) {
            const pos = collectPositions(f?.geometry?.coordinates);
            pos.forEach(([lng, lat]) => bounds.extend([lng, lat]));
          }
          if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 40, maxZoom: 19 });

          // 5) Nice UX: hand cursor + click popup
          map.on("mousemove", "slots-fill", () => (map.getCanvas().style.cursor = "pointer"));
          map.on("mouseleave", "slots-fill", () => (map.getCanvas().style.cursor = ""));
          map.on("click", "slots-fill", (e) => {
            const f = e.features?.[0];
            if (!f) return;
            const { slot_id, status, last_updated } = f.properties || {};
            new maplibregl.Popup({ closeButton: true })
              .setLngLat(e.lngLat)
              .setHTML(
                `<div style="font: 13px/1.35 system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;">
                   <div><strong>${slot_id || "Unknown"}</strong></div>
                   <div>Status: <span style="color:${status === "occupied" ? "#d93025" : status === "vacant" ? "#1a7f37" : "#666"}">${status}</span></div>
                   ${last_updated ? `<div style="color:#666">Updated: ${last_updated}</div>` : ""}
                 </div>`
              )
              .addTo(map);
          });
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
      <div
        id="map"
        style={{ height: 640, width: "100%", border: "1px solid #ccc", borderRadius: 8 }}
      />
    </div>
  );
}
