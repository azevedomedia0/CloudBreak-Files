//! Tauri commands for P2P library sharing.

use crate::crypto::MAX_SESSION_BYTES;
use crate::local_fs::{self, LocalRoots};
use crate::p2p::chunk_store::{library_dir, ChunkStore};
use crate::p2p::identity::{identity_path, PeerIdentity};
use crate::p2p::invite::LibraryInvite;
use crate::p2p::keys::{
    unwrap_for_peer, unwrap_with_passphrase, wrap_for_peer, wrap_with_passphrase, LibraryRootKey,
};
use crate::p2p::library_store::{LibraryIndex, LibraryRecord};
use crate::p2p::manifest::{LibraryManifest, ManifestFileEntry};
use crate::p2p::swarm::{SwarmHandle, SwarmStatus};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::{AppHandle, Manager, State};
use crate::tray;

pub struct P2pState {
    pub identity: Mutex<Option<PeerIdentity>>,
    pub swarm: Mutex<Option<Arc<SwarmHandle>>>,
    pub app_data: Mutex<Option<PathBuf>>,
}

impl Default for P2pState {
    fn default() -> Self {
        Self {
            identity: Mutex::new(None),
            swarm: Mutex::new(None),
            app_data: Mutex::new(None),
        }
    }
}

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("app data dir: {e}"))
}

fn ensure_identity(app: &AppHandle, state: &P2pState, display_name: &str) -> Result<PeerIdentity, String> {
    let data = app_data_dir(app)?;
    *state.app_data.lock() = Some(data.clone());
    {
        let guard = state.identity.lock();
        if let Some(id) = guard.as_ref() {
            return Ok(id.clone());
        }
    }
    let id = PeerIdentity::load_or_create(&identity_path(&data), display_name)
        .map_err(|e| e.to_string())?;
    *state.identity.lock() = Some(id.clone());
    Ok(id)
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IdentityInfo {
    pub peer_id: String,
    pub public_key_hex: String,
    pub x25519_public_hex: String,
    pub display_name: String,
}

#[tauri::command]
pub fn p2p_get_identity(
    app: AppHandle,
    state: State<'_, P2pState>,
    display_name: Option<String>,
) -> Result<IdentityInfo, String> {
    let name = display_name.unwrap_or_else(|| "Cloudbreak User".into());
    let id = ensure_identity(&app, &state, &name)?;
    Ok(IdentityInfo {
        peer_id: id.peer_id.clone(),
        public_key_hex: id.public_key_hex.clone(),
        x25519_public_hex: id.x25519_public_hex(),
        display_name: id.display_name.clone(),
    })
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateLibraryFile {
    pub name: String,
    pub mime_type: String,
    /// Base64 plaintext (small/medium files, max ~32 MB). Prefer `local_path` for large files.
    #[serde(default)]
    pub content_base64: Option<String>,
    /// Absolute path under an allowed local root — streamed into the chunk store (no base64 IPC).
    #[serde(default)]
    pub local_path: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateLibraryRequest {
    pub name: String,
    pub description: String,
    pub role: String,
    pub recipient_email: Option<String>,
    pub recipient_x25519_hex: Option<String>,
    pub invite_passphrase: Option<String>,
    pub bandwidth_cap: Option<String>,
    /// Days until invite expires; 0 or None = never (far future).
    pub expires_in_days: Option<i64>,
    pub allow_downloads: Option<bool>,
    pub files: Vec<CreateLibraryFile>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateLibraryResult {
    pub library_id: String,
    pub root_cid: String,
    pub invite: String,
    pub file_ids: Vec<String>,
    pub record: LibraryRecord,
}

#[tauri::command]
pub async fn p2p_create_library(
    app: AppHandle,
    state: State<'_, P2pState>,
    roots: State<'_, LocalRoots>,
    req: CreateLibraryRequest,
) -> Result<CreateLibraryResult, String> {
    let identity = ensure_identity(&app, &state, "Cloudbreak User")?;
    let data = app_data_dir(&app)?;

    // Ensure swarm is running so invite carries listen addrs
    let swarm = ensure_swarm(&app, &state).await?;
    let listen_addrs = swarm.listen_addrs();

    let library_id = format!("lib-{}", uuid::Uuid::new_v4());
    let root_key = LibraryRootKey::random();
    let dir = library_dir(&data, &library_id);
    let store = ChunkStore::open(dir.clone()).map_err(|e| e.to_string())?;

    let mut files = Vec::new();
    let mut file_ids = Vec::new();
    for (i, f) in req.files.iter().enumerate() {
        let file_id = format!("pf-{library_id}-{i}");
        let (chunks, hash, size_bytes) = if let Some(path) = f.local_path.as_ref().filter(|p| !p.is_empty()) {
            let resolved = local_fs::resolve_in_roots(&local_fs::snapshot(&roots), Path::new(path))?;
            store
                .ingest_path(&root_key, &file_id, &resolved)
                .map_err(|e| e.to_string())?
        } else {
            let b64 = f
                .content_base64
                .as_ref()
                .ok_or_else(|| "file needs contentBase64 or localPath".to_string())?;
            let bytes = base64::Engine::decode(
                &base64::engine::general_purpose::STANDARD,
                b64.trim(),
            )
            .map_err(|e| format!("file decode: {e}"))?;
            if bytes.len() > MAX_SESSION_BYTES {
                return Err(format!(
                    "File is too large for the base64 bridge (max {} MB). Use a local file path instead.",
                    MAX_SESSION_BYTES / (1024 * 1024)
                ));
            }
            let (chunks, hash) = store
                .ingest_file(&root_key, &file_id, &bytes)
                .map_err(|e| e.to_string())?;
            (chunks, hash, bytes.len() as u64)
        };
        file_ids.push(file_id.clone());
        files.push(ManifestFileEntry {
            file_id,
            name: f.name.clone(),
            mime_type: f.mime_type.clone(),
            size_bytes,
            plaintext_sha256: hash,
            chunks,
        });
    }

    // Empty library still gets a valid manifest
    let manifest = LibraryManifest {
        version: 1,
        library_id: library_id.clone(),
        name: req.name.clone(),
        description: req.description.clone(),
        epoch: 1,
        owner_peer_id: identity.peer_id.clone(),
        created_at: chrono::Utc::now().to_rfc3339(),
        files,
    };
    let blob = manifest.encrypt(&root_key, &store).map_err(|e| e.to_string())?;
    manifest
        .save_local(&dir, &blob)
        .map_err(|e| e.to_string())?;

    // Also store root key wrapped for local reopen (passphrase of peer id as convenience for owner)
    let local_wrap = wrap_for_peer(&root_key, &identity.x25519_public_hex())
        .map_err(|e| e.to_string())?;

    let wrapped_for_invite = if let Some(pass) = req.invite_passphrase.as_ref().filter(|s| s.len() >= 8) {
        wrap_with_passphrase(&root_key, pass).map_err(|e| e.to_string())?
    } else if let Some(x25519) = req.recipient_x25519_hex.as_ref() {
        wrap_for_peer(&root_key, x25519).map_err(|e| e.to_string())?
    } else {
        wrap_with_passphrase(&root_key, "aetherlib-default-invite-key").map_err(|e| e.to_string())?
    };

    let expires_days = req.expires_in_days.unwrap_or(30);
    let expires_at_ts = if expires_days <= 0 {
        0 // never (invite verify treats 0 as no expiry)
    } else {
        chrono::Utc::now().timestamp() + expires_days * 86400
    };
    let expires_at_iso = if expires_days <= 0 {
        None
    } else {
        Some(
            (chrono::Utc::now() + chrono::Duration::days(expires_days)).to_rfc3339(),
        )
    };
    let allow_downloads = req.allow_downloads.unwrap_or(true);

    let invite = LibraryInvite {
        root_cid: blob.root_cid.clone(),
        library_id: library_id.clone(),
        library_name: req.name.clone(),
        seeder_peer_id: String::new(),
        seeder_public_key_hex: String::new(),
        seeder_addrs: listen_addrs,
        role: req.role.clone(),
        wrapped_library_key: wrapped_for_invite,
        capability_sig: String::new(),
        expires_at: expires_at_ts,
        epoch: 1,
        manifest_nonce_hex: blob.nonce_hex.clone(),
        private_mode: true,
    }
    .sign_with(&identity);
    let invite_str = invite.encode().map_err(|e| e.to_string())?;

    let record = LibraryRecord {
        library_id: library_id.clone(),
        name: req.name,
        description: req.description,
        direction: "outgoing".into(),
        role: "owner".into(),
        owner_peer_id: identity.peer_id.clone(),
        owner_name: identity.display_name.clone(),
        root_cid: blob.root_cid.clone(),
        epoch: 1,
        e2ee_protected: true,
        is_seeding: true,
        created_at: chrono::Utc::now().to_rfc3339(),
        file_ids: file_ids.clone(),
        member_count: if req.recipient_email.as_ref().map(|e| !e.is_empty()).unwrap_or(false) {
            2
        } else {
            1
        },
        local_wrapped_key: local_wrap,
        manifest_blob: blob.clone(),
        last_invite: Some(invite_str.clone()),
        seeding_status: Some("active".into()),
        bandwidth_cap: req.bandwidth_cap,
        private_mode: true,
        expires_at: expires_at_iso,
        allow_downloads,
    };

    let mut index = LibraryIndex::load(&data).map_err(|e| e.to_string())?;
    index.upsert(record.clone());
    index.save(&data).map_err(|e| e.to_string())?;

    // Private mode: seed locally only — peers must dial via the invite, never DHT announce.
    swarm.seed_library(blob.root_cid.clone(), library_id.clone());
    tray::refresh_tray_status(&app);

    Ok(CreateLibraryResult {
        library_id,
        root_cid: blob.root_cid,
        invite: invite_str,
        file_ids,
        record,
    })
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AcceptInviteRequest {
    pub invite: String,
    pub invite_passphrase: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AcceptInviteResult {
    pub record: LibraryRecord,
    pub fetched_chunks: usize,
}

#[tauri::command]
pub async fn p2p_accept_invite(
    app: AppHandle,
    state: State<'_, P2pState>,
    req: AcceptInviteRequest,
) -> Result<AcceptInviteResult, String> {
    let identity = ensure_identity(&app, &state, "Cloudbreak User")?;
    let data = app_data_dir(&app)?;
    let invite = LibraryInvite::decode(&req.invite).map_err(|e| e.to_string())?;

    let root_key = if let Some(pass) = req.invite_passphrase.as_ref().filter(|s| !s.is_empty()) {
        unwrap_with_passphrase(&invite.wrapped_library_key, pass).map_err(|e| e.to_string())?
    } else if invite.wrapped_library_key.scheme == "x25519-hkdf-aesgcm" {
        unwrap_for_peer(&invite.wrapped_library_key, &identity.x25519_secret())
            .map_err(|e| e.to_string())?
    } else {
        unwrap_with_passphrase(&invite.wrapped_library_key, "aetherlib-default-invite-key")
            .map_err(|e| format!("need invite passphrase: {e}"))?
    };

    let swarm = ensure_swarm(&app, &state).await?;
    // Private mode: dial only multiaddrs embedded in the signed invite.
    swarm.dial_invite(invite.root_cid.clone(), invite.seeder_addrs.clone());

    let dir = library_dir(&data, &invite.library_id);
    let store = ChunkStore::open(dir.clone()).map_err(|e| e.to_string())?;

    // Fetch manifest ciphertext (root_cid)
    let mut fetched = 0usize;
    if !store.has(&invite.root_cid) {
        fetched = swarm
            .fetch_missing(
                invite.root_cid.clone(),
                vec![invite.root_cid.clone()],
                invite.library_id.clone(),
            )
            .await
            .unwrap_or(0);
        // Also try copying from inbox
        let inbox = data.join("chunk_inbox").join(&invite.root_cid);
        if inbox.exists() && !store.has(&invite.root_cid) {
            if let Ok(bytes) = std::fs::read(&inbox) {
                let _ = store.put_raw(&bytes);
                fetched += 1;
            }
        }
    }

    let ct = store
        .get_raw(&invite.root_cid)
        .map_err(|_| "could not fetch encrypted manifest from seeder — is the seeder online?".to_string())?;
    let blob = crate::p2p::manifest::EncryptedManifestBlob {
        root_cid: invite.root_cid.clone(),
        nonce_hex: invite.manifest_nonce_hex.clone(),
        ciphertext_hex: hex::encode(ct),
    };
    let manifest = LibraryManifest::decrypt_blob(&root_key, &blob).map_err(|e| e.to_string())?;

    // Fetch file chunks
    let mut want = Vec::new();
    for f in &manifest.files {
        for c in &f.chunks {
            if !store.has(&c.cid) {
                want.push(c.cid.clone());
            }
        }
    }
    if !want.is_empty() {
        fetched += swarm
            .fetch_missing(invite.root_cid.clone(), want, invite.library_id.clone())
            .await
            .unwrap_or(0);
    }

    manifest
        .save_local(&dir, &blob)
        .map_err(|e| e.to_string())?;

    let local_wrap = wrap_for_peer(&root_key, &identity.x25519_public_hex())
        .map_err(|e| e.to_string())?;

    let record = LibraryRecord {
        library_id: invite.library_id.clone(),
        name: invite.library_name.clone(),
        description: format!("Incoming P2P library from {}", invite.seeder_peer_id),
        direction: "incoming".into(),
        role: invite.role.clone(),
        owner_peer_id: invite.seeder_peer_id.clone(),
        owner_name: invite.seeder_peer_id[..8.min(invite.seeder_peer_id.len())].to_string(),
        root_cid: invite.root_cid.clone(),
        epoch: invite.epoch,
        e2ee_protected: true,
        is_seeding: false,
        created_at: chrono::Utc::now().to_rfc3339(),
        file_ids: manifest.files.iter().map(|f| f.file_id.clone()).collect(),
        member_count: 2,
        local_wrapped_key: local_wrap,
        manifest_blob: blob,
        last_invite: Some(req.invite),
        seeding_status: Some("synced".into()),
        bandwidth_cap: None,
        private_mode: true,
        expires_at: if invite.expires_at > 0 {
            chrono::DateTime::from_timestamp(invite.expires_at, 0)
                .map(|dt| dt.to_rfc3339())
        } else {
            None
        },
        allow_downloads: true,
    };

    let mut index = LibraryIndex::load(&data).map_err(|e| e.to_string())?;
    index.upsert(record.clone());
    index.save(&data).map_err(|e| e.to_string())?;

    // Serve chunks we have to invite-dialed peers only (no announce / DHT).
    swarm.seed_library(invite.root_cid.clone(), invite.library_id);

    Ok(AcceptInviteResult {
        record,
        fetched_chunks: fetched,
    })
}

#[tauri::command]
pub fn p2p_export_invite(
    app: AppHandle,
    state: State<'_, P2pState>,
    library_id: String,
) -> Result<String, String> {
    let data = app_data_dir(&app)?;
    let _ = ensure_identity(&app, &state, "Cloudbreak User")?;
    let index = LibraryIndex::load(&data).map_err(|e| e.to_string())?;
    let rec = index
        .get(&library_id)
        .ok_or_else(|| "library not found".to_string())?;
    rec.last_invite
        .clone()
        .ok_or_else(|| "no invite for this library".to_string())
}

#[tauri::command]
pub fn p2p_list_libraries(app: AppHandle) -> Result<Vec<LibraryRecord>, String> {
    let data = app_data_dir(&app)?;
    let index = LibraryIndex::load(&data).map_err(|e| e.to_string())?;
    Ok(index.libraries)
}

#[tauri::command]
pub async fn p2p_start_seeding(
    app: AppHandle,
    state: State<'_, P2pState>,
    library_id: String,
) -> Result<SwarmStatus, String> {
    let data = app_data_dir(&app)?;
    let index = LibraryIndex::load(&data).map_err(|e| e.to_string())?;
    let rec = index
        .get(&library_id)
        .ok_or_else(|| "library not found".to_string())?
        .clone();
    let swarm = ensure_swarm(&app, &state).await?;
    // Private mode: listen + seed only; peers find us via invite seederAddrs.
    swarm.seed_library(rec.root_cid.clone(), library_id);
    tray::refresh_tray_status(&app);
    Ok(swarm.status())
}

#[tauri::command]
pub async fn p2p_swarm_status(
    app: AppHandle,
    state: State<'_, P2pState>,
) -> Result<SwarmStatus, String> {
    let swarm = ensure_swarm(&app, &state).await?;
    tray::refresh_tray_status(&app);
    Ok(swarm.status())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DecryptedFileResult {
    pub file_id: String,
    pub name: String,
    pub mime_type: String,
    pub content_base64: String,
    pub size_bytes: u64,
}

#[tauri::command]
pub fn p2p_read_file(
    app: AppHandle,
    state: State<'_, P2pState>,
    library_id: String,
    file_id: String,
) -> Result<DecryptedFileResult, String> {
    let identity = ensure_identity(&app, &state, "Cloudbreak User")?;
    let data = app_data_dir(&app)?;
    let index = LibraryIndex::load(&data).map_err(|e| e.to_string())?;
    let rec = index
        .get(&library_id)
        .ok_or_else(|| "library not found".to_string())?;
    let root_key = unwrap_for_peer(&rec.local_wrapped_key, &identity.x25519_secret())
        .map_err(|e| e.to_string())?;
    let dir = library_dir(&data, &library_id);
    let (manifest, _) = LibraryManifest::load_local(&dir).map_err(|e| e.to_string())?;
    let entry = manifest
        .files
        .iter()
        .find(|f| f.file_id == file_id)
        .ok_or_else(|| "file not in manifest".to_string())?;
    let store = ChunkStore::open(dir).map_err(|e| e.to_string())?;
    let plain = store
        .read_file(
            &root_key,
            &file_id,
            &entry.chunks,
            &entry.plaintext_sha256,
        )
        .map_err(|e| e.to_string())?;
    Ok(DecryptedFileResult {
        file_id,
        name: entry.name.clone(),
        mime_type: entry.mime_type.clone(),
        size_bytes: plain.len() as u64,
        content_base64: base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &plain),
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamChunkResult {
    pub file_id: String,
    pub index: u32,
    pub content_base64: String,
    pub size: usize,
    pub total_chunks: u32,
}

#[tauri::command]
pub fn p2p_stream_chunk(
    app: AppHandle,
    state: State<'_, P2pState>,
    library_id: String,
    file_id: String,
    chunk_index: u32,
) -> Result<StreamChunkResult, String> {
    let identity = ensure_identity(&app, &state, "Cloudbreak User")?;
    let data = app_data_dir(&app)?;
    let index = LibraryIndex::load(&data).map_err(|e| e.to_string())?;
    let rec = index
        .get(&library_id)
        .ok_or_else(|| "library not found".to_string())?;
    let root_key = unwrap_for_peer(&rec.local_wrapped_key, &identity.x25519_secret())
        .map_err(|e| e.to_string())?;
    let dir = library_dir(&data, &library_id);
    let (manifest, _) = LibraryManifest::load_local(&dir).map_err(|e| e.to_string())?;
    let entry = manifest
        .files
        .iter()
        .find(|f| f.file_id == file_id)
        .ok_or_else(|| "file not in manifest".to_string())?;
    let meta = entry
        .chunks
        .iter()
        .find(|c| c.index == chunk_index)
        .ok_or_else(|| "chunk index out of range".to_string())?;
    let store = ChunkStore::open(dir).map_err(|e| e.to_string())?;
    let plain = store
        .decrypt_chunk(&root_key, &file_id, meta)
        .map_err(|e| e.to_string())?;
    Ok(StreamChunkResult {
        file_id,
        index: chunk_index,
        size: plain.len(),
        total_chunks: entry.chunks.len() as u32,
        content_base64: base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &plain),
    })
}

#[tauri::command]
pub fn p2p_fetch_manifest(
    app: AppHandle,
    state: State<'_, P2pState>,
    library_id: String,
) -> Result<LibraryManifest, String> {
    let _ = ensure_identity(&app, &state, "Cloudbreak User")?;
    let data = app_data_dir(&app)?;
    let dir = library_dir(&data, &library_id);
    let (manifest, _) = LibraryManifest::load_local(&dir).map_err(|e| e.to_string())?;
    Ok(manifest)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MaterializeFileResult {
    pub file_id: String,
    pub name: String,
    pub mime_type: String,
    pub path: String,
    pub size_bytes: u64,
}

/// Decrypt a library file to the app temp folder (no base64 IPC). Prefer this for large files.
#[tauri::command]
pub fn p2p_materialize_file(
    app: AppHandle,
    state: State<'_, P2pState>,
    library_id: String,
    file_id: String,
) -> Result<MaterializeFileResult, String> {
    let identity = ensure_identity(&app, &state, "Cloudbreak User")?;
    let data = app_data_dir(&app)?;
    let index = LibraryIndex::load(&data).map_err(|e| e.to_string())?;
    let rec = index
        .get(&library_id)
        .ok_or_else(|| "library not found".to_string())?;
    let root_key = unwrap_for_peer(&rec.local_wrapped_key, &identity.x25519_secret())
        .map_err(|e| e.to_string())?;
    let dir = library_dir(&data, &library_id);
    let (manifest, _) = LibraryManifest::load_local(&dir).map_err(|e| e.to_string())?;
    let entry = manifest
        .files
        .iter()
        .find(|f| f.file_id == file_id)
        .ok_or_else(|| "file not in manifest".to_string())?;
    let store = ChunkStore::open(dir).map_err(|e| e.to_string())?;
    let temp = crate::commands::media_temp_dir(&app)?;
    let safe_name = entry
        .name
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_' { c } else { '_' })
        .collect::<String>();
    let dest = temp.join(format!("{file_id}_{safe_name}"));
    let size = store
        .materialize_file(
            &root_key,
            &file_id,
            &entry.chunks,
            &entry.plaintext_sha256,
            &dest,
        )
        .map_err(|e| e.to_string())?;
    Ok(MaterializeFileResult {
        file_id,
        name: entry.name.clone(),
        mime_type: entry.mime_type.clone(),
        path: dest.to_string_lossy().into_owned(),
        size_bytes: size,
    })
}

async fn ensure_swarm(app: &AppHandle, state: &P2pState) -> Result<Arc<SwarmHandle>, String> {
    {
        let guard = state.swarm.lock();
        if let Some(s) = guard.as_ref() {
            return Ok(s.clone());
        }
    }
    let identity = ensure_identity(app, state, "Cloudbreak User")?;
    let data = app_data_dir(app)?;
    let handle = SwarmHandle::start(identity, data, None).await?;
    let arc = Arc::new(handle);
    *state.swarm.lock() = Some(arc.clone());
    Ok(arc)
}
