from __future__ import annotations

import re
from typing import Optional


def extract_tag(text: str, tag: str) -> Optional[str]:
    m = re.search(rf"<\s*{tag}[^>]*>([\s\S]*?)<\s*/\s*{tag}\s*>", text, flags=re.IGNORECASE)
    return m.group(1).strip() if m else None


def extract_code_block(text: str) -> Optional[str]:
    """Extract TSX/JSX code from a variety of fencing styles."""
    cleaned = text.strip()

    # 1) Triple backticks with optional language and metadata
    m = re.search(r"```\s*(?:tsx|jsx)?[^\n]*\r?\n([\s\S]*?)\r?\n```", cleaned, flags=re.IGNORECASE)
    if m:
        return m.group(1).strip()

    # 2) Any fenced code block without language
    m2 = re.search(r"```\s*\r?\n([\s\S]*?)\r?\n```", cleaned, flags=re.IGNORECASE)
    if m2:
        return m2.group(1).strip()

    # 3) Tilde fences
    m3 = re.search(r"~~~\s*(?:tsx|jsx)?[^\n]*\r?\n([\s\S]*?)\r?\n~~~", cleaned, flags=re.IGNORECASE)
    if m3:
        return m3.group(1).strip()

    # 4) Heuristic: grab from first function/const component declaration
    heuristic = re.search(
        r"(function\s+[A-Za-z_][A-Za-z0-9_]*\s*\([\s\S]*?\)\s*\{[\s\S]*?\}\s*;?\s*(?:module\\.exports\s*=|export\s+default|$))",
        cleaned,
        flags=re.IGNORECASE,
    )
    if heuristic:
        return heuristic.group(1).strip()

    return None


def normalize_tsx(raw_code: str) -> str:
    """Normalize model TSX into a bundler-free CommonJS snippet.

    - Strips import/export lines
    - Converts `export default function Name` → `function Name` + `module.exports = Name;`
    - Ensures `module.exports` points to a plausible component (Lesson/App/Component)
    """
    code = raw_code.strip()

    # Remove BOM or stray backticks
    code = code.replace("\ufeff", "").strip('`')

    # Strip import lines (single line imports only)
    code = re.sub(r"^\s*import\s+[^\n]*\n", "", code, flags=re.MULTILINE)

    # Replace `export default function Name` with `function Name`
    code = re.sub(r"^\s*export\s+default\s+function\s+", "function ", code, flags=re.IGNORECASE | re.MULTILINE)

    # Replace bare `export default <Identifier>` with just `<Identifier>` on its own line
    code = re.sub(r"^\s*export\s+default\s+([A-Za-z_][A-Za-z0-9_]*)\s*;?\s*$", r"\1", code, flags=re.IGNORECASE | re.MULTILINE)

    # Replace `export default (` anonymous component with a named const
    if re.search(r"^\s*export\s+default\s*\(", code, flags=re.IGNORECASE | re.MULTILINE):
        code = re.sub(r"^\s*export\s+default\s*\(", "const Lesson = (", code, flags=re.IGNORECASE | re.MULTILINE)

    # Remove any remaining `export` keywords that might appear on consts
    code = re.sub(r"^\s*export\s+", "", code, flags=re.IGNORECASE | re.MULTILINE)

    # Ensure we have a component name to export
    component_name = None
    for pattern in [
        r"function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(",
        r"const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\(",
        r"let\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\(",
    ]:
        m = re.search(pattern, code)
        if m:
            component_name = m.group(1)
            break

    if not component_name:
        # Fallback to a conventional name and wrap if necessary
        component_name = "Lesson"
        if "return (" not in code:
            prefix = (
                "function " + component_name + "(\n"
                + "  { slide, showCaptions, isPlaying, timeSeconds, timeline }\n"
                + ") {\n"
                + "  return (<div>Rendering error: invalid component</div>);\n"
                + "}\n"
            )
            code = prefix + code

    # Append module.exports assignment if missing
    if not re.search(r"module\\.exports\s*=", code):
        code = code.rstrip() + f"\n\nmodule.exports = {component_name};\n"

    return code


