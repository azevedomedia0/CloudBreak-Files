use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Deserialize)]
pub struct CloudHttpRequest {
    pub method: String,
    pub url: String,
    #[serde(default)]
    pub headers: HashMap<String, String>,
    pub body: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct CloudHttpResponse {
    pub status: u16,
    pub body: String,
    pub headers: HashMap<String, String>,
}

/// Proxy cloud API calls from the desktop shell so browser CORS does not block them.
#[tauri::command]
pub async fn cloud_http(req: CloudHttpRequest) -> Result<CloudHttpResponse, String> {
    let method = req.method.to_uppercase();
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(45))
        .build()
        .map_err(|e| format!("HTTP client error: {e}"))?;

    let mut builder = match method.as_str() {
        "GET" => client.get(&req.url),
        "POST" => client.post(&req.url),
        "PUT" => client.put(&req.url),
        "PATCH" => client.patch(&req.url),
        "DELETE" => client.delete(&req.url),
        "PROPFIND" => client.request(
            reqwest::Method::from_bytes(b"PROPFIND").map_err(|_| "Invalid PROPFIND method".to_string())?,
            &req.url,
        ),
        other => return Err(format!("Unsupported HTTP method: {other}")),
    };

    for (key, value) in &req.headers {
        builder = builder.header(key, value);
    }

    if let Some(body) = &req.body {
        builder = builder.body(body.clone());
    }

    let response = builder.send().await.map_err(|e| format!("Request failed: {e}"))?;
    let status = response.status().as_u16();
    let mut headers = HashMap::new();
    for (key, value) in response.headers() {
        if let Ok(v) = value.to_str() {
            headers.insert(key.to_string(), v.to_string());
        }
    }
    let body = response.text().await.map_err(|e| format!("Failed to read body: {e}"))?;

    Ok(CloudHttpResponse {
        status,
        body,
        headers,
    })
}
