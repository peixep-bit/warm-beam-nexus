import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const PRELOAD_RETRY_KEY = "vite-preload-retried";

sessionStorage.removeItem(PRELOAD_RETRY_KEY);

window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();

  if (sessionStorage.getItem(PRELOAD_RETRY_KEY) === "true") {
    sessionStorage.removeItem(PRELOAD_RETRY_KEY);
    return;
  }

  sessionStorage.setItem(PRELOAD_RETRY_KEY, "true");
  window.location.reload();
});

createRoot(document.getElementById("root")!).render(<App />);
