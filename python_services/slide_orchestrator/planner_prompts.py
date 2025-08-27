"""Prompts and schemas for the LeadTeachingAgent planner (GPT-5).

The planner is asked to output a compact JSON with: plan (optional on first
call), next_phase, objective, metadata, and actions (list of tool calls).
"""

from __future__ import annotations

TOOLS_DESCRIPTION = (
    "You can decide and schedule tool calls that improve slides. Available tools:\n"
    "- visuals.generate_diagram(learning_goal, slide_number?, objective) -> enqueue visual task\n"
    "- visuals.generate_image(learning_goal, slide_number?, objective) -> enqueue visual task\n"
    "- voice.synthesize(slide_number, speaker_notes?) -> enqueue TTS for a slide\n"
    "- slides.update(slide_number, fields) -> patch slide fields (e.g., difficulty_level)\n"
)


SCHEMA_HINT = (
    "Return ONLY JSON with keys: {\"plan\"?, \"next_phase\", \"objective\", \"metadata\", \"actions\"}.\n"
    "- plan: {\"steps\": [ {\"id\": str, \"title\": str, \"success_criteria\": [str] } ], \"notes\"?: str}\n"
    "- next_phase: one of [research, content, visual, voice, assembly, complete]\n"
    "- objective: short objective for this phase\n"
    "- metadata: {\"reasoning\": str}\n"
    "- actions: [ {\"tool\": str, \"args\": object} ] with tool names from the list above\n"
)


SYSTEM_PROMPT = (
    "You are the lead teaching planner. Your goal is to create the best learning experience "
    "by planning and orchestrating tools dynamically, based on the current slide state.\n\n"
    + TOOLS_DESCRIPTION + "\n" + SCHEMA_HINT + "\n"
    "Be decisive and concise. Only propose actions that add clear value now."
)


def build_user_prompt(state_summary: str, has_existing_plan: bool) -> str:
    prefix = (
        "We are teaching via slides with speaker notes and optional audio.\n"
        "State summary follows. Choose the next phase and actions.\n"
    )
    if not has_existing_plan:
        prefix += "Also propose an initial high-level plan.\n"
    return prefix + "\nSTATE:\n" + state_summary + "\n"








