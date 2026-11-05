//! Compilation and diagnostics tool handlers.

use serde_json::{json, Value};

use super::McpState;
use crate::compiler;

pub fn handle_tool_compile(state: &McpState, args: &Value) -> Result<Value, (i64, String)> {
    let project_id = super::projects::resolve_project_id(state, args.get("projectId").and_then(|p| p.as_str()))?;
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

    let loaded = super::load_project_with_files(state, &project_id)
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
    let project_id = super::projects::resolve_project_id(state, args.get("projectId").and_then(|p| p.as_str()))?;

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
