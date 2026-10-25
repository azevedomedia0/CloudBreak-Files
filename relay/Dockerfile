# Cloudbreak relay: a small server that joins two outbound P2P connections. See README.md.
# Build from this directory:  docker build -t cloudbreak-relay .

FROM rust:1-bookworm AS build
WORKDIR /src
COPY Cargo.toml Cargo.lock ./
COPY src ./src
RUN cargo build --release --locked --bin cloudbreak-relay

FROM debian:bookworm-slim
# No shell tools are needed at run time; the relay talks TCP only.
RUN useradd --system --no-create-home --uid 10001 relay
COPY --from=build /src/target/release/cloudbreak-relay /usr/local/bin/cloudbreak-relay
# Claimed usernames live here; mount a volume on /data to keep them across container re-creates.
RUN mkdir /data && chown relay /data
VOLUME /data
ENV CLOUDBREAK_RELAY_NAMES_FILE=/data/names.json
USER relay
EXPOSE 7422
# The host key comes from the environment (CLOUDBREAK_RELAY_HOST_KEY), never from the image.
ENTRYPOINT ["/usr/local/bin/cloudbreak-relay"]
CMD ["--listen", "0.0.0.0:7422"]
