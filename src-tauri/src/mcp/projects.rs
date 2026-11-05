//! Project-related helpers and tool handlers.

use serde_json::{json, Value};
use std::path::Path;

use super::McpState;
use crate::storage::{is_binary_file, normalize_path, Project};

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

pub fn resolve_project_id(state: &McpState, requested_id: Option<&str>) -> Result<String, (i64, String)> {
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

pub fn handle_tool_create_project(state: &McpState, args: &Value) -> Result<Value, (i64, String)> {
    let name = args
        .get("name")
        .and_then(|n| n.as_str())
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| (-32602, "Missing required argument 'name'".to_string()))?;

    let raw_root = args
        .get("rootEntry")
        .and_then(|r| r.as_str())
        .map(|s| s.trim())
        .unwrap_or("");
    let root_entry = if raw_root.is_empty() {
        "main.tex".to_string()
    } else {
        normalize_path(raw_root).map_err(|e| (-32602, format!("Invalid rootEntry: {}", e)))?
    };

    let default_content = format!(
        r#"\documentclass{{article}}
\usepackage{{amsmath}}

\title{{{}}}
\author{{}}
\date{{\today}}

\begin{{document}}
\maketitle

\section{{Introduction}}
Welcome to your LaTeX document!

\end{{document}}
"#,
        name
    );

    let content = args
        .get("content")
        .and_then(|c| c.as_str())
        .unwrap_or(&default_content);

    let project_id = uuid::Uuid::new_v4().to_string();
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    let projects_dir = state
        .get_projects_dir()
        .map_err(|e| (-32603, format!("Storage error: {}", e)))?;
    let project_dir = projects_dir.join(&project_id);
    let files_dir = project_dir.join("files");
    let file_path = files_dir.join(&root_entry);

    if let Some(parent) = file_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| (-32603, format!("Failed to create directories for {}: {}", root_entry, e)))?;
    }

    std::fs::write(&file_path, content.as_bytes())
        .map_err(|e| (-32603, format!("Failed to write initial entry file {}: {}", root_entry, e)))?;

    let project = Project {
        id: project_id.clone(),
        name: name.to_string(),
        root_entry: root_entry.clone(),
        created_at: now,
        updated_at: now,
    };

    let project_json_path = project_dir.join("project.json");
    let serialized = serde_json::to_string_pretty(&project)
        .map_err(|e| (-32603, format!("Failed to serialize project: {}", e)))?;
    std::fs::write(&project_json_path, serialized)
        .map_err(|e| (-32603, format!("Failed to write project.json: {}", e)))?;

    state.set_active_project_id(project_id.clone());
    state.emit_file_changed(&project_id, &root_entry, content);

    Ok(json!({
        "id": project.id,
        "name": project.name,
        "rootEntry": project.root_entry,
        "createdAt": project.created_at,
        "updatedAt": project.updated_at,
    }))
}

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
