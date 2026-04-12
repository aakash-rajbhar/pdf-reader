import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/globals.css";

const IS_TAURI = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function bootstrap() {
  let initialFilePath: string | null = null;

  if (IS_TAURI) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      initialFilePath = await invoke<string | null>("get_initial_file");
    } catch {
      // ignore
    }
  }

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App initialFilePath={initialFilePath} />
    </React.StrictMode>
  );
}

bootstrap();