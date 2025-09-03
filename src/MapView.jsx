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
    const region = process.env.REACT_APP_LOCATION_REGION || "ap-southeast-1";
    const mapName = process.env.REACT_APP_LOCATION_MAP_NAME || "UTARParkingMap";
    const apiKey = process.env.REACT_APP_LOCATION_API_KEY;

    console.log("AWS Location Config:", { region, mapName, apiKey: apiKey ? "***" : "MISSING" });

    if (!apiKey || apiKey.includes("PASTE_YOUR")) {
      setErr("AWS Location API key is missing. Please set REACT_APP_LOCATION_API_KEY in your environment.");
      return;
    }

    const styleBase = `https://maps.geo.${region}.amazonaws.com/maps/v0/maps/${mapName}/style-descriptor`;
    const styleUrl = `${styleBase}?key=${encodeURIComponent(apiKey)}`;

    try {
      const map = new maplibregl.Map({
        container: "map",
        style: styleUrl,
        center: [101.139, 4.3386], // Corrected center for your parking area
        zoom: 19, // Zoom in closer to see parking slots clearly
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
          console.log("Map loaded, fetching parking slots...");
          
          // 1) Load your parking layout
          const r = await fetch("/parking_slots.geojson");
          if (!r.ok) throw new Error(`Failed to load parking_slots.geojson (HTTP ${r.status})`);
          const geo = await r.json();
          
          console.log(`Loaded ${geo.features?.length || 0} parking slots`);

          // 2) Try to get live status from API
          let statusById = new Map();
          try {
            if (apiUrl && !apiUrl.includes("PASTE_YOUR")) {
              console.log("Fetching live status from:", apiUrl);
              const live = await fetch(apiUrl).then(x => x.json());
              live.forEach(d => statusById.set(d.slot_id, d.status));
              console.log(`Loaded live status for ${statusById.size} slots`);
            } else {
              console.log("No API URL configured, using unknown status");
            }
          } catch (e) {
            console.warn("[MapView] Live status fetch failed; using unknown:", e);
          }

          // 3) Merge status with layout
          geo.features.forEach(f => {
            const id = f?.properties?.slot_id;
            f.properties = f.properties || {};
            f.properties.slot_id = id || "";
            f.properties.status = statusById.get(id) || "unknown";
          });

          // 4) Add parking slots to map
          map.addSource("slots", { type: "geojson", data: geo });

          // Fill layer
          map.addLayer({
            id: "slots-fill",
            type: "fill",
            source: "slots",
            paint: {
              "fill-color": [
                "match", ["get", "status"],
                "occupied", "#d93025", // red
                "vacant", "#1a7f37",   // green
                "#9e9e9e"              // gray for unknown
              ],
              "fill-opacity": 0.7
            }
          });

          // Outline layer
          map.addLayer({
            id: "slots-outline",
            type: "line",
            source: "slots",
            paint: { 
              "line-color": "#333", 
              "line-width": 2 
            }
          });

          // Labels layer
          map.addLayer({
            id: "slots-labels",
            type: "symbol",
            source: "slots",
            layout: {
              "text-field": ["get", "slot_id"],
              "text-size": 11,
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
            const positions = collectPositions(f?.geometry?.coordinates);
            positions.forEach(([lng, lat]) => bounds.extend([lng, lat]));
          }
          
          if (!bounds.isEmpty()) {
            map.fitBounds(bounds, { 
              padding: 50, 
              maxZoom: 21 // Allow very close zoom
            });
          }

          // 6) Interactive features
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
                <div style="font-family: system-ui; padding: 10px;">
                  <div style="font-weight: bold; font-size: 14px;">Slot ${slot_id}</div>
                  <div style="margin: 5px 0;">
                    Status: <span style="color: ${statusColor}; font-weight: bold;">${status}</span>
                  </div>
                  ${last_updated ? `<div style="color: #666; font-size: 12px;">Updated: ${last_updated}</div>` : ""}
                </div>
              `)
              .addTo(map);
          });

          console.log("Map setup completed successfully!");

        } catch (e) {
          console.error("[MapView] Setup error:", e);
          setErr(`Map setup failed: ${e.message}`);
        }
      });

      map.on("error", (e) => {
        console.error("[MapView] Map error:", e);
        setErr(`Map error: ${e?.error?.message || e.message || "Unknown error"}`);
      });

      return () => {
        if (mapRef.current) {
          mapRef.current.remove();
        }
      };

    } catch (e) {
      console.error("[MapView] Constructor failed:", e);
      setErr(`Failed to initialize map: ${e.message}`);
    }
  }, [apiUrl]);

  return (
    <div style={{ position: "relative" }}>
      {err && (
        <div style={{
          position: "absolute", 
          zIndex: 1000, 
          top: 10, 
          left: 10,
          right: 10,
          background: "#fee2e2", 
          color: "#991b1b", 
          padding: 12, 
          borderRadius: 6,
          border: "1px solid #fecaca",
          fontSize: 14
        }}>
          <strong>Map Error:</strong> {err}
        </div>
      )}
      <div
        id="map"
        style={{ 
          height: 640, 
          width: "100%", 
          border: "1px solid #ccc", 
          borderRadius: 8 
        }}
      />
    </div>
  );
}
