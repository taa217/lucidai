from __future__ import annotations

from typing import Any, Dict, List, Tuple


def build_segments_from_word_timestamps(narration: str, words: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Build ~4 beat segments and timeline events from word timestamps."""
    segments: List[Dict[str, Any]] = []
    timeline_events: List[Dict[str, Any]] = []

    if not words:
        return segments, timeline_events

    num_beats = 4 if len(words) >= 28 else (3 if len(words) >= 14 else 2)
    per = max(1, round(len(words) / num_beats))
    idx = 0
    beat_no = 1
    while idx < len(words):
        chunk = words[idx:idx + per]
        text_chunk = " ".join([w.get("word", "") for w in chunk]).strip()
        start = float(chunk[0].get("start", 0.0))
        end = float(chunk[-1].get("end", start))
        seg = {
            "text": text_chunk,
            "start_at": round(start, 2),
            "duration_seconds": round(max(0.2, end - start), 2),
        }
        segments.append(seg)
        timeline_events.append({"at": round(start, 2), "event": "reveal:main" if beat_no == 1 else f"reveal:{beat_no}"})
        beat_no += 1
        idx += per

    return segments, timeline_events


def build_segments_naive(narration: str, total_duration: float) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    import re
    raw = [s.strip() for s in re.split(r"(?<=[\.!?])\s+", narration) if s.strip()]
    if not raw:
        raw = [narration]
    if len(raw) > 5:
        target = 4
        per2 = max(1, round(len(raw) / target))
        beats = [" ".join(raw[i:i + per2]) for i in range(0, len(raw), per2)]
    else:
        beats = raw
    beat_dur = max(1.5, total_duration / max(1, len(beats)))
    t = 0.0
    segments: List[Dict[str, Any]] = []
    timeline_events: List[Dict[str, Any]] = []
    for i, segment_text in enumerate(beats, start=1):
        seg = {"text": segment_text, "start_at": round(t, 2), "duration_seconds": round(beat_dur, 2)}
        segments.append(seg)
        timeline_events.append({"at": round(t, 2), "event": "reveal:main" if i == 1 else f"reveal:{i}"})
        t += beat_dur
    return segments, timeline_events


