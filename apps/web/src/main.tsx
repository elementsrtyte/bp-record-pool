import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "@bp/ui/globals.css";
import "./pool-shell.css";
import { App } from "./App";

document.documentElement.classList.add("dark", "pool-app");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
