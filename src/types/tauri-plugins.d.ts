// Stub type declarations for Tauri v2 plugins
// These are only used at runtime inside Tauri; browser builds use the file-input fallback.

declare module "@tauri-apps/plugin-dialog" {
  export interface OpenDialogOptions {
    multiple?: boolean;
    filters?: Array<{ name: string; extensions: string[] }>;
    defaultPath?: string;
  }
  export function open(options?: OpenDialogOptions): Promise<string | string[] | null>;
}

declare module "@tauri-apps/plugin-fs" {
  export function readFile(path: string): Promise<Uint8Array>;
  export function writeFile(path: string, data: Uint8Array): Promise<void>;
  export function exists(path: string): Promise<boolean>;
}

declare module "@tauri-apps/plugin-shell" {
  export function open(path: string): Promise<void>;
}

declare module "@tauri-apps/api/webviewWindow" {
  export function getCurrentWebviewWindow(): {
    onFileDropEvent(
      handler: (event: {
        payload: {
          type: "hover" | "drop" | "cancel";
          paths: string[];
          position?: { x: number; y: number };
        };
      }) => void                    // ← handler returns void
    ): Promise<() => void>;         // ← onFileDropEvent itself returns the unlisten fn
  };
}

declare module "@tauri-apps/api/event" {
  export type UnlistenFn = () => void;
  export function listen<T>(
    event: string,
    handler: (event: { payload: T }) => void
  ): Promise<UnlistenFn>;
}