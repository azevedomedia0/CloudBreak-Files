//! COSMIC page builders.

use cosmic::iced::{Alignment, Length};
use cosmic::widget;
use cosmic::Element;

use crate::domain::filter::SortKey;
use crate::domain::preferences::{AppPreferences, AppTheme, UserProfile};
use crate::domain::sample::format_bytes;
use crate::domain::{CloudAccount, FileCategory, FileItem, FolderItem, ViewMode};
use crate::p2p::library_store::LibraryRecord;
use crate::p2p::service::IdentityInfo;

use super::app::Message;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SettingsTab {
    Appearance,
    Profile,
    Security,
    General,
}

pub fn browser<'a>(
    files: &[&'a FileItem],
    selected: Option<&'a FileItem>,
    view_mode: ViewMode,
    search: &'a str,
    category: FileCategory,
    starred_only: bool,
    inspector_open: bool,
    vault_unlocked: bool,
) -> Element<'a, Message> {
    let cats = widget::row::with_capacity(6)
        .spacing(4)
        .push(cat_btn("All", FileCategory::All, category))
        .push(cat_btn("Photos", FileCategory::Photo, category))
        .push(cat_btn("Video", FileCategory::Video, category))
        .push(cat_btn("Docs", FileCategory::Document, category))
        .push(cat_btn("Audio", FileCategory::Audio, category))
        .push(cat_btn("Archives", FileCategory::Archive, category));

    let toolbar = widget::column::with_capacity(2)
        .spacing(8)
        .push(
            widget::row::with_capacity(4)
                .spacing(12)
                .align_y(Alignment::Center)
                .push(
                    widget::text_input::search_input("Search files", search)
                        .on_input(Message::SearchChanged)
                        .width(Length::FillPortion(2)),
                )
                .push(
                    widget::button::standard(if starred_only {
                        "★ Starred"
                    } else {
                        "☆ Starred"
                    })
                    .on_press(Message::ToggleStarredFilter),
                )
                .push(widget::text::caption(format!(
                    "{} · {} items · vault {}",
                    view_mode.label(),
                    files.len(),
                    if vault_unlocked { "open" } else { "locked" }
                ))),
        )
        .push(
            widget::row::with_capacity(5)
                .spacing(8)
                .push(cats)
                .push(widget::Space::new().width(Length::Fill))
                .push(sort_btn("Name", SortKey::Name))
                .push(sort_btn("Size", SortKey::Size))
                .push(sort_btn("Date", SortKey::Updated))
                .push(widget::button::standard("↕").on_press(Message::ToggleSortDir)),
        );

    let list = match view_mode {
        ViewMode::List | ViewMode::Columns => file_list(files, selected.map(|f| f.id.as_str())),
        ViewMode::Gallery | ViewMode::Icons => file_grid(files, selected.map(|f| f.id.as_str())),
    };

    let main = widget::column::with_capacity(2)
        .spacing(12)
        .padding(16)
        .push(toolbar)
        .push(list)
        .width(Length::Fill)
        .height(Length::Fill);

    if inspector_open {
        widget::row::with_capacity(2)
            .push(main)
            .push(inspector(selected))
            .width(Length::Fill)
            .height(Length::Fill)
            .into()
    } else {
        main.into()
    }
}

fn cat_btn(label: &'static str, cat: FileCategory, current: FileCategory) -> Element<'static, Message> {
    if cat == current {
        widget::button::suggested(label)
            .on_press(Message::SetCategory(cat))
            .into()
    } else {
        widget::button::standard(label)
            .on_press(Message::SetCategory(cat))
            .into()
    }
}

fn sort_btn(label: &'static str, key: SortKey) -> Element<'static, Message> {
    widget::button::standard(label)
        .on_press(Message::SetSort(key))
        .into()
}

fn file_list<'a>(files: &[&'a FileItem], selected_id: Option<&str>) -> Element<'a, Message> {
    let mut col = widget::column::with_capacity(files.len().max(1)).spacing(4);
    if files.is_empty() {
        col = col.push(widget::text::body("No files match this view."));
    }
    for file in files {
        let is_sel = selected_id == Some(file.id.as_str());
        let label = format!(
            "{}{}  —  {}  —  {}",
            if file.starred { "★ " } else { "" },
            file.name,
            format_bytes(file.size_bytes),
            file.folder_path
        );
        let btn = if is_sel {
            widget::button::suggested(label)
        } else {
            widget::button::standard(label)
        }
        .on_press(Message::SelectFile(file.id.clone()))
        .width(Length::Fill);
        col = col.push(btn);
    }
    widget::scrollable(col)
        .height(Length::Fill)
        .width(Length::Fill)
        .into()
}

fn file_grid<'a>(files: &[&'a FileItem], selected_id: Option<&str>) -> Element<'a, Message> {
    let mut col = widget::column::with_capacity(8).spacing(8);
    if files.is_empty() {
        return widget::text::body("No files match this view.").into();
    }
    let mut row = widget::row::with_capacity(4).spacing(8);
    for (i, file) in files.iter().enumerate() {
        let is_sel = selected_id == Some(file.id.as_str());
        let label = format!(
            "{}\n{}",
            if file.starred {
                format!("★ {}", file.name)
            } else {
                file.name.clone()
            },
            format_bytes(file.size_bytes)
        );
        let btn = if is_sel {
            widget::button::suggested(label)
        } else {
            widget::button::standard(label)
        }
        .on_press(Message::SelectFile(file.id.clone()))
        .width(Length::FillPortion(1));
        row = row.push(btn);
        if (i + 1) % 4 == 0 {
            col = col.push(row);
            row = widget::row::with_capacity(4).spacing(8);
        }
    }
    if files.len() % 4 != 0 {
        col = col.push(row);
    }
    widget::scrollable(col).height(Length::Fill).into()
}

fn inspector<'a>(selected: Option<&'a FileItem>) -> Element<'a, Message> {
    let body = match selected {
        Some(file) => widget::column::with_capacity(10)
            .spacing(8)
            .push(widget::text::title4("Inspector"))
            .push(widget::text::body(file.name.as_str()))
            .push(widget::text::caption(format!("Path: {}", file.folder_path)))
            .push(widget::text::caption(format!(
                "Size: {}",
                format_bytes(file.size_bytes)
            )))
            .push(widget::text::caption(format!("MIME: {}", file.mime_type)))
            .push(widget::text::caption(format!("Category: {:?}", file.category)))
            .push(widget::text::caption(format!(
                "Encrypted: {}",
                if file.encryption.is_encrypted {
                    file.encryption.algorithm.as_str()
                } else {
                    "No"
                }
            )))
            .push(
                widget::button::standard("Download (stub)")
                    .on_press(Message::OpenPlaceholder("Download")),
            )
            .push(
                widget::button::standard("Share (stub)")
                    .on_press(Message::OpenPlaceholder("Share")),
            )
            .push(
                widget::button::standard("Compress (stub)")
                    .on_press(Message::OpenPlaceholder("Compress")),
            ),
        None => widget::column::with_capacity(2)
            .spacing(8)
            .push(widget::text::title4("Inspector"))
            .push(widget::text::body("Select a file")),
    };

    widget::container(body)
        .padding(16)
        .width(300)
        .height(Length::Fill)
        .into()
}

pub fn local_browser<'a>(
    cwd: &'a std::path::Path,
    folders: &'a [FolderItem],
    files: &'a [FileItem],
    selected: Option<&'a FileItem>,
    inspector_open: bool,
) -> Element<'a, Message> {
    let mut col = widget::column::with_capacity(folders.len() + files.len() + 3)
        .spacing(4)
        .padding(16)
        .push(
            widget::row::with_capacity(3)
                .spacing(8)
                .push(widget::button::standard("↑ Up").on_press(Message::NavigateLocalUp))
                .push(widget::button::standard("Refresh").on_press(Message::RefreshLocal))
                .push(widget::text::caption(cwd.to_string_lossy())),
        )
        .push(widget::text::title4("Local Files"));

    for folder in folders {
        col = col.push(
            widget::button::standard(format!("📁 {}", folder.name))
                .on_press(Message::OpenLocalFolder(folder.name.clone()))
                .width(Length::Fill),
        );
    }
    for file in files {
        let sel = selected.map(|s| s.id.as_str()) == Some(file.id.as_str());
        let label = format!("{}  —  {}", file.name, format_bytes(file.size_bytes));
        let btn = if sel {
            widget::button::suggested(label)
        } else {
            widget::button::standard(label)
        }
        .on_press(Message::SelectFile(file.id.clone()))
        .width(Length::Fill);
        col = col.push(btn);
    }

    let main = widget::scrollable(col).height(Length::Fill);
    if inspector_open {
        widget::row::with_capacity(2)
            .push(main)
            .push(inspector(selected))
            .width(Length::Fill)
            .height(Length::Fill)
            .into()
    } else {
        main.into()
    }
}

pub fn cloud_accounts(accounts: &[CloudAccount]) -> Element<'_, Message> {
    let mut col = widget::column::with_capacity(accounts.len() + 3)
        .spacing(10)
        .padding(24)
        .push(widget::text::title3("Cloud Accounts"))
        .push(widget::text::caption(
            "HTTP proxy is ready (`cloud::http`). OAuth / token mounts: finish on Pop!_OS.",
        ));

    for a in accounts {
        col = col.push(
            widget::container(
                widget::column::with_capacity(3)
                    .spacing(4)
                    .push(widget::text::body(a.name.as_str()))
                    .push(widget::text::caption(a.email.as_str()))
                    .push(widget::text::caption(format!(
                        "{} / {} · {:?}",
                        format_bytes(a.used_bytes),
                        format_bytes(a.total_bytes),
                        a.status
                    ))),
            )
            .padding(12)
            .width(Length::Fill),
        );
    }

    col = col.push(
        widget::button::standard("Add account (stub)")
            .on_press(Message::OpenPlaceholder("Add cloud account")),
    );

    widget::scrollable(col).height(Length::Fill).into()
}

pub fn p2p_libraries<'a>(
    outgoing: bool,
    libraries: &'a [LibraryRecord],
    name: &'a str,
    desc: &'a str,
    pass: &'a str,
    last_invite: &'a str,
    identity: Option<&'a IdentityInfo>,
) -> Element<'a, Message> {
    let title = if outgoing {
        "Outgoing Libraries"
    } else {
        "Incoming Libraries"
    };

    let filtered: Vec<&LibraryRecord> = libraries
        .iter()
        .filter(|l| {
            if outgoing {
                l.direction == "outgoing"
            } else {
                l.direction == "incoming"
            }
        })
        .collect();

    let mut col = widget::column::with_capacity(16)
        .spacing(10)
        .padding(24)
        .push(widget::text::title3(title))
        .push(widget::text::caption(match identity {
            Some(id) => format!("Peer {} · {}", id.peer_id, id.display_name),
            None => "No identity yet".into(),
        }))
        .push(
            widget::row::with_capacity(3)
                .spacing(8)
                .push(widget::button::suggested("Refresh").on_press(Message::RefreshLibraries))
                .push(widget::button::standard("Start swarm").on_press(Message::StartSwarm))
                .push(widget::button::standard("Ensure identity").on_press(Message::EnsureIdentity)),
        );

    if outgoing {
        col = col
            .push(widget::text::title4("Create library"))
            .push(
                widget::text_input::text_input("Library name", name)
                    .on_input(Message::NewLibraryName),
            )
            .push(
                widget::text_input::text_input("Description", desc).on_input(Message::NewLibraryDesc),
            )
            .push(
                widget::text_input::secure_input(
                    "Invite passphrase (optional, min 8)",
                    pass,
                    None,
                    true,
                )
                .on_input(Message::NewLibraryPassphrase),
            )
            .push(
                widget::button::suggested("Create & seed")
                    .on_press(Message::CreateLibrary),
            );
    }

    for lib in &filtered {
        col = col.push(
            widget::container(
                widget::column::with_capacity(4)
                    .spacing(4)
                    .push(widget::text::body(lib.name.as_str()))
                    .push(widget::text::caption(format!(
                        "{} · {} files · seeding={}",
                        lib.library_id,
                        lib.file_ids.len(),
                        lib.is_seeding
                    )))
                    .push(
                        widget::button::standard("Export invite")
                            .on_press(Message::ExportInvite(lib.library_id.clone())),
                    ),
            )
            .padding(12)
            .width(Length::Fill),
        );
    }

    if filtered.is_empty() {
        col = col.push(widget::text::body("No libraries yet — create one above."));
    }

    if !last_invite.is_empty() {
        col = col
            .push(widget::text::title4("Last invite"))
            .push(widget::text::caption(last_invite))
            .push(
                widget::button::standard("Mark invite copied")
                    .on_press(Message::CopyToast("Invite noted — paste to a peer".into())),
            );
    }

    widget::scrollable(col).height(Length::Fill).into()
}

pub fn settings<'a>(
    tab: SettingsTab,
    prefs: &'a AppPreferences,
    profile: &'a UserProfile,
    vault_status: &'a str,
    vault_unlocked: bool,
    passphrase: &'a str,
    identity: Option<&'a IdentityInfo>,
) -> Element<'a, Message> {
    let tabs = widget::row::with_capacity(4)
        .spacing(6)
        .push(settings_tab_btn("Appearance", SettingsTab::Appearance, tab))
        .push(settings_tab_btn("Profile", SettingsTab::Profile, tab))
        .push(settings_tab_btn("Security", SettingsTab::Security, tab))
        .push(settings_tab_btn("General", SettingsTab::General, tab));

    let body: Element<'_, Message> = match tab {
        SettingsTab::Appearance => widget::column::with_capacity(4)
            .spacing(8)
            .push(widget::text::title4("Theme"))
            .push(widget::text::caption(
                "Dark is classic Cloudbreak; Light is soft grays (COSMIC theme still follows the DE).",
            ))
            .push(
                widget::row::with_capacity(2)
                    .spacing(8)
                    .push(theme_button(AppTheme::Dark, prefs.theme))
                    .push(theme_button(AppTheme::Light, prefs.theme)),
            )
            .push(
                widget::button::suggested("Save preferences").on_press(Message::SavePreferences),
            )
            .into(),
        SettingsTab::Profile => widget::column::with_capacity(6)
            .spacing(8)
            .push(widget::text::title4("Profile"))
            .push(
                widget::text_input::text_input("Display name", &profile.name)
                    .on_input(Message::ProfileNameChanged),
            )
            .push(
                widget::text_input::text_input("Email", &profile.email)
                    .on_input(Message::ProfileEmailChanged),
            )
            .push(widget::text::caption(profile.role.as_str()))
            .push(widget::button::suggested("Save profile").on_press(Message::SaveProfile))
            .push(widget::text::caption(match identity {
                Some(id) => format!("P2P peer id: {}", id.peer_id),
                None => "P2P identity not loaded".into(),
            }))
            .into(),
        SettingsTab::Security => widget::column::with_capacity(5)
            .spacing(8)
            .push(widget::text::title4("Vault"))
            .push(widget::text::caption(vault_status))
            .push(
                widget::text_input::secure_input("Passphrase (min 8)", passphrase, None, true)
                    .on_input(Message::VaultPassphraseChanged),
            )
            .push(
                widget::row::with_capacity(2)
                    .spacing(8)
                    .push(
                        widget::button::suggested(if vault_unlocked {
                            "Unlocked"
                        } else {
                            "Unlock / Create"
                        })
                        .on_press(Message::UnlockVault),
                    )
                    .push(widget::button::standard("Lock").on_press(Message::LockVault)),
            )
            .into(),
        SettingsTab::General => widget::column::with_capacity(4)
            .spacing(8)
            .push(widget::text::title4("General"))
            .push(widget::text::caption(format!(
                "Auto-lock: {} min · Confirm delete: {} · Compact sidebar: {}",
                prefs.auto_lock_minutes, prefs.confirm_before_delete, prefs.compact_sidebar
            )))
            .push(widget::text::caption(
                "Toggle persistence for these flags is next — prefs struct already saved as JSON.",
            ))
            .push(
                widget::button::suggested("Save preferences").on_press(Message::SavePreferences),
            )
            .into(),
    };

    widget::scrollable(
        widget::column::with_capacity(4)
            .spacing(20)
            .padding(24)
            .push(widget::text::title3("Settings"))
            .push(tabs)
            .push(body),
    )
    .height(Length::Fill)
    .into()
}

fn settings_tab_btn(
    label: &'static str,
    tab: SettingsTab,
    current: SettingsTab,
) -> Element<'static, Message> {
    if tab == current {
        widget::button::suggested(label)
            .on_press(Message::SettingsTab(tab))
            .into()
    } else {
        widget::button::standard(label)
            .on_press(Message::SettingsTab(tab))
            .into()
    }
}

fn theme_button(theme: AppTheme, current: AppTheme) -> Element<'static, Message> {
    let label = theme.label();
    if theme == current {
        widget::button::suggested(label)
            .on_press(Message::SetTheme(theme))
            .into()
    } else {
        widget::button::standard(label)
            .on_press(Message::SetTheme(theme))
            .into()
    }
}
