pub mod compiler;
pub mod storage;

use compiler::{tauri_compile_latex, tauri_detect_texlive};
use storage::{
  get_torque_dir, save_file, tauri_clear_package_cache, tauri_delete_project,
  tauri_get_package_file, tauri_list_package_files, tauri_list_projects, tauri_load_project,
  tauri_save_package_file, tauri_save_project,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      get_torque_dir,
      save_file,
      tauri_list_projects,
      tauri_save_project,
      tauri_load_project,
      tauri_delete_project,
      tauri_save_package_file,
      tauri_get_package_file,
      tauri_list_package_files,
      tauri_clear_package_cache,
      tauri_detect_texlive,
      tauri_compile_latex,
    ])
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
