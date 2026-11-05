//! File I/O tool handlers: read, write, edit.

use serde_json::{json, Value};

use super::{McpState, slice_lines};
use crate::storage::{self, is_binary_file, normalize_path};

pub fn handle_tool_read_file(state: &McpState, args: &Value) -> Result<Value, (i64, String)> {
    let raw_path = args
        .get("path")
        .and_then(|p| p.as_str())
        .ok_or_else(|| (-32602, "Missing required argument 'path'".to_string()))?;

    let clean_path = normalize_path(raw_path)
        .map_err(|e| (-32602, format!("Invalid path: {}", e)))?;

    let project_id = super::projects::resolve_project_id(state, args.get("projectId").and_then(|p| p.as_str()))?;
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

    let project_id = super::projects::resolve_project_id(state, args.get("projectId").and_then(|p| p.as_str()))?;
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

    // Update project updated_at timestamp or auto-generate project.json
    let project_json_path = project_dir.join("project.json");
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    if project_json_path.exists() {
        if let Ok(data) = std::fs::read_to_string(&project_json_path) {
            if let Ok(mut project) = serde_json::from_str::<storage::Project>(&data) {
                project.updated_at = now;
                if let Ok(serialized) = serde_json::to_string_pretty(&project) {
                    let _ = std::fs::write(&project_json_path, serialized);
                }
            }
        }
    } else {
        let root_entry = if clean_path.ends_with(".tex") {
            clean_path.clone()
        } else {
            "main.tex".to_string()
        };
        let project = storage::Project {
            id: project_id.clone(),
            name: project_id.clone(),
            root_entry,
            created_at: now,
            updated_at: now,
        };
        if let Ok(serialized) = serde_json::to_string_pretty(&project) {
            let _ = std::fs::write(&project_json_path, serialized);
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
        .or_else(|| args.get("search"))
        .and_then(|t| t.as_str())
        .ok_or_else(|| (-32602, "Missing required argument 'target'".to_string()))?;

    let replacement = args
        .get("replacement")
        .or_else(|| args.get("replace"))
        .and_then(|r| r.as_str())
        .ok_or_else(|| (-32602, "Missing required argument 'replacement'".to_string()))?;

    if target.is_empty() {
        return Err((-32602, "Argument 'target' cannot be empty".to_string()));
    }

    let clean_path = normalize_path(raw_path)
        .map_err(|e| (-32602, format!("Invalid path: {}", e)))?;

    let project_id = super::projects::resolve_project_id(state, args.get("projectId").and_then(|p| p.as_str()))?;
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
            if let Ok(mut project) = serde_json::from_str::<storage::Project>(&data) {
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
