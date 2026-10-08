//! Lightweight document buffer (rich editor UI is a Pop!_OS follow-up).

use std::fs;
use std::path::Path;

#[derive(Debug, thiserror::Error)]
pub enum EditorError {
    #[error("{0}")]
    Io(String),
}

#[derive(Debug, Clone, Default)]
pub struct DocumentBuffer {
    pub path: Option<String>,
    pub title: String,
    pub body: String,
    pub dirty: bool,
}

pub fn open_text_document(path: &Path) -> Result<DocumentBuffer, EditorError> {
    let body = fs::read_to_string(path).map_err(|e| EditorError::Io(e.to_string()))?;
    let title = path
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "Untitled".into());
    Ok(DocumentBuffer {
        path: Some(path.to_string_lossy().into_owned()),
        title,
        body,
        dirty: false,
    })
}

pub fn save_text_document(doc: &DocumentBuffer) -> Result<(), EditorError> {
    let path = doc
        .path
        .as_ref()
        .ok_or_else(|| EditorError::Io("no path".into()))?;
    fs::write(path, &doc.body).map_err(|e| EditorError::Io(e.to_string()))
}
