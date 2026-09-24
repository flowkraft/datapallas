#######################################
#                                     #
# Stage 1: Clone from GitHub          #
#                                     #
#######################################

FROM alpine/git AS clone

WORKDIR /clone

# Clone Baibot from GitHub - pinned to v1.13.0 for reproducible builds
# Our patches are verified against this version; update patches when upgrading
ARG BAIBOT_VERSION=v1.13.0
RUN git clone --depth 1 --branch ${BAIBOT_VERSION} https://github.com/etkecc/baibot.git /clone/baibot && \
    rm -rf /clone/baibot/.git

#######################################
#                                     #
# Stage 2: Building                   #
#                                     #
#######################################

FROM docker.io/rust:1.93.0-slim-trixie AS build

RUN apt-get update && apt-get install -y build-essential pkg-config libssl-dev libsqlite3-dev

ENV CARGO_HOME=/cargo
ENV CARGO_TARGET_DIR=/target

WORKDIR /app

# Copy cloned source from stage 1
COPY --from=clone /clone/baibot /app

# FlowKraft Patch: Apply source patches for SEND_N_NEWEST_MESSAGES feature
# These patches overlay the original baibot v1.13.0 source to add message truncation support
# Each .patched file contains the complete patched source (not diffs)
COPY patches/src/entity/cfg/env.patched /app/src/entity/cfg/env.rs
COPY patches/src/entity/cfg/config.patched /app/src/entity/cfg/config.rs
COPY patches/src/entity/globalconfig/entity.patched /app/src/entity/globalconfig/entity.rs
COPY patches/src/bot/load_config.patched /app/src/bot/load_config.rs
COPY patches/src/controller/chat_completion/mod.patched /app/src/controller/chat_completion/mod.rs
COPY patches/src/conversation/matrix/entity.patched /app/src/conversation/matrix/entity.rs
COPY patches/src/conversation/matrix_llm_bridge.patched /app/src/conversation/matrix_llm_bridge.rs
# FlowKraft Patch: api_key_file on static agents (load_config above) + api_key masked in `agent details`
COPY patches/src/controller/agent/details/mod.patched /app/src/controller/agent/details/mod.rs

ARG RELEASE_BUILD=true

RUN --mount=type=cache,target=/cargo,sharing=locked \
	--mount=type=cache,target=/target,sharing=locked \
	if [ "$RELEASE_BUILD" = "true" ]; then \
		cargo build --release && cp /target/release/baibot /baibot; \
	else \
		cargo build && cp /target/debug/baibot /baibot; \
	fi

#######################################
#                                     #
# Stage 3: Packaging                  #
#                                     #
#######################################

FROM docker.io/debian:trixie-slim

RUN apt-get update && apt-get install -y ca-certificates sqlite3 curl && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=build /baibot .

ENTRYPOINT ["/bin/sh", "-c"]

CMD ["/app/baibot"]
