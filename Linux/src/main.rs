//! Cloudbreak Files — Linux / COSMIC entry point.

fn main() -> Result<(), Box<dyn std::error::Error>> {
    cloudbreak_files_linux::ui::run()
}
