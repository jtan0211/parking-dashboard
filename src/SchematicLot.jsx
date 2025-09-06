import React, { useEffect, useMemo, useState } from "react";

const W = 1200;      // logical width for the SVG viewBox (responsive)
const H = 520;       // logical height for the SVG viewBox
const M = 20;        // margin inside the viewBox

export default function SchematicLot({ apiUrl }) {
  const [geo, setGeo] = useState(null);
  const [statusById, setStatusById] = useState(new Map());
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [apiStatus, setApiStatus] = useState("Connecting...");

  // Load parking layout
  useEffect(() => {
    (async () => {
      try {
        console.log("📋 Loading parking layout...");
        const response = await fetch("/parking_slots.geojson");
        if (!response.ok) throw new Error(`Failed to load parking layout (HTTP ${response.status})`);
        const geoData = await response.json();
        setGeo(geoData);
        console.log(`📍 Loaded ${geoData.features?.length || 0} parking slots`);
      } catch (error) {
        console.error("❌ Layout loading error:", error);
        setErr(`Failed to load parking layout: ${error.message}`);
      }
    })();
  }, []);

  // Load real-time status from API
  useEffect(() => {
    (async () => {
      try {
        setApiStatus("Fetching real-time data...");
        console.log("🔗 Fetching parking status from:", apiUrl);
        
        const response = await fetch(apiUrl);
        if (!response.ok) {
          throw new Error(`API returned HTTP ${response.status}`);
        }
        
        const apiData = await response.json();
        console.log("📊 API Response:", apiData);
        
        // Handle different API response formats
        let parkingData = [];
        if (Array.isArray(apiData)) {
          parkingData = apiData;
        } else if (apiData.body) {
          // Lambda proxy integration
          parkingData = typeof apiData.body === 'string' ? JSON.parse(apiData.body) : apiData.body;
        } else if (apiData.Items) {
          // DynamoDB scan result
          parkingData = apiData.Items;
        } else {
          console.warn("Unexpected API response format");
          parkingData = [];
        }

        // Create status map
        const statusMap = new Map();
        parkingData.forEach(slot => {
          const slotId = slot.slot_id || slot.slotId || slot.id;
          const status = slot.status || slot.occupancy_status || 'unknown';
          if (slotId) {
            statusMap.set(slotId, status);
          }
        });

        setStatusById(statusMap);
        setApiStatus(`Live data - ${statusMap.size} slots`);
        setLoading(false);
        
        console.log(`✅ Loaded status for ${statusMap.size} slots`);
        
      } catch (error) {
        console.error("❌ API fetch failed:", error);
        setApiStatus(`API Error: ${error.message}`);
        setLoading(false);
        // Continue with layout-only display
      }
    })();
  }, [apiUrl]);

  // Helper to extract all coordinates from any geometry type
  const getAllCoords = (geom) => {
    const out = [];
    const walk = (c) => {
      if (!c) return;
      if (typeof c[0] === "number" && typeof c[1] === "number") { 
        out.push(c); 
        return; 
      }
      for (const x of c) walk(x);
    };
    walk(geom?.coordinates);
    return out;
  };

  // Compute bounds across all features
  const bounds = useMemo(() => {
    if (!geo?.features?.length) return null;
    
    let minLng = Infinity, maxLng = -Infinity;
    let minLat = Infinity, maxLat = -Infinity;
    
    for (const feature of geo.features) {
      for (const [lng, lat] of getAllCoords(feature.geometry)) {
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
    }
    
    return { minLng, maxLng, minLat, maxLat };
  }, [geo]);

  // Project lng/lat to SVG coordinates
  const project = (lng, lat) => {
    if (!bounds) return [0, 0];
    
    const { minLng, maxLng, minLat, maxLat } = bounds;
    const innerW = W - 2 * M;
    const innerH = H - 2 * M;
    
    const x = M + ((lng - minLng) / Math.max(1e-9, (maxLng - minLng))) * innerW;
    const y = M + (1 - (lat - minLat) / Math.max(1e-9, (maxLat - minLat))) * innerH; // flip Y
    
    return [x, y];
  };

  // Convert features to SVG shapes
  const shapes = useMemo(() => {
    if (!geo?.features || !bounds) return [];
    
    const shapeArray = [];
    
    for (const feature of geo.features) {
      const slotId = feature?.properties?.slot_id || "";
      const status = statusById.get(slotId) || feature?.properties?.status || "unknown";

      const geomType = feature?.geometry?.type;
      const coords = feature?.geometry?.coordinates;
      if (!coords) continue;

      // Handle different geometry types
      const polygons = geomType === "Polygon" ? [coords] : 
                      geomType === "MultiPolygon" ? coords : [];
      
      for (const polygon of polygons) {
        const outerRing = polygon[0]; // First ring is outer boundary
        if (!outerRing?.length) continue;

        // Convert to SVG polygon points
        const points = outerRing
          .map(([lng, lat]) => project(lng, lat).join(","))
          .join(" ");

        // Calculate centroid for label placement
        let centerX = 0, centerY = 0;
        outerRing.forEach(([lng, lat]) => {
          const [x, y] = project(lng, lat);
          centerX += x; 
          centerY += y;
        });
        centerX /= outerRing.length; 
        centerY /= outerRing.length;

        shapeArray.push({ 
          id: slotId, 
          status, 
          points, 
          centerX, 
          centerY 
        });
      }
    }
    
    return shapeArray;
  }, [geo, bounds, statusById]);

  // Status color mapping
  const getStatusColor = (status) => {
    switch (status) {
      case "occupied":
      case "unavailable":
        return "#dc2626"; // Red
      case "vacant":
      case "available":
        return "#16a34a"; // Green
      default:
        return "#6b7280"; // Gray for unknown
    }
  };

  // Loading state
  if (loading) {
    return (
      <div>
        <div style={{ margin: "8px 0 10px", fontWeight: 600 }}>Parking Layout</div>
        <div style={{
          height: 300,
          border: "1px solid #d1d5db",
          borderRadius: 8,
          background: "#f9fafb",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 8
        }}>
          <div style={{ fontSize: 16, fontWeight: 500 }}>🔄 Loading Parking Data</div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>{apiStatus}</div>
        </div>
      </div>
    );
  }

  // Error state
  if (err) {
    return (
      <div>
        <div style={{ margin: "8px 0 10px", fontWeight: 600 }}>Parking Layout</div>
        <div style={{
          padding: 16,
          background: "#fef2f2",
          color: "#991b1b",
          border: "1px solid #fecaca",
          borderRadius: 8
        }}>
          ⚠️ {err}
        </div>
      </div>
    );
  }

  // No data state
  if (!bounds || shapes.length === 0) {
    return (
      <div>
        <div style={{ margin: "8px 0 10px", fontWeight: 600 }}>Parking Layout</div>
        <div style={{
          padding: 16,
          background: "#f3f4f6",
          color: "#374151",
          border: "1px solid #d1d5db",
          borderRadius: 8
        }}>
          📍 No parking data available
        </div>
      </div>
    );
  }

  // Count slots by status
  const statusCounts = shapes.reduce((acc, shape) => {
    acc[shape.status] = (acc[shape.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div>
      {/* Header with status info */}
      <div style={{ 
        display: "flex", 
        justifyContent: "space-between", 
        alignItems: "center",
        margin: "8px 0 10px" 
      }}>
        <div style={{ fontWeight: 600 }}>Parking Layout</div>
        <div style={{ 
          fontSize: 12, 
          color: "#6b7280",
          display: "flex",
          gap: 12
        }}>
          <span>🔗 {apiStatus}</span>
          <span>📊 Total: {shapes.length} slots</span>
        </div>
      </div>

      {/* Status summary */}
      <div style={{
        display: "flex",
        gap: 12,
        marginBottom: 10,
        fontSize: 12
      }}>
        {Object.entries(statusCounts).map(([status, count]) => (
          <div key={status} style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: "4px 8px",
            background: "#f3f4f6",
            borderRadius: 4,
            border: "1px solid #e5e7eb"
          }}>
            <div style={{
              width: 12,
              height: 12,
              borderRadius: 2,
              backgroundColor: getStatusColor(status)
            }} />
            <span style={{ textTransform: "capitalize", fontWeight: 500 }}>
              {status}: {count}
            </span>
          </div>
        ))}
      </div>

      {/* SVG parking layout */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{ 
          border: "1px solid #d1d5db", 
          borderRadius: 8, 
          background: "#fafafa" 
        }}
        role="img"
        aria-label="UTAR Kampar Block M Parking Layout"
      >
        {/* Render parking slots */}
        {shapes.map((shape, index) => (
          <g key={`${shape.id}-${index}`}>
            {/* Parking slot polygon */}
            <polygon
              points={shape.points}
              fill={getStatusColor(shape.status)}
              fillOpacity="0.7"
              stroke="#374151"
              strokeWidth="1.5"
              style={{ cursor: "pointer" }}
            />
            
            {/* Slot ID label */}
            <text
              x={shape.centerX}
              y={shape.centerY}
              textAnchor="middle"
              alignmentBaseline="middle"
              style={{ 
                fontSize: 11, 
                fill: "#ffffff", 
                fontWeight: 600,
                paintOrder: "stroke", 
                stroke: "#000000", 
                strokeWidth: 2 
              }}
            >
              {shape.id}
            </text>
          </g>
        ))}
        
        {/* Title */}
        <text
          x={W / 2}
          y={M / 2}
          textAnchor="middle"
          style={{
            fontSize: 14,
            fontWeight: 600,
            fill: "#374151"
          }}
        >
          UTAR Kampar Block M Parking
        </text>
      </svg>
    </div>
  );
}
