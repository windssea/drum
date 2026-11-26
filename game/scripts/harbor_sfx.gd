extends RefCounted
## Gain 1.0 is full sample level. These gains sit below the physical drum input.

const SAMPLES := [
	"hit", "hit_b", "hit_c", "accent", "start", "windup", "slam", "armor",
	"power", "flurry", "break", "guard", "guard_b", "counter", "hurt",
]
const LEVELS := {
	"hit": 0.24, "guard": 0.23, "accent": 0.18,
	"start": 0.37, "windup": 0.30, "slam": 0.36, "armor": 0.36,
	"power": 0.62, "flurry": 0.55, "break": 0.58, "counter": 0.59, "hurt": 0.53,
	"win": 0.78, "lose": 0.78,
}
const VARIANTS := {"hit": ["hit", "hit_b", "hit_c"], "guard": ["guard", "guard_b"]}
const COOLDOWN_MS := {"hit": 54.0, "guard": 68.0}
const DUCKED := ["power", "flurry", "break", "counter", "hurt"]
const VOICES := ["castoff", "heave", "watch", "push", "win"]
const VOICE_GAP_MS := 850.0
const SPEECH_BEATS := [0.5, 16.5, 32.5, 48.5]
const SPEECH_SECONDS := 0.80
const SPEECH_LEAD_SECONDS := 0.12


static func scheduled_effects() -> Array:
	# Each row is [effect, musical beat, acoustic offset seconds].
	# Guard targets start on the downbeat in all four lesson groups.
	var cues := [["start", -4.0, 0.056]]
	for cycle in range(4):
		var guard_beat := cycle * 16.0 + 12.0
		cues.append(["windup", guard_beat - 0.145, 0.0])
		cues.append(["slam", guard_beat, 0.036])
	return cues


static func web_profile() -> Dictionary:
	return {
		"levels": LEVELS, "variants": VARIANTS, "cooldown_ms": COOLDOWN_MS,
		"ducked": DUCKED, "timeline": scheduled_effects(),
		"speech_beats": SPEECH_BEATS, "speech_seconds": SPEECH_SECONDS, "speech_lead": SPEECH_LEAD_SECONDS,
	}


static func speech_is_near(position_seconds: float, beat_seconds: float) -> bool:
	for beat in SPEECH_BEATS:
		var seconds := float(beat) * beat_seconds
		if position_seconds >= seconds - SPEECH_LEAD_SECONDS and position_seconds < seconds + SPEECH_SECONDS:
			return true
	return false
