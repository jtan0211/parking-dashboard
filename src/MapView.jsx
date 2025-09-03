import React, { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export default function MapView({ apiUrl }) {
  const mapRef = useRef(null);

  useEffect(() => {
    const region = process.env.REACT_APP_LOCATION_REGION;
    const mapName = process.env.REACT_APP_LOCATION_MAP_NAME;
    const apiKey  = process.env.REACT_APP_LOCATION_API_KEY;

    if (!region || !mapName || !apiKey) {
      console.warn("Map env vars missing; check Amplify env vars.");
    }

    const styleUrl =
      `https://maps.geo.${region}.amazonaws.com/maps/v0/maps/${mapName}/style-descriptor`;

    const map = new maplibregl.Map({
      container: "map",
      style: styleUrl,
      center: [101.142, 4.335],
      zoom: 17,
      transformRequest: (url) => {
        if (url.startsWith(`https://maps.geo.${region}.amazonaws.com/`)) {
          return { url, headers: { "x-amz-api-key": apiKey } };
        }
        return { url };
      }
    });
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    mapRef.current = map;

    (async () => {
      try {
        // Attempt to load both; if GeoJSON fails we'll see it in the App's error too.
        const [geoResp, apiResp] = await Promise.allSettled([
          fetch("/parking_slots.geojson"),
          fetch(apiUrl)
        ]);

        let geo = null;
        if (geoResp.status === "fulfilled" && geoResp.value.ok) {
          geo = await geoResp.value.json();
        } else {
          console.error("Map GeoJSON fetch failed", geoResp);
          return; // without geometry we can't draw
        }

        const statusById = new Map();
        if (apiResp.status === "fulfilled") {
          try {
            const data = await apiResp.value.json();
            data.forEach(d => statusById.set(d.slot_id, d.status));
          } catch (e) {
            console.warn("Map API parse failed", e);
          }
        }

        geo.features.forEach(f => {
          const id = f.properties?.slot_id;
          f.properties = f.properties || {};
          f.properties.status = statusById.get(id) || "unknown";
        });

        map.on("load", () => {
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
              "fill-opacity": 0.45
            }
          });
          map.addLayer({
            id: "slots-outline",
            type: "line",
            source: "slots",
            paint: { "line-color": "#333", "line-width": 1 }
          });

          try {
            const b = new maplibregl.LngLatBounds();
            geo.features.forEach(f =>
              (f.geometry.coordinates || []).flat(2)
                .forEach(([lng, lat]) => b.extend([lng, lat]))
            );
            if (!b.isEmpty()) map.fitBounds(b, { padding: 40, maxZoom: 19 });
          } catch (e) {
            console.warn("fitBounds failed", e);
          }
        });
      } catch (e) {
        console.error("Map init error", e);
      }
    })();

    return () => map.remove();
  }, [apiUrl]);

  return <div id="map" style={{ height: 600, width: "100%", border: "1px solid #ccc", borderRadius: 8 }} />;
}
