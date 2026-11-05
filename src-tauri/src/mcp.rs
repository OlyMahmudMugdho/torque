//! Model Context Protocol (MCP) server for Torque.
//! Provides JSON-RPC tools and SSE / streamable HTTP endpoints for external AI assistants.

pub mod catalog;
pub mod compiler;
pub mod dispatch;
pub mod files;
pub mod http;
pub mod projects;

use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU16, Ordering};
use std::sync::{Arc, RwLock};
use tauri::Emitter;
use tokio::sync::mpsc::UnboundedSender;

use crate::compiler::{CompileResultPayload, Diagnostic};
use crate::storage::{self, Project};

pub use catalog::get_tools_catalog;
pub use compiler::{handle_tool_compile, handle_tool_get_diagnostics};
pub use dispatch::dispatch_jsonrpc_request;
pub use files::{handle_tool_edit_file, handle_tool_read_file, handle_tool_write_file};
pub use projects::{
    handle_tool_create_project, handle_tool_get_active_project, handle_tool_list_projects,
    resolve_project_id,
};

pub const MCP_PROTOCOL_VERSION: &str = "2024-11-05";
pub const SERVER_NAME: &str = "torque-latex-ide";
pub const SERVER_VERSION: &str = "0.2.2";
pub const DEFAULT_PORT: u16 = 3030;
pub const FALLBACK_PORT: u16 = 3031;

/// In-memory state for the embedded MCP server.
pub struct McpState {
    pub app_handle: Option<tauri::AppHandle>,
    pub active_project_id: RwLock<Option<String>>,
    pub latest_diagnostics: RwLock<HashMap<String, (String, Vec<Diagnostic>)>>,
    pub sse_sessions: RwLock<HashMap<String, UnboundedSender<String>>>,
    pub custom_projects_dir: Option<PathBuf>,
    pub bound_port: AtomicU16,
}

impl McpState {
    pub fn new(app_handle: Option<tauri::AppHandle>) -> Self {
        Self {
            app_handle,
            active_project_id: RwLock::new(None),
            latest_diagnostics: RwLock::new(HashMap::new()),
            sse_sessions: RwLock::new(HashMap::new()),
            custom_projects_dir: None,
            bound_port: AtomicU16::new(0),
        }
    }

    #[cfg(test)]
    pub fn new_with_dir(projects_dir: PathBuf) -> Self {
        Self {
            app_handle: None,
            active_project_id: RwLock::new(None),
            latest_diagnostics: RwLock::new(HashMap::new()),
            sse_sessions: RwLock::new(HashMap::new()),
            custom_projects_dir: Some(projects_dir),
            bound_port: AtomicU16::new(0),
        }
    }

    pub fn get_projects_dir(&self) -> Result<PathBuf, String> {
        if let Some(ref dir) = self.custom_projects_dir {
            if !dir.exists() {
                std::fs::create_dir_all(dir)
                    .map_err(|e| format!("Failed to create custom projects dir {}: {}", dir.display(), e))?;
            }
            Ok(dir.clone())
        } else {
            storage::get_projects_dir()
        }
    }

    pub fn set_active_project_id(&self, id: String) {
        if let Ok(mut lock) = self.active_project_id.write() {
            *lock = Some(id);
        }
    }

    pub fn get_active_project_id(&self) -> Option<String> {
        self.active_project_id.read().ok().and_then(|l| l.clone())
    }

    pub fn emit_file_changed(&self, project_id: &str, path: &str, content: &str) {
        if let Some(ref handle) = self.app_handle {
            let payload = json!({
                "projectId": project_id,
                "path": path,
                "content": content,
            });
            let _ = handle.emit("mcp:file-changed", payload);
        }
    }

    pub fn emit_compile_finished(&self, payload: &CompileResultPayload) {
        if let Some(ref handle) = self.app_handle {
            let _ = handle.emit("mcp:compile-finished", payload);
        }
    }
}

// ---------------------------------------------------------------------------
// Line Slicing Helper
// ---------------------------------------------------------------------------

/// Slices content into 1-based inclusive [start_line, end_line].
/// Bounds are clamped gracefully without crashing.
/// Returns (content, total_lines, final_start, final_end, is_sliced).
pub fn slice_lines(
    content: &str,
    start_line: Option<i64>,
    end_line: Option<i64>,
) -> (String, usize, usize, usize, bool) {
    let lines: Vec<&str> = content.lines().collect();
    let total_lines = lines.len();

    if total_lines == 0 {
        let is_sliced = start_line.is_some() || end_line.is_some();
        return (String::new(), 0, 1, 0, is_sliced);
    }

    if start_line.is_none() && end_line.is_none() {
        return (content.to_string(), total_lines, 1, total_lines, false);
    }

    let raw_start = start_line.unwrap_or(1);
    let raw_end = end_line.unwrap_or(total_lines as i64);

    let clamped_start = raw_start.max(1);
    let clamped_end = raw_end.min(total_lines as i64);

    if clamped_start > clamped_end || clamped_start > total_lines as i64 || clamped_end < 1 {
        let final_start = clamped_start.min(total_lines as i64).max(1) as usize;
        let final_end = clamped_end.min(total_lines as i64).max(0) as usize;
        return (String::new(), total_lines, final_start, final_end, true);
    }

    let start_idx = (clamped_start - 1) as usize;
    let end_idx = clamped_end as usize;

    let sliced = lines[start_idx..end_idx].join("\n");
    (
        sliced,
        total_lines,
        clamped_start as usize,
        clamped_end as usize,
        true,
    )
}

/// Resolve project directory and load project with its files.
pub fn load_project_with_files(
    state: &McpState,
    project_id: &str,
) -> Result<Option<(Project, Vec<crate::storage::ProjectFile>)>, String> {
    if state.custom_projects_dir.is_none() {
        return storage::tauri_load_project(project_id.to_string());
    }

    let projects_dir = state.get_projects_dir()?;
    let project_dir = projects_dir.join(project_id);
    if !project_dir.exists() {
        return Ok(None);
    }

    let project_json_path = project_dir.join("project.json");
    if !project_json_path.exists() {
        return Ok(None);
    }

    let project_str = std::fs::read_to_string(&project_json_path)
        .map_err(|e| format!("Failed to read project.json: {}", e))?;
    let project: Project = serde_json::from_str(&project_str)
        .map_err(|e| format!("Failed to parse project.json: {}", e))?;

    let files_dir = project_dir.join("files");
    let mut files = Vec::new();

    if files_dir.exists() {
        fn collect(
            root: &std::path::Path,
            current: &std::path::Path,
            project_id: &str,
            default_updated_at: u64,
            files: &mut Vec<crate::storage::ProjectFile>,
        ) -> Result<(), String> {
            let entries = std::fs::read_dir(current)
                .map_err(|e| format!("Failed to read dir {}: {}", current.display(), e))?;

            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    collect(root, &path, project_id, default_updated_at, files)?;
                } else if path.is_file() {
                    let rel = path
                        .strip_prefix(root)
                        .map_err(|e| format!("Strip prefix error: {}", e))?;
                    let rel_path = rel.to_string_lossy().replace('\\', "/");
                    let bytes = std::fs::read(&path)
                        .map_err(|e| format!("Failed to read file {}: {}", path.display(), e))?;
                    let is_binary = storage::is_binary_file(&rel_path, &bytes);
                    let content = if is_binary {
                        serde_json::Value::String(storage::base64_utils::encode(&bytes))
                    } else {
                        serde_json::Value::String(String::from_utf8_lossy(&bytes).to_string())
                    };
                    let updated_at = path
                        .metadata()
                        .and_then(|m| m.modified())
                        .ok()
                        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                        .map(|d| d.as_millis() as u64)
                        .unwrap_or(default_updated_at);

                    files.push(crate::storage::ProjectFile {
                        project_id: project_id.to_string(),
                        path: rel_path,
                        content,
                        is_binary,
                        updated_at,
                    });
                }
            }
            Ok(())
        }

        collect(&files_dir, &files_dir, &project.id, project.updated_at, &mut files)?;
    }

    files.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(Some((project, files)))
}

// ---------------------------------------------------------------------------
// Server Entry Point & Tauri Commands
// ---------------------------------------------------------------------------

/// Starts the embedded MCP server in the background.
pub fn start_mcp_server(app_handle: tauri::AppHandle) -> Arc<McpState> {
    let state = Arc::new(McpState::new(Some(app_handle)));
    let state_clone = state.clone();

    tauri::async_runtime::spawn(async move {
        match http::bind_listener(DEFAULT_PORT, FALLBACK_PORT).await {
            Ok((listener, bound_port)) => {
                state_clone.bound_port.store(bound_port, Ordering::SeqCst);
                println!("Torque MCP server listening on http://127.0.0.1:{}", bound_port);
                http::run_server_on_listener(listener, state_clone).await;
            }
            Err(e) => {
                eprintln!("Failed to bind Torque MCP server on ports 3030/3031: {}", e);
            }
        }
    });

    state
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct McpInfo {
    pub port: u16,
    pub active: bool,
}

#[tauri::command]
pub fn tauri_get_mcp_info(state: tauri::State<'_, Arc<McpState>>) -> McpInfo {
    let port = state.bound_port.load(Ordering::SeqCst);
    McpInfo {
        port,
        active: port > 0,
    }
}

#[tauri::command]
pub fn tauri_set_active_project(
    state: tauri::State<'_, Arc<McpState>>,
    project_id: String,
) -> Result<(), String> {
    state.set_active_project_id(project_id);
    Ok(())
}

#[cfg(test)]
mod tests;
