pub mod ai;
pub mod compiler;
pub mod mcp;
pub mod package_resolver;
pub mod splash;
pub mod storage;

use ai::{tauri_get_ai_config, tauri_save_ai_config};
use compiler::{tauri_compile_latex, tauri_detect_texlive};
use mcp::{tauri_get_mcp_info, tauri_set_active_project};
use package_resolver::tauri_resolve_missing_packages;
use splash::close_splashscreen;
use storage::{
  get_torque_dir, save_file, select_directory, tauri_clear_package_cache, tauri_delete_project,
  tauri_get_package_file, tauri_import_directory, tauri_list_package_files, tauri_list_projects,
  tauri_load_project, tauri_save_package_file, tauri_save_project,
};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      let mcp_state = mcp::start_mcp_server(app.handle().clone());
      app.manage(mcp_state);
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      get_torque_dir,
      save_file,
      select_directory,
      tauri_import_directory,
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
      tauri_resolve_missing_packages,
      tauri_get_mcp_info,
      tauri_set_active_project,
      tauri_get_ai_config,
      tauri_save_ai_config,
      close_splashscreen,
    ])
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
