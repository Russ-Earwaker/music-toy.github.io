#!/usr/bin/env python3
"""Offline sample analysis helper.

Usage:
    python tools/analyze_samples.py
    python tools/analyze_samples.py --input samples.csv --samples-dir assets/samples --output tools/output/sample-analysis-suggestions.csv

Reads samples.csv, detects which schema columns represent raw source-note /
octave / volume targets, finds rows with missing values, analyzes the
corresponding WAV files, and writes separate review CSVs for manual use. The
source samples.csv is never modified.

If raw source-pitch columns exist they are preferred over playback anchor
columns so note playback behavior can remain stable across toys.
"""

from __future__ import annotations

import argparse
import csv
import math
import wave
from pathlib import Path
from typing import Iterable


DEFAULT_INPUT = Path("samples.csv")
DEFAULT_SAMPLES_DIR = Path("assets/samples")
DEFAULT_OUTPUT = Path("tools/output/sample-analysis-suggestions.csv")
DEFAULT_DEBUG_OUTPUT = Path("tools/output/sample-analysis-debug.csv")

# Adjust these candidate names or thresholds if the CSV schema evolves.
TARGET_COLUMN_CANDIDATES = {
    "note": (
        "source_base_note",
        "sample_base_note",
        "detected_base_note",
        "base_note",
        "note",
        "baseNote",
        "root_note",
    ),
    "octave": (
        "source_base_oct",
        "source_base_octave",
        "sample_base_oct",
        "sample_base_octave",
        "detected_base_oct",
        "base_oct",
        "base_octave",
        "octave",
        "root_octave",
    ),
    "volume": ("volume", "base_volume", "volume_dbfs", "level_dbfs", "gain_dbfs"),
}
VOLUME_THRESHOLDS_DBFS = {
    "too_hot_peak_dbfs": -1.0,
    "quiet_rms_dbfs": -24.0,
}

NOTE_NAMES = ("C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B")
PITCH_MIN_HZ = 40.0
PITCH_MAX_HZ = 2000.0
TRIM_THRESHOLD_FLOOR = 0.002
TRIM_THRESHOLD_RATIO = 0.02
TRIM_PAD_SECONDS = 0.01
TRANSIENT_SKIP_SECONDS = 0.03
TRANSIENT_SKIP_RATIO = 0.10
MAX_TRANSIENT_SKIP_SECONDS = 0.08
MAX_ANALYSIS_SECONDS = 0.35
TARGET_ANALYSIS_RATE = 12000
CLIP_THRESHOLD = 0.999


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Analyze missing sample metadata offline.")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT, help="Path to samples.csv")
    parser.add_argument(
        "--samples-dir",
        type=Path,
        default=DEFAULT_SAMPLES_DIR,
        help="Directory containing sample WAV files",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help="Path for the generated suggestions CSV",
    )
    parser.add_argument(
        "--debug-output",
        type=Path,
        default=DEFAULT_DEBUG_OUTPUT,
        help="Path for the optional debug CSV with fuller analysis details",
    )
    return parser.parse_args()


def iter_sample_rows(csv_path: Path) -> tuple[list[str], list[dict[str, str]]]:
    filtered_text = []
    source_indexes = []
    with csv_path.open("r", encoding="utf-8-sig", newline="") as handle:
        for source_index, line in enumerate(handle, start=1):
            if line.lstrip().startswith("#"):
                continue
            filtered_text.append(line)
            source_indexes.append(source_index)

    reader = csv.DictReader(filtered_text)
    fieldnames = list(reader.fieldnames or [])
    rows = []
    for row, source_index in zip(reader, source_indexes[1:]):
        row["__source_row_index"] = str(source_index)
        rows.append(row)
    return fieldnames, rows


def detect_target_columns(fieldnames: list[str]) -> dict[str, str]:
    detected = {}
    available = {name.lower(): name for name in fieldnames}
    for target_name, candidates in TARGET_COLUMN_CANDIDATES.items():
        for candidate in candidates:
            actual = available.get(candidate.lower())
            if actual:
                detected[target_name] = actual
                break
        if target_name not in detected:
            raise ValueError(f"Could not detect a {target_name} target column in samples.csv.")
    return detected


def has_missing_target_fields(row: dict[str, str], target_columns: dict[str, str]) -> bool:
    if not (row.get("filename") or "").strip():
        return False
    required_columns = (
        target_columns["note"],
        target_columns["octave"],
        target_columns["volume"],
    )
    return any(not (row.get(field) or "").strip() for field in required_columns)


def find_missing_target_fields(row: dict[str, str], target_columns: dict[str, str]) -> list[str]:
    return [
        field
        for field in (
            target_columns["note"],
            target_columns["octave"],
            target_columns["volume"],
        )
        if not (row.get(field) or "").strip()
    ]


def read_wav_mono(path: Path) -> tuple[list[float], int]:
    with wave.open(str(path), "rb") as wav_file:
        channels = wav_file.getnchannels()
        sample_width = wav_file.getsampwidth()
        sample_rate = wav_file.getframerate()
        frame_count = wav_file.getnframes()
        frames = wav_file.readframes(frame_count)

    samples = decode_pcm_frames(frames, sample_width)
    if channels > 1:
        mono = []
        for index in range(0, len(samples), channels):
            frame = samples[index : index + channels]
            mono.append(sum(frame) / len(frame))
        return mono, sample_rate
    return samples, sample_rate


def decode_pcm_frames(frames: bytes, sample_width: int) -> list[float]:
    if sample_width == 1:
        scale = 128.0
        return [((value - 128) / scale) for value in frames]

    if sample_width == 2:
        scale = 32768.0
        samples = []
        for index in range(0, len(frames), 2):
            samples.append(int.from_bytes(frames[index : index + 2], "little", signed=True) / scale)
        return samples

    if sample_width == 3:
        scale = 8388608.0
        samples = []
        for index in range(0, len(frames), 3):
            chunk = frames[index : index + 3]
            raw = int.from_bytes(chunk + (b"\xff" if chunk[2] & 0x80 else b"\x00"), "little", signed=True)
            samples.append(raw / scale)
        return samples

    if sample_width == 4:
        scale = 2147483648.0
        samples = []
        for index in range(0, len(frames), 4):
            samples.append(int.from_bytes(frames[index : index + 4], "little", signed=True) / scale)
        return samples

    raise ValueError(f"Unsupported WAV sample width: {sample_width}")


def trim_silence(samples: list[float], sample_rate: int) -> list[float]:
    if not samples:
        return []
    peak = max(abs(sample) for sample in samples)
    if peak <= 0.0:
        return []

    threshold = max(TRIM_THRESHOLD_FLOOR, peak * TRIM_THRESHOLD_RATIO)
    start = 0
    end = len(samples) - 1

    while start < len(samples) and abs(samples[start]) < threshold:
        start += 1
    while end >= start and abs(samples[end]) < threshold:
        end -= 1

    if start > end:
        return []

    pad = int(sample_rate * TRIM_PAD_SECONDS)
    start = max(0, start - pad)
    end = min(len(samples) - 1, end + pad)
    return samples[start : end + 1]


def rms(samples: Iterable[float]) -> float:
    values = list(samples)
    if not values:
        return 0.0
    return math.sqrt(sum(sample * sample for sample in values) / len(values))


def to_dbfs(amplitude: float) -> str:
    if amplitude <= 0.0:
        return ""
    return f"{20.0 * math.log10(amplitude):.2f}"


def parse_dbfs(value: str) -> float | None:
    if not value:
        return None
    try:
        return float(value)
    except ValueError:
        return None


def downsample(samples: list[float], sample_rate: int) -> tuple[list[float], int]:
    if sample_rate <= TARGET_ANALYSIS_RATE:
        return samples, sample_rate
    step = max(1, round(sample_rate / TARGET_ANALYSIS_RATE))
    reduced = samples[::step]
    new_rate = max(1, round(sample_rate / step))
    return reduced, new_rate


def estimate_pitch(samples: list[float], sample_rate: int) -> dict[str, object]:
    if len(samples) < max(32, int(sample_rate * 0.05)):
        return {"status": "too_short", "notes": "Not enough post-transient audio for pitch detection."}

    transient_skip = min(
        int(sample_rate * MAX_TRANSIENT_SKIP_SECONDS),
        max(int(sample_rate * TRANSIENT_SKIP_SECONDS), int(len(samples) * TRANSIENT_SKIP_RATIO)),
    )
    analysis = samples[transient_skip:] if transient_skip < len(samples) else []
    if len(analysis) < max(32, int(sample_rate * 0.05)):
        return {"status": "too_short", "notes": "Trimmed sample becomes too short after skipping transient."}

    analysis, sample_rate = downsample(analysis, sample_rate)
    max_samples = int(sample_rate * MAX_ANALYSIS_SECONDS)
    if len(analysis) > max_samples:
        analysis = analysis[:max_samples]

    mean = sum(analysis) / len(analysis)
    analysis = [sample - mean for sample in analysis]
    energy = sum(sample * sample for sample in analysis)
    if energy <= 1e-9:
        return {"status": "unpitched", "notes": "Signal energy is too low after trimming."}

    min_lag = max(1, int(sample_rate / PITCH_MAX_HZ))
    max_lag = min(len(analysis) // 2, int(sample_rate / PITCH_MIN_HZ))
    if max_lag <= min_lag:
        return {"status": "too_short", "notes": "Audio window is too short for pitch search range."}

    best_lag = None
    best_corr = -1.0
    correlations: list[tuple[int, float]] = []

    for lag in range(min_lag, max_lag + 1):
        left_energy = 0.0
        right_energy = 0.0
        dot = 0.0
        upper = len(analysis) - lag
        for index in range(upper):
            left = analysis[index]
            right = analysis[index + lag]
            dot += left * right
            left_energy += left * left
            right_energy += right * right
        if left_energy <= 0.0 or right_energy <= 0.0:
            continue
        corr = dot / math.sqrt(left_energy * right_energy)
        correlations.append((lag, corr))
        if corr > best_corr:
            best_corr = corr
            best_lag = lag

    if best_lag is None or best_corr < 0.35:
        return {"status": "unpitched", "notes": "No stable autocorrelation peak was found."}

    if best_lag <= min_lag + 1 or best_lag >= max_lag - 1:
        return {
            "status": "unpitched",
            "notes": "Best pitch candidate landed on the search boundary, so it is treated as unreliable.",
        }

    frequency = sample_rate / best_lag
    midi = 69 + 12 * math.log2(frequency / 440.0)
    nearest_midi = int(round(midi))
    note_name = NOTE_NAMES[nearest_midi % 12]
    octave = (nearest_midi // 12) - 1
    cents_error = (midi - nearest_midi) * 100.0

    local_support = best_corr
    for lag, corr in correlations:
        if abs(lag - best_lag) <= 2 and corr > local_support:
            local_support = corr

    confidence = max(0.0, min(1.0, (best_corr - 0.35) / 0.55))
    if abs(cents_error) > 45.0:
        confidence *= 0.75

    transpose_to_c = suggest_transpose_to_c(nearest_midi)
    status = "pitched" if confidence >= 0.45 else "low_confidence"
    notes = f"autocorr={best_corr:.3f}; cents_error={cents_error:+.1f}"
    if status != "pitched":
        notes = f"{notes}; pitch estimate is weak"

    return {
        "status": status,
        "detected_note": note_name,
        "detected_octave": str(octave),
        "detected_hz": f"{frequency:.2f}",
        "pitch_confidence": f"{confidence:.2f}",
        "suggested_transpose_to_c": str(transpose_to_c),
        "notes": notes,
    }


def suggest_transpose_to_c(midi_note: int) -> int:
    pitch_class = midi_note % 12
    downward = -pitch_class
    upward = 12 - pitch_class if pitch_class else 0
    if abs(downward) <= abs(upward):
        return downward
    return upward


def classify_volume(peak_dbfs: str, rms_dbfs: str) -> str:
    peak_value = parse_dbfs(peak_dbfs)
    rms_value = parse_dbfs(rms_dbfs)
    if peak_value is not None and peak_value >= VOLUME_THRESHOLDS_DBFS["too_hot_peak_dbfs"]:
        return "too_hot"
    if rms_value is not None and rms_value <= VOLUME_THRESHOLDS_DBFS["quiet_rms_dbfs"]:
        return "quiet"
    return "ok"


def determine_is_c_pitch_class(detected_note: str) -> str:
    return "yes" if detected_note == "C" else "no"


def determine_near_c(detected_note: str, suggested_transpose_to_c: str) -> str:
    if determine_is_c_pitch_class(detected_note) == "yes":
        return "yes"
    if suggested_transpose_to_c:
        try:
            return "yes" if abs(int(suggested_transpose_to_c)) <= 1 else "no"
        except ValueError:
            return "no"
    return "no"


def analyze_sample(path: Path) -> dict[str, str]:
    if not path.exists():
        return {
            "analysis_status": "file_not_found",
            "notes": f"Missing file: {path}",
        }

    if path.suffix.lower() != ".wav":
        return {
            "analysis_status": "unsupported_format",
            "notes": "Only WAV files are analyzed by this tool.",
        }

    try:
        samples, sample_rate = read_wav_mono(path)
    except wave.Error as exc:
        message = str(exc)
        status = "unsupported_wav_encoding" if "unknown format" in message.lower() else "read_error"
        return {
            "analysis_status": status,
            "notes": message,
        }
    except ValueError as exc:
        return {
            "analysis_status": "read_error",
            "notes": str(exc),
        }

    trimmed = trim_silence(samples, sample_rate)
    if not trimmed:
        return {
            "analysis_status": "trimmed_to_silence",
            "notes": "Signal fell below the trim threshold after silence removal.",
        }

    peak = max(abs(sample) for sample in trimmed)
    level_rms = rms(trimmed)
    clipped = "yes" if peak >= CLIP_THRESHOLD else "no"

    result = {
        "peak_dbfs": to_dbfs(peak),
        "rms_dbfs": to_dbfs(level_rms),
        "clipped": clipped,
        "volume_classification": "",
        "is_c_pitch_class": "",
        "near_c": "",
    }
    result.update(
        {
            "detected_note": "",
            "detected_octave": "",
            "detected_hz": "",
            "pitch_confidence": "",
            "suggested_transpose_to_c": "",
            "analysis_status": "",
            "notes": "",
        }
    )

    pitch = estimate_pitch(trimmed, sample_rate)
    result.update(
        {
            "detected_note": str(pitch.get("detected_note", "")),
            "detected_octave": str(pitch.get("detected_octave", "")),
            "detected_hz": str(pitch.get("detected_hz", "")),
            "pitch_confidence": str(pitch.get("pitch_confidence", "")),
            "suggested_transpose_to_c": str(pitch.get("suggested_transpose_to_c", "")),
            "analysis_status": str(pitch.get("status", "unknown")),
            "notes": str(pitch.get("notes", "")),
        }
    )
    result["is_c_pitch_class"] = determine_is_c_pitch_class(result["detected_note"])
    result["volume_classification"] = classify_volume(result["peak_dbfs"], result["rms_dbfs"])
    result["near_c"] = determine_near_c(
        result["detected_note"],
        result["suggested_transpose_to_c"],
    )
    return result


def main() -> int:
    args = parse_args()
    fieldnames, rows = iter_sample_rows(args.input)
    target_columns = detect_target_columns(fieldnames)

    review_rows = []
    debug_rows = []
    for row in rows:
        if not has_missing_target_fields(row, target_columns):
            continue

        filename = (row.get("filename") or "").strip()
        sample_path = args.samples_dir / filename
        missing_fields = find_missing_target_fields(row, target_columns)

        result = analyze_sample(sample_path)
        notes = result.get("notes", "")
        volume_classification = result.get("volume_classification", "")
        is_c_pitch_class = result.get("is_c_pitch_class", "")
        near_c = result.get("near_c", "")
        if volume_classification:
            notes = f"{notes}; volume_classification={volume_classification}" if notes else f"volume_classification={volume_classification}"
        if is_c_pitch_class:
            notes = f"{notes}; is_c_pitch_class={is_c_pitch_class}" if notes else f"is_c_pitch_class={is_c_pitch_class}"
        if near_c:
            notes = f"{notes}; near_c={near_c}" if notes else f"near_c={near_c}"

        review_rows.append(
            {
                "filename": filename,
                "source_row_index": row.get("__source_row_index", ""),
                "missing_fields_detected": "|".join(missing_fields),
                "suggested_base_note": result.get("detected_note", ""),
                "suggested_base_oct": result.get("detected_octave", ""),
                "suggested_volume_peak_dbfs": result.get("peak_dbfs", ""),
                "suggested_volume_rms_dbfs": result.get("rms_dbfs", ""),
                "pitch_confidence": result.get("pitch_confidence", ""),
                "analysis_status": result.get("analysis_status", ""),
                "suggested_transpose_to_c": result.get("suggested_transpose_to_c", ""),
                "volume_classification": volume_classification,
                "notes": notes,
            }
        )
        debug_rows.append(
            {
                "filename": filename,
                "source_row_index": row.get("__source_row_index", ""),
                "missing_fields_detected": "|".join(missing_fields),
                "suggested_base_note": result.get("detected_note", ""),
                "suggested_base_oct": result.get("detected_octave", ""),
                "suggested_volume_peak_dbfs": result.get("peak_dbfs", ""),
                "suggested_volume_rms_dbfs": result.get("rms_dbfs", ""),
                "pitch_confidence": result.get("pitch_confidence", ""),
                "analysis_status": result.get("analysis_status", ""),
                "notes": result.get("notes", ""),
                "detected_hz": result.get("detected_hz", ""),
                "suggested_transpose_to_c": result.get("suggested_transpose_to_c", ""),
                "clipped": result.get("clipped", ""),
                "peak_dbfs": result.get("peak_dbfs", ""),
                "rms_dbfs": result.get("rms_dbfs", ""),
                "volume_classification": volume_classification,
                "is_c_pitch_class": is_c_pitch_class,
                "near_c": near_c,
            }
        )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    review_fieldnames = [
        "filename",
        "source_row_index",
        "missing_fields_detected",
        "suggested_base_note",
        "suggested_base_oct",
        "suggested_volume_peak_dbfs",
        "suggested_volume_rms_dbfs",
        "pitch_confidence",
        "analysis_status",
        "suggested_transpose_to_c",
        "volume_classification",
        "notes",
    ]
    with args.output.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=review_fieldnames)
        writer.writeheader()
        writer.writerows(review_rows)

    if args.debug_output:
        debug_fieldnames = review_fieldnames + [
            "detected_hz",
            "suggested_transpose_to_c",
            "clipped",
            "peak_dbfs",
            "rms_dbfs",
            "volume_classification",
            "is_c_pitch_class",
            "near_c",
        ]
        args.debug_output.parent.mkdir(parents=True, exist_ok=True)
        with args.debug_output.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=debug_fieldnames)
            writer.writeheader()
            writer.writerows(debug_rows)

    pitched_confidently = sum(1 for row in debug_rows if row["analysis_status"] == "pitched")
    unreliable = len(debug_rows) - pitched_confidently
    volume_counts = {"too_hot": 0, "ok": 0, "quiet": 0}
    for row in debug_rows:
        bucket = row.get("volume_classification", "")
        if bucket in volume_counts:
            volume_counts[bucket] += 1

    print(
        "Detected target columns: "
        f"note={target_columns['note']}, octave={target_columns['octave']}, volume={target_columns['volume']}"
    )
    print(f"Analyzed {len(review_rows)} rows.")
    print(f"Pitched confidently: {pitched_confidently}")
    print(f"Unreliable: {unreliable}")
    print(
        "Volume classification counts: "
        f"too_hot={volume_counts['too_hot']}, ok={volume_counts['ok']}, quiet={volume_counts['quiet']}"
    )
    print(f"Wrote review CSV to {args.output}")
    if args.debug_output:
        print(f"Wrote debug CSV to {args.debug_output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
