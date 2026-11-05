//! Tool catalog metadata — the JSON schema definitions for all exposed MCP tools.

use serde_json::{json, Value};

pub fn get_tools_catalog() -> Value {
    json!({
        "tools": [
            {
                "name": "torque_create_project",
                "description": "Create a new LaTeX project in Torque with a default or custom root entry document.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "name": {
                            "type": "string",
                            "description": "Name of the new LaTeX project"
                        },
                        "rootEntry": {
                            "type": "string",
                            "description": "Optional root LaTeX document path (defaults to 'main.tex')"
                        },
                        "content": {
                            "type": "string",
                            "description": "Optional initial LaTeX document content for rootEntry"
                        }
                    },
                    "required": ["name"]
                }
            },
            {
                "name": "torque_list_projects",
                "description": "List all LaTeX projects available in Torque.",
                "inputSchema": {
                    "type": "object",
                    "properties": {},
                    "required": []
                }
            },
            {
                "name": "torque_get_active_project",
                "description": "Get the currently active LaTeX project in Torque, including file manifest and root entry file.",
                "inputSchema": {
                    "type": "object",
                    "properties": {},
                    "required": []
                }
            },
            {
                "name": "torque_read_file",
                "description": "Read full or partial text content of a file in a Torque project with optional line-range slicing.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "Relative path of the file to read"
                        },
                        "startLine": {
                            "type": "integer",
                            "description": "Optional 1-based start line (inclusive)"
                        },
                        "endLine": {
                            "type": "integer",
                            "description": "Optional 1-based end line (inclusive)"
                        },
                        "projectId": {
                            "type": "string",
                            "description": "Optional; defaults to active project"
                        }
                    },
                    "required": ["path"]
                }
            },
            {
                "name": "torque_write_file",
                "description": "Create or update a file in a Torque project. If the file is open in the Torque editor, its contents will update live.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "Relative path of the file to write"
                        },
                        "content": {
                            "type": "string",
                            "description": "File content to write"
                        },
                        "projectId": {
                            "type": "string",
                            "description": "Optional; defaults to active project"
                        }
                    },
                    "required": ["path", "content"]
                }
            },
            {
                "name": "torque_edit_file",
                "description": "Surgically edit a specific section or block of text within a file without overwriting the entire file.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "Relative path of the file to edit"
                        },
                        "target": {
                            "type": "string",
                            "description": "Exact text string or block to find and replace (alias: search)"
                        },
                        "search": {
                            "type": "string",
                            "description": "Alias for target: exact text string or block to find and replace"
                        },
                        "replacement": {
                            "type": "string",
                            "description": "New text to substitute in place of target (alias: replace)"
                        },
                        "replace": {
                            "type": "string",
                            "description": "Alias for replacement: new text to substitute in place of target"
                        },
                        "projectId": {
                            "type": "string",
                            "description": "Optional; defaults to active project"
                        }
                    },
                    "required": ["path"]
                }
            },
            {
                "name": "torque_compile",
                "description": "Compile the LaTeX project using native TeX Live (latexmk) and return status and structured diagnostics.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "projectId": {
                            "type": "string",
                            "description": "Optional; defaults to active project"
                        },
                        "engine": {
                            "type": "string",
                            "description": "TeX engine to compile with",
                            "enum": ["pdflatex", "xelatex", "lualatex"]
                        }
                    },
                    "required": []
                }
            },
            {
                "name": "torque_get_diagnostics",
                "description": "Retrieve the latest compilation diagnostics, warnings, and errors for the project.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "projectId": {
                            "type": "string",
                            "description": "Optional; defaults to active project"
                        }
                    },
                    "required": []
                }
            }
        ]
    })
}
