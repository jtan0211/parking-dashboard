import React, { useEffect, useState } from "react";
import ParkingDashboard from "./ParkingDashboard";
import MapView from "./MapView";

function App() {
  const [slots, setSlots] = useState([]);

  useEffect(() => {
  async function loadData() {
    const layout = await fetch("/parking_slots.geojson").then(res => res.json());
    const apiData = await fetch("YOUR_API_GATEWAY_URL").then(res => res.json());

    // merge DynamoDB status into layout
    const statusMap = {};
    apiData.forEach(s => {
      statusMap[s.slot_id] = s.status;
    });

    setSlots(layout.features.map(f => ({
      id: f.properties.slot_id,
      status: statusMap[f.properties.slot_id] || "unknown"
    })));
  }
  loadData();
}, []);


  return (
    <div style={{ padding: "20px" }}>
      <h1>UTAR Parking Dashboard</h1>
      <ParkingDashboard slots={slots} />
    </div>
  );
}

export default App;
