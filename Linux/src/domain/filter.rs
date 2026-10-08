//! Sort / filter helpers mirroring `src/utils/filterFiles.ts`.

use crate::domain::{FileCategory, FileItem};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SortKey {
    Name,
    Size,
    Updated,
    Category,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SortDir {
    Asc,
    Desc,
}

pub fn filter_files<'a>(
    files: &'a [FileItem],
    query: &str,
    category: FileCategory,
    starred_only: bool,
) -> Vec<&'a FileItem> {
    let q = query.trim().to_lowercase();
    files
        .iter()
        .filter(|f| {
            if starred_only && !f.starred {
                return false;
            }
            let cat_ok = matches!(category, FileCategory::All | FileCategory::Files)
                || f.category == category;
            if !cat_ok {
                return false;
            }
            if q.is_empty() {
                return true;
            }
            f.name.to_lowercase().contains(&q)
                || f.folder_path.to_lowercase().contains(&q)
                || f.tags.iter().any(|t| t.to_lowercase().contains(&q))
        })
        .collect()
}

pub fn sort_files(files: &mut [&FileItem], key: SortKey, dir: SortDir) {
    files.sort_by(|a, b| {
        let ord = match key {
            SortKey::Name => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
            SortKey::Size => a.size_bytes.cmp(&b.size_bytes),
            SortKey::Updated => a.updated_at.cmp(&b.updated_at),
            SortKey::Category => format!("{:?}", a.category).cmp(&format!("{:?}", b.category)),
        };
        match dir {
            SortDir::Asc => ord,
            SortDir::Desc => ord.reverse(),
        }
    });
}
