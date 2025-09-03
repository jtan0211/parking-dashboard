import React, { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";

export default function MapView() {
  const mapRef = useRef(null);

  useEffect(() => {
    if (!mapRef.current) {
      const region = process.env.REACT_APP_LOCATION_REGION;
      const mapName = process.env.REACT_APP_LOCATION_MAP_NAME;
      const apiKey = process.env.REACT_APP_LOCATION_API_KEY;

      const styleUrl =
        `https://maps.geo.${region}.amazonaws.com/maps/v0/maps/${mapName}/style-descriptor`;

      const map = new maplibregl.Map({
        container: "map",
        style: styleUrl,
        center: [101.142, 4.335], // approx UTAR Kampar
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
    }
  }, []);

  return <div id="map" style={{ height: "600px", width: "100%" }} />;
}
