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

    // Sanity check the key so we don’t accidentally send a URL/ARN
    if (!apiKey || apiKey.startsWith("http") || apiKey.startsWith("arn:")) {
      setErr("Invalid REACT_APP_LOCATION_API_KEY. Please paste the v1.public… key value.");
      return;
    }

    const styleUrl = `https://maps.geo.${region}.amazonaws.com/maps/v0/maps/${mapName}/style-descriptor`;

    let map;
    try {
      map = new maplibregl.Map({
        container: "map",
        style: styleUrl,
        center: [101.142, 4.335],
        zoom: 17,
        // Attach the API key to **all** Amazon Location requests
        transformRequest: (url, resourceType) => {
          if (url.includes(`maps.geo.${region}.amazonaws.com/`)) {
            return { url, headers: { "X-Amz-Api-Key": apiKey } };
          }
          return { url };
        }
      });

      map.addControl(new maplibregl.NavigationControl(), "top-right");
      mapRef.current = map;

      map.on("load", async () => {
        try {
          const r = await fetch("/parking_slots.geojson");
          if (!r.ok) throw new Error(`geojson ${r.status}`);
          const geo = await r.json();

          let statusById = new Map();
          try {
            const api = await fetch(apiUrl).then(x => x.json());
            api.forEach(d => statusById.set(d.slot_id, d.status));
          } catch {}

          geo.features.forEach(f => {
            const id = f.properties?.slot_id;
            f.properties = f.properties || {};
            f.properties.status = statusById.get(id) || "unknown";
          });

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
                /* else */  "#9e9e9e"
              ],
              "fill-opacity": 0.45
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

          // Fit to all polygons
          const b = new maplibregl.LngLatBounds();
          geo.features.forEach(f =>
            (f.geometry.coordinates || []).flat(2).forEach(([lng, lat]) => b.extend([lng, lat]))
          );
          if (!b.isEmpty()) map.fitBounds(b, { padding: 40, maxZoom: 19 });
        } catch (e) {
          setErr(String(e));
          console.error(e);
        }
      });

      map.on("error", e => console.error("map error:", e?.error || e));
    } catch (e) {
      setErr(String(e));
      console.error(e);
    }

    return () => { try { map?.remove(); } catch {} };
  }, [apiUrl]);

  return (
    <div style={{ position: "relative" }}>
      {err && (
        <div style={{ position: "absolute", zIndex: 2, top: 8, left: 8, background: "#fee", color: "#900", padding: 8, borderRadius: 6 }}>
          Map error: {err}
        </div>
      )}
      <div id="map" style={{ height: 600, width: "100%", border: "1px solid #ccc", borderRadius: 8 }} />
    </div>
  );
}
