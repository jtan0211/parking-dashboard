import React, { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export default function MapView({ apiUrl }) {
  const mapRef = useRef(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [debugInfo, setDebugInfo] = useState({});

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

  // Test AWS Location Services endpoint
  const testAWSEndpoint = async (region, mapName, apiKey) => {
    try {
      const testUrl = `https://maps.geo.${region}.amazonaws.com/maps/v0/maps/${mapName}/style-descriptor?key=${encodeURIComponent(apiKey)}`;
      console.log("Testing AWS endpoint:", testUrl);
      
      const response = await fetch(testUrl);
      console.log("Response status:", response.status);
      console.log("Response headers:", Object.fromEntries(response.headers.entries()));
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("Error response:", errorText);
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
      
      const styleData = await response.json();
      console.log("Style data loaded successfully");
      return { success: true, styleData };
    } catch (error) {
      console.error("Endpoint test failed:", error);
      return { success: false, error: error.message };
    }
  };

  useEffect(() => {
    const region = process.env.REACT_APP_LOCATION_REGION || "ap-southeast-1";
    const mapName = process.env.REACT_APP_LOCATION_MAP_NAME || "UTARParkingMap";
    const apiKey = process.env.REACT_APP_LOCATION_API_KEY;

    // Enhanced debugging info
    const debug = {
      region,
      mapName,
      apiKeyPresent: !!apiKey,
      apiKeyLength: apiKey ? apiKey.length : 0,
      apiKeyPreview: apiKey ? `${apiKey.substring(0, 8)}...` : "MISSING",
      allEnvVars: {
        REACT_APP_LOCATION_REGION: process.env.REACT_APP_LOCATION_REGION,
        REACT_APP_LOCATION_MAP_NAME: process.env.REACT_APP_LOCATION_MAP_NAME,
        REACT_APP_LOCATION_API_KEY: process.env.REACT_APP_LOCATION_API_KEY ? "[SET]" : "[NOT SET]"
      }
    };
    
    setDebugInfo(debug);
    console.log("=== AWS Location Debug Info ===", debug);

    // Validate configuration
    if (!apiKey || apiKey.includes("PASTE_YOUR") || apiKey.includes("YOUR_COPIED_API_KEY_HERE") || apiKey.includes("YOUR_ACTUAL_API_KEY")) {
      setErr(`❌ AWS Location API key is missing or still contains placeholder text.

Current API key preview: ${debug.apiKeyPreview}

STEPS TO FIX:
1. Go to AWS Console → Amazon Location Service → API keys
2. Click "Create API key"
3. Name: UTARParkingAPIKey
4. Add your domain to restrictions
5. Select your map resource
6. Copy the generated API key
7. Update your .env file:
   REACT_APP_LOCATION_API_KEY=v1.public.YOUR_ACTUAL_KEY_HERE
8. Restart your development server (npm start)

CURRENT ENVIRONMENT VARIABLES:
${JSON.stringify(debug.allEnvVars, null, 2)}`);
      setLoading(false);
      return;
    }

    // Test the endpoint before creating the map
    (async () => {
      const testResult = await testAWSEndpoint(region, mapName, apiKey);
      
      if (!testResult.success) {
        setErr(`❌ AWS Location Services endpoint test failed:

Error: ${testResult.error}

POSSIBLE CAUSES:
1. Invalid API Key - Check if the key is correct and active
2. Wrong Map Name - Verify map name "${mapName}" exists in AWS Console
3. Wrong Region - Verify region "${region}" is correct
4. API Key Restrictions - Check if your domain is allowed
5. Map doesn't exist - Create the map in AWS Location Service

TROUBLESHOOTING STEPS:
1. Go to AWS Console → Amazon Location Service → Maps
2. Verify map "${mapName}" exists in region "${region}"
3. Go to API keys → Check "${debug.apiKeyPreview}" is active
4. Test the API key with a simple curl command:
   curl "${`https://maps.geo.${region}.amazonaws.com/maps/v0/maps/${mapName}/style-descriptor?key=${apiKey.substring(0, 20)}...`}"

Current config: Region=${region}, Map=${mapName}, Key=${debug.apiKeyPreview}`);
        setLoading(false);
        return;
      }

      // If test passes, create the map
      console.log("✅ AWS endpoint test passed, creating map...");
      
      const styleUrl = `https://maps.geo.${region}.amazonaws.com/maps/v0/maps/${mapName}/style-descriptor?key=${encodeURIComponent(apiKey)}`;

      try {
        const map = new maplibregl.Map({
          container: "map",
          style: styleUrl,
          center: [101.139, 4.3386], // UTAR Kampar Block M coordinates
          zoom: 19,
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
            setLoading(false);
            console.log("✅ Map loaded successfully!");
            
            // Load parking slots
            const r = await fetch("/parking_slots.geojson");
            if (!r.ok) throw new Error(`Failed to load parking_slots.geojson (HTTP ${r.status})`);
            const geo = await r.json();
            
            console.log(`Loaded ${geo.features?.length || 0} parking slots`);

            // Demo status data for testing
            let statusById = new Map();
            ['A1', 'A3', 'A5', 'A15', 'A20', 'A25', 'A30', 'A35', 'A40'].forEach(id => {
              statusById.set(id, 'occupied');
            });
            ['A2', 'A4', 'A6', 'A10', 'A16', 'A21', 'A31', 'A36', 'A41'].forEach(id => {
              statusById.set(id, 'vacant');
            });

            // Merge status with layout
            geo.features.forEach(f => {
              const id = f?.properties?.slot_id;
              f.properties = f.properties || {};
              f.properties.slot_id = id || "";
              f.properties.status = statusById.get(id) || "unknown";
            });

            // Add parking slots to map
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
                "fill-opacity": 0.8
              }
            });

            // Outline layer
            map.addLayer({
              id: "slots-outline",
              type: "line",
              source: "slots",
              paint: { 
                "line-color": "#222", 
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

            // Fit to bounds
            const bounds = new maplibregl.LngLatBounds();
            for (const f of geo.features) {
              const positions = collectPositions(f?.geometry?.coordinates);
              positions.forEach(([lng, lat]) => bounds.extend([lng, lat]));
            }
            
            if (!bounds.isEmpty()) {
              map.fitBounds(bounds, { padding: 50, maxZoom: 21 });
            }

            // Click handlers
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
                    <div style="font-weight: bold; font-size: 14px; margin-bottom: 8px;">
                      Slot ${slot_id}
                    </div>
                    <div style="margin: 6px 0;">
                      Status: <span style="color: ${statusColor}; font-weight: bold; text-transform: capitalize;">${status}</span>
                    </div>
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

            console.log("✅ Parking slots added successfully!");

          } catch (e) {
            console.error("Map setup error:", e);
            setErr(`Map setup failed: ${e.message}`);
          }
        });

        map.on("error", (e) => {
          console.error("Map error:", e);
          setErr(`Map runtime error: ${e?.error?.message || e.message}`);
          setLoading(false);
        });

        return () => {
          if (mapRef.current) {
            mapRef.current.remove();
          }
        };

      } catch (e) {
        console.error("Map constructor failed:", e);
        setErr(`Failed to create map: ${e.message}`);
        setLoading(false);
      }
    })();
  }, [apiUrl]);

  return (
    <div style={{ position: "relative" }}>
      {/* Debug Info Panel (only show in development) */}
      {process.env.NODE_ENV === 'development' && (
        <div style={{
          position: "absolute",
          top: 10,
          right: 10,
          zIndex: 1001,
          background: "rgba(0,0,0,0.8)",
          color: "#fff",
          padding: 8,
          borderRadius: 4,
          fontSize: 11,
          maxWidth: 300
        }}>
          <div><strong>Debug Info:</strong></div>
          <div>Region: {debugInfo.region}</div>
          <div>Map: {debugInfo.mapName}</div>
          <div>API Key: {debugInfo.apiKeyPreview}</div>
          <div>Status: {loading ? "Loading..." : err ? "Error" : "Ready"}</div>
        </div>
      )}

      {loading && (
        <div style={{
          position: "absolute", 
          zIndex: 1000, 
          top: "50%", 
          left: "50%",
          transform: "translate(-50%, -50%)",
          background: "rgba(255, 255, 255, 0.95)", 
          padding: 24, 
          borderRadius: 8,
          textAlign: "center",
          boxShadow: "0 4px 6px rgba(0,0,0,0.1)"
        }}>
          <div style={{ fontSize: 16, marginBottom: 8 }}>🔄 Testing AWS Connection...</div>
          <div style={{ fontSize: 12, color: "#666" }}>
            Verifying map configuration
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
          padding: 20, 
          borderRadius: 8,
          border: "1px solid #fecaca",
          fontSize: 13,
          lineHeight: 1.5,
          whiteSpace: "pre-line",
          fontFamily: "monospace",
          maxHeight: "200px",
          overflowY: "auto"
        }}>
          {err}
        </div>
      )}
      
      <div
        id="map"
        style={{ 
          height: 640, 
          width: "100%", 
          border: "1px solid #ccc", 
          borderRadius: 8,
          backgroundColor: loading ? "#f8f9fa" : "transparent"
        }}
      />
    </div>
  );
}
