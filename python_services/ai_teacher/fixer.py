from __future__ import annotations

import re
from typing import Optional, Dict, Any


RUNTIME_TIPS = [
    # Common React Native Web Animated mistakes
    (r"Animated\.useRef", "Replace Animated.useRef with React.useRef or use Animated.Value"),
]


def _strip_code_fences(text: str) -> str:
    """Remove surrounding ``` fences (with optional language) and any trailing fence.

    Handles Unix (\n) and Windows (\r\n) newlines and trims whitespace.
    """
    import re as _re
    s = text.strip()
    # Surrounding fenced block
    m = _re.match(r"^```[a-zA-Z]*\r?\n([\s\S]*?)\r?\n```\s*$", s)
    if m:
        return m.group(1).strip()
    # Leading fence only
    s = _re.sub(r"^```[a-zA-Z]*\r?\n", "", s)
    # Trailing fence only
    s = _re.sub(r"\r?\n```\s*$", "", s)
    return s.strip()


def _apply_regex_fixes(code: str) -> Optional[str]:
    fixed = code
    changed = False

    # Fix Animated.useRef -> React.useRef for hooks usage
    if re.search(r"Animated\.useRef\s*\(", fixed):
        fixed = re.sub(r"Animated\.useRef\s*\(", "React.useRef(", fixed)
        changed = True

    # Ensure Animated alias exists in factory scope: we expose Animated as param
    # Prefer using Animated.Value(...) instead of new Animated.Value
    fixed = re.sub(r"new\s+Animated\.Value\s*\(", "Animated.Value(", fixed)

    return fixed if changed else None


async def attempt_fix(code: str, error_message: str, topic: Optional[str] = None, platform: Optional[str] = None) -> str:
    """Attempt a quick, deterministic fix for common runtime errors.

    Strategy:
    1) Apply safe regex-based rewrites for known issues.
    2) If no changes, return original code.
    """
    # Step 1: regex-based quick fixes
    fixed = _apply_regex_fixes(code)
    if fixed:
        return fixed

    # Step 2: targeted guidance comments (non-invasive)
    # If the error references Animated.useRef but not found in code (dynamic), suggest a minimal guard
    if "Animated.useRef is not a function" in error_message and "useRef(" in code and "Animated.useRef" not in code:
        return code  # nothing actionable; keep original

    # Default: return original if nothing to change
    return code


async def attempt_llm_fix(
    *,
    code: str,
    error_message: str,
    session_context: Optional[Dict[str, Any]] = None,
    repair_history: Optional[list[Dict[str, Any]]] = None,
    provider_preference: Optional[str] = None,
) -> str:
    """Ask the LLM to repair the code with prior session context.

    Requirements given to the model mirror the runtime contract in TeacherAgent.
    The model must return ONLY a fenced TSX block or raw TSX that exports a default function.
    """
    try:
        from shared.llm_client import get_llm_client, LLMProvider

        llm = get_llm_client()

        # Build messages with strict contract
        system = (
            "You are a strict code repair assistant for a React Native Web slide runtime. "
            "Your task is to generate a COMPLETE, SELF-CONTAINED TSX FILE (one component) from scratch each time. "
            "Do NOT produce diffs, partial snippets, or commentary. "
            "Available symbols (scoped by the host, no imports allowed): React, View, Text, Image, StyleSheet, Dimensions, Platform, Animated, "
            "Svg, Path, Rect, Circle, Line, Polygon, SvgText, MermaidDiagram, utils, and props (which contains { slide, showCaptions, isPlaying, timeSeconds, timeline, wordTimestamps, Svg, Path, Rect, Circle, Line, Polygon, SvgText }). "
            "Constraints:\n"
            "- Return exactly ONE fenced code block with language tsx.\n"
            "- The file MUST include `export default function` returning valid JSX.\n"
            "- No imports, no require, no external assets beyond utils.resolveImageUrl.\n"
            "- Ensure all JSX tags are properly closed and attributes are valid (Quotes for strings, braces for expressions).\n"
            "- Prefer simple, readable visuals; keep under ~140 lines.\n"
            "- If Animated is used, reference the provided Animated symbol (no new Animated.Value with 'new')."
        )

        narration = (session_context or {}).get("narration") or ""
        prior_code = (session_context or {}).get("code") or code
        # Summarize prior repair attempts for conversational continuity (last 5)
        history = repair_history or []
        if history:
            try:
                last_five = history[-5:]
                attempts_summary_lines = []
                for idx, item in enumerate(last_five, start=max(1, len(history) - len(last_five) + 1)):
                    err = str(item.get("error") or "").strip()
                    err_short = (err[:200] + "…") if len(err) > 200 else err
                    attempts_summary_lines.append(f"{idx}) {err_short}")
                attempts_summary = "\n".join(attempts_summary_lines)
            except Exception:
                attempts_summary = ""
        else:
            attempts_summary = ""

        user = (
            "The previously generated code failed to render. "
            f"Error: {error_message}\n\n"
            "Context: Code is compiled via Babel and executed in a sandbox with the symbols listed. "
            "Do not patch the old code – REGENERATE a fresh working component that adheres to the contract.\n\n"
            f"Prior narration (optional):\n{narration}\n\n"
            + ("Previous attempts and errors (most recent last):\n" + attempts_summary + "\n\n" if attempts_summary else "")
            + "Response format (MANDATORY):\n"
            "```tsx\n// no comments above this line\n<YOUR COMPLETE TSX FILE HERE>\n```\n"
            "Do not include any explanation before or after the code block."
        )

        messages = [
            type("Msg", (), {"role": type("Role", (), {"value": "system"}), "content": system}),
            type("Msg", (), {"role": type("Role", (), {"value": "user"}), "content": user}),
            type("Msg", (), {"role": type("Role", (), {"value": "user"}), "content": f"```tsx\n{prior_code}\n```"}),
        ]

        preferred = None
        if provider_preference:
            try:
                preferred = getattr(__import__('shared.llm_client', fromlist=['LLMProvider']).LLMProvider, provider_preference.upper())
            except Exception:
                preferred = None

        response_text, _provider = await llm.generate_response(
            messages=messages,
            preferred_provider=preferred or LLMProvider.OPENAI,
            model=None,
            allow_fallback=True,
            max_tokens=1600,
            temperature=0.2,
        )

        # Extract a code block if present
        import re
        # Allow CRLF and optional language tag
        m = re.search(r"```(?:tsx|jsx)?\r?\n([\s\S]*?)\r?\n```", response_text, flags=re.IGNORECASE)
        fixed_raw = (m.group(1).strip() if m else response_text.strip())
        fixed = _strip_code_fences(fixed_raw)
        return fixed or code
    except Exception:
        # On any failure, return original code to avoid breaking flow
        return code


