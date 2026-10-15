# Third-party notices

Cloudbreak Files is licensed under the Apache License 2.0 (see `LICENSE`). Release builds also
ship the software below, which stays under its own license.

## rclone

Used for "Quick sign-in (no setup)" with Google Drive. Release builds include an unmodified
rclone binary from <https://rclone.org/downloads/>. Source code: <https://github.com/rclone/rclone>.
rclone itself links other open-source libraries; their licenses are listed at <https://rclone.org/licence/>.

```
Copyright (C) 2012 by Nick Craig-Wood http://www.craig-wood.com/nick/

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

## FFmpeg, LAME, Opus and libvpx

Release builds ship an `ffmpeg` program for video trim and convert. It is an **LGPL-only** build of
FFmpeg 7.1.1: configured without `--enable-gpl` and without `--enable-nonfree`, so none of FFmpeg's
GPL parts (libx264, libx265 and others) are in it. It is a separate program that Cloudbreak Files
starts as a subprocess; it is not linked into the app. H.264 video is encoded with Apple's
VideoToolbox, which is part of macOS.

| Component | Version | License | Source |
|---|---|---|---|
| FFmpeg | 7.1.1 | GNU LGPL 2.1 or later | <https://ffmpeg.org/releases/ffmpeg-7.1.1.tar.xz> |
| LAME (libmp3lame) | 3.100 | GNU LGPL 2.0 | <https://downloads.sourceforge.net/project/lame/lame/3.100/lame-3.100.tar.gz> |
| Opus (libopus) | 1.5.2 | BSD 3-Clause | <https://downloads.xiph.org/releases/opus/opus-1.5.2.tar.gz> |
| libvpx | 1.14.1 | BSD 3-Clause | <https://github.com/webmproject/libvpx/archive/refs/tags/v1.14.1.tar.gz> |

The full license texts are in the `licenses` folder next to this file.

**The source.** All four are built unmodified from the tarballs above. The exact build, including the
pinned SHA-256 of each tarball and FFmpeg's configure options, is `scripts/build-ffmpeg-lgpl.sh` in
<https://github.com/azevedomedia0/CloudBreak-Files>. Anyone can rebuild the same `ffmpeg` with
`bash scripts/build-ffmpeg-lgpl.sh` and use it in place of the bundled one, which satisfies the LGPL's
requirement that the library can be replaced. If those tarballs are ever no longer available at the
addresses above, open an issue at <https://github.com/azevedomedia0/CloudBreak-Files/issues> and the
source will be provided.

**The configuration** the bundled binary reports (`ffmpeg -version`). The `--prefix`, `--pkg-config`
and include and library paths are the build machine's own folders and are left out; `<arch>` is
`arm64` or `x86_64`:

```
--arch=<arch> --cc='clang -arch <arch>' --pkg-config-flags=--static
--extra-cflags='-O2 -mmacosx-version-min=11.0' --extra-ldflags='-mmacosx-version-min=11.0'
--disable-autodetect --disable-gpl --disable-nonfree --disable-shared --enable-static
--disable-doc --disable-debug --disable-ffplay --disable-ffprobe
--enable-libmp3lame --enable-libopus --enable-libvpx
--enable-videotoolbox --enable-audiotoolbox --enable-zlib --enable-bzlib --enable-iconv
--extra-libs=-liconv
```

If you install your own ffmpeg (for example with Homebrew), Cloudbreak Files will use it when the
bundled one is missing. That copy is yours, under its own license.

**The Linux Flatpak** ships its own `ffmpeg` and `rclone` in `/app/bin`, built by `flatpak/com.cloudbreak.files.yml`.
The ffmpeg is the same unmodified FFmpeg 7.1.1 tarball (same pinned SHA-256), configured `--disable-gpl
--disable-nonfree --disable-shared --enable-static --disable-autodetect --disable-doc --disable-debug
--disable-ffplay --disable-ffprobe --enable-libmp3lame --enable-libopus --enable-libvpx --enable-zlib
--enable-bzlib`, and the build fails if the result reports `--enable-gpl`, `--enable-nonfree` or `--enable-version3`.
libmp3lame (LGPL 2.0), libopus (BSD 3-Clause) and libvpx (BSD 3-Clause) are the copies in the Freedesktop SDK the
Flatpak is built against, and are used by the Flatpak at run time from its runtime. This ffmpeg has no H.264 encoder (there is no
VideoToolbox on Linux and libx264 is GPL), so MP4 and MKV conversion are not available in the Flatpak. The rclone is the official
`rclone-v1.75.2-linux-*.zip` from <https://downloads.rclone.org/v1.75.2/>, checked against that release's SHA256SUMS,
with its licence terms as in the rclone section above. To replace the Flatpak's ffmpeg, rebuild the Flatpak from
the manifest with a different ffmpeg module or point `FFMPEG_PATH` at your own.

## Interface fonts

The app's interface and document fonts are bundled in `src/assets/fonts` and `licenses/`, under the
SIL Open Font License 1.1. The fonts are unmodified; they were taken from the Fontsource packages
(`@fontsource-variable/*` 5.3.0, and `@fontsource/cantarell` 5.3.0) of the original Google Fonts releases.

| Font | Copyright | License text |
|---|---|---|
| Plus Jakarta Sans | Copyright 2020 The Plus Jakarta Sans Project Authors (<https://github.com/tokotype/PlusJakartaSans>) | `licenses/plus-jakarta-sans-OFL-1.1.txt` |
| Cantarell (GNOME theme) | Copyright 2009 The Cantarell Project Authors (<https://github.com/davelab6/cantarell>) | `licenses/cantarell-OFL-1.1.txt` |
| Newsreader | Copyright 2020 The Newsreader Project Authors (<http://github.com/productiontype/Newsreader>) | `licenses/newsreader-OFL-1.1.txt` |
| JetBrains Mono | Copyright 2020 The JetBrains Mono Project Authors (<https://github.com/JetBrains/JetBrainsMono>) | `licenses/jetbrains-mono-OFL-1.1.txt` |


## PDF editing: pdf.js and pdf-lib

The PDF editor draws pages with **pdf.js** (`pdfjs-dist` 6.4.299, Apache License 2.0, copyright Mozilla and
contributors; text in `licenses/pdfjs-Apache-2.0.txt`) and writes changes with **pdf-lib** (1.17.1, MIT License,
copyright 2019 Andrew Dillon; text in `licenses/pdf-lib-MIT.txt`). Both are unmodified and run on your computer; no
document is sent anywhere.

pdf.js's own data files ship in `public/pdfjs/`: the standard fonts (Foxit and Liberation fonts under their own
licences, kept with the files), character maps, ICC profiles and the JBIG2 and OpenJPEG decoders as WebAssembly
(licences `LICENSE_*` in `public/pdfjs/wasm/`). pdf-lib also uses `@pdf-lib/standard-fonts` and `@pdf-lib/upng`
(MIT), `pako` (MIT and Zlib) and `tslib` (0BSD).
