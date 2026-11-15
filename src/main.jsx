import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

// fhirclient narrates every launch step with console.debug, including the token response.
// It never leaves the browser, but keep production consoles free of it; `npm run dev` shows it.
if (import.meta.env.PROD) {
  const debug = console.debug.bind(console);
  console.debug = (message, ...rest) => {
    if (typeof message === "string" && message.startsWith("[fhirclient]")) return;
    debug(message, ...rest);
  };
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
