// Patchy's backend: fetches JSON from the vulnerability feeds and keeps a copy
// on disk, so a restart shows the last data at once and refreshes stay within
// the feeds' rate limits. The frontend turns the feeds into one list.

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::PathBuf;
use std::time::{Duration, SystemTime};

use serde::Serialize;
use tauri::{AppHandle, Manager, State};

/// Hosts the frontend may fetch from. Anything else is refused.
const ALLOWED_HOSTS: &[&str] = &[
    "www.wpvulnerability.net",
    "api.osv.dev",
    "ubuntu.com",
    "www.cisa.gov",
    "endoflife.date",
    "nodejs.org",
    "api.wordpress.org",
];

#[derive(Debug, thiserror::Error)]
enum AppError {
    #[error("{0}")]
    Message(String),
    #[error(transparent)]
    Http(#[from] reqwest::Error),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
}

impl Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

struct AppState {
    client: reqwest::Client,
    cache_dir: PathBuf,
}

#[derive(Serialize)]
struct Fetched {
    data: serde_json::Value,
    /// Unix seconds when the data was fetched from the feed.
    fetched_at: u64,
    /// True when the copy on disk was used.
    cached: bool,
}

fn unix(t: SystemTime) -> u64 {
    t.duration_since(SystemTime::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

fn cache_path(dir: &PathBuf, method: &str, url: &str, body: &Option<String>) -> PathBuf {
    let mut h = DefaultHasher::new();
    (method, url, body).hash(&mut h);
    dir.join(format!("{:016x}.json", h.finish()))
}

/// Fetches JSON with GET, or POST when `body` is set. A copy on disk younger
/// than `ttl_secs` is returned without a request unless `force` is set. When
/// the request fails, an older copy is returned if there is one.
#[tauri::command]
async fn fetch_json(
    state: State<'_, AppState>,
    url: String,
    body: Option<String>,
    ttl_secs: u64,
    force: bool,
) -> Result<Fetched, AppError> {
    let parsed = reqwest::Url::parse(&url).map_err(|e| AppError::Message(format!("Bad URL {url}: {e}")))?;
    let host = parsed.host_str().unwrap_or_default();
    if parsed.scheme() != "https" || !ALLOWED_HOSTS.contains(&host) {
        return Err(AppError::Message(format!("Host not allowed: {host}")));
    }
    let method = if body.is_some() { "POST" } else { "GET" };
    let path = cache_path(&state.cache_dir, method, &url, &body);
    let on_disk = std::fs::metadata(&path).and_then(|m| m.modified()).ok();

    if let Some(modified) = on_disk {
        let age = SystemTime::now().duration_since(modified).unwrap_or_default();
        if !force && age < Duration::from_secs(ttl_secs) {
            if let Ok(text) = std::fs::read(&path) {
                if let Ok(data) = serde_json::from_slice(&text) {
                    return Ok(Fetched { data, fetched_at: unix(modified), cached: true });
                }
            }
        }
    }

    let request = match &body {
        Some(b) => state.client.post(&url).header("content-type", "application/json").body(b.clone()),
        None => state.client.get(&url),
    };
    let result = async {
        let response = request.send().await?;
        let status = response.status();
        if !status.is_success() {
            return Err(AppError::Message(format!("{host} answered {status}")));
        }
        let bytes = response.bytes().await?;
        let data: serde_json::Value = serde_json::from_slice(&bytes)?;
        std::fs::write(&path, &bytes)?;
        Ok(data)
    }
    .await;

    match result {
        Ok(data) => Ok(Fetched { data, fetched_at: unix(SystemTime::now()), cached: false }),
        Err(err) => {
            // Offline or the feed is down: fall back to the last copy.
            if let (Some(modified), Ok(text)) = (on_disk, std::fs::read(&path)) {
                if let Ok(data) = serde_json::from_slice(&text) {
                    return Ok(Fetched { data, fetched_at: unix(modified), cached: true });
                }
            }
            Err(err)
        }
    }
}

/// Deletes the cached feed copies.
#[tauri::command]
fn clear_cache(state: State<'_, AppState>) -> Result<(), AppError> {
    for entry in std::fs::read_dir(&state.cache_dir)?.flatten() {
        if entry.path().extension().is_some_and(|e| e == "json") {
            std::fs::remove_file(entry.path())?;
        }
    }
    Ok(())
}

fn cache_dir(app: &AppHandle) -> Result<PathBuf, Box<dyn std::error::Error>> {
    let dir = app.path().app_cache_dir()?.join("feeds");
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let client = reqwest::Client::builder()
                .user_agent(concat!("Patchy/", env!("CARGO_PKG_VERSION")))
                .timeout(Duration::from_secs(45))
                .build()?;
            app.manage(AppState { client, cache_dir: cache_dir(app.handle())? });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![fetch_json, clear_cache])
        .run(tauri::generate_context!())
        .expect("error while running Patchy");
}
