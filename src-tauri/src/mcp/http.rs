//! HTTP and SSE server transport for the embedded MCP server.

use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};

use super::McpState;
use super::dispatch::dispatch_jsonrpc_request;

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

pub async fn handle_http_connection(
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
