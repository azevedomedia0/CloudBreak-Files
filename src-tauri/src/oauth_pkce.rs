//! Official sign-in for Dropbox, OneDrive (Microsoft identity platform) and Nextcloud.
//!
//! Dropbox and OneDrive use OAuth 2.0 authorization code + PKCE with a loopback
//! redirect, the same shape as `oauth_google.rs`. Both are public clients: no
//! client secret is shipped. Nextcloud uses its Login Flow v2, which hands back a
//! revocable app password instead of the account password.

use crate::oauth_google::{
    open_system_browser, pkce_challenge, random_urlsafe, read_http_request, urlencoding_encode,
    write_callback_page, GoogleOAuthTokens,
};
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tokio::net::TcpListener;
use tokio::time::{sleep, timeout, Instant};

const AUTH_TIMEOUT: Duration = Duration::from_secs(300);

/// Dropbox matches redirect URIs exactly, so the loopback port must be one the
/// app registered in the Dropbox App Console (see docs/cloud-oauth.md).
const DROPBOX_PORTS: [u16; 5] = [53682, 53683, 53684, 53685, 53686];

struct Provider {
    name: &'static str,
    auth_url: &'static str,
    token_url: &'static str,
    scopes: &'static str,
    /// Extra, already-encoded authorize query parameters.
    extra_auth: &'static str,
    /// Host written into the redirect URI.
    redirect_host: &'static str,
    /// Fixed ports to try in order; empty means any free port.
    ports: &'static [u16],
}

fn provider(id: &str) -> Result<Provider, String> {
    match id {
        "dropbox" => Ok(Provider {
            name: "Dropbox",
            auth_url: "https://www.dropbox.com/oauth2/authorize",
            token_url: "https://api.dropboxapi.com/oauth2/token",
            scopes: "account_info.read files.metadata.read files.content.read files.content.write",
            extra_auth: "&token_access_type=offline",
            redirect_host: "127.0.0.1",
            ports: &DROPBOX_PORTS,
        }),
        "onedrive" => Ok(Provider {
            name: "OneDrive",
            auth_url: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
            token_url: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
            scopes: "Files.ReadWrite offline_access User.Read",
            extra_auth: "&prompt=select_account",
            redirect_host: "localhost",
            ports: &[],
        }),
        other => Err(format!("Unknown OAuth provider: {other}")),
    }
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: Option<String>,
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

fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(45))
        .build()
        .map_err(|e| e.to_string())
}

async fn post_token(
    p: &Provider,
    params: &[(&str, &str)],
    what: &str,
    keep_refresh: Option<&str>,
) -> Result<GoogleOAuthTokens, String> {
    let res = http_client()?
        .post(p.token_url)
        .header("Accept", "application/json")
        .form(params)
        .send()
        .await
        .map_err(|e| format!("{} {what} failed: {e}", p.name))?;

    let status = res.status();
    let parsed: TokenResponse = res
        .json()
        .await
        .map_err(|e| format!("Invalid {} {what} response: {e}", p.name))?;

    if let Some(err) = parsed.error {
        let detail = parsed.error_description.unwrap_or_default();
        return Err(format!(
            "{} {what} error ({status}): {err}{}",
            p.name,
            if detail.is_empty() {
                String::new()
            } else {
                format!(" — {}", detail.lines().next().unwrap_or(""))
            }
        ));
    }
    if !status.is_success() {
        return Err(format!("{} {what} HTTP {status}", p.name));
    }
    let access_token = parsed
        .access_token
        .filter(|t| !t.is_empty())
        .ok_or_else(|| format!("{} {what} returned no access token", p.name))?;

    Ok(GoogleOAuthTokens {
        access_token,
        // Dropbox does not rotate refresh tokens; keep the one we sent.
        refresh_token: parsed
            .refresh_token
            .or_else(|| keep_refresh.map(str::to_string)),
        expires_in: parsed.expires_in,
        token_type: parsed.token_type,
        scope: parsed.scope,
    })
}

async fn bind_loopback(p: &Provider) -> Result<TcpListener, String> {
    if p.ports.is_empty() {
        return TcpListener::bind("127.0.0.1:0")
            .await
            .map_err(|e| format!("Could not bind OAuth loopback: {e}"));
    }
    for port in p.ports {
        if let Ok(listener) = TcpListener::bind(("127.0.0.1", *port)).await {
            return Ok(listener);
        }
    }
    Err(format!(
        "Could not open a sign-in port for {} (tried {}–{}). Close whatever is using them and try again.",
        p.name,
        p.ports[0],
        p.ports[p.ports.len() - 1]
    ))
}

async fn run_sign_in(provider_id: &str, client_id: String) -> Result<GoogleOAuthTokens, String> {
    let p = provider(provider_id)?;
    let client_id = client_id.trim().to_string();
    if client_id.is_empty() {
        return Err(format!(
            "{} OAuth client ID is not configured (see docs/cloud-oauth.md).",
            p.name
        ));
    }

    let listener = bind_loopback(&p).await?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let redirect_uri = format!("http://{}:{port}/", p.redirect_host);

    let state = random_urlsafe(24);
    let code_verifier = random_urlsafe(48);
    let challenge = pkce_challenge(&code_verifier);

    let auth_url = format!(
        "{}?client_id={}&redirect_uri={}&response_type=code&scope={}&state={}&code_challenge={}&code_challenge_method=S256{}",
        p.auth_url,
        urlencoding_encode(&client_id),
        urlencoding_encode(&redirect_uri),
        urlencoding_encode(p.scopes),
        urlencoding_encode(&state),
        urlencoding_encode(&challenge),
        p.extra_auth,
    );
    open_system_browser(&auth_url)?;

    let accept = timeout(AUTH_TIMEOUT, listener.accept()).await.map_err(|_| {
        format!(
            "{} sign-in timed out. Try again and finish in the browser within 5 minutes.",
            p.name
        )
    })?;
    let (mut stream, _) = accept.map_err(|e| format!("Waiting for {} sign-in failed: {e}", p.name))?;
    let params = read_http_request(&mut stream).await?;

    if let Some(err) = params.get("error") {
        let desc = params.get("error_description").cloned().unwrap_or_default();
        write_callback_page(
            &mut stream,
            false,
            &format!("{} returned an error: {err}. {desc}", p.name),
        )
        .await;
        return Err(format!("{} authorization denied: {err}", p.name));
    }
    if params.get("state").map(String::as_str) != Some(state.as_str()) {
        write_callback_page(&mut stream, false, "Invalid OAuth state. Please try again.").await;
        return Err("OAuth state mismatch — possible CSRF. Try signing in again.".into());
    }
    let code = match params.get("code").filter(|c| !c.is_empty()) {
        Some(c) => c.clone(),
        None => {
            write_callback_page(&mut stream, false, "Missing authorization code.").await;
            return Err(format!("{} did not return an authorization code.", p.name));
        }
    };

    let result = post_token(
        &p,
        &[
            ("client_id", client_id.as_str()),
            ("code", code.as_str()),
            ("code_verifier", code_verifier.as_str()),
            ("grant_type", "authorization_code"),
            ("redirect_uri", redirect_uri.as_str()),
        ],
        "token exchange",
        None,
    )
    .await;

    match &result {
        Ok(_) => {
            write_callback_page(
                &mut stream,
                true,
                &format!("Your {} account is connected. Return to Cloudbreak Files.", p.name),
            )
            .await
        }
        Err(err) => write_callback_page(&mut stream, false, err).await,
    }
    result
}

/// Interactive Dropbox / OneDrive sign-in (system browser + loopback). Desktop only.
#[tauri::command]
pub async fn oauth_sign_in(provider: String, client_id: String) -> Result<GoogleOAuthTokens, String> {
    run_sign_in(&provider, client_id).await
}

/// Refresh a Dropbox / OneDrive access token from a stored refresh token.
#[tauri::command]
pub async fn oauth_refresh(
    provider: String,
    client_id: String,
    refresh_token: String,
) -> Result<GoogleOAuthTokens, String> {
    let p = self::provider(&provider)?;
    let client_id = client_id.trim().to_string();
    let refresh_token = refresh_token.trim().to_string();
    if client_id.is_empty() {
        return Err(format!("{} OAuth client ID is not configured.", p.name));
    }
    if refresh_token.is_empty() {
        return Err(format!("Missing {} refresh token — sign in again.", p.name));
    }
    let mut params = vec![
        ("client_id", client_id.as_str()),
        ("refresh_token", refresh_token.as_str()),
        ("grant_type", "refresh_token"),
    ];
    if provider == "onedrive" {
        params.push(("scope", p.scopes));
    }
    post_token(&p, &params, "token refresh", Some(&refresh_token)).await
}

// ---------------------------------------------------------------------------
// Nextcloud Login Flow v2
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct LoginInit {
    poll: LoginPoll,
    login: String,
}

#[derive(Deserialize)]
struct LoginPoll {
    token: String,
    endpoint: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LoginResult {
    server: String,
    login_name: String,
    app_password: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NextcloudLogin {
    pub username: String,
    pub app_password: String,
    /// WebDAV files endpoint for this user.
    pub endpoint: String,
}

fn normalize_server(raw: &str) -> Result<String, String> {
    let mut s = raw.trim().trim_end_matches('/').to_string();
    for tail in ["/index.php", "/login"] {
        if let Some(stripped) = s.strip_suffix(tail) {
            s = stripped.to_string();
        }
    }
    if let Some(i) = s.find("/remote.php") {
        s.truncate(i);
    }
    let url = reqwest::Url::parse(&s).map_err(|_| "Enter the full Nextcloud address, e.g. https://cloud.example.org".to_string())?;
    let local = matches!(url.host_str(), Some("localhost") | Some("127.0.0.1"));
    if url.scheme() != "https" && !(url.scheme() == "http" && local) {
        return Err("Nextcloud sign-in requires an https:// address.".into());
    }
    Ok(s)
}

/// Nextcloud Login Flow v2: the user approves in the browser, Cloudbreak receives
/// a revocable app password (never the account password).
#[tauri::command]
pub async fn nextcloud_login_flow(server: String) -> Result<NextcloudLogin, String> {
    let server = normalize_server(&server)?;
    let client = http_client()?;

    let init: LoginInit = client
        .post(format!("{server}/index.php/login/v2"))
        .header("User-Agent", "Cloudbreak Files")
        .send()
        .await
        .map_err(|e| format!("Could not reach {server}: {e}"))?
        .error_for_status()
        .map_err(|_| "That address does not look like a Nextcloud server (Login Flow v2 not found).".to_string())?
        .json()
        .await
        .map_err(|_| "Unexpected reply from the Nextcloud server.".to_string())?;

    // The poll endpoint comes from the server; only follow it on the same origin.
    let base = reqwest::Url::parse(&server).map_err(|e| e.to_string())?;
    let poll = reqwest::Url::parse(&init.poll.endpoint).map_err(|e| e.to_string())?;
    if poll.origin() != base.origin() {
        return Err("Nextcloud returned a sign-in address on a different server; refusing to continue.".into());
    }
    let login = reqwest::Url::parse(&init.login).map_err(|e| e.to_string())?;
    if login.origin() != base.origin() {
        return Err("Nextcloud returned a login page on a different server; refusing to continue.".into());
    }
    open_system_browser(login.as_str())?;

    let deadline = Instant::now() + AUTH_TIMEOUT;
    loop {
        if Instant::now() >= deadline {
            return Err("Nextcloud sign-in timed out. Try again and approve it in the browser within 5 minutes.".into());
        }
        sleep(Duration::from_secs(2)).await;
        let res = client
            .post(poll.clone())
            .header("User-Agent", "Cloudbreak Files")
            .form(&[("token", init.poll.token.as_str())])
            .send()
            .await
            .map_err(|e| format!("Waiting for Nextcloud sign-in failed: {e}"))?;
        if res.status() == reqwest::StatusCode::NOT_FOUND {
            continue; // not approved yet
        }
        if !res.status().is_success() {
            return Err(format!("Nextcloud sign-in failed (HTTP {}).", res.status()));
        }
        let done: LoginResult = res
            .json()
            .await
            .map_err(|_| "Unexpected reply from the Nextcloud server.".to_string())?;
        let host = normalize_server(&done.server).unwrap_or(server.clone());
        return Ok(NextcloudLogin {
            endpoint: format!(
                "{host}/remote.php/dav/files/{}",
                urlencoding_encode(&done.login_name)
            ),
            username: done.login_name,
            app_password: done.app_password,
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_providers_resolve() {
        assert!(provider("dropbox").is_ok());
        assert!(provider("onedrive").is_ok());
        assert!(provider("mega").is_err());
    }

    #[test]
    fn dropbox_uses_fixed_ports_and_onedrive_does_not() {
        assert!(!provider("dropbox").ok().unwrap().ports.is_empty());
        assert!(provider("onedrive").ok().unwrap().ports.is_empty());
    }

    #[test]
    fn nextcloud_server_is_normalized() {
        assert_eq!(normalize_server("https://c.example.org/").unwrap(), "https://c.example.org");
        assert_eq!(
            normalize_server("https://c.example.org/remote.php/dav/files/me").unwrap(),
            "https://c.example.org"
        );
        assert_eq!(
            normalize_server("https://c.example.org/index.php").unwrap(),
            "https://c.example.org"
        );
        assert!(normalize_server("http://c.example.org").is_err());
        assert!(normalize_server("not a url").is_err());
        assert!(normalize_server("http://localhost:8080").is_ok());
    }
}
