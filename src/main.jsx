import React from "react";
import ReactDOM from "react-dom/client";
import CaseLog from "./CaseLog";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <div style={{ padding: "20px", maxWidth: "1200px", margin: "0 auto", height: "90vh" }}>
      <CaseLog />
    </div>
  </React.StrictMode>
);