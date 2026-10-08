//! COSMIC `Application` — Cloudbreak Files shell wired to real P2P + local FS + vault.

use std::sync::Arc;

use cosmic::app::{Core, Settings, Task};
use cosmic::iced::{Alignment, Length, Size};
use cosmic::widget::{self, nav_bar};
use cosmic::{executor, Application, ApplicationExt, Element};

/// Wrap an app message for `Task::perform` (`Task<M>` = `iced::Task<Action<M>>`).
fn map_msg<T>(f: impl FnOnce(T) -> Message + 'static + Send) -> impl FnOnce(T) -> cosmic::Action<Message> {
    move |v| cosmic::Action::App(f(v))
}

use crate::crypto::{create_verifier, verify_passphrase};
use crate::domain::filter::{filter_files, sort_files, SortDir, SortKey};
use crate::domain::preferences::{
    load_preferences, load_profile, save_preferences, save_profile, AppPreferences, AppTheme,
    UserProfile,
};
use crate::domain::sample::{format_bytes, SampleLibrary};
use crate::domain::{FileCategory, FileItem, LibraryDirection, NavDestination, ViewMode};
use crate::local_fs::{self, home_dir};
use crate::p2p::service::{
    p2p_create_library, p2p_export_invite, p2p_get_identity, p2p_list_libraries, p2p_swarm_status,
    CreateLibraryFile, CreateLibraryRequest, IdentityInfo,
};
use crate::p2p::{LibraryRecord, P2pState};
use crate::paths;
use crate::vault_store;

use super::pages;

const APP_ID: &str = "com.cloudbreak.Files";

#[derive(Debug, Clone)]
pub enum Message {
    SelectFile(String),
    SetViewMode(ViewMode),
    SetTheme(AppTheme),
    SetCategory(FileCategory),
    SetSort(SortKey),
    ToggleSortDir,
    SearchChanged(String),
    ToggleInspector,
    ToggleStarredFilter,
    VaultPassphraseChanged(String),
    UnlockVault,
    LockVault,
    SavePreferences,
    ProfileNameChanged(String),
    ProfileEmailChanged(String),
    SaveProfile,
    RefreshLocal,
    NavigateLocalUp,
    OpenLocalFolder(String),
    // P2P
    EnsureIdentity,
    IdentityLoaded(Result<IdentityInfo, String>),
    RefreshLibraries,
    LibrariesLoaded(Result<Vec<LibraryRecord>, String>),
    NewLibraryName(String),
    NewLibraryDesc(String),
    NewLibraryPassphrase(String),
    CreateLibrary,
    LibraryCreated(Result<(String, String), String>),
    ExportInvite(String),
    InviteReady(Result<String, String>),
    StartSwarm,
    SwarmStatus(Result<String, String>),
    CopyToast(String),
    SettingsTab(pages::SettingsTab),
    OpenPlaceholder(&'static str),
}

pub struct App {
    core: Core,
    nav_model: nav_bar::Model,
    destination: NavDestination,
    library: SampleLibrary,
    preferences: AppPreferences,
    profile: UserProfile,
    selected_file_id: Option<String>,
    view_mode: ViewMode,
    search: String,
    category: FileCategory,
    sort_key: SortKey,
    sort_dir: SortDir,
    starred_only: bool,
    inspector_open: bool,
    vault_unlocked: bool,
    vault_passphrase: String,
    vault_status: String,
    toast: String,
    // Local FS
    local_cwd: std::path::PathBuf,
    local_files: Vec<FileItem>,
    local_folders: Vec<crate::domain::FolderItem>,
    // P2P
    p2p: Arc<P2pState>,
    identity: Option<IdentityInfo>,
    p2p_libraries: Vec<LibraryRecord>,
    new_lib_name: String,
    new_lib_desc: String,
    new_lib_pass: String,
    last_invite: String,
    settings_tab: pages::SettingsTab,
}

pub fn run() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "cloudbreak_files_linux=info".into()),
        )
        .init();

    let settings = Settings::default()
        .size(Size::new(1360.0, 860.0))
        .client_decorations(true);

    cosmic::app::run::<App>(settings, ())?;
    Ok(())
}

impl Application for App {
    type Executor = executor::Default;
    type Flags = ();
    type Message = Message;

    const APP_ID: &'static str = APP_ID;

    fn core(&self) -> &Core {
        &self.core
    }

    fn core_mut(&mut self) -> &mut Core {
        &mut self.core
    }

    fn init(core: Core, _flags: Self::Flags) -> (Self, Task<Self::Message>) {
        let preferences = load_preferences();
        let profile = load_profile();
        let library = SampleLibrary::new();
        let selected_file_id = library.files.first().map(|f| f.id.clone());
        let local_cwd = home_dir();

        let mut nav_model = nav_bar::Model::default();
        for (dest, label, icon) in [
            (NavDestination::AllFiles, "All Files", "folder-symbolic"),
            (NavDestination::Starred, "Starred", "starred-symbolic"),
            (
                NavDestination::Vault,
                "Private Vault",
                "channel-secure-symbolic",
            ),
            (
                NavDestination::LocalFiles,
                "Local Files",
                "drive-harddisk-symbolic",
            ),
            (
                NavDestination::CloudAccounts,
                "Cloud Accounts",
                "cloud-symbolic",
            ),
            (
                NavDestination::OutgoingLibraries,
                "Outgoing",
                "network-transmit-symbolic",
            ),
            (
                NavDestination::IncomingLibraries,
                "Incoming",
                "network-receive-symbolic",
            ),
            (
                NavDestination::Settings,
                "Settings",
                "preferences-system-symbolic",
            ),
        ] {
            nav_model
                .insert()
                .text(label)
                .icon(widget::icon::from_name(icon))
                .data(dest);
        }
        nav_model.activate_position(0);

        let mut app = App {
            core,
            nav_model,
            destination: NavDestination::AllFiles,
            library,
            view_mode: preferences.default_view,
            inspector_open: preferences.show_inspector_on_launch,
            preferences,
            profile,
            selected_file_id,
            search: String::new(),
            category: FileCategory::All,
            sort_key: SortKey::Name,
            sort_dir: SortDir::Asc,
            starred_only: false,
            vault_unlocked: false,
            vault_passphrase: String::new(),
            vault_status: "Vault locked".into(),
            toast: format!("Data dir: {}", paths::app_data_dir().display()),
            local_cwd: local_cwd.clone(),
            local_files: Vec::new(),
            local_folders: Vec::new(),
            p2p: Arc::new(P2pState::new()),
            identity: None,
            p2p_libraries: Vec::new(),
            new_lib_name: String::new(),
            new_lib_desc: String::new(),
            new_lib_pass: String::new(),
            last_invite: String::new(),
            settings_tab: pages::SettingsTab::Appearance,
        };
        app.reload_local();

        let p2p = app.p2p.clone();
        let name = app.profile.name.clone();
        let boot = Task::perform(
            async move { p2p_get_identity(&p2p, Some(name)) },
            map_msg(Message::IdentityLoaded),
        );

        (app, boot)
    }

    fn nav_model(&self) -> Option<&nav_bar::Model> {
        Some(&self.nav_model)
    }

    fn on_nav_select(&mut self, id: nav_bar::Id) -> Task<Self::Message> {
        self.nav_model.activate(id);
        if let Some(dest) = self.nav_model.data::<NavDestination>(id).copied() {
            self.destination = dest;
            self.set_header_title(nav_title(dest).into());
            if matches!(
                dest,
                NavDestination::OutgoingLibraries | NavDestination::IncomingLibraries
            ) {
                return self.refresh_libraries_task();
            }
            if dest == NavDestination::LocalFiles {
                self.reload_local();
            }
        }
        Task::none()
    }

    fn update(&mut self, message: Self::Message) -> Task<Self::Message> {
        match message {
            Message::SelectFile(id) => self.selected_file_id = Some(id),
            Message::SetViewMode(mode) => {
                self.view_mode = mode;
                self.preferences.default_view = mode;
            }
            Message::SetTheme(theme) => {
                self.preferences.theme = theme;
                self.toast = format!("Theme → {}", theme.label());
            }
            Message::SetCategory(c) => self.category = c,
            Message::SetSort(k) => self.sort_key = k,
            Message::ToggleSortDir => {
                self.sort_dir = match self.sort_dir {
                    SortDir::Asc => SortDir::Desc,
                    SortDir::Desc => SortDir::Asc,
                };
            }
            Message::SearchChanged(q) => self.search = q,
            Message::ToggleInspector => self.inspector_open = !self.inspector_open,
            Message::ToggleStarredFilter => self.starred_only = !self.starred_only,
            Message::VaultPassphraseChanged(p) => self.vault_passphrase = p,
            Message::UnlockVault => self.try_unlock_vault(),
            Message::LockVault => {
                self.vault_unlocked = false;
                self.vault_passphrase.clear();
                self.vault_status = "Vault locked".into();
            }
            Message::SavePreferences => match save_preferences(&self.preferences) {
                Ok(()) => self.toast = "Preferences saved".into(),
                Err(e) => self.toast = format!("Save failed: {e}"),
            },
            Message::ProfileNameChanged(n) => self.profile.name = n,
            Message::ProfileEmailChanged(e) => self.profile.email = e,
            Message::SaveProfile => match save_profile(&self.profile) {
                Ok(()) => self.toast = "Profile saved".into(),
                Err(e) => self.toast = e,
            },
            Message::RefreshLocal => self.reload_local(),
            Message::NavigateLocalUp => {
                if let Some(parent) = self.local_cwd.parent() {
                    self.local_cwd = parent.to_path_buf();
                    self.reload_local();
                }
            }
            Message::OpenLocalFolder(name) => {
                let next = self.local_cwd.join(name);
                if next.is_dir() {
                    self.local_cwd = next;
                    self.reload_local();
                }
            }
            Message::EnsureIdentity => {
                let p2p = self.p2p.clone();
                let name = self.profile.name.clone();
                return Task::perform(
                    async move { p2p_get_identity(&p2p, Some(name)) },
                    map_msg(Message::IdentityLoaded),
                );
            }
            Message::IdentityLoaded(res) => match res {
                Ok(info) => {
                    self.toast = format!("Peer {}", &info.peer_id[..8.min(info.peer_id.len())]);
                    self.identity = Some(info);
                }
                Err(e) => self.toast = e,
            },
            Message::RefreshLibraries => return self.refresh_libraries_task(),
            Message::LibrariesLoaded(res) => match res {
                Ok(libs) => {
                    self.p2p_libraries = libs;
                    self.toast = format!("{} P2P libraries", self.p2p_libraries.len());
                }
                Err(e) => self.toast = e,
            },
            Message::NewLibraryName(s) => self.new_lib_name = s,
            Message::NewLibraryDesc(s) => self.new_lib_desc = s,
            Message::NewLibraryPassphrase(s) => self.new_lib_pass = s,
            Message::CreateLibrary => {
                let p2p = self.p2p.clone();
                let name = self.new_lib_name.clone();
                let desc = self.new_lib_desc.clone();
                let pass = self.new_lib_pass.clone();
                let sample = b"Hello from Cloudbreak Linux COSMIC".to_vec();
                return Task::perform(
                    async move {
                        let req = CreateLibraryRequest {
                            name: if name.is_empty() {
                                "Untitled Library".into()
                            } else {
                                name
                            },
                            description: desc,
                            role: "viewer".into(),
                            recipient_email: None,
                            recipient_x25519_hex: None,
                            invite_passphrase: if pass.len() >= 8 { Some(pass) } else { None },
                            bandwidth_cap: None,
                            expires_in_days: Some(30),
                            allow_downloads: Some(true),
                            files: vec![CreateLibraryFile {
                                name: "readme.txt".into(),
                                mime_type: "text/plain".into(),
                                content_base64: base64::Engine::encode(
                                    &base64::engine::general_purpose::STANDARD,
                                    &sample,
                                ),
                            }],
                        };
                        p2p_create_library(&p2p, req)
                            .await
                            .map(|r| (r.library_id, r.invite))
                    },
                    map_msg(Message::LibraryCreated),
                );
            }
            Message::LibraryCreated(res) => match res {
                Ok((id, invite)) => {
                    self.last_invite = invite;
                    self.toast = format!("Created library {id}");
                    self.new_lib_name.clear();
                    return self.refresh_libraries_task();
                }
                Err(e) => self.toast = e,
            },
            Message::ExportInvite(id) => {
                let p2p = self.p2p.clone();
                return Task::perform(
                    async move { p2p_export_invite(&p2p, id) },
                    map_msg(Message::InviteReady),
                );
            }
            Message::InviteReady(res) => match res {
                Ok(inv) => {
                    self.last_invite = inv;
                    self.toast = "Invite ready (copy from Libraries page)".into();
                }
                Err(e) => self.toast = e,
            },
            Message::StartSwarm => {
                let p2p = self.p2p.clone();
                return Task::perform(
                    async move {
                        p2p_swarm_status(&p2p).await.map(|s| {
                            format!(
                                "listening={} peers={} seeding={}",
                                s.listening,
                                s.peers.len(),
                                s.seeding_root_cids.len()
                            )
                        })
                    },
                    map_msg(Message::SwarmStatus),
                );
            }
            Message::SwarmStatus(res) => match res {
                Ok(s) => self.toast = s,
                Err(e) => self.toast = e,
            },
            Message::CopyToast(s) => self.toast = s,
            Message::SettingsTab(t) => self.settings_tab = t,
            Message::OpenPlaceholder(name) => {
                self.toast = format!("{name} — finish on Pop!_OS if needed");
            }
        }
        Task::none()
    }

    fn view(&self) -> Element<'_, Self::Message> {
        let content = match self.destination {
            NavDestination::Settings => pages::settings(
                self.settings_tab,
                &self.preferences,
                &self.profile,
                &self.vault_status,
                self.vault_unlocked,
                &self.vault_passphrase,
                self.identity.as_ref(),
            ),
            NavDestination::CloudAccounts => pages::cloud_accounts(&self.library.accounts),
            NavDestination::OutgoingLibraries | NavDestination::IncomingLibraries => {
                let outgoing = self.destination == NavDestination::OutgoingLibraries;
                pages::p2p_libraries(
                    outgoing,
                    &self.p2p_libraries,
                    &self.new_lib_name,
                    &self.new_lib_desc,
                    &self.new_lib_pass,
                    &self.last_invite,
                    self.identity.as_ref(),
                )
            }
            NavDestination::LocalFiles => pages::local_browser(
                &self.local_cwd,
                &self.local_folders,
                &self.local_files,
                self.selected_file(),
                self.inspector_open,
            ),
            _ => {
                let mut files = self.browser_files();
                sort_files(&mut files, self.sort_key, self.sort_dir);
                pages::browser(
                    &files,
                    self.selected_file(),
                    self.view_mode,
                    &self.search,
                    self.category,
                    self.starred_only,
                    self.inspector_open,
                    self.vault_unlocked,
                )
            }
        };

        let status = widget::container(
            widget::row::with_capacity(3)
                .push(widget::text::caption(self.toast.as_str()))
                .push(widget::Space::new().width(Length::Fill))
                .push(widget::text::caption(match &self.identity {
                    Some(id) => format!("peer {}", &id.peer_id[..8.min(id.peer_id.len())]),
                    None => "no peer id".into(),
                }))
                .spacing(12)
                .align_y(Alignment::Center),
        )
        .padding([8, 16])
        .width(Length::Fill);

        widget::column::with_capacity(2)
            .push(content)
            .push(status)
            .width(Length::Fill)
            .height(Length::Fill)
            .into()
    }

    fn header_start(&self) -> Vec<Element<'_, Self::Message>> {
        vec![widget::text::title4("Cloudbreak Files").into()]
    }

    fn header_end(&self) -> Vec<Element<'_, Self::Message>> {
        vec![
            widget::row::with_capacity(4)
                .spacing(4)
                .push(
                    widget::button::standard("Icons")
                        .on_press(Message::SetViewMode(ViewMode::Icons)),
                )
                .push(
                    widget::button::standard("List")
                        .on_press(Message::SetViewMode(ViewMode::List)),
                )
                .push(
                    widget::button::standard("Columns")
                        .on_press(Message::SetViewMode(ViewMode::Columns)),
                )
                .push(
                    widget::button::standard("Gallery")
                        .on_press(Message::SetViewMode(ViewMode::Gallery)),
                )
                .into(),
            widget::button::standard(if self.inspector_open {
                "Hide Inspector"
            } else {
                "Inspector"
            })
            .on_press(Message::ToggleInspector)
            .into(),
        ]
    }
}

impl App {
    fn browser_files(&self) -> Vec<&FileItem> {
        let starred = self.destination == NavDestination::Starred || self.starred_only;
        let cat = if self.destination == NavDestination::Starred {
            FileCategory::All
        } else {
            self.category
        };
        filter_files(&self.library.files, &self.search, cat, starred)
            .into_iter()
            .filter(|f| {
                self.destination != NavDestination::Vault
                    || f.account_id == crate::domain::CloudProviderId::Vault
            })
            .collect()
    }

    fn selected_file(&self) -> Option<&FileItem> {
        let id = self.selected_file_id.as_deref()?;
        self.library
            .files
            .iter()
            .find(|f| f.id == id)
            .or_else(|| self.local_files.iter().find(|f| f.id == id))
    }

    fn reload_local(&mut self) {
        match local_fs::list_directory(&self.local_cwd) {
            Ok((folders, files)) => {
                self.local_folders = folders;
                self.local_files = files;
                self.toast = format!(
                    "{} — {} folders, {} files",
                    self.local_cwd.display(),
                    self.local_folders.len(),
                    self.local_files.len()
                );
            }
            Err(e) => self.toast = e.to_string(),
        }
    }

    fn refresh_libraries_task(&self) -> Task<Message> {
        let p2p = self.p2p.clone();
        Task::perform(
            async move { p2p_list_libraries(&p2p) },
            map_msg(Message::LibrariesLoaded),
        )
    }

    fn try_unlock_vault(&mut self) {
        let path = paths::vault_path();
        match vault_store::load(&path) {
            Ok(None) => match create_verifier(&self.vault_passphrase) {
                Ok(v) => match vault_store::save(&path, &v) {
                    Ok(()) => {
                        self.vault_unlocked = true;
                        self.vault_status = "Vault created & unlocked".into();
                        self.vault_passphrase.clear();
                    }
                    Err(e) => self.vault_status = e,
                },
                Err(e) => self.vault_status = e.to_string(),
            },
            Ok(Some(verifier)) => {
                if verify_passphrase(&verifier, &self.vault_passphrase) {
                    self.vault_unlocked = true;
                    self.vault_status = "Vault unlocked".into();
                    self.vault_passphrase.clear();
                } else {
                    self.vault_status = "Incorrect passphrase".into();
                }
            }
            Err(e) => self.vault_status = e,
        }
    }
}

fn nav_title(dest: NavDestination) -> &'static str {
    match dest {
        NavDestination::AllFiles => "All Files",
        NavDestination::Starred => "Starred",
        NavDestination::Vault => "Private Vault",
        NavDestination::LocalFiles => "Local Files",
        NavDestination::CloudAccounts => "Cloud Accounts",
        NavDestination::OutgoingLibraries => "Outgoing Libraries",
        NavDestination::IncomingLibraries => "Incoming Libraries",
        NavDestination::Settings => "Settings",
    }
}

#[allow(dead_code)]
pub fn file_subtitle(file: &FileItem) -> String {
    format!("{} · {}", format_bytes(file.size_bytes), file.folder_path)
}

// Silence unused import in non-cosmic builds via re-export usage
#[allow(dead_code)]
fn _dir_marker(_: LibraryDirection) {}
