//! Cloud provider adapters.
//!
//! `http` is fully ported. Per-provider list/upload APIs still need wiring on Pop!_OS
//! (tokens, OAuth, WebDAV) — see stubs below mirroring `src/services/cloud/`.

pub mod http;

use crate::domain::{CloudAccount, CloudProviderId, FileItem, FolderItem};

#[derive(Debug, thiserror::Error)]
pub enum CloudError {
    #[error("{0}")]
    Message(String),
    #[error("cloud adapter not fully wired: {0}")]
    NotWired(&'static str),
}

pub trait CloudAdapter: Send + Sync {
    fn provider_id(&self) -> CloudProviderId;
    fn list_files(&self, _account: &CloudAccount) -> Result<Vec<FileItem>, CloudError> {
        Err(CloudError::NotWired("list_files"))
    }
    fn list_folders(&self, _account: &CloudAccount) -> Result<Vec<FolderItem>, CloudError> {
        Err(CloudError::NotWired("list_folders"))
    }
}

macro_rules! stub_adapter {
    ($name:ident, $id:expr) => {
        pub struct $name;
        impl CloudAdapter for $name {
            fn provider_id(&self) -> CloudProviderId {
                $id
            }
        }
    };
}

stub_adapter!(GoogleDriveAdapter, CloudProviderId::Gdrive);
stub_adapter!(DropboxAdapter, CloudProviderId::Dropbox);
stub_adapter!(OneDriveAdapter, CloudProviderId::Onedrive);
stub_adapter!(MegaAdapter, CloudProviderId::Mega);
stub_adapter!(NextcloudAdapter, CloudProviderId::Nextcloud);
stub_adapter!(S3Adapter, CloudProviderId::S3);

pub fn all_stub_adapters() -> Vec<Box<dyn CloudAdapter>> {
    vec![
        Box::new(GoogleDriveAdapter),
        Box::new(DropboxAdapter),
        Box::new(OneDriveAdapter),
        Box::new(MegaAdapter),
        Box::new(NextcloudAdapter),
        Box::new(S3Adapter),
    ]
}
