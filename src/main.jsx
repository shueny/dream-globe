import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import App from "./App.jsx";

// StrictMode is kept ON deliberately: it double-invokes effects in dev, which is
// exactly the pressure test for the scene teardown in DreamGlobe (brief §4 mine 3).
createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
