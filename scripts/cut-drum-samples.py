#!/usr/bin/env python3
"""Cut acoustic drum one-shots from the archived Gemini Omni soundtracks."""

from argparse import ArgumentParser
from array import array
import math
from pathlib import Path
import subprocess
import sys
import wave


RATE = 44_100
ROOT = Path(__file__).resolve().parent.parent
# Source, approximate transient (s), clip length (s), filters, target peak.
CUTS = {
    "kick": ("omni-percussion", 1.325, 0.220, "highpass=f=26", 0.78),
    "snare": ("omni-drum-heads", 1.166, 0.180, "highpass=f=115", 0.74),
    "hat": ("omni-percussion", 3.124, 0.115, "highpass=f=1550", 0.57),
    "tom": ("omni-cross-tom", 6.781, 0.205, "highpass=f=58,lowpass=f=4700", 0.71),
    "cross": ("omni-cross-tom", 2.977, 0.098, "highpass=f=120", 0.67),
    "click": ("omni-percussion", 5.019, 0.065, "highpass=f=370", 0.54),
}


def load_source(path, filters):
    result = subprocess.run(
        [
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(path),
            "-af", filters, "-ar", str(RATE), "-ac", "1", "-f", "f32le", "pipe:1",
        ],
        check=True,
        capture_output=True,
    )
    samples = array("f")
    samples.frombytes(result.stdout)
    if sys.byteorder != "little":
        samples.byteswap()
    return samples


def envelope(frame):
    return math.sqrt(sum(value * value for value in frame) / len(frame))


def detect_attack(samples, center):
    hop = round(0.0005 * RATE)
    first = round((center - 0.016) * RATE)
    last = round((center + 0.023) * RATE)
    positions = range(first, last, hop)
    levels = [envelope(samples[i:i + hop]) for i in positions]
    baseline = sorted(levels[:16])[8]
    gate = max(0.00045, 5 * baseline, 0.026 * max(levels))
    for i in range(len(levels) - 1):
        if levels[i] >= gate and levels[i + 1] >= gate:
            return positions[i]
    raise ValueError(f"No isolated attack near {center:.3f}s")


def cut_sample(path, samples, center, duration, target_peak):
    attack = detect_attack(samples, center)
    start = attack - round(0.0013 * RATE)
    take = samples[start:start + round(duration * RATE)]
    fade_in = round(RATE * 0.0004)
    fade_tail = round(RATE * min(0.064, duration * 0.47))
    for i in range(fade_in):
        take[i] *= i / fade_in
    for i in range(fade_tail):
        take[-1 - i] *= 0.5 - 0.5 * math.cos(math.pi * i / fade_tail)

    gain = target_peak / max(map(abs, take))
    pcm = array("h", (round(sample * gain * 32767) for sample in take))
    peak = 20 * math.log10(max(map(abs, pcm)) / 32767)
    if sys.byteorder != "little":
        pcm.byteswap()
    with wave.open(str(path), "wb") as output:
        output.setparams((1, 2, RATE, 0, "NONE", "not compressed"))
        output.writeframes(pcm.tobytes())
    print(f"{path.name}  source {attack / RATE:.4f}s  length {duration:.3f}s  peak {peak:.1f} dBFS")


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=ROOT / "art" / "audio" / "sources")
    parser.add_argument("--out", type=Path, default=ROOT / "game" / "audio")
    args = parser.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)
    for name, (source, center, duration, filters, target_peak) in CUTS.items():
        audio = load_source(args.source / f"{source}.flac", filters)
        cut_sample(args.out / f"kit_{name}.wav", audio, center, duration, target_peak)


if __name__ == "__main__":
    main()
