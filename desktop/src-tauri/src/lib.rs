use base64::Engine as _;
use serde::Serialize;
use std::fs;
use std::io::{Cursor, Read, Write};
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};
use zip::ZipArchive;

const ENGINE_VERSION: &str = "0.1.1";

fn default_platform_origin() -> String {
    option_env!("KILRUN_PLATFORM_URL")
        .unwrap_or("https://kilrun.vercel.app")
        .trim_end_matches('/')
        .to_string()
}

static DATA_ROOT: OnceLock<PathBuf> = OnceLock::new();

fn probe_writable(dir: &Path) -> bool {
    if fs::create_dir_all(dir).is_err() {
        return false;
    }
    let probe = dir.join(".kilrun-write-probe");
    match fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .open(&probe)
    {
        Ok(mut file) => {
            let ok = file.write_all(b"ok").is_ok();
            drop(file);
            let _ = fs::remove_file(&probe);
            ok
        }
        Err(_) => false,
    }
}

fn documents_root() -> PathBuf {
    dirs::document_dir()
        .or_else(dirs::home_dir)
        .unwrap_or_else(|| PathBuf::from("."))
        .join("Kilrun")
}

fn local_app_root() -> PathBuf {
    dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("Kilrun")
}

fn resolve_data_root() -> PathBuf {
    if let Some(saved) = read_config().get("dataRoot").and_then(|v| v.as_str()) {
        let path = PathBuf::from(saved);
        if probe_writable(&path) {
            return path;
        }
    }
    let documents = documents_root();
    if probe_writable(&documents) {
        let _ = patch_config(serde_json::json!({ "dataRoot": documents.to_string_lossy() }));
        return documents;
    }
    let local = local_app_root();
    let _ = fs::create_dir_all(&local);
    let _ = patch_config(serde_json::json!({ "dataRoot": local.to_string_lossy() }));
    local
}

fn kilrun_root() -> PathBuf {
    DATA_ROOT.get_or_init(resolve_data_root).clone()
}

fn projects_root() -> PathBuf {
    kilrun_root().join("Projects")
}

fn plugins_root() -> PathBuf {
    kilrun_root().join("Plugins")
}

fn config_path() -> PathBuf {
    dirs::data_local_dir()
        .or_else(dirs::home_dir)
        .unwrap_or_else(|| PathBuf::from("."))
        .join("Kilrun")
        .join("engine-config.json")
}

fn ensure_layout() -> Result<(), String> {
    let root = kilrun_root();
    for child in ["Projects", "Assets", "Prefabs", "Plugins", "Cache", "Exports"] {
        fs::create_dir_all(root.join(child)).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn sanitize_id(id: &str) -> Result<String, String> {
    if id.is_empty() || id.len() > 96 {
        return Err("invalid project id".into());
    }
    if !id
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
    {
        return Err("invalid project id".into());
    }
    Ok(id.to_string())
}

fn is_allowed_origin(url: &str) -> bool {
    let trimmed = url.trim().trim_end_matches('/');
    if trimmed.starts_with("http://localhost:3000") || trimmed.starts_with("http://127.0.0.1:3000")
    {
        return true;
    }
    if trimmed == "https://kilrun.vercel.app" || trimmed.starts_with("https://kilrun.vercel.app/")
    {
        return true;
    }
    let allowed = default_platform_origin().trim_end_matches('/').to_string();
    trimmed == allowed
        || trimmed == format!("{allowed}/engine")
        || trimmed.starts_with(&format!("{allowed}/"))
}

fn read_config() -> serde_json::Value {
    fs::read_to_string(config_path())
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_else(|| serde_json::json!({}))
}

fn write_config(value: &serde_json::Value) -> Result<(), String> {
    let path = config_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    atomic_write(
        &path,
        serde_json::to_string_pretty(value)
            .map_err(|e| e.to_string())?
            .as_bytes(),
    )
}

fn patch_config(update: serde_json::Value) -> Result<(), String> {
    let mut cfg = read_config();
    if let Some(obj) = update.as_object() {
        for (key, value) in obj {
            cfg[key] = value.clone();
        }
    }
    write_config(&cfg)
}

fn origin_only(url: &str) -> String {
    url.trim()
        .trim_end_matches('/')
        .trim_end_matches("/engine")
        .to_string()
}

fn read_saved_origin() -> String {
    if let Some(url) = read_config().get("platformUrl").and_then(|v| v.as_str()) {
        if is_allowed_origin(url) {
            return origin_only(url);
        }
    }
    origin_only(&default_platform_origin())
}

fn read_session_token() -> Option<String> {
    read_config()
        .get("sessionToken")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty() && s.len() <= 4096)
}

fn project_dir(id: &str) -> Result<PathBuf, String> {
    Ok(projects_root().join(sanitize_id(id)?))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EngineInfo {
    version: String,
    os: String,
    projects_root: String,
    data_root: String,
    platform_url: String,
    session_token: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectListItem {
    id: String,
    name: String,
    game_mode: Option<String>,
    updated_at: String,
    created_at: Option<String>,
    size_bytes: Option<u64>,
    has_thumbnail: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectFile {
    id: String,
    map_json: String,
    thumbnail: Option<String>,
    updated_at: String,
}

#[tauri::command]
fn save_project(
    id: String,
    map_json: String,
    thumbnail: Option<String>,
    engine_version: Option<String>,
) -> Result<(), String> {
    ensure_layout()?;
    let id = sanitize_id(&id)?;
    let dir = projects_root().join(&id);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let parsed: serde_json::Value =
        serde_json::from_str(&map_json).map_err(|e| format!("invalid MapDocument: {e}"))?;
    if parsed.get("version").and_then(|v| v.as_u64()) != Some(1) {
        return Err("MapDocument version must be 1".into());
    }
    if !parsed.get("entities").map(|v| v.is_array()).unwrap_or(false) {
        return Err("MapDocument.entities must be an array".into());
    }
    atomic_write(&dir.join("map.json"), map_json.as_bytes())?;
    if let Some(thumb) = thumbnail.filter(|s| !s.is_empty()) {
        atomic_write(&dir.join("thumbnail.txt"), thumb.as_bytes())?;
    }
    let now = chrono_like_now();
    let project = serde_json::json!({
        "id": id,
        "name": parsed.get("name").and_then(|v| v.as_str()).unwrap_or("Untitled Map"),
        "gameMode": parsed.get("gameMode").and_then(|v| v.as_str()),
        "updatedAt": parsed.pointer("/meta/updatedAt").and_then(|v| v.as_str()).unwrap_or(&now),
        "createdAt": parsed.pointer("/meta/createdAt").and_then(|v| v.as_str()),
        "engineVersion": engine_version.unwrap_or_else(|| ENGINE_VERSION.to_string()),
    });
    atomic_write(
        &dir.join("project.json"),
        serde_json::to_string_pretty(&project)
            .map_err(|e| e.to_string())?
            .as_bytes(),
    )?;
    Ok(())
}

#[tauri::command]
fn engine_info() -> Result<EngineInfo, String> {
    ensure_layout()?;
    let _ = seed_example_plugin();
    Ok(EngineInfo {
        version: ENGINE_VERSION.into(),
        os: std::env::consts::OS.into(),
        projects_root: projects_root().to_string_lossy().into_owned(),
        data_root: kilrun_root().to_string_lossy().into_owned(),
        platform_url: read_saved_origin(),
        session_token: read_session_token(),
    })
}

#[tauri::command]
fn list_projects() -> Result<Vec<ProjectListItem>, String> {
    ensure_layout()?;
    let mut out = Vec::new();
    let root = projects_root();
    let entries = match fs::read_dir(&root) {
        Ok(e) => e,
        Err(_) => return Ok(out),
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let id = match path.file_name().and_then(|s| s.to_str()) {
            Some(id) => id.to_string(),
            None => continue,
        };
        if sanitize_id(&id).is_err() {
            continue;
        }
        let map_path = path.join("map.json");
        let map_json = fs::read_to_string(&map_path).unwrap_or_default();
        if map_json.is_empty() {
            continue;
        }
        let parsed: serde_json::Value = serde_json::from_str(&map_json).unwrap_or(serde_json::json!({}));
        let meta = fs::read_to_string(path.join("project.json"))
            .ok()
            .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok());
        let name = parsed
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("Untitled Map")
            .to_string();
        let game_mode = parsed
            .get("gameMode")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let updated_at = meta
            .as_ref()
            .and_then(|m| m.get("updatedAt"))
            .and_then(|v| v.as_str())
            .or_else(|| {
                parsed
                    .pointer("/meta/updatedAt")
                    .and_then(|v| v.as_str())
            })
            .unwrap_or("")
            .to_string();
        let created_at = parsed
            .pointer("/meta/createdAt")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let size_bytes = fs::metadata(&map_path).ok().map(|m| m.len());
        let has_thumbnail = path.join("thumbnail.txt").exists() || path.join("thumbnail.png").exists();
        out.push(ProjectListItem {
            id,
            name,
            game_mode,
            updated_at,
            created_at,
            size_bytes,
            has_thumbnail,
        });
    }
    out.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(out)
}

#[tauri::command]
fn read_project(id: String) -> Result<ProjectFile, String> {
    let dir = project_dir(&id)?;
    let map_json = fs::read_to_string(dir.join("map.json")).map_err(|_| "Map not found".to_string())?;
    let thumbnail = fs::read_to_string(dir.join("thumbnail.txt")).ok();
    let updated_at = fs::read_to_string(dir.join("project.json"))
        .ok()
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
        .and_then(|v| v.get("updatedAt").and_then(|x| x.as_str()).map(|s| s.to_string()))
        .unwrap_or_default();
    Ok(ProjectFile {
        id,
        map_json,
        thumbnail,
        updated_at,
    })
}

#[tauri::command]
fn delete_project(id: String) -> Result<(), String> {
    let dir = project_dir(&id)?;
    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn open_path(path: &Path) -> Result<(), String> {
    #[cfg(windows)]
    {
        std::process::Command::new("explorer")
            .arg(path)
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(not(windows))]
    {
        Err(format!("{}", path.display()))
    }
}

#[tauri::command]
fn open_projects_folder() -> Result<(), String> {
    ensure_layout()?;
    open_path(&projects_root())
}

#[tauri::command]
fn open_kilrun_folder(name: String) -> Result<(), String> {
    ensure_layout()?;
    let allowed = ["Projects", "Assets", "Prefabs", "Plugins", "Cache", "Exports"];
    if !allowed.contains(&name.as_str()) {
        return Err("unknown Kilrun folder".into());
    }
    open_path(&kilrun_root().join(name))
}

#[tauri::command]
fn set_platform_url(url: String) -> Result<(), String> {
    if !is_allowed_origin(&url) {
        return Err("URL is not on the Engine allow-list".into());
    }
    patch_config(serde_json::json!({ "platformUrl": origin_only(&url) }))
}

#[tauri::command]
fn set_engine_session(token: String) -> Result<(), String> {
    let trimmed = token.trim().to_string();
    if trimmed.is_empty() || trimmed.len() > 4096 {
        return Err("invalid engine session".into());
    }
    patch_config(serde_json::json!({ "sessionToken": trimmed }))
}

#[tauri::command]
fn clear_engine_session() -> Result<(), String> {
    patch_config(serde_json::json!({ "sessionToken": serde_json::Value::Null }))
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    let trimmed = url.trim();
    if !(trimmed.starts_with("http://") || trimmed.starts_with("https://")) {
        return Err("only http(s) URLs can be opened".into());
    }
    if !is_allowed_origin(trimmed) {
        return Err("URL is not on the Engine allow-list".into());
    }
    #[cfg(windows)]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", trimmed])
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(not(windows))]
    {
        Err(format!("Open: {trimmed}"))
    }
}

#[tauri::command]
fn navigate_engine(_app: AppHandle, _url: String) -> Result<(), String> {
    // Bundled Windows UI only — never send the window to the website.
    Ok(())
}

fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let tmp = path.with_extension("tmp");
    {
        let mut file = fs::File::create(&tmp).map_err(|e| e.to_string())?;
        file.write_all(bytes).map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
    }
    fs::rename(&tmp, path).map_err(|e| e.to_string())
}

fn chrono_like_now() -> String {
    // RFC3339-ish UTC without extra deps.
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("{secs}")
}

fn emit_deep_link(app: &AppHandle, raw: &str) {
    let _ = app.emit("kilrun-engine-deep-link", raw);
}

fn percent_decode(input: &str) -> String {
    let raw = input.as_bytes();
    let mut bytes = Vec::with_capacity(raw.len());
    let mut i = 0;
    while i < raw.len() {
        if raw[i] == b'%' && i + 2 < raw.len() {
            if let Ok(value) =
                u8::from_str_radix(std::str::from_utf8(&raw[i + 1..i + 3]).unwrap_or(""), 16)
            {
                bytes.push(value);
                i += 3;
                continue;
            }
        }
        bytes.push(if raw[i] == b'+' { b' ' } else { raw[i] });
        i += 1;
    }
    String::from_utf8_lossy(&bytes).into_owned()
}

fn parse_loopback_token(request: &str) -> Option<String> {
    let line = request.lines().next()?;
    let path = line.split_whitespace().nth(1)?;
    if !path.starts_with("/engine-auth") {
        return None;
    }
    let query = path.split_once('?')?.1;
    for pair in query.split('&') {
        if let Some((key, value)) = pair.split_once('=') {
            if key == "token" && !value.is_empty() {
                return Some(percent_decode(value));
            }
        }
    }
    None
}

#[tauri::command]
fn start_auth_loopback(app: AppHandle) -> Result<u16, String> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    listener
        .set_nonblocking(true)
        .map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    std::thread::spawn(move || {
        let deadline = Instant::now() + Duration::from_secs(180);
        loop {
            if Instant::now() > deadline {
                break;
            }
            match listener.accept() {
                Ok((mut stream, addr)) => {
                    if !addr.ip().is_loopback() {
                        continue;
                    }
                    listener.set_nonblocking(false).ok();
                    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
                    let mut buf = vec![0u8; 8192];
                    let n = stream.read(&mut buf).unwrap_or(0);
                    let req = String::from_utf8_lossy(&buf[..n]);
                    if req.contains("favicon") {
                        let _ = stream.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
                        listener.set_nonblocking(true).ok();
                        continue;
                    }
                    if let Some(token) = parse_loopback_token(&req) {
                        emit_deep_link(&app, &format!("kilrun-engine://auth?token={token}"));
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.set_focus();
                            let _ = window.unminimize();
                        }
                        let body = b"<!DOCTYPE html><html><body style=\"font-family:Segoe UI,sans-serif;background:#0d121a;color:#e2e8f0;display:grid;place-items:center;height:100vh;margin:0\"><main><h1>Back in Kilrun Engine</h1><p>You can close this tab.</p></main></body></html>";
                        let header = format!(
                            "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                            body.len()
                        );
                        let _ = stream.write_all(header.as_bytes());
                        let _ = stream.write_all(body);
                    } else {
                        let _ = stream.write_all(b"HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
                        listener.set_nonblocking(true).ok();
                        continue;
                    }
                    break;
                }
                Err(err) if err.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(Duration::from_millis(40));
                }
                Err(_) => break,
            }
        }
    });
    Ok(port)
}

const EXAMPLE_PLUGIN_JSON: &str = include_str!("../../plugins/kilrun-example/plugin.json");
const EXAMPLE_PLUGIN_JS: &str = include_str!("../../plugins/kilrun-example/index.js");

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PluginListItem {
    id: String,
    name: String,
    version: String,
    author: Option<String>,
    description: Option<String>,
    engine: Option<String>,
    entry: String,
    permissions: Vec<String>,
    enabled: bool,
    path: String,
}

fn plugin_dir(id: &str) -> Result<PathBuf, String> {
    Ok(plugins_root().join(sanitize_id(id)?))
}

fn is_plugin_enabled(id: &str) -> bool {
    match read_config()
        .get("pluginEnabled")
        .and_then(|v| v.as_object())
        .and_then(|m| m.get(id))
    {
        Some(value) => value.as_bool().unwrap_or(true),
        None => true,
    }
}

fn parse_semver(raw: &str) -> [u32; 3] {
    let mut out = [0u32; 3];
    for (i, part) in raw.split('.').take(3).enumerate() {
        let digits: String = part.chars().filter(|c| c.is_ascii_digit()).collect();
        out[i] = digits.parse().unwrap_or(0);
    }
    out
}

fn engine_meets(required: &str) -> bool {
    let need = parse_semver(required);
    let have = parse_semver(ENGINE_VERSION);
    for i in 0..3 {
        if have[i] > need[i] {
            return true;
        }
        if have[i] < need[i] {
            return false;
        }
    }
    true
}

fn read_plugin_manifest(dir: &Path) -> Result<PluginListItem, String> {
    let raw = fs::read_to_string(dir.join("plugin.json")).map_err(|_| "plugin.json missing".to_string())?;
    let value: serde_json::Value =
        serde_json::from_str(&raw).map_err(|e| format!("plugin.json: {e}"))?;
    let id = value
        .get("id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    sanitize_id(&id)?;
    let name = value
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or(&id)
        .to_string();
    let version = value
        .get("version")
        .and_then(|v| v.as_str())
        .unwrap_or("0.0.0")
        .to_string();
    let entry = value
        .get("entry")
        .and_then(|v| v.as_str())
        .unwrap_or("index.js")
        .replace('\\', "/");
    if entry.is_empty() || entry.contains("..") || entry.starts_with('/') {
        return Err("invalid plugin entry".into());
    }
    let permissions = value
        .get("permissions")
        .and_then(|v| v.as_array())
        .map(|rows| {
            rows.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    Ok(PluginListItem {
        id: id.clone(),
        name,
        version,
        author: value.get("author").and_then(|v| v.as_str()).map(|s| s.to_string()),
        description: value
            .get("description")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        engine: value.get("engine").and_then(|v| v.as_str()).map(|s| s.to_string()),
        entry,
        permissions,
        enabled: is_plugin_enabled(&id),
        path: dir.to_string_lossy().into_owned(),
    })
}

fn djb2_hex(bytes: &[u8]) -> String {
    let mut hash: u64 = 5381;
    for b in bytes {
        hash = hash.wrapping_mul(33).wrapping_add(*b as u64);
    }
    format!("{hash:x}")
}

/// Previous bundled example (v1.1.0) — upgrade only if disk still matches this.
const PRISTINE_V1_1_0_JSON: &str = "a2307820c5e826e4";
const PRISTINE_V1_1_0_JS: &str = "3dd765c9dd37685d";

fn seed_example_plugin() -> Result<(), String> {
    ensure_layout()?;
    let dir = plugins_root().join("kilrun-example");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let json_path = dir.join("plugin.json");
    let js_path = dir.join("index.js");
    let meta_path = dir.join(".seed-meta.json");
    let bundled_json_hash = djb2_hex(EXAMPLE_PLUGIN_JSON.as_bytes());
    let bundled_js_hash = djb2_hex(EXAMPLE_PLUGIN_JS.as_bytes());
    let bundled_version = serde_json::from_str::<serde_json::Value>(EXAMPLE_PLUGIN_JSON)
        .ok()
        .and_then(|v| v.get("version").and_then(|x| x.as_str()).map(|s| s.to_string()))
        .unwrap_or_else(|| "0.0.0".into());

    let write_bundled = || -> Result<(), String> {
        atomic_write(json_path.as_path(), EXAMPLE_PLUGIN_JSON.as_bytes())?;
        atomic_write(js_path.as_path(), EXAMPLE_PLUGIN_JS.as_bytes())?;
        let meta = serde_json::json!({
            "version": bundled_version,
            "jsonHash": bundled_json_hash,
            "jsHash": bundled_js_hash,
        });
        atomic_write(meta_path.as_path(), meta.to_string().as_bytes())?;
        Ok(())
    };

    if !json_path.exists() || !js_path.exists() {
        return write_bundled();
    }

    let disk_json = fs::read(&json_path).unwrap_or_default();
    let disk_js = fs::read(&js_path).unwrap_or_default();
    let disk_json_hash = djb2_hex(&disk_json);
    let disk_js_hash = djb2_hex(&disk_js);

    if disk_json_hash == bundled_json_hash && disk_js_hash == bundled_js_hash {
        let meta = serde_json::json!({
            "version": bundled_version,
            "jsonHash": bundled_json_hash,
            "jsHash": bundled_js_hash,
        });
        let _ = atomic_write(meta_path.as_path(), meta.to_string().as_bytes());
        return Ok(());
    }

    let meta = fs::read_to_string(&meta_path)
        .ok()
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok());
    let meta_json_hash = meta
        .as_ref()
        .and_then(|v| v.get("jsonHash").and_then(|x| x.as_str()))
        .unwrap_or("");
    let meta_js_hash = meta
        .as_ref()
        .and_then(|v| v.get("jsHash").and_then(|x| x.as_str()))
        .unwrap_or("");
    let matches_meta = !meta_json_hash.is_empty()
        && meta_json_hash == disk_json_hash
        && meta_js_hash == disk_js_hash;
    let matches_known_pristine =
        disk_json_hash == PRISTINE_V1_1_0_JSON && disk_js_hash == PRISTINE_V1_1_0_JS;
    let disk_version = serde_json::from_slice::<serde_json::Value>(&disk_json)
        .ok()
        .and_then(|v| v.get("version").and_then(|x| x.as_str()).map(|s| s.to_string()))
        .unwrap_or_default();
    let bundled_newer = parse_semver(&bundled_version) > parse_semver(&disk_version);

    if bundled_newer && (matches_meta || matches_known_pristine) {
        return write_bundled();
    }
    Ok(())
}

fn safe_plugin_rel(rel: &str) -> Result<PathBuf, String> {
    let cleaned = rel.replace('\\', "/");
    if cleaned.is_empty() || cleaned.starts_with('/') || cleaned.contains("..") {
        return Err("invalid plugin file path".into());
    }
    Ok(PathBuf::from(cleaned))
}

fn mime_for(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "glb" => "model/gltf-binary",
        "gltf" => "model/gltf+json",
        "json" => "application/json",
        "js" | "mjs" => "text/javascript",
        "css" => "text/css",
        "wav" => "audio/wav",
        "mp3" => "audio/mpeg",
        "ogg" => "audio/ogg",
        _ => "application/octet-stream",
    }
}

#[tauri::command]
fn list_plugins() -> Result<Vec<PluginListItem>, String> {
    ensure_layout()?;
    let _ = seed_example_plugin();
    let mut out = Vec::new();
    let entries = match fs::read_dir(plugins_root()) {
        Ok(e) => e,
        Err(_) => return Ok(out),
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        if let Ok(item) = read_plugin_manifest(&path) {
            out.push(item);
        }
    }
    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(out)
}

#[tauri::command]
fn set_plugin_enabled(id: String, enabled: bool) -> Result<(), String> {
    let id = sanitize_id(&id)?;
    let mut cfg = read_config();
    let map = cfg
        .as_object_mut()
        .ok_or_else(|| "invalid engine config".to_string())?;
    let enabled_map = map
        .entry("pluginEnabled")
        .or_insert_with(|| serde_json::json!({}));
    if let Some(obj) = enabled_map.as_object_mut() {
        obj.insert(id, serde_json::Value::Bool(enabled));
    }
    write_config(&cfg)
}

#[tauri::command]
fn uninstall_plugin(id: String) -> Result<(), String> {
    let dir = plugin_dir(&id)?;
    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    let mut cfg = read_config();
    if let Some(obj) = cfg
        .get_mut("pluginEnabled")
        .and_then(|v| v.as_object_mut())
    {
        obj.remove(&id);
    }
    write_config(&cfg)
}

#[tauri::command]
fn read_plugin_file(id: String, rel: String) -> Result<String, String> {
    let dir = plugin_dir(&id)?;
    let rel_path = safe_plugin_rel(&rel)?;
    let path = dir.join(&rel_path);
    if !path.starts_with(&dir) {
        return Err("plugin file escapes plugin folder".into());
    }
    fs::read_to_string(&path).map_err(|_| "plugin file not found".to_string())
}

#[tauri::command]
fn plugin_asset_data_url(id: String, rel: String) -> Result<String, String> {
    let dir = plugin_dir(&id)?;
    let rel_path = safe_plugin_rel(&rel)?;
    let path = dir.join(&rel_path);
    if !path.starts_with(&dir) {
        return Err("plugin asset escapes plugin folder".into());
    }
    let bytes = fs::read(&path).map_err(|_| "plugin asset not found".to_string())?;
    if bytes.len() > 8 * 1024 * 1024 {
        return Err("plugin asset is too large".into());
    }
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{};base64,{}", mime_for(&path), b64))
}

fn zip_plugin_manifest(bytes: &[u8]) -> Result<(String, serde_json::Value), String> {
    let mut archive =
        ZipArchive::new(Cursor::new(bytes.to_vec())).map_err(|e| format!("not a zip/.kplugin: {e}"))?;
    let mut manifest_name: Option<String> = None;
    for i in 0..archive.len() {
        let file = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = file.name().replace('\\', "/");
        if name.ends_with("plugin.json") && !name.contains("..") {
            manifest_name = Some(name);
            break;
        }
    }
    let manifest_name = manifest_name.ok_or_else(|| "zip has no plugin.json".to_string())?;
    let mut file = archive
        .by_name(&manifest_name)
        .map_err(|_| "plugin.json missing".to_string())?;
    let mut raw = String::new();
    file.read_to_string(&mut raw).map_err(|e| e.to_string())?;
    let value: serde_json::Value =
        serde_json::from_str(&raw).map_err(|e| format!("plugin.json: {e}"))?;
    let id = value
        .get("id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    Ok((sanitize_id(&id)?, value))
}

fn manifest_item_from_value(id: String, value: &serde_json::Value, path: String, enabled: bool) -> PluginListItem {
    PluginListItem {
        id: id.clone(),
        name: value
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or(&id)
            .to_string(),
        version: value
            .get("version")
            .and_then(|v| v.as_str())
            .unwrap_or("0.0.0")
            .to_string(),
        author: value.get("author").and_then(|v| v.as_str()).map(|s| s.to_string()),
        description: value
            .get("description")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        engine: value.get("engine").and_then(|v| v.as_str()).map(|s| s.to_string()),
        entry: value
            .get("entry")
            .and_then(|v| v.as_str())
            .unwrap_or("index.js")
            .replace('\\', "/"),
        permissions: value
            .get("permissions")
            .and_then(|v| v.as_array())
            .map(|rows| {
                rows.iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default(),
        enabled,
        path,
    }
}

#[tauri::command]
fn inspect_plugin(archive_base64: String) -> Result<PluginListItem, String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(archive_base64.trim())
        .map_err(|_| "plugin archive is not valid base64".to_string())?;
    if bytes.len() > 32 * 1024 * 1024 {
        return Err("plugin archive is too large".into());
    }
    let (id, value) = zip_plugin_manifest(&bytes)?;
    if let Some(required) = value.get("engine").and_then(|v| v.as_str()) {
        if !engine_meets(required) {
            return Err(format!(
                "plugin needs Engine {required}+ (this app is {ENGINE_VERSION})"
            ));
        }
    }
    Ok(manifest_item_from_value(id, &value, "(archive)".into(), true))
}

#[tauri::command]
fn install_plugin(archive_base64: String) -> Result<PluginListItem, String> {
    ensure_layout()?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(archive_base64.trim())
        .map_err(|_| "plugin archive is not valid base64".to_string())?;
    if bytes.len() > 32 * 1024 * 1024 {
        return Err("plugin archive is too large".into());
    }
    let mut archive =
        ZipArchive::new(Cursor::new(bytes)).map_err(|e| format!("not a zip/.kplugin: {e}"))?;
    let mut manifest_name: Option<String> = None;
    for i in 0..archive.len() {
        let file = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = file.name().replace('\\', "/");
        if name.ends_with("plugin.json") && !name.contains("..") {
            manifest_name = Some(name);
            break;
        }
    }
    let manifest_name = manifest_name.ok_or_else(|| "zip has no plugin.json".to_string())?;
    let prefix = manifest_name
        .rsplit_once('/')
        .map(|(head, _)| format!("{head}/"))
        .unwrap_or_default();
    let manifest_raw = {
        let mut file = archive
            .by_name(&manifest_name)
            .map_err(|_| "plugin.json missing".to_string())?;
        let mut raw = String::new();
        file.read_to_string(&mut raw).map_err(|e| e.to_string())?;
        raw
    };
    let manifest_value: serde_json::Value =
        serde_json::from_str(&manifest_raw).map_err(|e| format!("plugin.json: {e}"))?;
    let id = manifest_value
        .get("id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    let id = sanitize_id(&id)?;
    if let Some(required) = manifest_value.get("engine").and_then(|v| v.as_str()) {
        if !engine_meets(required) {
            return Err(format!(
                "plugin needs Engine {required}+ (this app is {ENGINE_VERSION})"
            ));
        }
    }
    let dest = plugins_root().join(&id);
    if dest.exists() {
        fs::remove_dir_all(&dest).map_err(|e| e.to_string())?;
    }
    fs::create_dir_all(&dest).map_err(|e| e.to_string())?;
    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
        if file.is_dir() {
            continue;
        }
        let name = file.name().replace('\\', "/");
        if name.contains("..") {
            continue;
        }
        let stripped = if prefix.is_empty() {
            name.clone()
        } else if let Some(rest) = name.strip_prefix(&prefix) {
            rest.to_string()
        } else {
            continue;
        };
        if stripped.is_empty() {
            continue;
        }
        let out_path = dest.join(Path::new(&stripped));
        if !out_path.starts_with(&dest) {
            continue;
        }
        if let Some(parent) = out_path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut buf = Vec::new();
        file.read_to_end(&mut buf).map_err(|e| e.to_string())?;
        atomic_write(&out_path, &buf)?;
    }
    read_plugin_manifest(&dest)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let startup_link = std::env::args().find(|a| a.starts_with("kilrun-engine:"));

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(url) = argv.iter().find(|a| a.starts_with("kilrun-engine:")) {
                emit_deep_link(app, url);
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                }
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .invoke_handler(tauri::generate_handler![
            engine_info,
            list_projects,
            read_project,
            save_project,
            delete_project,
            open_projects_folder,
            open_kilrun_folder,
            set_platform_url,
            set_engine_session,
            clear_engine_session,
            open_external_url,
            navigate_engine,
            start_auth_loopback,
            list_plugins,
            set_plugin_enabled,
            uninstall_plugin,
            read_plugin_file,
            plugin_asset_data_url,
            inspect_plugin,
            install_plugin
        ])
        .setup(move |app| {
            let _ = ensure_layout();
            let handle = app.handle().clone();
            if let Some(link) = startup_link.clone() {
                let app2 = handle.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(800));
                    emit_deep_link(&app2, &link);
                });
            }

            #[cfg(windows)]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let _ = app.deep_link().register("kilrun-engine");
                let app2 = handle.clone();
                app.deep_link().on_open_url(move |event| {
                    for url in event.urls() {
                        emit_deep_link(&app2, &url.to_string());
                    }
                });
            }

            Ok(())
        })
        .on_page_load(|window, _payload| {
            let _ = window.eval("window.__KILRUN_ENGINE__=true;window.__KILRUN_ENGINE_VERSION__='0.1.1';");
        })
        .run(tauri::generate_context!())
        .expect("error while running Kilrun Engine");
}
