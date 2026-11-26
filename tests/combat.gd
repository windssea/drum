extends SceneTree
## Exercises the actual harbor scene logic without running the renderer or audio output.

const Harbor = preload("res://scripts/harbor.gd")
const BEAT_MS := 60000.0 / 84.0
const SCORE := [[5, "snare"], [7, "snare"], [12, "kick"], [13, "snare"], [14, "kick"], [15, "snare"]]

var passed := 0
var failed := 0


func _initialize() -> void:
	var harbor := Harbor.new()
	_test_full_win(harbor)
	_test_timing(harbor)
	_test_wrong_and_duplicate(harbor)
	_test_three_damage_defeat(harbor)
	_test_unfinished_armor(harbor)
	harbor.free()
	print("Harbor combat: %d passed, %d failed" % [passed, failed])
	quit(0 if failed == 0 else 1)


func _expect(actual: Variant, expected: Variant, label: String) -> void:
	if actual == expected:
		passed += 1
	else:
		failed += 1
		push_error("%s: expected %s, got %s" % [label, expected, actual])


func _start(harbor: Harbor, anchor: float = 0.0) -> void:
	harbor._reset()
	harbor._browser_event(["round", anchor])


func _hit(harbor: Harbor, lane: String, beat: int, offset: float = 0.0) -> void:
	harbor._browser_event(["hit", lane, harbor.anchor_ms + beat * BEAT_MS + offset, 100])


func _test_full_win(harbor: Harbor) -> void:
	_start(harbor, -16.0 * BEAT_MS - 250.0)
	for i in range(SCORE.size()):
		_hit(harbor, SCORE[i][1], SCORE[i][0])
		_expect(harbor.damage, i + 1, "each successful cue removes one armor")
		_expect(harbor.launch_lane, SCORE[i][1], "combat animation uses the lane hit")
	_expect(harbor.perfect, 6, "all six on-beat strikes are perfect")
	_expect(harbor.hull, 3, "perfect run preserves the hull")
	_expect(harbor.phase, Harbor.Phase.PLAYING, "the final phrase can still finish audibly after armor clears")
	_hit(harbor, "kick", 15, 200.0)
	_expect([harbor.hull, harbor.extras], [3, 0], "resolved victory ignores stray combat inputs")
	harbor._process(0.0)
	_expect([harbor.damage, harbor.phase], [6, Harbor.Phase.DONE], "clearing all armor wins at the phrase end")


func _test_timing(harbor: Harbor) -> void:
	_start(harbor)
	_hit(harbor, "snare", 5, -42.0)
	_expect(harbor.perfect, 1, "early perfect boundary is inclusive")
	_hit(harbor, "snare", 7, 42.0)
	_expect(harbor.perfect, 2, "late perfect boundary is inclusive")
	_hit(harbor, "kick", 12, -110.0)
	_expect(harbor.damage, 3, "early hit boundary across the listen-to-answer transition")
	_hit(harbor, "snare", 13, 110.0)
	_expect(harbor.damage, 4, "late hit boundary is inclusive")
	_hit(harbor, "kick", 14, -42.5)
	_hit(harbor, "snare", 15, 42.5)
	_expect([harbor.damage, harbor.perfect], [6, 2], "near strikes damage armor without a perfect grade")

	_start(harbor)
	_hit(harbor, "snare", 5, -110.5)
	_hit(harbor, "snare", 7, 110.5)
	_expect([harbor.damage, harbor.extras], [0, 2], "outside either hit boundary cannot damage armor")

	_start(harbor)
	harbor._expire_notes(5 * BEAT_MS + 133.0)
	_expect(harbor.hull, 3, "queued callback grace prevents premature expiry")
	_hit(harbor, "snare", 5, 110.0)
	_expect([harbor.damage, harbor.missed], [1, 0], "queued timestamp within the hit window resolves")


func _test_wrong_and_duplicate(harbor: Harbor) -> void:
	_start(harbor)
	_hit(harbor, "snare", 1)
	_expect([harbor.hull, harbor.extras], [3, 0], "listen bar allows playing along without a penalty")
	_hit(harbor, "kick", 5)
	_expect([harbor.damage, harbor.hull, harbor.extras], [0, 2, 1], "wrong lane damages the hull only")
	_hit(harbor, "snare", 5, 20.0)
	_expect(harbor.damage, 1, "correct lane still resolves after a wrong input")
	_hit(harbor, "snare", 5, 25.0)
	_expect([harbor.damage, harbor.hull, harbor.extras], [1, 1, 2], "duplicate cannot remove more armor")
	_hit(harbor, "snare", 7)
	_expect(harbor.damage, 2, "next same-lane target is still open")


func _test_three_damage_defeat(harbor: Harbor) -> void:
	_start(harbor)
	_hit(harbor, "kick", 5)
	harbor._expire_notes(5 * BEAT_MS + 135.0)
	_expect([harbor.hull, harbor.missed], [1, 1], "a missed reply deals one damage")
	_hit(harbor, "kick", 6)
	_expect([harbor.damage, harbor.hull, harbor.phase], [0, 0, Harbor.Phase.DONE], "three damage ends the round")
	_hit(harbor, "snare", 7)
	_expect(harbor.damage, 0, "a defeated ship cannot attack")

	_start(harbor)
	_expect([harbor.damage, harbor.hull, harbor.perfect, harbor.missed, harbor.extras], [0, 3, 0, 0, 0], "restart restores all combat counters")
	_hit(harbor, "snare", 5)
	_expect(harbor.damage, 1, "restart reopens previously missed notes")


func _test_unfinished_armor(harbor: Harbor) -> void:
	# Put this round's endpoint in the past so the scene's normal _process finalizes it.
	_start(harbor, -16.0 * BEAT_MS - 250.0)
	for i in range(SCORE.size() - 1):
		_hit(harbor, SCORE[i][1], SCORE[i][0])
	harbor._process(0.0)
	_expect([harbor.damage, harbor.hull, harbor.missed], [5, 2, 1], "round ends with the remaining armor visible")
	_expect(harbor.phase, Harbor.Phase.DONE, "unfinished armor ends at the round deadline")
