# Start with pgvector base for builder
FROM ankane/pgvector:v0.5.1 AS builder
# comment to trigger ci
# Install Python and required packages
RUN apt-get update && apt-get install -y \
    python3 \
    python3-venv \
    python3-full \
    build-essential \
    libpq-dev \
    python3-dev \
    git \
    && rm -rf /var/lib/apt/lists/*

ARG LETTA_ENVIRONMENT=DEV
ENV LETTA_ENVIRONMENT=${LETTA_ENVIRONMENT} \
    UV_NO_PROGRESS=1 \
    UV_PYTHON_PREFERENCE=system \
    UV_CACHE_DIR=/tmp/uv_cache

WORKDIR /app

# Create and activate virtual environment
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Now install uv and uvx in the virtual environment
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/

# Clone Letta directly from GitHub - pinned to 0.16.4 for reproducible builds
# Our patches (if any) are verified against this version; update patches when upgrading
ARG LETTA_VERSION=0.16.4
RUN git clone --depth 1 --branch ${LETTA_VERSION} https://github.com/letta-ai/letta.git /app && \
    rm -rf /app/.git

# ===== Letta 0.16.4 source patches (each documents WHY + labels NEEDED / OPTIONAL) =====

# [OPTIONAL — context-window polish; pairs with the openai.py basename backport below]
# Real context windows for Z.ai's glm-* models in LLM_MAX_CONTEXT_WINDOW. On its own this
# dict is INERT on the openai-proxy path (0.16.4 does not read it there — glm-4.5 is
# already present yet still reports Letta's 30K default); the backport below is what makes
# 0.16.4 consult it. glm-4.6 and glm-4.5 already ship in stock 0.16.4 — do NOT re-add them
# (duplicate key). Values match Z.ai's published windows (glm-5.2 usable window = 200K here).
RUN sed -i '/"glm-4.5": 128000,/a\    "glm-4.7": 200000,\n    "glm-4.5-air": 128000,\n    "glm-5": 200000,\n    "glm-5-turbo": 200000,\n    "glm-5.1": 200000,\n    "glm-5.2": 200000,' /app/letta/constants.py

# [KEEP — embeddings, unrelated to the glm/LLM issue] provider_manager.py: Ollama
# embedding endpoint needs the /v1 suffix.
# Letta bug: OllamaProvider.list_embedding_models_async() uses openai_compat_base_url
# (with /v1), but get_embedding_config_from_handle() uses raw provider.base_url.
# The OpenAI Python client appends /embeddings, so without /v1 we get 404.
RUN sed -i 's|embedding_endpoint=provider.base_url|embedding_endpoint=provider.base_url.rstrip("/") + "/v1" if provider.provider_type.value == "ollama" else provider.base_url|' /app/letta/services/provider_manager.py

RUN uv sync --frozen --no-dev --all-extras --python 3.11

# [NEEDED — THE fix for "must be one of []"] openai.py: make OpenAI-provider model
# enumeration resilient to a transient failure of the upstream /models endpoint. The
# Z.ai Coding Plan is consumed via
# OPENAI_API_BASE; Letta lists models by GET-ing {base}/models and calling
# response.raise_for_status() with NO retry. That /models endpoint intermittently
# answers 401 (chat and normal fetches keep working), and a single transient 401 raises
# straight out of list_llm_models_async — the openai-proxy provider then contributes
# zero models and agent creation dies with:
#   NOT_FOUND: Handle openai-proxy/glm-5.2 not found, must be one of []
# Model availability comes entirely from the LIVE /models list (glm-5.x is declared
# nowhere in Letta), so the fix is not a declaration but resilience: retry the
# enumeration a few times so a normal 200 is used instead of aborting on one blip.
RUN python -c "p='/app/letta/schemas/providers/openai.py'; s=open(p).read(); old='        data = await self._get_models_async()'+chr(10)+'        return await self._list_llm_models(data)'; new=chr(10).join(['        import asyncio as _aio','        _err=None','        for _i in range(6):','            try:','                data = await self._get_models_async()','                return await self._list_llm_models(data)','            except Exception as _e:','                _err=_e','                await _aio.sleep(1.5)','        raise _err']); assert old in s,'PATCH DRIFT: list_llm_models_async body not found in openai.py'; open(p,'w').write(s.replace(old,new,1)); print('openai.py /models retry patch applied')"
# Fail the build loudly if the retry patch did not take (Letta source drift).
RUN grep -q "for _i in range(6):" /app/letta/schemas/providers/openai.py \
 || (echo "PATCH FAILED: openai-proxy /models retry did not apply to openai.py" && exit 1)

# [OPTIONAL — context-window polish] openai.py: backport 0.16.8's basename lookup so the
# openai-proxy path consults LLM_MAX_CONTEXT_WINDOW (the constants.py values above) when
# litellm does not recognise the model. Without this, every glm-* uses Letta's 30K default
# regardless of the constants.py dict. Python one-liner (not sed): the anchor is a 4-line
# block that sed's a\ / {n;...} handles poorly, and the assert fails the build on drift.
RUN python -c "p='/app/letta/schemas/providers/openai.py'; s=open(p).read(); old=chr(10).join(['        if context_window is not None:','            return context_window','','        # Simple fallback']); new=chr(10).join(['        if context_window is not None:','            return context_window','','        _bn = model_name.lower()','        if _bn in LLM_MAX_CONTEXT_WINDOW:','            return LLM_MAX_CONTEXT_WINDOW[_bn]','','        # Simple fallback']); assert old in s,'PATCH DRIFT: context-window anchor not found in openai.py'; open(p,'w').write(s.replace(old,new,1)); print('openai.py context-window backport applied')"
RUN grep -q "LLM_MAX_CONTEXT_WINDOW\[_bn\]" /app/letta/schemas/providers/openai.py \
 || (echo "PATCH FAILED: context-window backport did not apply to openai.py" && exit 1)

# Runtime stage
FROM ankane/pgvector:v0.5.1 AS runtime

# Overridable Node.js version with --build-arg NODE_VERSION
ARG NODE_VERSION=22

# Allow overriding the OpenTelemetry Collector version and let Docker inject TARGETARCH during build
ARG OTEL_VERSION=0.96.0
ARG TARGETARCH

RUN set -eux; \
    # Map TARGETARCH to the naming used by otel release assets
    case "${TARGETARCH:-amd64}" in \
      arm64|aarch64) OTEL_ARCH=arm64 ;; \
      amd64|x86_64|x64) OTEL_ARCH=amd64 ;; \
      *) OTEL_ARCH=amd64 ;; \
    esac; \
    apt-get update && \
    # Install system dependencies and agent utilities
    apt-get install -y \
        # --- SYSTEM DEPENDENCIES ---
        curl \
        python3 \
        python3-venv \
        libpq-dev \
        unixodbc-dev \
            # ODBC driver manager for SQL Server connectivity via pyodbc. \
        redis-server \
        # --- ESSENTIAL UTILITIES ---
        wget \
            # Download documentation and resources. \
        ripgrep \
            # Fast recursive search respecting .gitignore (preferred). \
        jq \
            # Command-line JSON processor for parsing configs and API responses. \
        xmlstarlet \
            # Command-line XML processor for parsing configurations. \
        file \
            # Identify file types before analysis. \
        git \
            # Version control for repository analysis and context gathering. \
        # --- TEXT PROCESSING & EDITING ---
        sed \
            # Stream editor for text replacement and transformation. \
        gawk \
            # Pattern scanning and processing language for structured text. \
        perl \
            # General-purpose scripting for regex operations and text processing. \
        # --- SEARCH & ANALYSIS ---
        grep \
            # Standard search tool (reliable fallback). \
        findutils \
            # Includes 'find' for file location. \
    && \
    # Install Node.js
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash - && \
    apt-get install -y nodejs && \
    # Install agent-browser globally for AI agents (includes Chromium + Linux deps)
    npm install -g agent-browser && \
    agent-browser install --with-deps && \
    # Download and install OpenTelemetry Collector for the target architecture
    OTEL_FILENAME="otelcol-contrib_${OTEL_VERSION}_linux_${OTEL_ARCH}.tar.gz"; \
    echo "Downloading https://github.com/open-telemetry/opentelemetry-collector-releases/releases/download/v${OTEL_VERSION}/${OTEL_FILENAME}"; \
    curl -L "https://github.com/open-telemetry/opentelemetry-collector-releases/releases/download/v${OTEL_VERSION}/${OTEL_FILENAME}" -o /tmp/otel-collector.tar.gz && \
    tar xzf /tmp/otel-collector.tar.gz -C /usr/local/bin && \
    rm /tmp/otel-collector.tar.gz && \
    mkdir -p /etc/otel && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

ARG LETTA_ENVIRONMENT=DEV
ENV LETTA_ENVIRONMENT=${LETTA_ENVIRONMENT} \
    VIRTUAL_ENV="/app/.venv" \
    PATH="/app/.venv/bin:$PATH" \
    POSTGRES_USER=letta \
    POSTGRES_PASSWORD=letta \
    POSTGRES_DB=letta

# LETTA_VERSION is set in builder stage and inherited via COPY
ARG LETTA_VERSION=0.16.4
ENV LETTA_VERSION=${LETTA_VERSION}

WORKDIR /app

# Copy virtual environment and app from builder (includes otel/ folder and init.sql from git clone)
COPY --from=builder /app .

# Add OpenTelemetry Collector configs from the cloned Letta repo
RUN cp /app/otel/otel-collector-config-file.yaml /etc/otel/config-file.yaml && \
    cp /app/otel/otel-collector-config-clickhouse.yaml /etc/otel/config-clickhouse.yaml && \
    cp /app/otel/otel-collector-config-signoz.yaml /etc/otel/config-signoz.yaml

# Copy initialization SQL from the cloned Letta repo
RUN cp /app/init.sql /docker-entrypoint-initdb.d/

# Copy uv from official image for installing additional packages into the venv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/

# db_query no longer holds DB drivers here — it calls the chat2db service (which owns
# JDBC + the live connection) over HTTP. Keeping native DB drivers OUT of this image is
# what PHYSICALLY enforces the read contract: Athena's execute_shell_command cannot
# `import duckdb`/`psycopg2`/etc., so she cannot read a database from the shell — the
# only path to data is db_query → chat2db (gated by the toggle). Only `tabulate` (result
# formatting) remains. Letta's OWN Postgres layer uses pg8000 + asyncpg (from uv sync,
# untouched here); its psycopg2 references are a non-importing pgcode check + a
# remote-sandbox package string, and clickhouse_connect is a lazy import behind optional
# telemetry — so removing these does not affect Letta startup or its database.
RUN uv pip install --python /app/.venv/bin/python --no-cache-dir \
    tabulate

# Also strip the DB drivers that Letta's `uv sync --all-extras` pulls in but does NOT
# hard-import (psycopg2 = a pgcode hasattr check + a remote-sandbox package string;
# clickhouse_connect = lazy import behind optional telemetry, off by default). Removing
# them extends the shell-read block to Postgres + ClickHouse. Letta's own DB layer
# (pg8000 + asyncpg) is unaffected — verified `import letta` still succeeds without them.
RUN uv pip uninstall --python /app/.venv/bin/python psycopg2-binary clickhouse-connect

# Normalize startup script line endings (CRLF -> LF) and ensure executable
RUN if [ -f /app/letta/server/startup.sh ]; then \
      sed -i 's/\r$//' /app/letta/server/startup.sh && \
      chmod +x /app/letta/server/startup.sh; \
    fi

EXPOSE 8283 5432 6379 4317 4318

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["./letta/server/startup.sh"]
