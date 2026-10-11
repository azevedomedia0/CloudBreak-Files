# Third-party notices

## FFmpeg (bundled in the Linux x86_64 `.deb` and Flatpak)

CloudBreak Files ships a static build of [FFmpeg](https://ffmpeg.org/) for video trim and convert. It is run as a separate program (`ffmpeg`); CloudBreak Files itself stays under Apache-2.0.

| | |
|---|---|
| Version | FFmpeg 7.0.2, `ffmpeg-7.0.2-amd64-static` |
| Built by | John Van Sickle, <https://johnvansickle.com/ffmpeg/> |
| Obtained via | [eugeneware/ffmpeg-static](https://github.com/eugeneware/ffmpeg-static), release `b6.1.1` (`ffmpeg-linux-x64`) |
| License | GNU General Public License, version 3 (the static build enables GPL components such as libx264 and libx265) |
| Installed at | `/usr/lib/cloudbreak-files/ffmpeg` (`.deb`), `/app/lib/cloudbreak-files/ffmpeg` (Flatpak) |

The full license text is installed with the app:

- `.deb`: `/usr/share/doc/cloudbreak-files/ffmpeg/GPL-3.0.txt`
- Flatpak: `/app/share/licenses/com.cloudbreak.files/ffmpeg/GPL-3.0.txt`
- Repository: [`licenses/ffmpeg/GPL-3.0.txt`](licenses/ffmpeg/GPL-3.0.txt)

The builder's description of this binary (compiler, external libraries and their versions) is in [`licenses/ffmpeg/BUILD-INFO-linux-x86_64.txt`](licenses/ffmpeg/BUILD-INFO-linux-x86_64.txt).

### Source code

- FFmpeg 7.0.2 source: <https://ffmpeg.org/releases/ffmpeg-7.0.2.tar.xz>
- Build configuration and library versions: <https://johnvansickle.com/ffmpeg/release-readme.txt>

### Written offer for source code

For at least three years from the date you received this software, we will give anyone who asks the complete corresponding source code of the bundled FFmpeg binary, including the libraries statically linked into it, on a physical medium or by download, for no more than the cost of performing the distribution (GPLv3 section 6(b)).

To ask, open an issue titled "ffmpeg source request" at <https://github.com/azevedomedia0/CloudBreak-Files/issues>, or email <stevenazevedodesign@gmail.com>. Please include the CloudBreak Files version you have.

### Using your own ffmpeg

Set the `FFMPEG_PATH` environment variable to another ffmpeg binary, or delete the bundled copy; CloudBreak Files then falls back to an ffmpeg on your `PATH`.
