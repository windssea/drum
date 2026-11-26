extends Node2D

const BattleStage = preload("res://scripts/battle_stage.gd")
const ScoreBook = preload("res://scripts/harbor_chart.gd")
const Orders = preload("res://scripts/combat_orders.gd")
const Layout = preload("res://scripts/harbor_layout.gd")
const Sound = preload("res://scripts/harbor_sfx.gd")
const BEAT_MS := Orders.BEAT_MS
const KICK := Orders.KICK
const SNARE := Orders.SNARE
const HAT := Orders.HAT
const TOM := Orders.TOM
const GOLD := Color("#ffd98f")
const MUTED := Color("#adbcc5")
const BLUE := Color("#92dbe0")
const SALMON := Color("#ffaea0")
const DECK := Color("#143845")
const DEEP := Color("#10292e")
const BRASS := Color("#dfa55c")
const CREAM := Color("#fff0cb")
const TURQUOISE := Color("#75ded5")
const CORAL := Color("#ff927c")
const LANE_COLORS := {KICK: GOLD, SNARE: BLUE, HAT: Color("#b7e88b"), TOM: Color("#d1b4ff")}
const LANE_NAMES := {KICK: "底鼓", SNARE: "军鼓", HAT: "踩镲", TOM: "通鼓"}
const LANE_KEYS := {KICK: "D", SNARE: "F", HAT: "J", TOM: "K"}
const VICTORY_MS := 1850.0

enum Phase { IDLE, STARTING, PLAYING, DONE }

var phase: Phase = Phase.IDLE
var chart_book: ScoreBook
var tempo := Orders.BPM
var course := 0
var lesson: Dictionary = Orders.COURSES[0]
var divisions := 4
var beat_ms := BEAT_MS
var bar_ms := Orders.BAR_MS
var now_ms := 0.0
var anchor_ms := 0.0
var damage := 0
var hull := Orders.SHIP_HULL
var shield := 0
var perfect := 0
var missed := 0
var extras := 0
var attacks_landed := 0
var counters := 0
var timing_offsets := PackedFloat64Array()
var counted_by_lane: Dictionary[String, int] = {}
var missed_by_lane: Dictionary[String, int] = {}
var coaching := ""
var next_bar_to_settle := 0
var latest := -100000.0
var feedback := ""
var feedback_color := GOLD
var midi := "idle"
var midi_readout := ""
var guide_link_visible := false
var error_text := ""
var pad_hits: Dictionary[String, float] = {}
var attack_orders: Array[Array] = []
var guard_orders: Array[Orders.Attempt] = []
var cue_chart: Array = Orders.cues()
var battle_stage: BattleStage
var font: Font
var browser: JavaScriptObject
var browser_events: JavaScriptObject
var native_song: AudioStreamPlayer
var native_kit: AudioStreamPlayer
var native_stinger: AudioStreamPlayer
var native_voice: AudioStreamPlayer
var native_tracks: Dictionary[Vector2i, AudioStream] = {}
var native_samples: Dictionary[String, AudioStreamWAV] = {}
var native_effects: Dictionary[String, AudioStream] = {}
var native_voices: Dictionary[String, AudioStreamWAV] = {}
var native_effect_clocks: Dictionary[String, float] = {}
var native_effect_variants: Dictionary[String, int] = {}
var native_duck: Tween
var accent_bar := -1
var finished_ms := -100000.0
var won := false
var crew_call := -1
var crew_call_ms := -100000.0
var crew_end_ms := -100000.0
var crew_played := 0
var crew_pending: Array[int] = []
var layout: Dictionary = {}
var ui_focus := ""
var reduced_motion := false
var _layout_queued := false
var _stick_latched := false


func _ready() -> void:
	_refresh_layout()
	get_viewport().size_changed.connect(_queue_layout)
	for lane in Orders.LANES:
		pad_hits[lane] = -100000.0
	now_ms = _clock()
	font = preload("res://art/HarborHUD.ttf")
	_mount_chart()
	# Keep the arena's camera transform and overspill below the anchored HUD.
	var clip := Control.new()
	clip.name = "Arena"
	clip.clip_contents = true
	clip.show_behind_parent = true
	clip.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(clip)
	battle_stage = BattleStage.new()
	battle_stage.harbor = self
	clip.add_child(battle_stage)
	if OS.has_feature("web"):
		JavaScriptBridge.eval(FileAccess.get_file_as_string("res://web/harbor_bridge.js"), true)
		browser = JavaScriptBridge.get_interface("harborBridge")
		if browser:
			browser_events = JavaScriptBridge.create_callback(_browser_event)
			browser.bind(browser_events)
			_refresh_layout()
			browser.setMidiRoutes(JSON.stringify(Orders.midi_routes()))
			var music_script := "res://scripts/web_music.gd"
			if ResourceLoader.exists(music_script):
				load(music_script).install(browser)
	elif DisplayServer.get_name() != "headless":
		_setup_native_audio()
	queue_redraw()


func _clock() -> float:
	if browser:
		return float(browser.now())
	return Time.get_ticks_usec() / 1000.0


func _queue_layout() -> void:
	if not _layout_queued:
		_layout_queued = true
		_refresh_layout.call_deferred()


func _refresh_layout() -> void:
	_layout_queued = false
	var win := get_window()
	var size := Vector2(win.size)
	var margins := Vector4.ZERO
	if browser:
		var data = JSON.parse_string(String(browser.displayMetrics()))
		if data is Array and data.size() == 7:
			size = Vector2(data[0], data[1])
			margins = Vector4(data[2], data[3], data[4], data[5])
			reduced_motion = bool(data[6])
	elif OS.has_feature("mobile"):
		var safe_rect := DisplayServer.get_display_safe_area()
		margins = Vector4(safe_rect.position.x, safe_rect.position.y, maxf(0, size.x - safe_rect.end.x), maxf(0, size.y - safe_rect.end.y))
	if size.x < 1.0 or size.y < 1.0:
		return
	var scale_factor := clampf(minf(size.x / 1152.0, size.y / 640.0), 0.72, 3.0)
	if size.y > size.x:
		scale_factor = size.x / clampf(size.x, 560.0, 800.0)
	var reference := Vector2i((size / scale_factor).round())
	if win.content_scale_size != reference:
		win.content_scale_size = reference
	var view := get_viewport_rect().size
	layout = Layout.build(view, margins / scale_factor, scale_factor)
	if browser:
		var targets := {}
		for key in ["action", "tempo", "midi", "course", "guide", KICK, SNARE, HAT, TOM]:
			var rect: Rect2 = layout.pads[key] if layout.pads.has(key) else layout[key]
			targets[key] = [rect.position.x / view.x, rect.position.y / view.y, rect.size.x / view.x, rect.size.y / view.y]
		browser.setLayout(JSON.stringify(targets))
	queue_redraw()


func _activate_control(key: String) -> void:
	match key:
		"action": _action()
		"tempo": _toggle_tempo()
		"course":
			if _guide_visible(): _cycle_course()
		"midi":
			if browser: browser.connectMidi()
			else: _connect_native_midi()
		"guide":
			if _guide_visible():
				if browser: browser.openGuide()
				else: OS.shell_open("https://drum-lab.windssea526.workers.dev/practice/")
		_:
			if Orders.LANES.has(key):
				if browser: browser.tapPad(key)
				else: _native_strike(key)


func _focus_choices() -> Array:
	var choices := ["midi", "action"]
	if _guide_visible():
		choices = ["tempo", "midi", "action", "course", "guide"]
	choices.append_array(Orders.LANES)
	return choices


func _move_focus(step: int) -> void:
	var choices := _focus_choices()
	var old := choices.find(ui_focus)
	ui_focus = choices[posmod(old + step, choices.size())] if old >= 0 else "action"
	queue_redraw()


func _focus_neighbor(direction: Vector2) -> void:
	var choices := _focus_choices()
	if not choices.has(ui_focus):
		ui_focus = "action"
	else:
		var current: Rect2 = layout.pads[ui_focus] if layout.pads.has(ui_focus) else layout[ui_focus]
		var nearest := INF
		for choice: String in choices:
			var rect: Rect2 = layout.pads[choice] if layout.pads.has(choice) else layout[choice]
			var offset := rect.get_center() - current.get_center()
			var forward := offset.dot(direction)
			if forward <= 1.0: continue
			var distance := forward + absf(offset.cross(direction)) * 3.0
			if distance < nearest:
				nearest = distance
				ui_focus = choice
	if browser: browser.focusControl(ui_focus)
	queue_redraw()


func _process(_delta: float) -> void:
	now_ms = _clock()
	if phase == Phase.PLAYING:
		_settle_at(now_ms)
		_update_crew(now_ms)
		queue_redraw()
	elif phase == Phase.STARTING or now_ms - maxf(latest, finished_ms) < VICTORY_MS + 100.0:
		_update_crew(now_ms)
		queue_redraw()


func _input(event: InputEvent) -> void:
	if event is InputEventJoypadButton and event.pressed:
		match event.button_index:
			JOY_BUTTON_DPAD_LEFT: _focus_neighbor(Vector2.LEFT)
			JOY_BUTTON_DPAD_RIGHT: _focus_neighbor(Vector2.RIGHT)
			JOY_BUTTON_DPAD_UP: _focus_neighbor(Vector2.UP)
			JOY_BUTTON_DPAD_DOWN: _focus_neighbor(Vector2.DOWN)
			JOY_BUTTON_A: _activate_control("action" if ui_focus.is_empty() else ui_focus)
			JOY_BUTTON_START: _action()
		return
	if event is InputEventJoypadMotion and event.axis in [JOY_AXIS_LEFT_X, JOY_AXIS_LEFT_Y]:
		if absf(event.axis_value) < 0.25: _stick_latched = false
		elif absf(event.axis_value) > 0.65 and not _stick_latched:
			_stick_latched = true
			_focus_neighbor((Vector2.RIGHT if event.axis == JOY_AXIS_LEFT_X else Vector2.DOWN) * signf(event.axis_value))
		return
	if OS.has_feature("web"):
		return
	var position: Vector2
	if event is InputEventKey:
		if not event.pressed or event.echo or event.ctrl_pressed or event.meta_pressed or event.alt_pressed:
			return
		match event.physical_keycode:
			KEY_D: _native_strike(KICK)
			KEY_F: _native_strike(SNARE)
			KEY_J: _native_strike(HAT)
			KEY_K: _native_strike(TOM)
			KEY_M: _connect_native_midi()
			KEY_B: _toggle_tempo()
			KEY_L: _cycle_course()
			KEY_SPACE: _action()
			KEY_TAB: _move_focus(-1 if event.shift_pressed else 1)
			KEY_LEFT: _focus_neighbor(Vector2.LEFT)
			KEY_RIGHT: _focus_neighbor(Vector2.RIGHT)
			KEY_UP: _focus_neighbor(Vector2.UP)
			KEY_DOWN: _focus_neighbor(Vector2.DOWN)
			KEY_ENTER, KEY_KP_ENTER: _activate_control("action" if ui_focus.is_empty() else ui_focus)
		return
	if event is InputEventMIDI:
		if event.message == MIDI_MESSAGE_NOTE_ON and event.velocity > 0:
			_midi_strike(event.pitch, _clock())
		return
	if event is InputEventScreenTouch and event.pressed:
		position = event.position
	elif event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		position = event.position
	else:
		return
	for key in ["action", "midi", "tempo", "course", "guide", KICK, SNARE, HAT, TOM]:
		var rect: Rect2 = layout.pads[key] if layout.pads.has(key) else layout[key]
		if rect.has_point(position):
			ui_focus = ""
			_activate_control(key)
			return


func _browser_event(args: Array) -> void:
	match String(args[0]):
		"layout": _queue_layout()
		"navigate": _focus_neighbor(Vector2(float(args[1]), float(args[2])))
		"focus":
			ui_focus = String(args[1])
			queue_redraw()
		"hit":
			if args.size() >= 5:
				_midi_strike(int(args[4]), float(args[2]))
			else:
				_strike(String(args[1]), float(args[2]))
		"action": _action()
		"tempo": _toggle_tempo()
		"course": _cycle_course()
		"round": _begin(float(args[1]))
		"midi":
			midi = String(args[1])
			queue_redraw()
		"interrupted":
			if phase == Phase.STARTING or phase == Phase.PLAYING:
				_reset()
		"audio_unavailable":
			phase = Phase.IDLE
			error_text = "音频未就绪，请再次开始。"
			queue_redraw()


func _reset() -> void:
	if browser:
		browser.stop()
	elif native_song:
		_restore_native_mix()
		native_song.stop()
		native_stinger.stop()
		native_voice.stop()
	phase = Phase.IDLE
	error_text = ""
	damage = 0
	hull = Orders.SHIP_HULL
	shield = 0
	perfect = 0
	missed = 0
	extras = 0
	attacks_landed = 0
	counters = 0
	timing_offsets.clear()
	counted_by_lane.clear()
	missed_by_lane.clear()
	coaching = ""
	next_bar_to_settle = 0
	latest = -100000.0
	accent_bar = -1
	native_effect_clocks.clear()
	native_effect_variants.clear()
	finished_ms = -100000.0
	feedback = ""
	feedback_color = GOLD
	won = false
	crew_call = -1
	crew_call_ms = -100000.0
	crew_end_ms = -100000.0
	crew_played = 0
	crew_pending.clear()
	if battle_stage:
		battle_stage.clear()
	for lane in Orders.LANES:
		pad_hits[lane] = -100000.0
	queue_redraw()


func _toggle_tempo() -> void:
	if phase == Phase.PLAYING or phase == Phase.STARTING:
		return
	tempo = Orders.PRACTICE_BPM if tempo == Orders.BPM else Orders.BPM
	beat_ms = 60000.0 / tempo
	bar_ms = beat_ms * 4.0
	queue_redraw()


func _cycle_course() -> void:
	if phase == Phase.PLAYING or phase == Phase.STARTING:
		return
	_reset()
	course = (course + 1) % Orders.COURSES.size()
	lesson = Orders.COURSES[course]
	divisions = lesson.divisions
	cue_chart = Orders.cues(course)
	queue_redraw()


func _action() -> void:
	if phase == Phase.PLAYING or phase == Phase.STARTING:
		_reset()
		return
	_reset()
	phase = Phase.STARTING
	if browser:
		browser.start(beat_ms, JSON.stringify(cue_chart), course)
	elif not OS.has_feature("web"):
		if native_song:
			native_song.stream = _native_track(tempo)
			native_song.play()
		var latency_ms := (AudioServer.get_time_to_next_mix() + AudioServer.get_output_latency()) * 1000.0
		_begin(_clock() + latency_ms + bar_ms)
	else:
		phase = Phase.IDLE
		error_text = "浏览器音频无法启动。"
	queue_redraw()


func _begin(start_ms: float) -> void:
	anchor_ms = start_ms
	attack_orders.clear()
	guard_orders.clear()
	for cycle in range(4):
		var group: Array[Orders.Attempt] = []
		for chart in lesson.attacks:
			group.append(Orders.Attempt.new(chart, beat_ms, divisions))
		attack_orders.append(group)
		guard_orders.append(Orders.Attempt.new(lesson.guards[cycle], beat_ms, divisions))
	phase = Phase.PLAYING
	queue_redraw()


func _settle_at(at_ms: float) -> void:
	while phase == Phase.PLAYING and next_bar_to_settle < Orders.BAR_COUNT:
		var bar := next_bar_to_settle
		var deadline := anchor_ms + (bar + 1) * bar_ms + Orders.CALLBACK_GRACE_MS
		if at_ms < deadline:
			return
		next_bar_to_settle += 1
		var cycle := bar >> 2
		match bar % 4:
			Orders.Bar.ATTACK: _resolve_attack(cycle)
			Orders.Bar.GUARD: _resolve_guard(cycle)
	if phase == Phase.PLAYING and next_bar_to_settle >= Orders.BAR_COUNT:
		_finish(damage == Orders.BOSS_ARMOR)


func _strike(lane: String, input_ms: float) -> void:
	if not Orders.LANES.has(lane):
		return
	pad_hits[lane] = _clock()
	if battle_stage:
		battle_stage.strike(lane, pad_hits[lane])
	if phase != Phase.PLAYING:
		latest = pad_hits[lane]
		queue_redraw()
		return
	_judge_strike(lane, input_ms)


func _midi_strike(note: int, input_ms: float) -> void:
	var voice := Orders.midi_name(note)
	if voice.is_empty():
		return
	midi_readout = "MIDI %d  ·  %s" % [note, voice]
	var lane := Orders.midi_lane(note)
	if not lane.is_empty():
		_strike(lane, input_ms)
	elif phase == Phase.PLAYING:
		_judge_strike("", input_ms, note == 37)
	queue_redraw()


func _judge_strike(lane: String, input_ms: float, cross_stick: bool = false) -> void:
	var elapsed := input_ms - anchor_ms
	var normal_bar := floori(elapsed / bar_ms)
	var chosen_bar := normal_bar
	var relative := elapsed - normal_bar * bar_ms
	if relative >= bar_ms - Orders.HIT_MS and normal_bar % 4 in [0, 2]:
		chosen_bar += 1
		relative -= bar_ms
	if chosen_bar < next_bar_to_settle or chosen_bar < 0 or chosen_bar >= Orders.BAR_COUNT:
		return
	var cycle := chosen_bar >> 2
	var active_bar := chosen_bar % 4
	if active_bar == Orders.Bar.ATTACK:
		_play_order(lane, relative, attack_orders[cycle], false, chosen_bar, cross_stick and course == 2)
	elif active_bar == Orders.Bar.GUARD:
		_play_order(lane, relative, [guard_orders[cycle]], true, chosen_bar)


func _play_order(lane: String, relative: float, attempts: Array, defense: bool, bar: int, one_drop_cross_stick: bool = false) -> void:
	var best := INF
	for index in range(attempts.size()):
		var attempt: Orders.Attempt = attempts[index]
		var candidate_lane := SNARE if one_drop_cross_stick and index == 2 else lane
		var offset := attempt.accept(candidate_lane, relative)
		if absf(offset) < absf(best):
			best = offset
		if is_inf(offset) and relative >= 0.0:
			attempt.extras += 1
	if is_inf(best):
		if relative >= 0.0:
			_react("谱外鼓位" if lane.is_empty() else "空拍多击", SALMON)
		return
	var precise := absf(best) <= Orders.PERFECT_MS
	var label := "精准" if precise else "命中"
	var played_lane := SNARE if one_drop_cross_stick else lane
	if one_drop_cross_stick:
		pad_hits[SNARE] = _clock()
		if battle_stage:
			battle_stage.strike(SNARE, pad_hits[SNARE])
	var offset_label := "  /  %d ms %s" % [absi(roundi(best)), "偏早" if best < 0.0 else "偏晚"]
	if defense:
		_push_effect("guard", played_lane, 1.0 if precise else 0.65)
		_impact("guard", 1.0 if precise else 0.68)
		_react("格挡 " + label + offset_label, BLUE)
	else:
		_push_effect("hit", played_lane, 1.0 if precise else 0.65)
		_impact("hit", 1.0 if precise else 0.68)
		_react("出招 " + label + offset_label, GOLD)
	if precise and absf(relative) <= Orders.PERFECT_MS and accent_bar != bar:
		accent_bar = bar
		_impact("accent")


func _resolve_attack(cycle: int) -> void:
	var group := attack_orders[cycle]
	for index in range(group.size()):
		var attempt: Orders.Attempt = group[index]
		if not attempt.complete():
			continue
		_count_attempt(attempt)
		var strong := attempt.perfect == attempt.notes.size()
		var recommended: bool = index == Orders.RECOMMENDED[cycle]
		var amount := 4 + int(strong) + 2 * int(recommended)
		var previous_damage := _deal_damage(amount)
		attacks_landed += 1
		var kind: String = Orders.ATTACK_KINDS[index]
		var reward := ""
		if kind == "flurry" and hull < Orders.SHIP_HULL:
			hull += 1
			reward = "  ·  修船 +1"
		elif kind == "break":
			shield = 1
			reward = "  ·  护盾"
		_push_effect(kind, KICK, 1.0 if strong else 0.75, damage - previous_damage)
		_impact(kind, 1.0 if strong else 0.78)
		if strong:
			_queue_crew(1)
		_armor_sound(previous_damage)
		_react(("%s成招  ·  破甲 %d" % [lesson.attack_names[index], amount]) + reward, GOLD)
		return
	var plausible: Orders.Attempt
	for attempt: Orders.Attempt in group:
		if not plausible:
			plausible = attempt
		elif attempt.hits > plausible.hits or (attempt.hits == plausible.hits and attempt.extras < plausible.extras):
			plausible = attempt
	_count_attempt(plausible)
	_react("出招未完成", SALMON)


func _resolve_guard(cycle: int) -> void:
	var order := guard_orders[cycle]
	_count_attempt(order)
	if order.complete():
		counters += 1
		var repairs := hull < Orders.SHIP_HULL
		hull = mini(Orders.SHIP_HULL, hull + 1)
		var previous_damage := _deal_damage(2)
		_push_effect("counter", HAT, 1.0, damage - previous_damage)
		_impact("counter")
		_armor_sound(previous_damage)
		_react("反击成功  ·  船体回复" if repairs else "反击成功  ·  破甲 2", BLUE)
		return
	var missing := order.notes.size() - order.hits
	var penalty := mini(3, missing + order.extras)
	var absorbed := mini(shield, penalty)
	shield -= absorbed
	penalty -= absorbed
	hull = maxi(0, hull - penalty)
	if penalty == 0:
		_push_effect("guard", SNARE, 1.0)
		_impact("guard", 0.9)
		_react("护盾挡住了反击", BLUE)
		return
	_push_effect("hurt", KICK, 0.7 + penalty * 0.14)
	_impact("hurt", 0.48 + penalty * 0.17)
	_react("防守失误  ·  船体 -%d" % penalty, SALMON)
	if hull == 0:
		_finish(false)


func _deal_damage(amount: int) -> int:
	var previous := damage
	damage = mini(Orders.BOSS_ARMOR, damage + amount)
	return previous


func _armor_sound(previous_damage: int) -> void:
	var half := Orders.BOSS_ARMOR * 0.5
	var crossed_half := previous_damage < half and damage >= half
	if crossed_half or (previous_damage < Orders.BOSS_ARMOR and damage == Orders.BOSS_ARMOR):
		_impact("armor")
	if crossed_half:
		_queue_crew(3)


func _finish(victory: bool) -> void:
	phase = Phase.DONE
	won = victory
	coaching = _coach()
	finished_ms = _clock()
	if browser:
		browser.stop(true)
	elif native_song:
		_restore_native_mix()
		native_song.stop()
		native_voice.stop()
	crew_end_ms = finished_ms
	crew_call = -1
	crew_pending.clear()
	_impact("win" if won else "lose")
	queue_redraw()


func _count_attempt(attempt: Orders.Attempt) -> void:
	perfect += attempt.perfect
	extras += attempt.extras
	for index in range(attempt.notes.size()):
		var note: Array = attempt.notes[index]
		var lane := String(note[1])
		counted_by_lane[lane] = counted_by_lane.get(lane, 0) + 1
		if attempt.filled(index):
			timing_offsets.append(attempt.timestamps[index] - float(note[0]) * attempt.step_ms)
		else:
			missed += 1
			missed_by_lane[lane] = missed_by_lane.get(lane, 0) + 1


func _coach() -> String:
	if timing_offsets.is_empty():
		return "建议切到 72 BPM，先跟练示范。"
	timing_offsets.sort()
	var middle := timing_offsets.size() >> 1
	var median := timing_offsets[middle]
	if timing_offsets.size() % 2 == 0:
		median = (median + timing_offsets[middle - 1]) * 0.5
	var timing := "中位差 %d ms" % absi(roundi(median))
	if absf(median) >= 5.0:
		timing = "中位偏%s %d ms" % ["早" if median < 0.0 else "晚", absi(roundi(median))]
	var lowest := ""
	var highest_rate := 0.0
	for lane: String in Orders.LANES:
		var lane_misses := int(missed_by_lane.get(lane, 0))
		if lane_misses == 0:
			continue
		var rate := float(lane_misses) / counted_by_lane[lane]
		if rate > highest_rate:
			highest_rate = rate
			lowest = lane
	if not lowest.is_empty():
		return timing + "  ·  先练%s" % LANE_NAMES[lowest]
	if extras > 0:
		return timing + "  ·  空拍留白"
	return timing + "  ·  可换一种律动"


func _react(message: String, color: Color) -> void:
	feedback = message
	feedback_color = color
	latest = _clock()
	queue_redraw()


func _push_effect(kind: String, lane: String, strength: float, points := 0) -> void:
	if battle_stage:
		battle_stage.impact(kind, lane, strength, _clock(), points)


func _queue_crew(line: int) -> void:
	if not (crew_played & (1 << line)) and not crew_pending.has(line):
		crew_pending.append(line)


func _play_crew(line: int, at: float) -> bool:
	var flag := 1 << line
	if (crew_played & flag) or at < crew_end_ms:
		return false
	crew_played |= flag
	crew_call = line
	crew_call_ms = at
	crew_end_ms = at + Sound.VOICE_GAP_MS
	var name: String = Sound.VOICES[line]
	if browser:
		browser.voice(name)
	elif native_voices.has(name):
		var clip := native_voices[name]
		native_voice.stream = clip
		native_voice.play()
		_duck_native_mix(clip.get_length())
	return true


func _update_crew(at: float) -> void:
	if phase == Phase.DONE:
		if won and at >= finished_ms + 780.0:
			_play_crew(4, at)
		return
	if phase != Phase.PLAYING:
		return
	var elapsed := (at - anchor_ms) / beat_ms
	if elapsed < 0.0:
		if elapsed >= -1.65:
			_play_crew(0, at)
		return
	# Call before the third boss demonstration, which teaches the densest sticking.
	if elapsed >= 38.75 and elapsed < 39.3 and _play_crew(2, at):
		return
	if crew_pending.is_empty() or at < crew_end_ms:
		return
	if not (crew_played & (1 << 2)) and elapsed < 38.75 and elapsed + Sound.VOICE_GAP_MS / beat_ms >= 38.75:
		return # Keep the approaching boss warning free of other crew lines.
	# Delay event-driven lines if a recorded rehearsal note would be obscured.
	for cue in cue_chart:
		var cue_at := anchor_ms + float(cue[0]) * beat_ms
		if cue_at >= at - 75.0 and cue_at < at + Sound.VOICE_GAP_MS:
			return
	_play_crew(crew_pending.pop_front(), at)


func _impact(kind: String, strength: float = 1.0) -> void:
	if browser:
		browser.impact(kind, strength)
		return
	if not native_effects.has(kind):
		return
	var level := float(Sound.LEVELS[kind]) * clampf(strength, 0.45, 1.1)
	if kind in ["win", "lose"]:
		native_stinger.stream = native_effects[kind]
		native_stinger.volume_db = linear_to_db(level)
		native_stinger.play()
		return
	var at := _clock()
	var sample := kind
	if Sound.VARIANTS.has(kind):
		if at - native_effect_clocks.get(kind, -INF) < Sound.COOLDOWN_MS[kind]:
			return
		native_effect_clocks[kind] = at
		var variants: Array = Sound.VARIANTS[kind]
		var index: int = native_effect_variants.get(kind, 0)
		sample = variants[index]
		native_effect_variants[kind] = (index + 1) % variants.size()
	var position := (at - anchor_ms) * 0.001
	var period := beat_ms * 0.001
	if at < crew_end_ms or Sound.speech_is_near(position, period) or Sound.speech_is_near(position + 0.179, period):
		level *= 0.58
	elif Sound.DUCKED.has(kind):
		_duck_native_mix()
	var playback := native_kit.get_stream_playback() as AudioStreamPlaybackPolyphonic
	if playback:
		playback.play_stream(native_effects.get(sample, native_effects[kind]), 0.0, linear_to_db(level))


func _restore_native_mix() -> void:
	if native_duck:
		native_duck.kill()
		native_duck = null
	if native_song.stream is AudioStreamSynchronized:
		native_song.stream.set_sync_stream_volume(0, -2.0)


func _duck_native_mix(voice_duration: float = 0.0) -> void:
	var track := native_song.stream as AudioStreamSynchronized if native_song else null
	if not track or not native_song.playing:
		return
	if native_duck:
		native_duck.kill()
	var set_music_gain := func(db: float) -> void: track.set_sync_stream_volume(0, db)
	var floor_db := -7.0 if voice_duration > 0.0 else -4.5
	native_duck = create_tween()
	native_duck.tween_method(set_music_gain, track.get_sync_stream_volume(0), floor_db, 0.018)
	native_duck.tween_interval(maxf(0.046, voice_duration - 0.018))
	native_duck.tween_method(set_music_gain, floor_db, -2.0, 0.115)


func _setup_native_audio() -> void:
	for lane: String in [KICK, SNARE, HAT, TOM, Orders.CROSS, "click"]:
		native_samples[lane] = load("res://audio/kit_%s.wav" % lane) as AudioStreamWAV
	for kind in Sound.SAMPLES:
		var path := "res://audio/impact_%s.wav" % kind
		if ResourceLoader.exists(path, "AudioStream"):
			native_effects[kind] = load(path) as AudioStream
	for kind in ["win", "lose"]:
		var path := "res://music/%s.ogg" % ("victory" if kind == "win" else "defeat")
		if FileAccess.file_exists(path):
			native_effects[kind] = AudioStreamOggVorbis.load_from_file(path)
	for voice in Sound.VOICES:
		var path := "res://voice/voice_%s.wav" % voice
		if ResourceLoader.exists(path, "AudioStream"):
			native_voices[voice] = load(path) as AudioStreamWAV
	native_kit = AudioStreamPlayer.new()
	var poly := AudioStreamPolyphonic.new()
	poly.polyphony = 16
	native_kit.stream = poly
	add_child(native_kit)
	native_kit.play()
	native_stinger = AudioStreamPlayer.new()
	add_child(native_stinger)
	native_voice = AudioStreamPlayer.new()
	native_voice.volume_db = -2.0
	add_child(native_voice)
	native_song = AudioStreamPlayer.new()
	add_child(native_song)


func _native_track(bpm: int) -> AudioStream:
	var key := Vector2i(course, bpm)
	if native_tracks.has(key):
		return native_tracks[key]
	var speed_suffix := "_slow" if bpm == Orders.PRACTICE_BPM else ""
	var music := "res://music/%s%s_native.ogg" % [lesson.backing, speed_suffix]
	var has_score := ResourceLoader.exists(music, "AudioStream")
	var cues := _make_track(not has_score, 60000.0 / bpm)
	var result: AudioStream = cues
	if has_score:
		var synced := AudioStreamSynchronized.new()
		synced.stream_count = 2
		synced.set_sync_stream(0, load(music) as AudioStream)
		synced.set_sync_stream(1, cues)
		synced.set_sync_stream_volume(0, -2.0)
		result = synced
	native_tracks[key] = result
	return result


func _native_strike(lane: String) -> void:
	var at := _clock()
	if native_kit:
		var playback := native_kit.get_stream_playback() as AudioStreamPlaybackPolyphonic
		if playback:
			playback.play_stream(native_samples[lane])
	_strike(lane, at)


func _connect_native_midi() -> void:
	OS.open_midi_inputs()
	midi = "connected" if not OS.get_connected_midi_inputs().is_empty() else "waiting"
	queue_redraw()


func _wav(samples: PackedFloat32Array, rate: int) -> AudioStreamWAV:
	var decoded := PackedByteArray()
	decoded.resize(samples.size() * 2)
	for index in range(samples.size()):
		decoded.encode_s16(index * 2, int(clampf(samples[index], -1.0, 1.0) * 32767.0))
	var stream := AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_16_BITS
	stream.mix_rate = rate
	stream.data = decoded
	return stream




func _make_track(include_simple_groove: bool, tempo_beat_ms: float) -> AudioStreamWAV:
	const RATE := 24000
	var samples := PackedFloat32Array()
	var beat_samples := tempo_beat_ms / 1000.0 * RATE
	samples.resize(ceili(beat_samples * (4.0 + Orders.BAR_COUNT * 4.0)))
	for beat in range(4):
		var position := roundi(beat * beat_samples)
		_mix_pcm(samples, RATE, position, native_samples.get("click"), 0.60 if beat == 0 else 0.40)
	if include_simple_groove:
		for beat in range(4, 4 + Orders.BAR_COUNT * 4, 2):
			var position := roundi(beat * beat_samples)
			_mix_pcm(samples, RATE, position, native_samples.get(KICK), 0.32)
	for cue in cue_chart:
		var position := roundi((4.0 + float(cue[0])) * beat_samples)
		_mix_pcm(samples, RATE, position, native_samples.get(String(cue[1])), 0.68 * float(cue[2]) / 127.0)
	for cue in Sound.scheduled_effects():
		var kind := String(cue[0])
		var at := (4.0 + float(cue[1])) * beat_samples + float(cue[2]) * RATE
		_mix_native_effect(samples, RATE, roundi(at), kind)
	return _wav(samples, RATE)


func _mix_native_effect(samples: PackedFloat32Array, rate: int, at: int, kind: String) -> void:
	var stream := native_effects.get(kind) as AudioStreamWAV
	_mix_pcm(samples, rate, at, stream, float(Sound.LEVELS[kind]))


func _mix_pcm(samples: PackedFloat32Array, rate: int, at: int, stream: AudioStreamWAV, gain: float) -> void:
	if not stream or stream.format != AudioStreamWAV.FORMAT_16_BITS or stream.stereo:
		return
	var pcm := stream.data
	var frames := pcm.size() >> 1
	var ratio := float(stream.mix_rate) / rate
	var amount := mini(samples.size() - at, floori((frames - 1) / ratio))
	var level := gain / 32768.0
	for index in range(amount):
		var position := index * ratio
		var frame := floori(position)
		var left := float(pcm.decode_s16(frame * 2))
		var right := float(pcm.decode_s16(frame * 2 + 2))
		samples[at + index] += lerpf(left, right, position - frame) * level




func _mount_chart() -> void:
	chart_book = ScoreBook.new()
	chart_book.name = "DrumBook"
	chart_book.mouse_filter = Control.MOUSE_FILTER_IGNORE
	chart_book.clip_contents = true
	add_child(chart_book)


func _hud_text(value: String, box: Rect2, points: int, ink: Color, align: HorizontalAlignment = HORIZONTAL_ALIGNMENT_LEFT) -> void:
	var span := font.get_string_size(value, HORIZONTAL_ALIGNMENT_LEFT, -1, points).x
	if span > box.size.x and span > 0.0:
		points = maxi(10, floori(points * box.size.x / span))
	var baseline := box.get_center().y + (font.get_ascent(points) - font.get_descent(points)) * 0.5
	draw_string(font, Vector2(box.position.x, baseline), value, align, box.size.x, points, ink)


# Clipped corners, a raised ink edge and a short brass highlight match the boat's hardware.
func _plate(box: Rect2, fill: Color, rim: Color, bevel := 9.0) -> void:
	var x := box.position.x
	var y := box.position.y
	var w := box.size.x
	var h := box.size.y
	var b := minf(bevel, minf(h, w) * 0.25)
	var points := PackedVector2Array([
		Vector2(x + b, y), Vector2(x + w - b, y), Vector2(x + w, y + b),
		Vector2(x + w, y + h - b), Vector2(x + w - b, y + h), Vector2(x + b, y + h),
		Vector2(x, y + h - b), Vector2(x, y + b),
	])
	draw_colored_polygon(points, fill)
	points.append(points[0])
	draw_polyline(points, DEEP, 3.0, true)
	draw_line(Vector2(x + b, y + 2.0), Vector2(x + w - b, y + 2.0), rim, 1.6, true)


func _rivet(at: Vector2, color := BRASS) -> void:
	draw_circle(at + Vector2(0, 1), 3.0, DEEP, true, -1, true)
	draw_circle(at, 2.2, color, true, -1, true)
	draw_line(at - Vector2(0.9, -0.4), at + Vector2(0.9, -0.4), DEEP, 0.8, true)


func _focus_control(key: String, box: Rect2) -> void:
	if ui_focus == key:
		draw_rect(box.grow(-3.0), CREAM, false, 2.5, true)
		draw_line(box.position + Vector2(8, 6), box.position + Vector2(22, 6), GOLD, 4.0, true)


func _compass(at: Vector2, r: float) -> void:
	draw_circle(at, r + 1.0, DEEP, true, -1, true)
	draw_arc(at, r, 0, TAU, 28, BRASS, 1.6, true)
	for axis in range(4):
		var n := Vector2.from_angle(axis * PI * 0.5 - PI * 0.5)
		var side := n.orthogonal() * r * 0.27
		var tip := at + n * r * (0.96 if axis % 2 == 0 else 0.78)
		draw_colored_polygon(PackedVector2Array([at, at + side, tip]), CREAM)
		draw_colored_polygon(PackedVector2Array([at, tip, at - side]), BRASS)
	draw_circle(at, r * 0.17, DEEP, true, -1, true)


func _name_flag(box: Rect2) -> void:
	var a := box.position
	var b := box.end
	var points := PackedVector2Array([
		a + Vector2(9, 0), Vector2(b.x, a.y), Vector2(b.x - 12, box.get_center().y), b,
		Vector2(a.x + 9, b.y), Vector2(a.x, b.y - 8), a + Vector2(0, 8)
	])
	draw_colored_polygon(points, DECK)
	points.append(points[0])
	draw_polyline(points, DEEP, 3.0, true)
	draw_line(a + Vector2(10, 3), Vector2(b.x - 4, a.y + 3), BRASS, 1.6)
	draw_line(Vector2(a.x + 10, b.y - 3), b - Vector2(5, 3), Color("#5d8d8f"), 1.0)


func _draw_transport() -> void:
	var rail: Rect2 = layout.rail
	var speed: Rect2 = layout.tempo
	var port: Rect2 = layout.midi
	var action: Rect2 = layout.action
	var brand := Rect2(rail.position, Vector2(speed.position.x - rail.position.x - 7.0, rail.size.y))
	var caption := midi_readout if not midi_readout.is_empty() else String(lesson.name)
	var wide := brand.size.x >= 285.0
	var compact := brand.size.x < 142.0
	var content_width := 189.0 + font.get_string_size(caption, HORIZONTAL_ALIGNMENT_LEFT, -1, 16).x
	brand.size.x = minf(brand.size.x, content_width + 29.0 if wide else 178.0)
	_name_flag(brand)
	var left := brand.position.x + 10.0
	if not compact:
		_compass(Vector2(left + 15.0, brand.get_center().y), 14.5)
		left += 39.0
	var title_w := minf(brand.end.x - left - 6.0, 123.0)
	_hud_text("潮汐鼓港", Rect2(left, brand.position.y, title_w, brand.size.y), 25 if not compact else 21, CREAM)
	if wide:
		var divider := left + title_w + 5.0
		draw_line(Vector2(divider, brand.position.y + 12), Vector2(divider, brand.end.y - 12), BRASS.darkened(0.22), 1.0)
		_hud_text(caption, Rect2(divider + 13, brand.position.y, brand.end.x - divider - 27, brand.size.y), 16, TURQUOISE)

	var changing := phase != Phase.PLAYING and phase != Phase.STARTING
	_plate(speed, DECK if changing else Color("#253c43"), BRASS.darkened(0.25), 7)
	_hud_text("%d BPM" % tempo, speed.grow(-6), 19, CREAM if changing else MUTED, HORIZONTAL_ALIGNMENT_CENTER)
	var label := "连接 MIDI"
	var ink := Color("#a9bcbb")
	match midi:
		"connected":
			label = "MIDI 已连接"
			ink = TURQUOISE
		"waiting": label = "等待设备"
		"unsupported": label = "MIDI 不可用"
		"denied": label = "授权失败"
	if port.size.x < 80.0:
		if midi == "idle":
			label = "连鼓"
		elif midi == "connected":
			label = "已连鼓"
	_plate(port, DECK, ink.darkened(0.35), 7)
	var text_rect := port.grow(-6)
	if port.size.x > 94:
		var led := Vector2(port.position.x + 13, port.get_center().y)
		draw_circle(led, 4.5, ink, true, -1, true)
		text_rect.position.x += 10.0
		text_rect.size.x -= 10.0
	_hud_text(label, text_rect, 16, CREAM, HORIZONTAL_ALIGNMENT_CENTER)

	var ongoing := phase == Phase.PLAYING or phase == Phase.STARTING
	var action_fill := Color("#3b4346") if ongoing else Color("#ffb84e")
	_plate(action, action_fill, CORAL if ongoing else CREAM)
	var action_text := "收鼓" if ongoing else ("再战" if phase == Phase.DONE else "开战")
	var center := action.get_center()
	var fg := CREAM if ongoing else DEEP
	var title_box := action.grow(-5.0)
	if action.size.x >= 82.0:
		if ongoing:
			draw_rect(Rect2(center - Vector2(32, 6), Vector2(12, 12)), fg)
		else:
			var p := center - Vector2(26, 0)
			draw_colored_polygon(PackedVector2Array([p + Vector2(-5, -7), p + Vector2(7, 0), p + Vector2(-5, 7)]), fg)
		title_box = Rect2(center.x - 15, action.position.y, 50, action.size.y)
	_hud_text(action_text, title_box, 21, fg, HORIZONTAL_ALIGNMENT_CENTER)
	_focus_control("tempo", speed)
	_focus_control("midi", port)
	_focus_control("action", action)


func _oval(center: Vector2, extent: Vector2, fill: Color, edge: Color) -> void:
	var points := PackedVector2Array()
	for i in range(20):
		points.append(center + extent * Vector2.from_angle(float(i) * TAU / 20))
	draw_colored_polygon(points, fill)
	points.append(points[0])
	draw_polyline(points, edge, 1.8, true)


func _drum_icon(lane: String, at: Vector2, scale_factor: float, ink: Color, pulse: float) -> void:
	# Local units are a 40px illustrated drum. The pad owns the hit target.
	draw_set_transform(at, -0.045 * pulse, Vector2(scale_factor * (1.0 + 0.06 * pulse), scale_factor * (1.0 - 0.11 * pulse)))
	if lane == HAT:
		draw_line(Vector2(0, -13), Vector2(0, 18), DEEP, 3.0, true)
		draw_line(Vector2(-8, 20), Vector2(0, 15), DEEP, 2.0, true)
		draw_line(Vector2(0, 15), Vector2(8, 20), DEEP, 2.0, true)
		_oval(Vector2(0, 3), Vector2(21, 5.5), ink.darkened(0.38), DEEP)
		_oval(Vector2(0, -1), Vector2(21, 5.5), ink, DEEP)
		draw_colored_polygon(PackedVector2Array([Vector2(-17, -1), Vector2(-3, -6), Vector2(4, -6), Vector2(17, -1)]), CREAM)
		draw_circle(Vector2(0, -7), 2.8, DEEP, true, -1, true)
	elif lane == KICK:
		_oval(Vector2(3, -1), Vector2(17, 17), ink.darkened(0.4), DEEP)
		_oval(Vector2(-2, -1), Vector2(16.5, 17), CREAM, DEEP)
		_oval(Vector2(-2, -1), Vector2(12.5, 13), ink, DEEP)
		_oval(Vector2(-5, -4), Vector2(6, 5), CREAM, ink.darkened(0.35))
		draw_line(Vector2(-15, 10), Vector2(-20, 18), DEEP, 2.8, true)
		draw_line(Vector2(12, 11), Vector2(17, 18), DEEP, 2.8, true)
	else:
		var bottom := 9.0 if lane == SNARE else 14.0
		var top := -7.0 if lane == SNARE else -10.0
		_oval(Vector2(0, bottom), Vector2(18, 5), ink.darkened(0.40), DEEP)
		draw_rect(Rect2(-18, top, 36, bottom - top), ink.darkened(0.17))
		for x in [-18.0, -9.0, 0.0, 9.0, 18.0]:
			draw_line(Vector2(x, top + 1), Vector2(x - 1.0 if absf(x) < 12 else x, bottom), DEEP, 1.8, true)
		_oval(Vector2(0, top), Vector2(18, 5.8), CREAM, DEEP)
		if lane == SNARE:
			draw_line(Vector2(-12, top + 1), Vector2(14, top - 12), DEEP, 3.2, true)
			draw_line(Vector2(-12, top), Vector2(14, top - 13), BRASS.lightened(0.3), 1.5, true)
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


func _draw_pad(lane: String) -> void:
	var box: Rect2 = layout.pads[lane]
	var ink: Color = LANE_COLORS[lane]
	var hit := clampf(1.0 - (now_ms - pad_hits.get(lane, -10000.0)) / 165.0, 0.0, 1.0)
	var face := box
	face.size.y -= 3.0
	face.position.y += hit * 2.5
	_plate(box, ink.darkened(0.66), ink.darkened(0.4), 11)
	_plate(face, DECK.lerp(ink, 0.13 + hit * 0.53), ink, 10)
	var badge := Vector2(face.position.x + 32.0, face.get_center().y)
	draw_circle(badge, minf(23.0, face.size.y * 0.405), ink.darkened(0.42), true, -1, true)
	draw_circle(badge, minf(22.0, face.size.y * 0.385), ink.lerp(CREAM, 0.18), true, -1, true)
	_drum_icon(lane, badge, minf(0.95, face.size.y / 59.0), ink, hit)
	if hit > 0.0:
		var ring := minf(23.0, face.size.y * 0.405) + (1.0 - hit) * 5.5
		draw_arc(badge, ring, -PI * 0.82, PI * 0.28, 20, Color(CREAM, hit), 2.5, true)
	var text_x := badge.x + 30.0
	var key_w := 27.0 if box.size.x > 147.0 else 0.0
	_hud_text(LANE_NAMES[lane], Rect2(text_x, face.position.y, maxf(18, face.end.x - text_x - 12 - key_w), face.size.y), 23, CREAM)
	if key_w:
		var key := Rect2(face.end.x - 41, face.get_center().y - 13, 26, 26)
		_plate(key, DEEP, ink.darkened(0.18), 4)
		_hud_text(LANE_KEYS[lane], key, 16, ink, HORIZONTAL_ALIGNMENT_CENTER)
	_focus_control(lane, box)


func _draw_health() -> void:
	for is_boss: bool in [false, true]:
		var box: Rect2 = layout.armor if is_boss else layout.hull
		var ink := CORAL if is_boss else TURQUOISE
		var amount := Orders.BOSS_ARMOR - damage if is_boss else hull
		var maximum := Orders.BOSS_ARMOR if is_boss else Orders.SHIP_HULL
		_plate(box, Color("#2f323c") if is_boss else DECK, ink, 7)
		var left := box.position.x + 10.0
		var right := box.end.x - 10.0
		var title := "轰壳蟹 · 护甲" if is_boss else ("鼓船 · 护盾" if shield > 0 else "鼓船 · 船体")
		_hud_text(title, Rect2(left, box.position.y + 1, box.size.x - 64.0, 20), 14, CREAM)
		_hud_text("%d/%d" % [amount, maximum], Rect2(right - 50, box.position.y + 1, 50, 20), 13, ink, HORIZONTAL_ALIGNMENT_RIGHT)
		var gauge := Rect2(left, box.end.y - 10.0, right - left, 5.0)
		draw_rect(gauge, DEEP)
		draw_rect(Rect2(gauge.position, Vector2(gauge.size.x * amount / float(maximum), gauge.size.y)), ink)
		var divisions_count := 7 if is_boss else 8
		for i in range(1, divisions_count):
			var x := gauge.position.x + gauge.size.x * i / divisions_count
			draw_line(Vector2(x, gauge.position.y), Vector2(x - 2.0, gauge.end.y), DEEP, 1.5)


func _draw_status(elapsed: float, bar: int) -> void:
	var box: Rect2 = layout.status
	var title := "迎击轰壳蟹"
	var phrase := "听一小节，再选一行出招"
	var accent := BRASS
	var cycle := bar >> 2
	if phase == Phase.STARTING:
		title = "准备音频"
		phrase = "即将开始"
	elif phase == Phase.PLAYING and elapsed < 0.0:
		title = "预备  %d" % clampi(ceili(-elapsed / beat_ms), 1, 4)
		phrase = "听稳四拍，准备出港"
		accent = TURQUOISE
	elif phase == Phase.PLAYING:
		var mode := bar % 4
		title = ["听鼓示范", "自由出招", "听敌招", "跟拍防守"][mode]
		accent = [TURQUOISE, GOLD, CORAL, TURQUOISE][mode]
		phrase = String(lesson.attack_names[Orders.RECOMMENDED[cycle]]) if mode < 2 else String(lesson.guard_names[cycle])
		if mode == Orders.Bar.SCOUT:
			phrase = "弱点  " + phrase
		if mode == Orders.Bar.GUARD and not guard_orders.is_empty():
			var order := guard_orders[cycle]
			phrase += "   %d / %d" % [order.hits, order.notes.size()]
	elif phase == Phase.DONE:
		title = "击退轰壳蟹" if won else ("鼓船受损" if hull == 0 else "首领仍有护甲")
		phrase = "破甲 %d/%d   精准 %d" % [damage, Orders.BOSS_ARMOR, perfect]
		accent = GOLD if won else CORAL
	if not error_text.is_empty():
		phrase = error_text
	var expanded := phase == Phase.DONE and _guide_visible()
	if expanded:
		box.size.y += 52.0
	else:
		var required := font.get_string_size(phrase, HORIZONTAL_ALIGNMENT_LEFT, -1, 18).x + 45.0
		var with_counter := phase == Phase.PLAYING and elapsed >= 0.0
		var headline := font.get_string_size(title, HORIZONTAL_ALIGNMENT_LEFT, -1, 23).x + (135.0 if with_counter else 48.0)
		var fitted := minf(box.size.x, maxf(200.0, maxf(required, headline)))
		box.position.x += (box.size.x - fitted) * 0.5
		box.size.x = fitted
	_plate(box, Color("#15313ce9"), accent, 12)
	draw_rect(Rect2(box.position + Vector2(11, 12), Vector2(3, 17)), accent)
	var left := box.position.x + 22.0
	var width := box.size.x - 42.0
	var title_width := width - 80.0 if phase == Phase.PLAYING and elapsed >= 0.0 else width
	_hud_text(title, Rect2(left, box.position.y + 3, title_width, 29), 23, accent)
	if phase == Phase.PLAYING and elapsed >= 0.0:
		_hud_text("小节  %02d/16" % (bar + 1), Rect2(box.end.x - 109, box.position.y + 4, 89, 25), 14, CREAM, HORIZONTAL_ALIGNMENT_RIGHT)
	_hud_text(phrase, Rect2(left, box.position.y + 32, width, 27), 18, CREAM)
	if expanded:
		draw_line(Vector2(left, box.position.y + 61.0), Vector2(box.end.x - 17.0, box.position.y + 61.0), Color("#5b7476"))
		_hud_text("成招 %d   反击 %d   漏击 %d   多击 %d" % [attacks_landed, counters, missed, extras], Rect2(left, box.position.y + 65, width, 22), 16, CREAM)
		_hud_text(coaching, Rect2(left, box.position.y + 88, width, 23), 16, GOLD)
	elif phase == Phase.PLAYING and elapsed >= 0 and now_ms - latest < 620.0 and not feedback.is_empty():
		var score_box: Rect2 = layout.score
		var badge_w := clampf(font.get_string_size(feedback, HORIZONTAL_ALIGNMENT_LEFT, -1, 19).x + 34, 138.0, score_box.size.x * 0.72)
		var badge := Rect2(score_box.get_center().x - badge_w / 2.0, score_box.position.y - 44, badge_w, 36)
		_plate(badge, Color("#152f36ed"), feedback_color, 8)
		_hud_text(feedback, badge.grow(-5), 19, feedback_color, HORIZONTAL_ALIGNMENT_CENTER)


func _draw_score(elapsed: float, bar: int) -> void:
	if not chart_book:
		return
	var active := phase == Phase.PLAYING and elapsed >= 0.0
	var mode := bar % 4 if active else Orders.Bar.ATTACK
	var cursor := clampi(floori((elapsed - bar * bar_ms) / (beat_ms / divisions)), 0, divisions * 4 - 1) if active else -1
	var cycle := bar >> 2
	var attempts: Array = attack_orders[cycle] if active and mode == Orders.Bar.ATTACK else []
	var guard: Orders.Attempt = guard_orders[cycle] if active and mode == Orders.Bar.GUARD else null
	chart_book.present(layout.score, course, bar, mode, cursor, active, latest if active else -INF, attempts, guard)


func _guide_visible() -> bool:
	return phase == Phase.IDLE or (phase == Phase.DONE and now_ms - finished_ms >= VICTORY_MS)


func _draw_crew_call() -> void:
	const CAST := ["领鼓", "船员", "船长", "领鼓与船员", "全船"]
	const LINES := ["起锚！", "嗨哟！", "当心！", "破浪！", "嘿，好样的！"]
	var speaker := crew_call
	var age := now_ms - crew_call_ms
	if speaker < 0 or age < 0.0 or age > 1250.0 or (phase == Phase.DONE and _guide_visible()):
		return
	var region: Rect2 = layout.stage
	var tint := CORAL if speaker == 2 else GOLD
	var safe_rect: Rect2 = layout.safe
	var box := Rect2(safe_rect.position.x + 24.0, region.end.y - 64.0, 172.0, 43.0)
	draw_colored_polygon(PackedVector2Array([box.position + Vector2(16, 2), box.position + Vector2(22, -9), box.position + Vector2(32, 2)]), DEEP)
	_plate(box, DEEP, tint, 7)
	_hud_text(CAST[speaker], Rect2(box.position.x + 10, box.position.y, 45, box.size.y), 13, tint)
	_hud_text(LINES[speaker], Rect2(box.position.x + 61, box.position.y, box.size.x - 72, box.size.y), 21, CREAM)


func _draw() -> void:
	if layout.is_empty():
		return
	var sheet: Rect2 = layout.score
	var full: Rect2 = layout.viewport
	# A single varnished gunwale ties the paper score and four drum pads to the boat.
	var deck_top := sheet.position.y - 2.0
	draw_rect(Rect2(full.position.x, deck_top, full.size.x, full.end.y - deck_top), DEEP)
	draw_line(Vector2(full.position.x, deck_top), Vector2(full.end.x, deck_top), BRASS, 3.0)
	_rivet(Vector2((full.position.x + sheet.position.x) * 0.5, sheet.get_center().y))
	_rivet(Vector2((full.end.x + sheet.end.x) * 0.5, sheet.get_center().y))
	var elapsed := now_ms - anchor_ms if phase == Phase.PLAYING else 0.0
	var bar := clampi(floori(elapsed / bar_ms), 0, Orders.BAR_COUNT - 1)
	_draw_transport()
	_draw_status(elapsed, bar)
	_draw_health()
	_draw_crew_call()
	var show_guide := _guide_visible()
	if browser and guide_link_visible != show_guide:
		browser.setGuideVisible(show_guide)
		guide_link_visible = show_guide
	if show_guide:
		var guide: Rect2 = layout.guide
		var course_box: Rect2 = layout.course
		_plate(guide, DECK, BRASS, 8)
		_hud_text("练习谱  ›", guide.grow(-6), 20, CREAM, HORIZONTAL_ALIGNMENT_CENTER)
		_plate(course_box, DECK, TURQUOISE, 8)
		_hud_text("课组 %d/4   %s  ›" % [course + 1, lesson.name], course_box.grow(-8), 18, CREAM, HORIZONTAL_ALIGNMENT_CENTER)
		_focus_control("guide", guide)
		_focus_control("course", course_box)
	_draw_score(elapsed, bar)
	for lane: String in Orders.LANES:
		_draw_pad(lane)
