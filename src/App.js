import React, { useEffect, useState } from "react";
import ParkingDashboard from "./ParkingDashboard";

function App() {
  const [slots, setSlots] = useState([]);

  useEffect(() => {
    fetch(process.env.REACT_APP_API_URL)
      .then(res => res.json())
      .then(data => setSlots(data))
      .catch(console.error);
  }, []);

  return (
    <div style={{ padding: "20px" }}>
      <h1>UTAR Parking Dashboard</h1>
      <ParkingDashboard slots={slots} />
    </div>
  );
}

export default App;
