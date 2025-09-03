import React, { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export default function SimpleMapView({ apiUrl }) {
  const mapRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

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
        container: "simple-map",
        style: {
          version: 8,
          sources: {
            osm: {
              type: "raster",
              tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
              tileSize: 256,
              attribution: "&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors"
            }
          },
          layers: [
            {
              id: "osm",
              type: "raster",
              source: "osm",
              minzoom: 0,
              maxzoom: 19
            }
          ]
        },
        center: [101.139, 4.3386], // UTAR coordinates
        zoom: 19
      });

      map.addControl(new maplibregl.NavigationControl(), "top-right");
      mapRef.current = map;

      map.on("load", async () => {
        try {
          setLoading(false);
          console.log("✅ OpenStreetMap loaded!");
          
          // Load parking slots
          const r = await fetch("/parking_slots.geojson");
          if (!r.ok) throw new Error(`Failed to load parking_slots.geojson`);
          const geo = await r.json();
          
          console.log(`Loaded ${geo.features?.length || 0} parking slots`);

          // Demo status
          let statusById = new Map();
          ['A1', 'A3', 'A5', 'A15', 'A20'].forEach(id => statusById.set(id, 'occupied'));
          ['A2', 'A4', 'A6', 'A10', 'A16'].forEach(id => statusById.set(id, 'vacant'));

          geo.features.forEach(f => {
            const id = f?.properties?.slot_id;
            f.properties = f.properties || {};
            f.properties.slot_id = id || "";
            f.properties.status = statusById.get(id) || "unknown";
          });

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
            paint: { "line-color": "#222", "line-width": 2 }
          });

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

          // Fit to bounds
          const bounds = new maplibregl.LngLatBounds();
          for (const f of geo.features) {
            const positions = collectPositions(f?.geometry?.coordinates);
            positions.forEach(([lng, lat]) => bounds.extend([lng, lat]));
          }
          
          if (!bounds.isEmpty()) {
            map.fitBounds(bounds, { padding: 50, maxZoom: 21 });
          }

          // Click handler
          map.on("click", "slots-fill", (e) => {
            const feature = e.features?.[0];
            if (!feature) return;
            
            const { slot_id, status } = feature.properties || {};
            const statusColor = 
              status === "occupied" ? "#d93025" : 
              status === "vacant" ? "#1a7f37" : "#666";
            
            new maplibregl.Popup({ closeButton: true })
              .setLngLat(e.lngLat)
              .setHTML(`
                <div style="font-family: system-ui; padding: 12px;">
                  <div style="font-weight: bold; margin-bottom: 8px;">Slot ${slot_id}</div>
                  <div>Status: <span style="color: ${statusColor}; font-weight: bold;">${status}</span></div>
                  <div style="color: #666; font-size: 12px; margin-top: 6px;">Using OpenStreetMap for testing</div>
                </div>
              `)
              .addTo(map);
          });

          map.on("mouseenter", "slots-fill", () => {
            map.getCanvas().style.cursor = "pointer";
          });

          map.on("mouseleave", "slots-fill", () => {
            map.getCanvas().style.cursor = "";
          });

        } catch (e) {
          setErr(`Setup error: ${e.message}`);
        }
      });

      return () => {
        if (mapRef.current) mapRef.current.remove();
      };

    } catch (e) {
      setErr(`Map creation error: ${e.message}`);
      setLoading(false);
    }
  }, []);

  return (
    <div style={{ position: "relative" }}>
      {loading && (
        <div style={{
          position: "absolute", 
          zIndex: 1000, 
          top: "50%", 
          left: "50%",
          transform: "translate(-50%, -50%)",
          background: "rgba(255, 255, 255, 0.95)", 
          padding: 20, 
          borderRadius: 8,
          textAlign: "center"
        }}>
          <div>Loading OpenStreetMap...</div>
          <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
            Testing your parking layout
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
          border: "1px solid #fecaca"
        }}>
          <strong>Error:</strong> {err}
        </div>
      )}
      
      <div
        id="simple-map"
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
