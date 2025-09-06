import React from "react";
import MapView from "./MapView";
import SchematicLot from "./SchematicLot";

const API_URL = process.env.REACT_APP_API_URL || "https://01jxz7ham2.execute-api.ap-southeast-1.amazonaws.com/slots";

export default function App() {
  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ 
          marginTop: 0, 
          marginBottom: 8,
          fontSize: 28,
          fontWeight: 700,
          color: "#111827"
        }}>
          UTAR Parking Dashboard
        </h1>
        <p style={{ 
          margin: 0, 
          color: "#6b7280", 
          fontSize: 14 
        }}>
          Real-time parking availability for UTAR Kampar Block M
        </p>
      </div>

      {/* Status Legend */}
      <div style={{ 
        display: "flex", 
        gap: 16, 
        alignItems: "center", 
        margin: "0 0 24px",
        padding: "12px 16px",
        background: "#f9fafb",
        borderRadius: 8,
        border: "1px solid #e5e7eb"
      }}>
        <span style={{ fontWeight: 600, fontSize: 14, color: "#374151" }}>
          Legend:
        </span>
        <StatusChip color="#16a34a" label="Vacant" icon="✅" />
        <StatusChip color="#dc2626" label="Occupied" icon="🚗" />
        <StatusChip color="#6b7280" label="Unknown" icon="❓" />
      </div>

      {/* Schematic Layout */}
      <div style={{ marginBottom: 32 }}>
        <SchematicLot apiUrl={API_URL} />
      </div>

      {/* Interactive Map */}
      <div>
        <h2 style={{ 
          margin: "0 0 16px", 
          fontSize: 20, 
          fontWeight: 600,
          color: "#111827" 
        }}>
          Interactive Map View
        </h2>
        <MapView apiUrl={API_URL} />
      </div>

      {/* Footer */}
      <div style={{
        marginTop: 32,
        padding: "16px 0",
        borderTop: "1px solid #e5e7eb",
        textAlign: "center",
        color: "#6b7280",
        fontSize: 12
      }}>
        <p style={{ margin: 0 }}>
          🏫 Universiti Tunku Abdul Rahman (UTAR) Kampar Campus
        </p>
        <p style={{ margin: "4px 0 0" }}>
          📍 Block M Parking Area • Real-time IoT Monitoring System
        </p>
      </div>
    </div>
  );
}

function StatusChip({ color, label, icon }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 6,
      background: "#ffffff",
      color: "#374151",
      padding: "6px 12px",
      borderRadius: 6,
      fontSize: 13,
      fontWeight: 500,
      border: "1px solid #e5e7eb",
      boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)"
    }}>
      <div style={{
        width: 12,
        height: 12,
        borderRadius: 2,
        backgroundColor: color
      }} />
      <span style={{ fontSize: 14 }}>{icon}</span>
      <span>{label}</span>
    </div>
  );
}
