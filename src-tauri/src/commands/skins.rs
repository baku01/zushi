use crate::state::DownloadedSkin;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Read;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadItem {
    pub url: String,
    pub champion_name: String,
    pub skin_name: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DownloadProgress {
    current: u32,
    total: u32,
    skin_name: String,
}

/// Skin names like "K/DA Kai'Sa" contain '/', which is a path separator.
/// Encode it for on-disk folder/file names and decode when reading back,
/// so the logical skin name stays intact everywhere else.
fn encode_path(s: &str) -> String {
    s.replace('/', "%2F")
}

fn decode_path(s: &str) -> String {
    s.replace("%2F", "/")
}

fn skins_dir(app: &AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_data_dir()
        .expect("failed to get app data dir")
        .join("skins");
    fs::create_dir_all(&dir).ok();
    dir
}

/// Sidecar next to each downloaded zip caching its git blob SHA.
const BLOB_SHA_FILE: &str = ".blob_sha";

/// Git blob SHA-1 ("blob <len>\0" + content), the per-file `sha` of GitHub's tree API.
fn git_blob_sha(bytes: &[u8]) -> String {
    use sha1::{Digest, Sha1};
    let mut hasher = Sha1::new();
    hasher.update(format!("blob {}\0", bytes.len()).as_bytes());
    hasher.update(bytes);
    hasher
        .finalize()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

fn write_blob_sha(skin_dir: &std::path::Path, bytes: &[u8]) {
    fs::write(skin_dir.join(BLOB_SHA_FILE), git_blob_sha(bytes)).ok();
}

/// The zip's blob SHA from the sidecar, recomputed (and re-cached) when the
/// sidecar is missing, malformed or older than the zip.
fn blob_sha_of(skin_dir: &std::path::Path, zip_path: &std::path::Path) -> Option<String> {
    let sidecar = skin_dir.join(BLOB_SHA_FILE);
    let zip_mtime = fs::metadata(zip_path).and_then(|m| m.modified()).ok();
    let side_mtime = fs::metadata(&sidecar).and_then(|m| m.modified()).ok();
    if let (Some(zip_mtime), Some(side_mtime)) = (zip_mtime, side_mtime) {
        if side_mtime >= zip_mtime {
            if let Ok(sha) = fs::read_to_string(&sidecar) {
                let sha = sha.trim();
                if sha.len() == 40 && sha.bytes().all(|b| b.is_ascii_hexdigit()) {
                    return Some(sha.to_ascii_lowercase());
                }
            }
        }
    }
    let bytes = fs::read(zip_path).ok()?;
    let sha = git_blob_sha(&bytes);
    fs::write(&sidecar, &sha).ok();
    Some(sha)
}

/// Flatten a spawn_blocking result into our String error type.
fn flatten<T>(res: Result<Result<T, String>, impl std::fmt::Display>) -> Result<T, String> {
    match res {
        Ok(inner) => inner,
        Err(e) => Err(e.to_string()),
    }
}

/// Download a single skin zip. Runs blocking I/O on a background thread.
#[tauri::command]
pub async fn download_skin(
    app: AppHandle,
    url: String,
    champion_name: String,
    skin_name: String,
) -> Result<String, String> {
    let base = skins_dir(&app);
    flatten(
        tauri::async_runtime::spawn_blocking(move || {
            let skin_dir = base
                .join(encode_path(&champion_name))
                .join(encode_path(&skin_name));
            fs::create_dir_all(&skin_dir).map_err(|e| e.to_string())?;

            let zip_path = skin_dir.join(format!("{}.zip", encode_path(&skin_name)));

            let resp = ureq::get(&url)
                .call()
                .map_err(|e| format!("Download failed: {e}"))?;

            let mut bytes = Vec::new();
            resp.into_reader()
                .read_to_end(&mut bytes)
                .map_err(|e| format!("Read failed: {e}"))?;

            if bytes.is_empty() {
                return Err("Downloaded file is empty".to_string());
            }

            fs::write(&zip_path, &bytes).map_err(|e| format!("Write failed: {e}"))?;
            write_blob_sha(&skin_dir, &bytes);

            Ok(zip_path.to_string_lossy().into_owned())
        })
        .await,
    )
}

/// Download multiple skins in one call. Runs entirely on a background thread,
/// emitting progress events so the UI stays responsive.
#[tauri::command]
pub async fn download_multiple_skins(
    app: AppHandle,
    items: Vec<DownloadItem>,
) -> Result<u32, String> {
    let base = skins_dir(&app);
    flatten(
        tauri::async_runtime::spawn_blocking(move || {
            let total = items.len() as u32;
            let mut success_count = 0u32;

            for item in &items {
                let skin_dir = base
                    .join(encode_path(&item.champion_name))
                    .join(encode_path(&item.skin_name));
                if fs::create_dir_all(&skin_dir).is_err() {
                    continue;
                }

                let zip_path = skin_dir.join(format!("{}.zip", encode_path(&item.skin_name)));

                let ok = (|| -> bool {
                    let resp = match ureq::get(&item.url).call() {
                        Ok(r) => r,
                        Err(_) => return false,
                    };
                    let mut bytes = Vec::new();
                    if resp.into_reader().read_to_end(&mut bytes).is_err() || bytes.is_empty() {
                        return false;
                    }
                    if fs::write(&zip_path, &bytes).is_err() {
                        return false;
                    }
                    write_blob_sha(&skin_dir, &bytes);
                    true
                })();

                if ok {
                    success_count += 1;
                }

                app.emit(
                    "download-progress",
                    DownloadProgress {
                        current: success_count,
                        total,
                        skin_name: item.skin_name.clone(),
                    },
                )
                .ok();
            }

            Ok(success_count)
        })
        .await,
    )
}

#[tauri::command]
pub async fn list_downloaded_skins(app: AppHandle) -> Result<Vec<DownloadedSkin>, String> {
    let base = skins_dir(&app);
    flatten(
        tauri::async_runtime::spawn_blocking(move || {
            let mut skins = Vec::new();

            let entries = match fs::read_dir(&base) {
                Ok(e) => e,
                Err(_) => return Ok(skins),
            };

            for champion_entry in entries.flatten() {
                if !champion_entry
                    .file_type()
                    .map(|t| t.is_dir())
                    .unwrap_or(false)
                {
                    continue;
                }
                let champion_dir_name = champion_entry.file_name().to_string_lossy().to_string();
                let champion_name = decode_path(&champion_dir_name);

                if let Ok(skin_entries) = fs::read_dir(champion_entry.path()) {
                    for skin_entry in skin_entries.flatten() {
                        if !skin_entry
                            .file_type()
                            .map(|t| t.is_dir())
                            .unwrap_or(false)
                        {
                            continue;
                        }
                        let skin_dir_name = skin_entry.file_name().to_string_lossy().to_string();
                        let zip_path = skin_entry.path().join(format!("{}.zip", &skin_dir_name));

                        if zip_path.exists() {
                            let blob_sha = blob_sha_of(&skin_entry.path(), &zip_path);
                            skins.push(DownloadedSkin {
                                champion_name: champion_name.clone(),
                                skin_name: decode_path(&skin_dir_name),
                                zip_path: zip_path.to_string_lossy().into_owned(),
                                blob_sha,
                            });
                        }
                    }
                }
            }

            Ok(skins)
        })
        .await,
    )
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteItem {
    pub champion_name: String,
    pub skin_name: String,
}

/// Removes one skin's folder, then its champion folder once nothing real is left.
/// A listing running at the same time may drop a `.blob_sha` into the folder while
/// it is being emptied, which makes `remove_dir_all` fail: retry a few times.
fn delete_skin_dir(base: &std::path::Path, champion_name: &str, skin_name: &str) -> Result<(), String> {
    let champion_dir = base.join(encode_path(champion_name));
    let skin_dir = champion_dir.join(encode_path(skin_name));

    let mut last_err = None;
    for attempt in 0..4 {
        if !skin_dir.exists() {
            last_err = None;
            break;
        }
        match fs::remove_dir_all(&skin_dir) {
            Ok(()) => {
                last_err = None;
                break;
            }
            Err(e) => {
                last_err = Some(e.to_string());
                std::thread::sleep(std::time::Duration::from_millis(40 * (attempt + 1)));
            }
        }
    }
    if let Some(e) = last_err {
        return Err(format!("Could not delete \"{skin_name}\": {e}"));
    }

    // Drop the champion folder when only Finder litter (.DS_Store) remains.
    if let Ok(mut rest) = fs::read_dir(&champion_dir) {
        if rest.all(|e| e.map(|e| e.file_name() == ".DS_Store").unwrap_or(false)) {
            fs::remove_dir_all(&champion_dir).ok();
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn delete_downloaded_skin(
    app: AppHandle,
    champion_name: String,
    skin_name: String,
) -> Result<(), String> {
    let base = skins_dir(&app);
    flatten(
        tauri::async_runtime::spawn_blocking(move || delete_skin_dir(&base, &champion_name, &skin_name))
            .await,
    )
}

/// Deletes several skins in one call (a skin with all its chromas/forms), so the
/// UI needs a single round trip and a single refresh instead of one racing
/// listing per skin.
#[tauri::command]
pub async fn delete_downloaded_skins(app: AppHandle, items: Vec<DeleteItem>) -> Result<(), String> {
    let base = skins_dir(&app);
    flatten(
        tauri::async_runtime::spawn_blocking(move || {
            let mut first_err = None;
            for item in &items {
                if let Err(e) = delete_skin_dir(&base, &item.champion_name, &item.skin_name) {
                    first_err.get_or_insert(e);
                }
            }
            first_err.map_or(Ok(()), Err)
        })
        .await,
    )
}

#[tauri::command]
pub async fn get_skins_dir_size(app: AppHandle) -> Result<u64, String> {
    let base = skins_dir(&app);
    flatten(
        tauri::async_runtime::spawn_blocking(move || Ok(dir_size(&base))).await,
    )
}

#[tauri::command]
pub async fn clear_all_skins(app: AppHandle) -> Result<(), String> {
    let base = skins_dir(&app);
    flatten(
        tauri::async_runtime::spawn_blocking(move || {
            if base.exists() {
                fs::remove_dir_all(&base).map_err(|e| e.to_string())?;
                fs::create_dir_all(&base).ok();
            }
            Ok(())
        })
        .await,
    )
}

use super::dir_size;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn git_blob_sha_matches_git() {
        // `git hash-object /dev/null` and `printf 'hello\n' | git hash-object --stdin`
        assert_eq!(git_blob_sha(b""), "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391");
        assert_eq!(git_blob_sha(b"hello\n"), "ce013625030ba8dba906f756967f9e9ca394464a");
    }

    #[test]
    fn blob_sha_sidecar_is_cached_and_refreshed() {
        let dir = std::env::temp_dir().join(format!("zushi-blobsha-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let zip = dir.join("skin.zip");

        fs::write(&zip, b"v1").unwrap();
        assert_eq!(blob_sha_of(&dir, &zip).as_deref(), Some(git_blob_sha(b"v1").as_str()));
        assert!(dir.join(BLOB_SHA_FILE).exists());

        // A stale or garbage sidecar is recomputed from the zip.
        std::thread::sleep(std::time::Duration::from_millis(20));
        fs::write(dir.join(BLOB_SHA_FILE), "not-a-sha").unwrap();
        assert_eq!(blob_sha_of(&dir, &zip).as_deref(), Some(git_blob_sha(b"v1").as_str()));

        // A zip rewritten after its sidecar is rehashed.
        std::thread::sleep(std::time::Duration::from_millis(20));
        fs::write(&zip, b"v2").unwrap();
        assert_eq!(blob_sha_of(&dir, &zip).as_deref(), Some(git_blob_sha(b"v2").as_str()));

        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn delete_removes_skin_and_empty_champion_folder() {
        let base = std::env::temp_dir().join(format!("zushi-delete-{}", std::process::id()));
        let a = base.join("K%2FDA Kai'Sa").join("K%2FDA Kai'Sa");
        let b = base.join("K%2FDA Kai'Sa").join("Prestige K%2FDA Kai'Sa");
        for dir in [&a, &b] {
            fs::create_dir_all(dir).unwrap();
            fs::write(dir.join("skin.zip"), b"zip").unwrap();
            fs::write(dir.join(BLOB_SHA_FILE), "x").unwrap();
        }

        delete_skin_dir(&base, "K/DA Kai'Sa", "K/DA Kai'Sa").unwrap();
        assert!(!a.exists());
        assert!(b.exists(), "the champion's other skin stays");

        // Deleting what is already gone is not an error; the last skin takes the champion folder.
        delete_skin_dir(&base, "K/DA Kai'Sa", "K/DA Kai'Sa").unwrap();
        delete_skin_dir(&base, "K/DA Kai'Sa", "Prestige K/DA Kai'Sa").unwrap();
        assert!(!base.join("K%2FDA Kai'Sa").exists());

        fs::remove_dir_all(&base).ok();
    }
}
