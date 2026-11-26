extends RefCounted
## All cells are sixteenth steps in a single 4/4 bar. Step zero is beat one.

const BPM := 96
const PRACTICE_BPM := 72
const BEAT_MS := 60000.0 / BPM
const STEP_MS := BEAT_MS / 4.0
const BAR_MS := BEAT_MS * 4.0
const BAR_COUNT := 16
const BOSS_ARMOR := 28
const SHIP_HULL := 8
const HIT_MS := 110.0
const PERFECT_MS := 42.0
const CHORD_SPREAD_MS := 70.0
const CALLBACK_GRACE_MS := 32.0

const KICK := "kick"
const SNARE := "snare"
const HAT := "hat"
const TOM := "tom"
const LANES := [KICK, SNARE, HAT, TOM]

enum Bar { SCOUT, ATTACK, LISTEN, GUARD }

const ATTACK_NAMES := ["四分摇滚·重锤", "八分摇滚·连射", "四踩舞曲·碎浪"]
const ATTACK_KINDS := ["power", "flurry", "break"]
const ATTACKS := [
	[[0, KICK], [0, HAT], [4, SNARE], [4, HAT], [8, KICK], [8, HAT], [12, SNARE], [12, HAT]],
	[
		[0, KICK], [0, HAT], [2, HAT], [4, SNARE], [4, HAT], [6, HAT],
		[8, KICK], [8, HAT], [10, HAT], [12, SNARE], [12, HAT], [14, HAT],
	],
	[[0, KICK], [2, HAT], [4, KICK], [4, SNARE], [6, HAT], [8, KICK], [10, HAT], [12, KICK], [12, SNARE], [14, HAT]],
]
const RECOMMENDED := [0, 1, 2, 0]
const GUARD_NAMES := ["单跳", "双跳", "单复合跳", "三拍摇滚＋过门"]
const GUARD_HANDS := ["RLRLRLRL", "RRLLRRLL", "RLRRLRLLRLRRLRLL", "         RLRL"]
const GUARD_GUIDES := [
	"军鼓八分音符，左右手交替。",
	"通鼓 R R，军鼓 L L，保持等距。",
	"通鼓 R，军鼓 L。先用 72 BPM。",
	"前三拍维持律动，第 4 拍过门。",
]
const GUARDS := [
	[[0, SNARE], [2, SNARE], [4, SNARE], [6, SNARE], [8, SNARE], [10, SNARE], [12, SNARE], [14, SNARE]],
	[[0, TOM], [2, TOM], [4, SNARE], [6, SNARE], [8, TOM], [10, TOM], [12, SNARE], [14, SNARE]],
	[
		[0, TOM], [1, SNARE], [2, TOM], [3, TOM], [4, SNARE], [5, TOM], [6, SNARE], [7, SNARE],
		[8, TOM], [9, SNARE], [10, TOM], [11, TOM], [12, SNARE], [13, TOM], [14, SNARE], [15, SNARE],
	],
	[
		[0, KICK], [0, HAT], [2, HAT], [4, SNARE], [4, HAT], [6, HAT], [8, KICK], [8, HAT],
		[10, HAT], [12, SNARE], [13, SNARE], [14, TOM], [15, TOM],
	],
]


class Attempt:
	var notes: Array
	var timestamps: PackedFloat64Array
	var early_windows: PackedFloat64Array
	var late_windows: PackedFloat64Array
	var step_ms: float
	var hits := 0
	var perfect := 0
	var extras := 0

	func _init(chart: Array, tempo_beat_ms: float = BEAT_MS) -> void:
		notes = chart
		step_ms = tempo_beat_ms / 4.0
		timestamps.resize(notes.size())
		timestamps.fill(-INF)
		early_windows.resize(notes.size())
		early_windows.fill(HIT_MS)
		late_windows.resize(notes.size())
		late_windows.fill(HIT_MS)
		var previous_by_lane: Dictionary[String, int] = {}
		for index in range(notes.size()):
			var lane := String(notes[index][1])
			if previous_by_lane.has(lane):
				var previous := previous_by_lane[lane]
				# Adjacent notes on the same pad never share a hit window.
				# Two sensor messages for one stroke cannot fill both.
				var gap := (float(notes[index][0]) - float(notes[previous][0])) * step_ms
				var half_gap := minf(HIT_MS, maxf(0.0, gap * 0.5 - 0.001))
				early_windows[index] = half_gap
				late_windows[previous] = half_gap
			previous_by_lane[lane] = index

	func accept(lane: String, relative_ms: float) -> float:
		var best := -1
		var offset := INF
		for index in range(notes.size()):
			var chart_step := int(notes[index][0])
			var delta := relative_ms - chart_step * step_ms
			if (
				notes[index][1] == lane and is_inf(timestamps[index])
				and delta >= -early_windows[index] and delta <= late_windows[index]
				and absf(delta) < absf(offset)
			):
				best = index
				offset = delta
		if best < 0:
			return INF
		# Multiple lanes on a cell form one chord. Keep the hands/foot together
		# while still allowing either lane to arrive first.
		for index in range(notes.size()):
			if notes[index][0] == notes[best][0] and not is_inf(timestamps[index]):
				if absf(timestamps[index] - relative_ms) > CHORD_SPREAD_MS:
					return INF
		timestamps[best] = relative_ms
		hits += 1
		if absf(offset) <= PERFECT_MS:
			perfect += 1
		return offset

	func complete() -> bool:
		return hits == notes.size() and extras == 0

	func filled(index: int) -> bool:
		return not is_inf(timestamps[index])


static func cues() -> Array:
	var result := []
	for cycle in range(4):
		for note in ATTACKS[RECOMMENDED[cycle]]:
			result.append([cycle * 16.0 + float(note[0]) / 4.0, note[1], 106])
		for note in GUARDS[cycle]:
			result.append([cycle * 16.0 + 8.0 + float(note[0]) / 4.0, note[1], 114])
	return result


# Roland TD-17 defaults, plus the two legacy GM head aliases 35 and 41.
# Empty score lanes identify real articulations that do not belong to this chart.
const MIDI_ZONES := {
	35: [KICK, "底鼓"],
	36: [KICK, "底鼓"],
	38: [SNARE, "军鼓鼓面"],
	40: ["", "军鼓鼓边"],
	37: ["", "军鼓横击"],
	42: [HAT, "闭镲镲面"],
	22: [HAT, "闭镲镲边"],
	46: ["", "开镲镲面"],
	26: ["", "开镲镲边"],
	44: ["", "踩镲踏板"],
	48: [TOM, "高通鼓面"],
	50: ["", "高通鼓边"],
	45: [TOM, "中通鼓面"],
	47: ["", "中通鼓边"],
	41: [TOM, "落地通鼓面"],
	43: [TOM, "落地通鼓面"],
	58: ["", "落地通鼓边"],
	49: ["", "强音镲 1 面"],
	55: ["", "强音镲 1 边"],
	57: ["", "强音镲 2 面"],
	52: ["", "强音镲 2 边"],
	51: ["", "叮叮镲镲面"],
	59: ["", "叮叮镲镲边"],
	53: ["", "叮叮镲帽"],
	27: ["", "扩展鼓面"],
	28: ["", "扩展鼓边"],
}


static func midi_lane(note: int) -> String:
	return MIDI_ZONES[note][0] if MIDI_ZONES.has(note) else ""


static func midi_name(note: int) -> String:
	return MIDI_ZONES[note][1] if MIDI_ZONES.has(note) else ""


static func midi_routes() -> Dictionary:
	var routes := {}
	for note in MIDI_ZONES:
		routes[note] = MIDI_ZONES[note][0]
	return routes
