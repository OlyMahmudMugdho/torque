use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::{Path, PathBuf};

mod base64_utils {
    const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

    pub fn encode(data: &[u8]) -> String {
        let mut result = String::with_capacity((data.len() + 2) / 3 * 4);
        for chunk in data.chunks(3) {
            let b0 = chunk[0] as u32;
            let b1 = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
            let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };
            let t = (b0 << 16) | (b1 << 8) | b2;

            result.push(ALPHABET[((t >> 18) & 0x3F) as usize] as char);
            result.push(ALPHABET[((t >> 12) & 0x3F) as usize] as char);
            if chunk.len() > 1 {
                result.push(ALPHABET[((t >> 6) & 0x3F) as usize] as char);
            } else {
                result.push('=');
            }
            if chunk.len() > 2 {
                result.push(ALPHABET[(t & 0x3F) as usize] as char);
            } else {
                result.push('=');
            }
        }
        result
    }

    pub fn decode(input: &str) -> Option<Vec<u8>> {
        let mut lookup = [255u8; 256];
        for (i, &b) in ALPHABET.iter().enumerate() {
            lookup[b as usize] = i as u8;
        }

        let clean: Vec<u8> = input.bytes().filter(|&b| !b.is_ascii_whitespace()).collect();
        if clean.len() % 4 != 0 {
            return None;
        }

        let mut output = Vec::with_capacity(clean.len() / 4 * 3);
        for chunk in clean.chunks(4) {
            let c0 = chunk[0];
            let c1 = chunk[1];
            let c2 = chunk[2];
            let c3 = chunk[3];

            let v0 = lookup[c0 as usize];
            let v1 = lookup[c1 as usize];
            if v0 == 255 || v1 == 255 {
                return None;
            }

            let v2 = if c2 == b'=' { 0 } else { lookup[c2 as usize] };
            let v3 = if c3 == b'=' { 0 } else { lookup[c3 as usize] };
            if (c2 != b'=' && v2 == 255) || (c3 != b'=' && v3 == 255) {
                return None;
            }

            let triple = ((v0 as u32) << 18) | ((v1 as u32) << 12) | ((v2 as u32) << 6) | (v3 as u32);
            output.push((triple >> 16) as u8);
            if c2 != b'=' {
                output.push((triple >> 8) as u8);
            }
            if c3 != b'=' {
                output.push(triple as u8);
            }
        }
        Some(output)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Project {
    pub id: String,
    pub name: String,
    #[serde(rename = "rootEntry")]
    pub root_entry: String,
    #[serde(rename = "createdAt")]
    pub created_at: u64,
    #[serde(rename = "updatedAt")]
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectFile {
    #[serde(rename = "projectId")]
    pub project_id: String,
    pub path: String,
    pub content: serde_json::Value,
    #[serde(rename = "isBinary")]
    pub is_binary: bool,
    #[serde(rename = "updatedAt")]
    pub updated_at: u64,
}

pub fn get_torque_base_dir() -> Result<PathBuf, String> {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map_err(|_| "Could not determine home directory (neither HOME nor USERPROFILE is set)".to_string())?;
    Ok(PathBuf::from(home).join(".torque"))
}

pub fn get_projects_dir() -> Result<PathBuf, String> {
    let torque_dir = get_torque_base_dir()?;
    let projects_dir = torque_dir.join("projects");
    if !projects_dir.exists() {
        std::fs::create_dir_all(&projects_dir)
            .map_err(|e| format!("Failed to create projects directory {}: {}", projects_dir.display(), e))?;
    }
    Ok(projects_dir)
}

pub fn normalize_path(raw_path: &str) -> Result<String, String> {
    let trimmed = raw_path.trim();
    if trimmed.is_empty() {
        return Err("Path cannot be empty".to_string());
    }
    let normalized = trimmed.replace('\\', "/");
    let segments: Vec<&str> = normalized
        .split('/')
        .filter(|s| !s.is_empty() && *s != ".")
        .collect();

    for seg in &segments {
        if *seg == ".." {
            return Err(format!("Parent traversal not allowed in path: {}", raw_path));
        }
    }

    if segments.is_empty() {
        return Err(format!("Invalid path resulted in empty path: {}", raw_path));
    }

    Ok(segments.join("/"))
}

fn is_binary_file(path: &str, bytes: &[u8]) -> bool {
    let lower = path.to_lowercase();
    let binary_extensions = [
        ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".webp",
        ".pdf", ".zip", ".tar", ".gz", ".7z",
        ".woff", ".woff2", ".ttf", ".otf", ".eot",
        ".mp3", ".mp4", ".wav", ".bin",
    ];
    if binary_extensions.iter().any(|ext| lower.ends_with(ext)) {
        return true;
    }
    let check_len = bytes.len().min(8000);
    bytes[..check_len].contains(&0)
}

fn extract_file_bytes(file: &ProjectFile) -> Result<Vec<u8>, String> {
    match &file.content {
        serde_json::Value::String(s) => {
            if file.is_binary {
                if let Some(decoded) = base64_utils::decode(s) {
                    return Ok(decoded);
                }
            }
            Ok(s.as_bytes().to_vec())
        }
        serde_json::Value::Array(arr) => {
            let mut bytes = Vec::with_capacity(arr.len());
            for v in arr {
                if let Some(n) = v.as_u64() {
                    bytes.push(n as u8);
                } else if let Some(n) = v.as_i64() {
                    bytes.push(n as u8);
                } else {
                    return Err(format!("Invalid byte value in array: {:?}", v));
                }
            }
            Ok(bytes)
        }
        serde_json::Value::Object(map) => {
            let mut entries: Vec<(usize, u8)> = Vec::new();
            for (k, v) in map {
                if let Ok(idx) = k.parse::<usize>() {
                    let b = v.as_u64().map(|n| n as u8).unwrap_or(0);
                    entries.push((idx, b));
                }
            }
            entries.sort_by_key(|&(idx, _)| idx);
            Ok(entries.into_iter().map(|(_, b)| b).collect())
        }
        _ => Err("Invalid file content format: expected string or array".to_string()),
    }
}

fn clean_stale_files(dir: &Path, keep_paths: &HashSet<String>) -> Result<(), String> {
    if !dir.exists() {
        return Ok(());
    }

    fn visit(root: &Path, current: &Path, keep_paths: &HashSet<String>) -> Result<(), String> {
        if current.is_dir() {
            let entries = std::fs::read_dir(current)
                .map_err(|e| format!("Failed to read dir {}: {}", current.display(), e))?;
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    visit(root, &path, keep_paths)?;
                    let _ = std::fs::remove_dir(&path);
                } else if path.is_file() {
                    if let Ok(rel) = path.strip_prefix(root) {
                        let rel_str = rel.to_string_lossy().replace('\\', "/");
                        if !keep_paths.contains(&rel_str) {
                            let _ = std::fs::remove_file(&path);
                        }
                    }
                }
            }
        }
        Ok(())
    }

    visit(dir, dir, keep_paths)
}

#[tauri::command]
pub fn get_torque_dir() -> Result<String, String> {
    let base = get_torque_base_dir()?;
    let _ = get_projects_dir()?;
    Ok(base.to_string_lossy().to_string())
}

#[tauri::command]
pub fn tauri_list_projects() -> Result<Vec<Project>, String> {
    let projects_dir = get_projects_dir()?;
    let mut projects = Vec::new();

    let entries = std::fs::read_dir(&projects_dir)
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

#[tauri::command]
pub fn tauri_save_project(project: Project, files: Vec<ProjectFile>) -> Result<(), String> {
    let projects_dir = get_projects_dir()?;
    let project_dir = projects_dir.join(&project.id);
    let files_dir = project_dir.join("files");

    std::fs::create_dir_all(&files_dir)
        .map_err(|e| format!("Failed to create directory {}: {}", files_dir.display(), e))?;

    let project_json_path = project_dir.join("project.json");
    let serialized = serde_json::to_string_pretty(&project)
        .map_err(|e| format!("Failed to serialize project: {}", e))?;
    std::fs::write(&project_json_path, serialized)
        .map_err(|e| format!("Failed to write project.json: {}", e))?;

    let mut saved_rel_paths = HashSet::new();

    for file in &files {
        let clean_path = normalize_path(&file.path)?;
        saved_rel_paths.insert(clean_path.clone());

        let target_file_path = files_dir.join(&clean_path);
        if let Some(parent) = target_file_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create parent directory for {}: {}", clean_path, e))?;
        }

        let bytes = extract_file_bytes(file)?;
        std::fs::write(&target_file_path, bytes)
            .map_err(|e| format!("Failed to write file {}: {}", target_file_path.display(), e))?;
    }

    clean_stale_files(&files_dir, &saved_rel_paths)?;
    Ok(())
}

#[tauri::command]
pub fn tauri_load_project(id: String) -> Result<Option<(Project, Vec<ProjectFile>)>, String> {
    let projects_dir = get_projects_dir()?;
    let project_dir = projects_dir.join(&id);

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
        fn collect_files(
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
                    collect_files(root, &path, project_id, default_updated_at, files)?;
                } else if path.is_file() {
                    let rel = path.strip_prefix(root)
                        .map_err(|e| format!("Failed to strip prefix: {}", e))?;
                    let rel_path = rel.to_string_lossy().replace('\\', "/");

                    let bytes = std::fs::read(&path)
                        .map_err(|e| format!("Failed to read file {}: {}", path.display(), e))?;

                    let updated_at = match path.metadata().and_then(|m| m.modified()) {
                        Ok(systime) => systime
                            .duration_since(std::time::UNIX_EPOCH)
                            .map(|d| d.as_millis() as u64)
                            .unwrap_or(default_updated_at),
                        Err(_) => default_updated_at,
                    };

                    let is_binary = is_binary_file(&rel_path, &bytes);
                    let content = if is_binary {
                        serde_json::Value::String(base64_utils::encode(&bytes))
                    } else {
                        match String::from_utf8(bytes) {
                            Ok(text) => serde_json::Value::String(text),
                            Err(e) => {
                                serde_json::Value::String(base64_utils::encode(&e.into_bytes()))
                            }
                        }
                    };

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

        collect_files(&files_dir, &files_dir, &project.id, project.updated_at, &mut files)?;
    }

    files.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(Some((project, files)))
}

#[tauri::command]
pub fn tauri_delete_project(id: String) -> Result<(), String> {
    let projects_dir = get_projects_dir()?;
    let project_dir = projects_dir.join(&id);
    if project_dir.exists() {
        std::fs::remove_dir_all(&project_dir)
            .map_err(|e| format!("Failed to delete project directory {}: {}", project_dir.display(), e))?;
    }
    Ok(())
}

pub fn get_cache_packages_dir() -> Result<PathBuf, String> {
    let torque_dir = get_torque_base_dir()?;
    let packages_dir = torque_dir.join("cache").join("packages");
    if !packages_dir.exists() {
        std::fs::create_dir_all(&packages_dir)
            .map_err(|e| format!("Failed to create package cache directory {}: {}", packages_dir.display(), e))?;
    }
    Ok(packages_dir)
}

#[tauri::command]
pub fn tauri_save_package_file(filename: String, data: String) -> Result<(), String> {
    let sanitized = normalize_path(&filename)?;
    let file_stem = Path::new(&sanitized)
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "Invalid filename".to_string())?;

    let packages_dir = get_cache_packages_dir()?;
    let target_path = packages_dir.join(file_stem);

    let decoded = base64_utils::decode(&data)
        .ok_or_else(|| "Failed to decode base64 data for package file".to_string())?;

    std::fs::write(&target_path, decoded)
        .map_err(|e| format!("Failed to write package file {}: {}", target_path.display(), e))?;

    Ok(())
}

#[tauri::command]
pub fn tauri_get_package_file(filename: String) -> Result<Option<String>, String> {
    let sanitized = normalize_path(&filename)?;
    let file_stem = Path::new(&sanitized)
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "Invalid filename".to_string())?;

    let packages_dir = get_cache_packages_dir()?;
    let target_path = packages_dir.join(file_stem);

    if !target_path.exists() {
        return Ok(None);
    }

    let bytes = std::fs::read(&target_path)
        .map_err(|e| format!("Failed to read package file {}: {}", target_path.display(), e))?;

    Ok(Some(base64_utils::encode(&bytes)))
}

#[tauri::command]
pub fn tauri_list_package_files() -> Result<Vec<String>, String> {
    let packages_dir = get_cache_packages_dir()?;
    let mut files = Vec::new();

    let entries = std::fs::read_dir(&packages_dir)
        .map_err(|e| format!("Failed to read packages directory: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let path = entry.path();
        if path.is_file() {
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                files.push(name.to_string());
            }
        }
    }

    files.sort();
    Ok(files)
}

#[tauri::command]
pub fn tauri_clear_package_cache() -> Result<(), String> {
    let packages_dir = get_cache_packages_dir()?;
    if packages_dir.exists() {
        let entries = std::fs::read_dir(&packages_dir)
            .map_err(|e| format!("Failed to read packages directory: {}", e))?;
        for entry in entries {
            let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
            let path = entry.path();
            if path.is_file() {
                let _ = std::fs::remove_file(path);
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    static ENV_MUTEX: Mutex<()> = Mutex::new(());

    #[test]
    fn test_base64_encode_decode() {
        let data = b"Hello, LaTeX World!";
        let encoded = base64_utils::encode(data);
        let decoded = base64_utils::decode(&encoded).expect("decode failed");
        assert_eq!(&decoded, data);
    }

    #[test]
    fn test_normalize_path() {
        assert_eq!(normalize_path("foo/bar.tex").unwrap(), "foo/bar.tex");
        assert_eq!(normalize_path("foo\\bar.tex").unwrap(), "foo/bar.tex");
        assert_eq!(normalize_path("./foo//bar.tex").unwrap(), "foo/bar.tex");
        assert!(normalize_path("../secret").is_err());
        assert!(normalize_path("foo/../bar").is_err());
    }

    #[test]
    fn test_save_load_list_delete_project_flow() {
        let _lock = ENV_MUTEX.lock().unwrap();
        let temp_dir = std::env::temp_dir().join(format!("torque-test-{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        std::fs::create_dir_all(&temp_dir).unwrap();
        let orig_home = std::env::var("HOME").ok();
        unsafe {
            std::env::set_var("HOME", &temp_dir);
        }

        let proj_id = "test-proj-123".to_string();
        let proj = Project {
            id: proj_id.clone(),
            name: "Test Project".to_string(),
            root_entry: "main.tex".to_string(),
            created_at: 1000,
            updated_at: 2000,
        };

        let bin_bytes = vec![0u8, 159, 255, 42];
        let files = vec![
            ProjectFile {
                project_id: proj_id.clone(),
                path: "main.tex".to_string(),
                content: serde_json::Value::String("\\documentclass{article}".to_string()),
                is_binary: false,
                updated_at: 2000,
            },
            ProjectFile {
                project_id: proj_id.clone(),
                path: "images/logo.png".to_string(),
                content: serde_json::Value::String(base64_utils::encode(&bin_bytes)),
                is_binary: true,
                updated_at: 2000,
            },
        ];

        // Save
        tauri_save_project(proj.clone(), files).expect("save project failed");

        // List
        let list = tauri_list_projects().expect("list projects failed");
        assert_eq!(list.len(), 1);
        assert_eq!(list[0], proj);

        // Load
        let loaded = tauri_load_project(proj_id.clone()).expect("load project failed");
        assert!(loaded.is_some());
        let (loaded_proj, loaded_files) = loaded.unwrap();
        assert_eq!(loaded_proj, proj);
        assert_eq!(loaded_files.len(), 2);
        assert_eq!(loaded_files[0].path, "images/logo.png");
        assert!(loaded_files[0].is_binary);
        assert_eq!(loaded_files[1].path, "main.tex");
        assert!(!loaded_files[1].is_binary);

        // Delete
        tauri_delete_project(proj_id.clone()).expect("delete project failed");
        let list_after = tauri_list_projects().expect("list projects after delete failed");
        assert_eq!(list_after.len(), 0);

        if let Some(h) = orig_home {
            unsafe {
                std::env::set_var("HOME", h);
            }
        }
        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_package_cache_storage_flow() {
        let _lock = ENV_MUTEX.lock().unwrap();
        let temp_dir = std::env::temp_dir().join(format!("torque-pkg-cache-test-{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        std::fs::create_dir_all(&temp_dir).unwrap();
        let orig_home = std::env::var("HOME").ok();
        unsafe {
            std::env::set_var("HOME", &temp_dir);
        }

        let pkg_data = b"\\ProvidesPackage{custompkg}[2026/11/03]";
        let encoded = base64_utils::encode(pkg_data);

        // Save
        tauri_save_package_file("custompkg.sty".to_string(), encoded).expect("save package file failed");

        // List
        let list = tauri_list_package_files().expect("list package files failed");
        assert_eq!(list, vec!["custompkg.sty".to_string()]);

        // Get
        let fetched_b64 = tauri_get_package_file("custompkg.sty".to_string()).expect("get package file failed");
        assert!(fetched_b64.is_some());
        let decoded = base64_utils::decode(&fetched_b64.unwrap()).expect("decode package file failed");
        assert_eq!(&decoded, pkg_data);

        // Clear
        tauri_clear_package_cache().expect("clear package cache failed");
        let list_after = tauri_list_package_files().expect("list package files after clear failed");
        assert_eq!(list_after.len(), 0);

        if let Some(h) = orig_home {
            unsafe {
                std::env::set_var("HOME", h);
            }
        }
        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
