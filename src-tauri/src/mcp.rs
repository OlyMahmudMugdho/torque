//! Model Context Protocol (MCP) server for Torque.
//! Provides JSON-RPC tools and SSE / streamable HTTP endpoints for external AI assistants.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU16, Ordering};
use std::sync::{Arc, RwLock};
use tauri::Emitter;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::mpsc::UnboundedSender;

use crate::compiler::{self, CompileResultPayload, Diagnostic};
use crate::storage::{self, base64_utils, is_binary_file, normalize_path, Project, ProjectFile};

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

// ---------------------------------------------------------------------------
// Project Helper Functions
// ---------------------------------------------------------------------------

fn list_projects_from_dir(projects_dir: &Path) -> Result<Vec<Project>, String> {
    let mut projects = Vec::new();
    if !projects_dir.exists() {
        return Ok(projects);
    }

    let entries = std::fs::read_dir(projects_dir)
        .map_err(|e| format!("Failed to read directory {}: {}", projects_dir.display(), e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            let project_json_path = path.join("project.json");
            if project_json_path.exists() && project_json_path.is_file() {
                if let Ok(data) = std::fs::read_to_string(&project_json_path) {
                    if let Ok(project) = serde_json::from_str::<Project>(&data) {
                        projects.push(project);
                    }
                }
            }
        }
    }

    projects.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(projects)
}

fn resolve_project_id(state: &McpState, requested_id: Option<&str>) -> Result<String, (i64, String)> {
    if let Some(id) = requested_id {
        if !id.trim().is_empty() {
            state.set_active_project_id(id.trim().to_string());
            return Ok(id.trim().to_string());
        }
    }

    if let Some(active_id) = state.get_active_project_id() {
        return Ok(active_id);
    }

    let projects_dir = state
        .get_projects_dir()
        .map_err(|e| (-32603, format!("Storage error: {}", e)))?;
    let projects = list_projects_from_dir(&projects_dir)
        .map_err(|e| (-32603, format!("Failed to list projects: {}", e)))?;

    if let Some(first) = projects.first() {
        state.set_active_project_id(first.id.clone());
        Ok(first.id.clone())
    } else {
        Err((-32602, "No projects found. Create or open a project first.".to_string()))
    }
}

// ---------------------------------------------------------------------------
// Tool Handlers
// ---------------------------------------------------------------------------

pub fn handle_tool_list_projects(state: &McpState) -> Result<Value, (i64, String)> {
    let projects_dir = state
        .get_projects_dir()
        .map_err(|e| (-32603, format!("Storage error: {}", e)))?;
    let projects = list_projects_from_dir(&projects_dir)
        .map_err(|e| (-32603, format!("Failed to list projects: {}", e)))?;

    let result = projects
        .into_iter()
        .map(|p| {
            json!({
                "id": p.id,
                "name": p.name,
                "rootEntry": p.root_entry,
                "createdAt": p.created_at,
                "updatedAt": p.updated_at,
            })
        })
        .collect::<Vec<_>>();

    Ok(json!(result))
}

pub fn handle_tool_get_active_project(state: &McpState) -> Result<Value, (i64, String)> {
    let project_id = resolve_project_id(state, None)?;
    let projects_dir = state
        .get_projects_dir()
        .map_err(|e| (-32603, format!("Storage error: {}", e)))?;
    let project_dir = projects_dir.join(&project_id);

    if !project_dir.exists() {
        return Err((-32602, format!("Active project '{}' does not exist on disk", project_id)));
    }

    let project_json_path = project_dir.join("project.json");
    if !project_json_path.exists() {
        return Err((-32602, format!("project.json missing in project '{}'", project_id)));
    }

    let data = std::fs::read_to_string(&project_json_path)
        .map_err(|e| (-32603, format!("Failed to read project.json: {}", e)))?;
    let project: Project = serde_json::from_str(&data)
        .map_err(|e| (-32603, format!("Corrupt project.json: {}", e)))?;

    let files_dir = project_dir.join("files");
    let mut files_manifest = Vec::new();

    if files_dir.exists() {
        fn collect_manifest(
            root: &Path,
            current: &Path,
            manifest: &mut Vec<Value>,
        ) -> Result<(), String> {
            let entries = std::fs::read_dir(current)
                .map_err(|e| format!("Failed to read dir {}: {}", current.display(), e))?;

            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    collect_manifest(root, &path, manifest)?;
                } else if path.is_file() {
                    let rel = path
                        .strip_prefix(root)
                        .map_err(|e| format!("Prefix error: {}", e))?;
                    let rel_str = rel.to_string_lossy().replace('\\', "/");
                    let bytes = std::fs::read(&path)
                        .map_err(|e| format!("Read error for {}: {}", rel_str, e))?;
                    let binary = is_binary_file(&rel_str, &bytes);
                    let updated_at = path
                        .metadata()
                        .and_then(|m| m.modified())
                        .ok()
                        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                        .map(|d| d.as_millis() as u64)
                        .unwrap_or(0);

                    manifest.push(json!({
                        "path": rel_str,
                        "isBinary": binary,
                        "updatedAt": updated_at,
                    }));
                }
            }
            Ok(())
        }

        let _ = collect_manifest(&files_dir, &files_dir, &mut files_manifest);
        files_manifest.sort_by(|a, b| {
            let pa = a.get("path").and_then(|p| p.as_str()).unwrap_or("");
            let pb = b.get("path").and_then(|p| p.as_str()).unwrap_or("");
            pa.cmp(pb)
        });
    }

    Ok(json!({
        "id": project.id,
        "name": project.name,
        "rootEntry": project.root_entry,
        "createdAt": project.created_at,
        "updatedAt": project.updated_at,
        "files": files_manifest,
    }))
}

pub fn handle_tool_read_file(state: &McpState, args: &Value) -> Result<Value, (i64, String)> {
    let raw_path = args
        .get("path")
        .and_then(|p| p.as_str())
        .ok_or_else(|| (-32602, "Missing required argument 'path'".to_string()))?;

    let clean_path = normalize_path(raw_path)
        .map_err(|e| (-32602, format!("Invalid path: {}", e)))?;

    let project_id = resolve_project_id(state, args.get("projectId").and_then(|p| p.as_str()))?;
    let projects_dir = state
        .get_projects_dir()
        .map_err(|e| (-32603, format!("Storage error: {}", e)))?;
    let file_path = projects_dir.join(&project_id).join("files").join(&clean_path);

    if !file_path.exists() {
        return Err((-32602, format!("File not found: {}", raw_path)));
    }

    let bytes = std::fs::read(&file_path)
        .map_err(|e| (-32603, format!("Failed to read file {}: {}", raw_path, e)))?;

    if is_binary_file(&clean_path, &bytes) {
        return Err((-32602, format!("Cannot read binary file as text: {}", raw_path)));
    }

    let content = String::from_utf8(bytes)
        .map_err(|e| (-32602, format!("File contains invalid UTF-8: {}", e)))?;

    let start_line = args.get("startLine").and_then(|v| v.as_i64());
    let end_line = args.get("endLine").and_then(|v| v.as_i64());

    let (sliced_content, total_lines, final_start, final_end, is_sliced) =
        slice_lines(&content, start_line, end_line);

    Ok(json!({
        "content": sliced_content,
        "totalLines": total_lines,
        "startLine": final_start,
        "endLine": final_end,
        "isSliced": is_sliced,
    }))
}

pub fn handle_tool_write_file(state: &McpState, args: &Value) -> Result<Value, (i64, String)> {
    let raw_path = args
        .get("path")
        .and_then(|p| p.as_str())
        .ok_or_else(|| (-32602, "Missing required argument 'path'".to_string()))?;

    let content = args
        .get("content")
        .and_then(|c| c.as_str())
        .ok_or_else(|| (-32602, "Missing required argument 'content'".to_string()))?;

    let clean_path = normalize_path(raw_path)
        .map_err(|e| (-32602, format!("Invalid path: {}", e)))?;

    let project_id = resolve_project_id(state, args.get("projectId").and_then(|p| p.as_str()))?;
    let projects_dir = state
        .get_projects_dir()
        .map_err(|e| (-32603, format!("Storage error: {}", e)))?;
    let project_dir = projects_dir.join(&project_id);
    let file_path = project_dir.join("files").join(&clean_path);

    if let Some(parent) = file_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| (-32603, format!("Failed to create directories for {}: {}", clean_path, e)))?;
    }

    let bytes = content.as_bytes();
    std::fs::write(&file_path, bytes)
        .map_err(|e| (-32603, format!("Failed to write file {}: {}", clean_path, e)))?;

    // Update project updated_at timestamp
    let project_json_path = project_dir.join("project.json");
    if project_json_path.exists() {
        if let Ok(data) = std::fs::read_to_string(&project_json_path) {
            if let Ok(mut project) = serde_json::from_str::<Project>(&data) {
                project.updated_at = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_millis() as u64)
                    .unwrap_or(project.updated_at);
                if let Ok(serialized) = serde_json::to_string_pretty(&project) {
                    let _ = std::fs::write(&project_json_path, serialized);
                }
            }
        }
    }

    state.emit_file_changed(&project_id, &clean_path, content);

    Ok(json!({
        "success": true,
        "path": clean_path,
        "bytesWritten": bytes.len(),
    }))
}

pub fn handle_tool_edit_file(state: &McpState, args: &Value) -> Result<Value, (i64, String)> {
    let raw_path = args
        .get("path")
        .and_then(|p| p.as_str())
        .ok_or_else(|| (-32602, "Missing required argument 'path'".to_string()))?;

    let target = args
        .get("target")
        .and_then(|t| t.as_str())
        .ok_or_else(|| (-32602, "Missing required argument 'target'".to_string()))?;

    let replacement = args
        .get("replacement")
        .and_then(|r| r.as_str())
        .ok_or_else(|| (-32602, "Missing required argument 'replacement'".to_string()))?;

    if target.is_empty() {
        return Err((-32602, "Argument 'target' cannot be empty".to_string()));
    }

    let clean_path = normalize_path(raw_path)
        .map_err(|e| (-32602, format!("Invalid path: {}", e)))?;

    let project_id = resolve_project_id(state, args.get("projectId").and_then(|p| p.as_str()))?;
    let projects_dir = state
        .get_projects_dir()
        .map_err(|e| (-32603, format!("Storage error: {}", e)))?;
    let project_dir = projects_dir.join(&project_id);
    let file_path = project_dir.join("files").join(&clean_path);

    if !file_path.exists() {
        return Err((-32602, format!("File not found: {}", raw_path)));
    }

    let bytes = std::fs::read(&file_path)
        .map_err(|e| (-32603, format!("Failed to read file {}: {}", clean_path, e)))?;

    if is_binary_file(&clean_path, &bytes) {
        return Err((-32602, format!("Cannot edit binary file: {}", raw_path)));
    }

    let content = String::from_utf8(bytes)
        .map_err(|e| (-32602, format!("File contains invalid UTF-8: {}", e)))?;

    let occurrences = content.matches(target).count();
    if occurrences == 0 {
        return Err((-32602, format!("Target text not found in file: '{}'", target)));
    }

    let new_content = content.replace(target, replacement);

    std::fs::write(&file_path, new_content.as_bytes())
        .map_err(|e| (-32603, format!("Failed to write updated file {}: {}", clean_path, e)))?;

    // Update project updated_at timestamp
    let project_json_path = project_dir.join("project.json");
    if project_json_path.exists() {
        if let Ok(data) = std::fs::read_to_string(&project_json_path) {
            if let Ok(mut project) = serde_json::from_str::<Project>(&data) {
                project.updated_at = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_millis() as u64)
                    .unwrap_or(project.updated_at);
                if let Ok(serialized) = serde_json::to_string_pretty(&project) {
                    let _ = std::fs::write(&project_json_path, serialized);
                }
            }
        }
    }

    state.emit_file_changed(&project_id, &clean_path, &new_content);

    Ok(json!({
        "success": true,
        "path": clean_path,
        "occurrencesReplaced": occurrences,
    }))
}

pub fn load_project_with_files(
    state: &McpState,
    project_id: &str,
) -> Result<Option<(Project, Vec<ProjectFile>)>, String> {
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
            root: &Path,
            current: &Path,
            project_id: &str,
            default_updated_at: u64,
            files: &mut Vec<ProjectFile>,
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
                    let is_binary = is_binary_file(&rel_path, &bytes);
                    let content = if is_binary {
                        serde_json::Value::String(base64_utils::encode(&bytes))
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

                    files.push(ProjectFile {
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

pub fn handle_tool_compile(state: &McpState, args: &Value) -> Result<Value, (i64, String)> {
    let project_id = resolve_project_id(state, args.get("projectId").and_then(|p| p.as_str()))?;
    let engine = args
        .get("engine")
        .and_then(|e| e.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| "pdflatex".to_string());

    let projects_dir = state
        .get_projects_dir()
        .map_err(|e| (-32603, format!("Storage error: {}", e)))?;
    let project_dir = projects_dir.join(&project_id);

    if !project_dir.exists() {
        return Err((-32602, format!("Project '{}' not found", project_id)));
    }

    let loaded = load_project_with_files(state, &project_id)
        .map_err(|e| (-32603, format!("Failed to load project files: {}", e)))?
        .ok_or_else(|| (-32602, format!("Project '{}' could not be loaded", project_id)))?;

    let (project, files) = loaded;
    let custom_build_dir = state.custom_projects_dir.as_ref().map(|d| d.join("build").to_string_lossy().to_string());

    let compile_result = compiler::tauri_compile_latex_internal(
        project.id.clone(),
        files,
        project.root_entry.clone(),
        Some(engine),
        Some(true),
        custom_build_dir,
        None,
    )
    .map_err(|e| (-32603, format!("Compilation failure: {}", e)))?;

    // Cache latest diagnostics in memory
    if let Ok(mut lock) = state.latest_diagnostics.write() {
        lock.insert(
            project.id.clone(),
            (compile_result.status.clone(), compile_result.diagnostics.clone()),
        );
    }

    state.emit_compile_finished(&compile_result);

    Ok(json!({
        "status": compile_result.status,
        "durationMs": compile_result.duration_ms,
        "diagnostics": compile_result.diagnostics,
        "missingPackages": compile_result.missing_files,
        "pdfGenerated": compile_result.pdf.is_some(),
    }))
}

pub fn handle_tool_get_diagnostics(state: &McpState, args: &Value) -> Result<Value, (i64, String)> {
    let project_id = resolve_project_id(state, args.get("projectId").and_then(|p| p.as_str()))?;

    // 1. Check in-memory diagnostics cache
    if let Ok(lock) = state.latest_diagnostics.read() {
        if let Some((status, diagnostics)) = lock.get(&project_id) {
            return Ok(json!({
                "status": status,
                "diagnostics": diagnostics,
            }));
        }
    }

    // 2. Check build directory for log file
    if let Ok(build_dir) = compiler::get_build_directory(&project_id) {
        if build_dir.exists() {
            if let Ok(entries) = std::fs::read_dir(&build_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.extension().and_then(|e| e.to_str()) == Some("log") {
                        if let Ok(log_content) = std::fs::read_to_string(&path) {
                            let diags = compiler::parse_diagnostics_from_log(&log_content, "", "main.tex");
                            let status = if diags.iter().any(|d| d.severity == "error") {
                                "errors"
                            } else if diags.iter().any(|d| d.severity == "warning") {
                                "warnings"
                            } else {
                                "spotless"
                            };
                            return Ok(json!({
                                "status": status,
                                "diagnostics": diags,
                            }));
                        }
                    }
                }
            }
        }
    }

    Ok(json!({
        "status": "idle",
        "diagnostics": [],
    }))
}

// ---------------------------------------------------------------------------
// Tool Catalog Metadata
// ---------------------------------------------------------------------------

pub fn get_tools_catalog() -> Value {
    json!({
        "tools": [
            {
                "name": "torque_list_projects",
                "description": "List all LaTeX projects available in Torque.",
                "inputSchema": {
                    "type": "object",
                    "properties": {},
                    "required": []
                }
            },
            {
                "name": "torque_get_active_project",
                "description": "Get the currently active LaTeX project in Torque, including file manifest and root entry file.",
                "inputSchema": {
                    "type": "object",
                    "properties": {},
                    "required": []
                }
            },
            {
                "name": "torque_read_file",
                "description": "Read full or partial text content of a file in a Torque project with optional line-range slicing.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "Relative path of the file to read"
                        },
                        "startLine": {
                            "type": "integer",
                            "description": "Optional 1-based start line (inclusive)"
                        },
                        "endLine": {
                            "type": "integer",
                            "description": "Optional 1-based end line (inclusive)"
                        },
                        "projectId": {
                            "type": "string",
                            "description": "Optional; defaults to active project"
                        }
                    },
                    "required": ["path"]
                }
            },
            {
                "name": "torque_write_file",
                "description": "Create or update a file in a Torque project. If the file is open in the Torque editor, its contents will update live.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "Relative path of the file to write"
                        },
                        "content": {
                            "type": "string",
                            "description": "File content to write"
                        },
                        "projectId": {
                            "type": "string",
                            "description": "Optional; defaults to active project"
                        }
                    },
                    "required": ["path", "content"]
                }
            },
            {
                "name": "torque_edit_file",
                "description": "Surgically edit a specific section or block of text within a file without overwriting the entire file.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "Relative path of the file to edit"
                        },
                        "target": {
                            "type": "string",
                            "description": "Exact text string or block to find and replace"
                        },
                        "replacement": {
                            "type": "string",
                            "description": "New text to substitute in place of target"
                        },
                        "projectId": {
                            "type": "string",
                            "description": "Optional; defaults to active project"
                        }
                    },
                    "required": ["path", "target", "replacement"]
                }
            },
            {
                "name": "torque_compile",
                "description": "Compile the LaTeX project using native TeX Live (latexmk) and return status and structured diagnostics.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "projectId": {
                            "type": "string",
                            "description": "Optional; defaults to active project"
                        },
                        "engine": {
                            "type": "string",
                            "description": "TeX engine to compile with",
                            "enum": ["pdflatex", "xelatex", "lualatex"]
                        }
                    },
                    "required": []
                }
            },
            {
                "name": "torque_get_diagnostics",
                "description": "Retrieve the latest compilation diagnostics, warnings, and errors for the project.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "projectId": {
                            "type": "string",
                            "description": "Optional; defaults to active project"
                        }
                    },
                    "required": []
                }
            }
        ]
    })
}

// ---------------------------------------------------------------------------
// JSON-RPC Dispatcher
// ---------------------------------------------------------------------------

pub fn dispatch_jsonrpc_request(state: &McpState, request_json: &str) -> Option<String> {
    let req: Value = match serde_json::from_str(request_json) {
        Ok(v) => v,
        Err(_) => {
            return Some(
                json!({
                    "jsonrpc": "2.0",
                    "id": Value::Null,
                    "error": {
                        "code": -32700,
                        "message": "Parse error"
                    }
                })
                .to_string(),
            );
        }
    };

    let id = req.get("id").cloned().unwrap_or(Value::Null);
    let method = match req.get("method").and_then(|m| m.as_str()) {
        Some(m) => m,
        None => {
            return Some(
                json!({
                    "jsonrpc": "2.0",
                    "id": id,
                    "error": {
                        "code": -32600,
                        "message": "Invalid Request: missing method"
                    }
                })
                .to_string(),
            );
        }
    };

    // Notification handling (no response)
    if method == "notifications/initialized" {
        return None;
    }

    match method {
        "initialize" => {
            let resp = json!({
                "jsonrpc": "2.0",
                "id": id,
                "result": {
                    "protocolVersion": MCP_PROTOCOL_VERSION,
                    "capabilities": {
                        "tools": {}
                    },
                    "serverInfo": {
                        "name": SERVER_NAME,
                        "version": SERVER_VERSION
                    }
                }
            });
            Some(resp.to_string())
        }
        "tools/list" => {
            let catalog = get_tools_catalog();
            let resp = json!({
                "jsonrpc": "2.0",
                "id": id,
                "result": catalog
            });
            Some(resp.to_string())
        }
        "tools/call" => {
            let params = req.get("params").cloned().unwrap_or(Value::Null);
            let tool_name = params.get("name").and_then(|n| n.as_str()).unwrap_or("");
            let tool_args = params.get("arguments").cloned().unwrap_or_else(|| json!({}));

            let tool_res = match tool_name {
                "torque_list_projects" => handle_tool_list_projects(state),
                "torque_get_active_project" => handle_tool_get_active_project(state),
                "torque_read_file" => handle_tool_read_file(state, &tool_args),
                "torque_write_file" => handle_tool_write_file(state, &tool_args),
                "torque_edit_file" => handle_tool_edit_file(state, &tool_args),
                "torque_compile" => handle_tool_compile(state, &tool_args),
                "torque_get_diagnostics" => handle_tool_get_diagnostics(state, &tool_args),
                _ => Err((-32601, format!("Tool not found: {}", tool_name))),
            };

            match tool_res {
                Ok(val) => {
                    let text = if val.is_string() {
                        val.as_str().unwrap().to_string()
                    } else {
                        serde_json::to_string(&val).unwrap_or_default()
                    };
                    let resp = json!({
                        "jsonrpc": "2.0",
                        "id": id,
                        "result": {
                            "content": [
                                {
                                    "type": "text",
                                    "text": text
                                }
                            ],
                            "isError": false
                        }
                    });
                    Some(resp.to_string())
                }
                Err((code, msg)) => {
                    let resp = json!({
                        "jsonrpc": "2.0",
                        "id": id,
                        "error": {
                            "code": code,
                            "message": msg
                        }
                    });
                    Some(resp.to_string())
                }
            }
        }
        // Direct tool method calls (e.g. method: "torque_read_file")
        "torque_list_projects" => {
            match handle_tool_list_projects(state) {
                Ok(val) => Some(json!({ "jsonrpc": "2.0", "id": id, "result": val }).to_string()),
                Err((code, msg)) => Some(json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": msg } }).to_string()),
            }
        }
        "torque_get_active_project" => {
            match handle_tool_get_active_project(state) {
                Ok(val) => Some(json!({ "jsonrpc": "2.0", "id": id, "result": val }).to_string()),
                Err((code, msg)) => Some(json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": msg } }).to_string()),
            }
        }
        "torque_read_file" => {
            let args = req.get("params").cloned().unwrap_or_else(|| json!({}));
            match handle_tool_read_file(state, &args) {
                Ok(val) => Some(json!({ "jsonrpc": "2.0", "id": id, "result": val }).to_string()),
                Err((code, msg)) => Some(json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": msg } }).to_string()),
            }
        }
        "torque_write_file" => {
            let args = req.get("params").cloned().unwrap_or_else(|| json!({}));
            match handle_tool_write_file(state, &args) {
                Ok(val) => Some(json!({ "jsonrpc": "2.0", "id": id, "result": val }).to_string()),
                Err((code, msg)) => Some(json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": msg } }).to_string()),
            }
        }
        "torque_edit_file" => {
            let args = req.get("params").cloned().unwrap_or_else(|| json!({}));
            match handle_tool_edit_file(state, &args) {
                Ok(val) => Some(json!({ "jsonrpc": "2.0", "id": id, "result": val }).to_string()),
                Err((code, msg)) => Some(json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": msg } }).to_string()),
            }
        }
        "torque_compile" => {
            let args = req.get("params").cloned().unwrap_or_else(|| json!({}));
            match handle_tool_compile(state, &args) {
                Ok(val) => Some(json!({ "jsonrpc": "2.0", "id": id, "result": val }).to_string()),
                Err((code, msg)) => Some(json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": msg } }).to_string()),
            }
        }
        "torque_get_diagnostics" => {
            let args = req.get("params").cloned().unwrap_or_else(|| json!({}));
            match handle_tool_get_diagnostics(state, &args) {
                Ok(val) => Some(json!({ "jsonrpc": "2.0", "id": id, "result": val }).to_string()),
                Err((code, msg)) => Some(json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": msg } }).to_string()),
            }
        }
        _ => {
            let resp = json!({
                "jsonrpc": "2.0",
                "id": id,
                "error": {
                    "code": -32601,
                    "message": format!("Method not found: {}", method)
                }
            });
            Some(resp.to_string())
        }
    }
}

// ---------------------------------------------------------------------------
// HTTP & SSE Server Loop
// ---------------------------------------------------------------------------

pub async fn bind_listener(port: u16, fallback: u16) -> Result<(TcpListener, u16), std::io::Error> {
    match TcpListener::bind(format!("127.0.0.1:{}", port)).await {
        Ok(listener) => Ok((listener, port)),
        Err(e) => {
            eprintln!(
                "MCP server port {} unavailable ({}). Attempting fallback port {}...",
                port, e, fallback
            );
            let listener = TcpListener::bind(format!("127.0.0.1:{}", fallback)).await?;
            Ok((listener, fallback))
        }
    }
}

pub async fn run_server_on_listener(listener: TcpListener, state: Arc<McpState>) {
    while let Ok((stream, _)) = listener.accept().await {
        let state_clone = state.clone();
        tokio::spawn(async move {
            let _ = handle_http_connection(stream, state_clone).await;
        });
    }
}

async fn handle_http_connection(
    mut stream: TcpStream,
    state: Arc<McpState>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let mut buffer = Vec::with_capacity(4096);
    let mut temp = [0u8; 2048];

    loop {
        let n = stream.read(&mut temp).await?;
        if n == 0 {
            break;
        }
        buffer.extend_from_slice(&temp[..n]);

        // Search for end of HTTP headers: \r\n\r\n
        let header_end = match buffer.windows(4).position(|w| w == b"\r\n\r\n") {
            Some(pos) => pos,
            None => continue, // keep reading headers
        };

        let headers_str = String::from_utf8_lossy(&buffer[..header_end]).to_string();
        let mut lines = headers_str.lines();

        let request_line = match lines.next() {
            Some(line) => line.to_string(),
            None => break,
        };

        let mut parts = request_line.split_whitespace();
        let method = parts.next().unwrap_or("GET").to_string();
        let full_path = parts.next().unwrap_or("/").to_string();

        let mut content_length = 0usize;
        let mut is_close = false;

        for line in lines {
            let lower = line.to_lowercase();
            if lower.starts_with("content-length:") {
                if let Some(val) = line.split(':').nth(1) {
                    content_length = val.trim().parse().unwrap_or(0);
                }
            } else if lower.starts_with("connection:") {
                if let Some(val) = line.split(':').nth(1) {
                    if val.trim().eq_ignore_ascii_case("close") {
                        is_close = true;
                    }
                }
            }
        }

        let body_start = header_end + 4;
        let body_bytes_needed = content_length;

        while buffer.len() < body_start + body_bytes_needed {
            let n = stream.read(&mut temp).await?;
            if n == 0 {
                break;
            }
            buffer.extend_from_slice(&temp[..n]);
        }

        let body_str = if buffer.len() >= body_start + body_bytes_needed {
            String::from_utf8_lossy(&buffer[body_start..body_start + body_bytes_needed]).to_string()
        } else {
            String::from_utf8_lossy(&buffer[body_start..]).to_string()
        };

        // Advance buffer past current request
        let total_consumed = (body_start + body_bytes_needed).min(buffer.len());
        buffer.drain(0..total_consumed);

        // CORS preflight
        if method == "OPTIONS" {
            let resp = "HTTP/1.1 204 No Content\r\n\
                        Access-Control-Allow-Origin: *\r\n\
                        Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n\
                        Access-Control-Allow-Headers: Content-Type, Authorization\r\n\
                        Content-Length: 0\r\n\r\n";
            stream.write_all(resp.as_bytes()).await?;
            stream.flush().await?;
            if is_close {
                break;
            }
            continue;
        }

        // Endpoint routing
        let (path_only, query_str) = match full_path.split_once('?') {
            Some((p, q)) => (p, q),
            None => (full_path.as_str(), ""),
        };

        if method == "GET" && path_only == "/sse" {
            let session_id = format!(
                "{:016x}{:016x}",
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_nanos())
                    .unwrap_or(0),
                std::process::id()
            );

            let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<String>();
            if let Ok(mut lock) = state.sse_sessions.write() {
                lock.insert(session_id.clone(), tx);
            }

            let initial_headers = format!(
                "HTTP/1.1 200 OK\r\n\
                 Content-Type: text/event-stream\r\n\
                 Cache-Control: no-cache\r\n\
                 Connection: keep-alive\r\n\
                 Access-Control-Allow-Origin: *\r\n\r\n\
                 event: endpoint\r\ndata: /message?sessionId={}\r\n\r\n",
                session_id
            );

            stream.write_all(initial_headers.as_bytes()).await?;
            stream.flush().await?;

            while let Some(msg) = rx.recv().await {
                if stream.write_all(msg.as_bytes()).await.is_err() {
                    break;
                }
                if stream.flush().await.is_err() {
                    break;
                }
            }

            if let Ok(mut lock) = state.sse_sessions.write() {
                lock.remove(&session_id);
            }
            return Ok(());
        } else if method == "POST" && path_only == "/message" {
            let session_id = query_str
                .split('&')
                .find(|part| part.starts_with("sessionId="))
                .and_then(|part| part.split('=').nth(1))
                .unwrap_or("");

            let maybe_resp = dispatch_jsonrpc_request(&state, &body_str);

            if let Some(resp_str) = maybe_resp {
                // If an active SSE session exists for this sessionId, send via SSE stream as well
                if !session_id.is_empty() {
                    let sse_msg = format!("event: message\ndata: {}\n\n", resp_str);
                    if let Ok(lock) = state.sse_sessions.read() {
                        if let Some(tx) = lock.get(session_id) {
                            let _ = tx.send(sse_msg);
                        }
                    }
                }

                let http_resp = format!(
                    "HTTP/1.1 200 OK\r\n\
                     Content-Type: application/json\r\n\
                     Access-Control-Allow-Origin: *\r\n\
                     Content-Length: {}\r\n\r\n{}",
                    resp_str.len(),
                    resp_str
                );
                stream.write_all(http_resp.as_bytes()).await?;
            } else {
                let http_resp = "HTTP/1.1 202 Accepted\r\n\
                                 Access-Control-Allow-Origin: *\r\n\
                                 Content-Length: 0\r\n\r\n";
                stream.write_all(http_resp.as_bytes()).await?;
            }
            stream.flush().await?;
        } else if method == "POST" && (path_only == "/mcp" || path_only == "/") {
            let maybe_resp = dispatch_jsonrpc_request(&state, &body_str);
            if let Some(resp_str) = maybe_resp {
                let http_resp = format!(
                    "HTTP/1.1 200 OK\r\n\
                     Content-Type: application/json\r\n\
                     Access-Control-Allow-Origin: *\r\n\
                     Content-Length: {}\r\n\r\n{}",
                    resp_str.len(),
                    resp_str
                );
                stream.write_all(http_resp.as_bytes()).await?;
            } else {
                let http_resp = "HTTP/1.1 204 No Content\r\n\
                                 Access-Control-Allow-Origin: *\r\n\
                                 Content-Length: 0\r\n\r\n";
                stream.write_all(http_resp.as_bytes()).await?;
            }
            stream.flush().await?;
        } else {
            let http_resp = "HTTP/1.1 404 Not Found\r\n\
                             Access-Control-Allow-Origin: *\r\n\
                             Content-Length: 9\r\n\r\nNot Found";
            stream.write_all(http_resp.as_bytes()).await?;
            stream.flush().await?;
        }

        if is_close {
            break;
        }
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Server Entry Point & Tauri Commands
// ---------------------------------------------------------------------------

/// Starts the embedded MCP server in the background.
pub fn start_mcp_server(app_handle: tauri::AppHandle) -> Arc<McpState> {
    let state = Arc::new(McpState::new(Some(app_handle)));
    let state_clone = state.clone();

    tauri::async_runtime::spawn(async move {
        match bind_listener(DEFAULT_PORT, FALLBACK_PORT).await {
            Ok((listener, bound_port)) => {
                state_clone.bound_port.store(bound_port, Ordering::SeqCst);
                println!("Torque MCP server listening on http://127.0.0.1:{}", bound_port);
                run_server_on_listener(listener, state_clone).await;
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn create_test_project(temp_dir: &Path, id: &str, name: &str) -> Project {
        let project_dir = temp_dir.join(id);
        let files_dir = project_dir.join("files");
        fs::create_dir_all(&files_dir).unwrap();

        let project = Project {
            id: id.to_string(),
            name: name.to_string(),
            root_entry: "main.tex".to_string(),
            created_at: 1000,
            updated_at: 2000,
        };

        let proj_json = serde_json::to_string_pretty(&project).unwrap();
        fs::write(project_dir.join("project.json"), proj_json).unwrap();

        let main_tex = "\\documentclass{article}\n\\begin{document}\nHello World\n\\end{document}\n";
        fs::write(files_dir.join("main.tex"), main_tex).unwrap();

        project
    }

    #[test]
    fn test_slice_lines_bounds_and_clamping() {
        let content = "Line 1\nLine 2\nLine 3\nLine 4\nLine 5";

        // Full content
        let (res, total, s, e, sliced) = slice_lines(content, None, None);
        assert_eq!(total, 5);
        assert_eq!(s, 1);
        assert_eq!(e, 5);
        assert!(!sliced);
        assert_eq!(res, content);

        // Middle slice
        let (res, total, s, e, sliced) = slice_lines(content, Some(2), Some(4));
        assert_eq!(total, 5);
        assert_eq!(s, 2);
        assert_eq!(e, 4);
        assert!(sliced);
        assert_eq!(res, "Line 2\nLine 3\nLine 4");

        // Clamping negative startLine
        let (res, total, s, e, sliced) = slice_lines(content, Some(-10), Some(2));
        assert_eq!(total, 5);
        assert_eq!(s, 1);
        assert_eq!(e, 2);
        assert!(sliced);
        assert_eq!(res, "Line 1\nLine 2");

        // Clamping endLine beyond total
        let (res, total, s, e, sliced) = slice_lines(content, Some(3), Some(100));
        assert_eq!(total, 5);
        assert_eq!(s, 3);
        assert_eq!(e, 5);
        assert!(sliced);
        assert_eq!(res, "Line 3\nLine 4\nLine 5");

        // startLine > endLine returns empty
        let (res, _total, _s, _e, sliced) = slice_lines(content, Some(4), Some(2));
        assert!(sliced);
        assert_eq!(res, "");

        // startLine > totalLines returns empty
        let (res, _total, _s, _e, sliced) = slice_lines(content, Some(10), Some(20));
        assert!(sliced);
        assert_eq!(res, "");

        // Empty content
        let (res, total, s, e, sliced) = slice_lines("", None, None);
        assert_eq!(total, 0);
        assert_eq!(s, 1);
        assert_eq!(e, 0);
        assert!(!sliced);
        assert_eq!(res, "");
    }

    #[test]
    fn test_jsonrpc_initialize() {
        let state = McpState::new_with_dir(PathBuf::from("/tmp/torque_dummy_test"));
        let req = json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05"
            }
        });

        let resp_str = dispatch_jsonrpc_request(&state, &req.to_string()).expect("Response expected");
        let resp: Value = serde_json::from_str(&resp_str).unwrap();

        assert_eq!(resp["jsonrpc"], "2.0");
        assert_eq!(resp["id"], 1);
        assert_eq!(resp["result"]["protocolVersion"], "2024-11-05");
        assert_eq!(resp["result"]["serverInfo"]["name"], "torque-latex-ide");
        assert_eq!(resp["result"]["serverInfo"]["version"], "0.2.2");
        assert!(resp["result"]["capabilities"]["tools"].is_object());
    }

    #[test]
    fn test_jsonrpc_tools_list() {
        let state = McpState::new_with_dir(PathBuf::from("/tmp/torque_dummy_test"));
        let req = json!({
            "jsonrpc": "2.0",
            "id": "list-1",
            "method": "tools/list",
            "params": {}
        });

        let resp_str = dispatch_jsonrpc_request(&state, &req.to_string()).expect("Response expected");
        let resp: Value = serde_json::from_str(&resp_str).unwrap();

        assert_eq!(resp["id"], "list-1");
        let tools = resp["result"]["tools"].as_array().expect("Tools must be an array");
        assert_eq!(tools.len(), 7);

        let names: Vec<&str> = tools.iter().map(|t| t["name"].as_str().unwrap()).collect();
        assert!(names.contains(&"torque_list_projects"));
        assert!(names.contains(&"torque_get_active_project"));
        assert!(names.contains(&"torque_read_file"));
        assert!(names.contains(&"torque_write_file"));
        assert!(names.contains(&"torque_edit_file"));
        assert!(names.contains(&"torque_compile"));
        assert!(names.contains(&"torque_get_diagnostics"));
    }

    #[test]
    fn test_torque_read_file_slicing() {
        let temp_dir = std::env::temp_dir().join("torque_mcp_test_read");
        let _ = fs::remove_dir_all(&temp_dir);
        fs::create_dir_all(&temp_dir).unwrap();

        let project = create_test_project(&temp_dir, "proj1", "Project 1");
        let state = McpState::new_with_dir(temp_dir.clone());
        state.set_active_project_id(project.id.clone());

        // 1. Read full file
        let read_req = json!({
            "jsonrpc": "2.0",
            "id": 10,
            "method": "tools/call",
            "params": {
                "name": "torque_read_file",
                "arguments": {
                    "path": "main.tex"
                }
            }
        });
        let resp_str = dispatch_jsonrpc_request(&state, &read_req.to_string()).unwrap();
        let resp: Value = serde_json::from_str(&resp_str).unwrap();
        let tool_content_str = resp["result"]["content"][0]["text"].as_str().unwrap();
        let tool_result: Value = serde_json::from_str(tool_content_str).unwrap();

        assert_eq!(tool_result["isSliced"], false);
        assert_eq!(tool_result["totalLines"], 4);
        assert!(tool_result["content"].as_str().unwrap().contains("Hello World"));

        // 2. Read with line range slicing
        let read_slice_req = json!({
            "jsonrpc": "2.0",
            "id": 11,
            "method": "tools/call",
            "params": {
                "name": "torque_read_file",
                "arguments": {
                    "path": "main.tex",
                    "startLine": 2,
                    "endLine": 3
                }
            }
        });
        let resp_slice_str = dispatch_jsonrpc_request(&state, &read_slice_req.to_string()).unwrap();
        let resp_slice: Value = serde_json::from_str(&resp_slice_str).unwrap();
        let slice_text = resp_slice["result"]["content"][0]["text"].as_str().unwrap();
        let slice_val: Value = serde_json::from_str(slice_text).unwrap();

        assert_eq!(slice_val["isSliced"], true);
        assert_eq!(slice_val["startLine"], 2);
        assert_eq!(slice_val["endLine"], 3);
        assert_eq!(slice_val["content"], "\\begin{document}\nHello World");

        // 3. Path traversal attack rejected
        let attack_req = json!({
            "jsonrpc": "2.0",
            "id": 12,
            "method": "tools/call",
            "params": {
                "name": "torque_read_file",
                "arguments": {
                    "path": "../../../etc/passwd"
                }
            }
        });
        let attack_resp_str = dispatch_jsonrpc_request(&state, &attack_req.to_string()).unwrap();
        let attack_resp: Value = serde_json::from_str(&attack_resp_str).unwrap();
        assert!(attack_resp["error"]["message"].as_str().unwrap().contains("traversal"));

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_torque_write_and_edit_file() {
        let temp_dir = std::env::temp_dir().join("torque_mcp_test_write_edit");
        let _ = fs::remove_dir_all(&temp_dir);
        fs::create_dir_all(&temp_dir).unwrap();

        let project = create_test_project(&temp_dir, "proj_write", "Write Test");
        let state = McpState::new_with_dir(temp_dir.clone());
        state.set_active_project_id(project.id.clone());

        // 1. Write new file sections/abstract.tex
        let write_req = json!({
            "jsonrpc": "2.0",
            "id": 20,
            "method": "tools/call",
            "params": {
                "name": "torque_write_file",
                "arguments": {
                    "path": "sections/abstract.tex",
                    "content": "\\section{Abstract}\nThis paper introduces Torque IDE."
                }
            }
        });
        let write_resp_str = dispatch_jsonrpc_request(&state, &write_req.to_string()).unwrap();
        let write_resp: Value = serde_json::from_str(&write_resp_str).unwrap();
        assert_eq!(write_resp["result"]["isError"], false);

        // Verify written to disk
        let written_path = temp_dir.join("proj_write").join("files").join("sections").join("abstract.tex");
        assert!(written_path.exists());
        let disk_content = fs::read_to_string(&written_path).unwrap();
        assert!(disk_content.contains("This paper introduces Torque IDE."));

        // 2. Edit file: replace 'Torque IDE' with 'the Torque LaTeX IDE'
        let edit_req = json!({
            "jsonrpc": "2.0",
            "id": 21,
            "method": "tools/call",
            "params": {
                "name": "torque_edit_file",
                "arguments": {
                    "path": "sections/abstract.tex",
                    "target": "Torque IDE",
                    "replacement": "the Torque LaTeX IDE"
                }
            }
        });
        let edit_resp_str = dispatch_jsonrpc_request(&state, &edit_req.to_string()).unwrap();
        let edit_resp: Value = serde_json::from_str(&edit_resp_str).unwrap();
        assert_eq!(edit_resp["result"]["isError"], false);

        let updated_content = fs::read_to_string(&written_path).unwrap();
        assert!(updated_content.contains("the Torque LaTeX IDE"));
        assert!(!updated_content.contains("This paper introduces Torque IDE."));

        // 3. Edit failure: target not found returns clean error
        let bad_edit_req = json!({
            "jsonrpc": "2.0",
            "id": 22,
            "method": "tools/call",
            "params": {
                "name": "torque_edit_file",
                "arguments": {
                    "path": "sections/abstract.tex",
                    "target": "NON_EXISTENT_SNIPPET",
                    "replacement": "anything"
                }
            }
        });
        let bad_edit_str = dispatch_jsonrpc_request(&state, &bad_edit_req.to_string()).unwrap();
        let bad_edit: Value = serde_json::from_str(&bad_edit_str).unwrap();
        assert_eq!(bad_edit["error"]["code"], -32602);
        assert!(bad_edit["error"]["message"].as_str().unwrap().contains("Target text not found"));

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_torque_list_projects_and_diagnostics() {
        let temp_dir = std::env::temp_dir().join("torque_mcp_test_list_diag");
        let _ = fs::remove_dir_all(&temp_dir);
        fs::create_dir_all(&temp_dir).unwrap();

        let _p1 = create_test_project(&temp_dir, "proj_a", "Project Alpha");
        let _p2 = create_test_project(&temp_dir, "proj_b", "Project Beta");

        let state = McpState::new_with_dir(temp_dir.clone());

        // List projects
        let list_req = json!({
            "jsonrpc": "2.0",
            "id": 30,
            "method": "tools/call",
            "params": {
                "name": "torque_list_projects",
                "arguments": {}
            }
        });
        let list_resp_str = dispatch_jsonrpc_request(&state, &list_req.to_string()).unwrap();
        let list_resp: Value = serde_json::from_str(&list_resp_str).unwrap();
        let tools_text = list_resp["result"]["content"][0]["text"].as_str().unwrap();
        let projects: Value = serde_json::from_str(tools_text).unwrap();
        let arr = projects.as_array().unwrap();
        assert_eq!(arr.len(), 2);

        // Get diagnostics when idle
        let diag_req = json!({
            "jsonrpc": "2.0",
            "id": 31,
            "method": "tools/call",
            "params": {
                "name": "torque_get_diagnostics",
                "arguments": {
                    "projectId": "proj_a"
                }
            }
        });
        let diag_resp_str = dispatch_jsonrpc_request(&state, &diag_req.to_string()).unwrap();
        let diag_resp: Value = serde_json::from_str(&diag_resp_str).unwrap();
        let diag_text = diag_resp["result"]["content"][0]["text"].as_str().unwrap();
        let diag_val: Value = serde_json::from_str(diag_text).unwrap();
        assert_eq!(diag_val["status"], "idle");
        assert_eq!(diag_val["diagnostics"].as_array().unwrap().len(), 0);

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_torque_compile_tool() {
        let temp_dir = std::env::temp_dir().join("torque_mcp_test_compile");
        let _ = fs::remove_dir_all(&temp_dir);
        fs::create_dir_all(&temp_dir).unwrap();

        let project = create_test_project(&temp_dir, "proj_compile", "Compile Project");
        let state = McpState::new_with_dir(temp_dir.clone());
        state.set_active_project_id(project.id.clone());

        let compile_req = json!({
            "jsonrpc": "2.0",
            "id": 40,
            "method": "tools/call",
            "params": {
                "name": "torque_compile",
                "arguments": {
                    "projectId": "proj_compile",
                    "engine": "pdflatex"
                }
            }
        });

        let compile_resp_str = dispatch_jsonrpc_request(&state, &compile_req.to_string()).unwrap();
        let compile_resp: Value = serde_json::from_str(&compile_resp_str).unwrap();
        let tool_content_str = compile_resp["result"]["content"][0]["text"].as_str().unwrap();
        let tool_result: Value = serde_json::from_str(tool_content_str).unwrap();

        assert!(tool_result.get("status").is_some());
        assert!(tool_result.get("durationMs").is_some());
        assert!(tool_result.get("diagnostics").is_some());

        // Verify diagnostics tool now retrieves the cached diagnostics
        let diag_req = json!({
            "jsonrpc": "2.0",
            "id": 41,
            "method": "tools/call",
            "params": {
                "name": "torque_get_diagnostics",
                "arguments": {
                    "projectId": "proj_compile"
                }
            }
        });
        let diag_resp_str = dispatch_jsonrpc_request(&state, &diag_req.to_string()).unwrap();
        let diag_resp: Value = serde_json::from_str(&diag_resp_str).unwrap();
        let diag_text = diag_resp["result"]["content"][0]["text"].as_str().unwrap();
        let diag_val: Value = serde_json::from_str(diag_text).unwrap();
        assert_eq!(diag_val["status"], tool_result["status"]);

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_http_mcp_and_sse_endpoints() {
        tauri::async_runtime::block_on(async {
        let temp_dir = std::env::temp_dir().join("torque_mcp_test_http");
        let _ = fs::remove_dir_all(&temp_dir);
        fs::create_dir_all(&temp_dir).unwrap();

        let _project = create_test_project(&temp_dir, "proj_net", "Network Test");
        let state = Arc::new(McpState::new_with_dir(temp_dir.clone()));

        // Bind ephemeral port 0
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let bound_port = listener.local_addr().unwrap().port();
        state.bound_port.store(bound_port, Ordering::SeqCst);

        let state_clone = state.clone();
        tokio::spawn(async move {
            run_server_on_listener(listener, state_clone).await;
        });

        // 1. Test POST /mcp endpoint
        let mut stream = TcpStream::connect(format!("127.0.0.1:{}", bound_port)).await.unwrap();
        let mcp_req = json!({
            "jsonrpc": "2.0",
            "id": "http-1",
            "method": "initialize",
            "params": {}
        })
        .to_string();

        let http_post = format!(
            "POST /mcp HTTP/1.1\r\n\
             Host: 127.0.0.1:{}\r\n\
             Content-Type: application/json\r\n\
             Content-Length: {}\r\n\
             Connection: close\r\n\r\n{}",
            bound_port,
            mcp_req.len(),
            mcp_req
        );

        stream.write_all(http_post.as_bytes()).await.unwrap();
        let mut resp_bytes = Vec::new();
        stream.read_to_end(&mut resp_bytes).await.unwrap();
        let resp_str = String::from_utf8_lossy(&resp_bytes);

        assert!(resp_str.contains("HTTP/1.1 200 OK"));
        assert!(resp_str.contains("torque-latex-ide"));
        assert!(resp_str.contains("\"protocolVersion\":\"2024-11-05\""));

        // 2. Test GET /sse and POST /message endpoint
        let mut sse_stream = TcpStream::connect(format!("127.0.0.1:{}", bound_port)).await.unwrap();
        let sse_req = format!(
            "GET /sse HTTP/1.1\r\n\
             Host: 127.0.0.1:{}\r\n\
             Accept: text/event-stream\r\n\r\n",
            bound_port
        );
        sse_stream.write_all(sse_req.as_bytes()).await.unwrap();

        let mut sse_buf = [0u8; 1024];
        let n = sse_stream.read(&mut sse_buf).await.unwrap();
        let sse_resp = String::from_utf8_lossy(&sse_buf[..n]);

        assert!(sse_resp.contains("HTTP/1.1 200 OK"));
        assert!(sse_resp.contains("text/event-stream"));
        assert!(sse_resp.contains("event: endpoint"));
        assert!(sse_resp.contains("/message?sessionId="));

        // Extract session ID
        let session_id = sse_resp
            .split("sessionId=")
            .nth(1)
            .and_then(|s| s.lines().next())
            .unwrap()
            .trim();

        // Send POST /message?sessionId=...
        let mut msg_stream = TcpStream::connect(format!("127.0.0.1:{}", bound_port)).await.unwrap();
        let msg_rpc = json!({
            "jsonrpc": "2.0",
            "id": "sse-msg-1",
            "method": "tools/list",
            "params": {}
        })
        .to_string();

        let post_msg = format!(
            "POST /message?sessionId={} HTTP/1.1\r\n\
             Host: 127.0.0.1:{}\r\n\
             Content-Type: application/json\r\n\
             Content-Length: {}\r\n\
             Connection: close\r\n\r\n{}",
            session_id,
            bound_port,
            msg_rpc.len(),
            msg_rpc
        );
        msg_stream.write_all(post_msg.as_bytes()).await.unwrap();
        let mut msg_resp_bytes = Vec::new();
        msg_stream.read_to_end(&mut msg_resp_bytes).await.unwrap();
        let post_msg_resp = String::from_utf8_lossy(&msg_resp_bytes);

        assert!(post_msg_resp.contains("HTTP/1.1 200 OK"));
        assert!(post_msg_resp.contains("torque_read_file"));

        // And verify SSE stream received event: message
        let sse_event_n = sse_stream.read(&mut sse_buf).await.unwrap();
        let sse_event = String::from_utf8_lossy(&sse_buf[..sse_event_n]);
        assert!(sse_event.contains("event: message"));
        assert!(sse_event.contains("torque_read_file"));

        let _ = fs::remove_dir_all(&temp_dir);
        });
    }
}
