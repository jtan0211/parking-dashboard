import React, { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";

export default function MapView({ apiUrl }) {
  const mapRef = useRef(null);

  useEffect(() => {
    const region = process.env.REACT_APP_LOCATION_REGION;
    const mapName = process.env.REACT_APP_LOCATION_MAP_NAME;
    const apiKey  = process.env.REACT_APP_LOCATION_API_KEY;

    const styleUrl = `https://maps.geo.${region}.amazonaws.com/maps/v0/maps/${mapName}/style-descriptor`;

    const map = new maplibregl.Map({
      container: "map",
      style: styleUrl,
      center: [101.142, 4.335],   // adjust if you like
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
      // 1) live statuses from DynamoDB via your Lambda/API Gateway
      const db = await fetch(apiUrl).then(r => r.json());
      const statusById = new Map(db.map(d => [d.slot_id, d.status]));

      // 2) parking layout from /public
      const geo = await fetch("/parking_slots.geojson").then(r => r.json());

      // 3) join: attach status to each feature
      geo.features.forEach(f => {
        const id = f.properties?.slot_id;
        f.properties = f.properties || {};
        f.properties.status = statusById.get(id) || "unknown";
      });

      // 4) add to map
      map.on("load", () => {
        map.addSource("slots", { type: "geojson", data: geo });

        map.addLayer({
          id: "slots-fill",
          type: "fill",
          source: "slots",
          paint: {
            "fill-color": [
              "match",
              ["get", "status"],
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

        // click popup
        map.on("click", "slots-fill", (e) => {
          const f = e.features?.[0];
          if (!f) return;
          const { slot_id, status } = f.properties;
          new maplibregl.Popup()
            .setLngLat(e.lngLat)
            .setHTML(`<strong>${slot_id}</strong><br/>${status}`)
            .addTo(map);
        });

        // fit to polygons
        try {
          const b = new maplibregl.LngLatBounds();
          geo.features.forEach(f =>
            (f.geometry.coordinates || []).flat(2)
              .forEach(([lng, lat]) => b.extend([lng, lat]))
          );
          if (!b.isEmpty()) map.fitBounds(b, { padding: 40, maxZoom: 19 });
        } catch {}
      });
    })();

    return () => map.remove();
  }, [apiUrl]);

  return <div id="map" style={{ height: 600, width: "100%", border: "1px solid #ccc", borderRadius: 8 }} />;
}
