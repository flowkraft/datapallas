"""
Letta AI Chat2DB Integration

Connects to the Athena AI agent for natural language to SQL generation.
Routes through the OpenAI-compatible adapter exposed by ai-hub-frend,
which resolves the "athena" agent key to the current Letta agent UUID.

This module is simplified to use Athena only - the data & analytics oracle.
"""

import os
import json
import re
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any

import httpx


@dataclass
class LettaMessage:
    """Represents a message in a Letta conversation."""
    role: str  # 'user' or 'assistant'
    content: str
    metadata: Optional[Dict[str, Any]] = None


@dataclass
class LettaResponse:
    """Response from Letta AI agent."""
    content: str
    sql: Optional[str] = None
    viz_code: Optional[str] = None  # Python visualization code (matplotlib/plotly)
    narrative: Optional[str] = None  # Athena's inline text (code blocks stripped)
    plantuml_code: Optional[str] = None  # PlantUML diagram source
    html_content: Optional[str] = None   # HTML content (dashboards, mockups, Mermaid diagrams)
    content_segments: Optional[list] = None   # Ordered content segments preserving Athena's order
    messages: Optional[List[Dict]] = None
    raw_response: Optional[Dict] = None


class LettaChat2DB:
    """
    Letta AI integration for Chat2DB workflow.

    Connects to Athena (the data & analytics oracle) via the OpenAI-compatible
    adapter exposed by ai-hub-frend. The adapter resolves the "athena" agent key
    to the current Letta agent UUID automatically — no manual agent ID needed.

    Usage:
        letta = LettaChat2DB()
        response = letta.generate_sql("Show top 5 customers by revenue")
        print(response.sql)
    """

    # Minimal context - Athena already knows SQL from her skills
    # This identifies the interface context + hints about response formatting
    # for reliable extraction by _extract_sql() and _extract_viz_code()
    CHAT2DB_CONTEXT = (
        "[Chat2DB/Jupyter Interface] "
        "When responding with SQL, wrap it in a ```sql code block. "
        "VISUALIZATION: There are NO chart buttons or menus in this interface. "
        "YOU are the chart engine. When a visualization would help, YOU MUST write "
        "a ```python code block using `df` (the query result DataFrame). "
        "Chat2DB auto-executes your Python code and renders the chart image inline. "
        "The user sees the table AND your chart rendered automatically — no extra steps. "
        "Library preference: seaborn (sns) first, then matplotlib (plt), then plotly. "
        "Always import what you use: `import seaborn as sns` / `import matplotlib.pyplot as plt`. "
        "Always end with `plt.tight_layout()` and `plt.show()`. "
        "DO include a chart when: trends, comparisons, distributions, proportions (6+ rows). "
        "Do NOT include a chart when: simple lookups, raw data dumps, few rows (<5), yes/no answers. "
        "DIAGRAMS: ALWAYS use PlantUML (```plantuml) for: ER diagrams, sequence, class, activity, "
        "component, state, WBS, mindmap, Gantt, network, wireframe, JSON/YAML. "
        "ER DIAGRAMS: MUST use ```plantuml with entity syntax — see your chat2db-jupyter-interface skill for the exact example. "
        "Chat2DB renders PlantUML as SVG inline — the user sees the diagram automatically. "
        "MERMAID DIAGRAMS: When Mermaid is needed (only when PlantUML has NO dedicated diagram type "
        "or user explicitly asks for Mermaid), generate a COMPLETE self-contained HTML page in a ```html block. "
        "Include the Mermaid CDN script so it renders standalone. Example: "
        "```html\\n<!DOCTYPE html>\\n<html><head><meta charset=\"utf-8\"/>\\n"
        "<script src=\"https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js\"></script>\\n"
        "<script>mermaid.initialize({ startOnLoad: true, theme: 'default' });</script>\\n"
        "</head><body>\\n<div class=\"mermaid\">\\nflowchart TD\\n  A[Start] --> B{Decision}\\n</div>\\n"
        "</body></html>\\n``` "
        "Chat2DB renders it in an iframe — the user sees the diagram automatically. "
        "HTML CONTENT: ALL ```html blocks (dashboards, mockups, Mermaid diagrams, etc.) "
        "MUST be fully self-contained HTML pages. Include ALL needed CSS and JS from CDN "
        "(e.g. Bootstrap, Tailwind, Chart.js, D3 — whatever the content needs). "
        "The HTML runs inside an isolated iframe with NO access to parent page resources. "
        "Chat2DB renders it in an iframe inline. "
        "CODE: When sharing code examples (groovy, bash, etc.), use fenced code blocks "
        "with the language tag (e.g. ```groovy). Chat2DB syntax-highlights them automatically. "
        "IMPORTANT: In Chat2DB, respond directly in the conversation with whatever fits — "
        "narrative text, SQL, visualizations, diagrams (```plantuml), HTML mockups (```html), code examples, etc. "
        "Do NOT create or modify files on disk unless the user explicitly asks to create/modify files on disk. "
        "Your response IS the output — the user sees it rendered automatically. "
        "REMINDER: Make sure you have read your 'chat2db-jupyter-interface' skill."
    )

    def __init__(self,
                 base_url: Optional[str] = None,
                 model: Optional[str] = None):
        """
        Initialize Letta AI client for Athena.

        Args:
            base_url: OpenAI-compatible API base URL. Defaults to OPENAI_API_BASE env var.
                      Points to the ai-hub-frend adapter that wraps Letta agents.
            model: Model name for the API. Defaults to OPENAI_MODEL env var.
        """
        self.base_url = (base_url or os.environ.get(
            'OPENAI_API_BASE',
            'http://flowkraft-ai-hub-frend:3000/api/openai/athena/v1'
        )).rstrip('/')
        self.model = model or os.environ.get('OPENAI_MODEL', 'letta:athena')

        # Letta agents can be slow (memory ops, summarization, multiple LLM calls)
        # Use a generous timeout - 10 minutes
        self._client = httpx.Client(timeout=600.0)
        self._schema_context: Optional[str] = None

    def set_schema_context(self, schema: str):
        """
        Set the database schema context for Athena.

        The schema is included in every SQL generation request,
        giving Athena full awareness of the database structure.

        Args:
            schema: Database schema description (tables, columns, types).
        """
        self._schema_context = schema

    def _build_user_prompt(self, question: str, db_connected: bool = True) -> str:
        """
        Build the user prompt with optional database context.

        Structure:
        - USER QUERY: <the actual question to answer>
        - --- DATABASE CONTEXT --- (only if Send Tables is checked)
        - --- CHAT2DB INTERFACE --- (always appended so Athena knows the context)

        Athena decides what to do based on the question:
        - Data query → generate SQL + optional visualization
        - Chit-chat → respond conversationally
        - DataPallas config → guide through UI
        - Unclear → ask for clarification
        """
        parts = []

        # User's question comes FIRST - this is what Athena should answer
        parts.append(f"USER QUERY: {question}")

        # Connection-awareness hint — steers Athena's intent BEFORE the question is read.
        parts.append("")
        if db_connected:
            parts.append("--- A DATABASE IS CONNECTED ---")
            parts.append(
                "A database is connected, so the user may be asking EITHER a data/SQL "
                "question about their tables OR a DataPallas product question (setup, "
                "configuration, distribution/delivery, troubleshooting, how-to). Read "
                "their intent and answer accordingly — write SQL only for genuine data "
                "questions."
            )
        else:
            parts.append("--- NO DATABASE IS CONNECTED (IMPORTANT) ---")
            parts.append(
                "No database connection was provided, so the user CANNOT be asking a "
                "data/SQL question about their own tables. Treat this with 100% confidence "
                "as a DataPallas PRODUCT question — installation, setup, configuration, "
                "report bursting, distribution/delivery, variables, scripting, the server, "
                "licensing, troubleshooting, \"how does X work\", or \"where do I find Y\". "
                "Do NOT write SQL and do NOT ask them to pick a database. Answer from your "
                "DataPallas product knowledge and skills. Only if they clearly want to query "
                "their own data, briefly remind them to connect a database first using the "
                "selector at the top."
            )

        # Database context comes AFTER (if provided)
        if self._schema_context:
            parts.append("")
            parts.append("--- DATABASE CONTEXT ---")
            parts.append(self._schema_context)

        # Interface context ALWAYS appended — must be in user message
        # because Letta may not forward external system messages to the LLM
        parts.append("")
        parts.append("--- CHAT2DB INTERFACE ---")
        parts.append(self.CHAT2DB_CONTEXT)

        return "\n".join(parts)

    def _build_messages(self, user_message: str, include_context_tag: bool = True) -> List[Dict[str, str]]:
        """Build the OpenAI-format messages array.

        All messages are sent as 'user' role only — never 'system'.
        Letta manages its own system prompt (memory blocks, persona, skills)
        and external system messages can interfere with that.
        The CHAT2DB_CONTEXT is already embedded in the user prompt
        via _build_user_prompt().
        """
        messages = []
        messages.append({"role": "user", "content": user_message})
        return messages

    def _debug_prompt(self, prompt: str) -> None:
        """Print debug info if CHAT2DB_DEBUG is enabled."""
        if os.environ.get('CHAT2DB_DEBUG', '').lower() == 'true':
            print("\n" + "=" * 60)
            print("DEBUG: Prompt being sent to Athena:")
            print("=" * 60)
            print(prompt)
            print("=" * 60 + "\n")

    def generate_sql(self, question: str, schema: Optional[str] = None, db_connected: bool = True) -> LettaResponse:
        """
        Ask Athena a question, optionally with table index context.

        Athena decides the appropriate response based on intent:
        - Data query → generates SQL
        - Chit-chat → responds conversationally
        - DataPallas config → guides through UI
        - Unclear → asks for clarification

        Args:
            question: Natural language question or message.
            schema: Optional table index (table names only, not columns).

        Returns:
            LettaResponse with content and extracted SQL (if applicable).
        """
        # Update schema context
        self._schema_context = schema

        prompt = self._build_user_prompt(question, db_connected=db_connected)
        self._debug_prompt(prompt)

        response = self.send_message(prompt, include_context_tag=True)
        enriched = self.enrich_response(response.content)
        enriched.raw_response = response.raw_response
        return enriched

    def enrich_response(self, content: str) -> LettaResponse:
        """Extract SQL / viz / diagram / narrative / segments from a completed reply.

        Shared by the blocking (generate_sql) and streaming (stream_generate) paths
        so both parse Athena's output identically.
        """
        response = LettaResponse(content=content)
        # Try to extract SQL if present (Athena may or may not generate SQL)
        response.sql = self._extract_sql(content)
        # Try to extract visualization code if present
        response.viz_code = self._extract_viz_code(content)
        # Extract diagram and HTML content if present
        response.plantuml_code = self._extract_plantuml(content)
        response.html_content = self._extract_html(content)
        # Extract Athena's inline narrative (text around specifically-rendered blocks)
        response.narrative = self._extract_narrative(content)
        # Parse ordered content segments to preserve Athena's rendering order
        response.content_segments = self._extract_content_segments(content)
        return response

    def stream_generate(self, question: str, schema: Optional[str] = None, db_connected: bool = True):
        """Streaming counterpart of generate_sql — yields Athena's reply as text
        deltas (str) as they arrive. The caller accumulates the full text and then
        calls enrich_response() on it to extract SQL / viz / segments.
        """
        self._schema_context = schema
        prompt = self._build_user_prompt(question, db_connected=db_connected)
        self._debug_prompt(prompt)
        yield from self.stream_message(prompt, include_context_tag=True)

    def stream_message(self, message: str, include_context_tag: bool = True):
        """POST to the OpenAI-compatible adapter with stream=True and yield the
        assistant's text deltas, parsing OpenAI `chat.completion.chunk` SSE lines.
        """
        url = f"{self.base_url}/chat/completions"
        payload = {
            "model": self.model,
            "messages": self._build_messages(message, include_context_tag=include_context_tag),
            "stream": True,
        }
        with self._client.stream(
            "POST", url, json=payload, headers={"Content-Type": "application/json"}
        ) as response:
            response.raise_for_status()
            for line in response.iter_lines():
                if not line or not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if data == "[DONE]":
                    break
                try:
                    obj = json.loads(data)
                except (json.JSONDecodeError, ValueError):
                    continue
                choices = obj.get("choices") or []
                if not choices:
                    continue
                delta = (choices[0].get("delta") or {}).get("content")
                if delta:
                    yield delta

    def send_message(self, message: str, include_context_tag: bool = True) -> LettaResponse:
        """
        Send a message to Athena via the OpenAI-compatible adapter.

        Args:
            message: Message content to send.
            include_context_tag: Whether to include [Chat2DB/Jupyter] context tag.

        Returns:
            LettaResponse from Athena.
        """
        url = f"{self.base_url}/chat/completions"

        payload = {
            "model": self.model,
            "messages": self._build_messages(message, include_context_tag=include_context_tag),
            "stream": False,
        }

        try:
            response = self._client.post(
                url,
                json=payload,
                headers={"Content-Type": "application/json"},
            )
            response.raise_for_status()
            data = response.json()

            # Standard OpenAI response format: choices[0].message.content
            content = (
                data.get("choices", [{}])[0]
                .get("message", {})
                .get("content", "")
            )

            return LettaResponse(
                content=content,
                raw_response=data,
            )
        except httpx.HTTPStatusError as e:
            error_body = e.response.text if e.response else str(e)
            raise ConnectionError(
                f"Athena request failed (HTTP {e.response.status_code}): {error_body}"
            )
        except httpx.HTTPError as e:
            raise ConnectionError(f"Failed to communicate with Athena: {e}")

    def _extract_sql(self, text: str) -> Optional[str]:
        """Extract SQL query from LLM response text.

        Specifically looks for ```sql blocks first, then generic blocks
        containing SQL, then bare SQL statements. Avoids capturing
        ```python blocks (which are visualization code).
        """
        if not text:
            return None

        # Strategy 1: Explicit ```sql code blocks
        sql_block_pattern = r'```sql\s*([\s\S]*?)```'
        matches = re.findall(sql_block_pattern, text, re.IGNORECASE)
        if matches:
            return matches[0].strip()

        # Strategy 2: Generic code blocks (no language tag) that start with SQL
        generic_block_pattern = r'```\s*((?:SELECT|WITH)[\s\S]*?)```'
        matches = re.findall(generic_block_pattern, text, re.IGNORECASE)
        if matches:
            return matches[0].strip()

        # No bare-text SQL detection — too many false positives with
        # conversational text containing "with" or "select" as English words.
        # Athena is instructed to use ```sql blocks via CHAT2DB_CONTEXT and SKILL.md.
        return None

    def _extract_viz_code(self, text: str) -> Optional[str]:
        """Extract Python visualization code from LLM response text.

        Looks for ```python code blocks that contain visualization
        commands (matplotlib, plotly, or pandas .plot).
        """
        if not text:
            return None

        python_block_pattern = r'```python\s*([\s\S]*?)```'
        matches = re.findall(python_block_pattern, text, re.IGNORECASE)
        if matches:
            return matches[0].strip()

        return None

    def _extract_plantuml(self, text: str) -> Optional[str]:
        """Extract PlantUML diagram source from ```plantuml code blocks."""
        if not text:
            return None
        matches = re.findall(r'```plantuml\s*([\s\S]*?)```', text, re.IGNORECASE)
        return matches[0].strip() if matches else None

    def _extract_html(self, text: str) -> Optional[str]:
        """Extract HTML content from ```html code blocks."""
        if not text:
            return None
        matches = re.findall(r'```html\s*([\s\S]*?)```', text, re.IGNORECASE)
        return matches[0].strip() if matches else None

    def _extract_narrative(self, text: str) -> Optional[str]:
        """Extract Athena's inline narrative by stripping specifically-rendered blocks.

        Only strips code blocks that get special rendering (SQL, Python viz,
        PlantUML, HTML). Generic code blocks (groovy, bash, etc.)
        are preserved so ReactMarkdown can render them with syntax highlighting.
        """
        if not text:
            return None

        # Strip only the block types we extract for special rendering
        stripped = re.sub(
            r'```(?:sql|python|plantuml|html)\s*[\s\S]*?```',
            '', text, flags=re.IGNORECASE
        )
        # Collapse multiple blank lines into one
        stripped = re.sub(r'\n{3,}', '\n\n', stripped).strip()

        return stripped if stripped else None

    def _extract_content_segments(self, text: str) -> list:
        """Parse response into ordered content segments, preserving Athena's order.

        Returns list of dicts: [{"type": "narrative", "content": "..."}, {"type": "plantuml", "content": "..."}, ...]
        Special block types (sql, python, plantuml, html) get their own segments.
        Everything else (including generic code blocks like groovy/bash) stays in narrative segments.
        """
        if not text:
            return []

        segments = []
        pattern = r'```(sql|python|plantuml|html)\s*([\s\S]*?)```'
        last_end = 0

        for match in re.finditer(pattern, text, re.IGNORECASE):
            # Narrative text before this block
            before = text[last_end:match.start()].strip()
            if before:
                segments.append({"type": "narrative", "content": before})

            block_type = match.group(1).lower()
            block_content = match.group(2).strip()

            if block_type == "sql":
                segments.append({"type": "sql_results", "content": block_content})
            elif block_type == "python":
                segments.append({"type": "viz", "content": block_content})
            else:
                segments.append({"type": block_type, "content": block_content})

            last_end = match.end()

        # Narrative text after the last block
        after = text[last_end:].strip()
        if after:
            segments.append({"type": "narrative", "content": after})

        return segments

    def health_check(self) -> bool:
        """Check if the Athena endpoint is accessible."""
        try:
            response = self._client.get(
                f"{self.base_url}/models",
                timeout=5.0,
            )
            return response.status_code == 200
        except Exception:
            return False

    def close(self):
        """Close the HTTP client."""
        self._client.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()


def test_letta_connection():
    """Test Athena AI connectivity via the OpenAI-compatible adapter."""
    client = LettaChat2DB()

    print(f"🔌 Testing Athena connection...")
    print(f"   Endpoint: {client.base_url}")
    print(f"   Model: {client.model}")

    if client.health_check():
        print("✅ Athena endpoint is reachable!")

        print("\n📋 Testing Athena communication...")
        try:
            response = client.send_message("Hello! Please respond with 'Ready for SQL generation.'")
            print(f"   Athena response: {response.content[:200]}...")
        except Exception as e:
            print(f"   ⚠️ Athena communication failed: {e}")
    else:
        print("❌ Cannot reach Athena endpoint")
        print(f"   Make sure ai-hub-frend is running and Athena is provisioned")
        print(f"   Expected: {client.base_url}/chat/completions")


if __name__ == "__main__":
    test_letta_connection()
