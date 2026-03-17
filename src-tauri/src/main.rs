#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();
            // Center window on startup
            window.center().unwrap();
            // Set min size
            window.set_min_size(Some(tauri::Size::Physical(
                tauri::PhysicalSize { width: 800, height: 600 }
            ))).unwrap();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![read_pdf_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Read a PDF file from disk and return its bytes as base64
#[tauri::command]
async fn read_pdf_file(path: String) -> Result<String, String> {
    use std::fs;
    let bytes = fs::read(&path).map_err(|e| e.to_string())?;
    Ok(base64_encode(&bytes))
}

fn base64_encode(data: &[u8]) -> String {
    use std::fmt::Write;
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::with_capacity((data.len() + 2) / 3 * 4);
    for chunk in data.chunks(3) {
        let b0 = chunk[0] as usize;
        let b1 = if chunk.len() > 1 { chunk[1] as usize } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as usize } else { 0 };
        let _ = write!(result, "{}", CHARS[b0 >> 2] as char);
        let _ = write!(result, "{}", CHARS[((b0 & 3) << 4) | (b1 >> 4)] as char);
        if chunk.len() > 1 {
            let _ = write!(result, "{}", CHARS[((b1 & 15) << 2) | (b2 >> 6)] as char);
        } else {
            result.push('=');
        }
        if chunk.len() > 2 {
            let _ = write!(result, "{}", CHARS[b2 & 63] as char);
        } else {
            result.push('=');
        }
    }
    result
}
