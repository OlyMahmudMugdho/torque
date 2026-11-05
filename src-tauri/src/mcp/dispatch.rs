//! JSON-RPC 2.0 dispatcher for MCP tools and protocol methods.

use serde_json::{json, Value};

use super::{McpState, MCP_PROTOCOL_VERSION, SERVER_NAME, SERVER_VERSION};
use super::catalog::get_tools_catalog;
use super::projects::{
    handle_tool_create_project, handle_tool_get_active_project, handle_tool_list_projects,
};
use super::files::{handle_tool_edit_file, handle_tool_read_file, handle_tool_write_file};
use super::compiler::{handle_tool_compile, handle_tool_get_diagnostics};

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
                "torque_create_project" => handle_tool_create_project(state, &tool_args),
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
        "torque_create_project" => {
            let args = req.get("params").cloned().unwrap_or_else(|| json!({}));
            match handle_tool_create_project(state, &args) {
                Ok(val) => Some(json!({ "jsonrpc": "2.0", "id": id, "result": val }).to_string()),
                Err((code, msg)) => Some(json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": msg } }).to_string()),
            }
        }
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
