import React from "react";
import MapView from "./MapView";

// Keep using your Amplify env var. If you must hardcode temporarily, paste the URL here.
const API_URL = process.env.REACT_APP_API_URL || "PASTE_YOUR_API_GATEWAY_URL_HERE";

export default function App() {
  return (
    <div style={{ padding: 20 }}>
      <h1 style={{ marginTop: 0 }}>UTAR Parking Dashboard</h1>

      {/* Legend */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", margin: "8px 0 16px" }}>
        <Chip color="#1a7f37" label="Vacant" />
        <Chip color="#d93025" label="Occupied" />
        <Chip color="#9e9e9e" label="Unknown" />
      </div>

      {/* The actual layout (GeoJSON) with labels + colors */}
      <MapView apiUrl={API_URL} />
    </div>
  );
}

function Chip({ color, label }) {
  return (
    <span style={{
      background: color,
      color: "#fff",
      padding: "4px 10px",
      borderRadius: 999,
      fontSize: 12,
      lineHeight: "18px",
      userSelect: "none"
    }}>
      {label}
    </span>
  );
}
