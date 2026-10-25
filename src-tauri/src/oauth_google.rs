//! Google OAuth 2.0 for Drive — installed-app PKCE + loopback redirect.
//!
//! Opens the system browser, listens on `http://127.0.0.1:<ephemeral>/`, then
//! exchanges the authorization code for access + refresh tokens.
//! Client ID is a public OAuth client (Desktop type); no client secret.

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::process::Command;
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::time::timeout;

const AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const SCOPES: &str =
    "https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/userinfo.email";
const AUTH_TIMEOUT: Duration = Duration::from_secs(300);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleOAuthTokens {
    pub access_token: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub refresh_token: Option<String>,
    /// Seconds until access token expiry (from Google).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expires_in: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub token_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scope: Option<String>,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    #[serde(default)]
    refresh_token: Option<String>,
    #[serde(default)]
    expires_in: Option<u64>,
    #[serde(default)]
    token_type: Option<String>,
    #[serde(default)]
    scope: Option<String>,
    #[serde(default)]
    error: Option<String>,
    #[serde(default)]
    error_description: Option<String>,
}

pub(crate) fn random_urlsafe(bytes: usize) -> String {
    let mut buf = vec![0u8; bytes];
    rand::thread_rng().fill_bytes(&mut buf);
    URL_SAFE_NO_PAD.encode(buf)
}

pub(crate) fn pkce_challenge(verifier: &str) -> String {
    let digest = Sha256::digest(verifier.as_bytes());
    URL_SAFE_NO_PAD.encode(digest)
}

pub(crate) fn open_system_browser(url: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(url)
            .spawn()
            .map_err(|e| format!("Could not open browser: {e}"))?;
    }
    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", "", url])
            .spawn()
            .map_err(|e| format!("Could not open browser: {e}"))?;
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(url)
            .spawn()
            .map_err(|e| format!("Could not open browser: {e}"))?;
    }
    Ok(())
}

fn percent_decode(raw: &str) -> String {
    let mut out = Vec::with_capacity(raw.len());
    let bytes = raw.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            b'%' if i + 2 < bytes.len() => {
                let hex = &raw[i + 1..i + 3];
                if let Ok(v) = u8::from_str_radix(hex, 16) {
                    out.push(v);
                    i += 3;
                } else {
                    out.push(bytes[i]);
                    i += 1;
                }
            }
            c => {
                out.push(c);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn parse_query(query: &str) -> HashMap<String, String> {
    let mut map = HashMap::new();
    for pair in query.split('&') {
        if pair.is_empty() {
            continue;
        }
        let mut parts = pair.splitn(2, '=');
        let key = percent_decode(parts.next().unwrap_or(""));
        let value = percent_decode(parts.next().unwrap_or(""));
        map.insert(key, value);
    }
    map
}

pub(crate) fn urlencoding_encode(value: &str) -> String {
    let mut out = String::with_capacity(value.len() * 3);
    for b in value.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char);
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

pub(crate) async fn read_http_request(stream: &mut TcpStream) -> Result<HashMap<String, String>, String> {
    let mut buf = Vec::with_capacity(4096);
    let mut chunk = [0u8; 1024];
    loop {
        let n = timeout(Duration::from_secs(30), stream.read(&mut chunk))
            .await
            .map_err(|_| "Timed out reading OAuth callback".to_string())?
            .map_err(|e| format!("Failed reading OAuth callback: {e}"))?;
        if n == 0 {
            break;
        }
        buf.extend_from_slice(&chunk[..n]);
        if buf.windows(4).any(|w| w == b"\r\n\r\n") {
            break;
        }
        if buf.len() > 64 * 1024 {
            return Err("OAuth callback request too large".into());
        }
    }
    let text = String::from_utf8_lossy(&buf);
    let first = text.lines().next().unwrap_or("");
    let path = first
        .split_whitespace()
        .nth(1)
        .ok_or_else(|| format!("Malformed OAuth callback request: {first}"))?;
    let query = path.splitn(2, '?').nth(1).unwrap_or("");
    Ok(parse_query(query))
}

pub(crate) async fn write_callback_page(stream: &mut TcpStream, ok: bool, message: &str) {
    let title = if ok {
        "Cloudbreak connected"
    } else {
        "Cloudbreak sign-in failed"
    };
    let color = if ok { "#0ea5e9" } else { "#f43f5e" };
    let body = format!(
        r#"<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>{title}</title>
<style>
  body{{font-family:system-ui,-apple-system,sans-serif;background:#0a0a0a;color:#e5e5e5;
    display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}}
  .card{{max-width:28rem;padding:2rem;border:1px solid #262626;border-radius:1rem;background:#171717}}
  h1{{font-size:1.25rem;margin:0 0 .5rem;color:{color}}}
  p{{margin:0;color:#a3a3a3;line-height:1.5}}
</style></head>
<body><div class="card"><h1>{title}</h1><p>{message}</p>
<p style="margin-top:1rem;font-size:.85rem">You can close this tab and return to Cloudbreak Files.</p>
</div></body></html>"#
    );
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(),
        body
    );
    let _ = stream.write_all(response.as_bytes()).await;
    let _ = stream.flush().await;
}

async fn exchange_code(
    client_id: &str,
    code: &str,
    redirect_uri: &str,
    code_verifier: &str,
) -> Result<GoogleOAuthTokens, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(45))
        .build()
        .map_err(|e| e.to_string())?;

    let params = [
        ("client_id", client_id),
        ("code", code),
        ("code_verifier", code_verifier),
        ("grant_type", "authorization_code"),
        ("redirect_uri", redirect_uri),
    ];

    let res = client
        .post(TOKEN_URL)
        .header("Accept", "application/json")
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Token exchange failed: {e}"))?;

    let status = res.status();
    let parsed: TokenResponse = res
        .json()
        .await
        .map_err(|e| format!("Invalid token response: {e}"))?;

    if let Some(err) = parsed.error {
        let detail = parsed.error_description.unwrap_or_default();
        return Err(format!(
            "Google token error ({status}): {err}{}",
            if detail.is_empty() {
                String::new()
            } else {
                format!(" — {detail}")
            }
        ));
    }
    if !status.is_success() {
        return Err(format!("Google token HTTP {status}"));
    }

    Ok(GoogleOAuthTokens {
        access_token: parsed.access_token,
        refresh_token: parsed.refresh_token,
        expires_in: parsed.expires_in,
        token_type: parsed.token_type,
        scope: parsed.scope,
    })
}

async fn refresh_with_client(
    client_id: &str,
    refresh_token: &str,
) -> Result<GoogleOAuthTokens, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(45))
        .build()
        .map_err(|e| e.to_string())?;

    let params = [
        ("client_id", client_id),
        ("refresh_token", refresh_token),
        ("grant_type", "refresh_token"),
    ];

    let res = client
        .post(TOKEN_URL)
        .header("Accept", "application/json")
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Token refresh failed: {e}"))?;

    let status = res.status();
    let parsed: TokenResponse = res
        .json()
        .await
        .map_err(|e| format!("Invalid refresh response: {e}"))?;

    if let Some(err) = parsed.error {
        let detail = parsed.error_description.unwrap_or_default();
        return Err(format!(
            "Google refresh error ({status}): {err}{}",
            if detail.is_empty() {
                String::new()
            } else {
                format!(" — {detail}")
            }
        ));
    }
    if !status.is_success() {
        return Err(format!("Google refresh HTTP {status}"));
    }

    Ok(GoogleOAuthTokens {
        access_token: parsed.access_token,
        refresh_token: parsed
            .refresh_token
            .or_else(|| Some(refresh_token.to_string())),
        expires_in: parsed.expires_in,
        token_type: parsed.token_type,
        scope: parsed.scope,
    })
}

async fn run_sign_in(client_id: String) -> Result<GoogleOAuthTokens, String> {
    let client_id = client_id.trim().to_string();
    if client_id.is_empty() {
        return Err(
            "Google OAuth client ID is not configured. Set VITE_GOOGLE_OAUTH_CLIENT_ID (see docs/google-drive-oauth.md)."
                .into(),
        );
    }

    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| format!("Could not bind OAuth loopback: {e}"))?;
    let port = listener
        .local_addr()
        .map_err(|e| e.to_string())?
        .port();
    let redirect_uri = format!("http://127.0.0.1:{port}/");

    let state = random_urlsafe(24);
    let code_verifier = random_urlsafe(48);
    let challenge = pkce_challenge(&code_verifier);

    let auth_url = format!(
        "{AUTH_URL}?client_id={}&redirect_uri={}&response_type=code&scope={}&state={}&code_challenge={}&code_challenge_method=S256&access_type=offline&prompt=consent",
        urlencoding_encode(&client_id),
        urlencoding_encode(&redirect_uri),
        urlencoding_encode(SCOPES),
        urlencoding_encode(&state),
        urlencoding_encode(&challenge),
    );

    open_system_browser(&auth_url)?;

    let accept = timeout(AUTH_TIMEOUT, listener.accept()).await.map_err(|_| {
        "Google sign-in timed out. Try again and finish in the browser within 5 minutes.".to_string()
    })?;
    let (mut stream, _) = accept.map_err(|e| format!("Waiting for Google sign-in failed: {e}"))?;

    let params = read_http_request(&mut stream).await?;

    if let Some(err) = params.get("error") {
        let desc = params
            .get("error_description")
            .cloned()
            .unwrap_or_default();
        write_callback_page(
            &mut stream,
            false,
            &format!("Google returned an error: {err}. {desc}"),
        )
        .await;
        return Err(format!("Google authorization denied: {err}"));
    }

    let returned_state = params.get("state").cloned().unwrap_or_default();
    if returned_state != state {
        write_callback_page(
            &mut stream,
            false,
            "Invalid OAuth state. Please try again.",
        )
        .await;
        return Err("OAuth state mismatch — possible CSRF. Try signing in again.".into());
    }

    let code = match params.get("code").cloned().filter(|c| !c.is_empty()) {
        Some(c) => c,
        None => {
            write_callback_page(&mut stream, false, "Missing authorization code.").await;
            return Err("Google did not return an authorization code.".into());
        }
    };

    match exchange_code(&client_id, &code, &redirect_uri, &code_verifier).await {
        Ok(tokens) => {
            write_callback_page(
                &mut stream,
                true,
                "Your Google Drive account is connected. Return to Cloudbreak Files.",
            )
            .await;
            Ok(tokens)
        }
        Err(err) => {
            write_callback_page(&mut stream, false, &err).await;
            Err(err)
        }
    }
}

/// Interactive Google sign-in (system browser + loopback). Desktop only.
#[tauri::command]
pub async fn google_oauth_sign_in(client_id: String) -> Result<GoogleOAuthTokens, String> {
    run_sign_in(client_id).await
}

/// Refresh a Google access token using a stored refresh token.
#[tauri::command]
pub async fn google_oauth_refresh(
    client_id: String,
    refresh_token: String,
) -> Result<GoogleOAuthTokens, String> {
    let client_id = client_id.trim().to_string();
    let refresh_token = refresh_token.trim().to_string();
    if client_id.is_empty() {
        return Err("Google OAuth client ID is not configured.".into());
    }
    if refresh_token.is_empty() {
        return Err("Missing Google refresh token — sign in again.".into());
    }
    refresh_with_client(&client_id, &refresh_token).await
}
