# Ubuntu 22.04 builder for Cloudbreak Files Flatpak (WebKitGTK 4.1 + flatpak-builder).
# Used by scripts/build-flatpak-docker.sh
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV CARGO_HOME=/usr/local/cargo
ENV RUSTUP_HOME=/usr/local/rustup
ENV PATH=/usr/local/cargo/bin:/usr/local/bin:$PATH

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    ca-certificates \
    git \
    rsync \
    pkg-config \
    libwebkit2gtk-4.1-dev \
    libgtk-3-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev \
    libssl-dev \
    patchelf \
    flatpak \
    flatpak-builder \
    elfutils \
    file \
    xz-utils \
    zstd \
    binutils \
  && rm -rf /var/lib/apt/lists/*

# Node 22
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
  && apt-get install -y --no-install-recommends nodejs \
  && rm -rf /var/lib/apt/lists/*

# Rust stable
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable \
  && rustc --version && cargo --version

WORKDIR /work
# Copy happens at runtime via bind mount; entrypoint clones from /src.
COPY flatpak/docker-entrypoint.sh /usr/local/bin/cloudbreak-flatpak-entrypoint
RUN chmod +x /usr/local/bin/cloudbreak-flatpak-entrypoint

ENTRYPOINT ["/usr/local/bin/cloudbreak-flatpak-entrypoint"]
