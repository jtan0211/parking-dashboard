import React from "react";

export default function ParkingDashboard({ slots }) {
  return (
    <table border="1" cellPadding="8">
      <thead>
        <tr>
          <th>Slot ID</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {slots.map((s, i) => (
          <tr key={i}>
            <td>{s.slot_id}</td>
            <td style={{ color: s.status === "occupied" ? "red" : "green" }}>
              {s.status}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
