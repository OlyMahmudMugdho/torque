use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

/// Trait abstracting file downloading for testability and offline/mock execution.
pub trait Downloader: Send + Sync {
    fn download_file(&self, url: &str, dest: &Path) -> Result<(), String>;
}

/// Production curl-based downloader following redirects with timeouts.
pub struct CurlDownloader {
    pub timeout_seconds: u32,
}

impl Default for CurlDownloader {
    fn default() -> Self {
        Self {
            timeout_seconds: 30,
        }
    }
}

impl Downloader for CurlDownloader {
    fn download_file(&self, url: &str, dest: &Path) -> Result<(), String> {
        let status = Command::new("curl")
            .arg("-f") // Fail on HTTP error codes (4xx, 5xx)
            .arg("-s") // Silent
            .arg("-S") // Show error message if fails
            .arg("-L") // Follow redirects (CTAN mirrors redirect extensively)
            .arg("--connect-timeout")
            .arg("10")
            .arg("--max-time")
            .arg(self.timeout_seconds.to_string())
            .arg("-o")
            .arg(dest)
            .arg(url)
            .output();

        match status {
            Ok(output) => {
                if output.status.success() {
                    if let Ok(meta) = std::fs::metadata(dest) {
                        if meta.len() == 0 {
                            let _ = std::fs::remove_file(dest);
                            return Err(format!("Downloaded file from {} was empty (0 bytes)", url));
                        }
                    }
                    if is_html_error_file(dest) {
                        let _ = std::fs::remove_file(dest);
                        return Err(format!(
                            "Downloaded file from {} appears to be an HTML error page",
                            url
                        ));
                    }
                    Ok(())
                } else {
                    let err = String::from_utf8_lossy(&output.stderr);
                    let _ = std::fs::remove_file(dest);
                    Err(format!("curl error downloading {}: {}", url, err.trim()))
                }
            }
            Err(e) => Err(format!("Failed to execute curl: {}", e)),
        }
    }
}

/// Validates whether a file is an HTML error / captive portal page rather than TeX asset.
pub fn is_html_error_file(path: &Path) -> bool {
    if let Ok(bytes) = std::fs::read(path) {
        // Zip archives begin with PK\x03\x04
        if bytes.len() >= 4 && &bytes[0..4] == b"PK\x03\x04" {
            return false;
        }
        let sample_len = bytes.len().min(512);
        let sample = String::from_utf8_lossy(&bytes[..sample_len]).to_lowercase();
        sample.contains("<!doctype") || sample.contains("<html") || sample.contains("<head")
    } else {
        false
    }
}

/// Recursively copies directory tree from `src` to `dst`.
pub fn copy_dir_all(src: &Path, dst: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        let dest_child = dst.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_all(&entry.path(), &dest_child)?;
        } else {
            std::fs::copy(entry.path(), &dest_child)?;
        }
    }
    Ok(())
}

/// Infers candidate package names for a missing file (e.g., `tcolorbox.sty` -> `tcolorbox`).
pub fn infer_package_candidates(filename: &str) -> Vec<String> {
    let clean = filename.trim();
    if clean.is_empty() {
        return Vec::new();
    }

    let mut candidates = Vec::new();
    let lower = clean.to_lowercase();

    // 1. Check known explicit mappings
    match lower.as_str() {
        // PGF / TikZ
        "tikz.sty" | "pgf.sty" | "pgfcore.sty" | "pgfmath.sty" | "pgfsys.sty" => {
            candidates.push("pgf".to_string());
        }
        // Fontawesome
        "fontawesome5.sty" | "fontawesome5-utex-helper.sty" => {
            candidates.push("fontawesome5".to_string());
            candidates.push("fontawesome".to_string());
        }
        // Algorithms
        "algorithm2e.sty" => {
            candidates.push("algorithm2e".to_string());
        }
        "algorithmicx.sty" | "algpseudocode.sty" | "algcompatible.sty" | "algpascal.sty" | "algc.sty" => {
            candidates.push("algorithmicx".to_string());
        }
        "algorithmic.sty" => {
            candidates.push("algorithms".to_string());
            candidates.push("algorithmicx".to_string());
        }
        // Beamer Themes
        "beamerthememetropolis.sty" => {
            candidates.push("beamertheme-metropolis".to_string());
            candidates.push("moloch".to_string());
            candidates.push("beamer".to_string());
        }
        "beamerthememoloch.sty" => {
            candidates.push("moloch".to_string());
            candidates.push("beamer".to_string());
        }
        // Standard Math
        "mathtools.sty" => {
            candidates.push("mathtools".to_string());
        }
        // Font metric mappings (e.g. ecrm1000.tfm -> ec)
        f if f.ends_with(".tfm") && (f.starts_with("ec") || f.starts_with("tc")) => {
            candidates.push("ec".to_string());
        }
        f if f.ends_with(".tfm") && f.starts_with("lm") => {
            candidates.push("lm".to_string());
        }
        _ => {}
    }

    // 2. Strip standard extensions
    let extensions = [
        ".code.tex", ".sty", ".cls", ".def", ".fd", ".tfm", ".pfb", ".otf", ".ttf",
        ".cfg", ".lua", ".bbx", ".cbx", ".lbx", ".tex",
    ];

    let mut stem = lower.clone();
    for ext in extensions {
        if stem.ends_with(ext) {
            stem = stem[..stem.len() - ext.len()].to_string();
            break;
        }
    }

    if !stem.is_empty() {
        if !candidates.contains(&stem) {
            candidates.push(stem.clone());
        }
        // If name has underscores, also try hyphenated variant
        if stem.contains('_') {
            let hyphenated = stem.replace('_', "-");
            if !candidates.contains(&hyphenated) {
                candidates.push(hyphenated);
            }
        }
    }

    candidates
}

/// Generates priority CTAN download URLs for a given package name and filename.
pub fn get_candidate_download_urls(pkg: &str, filename: &str) -> Vec<String> {
    let clean_pkg = pkg.trim().to_lowercase();
    let clean_file = filename.trim();

    vec![
        // Priority 1: TDS zips (pre-built, unpacks directly into texmf)
        format!("https://mirrors.ctan.org/install/macros/latex/contrib/{}.tds.zip", clean_pkg),
        format!("https://mirrors.ctan.org/install/macros/latex/required/{}.tds.zip", clean_pkg),
        format!("https://mirrors.ctan.org/install/fonts/{}.tds.zip", clean_pkg),
        format!("https://mirrors.ctan.org/install/graphics/{}.tds.zip", clean_pkg),
        format!("https://ctan.org/tex-archive/install/macros/latex/contrib/{}.tds.zip", clean_pkg),
        // Priority 2: Standard CTAN package archives
        format!("https://mirrors.ctan.org/macros/latex/contrib/{}.zip", clean_pkg),
        format!("https://mirrors.ctan.org/fonts/{}.zip", clean_pkg),
        format!("https://mirrors.ctan.org/graphics/{}.zip", clean_pkg),
        format!("https://ctan.org/tex-archive/macros/latex/contrib/{}.zip", clean_pkg),
        // Priority 3: Raw package / definition file
        format!("https://mirrors.ctan.org/macros/latex/contrib/{}/{}", clean_pkg, clean_file),
        format!("https://mirrors.ctan.org/macros/latex/required/{}/{}", clean_pkg, clean_file),
        format!("https://mirrors.ctan.org/fonts/{}/{}", clean_pkg, clean_file),
        format!("https://ctan.org/tex-archive/macros/latex/contrib/{}/{}", clean_pkg, clean_file),
    ]
}

/// Resolves user's `TEXMFHOME` directory.
/// Checks `TORQUE_TEXMF_DIR`, `kpsewhich -var-value TEXMFHOME`, or falls back to `~/.torque/texmf`.
pub fn get_texmf_home() -> PathBuf {
    if let Ok(custom) = std::env::var("TORQUE_TEXMF_DIR") {
        let p = PathBuf::from(custom);
        let _ = std::fs::create_dir_all(&p);
        return p;
    }

    if let Ok(output) = Command::new("kpsewhich")
        .arg("-var-value")
        .arg("TEXMFHOME")
        .output()
    {
        if output.status.success() {
            let out_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !out_str.is_empty() {
                let resolved = if out_str.starts_with('~') {
                    if let Ok(home) = std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE")) {
                        PathBuf::from(home).join(out_str.trim_start_matches("~/").trim_start_matches('~'))
                    } else {
                        PathBuf::from(&out_str)
                    }
                } else {
                    PathBuf::from(&out_str)
                };

                let _ = std::fs::create_dir_all(&resolved);
                return resolved;
            }
        }
    }

    if let Ok(torque_dir) = crate::storage::get_torque_base_dir() {
        let texmf = torque_dir.join("texmf");
        let _ = std::fs::create_dir_all(&texmf);
        return texmf;
    }

    PathBuf::from("./texmf")
}

/// Unpacks an archive (`.tds.zip` or `.zip`) and copies TeX files to `texmf_home`.
pub fn install_package_archive(
    archive_path: &Path,
    pkg_name: &str,
    texmf_home: &Path,
) -> Result<Vec<PathBuf>, String> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let staging_dir = std::env::temp_dir().join(format!("torque_staging_{}_{}", pkg_name, now));
    std::fs::create_dir_all(&staging_dir)
        .map_err(|e| format!("Failed to create staging dir {}: {}", staging_dir.display(), e))?;

    let unzip_out = Command::new("unzip")
        .arg("-q")
        .arg("-o")
        .arg(archive_path)
        .arg("-d")
        .arg(&staging_dir)
        .output()
        .map_err(|e| format!("Failed to execute unzip: {}", e))?;

    if !unzip_out.status.success() {
        let _ = std::fs::remove_dir_all(&staging_dir);
        let err = String::from_utf8_lossy(&unzip_out.stderr);
        return Err(format!("Unzip failed: {}", err.trim()));
    }

    let mut installed_files = Vec::new();

    // Check if archive follows TDS structure (top-level tex/ or fonts/ or inside a single dir)
    let has_top_tds = staging_dir.join("tex").exists() || staging_dir.join("fonts").exists();

    if has_top_tds {
        // TDS structure: copy all directories into texmf_home
        copy_dir_all(&staging_dir, texmf_home)
            .map_err(|e| format!("Failed to copy TDS directory to texmf_home: {}", e))?;
        installed_files.push(texmf_home.join("tex"));
    } else {
        // Check if there is an inner directory that contains TDS structure
        let mut inner_tds = None;
        if let Ok(entries) = std::fs::read_dir(&staging_dir) {
            for entry in entries.flatten() {
                if let Ok(ty) = entry.file_type() {
                    if ty.is_dir() {
                        let p = entry.path();
                        if p.join("tex").exists() || p.join("fonts").exists() {
                            inner_tds = Some(p);
                            break;
                        }
                    }
                }
            }
        }

        if let Some(tds_dir) = inner_tds {
            copy_dir_all(&tds_dir, texmf_home)
                .map_err(|e| format!("Failed to copy nested TDS directory to texmf_home: {}", e))?;
            installed_files.push(texmf_home.join("tex"));
        } else {
            // Flat / regular CTAN zip: place files into texmf_home/tex/latex/<pkg_name>/
            let target_pkg_dir = texmf_home.join("tex").join("latex").join(pkg_name);
            std::fs::create_dir_all(&target_pkg_dir)
                .map_err(|e| format!("Failed to create target package dir: {}", e))?;

            // If .ins file exists and no .sty, attempt docstrip generation via latex
            let mut ins_files = Vec::new();
            let mut sty_count = 0;
            collect_package_files(&staging_dir, &mut ins_files, &mut sty_count);

            if sty_count == 0 && !ins_files.is_empty() {
                for ins in &ins_files {
                    if let Some(parent) = ins.parent() {
                        let _ = Command::new("latex")
                            .arg("-interaction=nonstopmode")
                            .arg(ins.file_name().unwrap_or_default())
                            .current_dir(parent)
                            .output();
                    }
                }
            }

            // Copy all TeX assets (.sty, .cls, .def, .fd, .tfm, .pfb, etc.)
            copy_tex_assets(&staging_dir, &target_pkg_dir, &mut installed_files)?;
        }
    }

    let _ = std::fs::remove_dir_all(&staging_dir);
    Ok(installed_files)
}

fn collect_package_files(dir: &Path, ins_files: &mut Vec<PathBuf>, sty_count: &mut usize) {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                collect_package_files(&path, ins_files, sty_count);
            } else if let Some(ext) = path.extension().and_then(|s| s.to_str()) {
                if ext.eq_ignore_ascii_case("ins") {
                    ins_files.push(path);
                } else if ext.eq_ignore_ascii_case("sty") {
                    *sty_count += 1;
                }
            }
        }
    }
}

fn copy_tex_assets(
    src_dir: &Path,
    target_dir: &Path,
    installed: &mut Vec<PathBuf>,
) -> Result<(), String> {
    const TEX_EXTENSIONS: &[&str] = &[
        "sty", "cls", "def", "fd", "cfg", "lua", "tfm", "pfb", "otf", "ttf",
        "bbx", "cbx", "lbx", "tex",
    ];

    if let Ok(entries) = std::fs::read_dir(src_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                copy_tex_assets(&path, target_dir, installed)?;
            } else if let Some(ext) = path.extension().and_then(|s| s.to_str()) {
                if TEX_EXTENSIONS.iter().any(|&e| e.eq_ignore_ascii_case(ext)) {
                    if let Some(file_name) = path.file_name() {
                        let dest = target_dir.join(file_name);
                        if std::fs::copy(&path, &dest).is_ok() {
                            installed.push(dest);
                        }
                    }
                }
            }
        }
    }
    Ok(())
}

/// Installs a single raw file into `texmf_home/tex/latex/<pkg_name>/<filename>`.
pub fn install_raw_file(
    src_path: &Path,
    filename: &str,
    pkg_name: &str,
    texmf_home: &Path,
) -> Result<PathBuf, String> {
    let target_dir = texmf_home.join("tex").join("latex").join(pkg_name);
    std::fs::create_dir_all(&target_dir)
        .map_err(|e| format!("Failed to create target dir {}: {}", target_dir.display(), e))?;

    let dest = target_dir.join(filename);
    std::fs::copy(src_path, &dest)
        .map_err(|e| format!("Failed to copy {} to {}: {}", src_path.display(), dest.display(), e))?;

    Ok(dest)
}

/// Refreshes kpathsea ls-R database by invoking `texhash` or `mktexlsr`.
pub fn refresh_kpathsea_database(texmf_home: &Path) -> Result<(), String> {
    // 1. Try texhash with target path
    if let Ok(output) = Command::new("texhash").arg(texmf_home).output() {
        if output.status.success() {
            return Ok(());
        }
    }

    // 2. Try mktexlsr with target path
    if let Ok(output) = Command::new("mktexlsr").arg(texmf_home).output() {
        if output.status.success() {
            return Ok(());
        }
    }

    // 3. Fall back to generic texhash
    if let Ok(output) = Command::new("texhash").output() {
        if output.status.success() {
            return Ok(());
        }
    }

    // 4. Fall back to generic mktexlsr
    if let Ok(output) = Command::new("mktexlsr").output() {
        if output.status.success() {
            return Ok(());
        }
    }

    Ok(())
}

/// Package Resolver coordinating missing file detection, mirror downloads,
/// unpacking into `texmf`, and loop prevention.
pub struct PackageResolver {
    texmf_home: PathBuf,
    downloader: Box<dyn Downloader>,
    attempted_packages: HashSet<String>,
    installed_packages: Vec<String>,
    max_attempts: usize,
}

impl Default for PackageResolver {
    fn default() -> Self {
        Self::new()
    }
}

impl PackageResolver {
    pub fn new() -> Self {
        Self::with_texmf_and_downloader(get_texmf_home(), Box::new(CurlDownloader::default()))
    }

    pub fn with_texmf_and_downloader(texmf_home: PathBuf, downloader: Box<dyn Downloader>) -> Self {
        Self {
            texmf_home,
            downloader,
            attempted_packages: HashSet::new(),
            installed_packages: Vec::new(),
            max_attempts: 5,
        }
    }

    pub fn texmf_home(&self) -> &Path {
        &self.texmf_home
    }

    pub fn installed_packages(&self) -> &[String] {
        &self.installed_packages
    }

    pub fn attempted_packages(&self) -> &HashSet<String> {
        &self.attempted_packages
    }

    /// Attempts to resolve a single missing filename.
    /// Returns `Ok(Some(package_name))` on success, or `Ok(None)` if unresolvable / already attempted.
    pub fn resolve_missing_file(&mut self, filename: &str) -> Result<Option<String>, String> {
        if self.attempted_packages.len() >= self.max_attempts {
            return Ok(None);
        }

        let candidates = infer_package_candidates(filename);
        let unattempted: Vec<String> = candidates
            .into_iter()
            .filter(|c| !self.attempted_packages.contains(c))
            .collect();

        if unattempted.is_empty() {
            return Ok(None);
        }

        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);

        for pkg in unattempted {
            if self.attempted_packages.len() >= self.max_attempts {
                break;
            }

            self.attempted_packages.insert(pkg.clone());

            let urls = get_candidate_download_urls(&pkg, filename);
            for url in urls {
                let temp_ext = if url.ends_with(".zip") { "zip" } else { "tmp" };
                let temp_dest = std::env::temp_dir().join(format!("torque_pkg_{}_{}.{}", pkg, now, temp_ext));

                if self.downloader.download_file(&url, &temp_dest).is_ok() {
                    let install_result = if url.ends_with(".zip") || is_zip_file(&temp_dest) {
                        install_package_archive(&temp_dest, &pkg, &self.texmf_home)
                            .map(|_| ())
                    } else {
                        install_raw_file(&temp_dest, filename, &pkg, &self.texmf_home)
                            .map(|_| ())
                    };

                    let _ = std::fs::remove_file(&temp_dest);

                    if install_result.is_ok() {
                        let _ = refresh_kpathsea_database(&self.texmf_home);
                        self.installed_packages.push(pkg.clone());
                        return Ok(Some(pkg));
                    }
                }
            }
        }

        Ok(None)
    }

    /// Resolves all missing files, respecting deduplication and the 5-attempt limit.
    pub fn resolve_all(&mut self, missing_files: &[String]) -> Vec<String> {
        let mut newly_installed = Vec::new();

        for file in missing_files {
            if self.attempted_packages.len() >= self.max_attempts {
                break;
            }

            match self.resolve_missing_file(file) {
                Ok(Some(pkg)) => {
                    newly_installed.push(pkg);
                }
                Ok(None) => {}
                Err(e) => {
                    log::warn!("Error resolving {}: {}", file, e);
                }
            }
        }

        newly_installed
    }
}

fn is_zip_file(path: &Path) -> bool {
    if let Ok(bytes) = std::fs::read(path) {
        bytes.len() >= 4 && &bytes[0..4] == b"PK\x03\x04"
    } else {
        false
    }
}

/// Tauri command to manually or proactively resolve a list of missing package files.
#[tauri::command]
pub async fn tauri_resolve_missing_packages(missing_files: Vec<String>) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut resolver = PackageResolver::new();
        let installed = resolver.resolve_all(&missing_files);
        Ok(installed)
    })
    .await
    .map_err(|e| format!("Package resolution task join error: {}", e))?
}

#[cfg(test)]
pub mod tests {
    use super::*;
    use std::collections::HashMap;
    use std::sync::Mutex;

    /// Mock downloader for offline unit testing without network access.
    pub struct MockDownloader {
        pub responses: Mutex<HashMap<String, Vec<u8>>>,
    }

    impl MockDownloader {
        pub fn new() -> Self {
            Self {
                responses: Mutex::new(HashMap::new()),
            }
        }

        pub fn add_response(&self, url: &str, content: &[u8]) {
            self.responses
                .lock()
                .unwrap()
                .insert(url.to_string(), content.to_vec());
        }
    }

    impl Downloader for MockDownloader {
        fn download_file(&self, url: &str, dest: &Path) -> Result<(), String> {
            let lock = self.responses.lock().unwrap();
            if let Some(bytes) = lock.get(url) {
                if bytes.is_empty() {
                    return Err("Empty response".to_string());
                }
                std::fs::write(dest, bytes)
                    .map_err(|e| format!("Failed to write mock file: {}", e))?;
                Ok(())
            } else {
                Err(format!("404 Not Found in mock: {}", url))
            }
        }
    }

    #[test]
    fn test_infer_package_candidates() {
        assert_eq!(infer_package_candidates("tcolorbox.sty"), vec!["tcolorbox"]);
        assert_eq!(
            infer_package_candidates("fontawesome5.sty"),
            vec!["fontawesome5", "fontawesome"]
        );
        assert_eq!(infer_package_candidates("tikz.sty"), vec!["pgf", "tikz"]);
        assert_eq!(infer_package_candidates("pgf.sty"), vec!["pgf"]);
        assert_eq!(infer_package_candidates("sourcecodepro.sty"), vec!["sourcecodepro"]);
        assert_eq!(infer_package_candidates("ecrm1000.tfm"), vec!["ec", "ecrm1000"]);
        assert_eq!(
            infer_package_candidates("beamerthememetropolis.sty"),
            vec!["beamertheme-metropolis", "moloch", "beamer", "beamerthememetropolis"]
        );
        assert_eq!(
            infer_package_candidates("foo_bar.sty"),
            vec!["foo_bar", "foo-bar"]
        );
    }

    #[test]
    fn test_get_candidate_download_urls() {
        let urls = get_candidate_download_urls("tcolorbox", "tcolorbox.sty");
        assert!(urls.iter().any(|u| u.contains("tcolorbox.tds.zip")));
        assert!(urls.iter().any(|u| u.contains("tcolorbox.zip")));
        assert!(urls.iter().any(|u| u.contains("tcolorbox/tcolorbox.sty")));
    }

    #[test]
    fn test_is_html_error_file() {
        let temp_dir = std::env::temp_dir().join(format!("html_test_{}", std::time::SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()));
        std::fs::create_dir_all(&temp_dir).unwrap();

        let html_file = temp_dir.join("error.html");
        std::fs::write(&html_file, b"<!DOCTYPE html><html><body>404 Not Found</body></html>").unwrap();
        assert!(is_html_error_file(&html_file));

        let valid_tex = temp_dir.join("valid.sty");
        std::fs::write(&valid_tex, b"\\ProvidesPackage{valid}[2026/11/04]\n").unwrap();
        assert!(!is_html_error_file(&valid_tex));

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_install_raw_file() {
        let temp_dir = std::env::temp_dir().join(format!("texmf_raw_{}", std::time::SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()));
        std::fs::create_dir_all(&temp_dir).unwrap();

        let src_file = temp_dir.join("custompkg.sty");
        std::fs::write(&src_file, b"\\ProvidesPackage{custompkg}[2026/11/04]\n").unwrap();

        let texmf = temp_dir.join("texmf");
        let installed = install_raw_file(&src_file, "custompkg.sty", "custompkg", &texmf).unwrap();

        assert!(installed.exists());
        assert_eq!(
            installed,
            texmf.join("tex").join("latex").join("custompkg").join("custompkg.sty")
        );

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_install_package_archive_tds() {
        let temp_dir = std::env::temp_dir().join(format!("tds_archive_test_{}", std::time::SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()));
        std::fs::create_dir_all(&temp_dir).unwrap();

        // Create staging to build a mock TDS zip
        let zip_source = temp_dir.join("zip_source");
        let tex_latex_dir = zip_source.join("tex").join("latex").join("mocktds");
        std::fs::create_dir_all(&tex_latex_dir).unwrap();
        std::fs::write(tex_latex_dir.join("mocktds.sty"), b"\\ProvidesPackage{mocktds}\n").unwrap();

        let archive_path = temp_dir.join("mocktds.tds.zip");
        let zip_out = Command::new("zip")
            .arg("-r")
            .arg(&archive_path)
            .arg(".")
            .current_dir(&zip_source)
            .output()
            .expect("zip command failed");
        assert!(zip_out.status.success());

        let texmf = temp_dir.join("target_texmf");
        let installed = install_package_archive(&archive_path, "mocktds", &texmf).unwrap();
        assert!(!installed.is_empty());
        assert!(texmf.join("tex").join("latex").join("mocktds").join("mocktds.sty").exists());

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_install_package_archive_flat() {
        let temp_dir = std::env::temp_dir().join(format!("flat_archive_test_{}", std::time::SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()));
        std::fs::create_dir_all(&temp_dir).unwrap();

        let zip_source = temp_dir.join("zip_source");
        std::fs::create_dir_all(&zip_source).unwrap();
        std::fs::write(zip_source.join("mockflat.sty"), b"\\ProvidesPackage{mockflat}\n").unwrap();
        std::fs::write(zip_source.join("mockflat.cls"), b"\\ProvidesClass{mockflat}\n").unwrap();

        let archive_path = temp_dir.join("mockflat.zip");
        let zip_out = Command::new("zip")
            .arg("-r")
            .arg(&archive_path)
            .arg(".")
            .current_dir(&zip_source)
            .output()
            .expect("zip command failed");
        assert!(zip_out.status.success());

        let texmf = temp_dir.join("target_texmf");
        let installed = install_package_archive(&archive_path, "mockflat", &texmf).unwrap();
        assert_eq!(installed.len(), 2);
        assert!(texmf.join("tex").join("latex").join("mockflat").join("mockflat.sty").exists());
        assert!(texmf.join("tex").join("latex").join("mockflat").join("mockflat.cls").exists());

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_mock_resolver_loop_prevention_and_max_attempts() {
        let temp_dir = std::env::temp_dir().join(format!("loop_test_{}", std::time::SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()));
        std::fs::create_dir_all(&temp_dir).unwrap();

        let mock_downloader = Box::new(MockDownloader::new());
        let mut resolver = PackageResolver::with_texmf_and_downloader(temp_dir.clone(), mock_downloader);

        // Attempt resolving a package that doesn't exist in mock downloader
        let installed = resolver.resolve_all(&["missing1.sty".to_string()]);
        assert!(installed.is_empty());
        assert!(resolver.attempted_packages().contains("missing1"));

        // Re-attempting same missing file must NOT make another network attempt (loop prevention)
        let installed2 = resolver.resolve_all(&["missing1.sty".to_string()]);
        assert!(installed2.is_empty());

        // Fill up to max 5 attempts
        resolver.resolve_all(&[
            "missing2.sty".to_string(),
            "missing3.sty".to_string(),
            "missing4.sty".to_string(),
            "missing5.sty".to_string(),
            "missing6.sty".to_string(),
            "missing7.sty".to_string(),
        ]);

        assert_eq!(resolver.attempted_packages().len(), 5);

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_mock_resolver_e2e_successful_resolution() {
        let temp_dir = std::env::temp_dir().join(format!("e2e_res_test_{}", std::time::SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()));
        std::fs::create_dir_all(&temp_dir).unwrap();

        let mock = MockDownloader::new();
        let target_url = "https://mirrors.ctan.org/macros/latex/contrib/awesomepkg/awesomepkg.sty";
        let sty_content = b"\\ProvidesPackage{awesomepkg}[2026/11/04 v1.0]\n\\newcommand{\\awesome}{Torque}\n";
        mock.add_response(target_url, sty_content);

        let mut resolver = PackageResolver::with_texmf_and_downloader(temp_dir.clone(), Box::new(mock));
        let installed = resolver.resolve_all(&["awesomepkg.sty".to_string()]);

        assert_eq!(installed, vec!["awesomepkg".to_string()]);
        assert_eq!(resolver.installed_packages(), &["awesomepkg".to_string()]);
        assert!(temp_dir
            .join("tex")
            .join("latex")
            .join("awesomepkg")
            .join("awesomepkg.sty")
            .exists());

        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
