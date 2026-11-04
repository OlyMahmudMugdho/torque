use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Instant;

use crate::storage::{get_torque_base_dir, normalize_path, ProjectFile};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TexLiveDetection {
    pub available: bool,
    pub latexmk: bool,
    pub pdflatex: bool,
    pub xelatex: bool,
    pub lualatex: bool,
    pub texhash: bool,
    pub synctex: bool,
    pub version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Diagnostic {
    pub severity: String, // "error" | "warning" | "info"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub line: Option<u32>,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompileResultPayload {
    pub status: String, // "spotless" | "warnings" | "errors" | "failed"
    pub pdf: Option<String>, // base64-encoded PDF bytes
    pub synctex: Option<String>, // base64-encoded synctex.gz bytes
    pub diagnostics: Vec<Diagnostic>,
    pub missing_files: Vec<String>,
    #[serde(default)]
    pub resolved_packages: Vec<String>,
    pub duration_ms: u64,
    pub stdout: String,
    pub stderr: String,
}

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

pub fn check_binary_available(cmd_name: &str) -> bool {
    let check_arg = if cmd_name == "latexmk" { "-v" } else { "--version" };
    match Command::new(cmd_name).arg(check_arg).output() {
        Ok(output) => output.status.success(),
        Err(_) => false,
    }
}

pub fn get_texlive_version_string() -> Option<String> {
    if let Ok(output) = Command::new("pdflatex").arg("--version").output() {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            if let Some(first_line) = stdout.lines().next() {
                return Some(first_line.trim().to_string());
            }
        }
    }
    None
}

pub fn detect_texlive_sync() -> Result<TexLiveDetection, String> {
    let latexmk = check_binary_available("latexmk");
    let pdflatex = check_binary_available("pdflatex");
    let xelatex = check_binary_available("xelatex");
    let lualatex = check_binary_available("lualatex");
    let texhash = check_binary_available("texhash") || check_binary_available("mktexlsr");
    let synctex = check_binary_available("synctex");

    let available = latexmk && (pdflatex || xelatex || lualatex);
    let version = get_texlive_version_string();

    Ok(TexLiveDetection {
        available,
        latexmk,
        pdflatex,
        xelatex,
        lualatex,
        texhash,
        synctex,
        version,
    })
}

#[tauri::command]
pub async fn tauri_detect_texlive() -> Result<TexLiveDetection, String> {
    tauri::async_runtime::spawn_blocking(detect_texlive_sync)
        .await
        .map_err(|e| format!("Failed to execute detect_texlive task: {}", e))?
}

pub fn extract_file_bytes_from_project_file(file: &ProjectFile) -> Result<Vec<u8>, String> {
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
                    return Err(format!("Invalid byte in file content: {:?}", v));
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
        _ => Err("Invalid file content type: expected string or array".to_string()),
    }
}

pub fn extract_missing_files_from_log(log_content: &str, stdout_err: &str) -> Vec<String> {
    let mut missing = Vec::new();
    let mut seen = HashSet::new();

    let combined = format!("{}\n{}", log_content, stdout_err);

    for line in combined.lines() {
        // Pattern 1: ! LaTeX Error: File `foo.sty' not found.
        // or: ! LaTeX Error: File 'foo.sty' not found.
        if let Some(pos) = line.find("! LaTeX Error: File ") {
            let remainder = &line[pos + "! LaTeX Error: File ".len()..];
            if let Some(end_idx) = remainder.find("not found") {
                let candidate = remainder[..end_idx]
                    .trim()
                    .trim_matches(|c| c == '`' || c == '\'' || c == '"' || c == ' ' || c == '.');
                let candidate_clean = candidate.trim();
                if !candidate_clean.is_empty() && seen.insert(candidate_clean.to_string()) {
                    missing.push(candidate_clean.to_string());
                }
            }
        }

        // Pattern 2: Latexmk: Missing input file 'foo.sty'
        if let Some(pos) = line.find("Latexmk: Missing input file ") {
            let remainder = &line[pos + "Latexmk: Missing input file ".len()..];
            let candidate = remainder
                .trim()
                .trim_matches(|c| c == '`' || c == '\'' || c == '"' || c == ' ');
            // Can be followed by (or dependence on it)
            let file_candidate = candidate.split_whitespace().next().unwrap_or(candidate)
                .trim_matches(|c| c == '`' || c == '\'' || c == '"');
            if !file_candidate.is_empty() && seen.insert(file_candidate.to_string()) {
                missing.push(file_candidate.to_string());
            }
        }

        // Pattern 3: ! I can't find file `foo.tex'.
        // or: ! I can't find file 'foo.tex'.
        if let Some(pos) = line.find("! I can't find file ") {
            let remainder = &line[pos + "! I can't find file ".len()..];
            let candidate = remainder
                .trim()
                .trim_matches(|c| c == '`' || c == '\'' || c == '"' || c == ' ' || c == '.');
            if !candidate.is_empty() && seen.insert(candidate.to_string()) {
                missing.push(candidate.to_string());
            }
        }

        // Pattern 4: kpathsea: Running mktexmf foo.mf ... ! I can't find file `foo.mf'.
        if line.contains("! Font ") && line.contains("not loadable: Metric (TFM) file not found") {
            // ! Font \TU/lmr/m/n/10=ecrm1000 at 10.0pt not loadable: Metric (TFM) file not found.
            if let Some(eq_pos) = line.find('=') {
                let rest = &line[eq_pos + 1..];
                if let Some(space_pos) = rest.find(" at ") {
                    let font_name = rest[..space_pos].trim();
                    let font_file = format!("{}.tfm", font_name);
                    if seen.insert(font_file.clone()) {
                        missing.push(font_file);
                    }
                }
            }
        }
    }

    missing
}

pub fn parse_diagnostics_from_log(log_content: &str, stdout_err: &str, default_file: &str) -> Vec<Diagnostic> {
    let mut diagnostics = Vec::new();
    let mut seen = HashSet::new();

    let combined = format!("{}\n{}", log_content, stdout_err);
    let lines: Vec<&str> = combined.lines().collect();
    let mut i = 0;

    while i < lines.len() {
        let line = lines[i].trim();

        // Check for file-line-error format: "path/file.tex:123: message"
        if let Some(first_colon) = line.find(':') {
            let file_part = &line[..first_colon];
            let after_first = &line[first_colon + 1..];
            if let Some(second_colon) = after_first.find(':') {
                let line_str = &after_first[..second_colon];
                let msg_part = after_first[second_colon + 1..].trim();

                if let Ok(line_num) = line_str.parse::<u32>() {
                    // Check if file_part looks like a valid path
                    if !file_part.is_empty() && !file_part.contains(' ') {
                        let clean_file = file_part.trim_start_matches("./");
                        let is_warning = msg_part.to_lowercase().contains("warning");
                        let severity = if is_warning { "warning" } else { "error" };

                        let diag = Diagnostic {
                            severity: severity.to_string(),
                            file: Some(clean_file.to_string()),
                            line: Some(line_num),
                            message: msg_part.to_string(),
                        };
                        let key = (diag.severity.clone(), diag.file.clone(), diag.line, diag.message.clone());
                        if seen.insert(key) {
                            diagnostics.push(diag);
                        }
                        i += 1;
                        continue;
                    }
                }
            }
        }

        // Check for "! LaTeX Error: ..." or other "!" lines
        if line.starts_with('!') {
            let err_msg = line.trim_start_matches('!').trim();
            let mut line_num = None;
            let file_name = Some(default_file.to_string());

            // Look ahead for "l.<number>" indicating line number
            let mut lookahead = i + 1;
            while lookahead < lines.len() && lookahead <= i + 6 {
                let next_line = lines[lookahead].trim();
                if next_line.starts_with("l.") {
                    let num_str: String = next_line[2..]
                        .chars()
                        .take_while(|c| c.is_ascii_digit())
                        .collect();
                    if let Ok(num) = num_str.parse::<u32>() {
                        line_num = Some(num);
                        break;
                    }
                }
                lookahead += 1;
            }

            let diag = Diagnostic {
                severity: "error".to_string(),
                file: file_name,
                line: line_num,
                message: err_msg.to_string(),
            };
            let key = (diag.severity.clone(), diag.file.clone(), diag.line, diag.message.clone());
            if seen.insert(key) {
                diagnostics.push(diag);
            }
            i += 1;
            continue;
        }

        // Check for "LaTeX Warning: ... on input line 123."
        if line.starts_with("LaTeX Warning:") || line.starts_with("LaTeX Font Warning:") || line.starts_with("Package ") && line.contains("Warning:") {
            let mut line_num = None;
            if let Some(pos) = line.find("on input line ") {
                let num_str: String = line[pos + "on input line ".len()..]
                    .chars()
                    .take_while(|c| c.is_ascii_digit())
                    .collect();
                if let Ok(num) = num_str.parse::<u32>() {
                    line_num = Some(num);
                }
            }

            let diag = Diagnostic {
                severity: "warning".to_string(),
                file: Some(default_file.to_string()),
                line: line_num,
                message: line.to_string(),
            };
            let key = (diag.severity.clone(), diag.file.clone(), diag.line, diag.message.clone());
            if seen.insert(key) {
                diagnostics.push(diag);
            }
            i += 1;
            continue;
        }

        i += 1;
    }

    diagnostics
}

pub fn get_build_directory(project_id: &str) -> Result<PathBuf, String> {
    let torque_dir = get_torque_base_dir()?;
    let build_dir = torque_dir.join("build").join(project_id);
    if !build_dir.exists() {
        std::fs::create_dir_all(&build_dir)
            .map_err(|e| format!("Failed to create build directory {}: {}", build_dir.display(), e))?;
    }
    Ok(build_dir)
}

#[tauri::command]
pub async fn tauri_compile_latex(
    project_id: String,
    files: Vec<ProjectFile>,
    entry: String,
    engine: Option<String>,
    synctex: Option<bool>,
    build_dir: Option<String>,
) -> Result<CompileResultPayload, String> {
    tauri::async_runtime::spawn_blocking(move || {
        tauri_compile_latex_internal(
            project_id,
            files,
            entry,
            engine,
            synctex,
            build_dir,
            None,
        )
    })
    .await
    .map_err(|e| format!("Compilation task join error: {}", e))?
}

pub fn tauri_compile_latex_internal(
    project_id: String,
    files: Vec<ProjectFile>,
    entry: String,
    engine: Option<String>,
    synctex: Option<bool>,
    build_dir: Option<String>,
    custom_resolver: Option<crate::package_resolver::PackageResolver>,
) -> Result<CompileResultPayload, String> {
    let start_time = Instant::now();

    // 1. Resolve build directory
    let target_dir = if let Some(custom_dir) = build_dir {
        PathBuf::from(custom_dir)
    } else {
        get_build_directory(&project_id)?
    };

    if !target_dir.exists() {
        std::fs::create_dir_all(&target_dir)
            .map_err(|e| format!("Failed to create build directory {}: {}", target_dir.display(), e))?;
    }

    // 2. Write project files into target directory
    for file in &files {
        let clean_path = normalize_path(&file.path)?;
        let file_path = target_dir.join(&clean_path);
        if let Some(parent) = file_path.parent() {
            if !parent.exists() {
                std::fs::create_dir_all(parent)
                    .map_err(|e| format!("Failed to create parent directory {}: {}", parent.display(), e))?;
            }
        }
        let bytes = extract_file_bytes_from_project_file(file)?;
        std::fs::write(&file_path, bytes)
            .map_err(|e| format!("Failed to write file {}: {}", file_path.display(), e))?;
    }

    let clean_entry = normalize_path(&entry)?;
    let entry_path = target_dir.join(&clean_entry);
    if !entry_path.exists() {
        return Err(format!("Entry file '{}' not found in build directory", clean_entry));
    }

    let stem = Path::new(&clean_entry)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("document");

    // 3. Determine engine flags
    let chosen_engine = engine.unwrap_or_else(|| "pdflatex".to_string()).to_lowercase();
    let engine_flag = match chosen_engine.as_str() {
        "xelatex" => "-xelatex",
        "lualatex" => "-lualatex",
        _ => "-pdf",
    };

    let synctex_flag = if synctex.unwrap_or(true) { "-synctex=1" } else { "-synctex=0" };

    // 4. Initialize package resolver and environment
    let mut resolver = custom_resolver.unwrap_or_else(crate::package_resolver::PackageResolver::new);
    let texmf_home = resolver.texmf_home().to_path_buf();
    let texinputs_val = format!(".:{}//:", texmf_home.join("tex").display());

    let mut all_installed_packages = Vec::new();
    let max_compilation_passes = 5;
    let mut pass = 0;

    struct PassOutcome {
        stdout_str: String,
        stderr_str: String,
        missing_files: Vec<String>,
        diagnostics: Vec<Diagnostic>,
        pdf_b64: Option<String>,
        synctex_b64: Option<String>,
        exit_success: bool,
    }

    let mut last_outcome: Option<PassOutcome>;

    // 5. Compilation loop with automated missing package resolution
    loop {
        pass += 1;

        let mut cmd = Command::new("latexmk");
        cmd.current_dir(&target_dir)
            .env("TEXMFHOME", texmf_home.to_string_lossy().to_string())
            .env("TEXINPUTS", &texinputs_val)
            .arg(engine_flag)
            .arg(synctex_flag)
            .arg("-interaction=nonstopmode")
            .arg("-file-line-error")
            .arg("-recorder")
            .arg("-g");

        cmd.arg(&clean_entry);

        let output_result = cmd.output();

        let (stdout_str, stderr_str, exit_success) = match output_result {
            Ok(output) => {
                let out = String::from_utf8_lossy(&output.stdout).to_string();
                let err = String::from_utf8_lossy(&output.stderr).to_string();
                (out, err, output.status.success())
            }
            Err(e) => {
                return Ok(CompileResultPayload {
                    status: "failed".to_string(),
                    pdf: None,
                    synctex: None,
                    diagnostics: vec![Diagnostic {
                        severity: "error".to_string(),
                        file: Some(clean_entry.clone()),
                        line: None,
                        message: format!("Failed to spawn latexmk: {}. Is TeX Live installed?", e),
                    }],
                    missing_files: Vec::new(),
                    resolved_packages: all_installed_packages,
                    duration_ms: start_time.elapsed().as_millis() as u64,
                    stdout: String::new(),
                    stderr: e.to_string(),
                });
            }
        };

        let log_file_path = target_dir.join(format!("{}.log", stem));
        let log_content = if log_file_path.exists() {
            std::fs::read_to_string(&log_file_path).unwrap_or_default()
        } else {
            String::new()
        };

        let missing_files = extract_missing_files_from_log(&log_content, &stdout_str);
        let diagnostics = parse_diagnostics_from_log(&log_content, &stdout_str, &clean_entry);

        let pdf_file_path = target_dir.join(format!("{}.pdf", stem));
        let pdf_b64 = if pdf_file_path.exists() {
            std::fs::read(&pdf_file_path).ok().map(|b| base64_utils::encode(&b))
        } else {
            None
        };

        let synctex_file_path = target_dir.join(format!("{}.synctex.gz", stem));
        let synctex_b64 = if synctex_file_path.exists() {
            std::fs::read(&synctex_file_path).ok().map(|b| base64_utils::encode(&b))
        } else {
            None
        };

        let outcome = PassOutcome {
            stdout_str,
            stderr_str,
            missing_files: missing_files.clone(),
            diagnostics,
            pdf_b64,
            synctex_b64,
            exit_success,
        };

        let stop = (outcome.exit_success && outcome.pdf_b64.is_some())
            || missing_files.is_empty()
            || pass >= max_compilation_passes;

        last_outcome = Some(outcome);

        if stop {
            break;
        }

        // Attempt automated missing package resolution
        let newly_installed = resolver.resolve_all(&missing_files);
        if newly_installed.is_empty() {
            // No new packages could be resolved/installed; stop further attempts
            break;
        }

        // Clean out latexmk failure state file so the next pass executes fresh
        let fdb_path = target_dir.join(format!("{}.fdb_latexmk", stem));
        let _ = std::fs::remove_file(&fdb_path);

        all_installed_packages.extend(newly_installed);
        // Loop continues, re-running latexmk with newly installed packages in texmf
    }

    let outcome = last_outcome.unwrap_or_else(|| PassOutcome {
        stdout_str: String::new(),
        stderr_str: String::new(),
        missing_files: Vec::new(),
        diagnostics: Vec::new(),
        pdf_b64: None,
        synctex_b64: None,
        exit_success: false,
    });

    let mut diagnostics = outcome.diagnostics;
    let has_errors = diagnostics.iter().any(|d| d.severity == "error");
    let has_warnings = diagnostics.iter().any(|d| d.severity == "warning");

    let status = if !outcome.exit_success && outcome.pdf_b64.is_none() {
        if has_errors { "errors" } else { "failed" }
    } else if has_errors {
        "errors"
    } else if has_warnings {
        "warnings"
    } else {
        "spotless"
    };

    if !all_installed_packages.is_empty() {
        diagnostics.insert(0, Diagnostic {
            severity: "info".to_string(),
            file: Some(clean_entry),
            line: None,
            message: format!(
                "Automatically installed LaTeX packages: {}",
                all_installed_packages.join(", ")
            ),
        });
    }

    Ok(CompileResultPayload {
        status: status.to_string(),
        pdf: outcome.pdf_b64,
        synctex: outcome.synctex_b64,
        diagnostics,
        missing_files: outcome.missing_files,
        resolved_packages: all_installed_packages,
        duration_ms: start_time.elapsed().as_millis() as u64,
        stdout: outcome.stdout_str,
        stderr: outcome.stderr_str,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_missing_files_from_log() {
        let sample_log = r#"
This is pdfTeX, Version 3.141592653-2.6-1.40.25
(./error.tex
! LaTeX Error: File `nonexistentpackage123.sty' not found.

Type X to quit or <RETURN> to proceed,
Latexmk: Missing input file 'anotherpkg.sty' (or dependence on it)
! I can't find file `missingdoc.tex'.
"#;
        let missing = extract_missing_files_from_log(sample_log, "");
        assert_eq!(missing, vec![
            "nonexistentpackage123.sty".to_string(),
            "anotherpkg.sty".to_string(),
            "missingdoc.tex".to_string(),
        ]);
    }

    #[test]
    fn test_extract_missing_font_metric() {
        let sample_log = r#"
! Font \TU/lmr/m/n/10=ecrm1000 at 10.0pt not loadable: Metric (TFM) file not found.
"#;
        let missing = extract_missing_files_from_log(sample_log, "");
        assert_eq!(missing, vec!["ecrm1000.tfm".to_string()]);
    }

    #[test]
    fn test_parse_diagnostics_from_log() {
        let sample_log = r#"
./main.tex:4: Undefined control sequence.
l.4 \undefinedcmd
                 
LaTeX Warning: Reference `undefinedref' on page 1 undefined on input line 10.
! LaTeX Error: Environment nonexistent undefined.
"#;
        let diags = parse_diagnostics_from_log(sample_log, "", "main.tex");
        assert_eq!(diags.len(), 3);

        assert_eq!(diags[0].severity, "error");
        assert_eq!(diags[0].file, Some("main.tex".to_string()));
        assert_eq!(diags[0].line, Some(4));
        assert_eq!(diags[0].message, "Undefined control sequence.");

        assert_eq!(diags[1].severity, "warning");
        assert_eq!(diags[1].line, Some(10));

        assert_eq!(diags[2].severity, "error");
        assert_eq!(diags[2].message, "LaTeX Error: Environment nonexistent undefined.");
    }

    #[test]
    fn test_tauri_detect_texlive() {
        let result = tauri::async_runtime::block_on(tauri_detect_texlive()).expect("detection failed");
        // On systems where texlive is installed, check fields
        assert!(result.latexmk);
        assert!(result.pdflatex);
        assert!(result.available);
    }

    #[test]
    fn test_tauri_compile_latex_end_to_end() {
        let temp_dir = std::env::temp_dir().join(format!("torque-compile-test-{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        std::fs::create_dir_all(&temp_dir).unwrap();

        let doc_content = r#"\documentclass{article}
\begin{document}
Hello from Native TeX Live!
\end{document}
"#;
        let files = vec![
            ProjectFile {
                project_id: "test-compile-proj".to_string(),
                path: "main.tex".to_string(),
                content: serde_json::Value::String(doc_content.to_string()),
                is_binary: false,
                updated_at: 1000,
            }
        ];

        let res = tauri::async_runtime::block_on(tauri_compile_latex(
            "test-compile-proj".to_string(),
            files,
            "main.tex".to_string(),
            Some("pdflatex".to_string()),
            Some(true),
            Some(temp_dir.to_string_lossy().to_string()),
        )).expect("compilation failed");

        assert_eq!(res.status, "spotless");
        assert!(res.pdf.is_some());
        assert!(res.synctex.is_some());
        assert!(res.missing_files.is_empty());
        assert!(res.diagnostics.is_empty());

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_tauri_compile_latex_missing_package_and_errors() {
        let temp_dir = std::env::temp_dir().join(format!("torque-compile-err-test-{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        std::fs::create_dir_all(&temp_dir).unwrap();

        let doc_content = r#"\documentclass{article}
\usepackage{nonexistentfake123}
\begin{document}
\undefinedcmd
\end{document}
"#;
        let files = vec![
            ProjectFile {
                project_id: "test-err-proj".to_string(),
                path: "main.tex".to_string(),
                content: serde_json::Value::String(doc_content.to_string()),
                is_binary: false,
                updated_at: 1000,
            }
        ];

        let res = tauri::async_runtime::block_on(tauri_compile_latex(
            "test-err-proj".to_string(),
            files,
            "main.tex".to_string(),
            Some("pdflatex".to_string()),
            Some(true),
            Some(temp_dir.to_string_lossy().to_string()),
        )).expect("compilation execution failed");

        assert_eq!(res.status, "errors");
        assert!(res.missing_files.contains(&"nonexistentfake123.sty".to_string()));
        assert!(!res.diagnostics.is_empty());

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_tauri_compile_latex_auto_resolves_missing_package() {
        let temp_build_dir = std::env::temp_dir().join(format!("torque-autores-bld-{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        let temp_texmf_dir = std::env::temp_dir().join(format!("torque-autores-txmf-{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        std::fs::create_dir_all(&temp_build_dir).unwrap();
        std::fs::create_dir_all(&temp_texmf_dir).unwrap();

        let mock_downloader = crate::package_resolver::tests::MockDownloader::new();
        let target_url = "https://mirrors.ctan.org/macros/latex/contrib/autoresolvedpkg/autoresolvedpkg.sty";
        let sty_content = b"\\ProvidesPackage{autoresolvedpkg}[2026/11/04 v1.0]\\newcommand{\\autoreply}{Auto Resolution Success!}\\endinput\n";
        mock_downloader.add_response(target_url, sty_content);

        let resolver = crate::package_resolver::PackageResolver::with_texmf_and_downloader(
            temp_texmf_dir.clone(),
            Box::new(mock_downloader),
        );

        let doc_content = r#"\documentclass{article}
\usepackage{autoresolvedpkg}
\begin{document}
Testing dynamic package fetching: \autoreply
\end{document}
"#;
        let files = vec![
            ProjectFile {
                project_id: "test-autores-proj".to_string(),
                path: "main.tex".to_string(),
                content: serde_json::Value::String(doc_content.to_string()),
                is_binary: false,
                updated_at: 1000,
            }
        ];

        let res = tauri_compile_latex_internal(
            "test-autores-proj".to_string(),
            files,
            "main.tex".to_string(),
            Some("pdflatex".to_string()),
            Some(true),
            Some(temp_build_dir.to_string_lossy().to_string()),
            Some(resolver),
        ).expect("compilation with auto-resolution failed");

        assert_eq!(res.status, "spotless");
        assert!(res.pdf.is_some());
        assert!(res.synctex.is_some());
        assert_eq!(res.resolved_packages, vec!["autoresolvedpkg".to_string()]);
        assert!(temp_texmf_dir.join("tex").join("latex").join("autoresolvedpkg").join("autoresolvedpkg.sty").exists());

        let _ = std::fs::remove_dir_all(&temp_build_dir);
        let _ = std::fs::remove_dir_all(&temp_texmf_dir);
    }
}
