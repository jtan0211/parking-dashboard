import React, { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export default function MapView({ apiUrl }) {
  const mapRef = useRef(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [dataStatus, setDataStatus] = useState("Loading...");

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
        center: [101.139, 4.3386], // UTAR Kampar Block M coordinates
        zoom: 19 // Close zoom to see parking slots clearly
      });

      map.addControl(new maplibregl.NavigationControl(), "top-right");
      mapRef.current = map;

      map.on("load", async () => {
        try {
          console.log("🗺️ Map loaded successfully");
          
          // 1) Load parking layout from GeoJSON
          setDataStatus("Loading parking layout...");
          const layoutResponse = await fetch("/parking_slots.geojson");
          if (!layoutResponse.ok) {
            throw new Error(`Failed to load parking layout (HTTP ${layoutResponse.status})`);
          }
          const geo = await layoutResponse.json();
          console.log(`📍 Loaded ${geo.features?.length || 0} parking slots from layout`);

          // 2) Load real-time status from DynamoDB via API Gateway
          let statusById = new Map();
          setDataStatus("Fetching real-time parking status...");
          
          try {
            console.log("🔗 Fetching data from API Gateway:", apiUrl);
            const statusResponse = await fetch(apiUrl);
            
            if (!statusResponse.ok) {
              throw new Error(`API Gateway returned HTTP ${statusResponse.status}`);
            }
            
            const liveData = await statusResponse.json();
            console.log("📊 Raw API response:", liveData);
            
            // Handle different response formats
            let parkingData = [];
            if (Array.isArray(liveData)) {
              parkingData = liveData;
            } else if (liveData.body) {
              // Lambda proxy integration might wrap response in 'body'
              parkingData = typeof liveData.body === 'string' ? JSON.parse(liveData.body) : liveData.body;
            } else if (liveData.Items) {
              // DynamoDB scan result format
              parkingData = liveData.Items;
            } else {
              console.warn("Unexpected API response format:", liveData);
              parkingData = [];
            }

            // Map the data to slot status
            parkingData.forEach(slot => {
              const slotId = slot.slot_id || slot.slotId || slot.id;
              const status = slot.status || slot.occupancy_status || 'unknown';
              if (slotId) {
                statusById.set(slotId, status);
              }
            });

            console.log(`✅ Loaded real-time status for ${statusById.size} slots`);
            setDataStatus(`Connected - ${statusById.size} slots monitored`);
            
          } catch (apiError) {
            console.error("❌ API fetch failed:", apiError);
            setDataStatus(`API Error: ${apiError.message}`);
            // Don't throw here - continue with layout-only display
          }

          // 3) Merge real-time status with parking layout
          geo.features.forEach(feature => {
            const slotId = feature?.properties?.slot_id;
            feature.properties = {
              ...feature.properties,
              slot_id: slotId || "",
              status: statusById.get(slotId) || "unknown",
              last_updated: new Date().toLocaleTimeString()
            };
          });

          // 4) Add parking slots to map
          map.addSource("parking-slots", { 
            type: "geojson", 
            data: geo 
          });

          // Fill layer with status colors
          map.addLayer({
            id: "slots-fill",
            type: "fill",
            source: "parking-slots",
            paint: {
              "fill-color": [
                "match", 
                ["get", "status"],
                "occupied", "#dc2626", // Red for occupied
                "vacant", "#16a34a",   // Green for vacant
                "available", "#16a34a", // Alternative term for vacant
                "unavailable", "#dc2626", // Alternative term for occupied
                "#6b7280"              // Gray for unknown
              ],
              "fill-opacity": 0.7
            }
          });

          // Outline layer
          map.addLayer({
            id: "slots-outline",
            type: "line",
            source: "parking-slots",
            paint: { 
              "line-color": "#374151", 
              "line-width": 2 
            }
          });

          // Labels layer
          map.addLayer({
            id: "slots-labels",
            type: "symbol",
            source: "parking-slots",
            layout: {
              "text-field": ["get", "slot_id"],
              "text-size": 11,
              "text-allow-overlap": true
            },
            paint: {
              "text-color": "#ffffff",
              "text-halo-color": "#000000",
              "text-halo-width": 2
            }
          });

          // 5) Fit map to parking area bounds
          const bounds = new maplibregl.LngLatBounds();
          for (const feature of geo.features) {
            const positions = collectPositions(feature.geometry.coordinates);
            positions.forEach(([lng, lat]) => bounds.extend([lng, lat]));
          }
          
          if (!bounds.isEmpty()) {
            map.fitBounds(bounds, { 
              padding: 50, 
              maxZoom: 21 
            });
          }

          // 6) Interactive features
          map.on("mouseenter", "slots-fill", () => {
            map.getCanvas().style.cursor = "pointer";
          });
          
          map.on("mouseleave", "slots-fill", () => {
            map.getCanvas().style.cursor = "";
          });
          
          map.on("click", "slots-fill", (e) => {
            const feature = e.features?.[0];
            if (!feature) return;
            
            const { slot_id, status, last_updated } = feature.properties || {};
            
            const statusInfo = {
              occupied: { color: "#dc2626", text: "Occupied", icon: "🚗" },
              vacant: { color: "#16a34a", text: "Vacant", icon: "✅" },
              available: { color: "#16a34a", text: "Available", icon: "✅" },
              unavailable: { color: "#dc2626", text: "Unavailable", icon: "❌" },
              unknown: { color: "#6b7280", text: "Unknown", icon: "❓" }
            };
            
            const info = statusInfo[status] || statusInfo.unknown;
            
            new maplibregl.Popup({ 
              closeButton: true,
              className: "parking-popup"
            })
              .setLngLat(e.lngLat)
              .setHTML(`
                <div style="
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
                  padding: 16px;
                  min-width: 200px;
                ">
                  <div style="
                    font-weight: 600; 
                    font-size: 16px; 
                    margin-bottom: 12px;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                  ">
                    🅿️ Slot ${slot_id}
                  </div>
                  
                  <div style="
                    margin: 8px 0;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                  ">
                    <span style="font-size: 18px;">${info.icon}</span>
                    <span style="font-weight: 500;">Status:</span>
                    <span style="
                      color: ${info.color}; 
                      font-weight: 600; 
                      text-transform: capitalize;
                    ">${info.text}</span>
                  </div>
                  
                  <div style="
                    color: #6b7280; 
                    font-size: 12px; 
                    margin-top: 12px;
                    padding-top: 8px;
                    border-top: 1px solid #e5e7eb;
                  ">
                    📍 UTAR Kampar Block M<br>
                    🕒 Updated: ${last_updated}
                  </div>
                </div>
              `)
              .addTo(map);
          });

          setLoading(false);
          console.log("🎉 Map setup completed successfully");

        } catch (setupError) {
          console.error("❌ Map setup error:", setupError);
          setErr(`Map setup failed: ${setupError.message}`);
          setLoading(false);
        }
      });

      map.on("error", (e) => {
        console.error("❌ Map error:", e);
        setErr(`Map error: ${e?.error?.message || e.message || "Unknown map error"}`);
        setLoading(false);
      });

      return () => {
        if (mapRef.current) {
          mapRef.current.remove();
        }
      };

    } catch (initError) {
      console.error("❌ Map initialization failed:", initError);
      setErr(`Failed to initialize map: ${initError.message}`);
      setLoading(false);
    }
  }, [apiUrl]);

  return (
    <div style={{ position: "relative" }}>
      {/* Loading indicator */}
      {loading && (
        <div style={{
          position: "absolute", 
          zIndex: 1000, 
          top: "50%", 
          left: "50%",
          transform: "translate(-50%, -50%)",
          background: "rgba(255, 255, 255, 0.95)", 
          padding: 24, 
          borderRadius: 12,
          textAlign: "center",
          boxShadow: "0 10px 25px rgba(0,0,0,0.1)",
          border: "1px solid #e5e7eb"
        }}>
          <div style={{ fontSize: 16, marginBottom: 8, fontWeight: 500 }}>
            🔄 Initializing Parking Map
          </div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>
            {dataStatus}
          </div>
        </div>
      )}
      
      {/* Error display */}
      {err && (
        <div style={{
          position: "absolute", 
          zIndex: 1000, 
          top: 16, 
          left: 16,
          right: 16,
          background: "#fef2f2", 
          color: "#991b1b", 
          padding: 16, 
          borderRadius: 8,
          border: "1px solid #fecaca",
          fontSize: 14,
          lineHeight: 1.5
        }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>⚠️ Map Error</div>
          <div>{err}</div>
        </div>
      )}

      {/* Status indicator */}
      {!loading && !err && (
        <div style={{
          position: "absolute",
          top: 16,
          right: 16,
          zIndex: 1000,
          background: "rgba(255, 255, 255, 0.9)",
          padding: "8px 12px",
          borderRadius: 6,
          fontSize: 12,
          color: "#374151",
          border: "1px solid #d1d5db",
          backdropFilter: "blur(4px)"
        }}>
          🔗 {dataStatus}
        </div>
      )}
      
      {/* Map container */}
      <div
        id="map"
        style={{ 
          height: 640, 
          width: "100%", 
          border: "1px solid #d1d5db", 
          borderRadius: 8,
          backgroundColor: loading ? "#f9fafb" : "transparent"
        }}
      />
    </div>
  );
}
