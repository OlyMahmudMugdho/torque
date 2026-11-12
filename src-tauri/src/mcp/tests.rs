//! MCP server tests covering protocol handshakes, tools, parameter aliasing, and HTTP/SSE endpoints.

use super::*;
use serde_json::{json, Value};
use super::http::run_server_on_listener;
use std::fs;
use std::path::{Path, PathBuf};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};

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
    assert_eq!(tools.len(), 10);

    let names: Vec<&str> = tools.iter().map(|t| t["name"].as_str().unwrap()).collect();
    assert!(names.contains(&"torque_create_project"));
    assert!(names.contains(&"torque_list_projects"));
    assert!(names.contains(&"torque_get_active_project"));
    assert!(names.contains(&"torque_read_file"));
    assert!(names.contains(&"torque_write_file"));
    assert!(names.contains(&"torque_edit_file"));
    assert!(names.contains(&"torque_compile"));
    assert!(names.contains(&"torque_get_diagnostics"));
    assert!(names.contains(&"torque_search_academic"));
    assert!(names.contains(&"torque_search_web"));
}

#[test]
fn test_torque_create_project_tool() {
    let temp_dir = std::env::temp_dir().join("torque_mcp_test_create_proj");
    let _ = fs::remove_dir_all(&temp_dir);
    fs::create_dir_all(&temp_dir).unwrap();

    let state = McpState::new_with_dir(temp_dir.clone());

    // 1. Create project with custom content and root entry
    let req = json!({
        "jsonrpc": "2.0",
        "id": "cp-1",
        "method": "tools/call",
        "params": {
            "name": "torque_create_project",
            "arguments": {
                "name": "Quantum Paper",
                "rootEntry": "paper.tex",
                "content": "\\documentclass{article}\n\\begin{document}\nQuantum Superposition\n\\end{document}"
            }
        }
    });

    let resp_str = dispatch_jsonrpc_request(&state, &req.to_string()).unwrap();
    let resp: Value = serde_json::from_str(&resp_str).unwrap();
    assert_eq!(resp["result"]["isError"], false);

    let content_text = resp["result"]["content"][0]["text"].as_str().unwrap();
    let created: Value = serde_json::from_str(content_text).unwrap();

    assert_eq!(created["name"], "Quantum Paper");
    assert_eq!(created["rootEntry"], "paper.tex");
    let project_id = created["id"].as_str().unwrap();
    assert_eq!(state.get_active_project_id().as_deref(), Some(project_id));

    // Verify on disk
    let file_on_disk = temp_dir.join(project_id).join("files").join("paper.tex");
    assert!(file_on_disk.exists());
    let disk_content = fs::read_to_string(&file_on_disk).unwrap();
    assert!(disk_content.contains("Quantum Superposition"));

    // 2. Direct method invocation for torque_create_project
    let req_direct = json!({
        "jsonrpc": "2.0",
        "id": "cp-2",
        "method": "torque_create_project",
        "params": {
            "name": "Default Project"
        }
    });

    let resp_direct_str = dispatch_jsonrpc_request(&state, &req_direct.to_string()).unwrap();
    let resp_direct: Value = serde_json::from_str(&resp_direct_str).unwrap();
    let created_direct = &resp_direct["result"];
    assert_eq!(created_direct["name"], "Default Project");
    assert_eq!(created_direct["rootEntry"], "main.tex");

    let _ = fs::remove_dir_all(&temp_dir);
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

    // 2. Edit file: replace 'Torque IDE' with 'the Torque LaTeX IDE' using target/replacement
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

    // 3. Edit file using search/replace aliases
    let alias_edit_req = json!({
        "jsonrpc": "2.0",
        "id": 211,
        "method": "tools/call",
        "params": {
            "name": "torque_edit_file",
            "arguments": {
                "path": "sections/abstract.tex",
                "search": "the Torque LaTeX IDE",
                "replace": "Torque"
            }
        }
    });
    let alias_edit_str = dispatch_jsonrpc_request(&state, &alias_edit_req.to_string()).unwrap();
    let alias_resp: Value = serde_json::from_str(&alias_edit_str).unwrap();
    assert_eq!(alias_resp["result"]["isError"], false);

    let re_updated_content = fs::read_to_string(&written_path).unwrap();
    assert!(re_updated_content.contains("This paper introduces Torque."));

    // 3.5 Write file using filePath and code aliases
    let alias_write_req = json!({
        "jsonrpc": "2.0",
        "id": 212,
        "method": "tools/call",
        "params": {
            "name": "torque_write_file",
            "arguments": {
                "filePath": "sections/alias.tex",
                "code": "% Alias write test"
            }
        }
    });
    let alias_write_str = dispatch_jsonrpc_request(&state, &alias_write_req.to_string()).unwrap();
    let alias_write_resp: Value = serde_json::from_str(&alias_write_str).unwrap();
    assert_eq!(alias_write_resp["result"]["isError"], false);
    let alias_written_path = temp_dir.join("proj_write").join("files").join("sections").join("alias.tex");
    assert!(alias_written_path.exists());
    assert_eq!(fs::read_to_string(&alias_written_path).unwrap(), "% Alias write test");

    // 4. Edit failure: target not found returns clean error
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
fn test_torque_write_file_auto_generates_project_json() {
    let temp_dir = std::env::temp_dir().join("torque_mcp_test_auto_project_json");
    let _ = fs::remove_dir_all(&temp_dir);
    fs::create_dir_all(&temp_dir).unwrap();

    let state = McpState::new_with_dir(temp_dir.clone());
    let proj_id = "auto_proj";
    state.set_active_project_id(proj_id.to_string());

    let write_req = json!({
        "jsonrpc": "2.0",
        "id": 25,
        "method": "tools/call",
        "params": {
            "name": "torque_write_file",
            "arguments": {
                "projectId": proj_id,
                "path": "main.tex",
                "content": "\\documentclass{article}\n\\begin{document}\nAuto Gen\n\\end{document}"
            }
        }
    });

    let resp_str = dispatch_jsonrpc_request(&state, &write_req.to_string()).unwrap();
    let resp: Value = serde_json::from_str(&resp_str).unwrap();
    assert_eq!(resp["result"]["isError"], false);

    // Verify project.json was auto-generated
    let project_json_path = temp_dir.join(proj_id).join("project.json");
    assert!(project_json_path.exists());
    let data = fs::read_to_string(&project_json_path).unwrap();
    let proj: Project = serde_json::from_str(&data).unwrap();
    assert_eq!(proj.id, proj_id);
    assert_eq!(proj.root_entry, "main.tex");

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

        let mut sse_buf = [0u8; 8192];
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
