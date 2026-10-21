import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import CompanionWindow from "./CompanionWindow";

import "./nt.css";
const companion = Boolean(window.clippyCompanion);
if (companion) document.documentElement.classList.add("companion-document");
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {companion ? <CompanionWindow /> : <App />}
  </React.StrictMode>,
);
