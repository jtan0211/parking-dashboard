import React, { useEffect, useState } from "react";
import MapView from "./MapView";

const API_URL = process.env.REACT_APP_API_URL || "PASTE_YOUR_API_GATEWAY_URL_HERE";

export default function App() {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    async function load() {
      const layout = await fetch("/parking_slots.geojson").then(r => r.json());
      const db = await fetch(API_URL).then(r => r.json()).catch(() => []);

      const status = {};
      db.forEach(d => { status[d.slot_id] = d.status; });

      const merged = layout.features
        .map(f => f.properties?.slot_id)
        .sort((a,b) => {
          const na = Number(a.slice(1)), nb = Number(b.slice(1));
          return na - nb;
        })
        .map(id => ({ id, status: status[id] || "unknown" }));

      setRows(merged);
    }
    load();
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h1>UTAR Parking Dashboard</h1>

      {/* Table */}
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

      {/* Map */}
      <h2 style={{ marginTop: 24 }}>Interactive Map</h2>
      <MapView apiUrl={API_URL} />
    </div>
  );
}
