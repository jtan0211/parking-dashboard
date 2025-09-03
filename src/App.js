import React, { useEffect, useState } from "react";
import MapView from "./MapView";

const API_URL = process.env.REACT_APP_API_URL || "PASTE_YOUR_API_GATEWAY_URL_HERE";

export default function App() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        // 1) Load layout (must succeed for rows to render)
        const resp = await fetch("/parking_slots.geojson");
        if (!resp.ok) {
          const txt = await resp.text().catch(() => "");
          console.error("GeoJSON fetch failed", resp.status, txt);
          setError(`Failed to load /parking_slots.geojson: ${resp.status}`);
          return;
        }
        const geo = await resp.json();
        const ids = geo.features
          .map(f => f?.properties?.slot_id)
          .filter(Boolean)
          .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));

        // 2) Try API (optional). If it fails, we still show rows with "unknown".
        let statusMap = {};
        try {
          const api = await fetch(API_URL).then(r => r.json());
          statusMap = api.reduce((m, d) => (m[d.slot_id] = d.status, m), {});
        } catch (e) {
          console.warn("API fetch failed (continuing with unknown status):", e);
        }

        setRows(ids.map(id => ({ id, status: statusMap[id] || "unknown" })));
      } catch (e) {
        console.error("App init error", e);
        setError(String(e));
      }
    })();
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h1>UTAR Parking Dashboard</h1>

      {error && (
        <div style={{ color: "#b00020", marginBottom: 12 }}>
          {error} — open the browser console for details.
        </div>
      )}

      <table border="1" cellPadding="6" style={{ borderCollapse: "collapse", minWidth: 280 }}>
        <thead>
          <tr><th>Slot ID</th><th>Status</th></tr>
        </thead>
        <tbody>
          {rows.map(s => (
            <tr key={s.id}>
              <td>{s.id}</td>
              <td style={{ color: s.status === "occupied" ? "red" : (s.status === "vacant" ? "green" : "#666") }}>
                {s.status}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 style={{ marginTop: 24 }}>Interactive Map</h2>
      <MapView apiUrl={API_URL} />
    </div>
  );
}
