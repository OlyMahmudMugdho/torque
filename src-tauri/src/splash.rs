use tauri::Manager;

#[tauri::command]
pub fn close_splashscreen(app: tauri::AppHandle) {
  if let Some(splashscreen) = app.get_webview_window("splashscreen") {
    let _ = splashscreen.close();
  }
  if let Some(main) = app.get_webview_window("main") {
    let _ = main.show();
    let _ = main.set_focus();
  }
}

#[cfg(test)]
mod tests {
  #[test]
  fn test_splashscreen_module_compiles() {
    assert!(true);
  }
}
