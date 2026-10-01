//! Test-only JSON-lines runner for native Rust parity. Never included in releases.
use puck_core::Engine;
use serde_json::{Value, json};
use std::io::{self, BufRead};
fn main() {
    let mut engine = None;
    for line in io::stdin().lock().lines() {
        let line = line.unwrap();
        let (command, data) = line.split_once(' ').unwrap_or((&line, ""));
        let result = match command {
            "CREATE" => serde_json::from_str::<Value>(data)
                .map_err(|e| e.to_string())
                .and_then(|v| Engine::new(&v))
                .map(|e| {
                    engine = Some(e);
                    Value::Null
                }),
            "CALL" => serde_json::from_str::<Value>(data)
                .map_err(|e| e.to_string())
                .and_then(|v| engine.as_mut().ok_or("No engine.".to_string())?.call(&v)),
            "DESTROY" => {
                engine = None;
                Ok(Value::Null)
            }
            _ => Err("Unknown test command.".into()),
        };
        println!(
            "{}",
            match result {
                Ok(value) => json!({"ok":true,"value":value}),
                Err(error) => json!({"ok":false,"error":error}),
            }
        );
    }
}
