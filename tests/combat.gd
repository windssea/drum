extends SceneTree
## Runs the real combat scene and the chart matcher on a deterministic event clock.

const Harbor = preload("res://scripts/harbor.gd")
const Orders = preload("res://scripts/combat_orders.gd")
const ORIGIN := 90000.0

var passed := 0
var failed := 0


func _initialize() -> void:
	var harbor := Harbor.new()
	_test_chart()
	_test_full_round(harbor)
	_test_choices(harbor)
	_test_midi_articulations(harbor)
	_test_chord_and_timing()
	_test_phase_boundaries(harbor)
	_test_failure_and_retry(harbor)
	_test_practice_and_feedback(harbor)
	harbor.free()
	print("Harbor combat: %d passed, %d failed" % [passed, failed])
	quit(0 if failed == 0 else 1)


func _expect(actual: Variant, expected: Variant, label: String) -> void:
	if actual == expected:
		passed += 1
	else:
		failed += 1
		push_error("%s: expected %s, got %s" % [label, expected, actual])


func _test_chart() -> void:
	_expect([Orders.BPM, Orders.BAR_COUNT, Orders.BAR_MS], [96, 16, 2500.0], "rhythm contract")
	var last_beat := -1.0
	var valid := true
	for cue in Orders.cues():
		var at: float = cue[0]
		var bar := floori(at / 4.0) % 4
		valid = valid and bar in [Orders.Bar.SCOUT, Orders.Bar.LISTEN] and Orders.LANES.has(cue[1])
		valid = valid and last_beat <= at
		last_beat = at
	_expect(valid, true, "only scout and telegraph cues play automatically, in time order")
	var hat_steps := []
	for chart in Orders.ATTACKS:
		var hats: Array[int] = []
		for note in chart:
			if note[1] == Orders.HAT:
				hats.append(note[0])
		hat_steps.append(hats)
	_expect(hat_steps,
		[[0, 4, 8, 12], [0, 2, 4, 6, 8, 10, 12, 14], [2, 6, 10, 14]], "authored quarter, eighth and offbeat hats")
	_expect(Orders.GUARDS.map(func(chart: Array) -> int: return chart.size()),
		[8, 8, 16, 13], "singles, doubles, paradiddle and three beats of groove with a fill")
	_expect(
		[Orders.midi_lane(36), Orders.midi_lane(38), Orders.midi_lane(42), Orders.midi_lane(48), Orders.midi_lane(99)],
		["kick", "snare", "hat", "tom", ""], "Roland kick, snare head, closed hat and tom head input mapping"
	)


func _start(harbor: Harbor) -> void:
	harbor._reset()
	harbor._browser_event(["round", ORIGIN])


func _hit(harbor: Harbor, bar: int, step: int, lane: String, offset: float = 0.0) -> void:
	harbor._browser_event(["hit", lane, ORIGIN + bar * harbor.bar_ms + step * harbor.beat_ms / 4.0 + offset, 100])


func _play(harbor: Harbor, bar: int, chart: Array) -> void:
	for note in chart:
		_hit(harbor, bar, int(note[0]), String(note[1]))


func _settle(harbor: Harbor, bar: int) -> void:
	harbor._settle_at(ORIGIN + (bar + 1) * harbor.bar_ms + Orders.CALLBACK_GRACE_MS)


func _test_full_round(harbor: Harbor) -> void:
	_start(harbor)
	for cycle in range(4):
		var attack_bar := cycle * 4 + Orders.Bar.ATTACK
		var guard_bar := cycle * 4 + Orders.Bar.GUARD
		_play(harbor, attack_bar, Orders.ATTACKS[Orders.RECOMMENDED[cycle]])
		_settle(harbor, attack_bar)
		_expect(harbor.attacks_landed, cycle + 1, "each clean attack resolves")
		_play(harbor, guard_bar, Orders.GUARDS[cycle])
		_settle(harbor, guard_bar)
		_expect(harbor.counters, cycle + 1, "each clean defense counter resolves")
	_expect([harbor.hull, harbor.damage, harbor.extras, harbor.missed], [8, 28, 0, 0], "perfect run")
	_expect([harbor.phase, harbor.won], [Harbor.Phase.DONE, true], "win at the final phrase, not a premature screen")


func _test_choices(harbor: Harbor) -> void:
	_start(harbor)
	harbor.hull = 6
	_play(harbor, 1, Orders.ATTACKS[1])
	_settle(harbor, 1)
	_expect([harbor.damage, harbor.hull], [5, 7], "unrecommended flurry is accepted and repairs one hull")
	_play(harbor, 3, Orders.GUARDS[0])
	_settle(harbor, 3)
	_expect([harbor.damage, harbor.hull], [7, 8], "clean guard counters and restores the remaining hull")
	_play(harbor, 5, Orders.ATTACKS[2])
	_settle(harbor, 5)
	_expect([harbor.damage, harbor.shield], [12, 1], "mixed chart recognizes both chords and grants one shield")
	_play(harbor, 7, Orders.GUARDS[1].slice(0, -1))
	_settle(harbor, 7)
	_expect([harbor.hull, harbor.shield, harbor.missed], [8, 0, 1], "one protection charge absorbs a failed defense note")

	_start(harbor)
	_play(harbor, 1, Orders.ATTACKS[0])
	_hit(harbor, 1, 14, "tom")
	_settle(harbor, 1)
	_expect([harbor.damage, harbor.extras], [0, 1], "filling a rest with a tap invalidates an attack")
	_expect(harbor.hull, 8, "unsuccessful offense wastes its chance without damaging the hull")
	_start(harbor)
	_play(harbor, 1, Orders.ATTACKS[1])
	_settle(harbor, 1)
	_expect([harbor.damage, harbor.timing_offsets.size(), harbor.perfect], [5, 12, 12], "extra eight-note hats identify the groove and overlap is counted once")


func _test_chord_and_timing() -> void:
	var order := Orders.Attempt.new([[0, "kick"], [0, "hat"]])
	_expect(order.accept("kick", -35.0), -35.0, "first chord lane may arrive early")
	_expect(is_inf(order.accept("hat", 36.0)), true, "71 ms split cannot complete a chord")
	_expect(order.accept("hat", 35.0), 35.0, "70 ms chord boundary is inclusive")
	_expect(order.complete(), true, "both lanes were required")
	_expect(is_inf(order.accept("kick", -35.0)), true, "duplicate cannot replay a lane")

	order = Orders.Attempt.new([[0, "kick"], [4, "snare"], [8, "tom"], [12, "hat"]])
	_expect(order.accept("kick", -110.0), -110.0, "inclusive early timing")
	_expect(order.accept("snare", Orders.BEAT_MS + 110.0), 110.0, "inclusive late timing")
	_expect(order.accept("tom", Orders.BEAT_MS * 2.0 + 42.0), 42.0, "inclusive perfect timing")
	_expect(is_inf(order.accept("hat", Orders.BEAT_MS * 3.0 - 110.5)), true, "outside the window")
	order = Orders.Attempt.new([[0, "tom"], [1, "tom"]])
	_expect(order.accept("tom", 74.0), 74.0, "late first stroke near the dense midpoint")
	_expect(is_inf(order.accept("tom", 74.0)), true, "one timestamp cannot also fill the next dense stroke")
	_expect(order.accept("tom", Orders.STEP_MS), 0.0, "a distinct next stroke fills the second target")


func _test_midi_articulations(harbor: Harbor) -> void:
	var voices := {
		37: "军鼓横击", 40: "军鼓鼓边",
		46: "开镲镲面", 26: "开镲镲边", 44: "踩镲踏板",
		49: "强音镲 1 面", 55: "强音镲 1 边", 57: "强音镲 2 面", 52: "强音镲 2 边",
		51: "叮叮镲镲面", 59: "叮叮镲镲边", 53: "叮叮镲帽",
		50: "高通鼓边", 47: "中通鼓边", 58: "落地通鼓边",
	}
	var routes := Orders.midi_routes()
	for note: int in voices:
		_expect([Orders.midi_lane(note), Orders.midi_name(note), routes[note]], ["", voices[note], ""],
			"note %d keeps its physical zone without a score alias" % note)
	_expect([Orders.midi_lane(22), Orders.midi_lane(43), Orders.midi_lane(45), Orders.midi_lane(48)],
		["hat", "tom", "tom", "tom"], "closed edge and the three tom heads remain playable")
	_expect(routes.has(99), false, "unrecognized notes stay outside the reported and scored zones")

	harbor._reset()
	harbor._browser_event(["hit", "midi_extra", ORIGIN, 100, 53])
	_expect([harbor.midi_readout, harbor.extras], ["MIDI 53  ·  叮叮镲帽", 0], "idle confirms a distinct ride bell")

	_start(harbor)
	harbor._browser_event(["hit", "midi_extra", ORIGIN + harbor.bar_ms, 100, 46])
	_expect([harbor.attack_orders[0][0].hits, harbor.attack_orders[0][0].extras], [0, 1],
		"open hat cannot claim the valid closed-hat attack note at the same moment")
	harbor._browser_event(["hit", "hat", ORIGIN + harbor.bar_ms, 100, 22])
	_expect([harbor.attack_orders[0][0].hits, harbor.midi_readout], [1, "MIDI 22  ·  闭镲镲边"],
		"the closed edge claims the closed-hat target and retains its display name")

	var guard_time := ORIGIN + 3 * harbor.bar_ms
	harbor._browser_event(["hit", "midi_extra", guard_time, 100, 40])
	_expect([harbor.guard_orders[0].hits, harbor.guard_orders[0].extras], [0, 1],
		"rimshot cannot substitute for the written snare head")
	harbor._browser_event(["hit", "snare", guard_time, 100, 38])
	_expect(harbor.guard_orders[0].hits, 1, "snare head still lands following the off-chart input")

	var tom_time := ORIGIN + 7 * harbor.bar_ms
	harbor._browser_event(["hit", "midi_extra", tom_time, 100, 58])
	_expect([harbor.guard_orders[1].hits, harbor.guard_orders[1].extras], [0, 1],
		"the floor tom rim cannot substitute for any tom head")
	harbor._browser_event(["hit", "tom", tom_time, 100, 45])
	_expect([harbor.guard_orders[1].hits, harbor.midi_readout], [1, "MIDI 45  ·  中通鼓面"],
		"any recognized playing surface supplies the T target with the exact tom in readout")


func _test_phase_boundaries(harbor: Harbor) -> void:
	_start(harbor)
	_hit(harbor, 0, 0, "kick")
	_hit(harbor, 1, 0, "kick", -110.0)
	_hit(harbor, 1, 0, "hat", -104.0)
	for note in Orders.ATTACKS[0].slice(2):
		_hit(harbor, 1, note[0], note[1])
	harbor._settle_at(ORIGIN + 2.0 * Orders.BAR_MS + 31.0)
	_expect(harbor.damage, 0, "bar does not settle before callback grace")
	_settle(harbor, 1)
	_expect([harbor.damage, harbor.perfect, harbor.extras], [6, 6, 0], "first attack chord can cross early into scout")

	_start(harbor)
	_play(harbor, 3, Orders.GUARDS[0])
	_hit(harbor, 3, 0, "snare", 25.0)
	_settle(harbor, 3)
	_expect([harbor.damage, harbor.hull, harbor.extras, harbor.missed], [0, 7, 1, 8], "duplicate defense counts as an error")
	_hit(harbor, 3, 0, "snare", 30.0)
	_expect(harbor.extras, 1, "settled chart ignores a stale timestamp")


func _test_failure_and_retry(harbor: Harbor) -> void:
	_start(harbor)
	for bar in [3, 7, 11]:
		_settle(harbor, bar)
	_expect([harbor.hull, harbor.phase, harbor.won], [0, Harbor.Phase.DONE, false], "three lost defenses defeat the ship")
	_start(harbor)
	_expect([harbor.damage, harbor.hull, harbor.shield, harbor.extras, harbor.missed], [0, 8, 0, 0, 0], "retry clears outcome and opens the charts")
	for cycle in range(4):
		var bar := cycle * 4 + Orders.Bar.GUARD
		_play(harbor, bar, Orders.GUARDS[cycle])
		_settle(harbor, bar)
	_expect([harbor.damage, harbor.hull, harbor.phase, harbor.won], [8, 8, Harbor.Phase.DONE, false],
		"final phrase ends in a surviving loss when too much armor remains")


func _test_practice_and_feedback(harbor: Harbor) -> void:
	harbor._reset()
	harbor._browser_event(["tempo"])
	_expect(harbor.tempo, 72, "B/tap selects the slower training score")
	_start(harbor)
	harbor._browser_event(["tempo"])
	_expect(harbor.tempo, 72, "tempo remains fixed throughout a round")
	for note in Orders.ATTACKS[0]:
		_hit(harbor, 1, note[0], note[1], -20.0)
	_settle(harbor, 1)
	_expect([harbor.damage, harbor.perfect], [7, 8], "same coaching precision window at 72 BPM")
	_play(harbor, 3, Orders.GUARDS[0].slice(0, 5))
	_settle(harbor, 3)
	_expect(harbor.timing_offsets.size(), 13, "one canonical groove plus played guard notes enters timing stats")
	_expect(harbor.missed_by_lane["snare"], 3, "weakest lane records missed QTE notes")
	harbor._finish(false)
	_expect(harbor.coaching, "中位偏早 20 ms  ·  先练军鼓", "actionable median timing and target lane")
	harbor._browser_event(["tempo"])
	_expect(harbor.tempo, 96, "standard tempo can be restored for retry")
