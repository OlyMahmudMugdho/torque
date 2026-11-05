use std::path::PathBuf;

/// Returns the path to `~/.torque/ai_config.json`.
pub fn get_ai_config_path() -> Result<PathBuf, String> {
    Ok(crate::storage::get_torque_base_dir()?.join("ai_config.json"))
}

/// Reads `~/.torque/ai_config.json`. Returns an error if missing or on read failure.
#[tauri::command]
pub fn tauri_get_ai_config() -> Result<String, String> {
    let path = get_ai_config_path()?;
    if !path.exists() {
        return Err(format!("AI config file does not exist at {}", path.display()));
    }
    std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read AI config from {}: {}", path.display(), e))
}

/// Validates JSON with `serde_json::from_str::<serde_json::Value>(&config_json)`
/// and writes formatted JSON to `~/.torque/ai_config.json`.
#[tauri::command]
pub fn tauri_save_ai_config(config_json: String) -> Result<(), String> {
    let path = get_ai_config_path()?;
    let value: serde_json::Value = serde_json::from_str(&config_json)
        .map_err(|e| format!("Invalid JSON config: {}", e))?;
    let formatted = serde_json::to_string_pretty(&value)
        .map_err(|e| format!("Failed to format JSON config: {}", e))?;

    if let Some(parent) = path.parent() {
        if !parent.exists() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create directory {}: {}", parent.display(), e))?;
        }
    }

    std::fs::write(&path, formatted)
        .map_err(|e| format!("Failed to write AI config to {}: {}", path.display(), e))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    static TEST_MUTEX: Mutex<()> = Mutex::new(());

    #[test]
    fn test_ai_config_save_and_load_flow() {
        let _lock = TEST_MUTEX.lock().unwrap();
        let temp_dir = std::env::temp_dir().join(format!(
            "torque-ai-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&temp_dir).unwrap();
        let orig_home = std::env::var("HOME").ok();

        unsafe {
            std::env::set_var("HOME", &temp_dir);
        }

        // 1. Should fail when missing
        let initial_get = tauri_get_ai_config();
        assert!(initial_get.is_err());

        // 2. Save valid config
        let sample_json = r#"{
            "activeProviderId": "openai-default",
            "providers": [
                {
                    "id": "openai-default",
                    "name": "OpenAI",
                    "baseUrl": "https://api.openai.com/v1",
                    "apiKey": "sk-test-key",
                    "selectedModel": "gpt-4o",
                    "availableModels": ["gpt-4o"]
                }
            ]
        }"#;

        let save_res = tauri_save_ai_config(sample_json.to_string());
        assert!(save_res.is_ok(), "Save failed: {:?}", save_res);

        // 3. Load config and verify contents
        let loaded = tauri_get_ai_config().expect("Failed to get config after save");
        let parsed: serde_json::Value = serde_json::from_str(&loaded).unwrap();
        assert_eq!(parsed["activeProviderId"], "openai-default");
        assert_eq!(parsed["providers"][0]["apiKey"], "sk-test-key");

        // 4. Saving invalid JSON should fail
        let invalid_res = tauri_save_ai_config("not valid json".to_string());
        assert!(invalid_res.is_err());

        // Clean up
        if let Some(h) = orig_home {
            unsafe {
                std::env::set_var("HOME", h);
            }
        }
        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
