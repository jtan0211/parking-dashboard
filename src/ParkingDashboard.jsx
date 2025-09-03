import React, { useEffect, useState } from "react";

export default function ParkingDashboard() {
  const [slots, setSlots] = useState([]);

  useEffect(() => {
    // Load parking slot layout
    fetch("/parking_slots.geojson")
      .then(res => res.json())
      .then(data => {
        setSlots(data.features.map(f => ({
          id: f.properties.slot_id,
        })));
      });
  }, []);

  return (
    <div>
      <h2>UTAR Parking Dashboard</h2>
      <table border="1" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th>Slot ID</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {slots.map(slot => (
            <tr key={slot.id}>
              <td>{slot.id}</td>
              <td id={`status-${slot.id}`}>Loading...</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
