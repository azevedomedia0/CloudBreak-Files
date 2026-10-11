# Third-party notices

## FFmpeg (bundled with the Linux and macOS builds)

CloudBreak Files ships static builds of [FFmpeg](https://ffmpeg.org/) for video trim and convert. FFmpeg runs as a separate program (`ffmpeg`); CloudBreak Files itself stays under Apache-2.0. Each build below is licensed under the **GNU General Public License, version 3 or later** (each binary reports "libavcodec license: GPL version 3 or later" and includes GPL components such as libx264 and libx265).

| Platform | FFmpeg | Built by | Installed at | Build details |
|---|---|---|---|---|
| Linux x86_64 (`.deb`, Flatpak) | 7.0.2 | [John Van Sickle](https://johnvansickle.com/ffmpeg/) | `/usr/lib/cloudbreak-files/ffmpeg` (Flatpak: `/app/lib/cloudbreak-files/ffmpeg`) | [`BUILD-INFO-linux-x86_64.txt`](licenses/ffmpeg/BUILD-INFO-linux-x86_64.txt) |
| macOS Apple Silicon | 9.0.2 | [Martin Riedl](https://ffmpeg.martin-riedl.de/) | `Contents/MacOS/ffmpeg` (universal binary) | [`BUILD-INFO-macos-arm64.txt`](licenses/ffmpeg/BUILD-INFO-macos-arm64.txt) |
| macOS Intel | 9.0.2 | [Martin Riedl](https://ffmpeg.martin-riedl.de/) | `Contents/MacOS/ffmpeg` (universal binary) | [`BUILD-INFO-macos-x86_64.txt`](licenses/ffmpeg/BUILD-INFO-macos-x86_64.txt) |

The macOS app contains one universal `ffmpeg`: the two macOS builds above joined with `lipo`.

### License text and build details

The full license text is installed with the app:

- Linux `.deb`: `/usr/share/doc/cloudbreak-files/ffmpeg/GPL-3.0.txt`
- Linux Flatpak: `/app/share/licenses/com.cloudbreak.files/ffmpeg/GPL-3.0.txt`
- macOS: `CloudBreak Files.app/Contents/Resources/licenses/ffmpeg/GPL-3.0.txt`
- Repository: [`licenses/ffmpeg/GPL-3.0.txt`](licenses/ffmpeg/GPL-3.0.txt)

The `BUILD-INFO-*.txt` files, installed next to it, record each binary's version, configure line and checksum.

### Source code

- FFmpeg 7.0.2: <https://ffmpeg.org/releases/ffmpeg-7.0.2.tar.xz>
- FFmpeg 9.0.2 (both macOS builds): <https://ffmpeg.org/releases/ffmpeg-9.0.2.tar.xz>, with the build script at <https://git.martin-riedl.de/ffmpeg/build-script>
- Linux build configuration and library versions: <https://johnvansickle.com/ffmpeg/release-readme.txt>

### Written offer for source code

For at least three years from the date you received this software, we will give anyone who asks the complete corresponding source code of the bundled FFmpeg binaries, including the libraries statically linked into them, on a physical medium or by download, for no more than the cost of performing the distribution (GPLv3 section 6(b)).

To ask, open an issue titled "ffmpeg source request" at <https://github.com/azevedomedia0/CloudBreak-Files/issues>, or email <stevenazevedodesign@gmail.com>. Please include the CloudBreak Files version and platform you have.

### Using your own ffmpeg

Set the `FFMPEG_PATH` environment variable to another ffmpeg binary, or delete the bundled copy; CloudBreak Files then falls back to an ffmpeg on your `PATH`.
