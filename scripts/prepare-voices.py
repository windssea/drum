#!/usr/bin/env python3
"""Request original role performances from Gemini TTS and master Godot WAVs."""

from argparse import ArgumentParser
from array import array
import math
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
import wave


MODEL = "gemini-3.8-flash-tts"
RATE = 48_000
TAKES = {
    "cast_context": (
        "起锚！<medium pause>扬帆出海！", "Puck",
        "中国年轻鼓手，大声发出航海口令。第一句『起锚』是把船锚从海里拉起来，两个音节 qǐ máo，要响亮标准、很明确。两句用准确的标准普通话，第一句之后停半秒以上再说第二句，一句一气，干净干声。",
    ),
    "watch_context": (
        "当心！<medium pause>大浪来了！", "Charon",
        "一个年老的中国船长激动但清晰，独立地向人发出第一句警告，dāng xīn；准确响亮，刻意把『当』读清。用标准普通话，第一句与第二句停顿至少半秒，干声，一次。",
    ),
    "heave_other": (
        "嗨哟！", "Fenrir",
        "标准普通话。活泼的壮汉领一声拉绳号子，清晰地说出两个短促的完整汉语音节，普通话 hāi yō，别咕哝。干声，半秒左右。",
    ),
    "heave_crew": (
        "嗨哟！", "Gacrux",
        "A mature deck hand calls back a quick, warm, powerful Mandarin rope-hauling shout in a Chinese cartoon. Keep it quick and distinct. Dry close mic, one call only.",
    ),
    "win": (
        "嘿！好样的！", "Puck",
        "A young Chinese cartoon harbor drummer calls out a quick, thrilled Mandarin cheer to the crew after winning, grinning and proud. Separate the first word with a tiny pause then pop the remaining words forward. Dry close mic; one line, no laugh, no extra words.",
    ),
    "win_crew": (
        "嘿！好样的！", "Fenrir",
        "A muscular animated harbor sailor calls a short triumphant Mandarin cheer. Big friendly chest voice and a smile, punchy quick syllables, one call. Dry close mic without laughter or other words.",
    ),
    "win_crew2": (
        "嘿！好样的！", "Zephyr",
        "A bright crew member gives a playful, fast Mandarin victory cheer, exactly one line. Cheer from the chest with smiling clarity and a short dry tail, no added sound.",
    ),
    "push_alt": (
        "破浪！", "Kore",
        "Strong compact Mandarin call by the animated harbor drummer at the bow attacking a wave. Audible and focused with real energy, clear Mandarin. Quick centered breath, loud but free of any distortion. Clean dry close mic and no other words or sounds.",
    ),
}

# The second sentence stabilizes Mandarin pronunciation during generation.
# Only the first sentence (before the instructed pause) is used in the cue.
EXCERPT_TAKES = {"cast_context", "watch_context"}

# Each layer sets the source take, gain against the lead, delay, and max phrase seconds.
CUES = {
    "castoff": [("cast_context", 1.0, 0.0, 0.65)],
    "heave": [("heave_other", 1.0, 0.0, 0.60), ("heave_crew", 0.17, 0.034, 0.55)],
    "watch": [("watch_context", 1.0, 0.0, 0.60)],
    "push": [("push_alt", 1.0, 0.0, 0.62)],
    "win": [("win_crew", 1.0, 0.0, 1.1), ("win", 0.24, 0.038, 1.11),
            ("win_crew2", 0.2, 0.067, 1.1)],
}


def float_audio(args, payload=None):
    result = subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", *args,
         "-ar", str(RATE), "-ac", "1", "-f", "f32le", "pipe:1"],
        input=payload,
        capture_output=True,
    )
    if result.returncode:
        raise RuntimeError(result.stderr.decode("utf-8", errors="replace").strip())
    samples = array("f")
    samples.frombytes(result.stdout)
    if sys.byteorder != "little":
        samples.byteswap()
    return samples


def prepare_take(path, duration_limit):
    samples = float_audio(["-i", str(path), "-af", "highpass=f=80"])
    peak = max(map(abs, samples), default=0)
    if peak < 0.01:
        raise ValueError(f"Expected voice, got a silent take in {path}")
    frame = RATE // 250
    floor = max(0.0028, 0.015 * peak)
    active = [
        offset for offset in range(0, len(samples), frame)
        if math.sqrt(sum(s * s for s in samples[offset:offset + frame]) / frame) >= floor
    ]
    if not active:
        raise ValueError(f"No clear speech in {path}")
    if path.stem in EXCERPT_TAKES:
        for index, (before, after) in enumerate(zip(active, active[1:])):
            if after - before >= round(0.30 * RATE):
                active = active[:index + 1]
                break
        else:
            raise ValueError(f"No clean pause after the first sentence in {path}")
    start = max(0, active[0] - round(0.020 * RATE))
    end = min(len(samples), active[-1] + round(0.064 * RATE))
    samples = samples[start:end]
    tempo = len(samples) / RATE / duration_limit
    if tempo > 1.02:
        if sys.byteorder != "little":
            samples.byteswap()
        samples = float_audio(
            ["-f", "f32le", "-ar", str(RATE), "-ac", "1", "-i", "pipe:0",
             "-af", f"atempo={tempo:.6f}"], samples.tobytes()
        )

    fade_in = min(len(samples), round(0.004 * RATE))
    fade_out = min(len(samples), round(0.038 * RATE))
    for index in range(fade_in):
        samples[index] *= index / fade_in
    for index in range(fade_out):
        samples[-1 - index] *= index / fade_out
    return samples


def render_cue(path, raw, layers):
    mix = []
    for name, gain, delay, length in layers:
        samples = prepare_take(raw / f"{name}.wav", length)
        level = gain / max(map(abs, samples))
        start = round(delay * RATE)
        extension = start + len(samples) - len(mix)
        if extension > 0:
            mix.extend([0.0] * extension)
        for index, sample in enumerate(samples, start):
            mix[index] += sample * level
    gain = (0.72 * 32767) / max(map(abs, mix))
    pcm = array("h", (round(sample * gain) for sample in mix))
    if sys.byteorder != "little":
        pcm.byteswap()
    with wave.open(str(path), "wb") as output:
        output.setparams((1, 2, RATE, 0, "NONE", "not compressed"))
        output.writeframes(pcm.tobytes())
    print(f"{path.name}: {len(pcm) / RATE:.3f} s")


def fetch_takes(cli, raw):
    for name, (line, voice, style) in TAKES.items():
        path = raw / f"{name}.wav"
        if path.is_file():
            continue
        subprocess.run(
            [cli, "tts", line, "--model", MODEL, "--language",
             "zh-CN" if name in EXCERPT_TAKES or name == "heave_other" else "cmn-CN",
             "--voice", voice, "--style", style, "--out", str(path)],
            check=True,
        )


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("--cli", default="gemini-api", help="gemini-api executable or absolute path")
    parser.add_argument("--raw", type=Path, help="Reuse source WAVs here and request any missing takes")
    parser.add_argument("--out", type=Path,
                        default=Path(__file__).resolve().parent.parent / "game" / "voice")
    args = parser.parse_args()

    with TemporaryDirectory(prefix="tidebeat-voices-") as directory:
        stage = Path(directory)
        raw = args.raw.resolve() if args.raw else stage / "raw"
        raw.mkdir(parents=True, exist_ok=True)
        fetch_takes(args.cli, raw)
        for name, layers in CUES.items():
            render_cue(stage / f"voice_{name}.wav", raw, layers)

        args.out.mkdir(parents=True, exist_ok=True)
        for name in CUES:
            asset = f"voice_{name}.wav"
            temporary = args.out / f"voice_{name}.tmp"
            temporary.write_bytes((stage / asset).read_bytes())
            temporary.replace(args.out / asset)


if __name__ == "__main__":
    main()
