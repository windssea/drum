extends Node2D

const Orders = preload("res://scripts/combat_orders.gd")
const BEAT_MS := Orders.BEAT_MS
const KICK := Orders.KICK
const SNARE := Orders.SNARE
const HAT := Orders.HAT
const TOM := Orders.TOM
const LANE_PADS := {
	KICK: Rect2(36, 605, 264, 77),
	SNARE: Rect2(308, 605, 264, 77),
	HAT: Rect2(580, 605, 264, 77),
	TOM: Rect2(852, 605, 264, 77),
}
const MIDI_BUTTON := Rect2(700, 40, 219, 50)
const SPEED_BUTTON := Rect2(512, 40, 172, 50)
const ACTION_BUTTON := Rect2(935, 40, 181, 50)
const GUIDE_BUTTON := Rect2(56, 367, 205, 56)
const ART := Rect2(36, 108, 1080, 334)
const STATUS := Rect2(408, 125, 318, 136)
const GRID := Rect2(36, 452, 1080, 142)
const GOLD := Color("#ffd98f")
const IVORY := Color("#fff4dc")
const MUTED := Color("#adbcc5")
const BLUE := Color("#92dbe0")
const SALMON := Color("#ffaea0")
const INK := Color("#121922")
const LANE_COLORS := {KICK: GOLD, SNARE: BLUE, HAT: Color("#b7e88b"), TOM: Color("#d1b4ff")}
const LANE_NAMES := {KICK: "底鼓", SNARE: "军鼓", HAT: "踩镲", TOM: "通鼓"}
const LANE_GLYPHS := {KICK: "底", SNARE: "军", HAT: "镲", TOM: "通"}
const LANE_KEYS := {KICK: "D", SNARE: "F", HAT: "J", TOM: "K"}
const BACKDROP := "res://art/harbor.webp"
const BOSS_ART := "res://art/boss.webp"
const BOSS_BURST := "res://art/vfx/boss-burst.webp"
const VICTORY_FILM := "res://art/vfx/finale.webp"
const VICTORY_MS := 1850.0

enum Phase { IDLE, STARTING, PLAYING, DONE }

var phase: Phase = Phase.IDLE
var tempo := Orders.BPM
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
var art: Texture2D
var boss: Texture2D
var burst_atlas: Texture2D
var victory_atlas: Texture2D
var font: Font
var browser: JavaScriptObject
var browser_events: JavaScriptObject
var native_song: AudioStreamPlayer
var native_kit: AudioStreamPlayer
var native_stinger: AudioStreamPlayer
var native_tracks: Dictionary[int, AudioStream] = {}
var native_samples: Dictionary[String, AudioStreamWAV] = {}
var native_effects: Dictionary[String, AudioStream] = {}
var effects: Array[Dictionary] = []
var recoil_ms := -100000.0
var break_ms := -100000.0
var guard_ms := -100000.0
var finished_ms := -100000.0
var won := false
var panel_styles: Dictionary[String, StyleBoxFlat] = {}


func _ready() -> void:
	for lane in Orders.LANES:
		pad_hits[lane] = -100000.0
	now_ms = _clock()
	font = preload("res://art/HarborHUD.ttf")
	if ResourceLoader.exists(BACKDROP, "Texture2D"):
		art = load(BACKDROP) as Texture2D
	if ResourceLoader.exists(BOSS_ART, "Texture2D"):
		boss = load(BOSS_ART) as Texture2D
	if ResourceLoader.exists(BOSS_BURST, "Texture2D"):
		burst_atlas = load(BOSS_BURST) as Texture2D
	if ResourceLoader.exists(VICTORY_FILM, "Texture2D"):
		victory_atlas = load(VICTORY_FILM) as Texture2D
	if OS.has_feature("web"):
		JavaScriptBridge.eval(FileAccess.get_file_as_string("res://web/harbor_bridge.js"), true)
		browser = JavaScriptBridge.get_interface("harborBridge")
		if browser:
			browser_events = JavaScriptBridge.create_callback(_browser_event)
			browser.bind(browser_events)
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


func _process(_delta: float) -> void:
	now_ms = _clock()
	if phase == Phase.PLAYING:
		_settle_at(now_ms)
		queue_redraw()
	elif phase == Phase.STARTING or now_ms - maxf(latest, finished_ms) < VICTORY_MS + 100.0:
		queue_redraw()


func _input(event: InputEvent) -> void:
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
			KEY_SPACE: _action()
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
	for lane: String in Orders.LANES:
		if LANE_PADS[lane].has_point(position):
			_native_strike(lane)
			return
	if MIDI_BUTTON.has_point(position):
		_connect_native_midi()
	elif ACTION_BUTTON.has_point(position):
		_action()
	elif SPEED_BUTTON.has_point(position):
		_toggle_tempo()
	elif GUIDE_BUTTON.has_point(position) and _guide_visible():
		OS.shell_open("https://drum-lab.windssea526.workers.dev/practice/")


func _browser_event(args: Array) -> void:
	match String(args[0]):
		"hit":
			if args.size() >= 5:
				_midi_strike(int(args[4]), float(args[2]))
			else:
				_strike(String(args[1]), float(args[2]))
		"action": _action()
		"tempo": _toggle_tempo()
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
		native_song.stop()
		native_stinger.stop()
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
	recoil_ms = -100000.0
	break_ms = -100000.0
	guard_ms = -100000.0
	finished_ms = -100000.0
	feedback = ""
	feedback_color = GOLD
	won = false
	effects.clear()
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


func _action() -> void:
	if phase == Phase.PLAYING or phase == Phase.STARTING:
		_reset()
		return
	_reset()
	phase = Phase.STARTING
	if browser:
		browser.start(beat_ms, JSON.stringify(cue_chart))
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
		for chart in Orders.ATTACKS:
			group.append(Orders.Attempt.new(chart, beat_ms))
		attack_orders.append(group)
		guard_orders.append(Orders.Attempt.new(Orders.GUARDS[cycle], beat_ms))
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
		_judge_strike("", input_ms)
	queue_redraw()


func _judge_strike(lane: String, input_ms: float) -> void:
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
		_play_order(lane, relative, attack_orders[cycle], false)
	elif active_bar == Orders.Bar.GUARD:
		_play_order(lane, relative, [guard_orders[cycle]], true)


func _play_order(lane: String, relative: float, attempts: Array, defense: bool) -> void:
	var best := INF
	for attempt: Orders.Attempt in attempts:
		var offset := attempt.accept(lane, relative)
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
	var offset_label := "  /  %d ms %s" % [absi(roundi(best)), "偏早" if best < 0.0 else "偏晚"]
	if defense:
		guard_ms = _clock()
		_impact("guard", 1.0 if precise else 0.68)
		_react("格挡 " + label + offset_label, BLUE)
	else:
		_push_effect("hit", lane, 1.0 if precise else 0.65)
		_impact("hit", 1.0 if precise else 0.68)
		_react("出招 " + label + offset_label, GOLD)


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
		damage = mini(Orders.BOSS_ARMOR, damage + amount)
		attacks_landed += 1
		var kind: String = Orders.ATTACK_KINDS[index]
		var reward := ""
		if kind == "flurry" and hull < Orders.SHIP_HULL:
			hull += 1
			reward = "  ·  修船 +1"
		elif kind == "break":
			shield = 1
			reward = "  ·  护盾"
		break_ms = _clock()
		_push_effect(kind, KICK, 1.0 if strong else 0.75)
		_impact(kind, 1.0 if strong else 0.78)
		_react(("%s成招  ·  破甲 %d" % [Orders.ATTACK_NAMES[index], amount]) + reward, GOLD)
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
		damage = mini(Orders.BOSS_ARMOR, damage + 2)
		_push_effect("counter", HAT, 1.0)
		_impact("counter")
		_react("反击成功  ·  船体回复" if repairs else "反击成功  ·  破甲 2", BLUE)
		return
	var missing := order.notes.size() - order.hits
	var penalty := mini(3, missing + order.extras)
	var absorbed := mini(shield, penalty)
	shield -= absorbed
	penalty -= absorbed
	hull = maxi(0, hull - penalty)
	if penalty == 0:
		guard_ms = _clock()
		_impact("guard", 0.9)
		_react("护盾挡住了反击", BLUE)
		return
	recoil_ms = _clock()
	_impact("hurt", 0.48 + penalty * 0.17)
	_react("防守失误  ·  船体 -%d" % penalty, SALMON)
	if hull == 0:
		_finish(false)


func _finish(victory: bool) -> void:
	phase = Phase.DONE
	won = victory
	coaching = _coach()
	finished_ms = _clock()
	if browser:
		browser.stop()
	elif native_song:
		native_song.stop()
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


func _push_effect(kind: String, lane: String, strength: float) -> void:
	if effects.size() >= 14:
		effects.pop_front()
	effects.append({"kind": kind, "lane": lane, "start": _clock(), "strength": strength})


func _impact(kind: String, strength: float = 1.0) -> void:
	if browser:
		browser.impact(kind, strength)
	elif native_effects.has(kind):
		if kind in ["win", "lose"]:
			native_stinger.stream = native_effects[kind]
			native_stinger.play()
		else:
			var playback := native_kit.get_stream_playback() as AudioStreamPlaybackPolyphonic
			if playback:
				playback.play_stream(native_effects[kind], 0.0, linear_to_db(maxf(0.05, strength)))


func _setup_native_audio() -> void:
	for lane: String in Orders.LANES:
		native_samples[lane] = _make_drum(lane)
	for kind in ["hit", "power", "flurry", "break", "guard", "counter", "hurt"]:
		var path := "res://audio/impact_%s.wav" % kind
		if ResourceLoader.exists(path, "AudioStream"):
			native_effects[kind] = load(path) as AudioStream
	for kind in ["win", "lose"]:
		var path := "res://music/%s.ogg" % ("victory" if kind == "win" else "defeat")
		if FileAccess.file_exists(path):
			native_effects[kind] = AudioStreamOggVorbis.load_from_file(path)
	native_kit = AudioStreamPlayer.new()
	var poly := AudioStreamPolyphonic.new()
	poly.polyphony = 16
	native_kit.stream = poly
	add_child(native_kit)
	native_kit.play()
	native_stinger = AudioStreamPlayer.new()
	add_child(native_stinger)
	native_song = AudioStreamPlayer.new()
	add_child(native_song)


func _native_track(bpm: int) -> AudioStream:
	if native_tracks.has(bpm):
		return native_tracks[bpm]
	var music := "res://music/battle_slow_native.ogg" if bpm == Orders.PRACTICE_BPM else "res://music/battle_native.ogg"
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
	native_tracks[bpm] = result
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


func _drum_signal(lane: String, t: float) -> float:
	var attack := minf(1.0, t / 0.002)
	match lane:
		KICK: return attack * 0.61 * sin(TAU * (44.0 * t + 3.1 * (1.0 - exp(-37.0 * t)))) * exp(-18.0 * t)
		SNARE: return attack * (0.42 * randf_range(-1.0, 1.0) + 0.17 * sin(TAU * 178.0 * t)) * exp(-29.0 * t)
		HAT: return attack * 0.38 * randf_range(-1.0, 1.0) * sin(TAU * 6480.0 * t) * exp(-72.0 * t)
		_: return attack * 0.49 * sin(TAU * (97.0 * t + 1.45 * (1.0 - exp(-63.0 * t)))) * exp(-18.0 * t)


func _make_drum(lane: String) -> AudioStreamWAV:
	const RATE := 24000
	var samples := PackedFloat32Array()
	samples.resize(int(RATE * 0.27))
	for index in range(samples.size()):
		var t := float(index) / RATE
		samples[index] = _drum_signal(lane, t) * minf(1.0, (samples.size() - index) / 144.0)
	return _wav(samples, RATE)


func _make_track(include_simple_groove: bool, tempo_beat_ms: float) -> AudioStreamWAV:
	const RATE := 24000
	var samples := PackedFloat32Array()
	var beat_samples := tempo_beat_ms / 1000.0 * RATE
	samples.resize(ceili(beat_samples * (4.0 + Orders.BAR_COUNT * 4.0)))
	for beat in range(4):
		var position := roundi(beat * beat_samples)
		var frequency := 1180.0 if beat == 0 else 825.0
		for sample in range(1200):
			var t := float(sample) / RATE
			samples[position + sample] += sin(TAU * frequency * t) * exp(-105.0 * t) * 0.23
	if include_simple_groove:
		for beat in range(4, 4 + Orders.BAR_COUNT * 4, 2):
			var position := roundi(beat * beat_samples)
			var root := float([98.0, 130.81, 82.41, 110.0][((beat - 4) >> 2) % 4])
			for sample in range(8000):
				var t := float(sample) / RATE
				samples[position + sample] += sin(TAU * root * t) * exp(-15.0 * t) * 0.15
	for cue in cue_chart:
		var position := roundi((4.0 + float(cue[0])) * beat_samples)
		for sample in range(6200):
			samples[position + sample] += _drum_signal(String(cue[1]), float(sample) / RATE) * 0.64
	return _wav(samples, RATE)


func _line(text: String, at: Vector2, point_size: int, color: Color = IVORY) -> void:
	draw_string(font, at, text, HORIZONTAL_ALIGNMENT_LEFT, -1, point_size, color)


func _center(text: String, x: float, y: float, point_size: int, color: Color = IVORY) -> void:
	var width := font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, point_size).x
	_line(text, Vector2(x - width / 2.0, y), point_size, color)


func _panel(box: Rect2, fill: Color, edge: Color, radius: int, border := 1) -> void:
	var style_key := "%d/%d/%d/%d" % [fill.to_rgba32(), edge.to_rgba32(), radius, border]
	var style: StyleBoxFlat = panel_styles.get(style_key)
	if not style:
		style = StyleBoxFlat.new()
		style.bg_color = fill
		style.border_color = edge
		style.set_corner_radius_all(radius)
		style.set_border_width_all(border)
		panel_styles[style_key] = style
	draw_style_box(style, box)


func _fallback_art() -> void:
	const SKY := Color("#d99483")
	const SEA := Color("#426276")
	draw_rect(ART, SKY)
	var horizon := ART.position.y + ART.size.y * 0.52
	draw_circle(Vector2(374, horizon - 46), 62, Color("#ffe5aa"), true, -1, true)
	draw_rect(Rect2(ART.position.x, horizon, ART.size.x, ART.end.y - horizon), SEA)
	for index in range(8):
		var y := horizon + index * 20.0
		var from := 74.0 + index * 68.0
		draw_line(Vector2(from, y), Vector2(from + 380.0, y), Color(0.8, 0.87, 0.83, 0.20 - index * 0.018), 2.0, true)
	draw_colored_polygon(PackedVector2Array([
		Vector2(36, ART.end.y), Vector2(36, 356), Vector2(110, 322), Vector2(167, 367),
		Vector2(230, 390), Vector2(328, 451), Vector2(455, ART.end.y),
	]), Color("#243945"))


func _draw_backdrop() -> void:
	if art:
		var source := art.get_size()
		var target_ratio := ART.size.x / ART.size.y
		var src_ratio := source.x / source.y
		var crop := Vector2(source.y * target_ratio, source.y) if src_ratio > target_ratio else Vector2(source.x, source.x / target_ratio)
		draw_texture_rect_region(art, ART, Rect2((source - crop) * Vector2(0.5, 0.42), crop))
	else:
		_fallback_art()
	draw_rect(ART, Color(0.08, 0.10, 0.16, 0.13))
	draw_rect(ART, Color("#50606a"), false, 1.0)


func _paint_ship(at: Vector2, elapsed: float, recoil: float) -> void:
	var bob := sin(elapsed * 0.003) * 3.5
	var offset := Vector2(-recoil * 13.0, bob + recoil * 6.0)
	var origin := at + offset
	draw_circle(origin + Vector2(-36, -42), 22, Color("#ffd491"), true, -1, true)
	draw_circle(origin + Vector2(-25, -45), 4, INK)
	draw_line(origin + Vector2(-51, -60), origin + Vector2(-22, -67), INK, 5.0, true)
	draw_line(origin + Vector2(-41, -63), origin + Vector2(-44, -82), BLUE, 5.0, true)
	_panel(Rect2(origin + Vector2(-40, -33), Vector2(36, 43)), Color("#ed806c"), INK, 12, 3)
	var barrel := Rect2(origin + Vector2(12, -45), Vector2(77, 49))
	_panel(barrel, Color("#8b5239"), INK, 19, 4)
	draw_circle(origin + Vector2(81, -23), 23, GOLD, true, -1, true)
	draw_circle(origin + Vector2(81, -23), 16, Color("#ae6446"), false, 3.0, true)
	draw_circle(origin + Vector2(81, -23), 23, INK, false, 4.0, true)
	var hull_points := PackedVector2Array([
		origin + Vector2(-128, -6), origin + Vector2(108, -8),
		origin + Vector2(84, 26), origin + Vector2(-81, 28),
	])
	draw_colored_polygon(hull_points, Color("#244f75").lerp(SALMON, recoil * 0.64))
	var rim := hull_points.duplicate()
	rim.append(hull_points[0])
	draw_polyline(rim, INK, 5.0, true)
	draw_line(origin + Vector2(-92, 9), origin + Vector2(83, 8), Color("#68c5bc"), 5.0, true)
	for index in range(3):
		draw_circle(origin + Vector2(-34 + index * 34, 16.0), 4.5, GOLD if index < hull else INK)
	draw_line(origin + Vector2(-135, 34), origin + Vector2(76, 34), Color(0.58, 0.90, 0.91, 0.55), 3.0, true)


func _paint_crab(at: Vector2, threat: float, color: Color) -> void:
	var shell := Color("#7453a5")
	var teal := Color("#46c3af").lerp(color, threat * 0.18)
	for side in [-1, 1]:
		for index in range(3):
			var foot := at + Vector2(side * (83.0 + index * 26.0), 35.0 + index * 12.0)
			draw_line(at + Vector2(side * 51, 26.0), foot - Vector2(side * 14, 10), INK, 17.0, true)
			draw_line(foot - Vector2(side * 14, 10), foot, teal.darkened(0.25), 11.0, true)
		var claw := at + Vector2(side * (103.0 + threat * 20.0), -27.0 - threat * 26.0)
		draw_line(at + Vector2(side * 63, 15.0), claw + Vector2(0.0, 11.0), INK, 29.0, true)
		_panel(Rect2(claw - Vector2(39, 32), Vector2(77, 60)), teal, INK, 27, 5)
		draw_colored_polygon(PackedVector2Array([
			claw + Vector2(side * 39, -11), claw + Vector2(side * 55, -17), claw + Vector2(side * 28, 13),
		]), INK)
	_panel(Rect2(at - Vector2(76, 113), Vector2(152, 142)), shell, INK, 58, 5)
	_panel(Rect2(at - Vector2(105, 15), Vector2(210, 72)), teal, INK, 34, 5)
	_panel(Rect2(at - Vector2(79, 48), Vector2(158, 38)), shell.lightened(0.19), INK, 12, 4)
	draw_circle(at + Vector2(0, -78), 19.0, GOLD, false, 6.0, true)
	for side in [-1, 1]:
		var eye := at + Vector2(side * 27.0, 0)
		draw_circle(eye, 15.0, IVORY, true, -1, true)
		draw_circle(eye + Vector2(-4, 1), 8.0, INK)
		draw_line(eye + Vector2(-16, -15.0 + side * 4), eye + Vector2(16, -15.0 - side * 4), INK, 6.0, true)
	draw_arc(at + Vector2(0, 47), 19, -PI * 0.9, -PI * 0.1, 16, INK, 5, true)


func _draw_battle(elapsed: float) -> void:
	if phase == Phase.DONE and won and victory_atlas:
		var progress := clampf((now_ms - finished_ms) / VICTORY_MS, 0.0, 1.0)
		var frame := mini(15, floori(progress * 16))
		var cell := victory_atlas.get_size() / 4.0
		# Fill the stage with a centered cut of each widescreen frame; retain
		# the live HUD and leave replay available throughout the musical cadence.
		var cropped := Vector2(cell.x, cell.x * ART.size.y / ART.size.x)
		var top_left := Vector2(frame % 4, frame >> 2) * cell + (cell - cropped) * 0.5
		draw_texture_rect_region(victory_atlas, ART, Rect2(top_left, cropped))
		return
	var cue_strength := 0.0
	var cue_color := GOLD
	if phase == Phase.PLAYING:
		for cue in cue_chart:
			var age := elapsed - float(cue[0]) * beat_ms
			if age >= 0.0 and age < 245.0:
				var pulse := (1.0 - age / 245.0) ** 2
				if pulse > cue_strength:
					cue_strength = pulse
					cue_color = LANE_COLORS[cue[1]]
	var shatter := 0.0
	if phase == Phase.DONE and won:
		shatter = clampf((now_ms - finished_ms) / 940.0, 0.0, 1.0)
	var armor_impact := clampf(1.0 - (now_ms - break_ms) / 520.0, 0.0, 1.0)
	var retaliation := (now_ms - recoil_ms) / 430.0
	var recoil := sin(retaliation * PI) if retaliation >= 0.0 and retaliation < 1.0 else 0.0
	var ship := Vector2(304.0, 401.0) if art else Vector2(242.0, 396.0)
	var enemy := Vector2(854.0 + armor_impact * 19.0 + shatter * 95.0, 330.0 - cue_strength * 13.0 + shatter * 23.0)
	if cue_strength > 0.0:
		draw_circle(enemy, 93.0, Color(cue_color, cue_strength * 0.15), true, -1, true)
		draw_circle(enemy, 97.0 + cue_strength * 12.0, Color(cue_color, cue_strength * 0.84), false, 4.0, true)
	if not art:
		_paint_ship(ship, elapsed, recoil)
	_draw_active_boss(enemy, elapsed, cue_strength, cue_color, armor_impact, shatter)
	for effect in effects:
		var age := now_ms - float(effect.start)
		if age < 0.0 or age > 650.0:
			continue
		_draw_attack(ship, enemy, effect, age)
	var guard := (now_ms - guard_ms) / 320.0
	if guard >= 0.0 and guard < 1.0:
		var shield := ship + Vector2(75, -26)
		draw_arc(shield, 43.0 + guard * 28.0, -1.24, 1.24, 25, Color(BLUE, 1.0 - guard), 7.0, true)
		draw_arc(shield, 53.0 + guard * 31.0, -1.1, 1.1, 24, Color(IVORY, 0.72 * (1.0 - guard)), 3.0, true)
	if retaliation >= 0.0 and retaliation < 1.0:
		var from := enemy + Vector2(-85.0, 22.0)
		var target := ship + Vector2(73.0, -13.0)
		var shot := from.lerp(target, ease(retaliation, 1.65))
		draw_circle(shot, 14.0 + (1.0 - retaliation) * 13.0, Color("#ff6b64"), false, 5.0, true)
		draw_line(shot, shot + Vector2(58, -5), Color(SALMON, 0.92), 7.0, true)
		if retaliation > 0.62:
			_sparks(target, (retaliation - 0.62) / 0.38, SALMON, 11, 92.0)
	if phase == Phase.DONE and won and shatter < 1.0:
		_sparks(enemy, shatter, GOLD, 18, 170.0)


func _draw_active_boss(enemy: Vector2, elapsed: float, cue: float, cue_color: Color, impact: float, retreat: float) -> void:
	var height := 264.0 + cue * 14.0 - retreat * 45.0
	var width := height * 1.5
	var tint := Color.WHITE.lerp(Color("#fff0a0"), impact * 0.82)
	tint.a = 1.0 - retreat * 0.82
	var atlas_progress := _slam_progress(elapsed)
	var target := Rect2(enemy.x - width / 2.0, enemy.y - height * 0.61, width, height)
	if burst_atlas and atlas_progress >= 0.0 and atlas_progress < 1.0:
		var index := mini(15, floori(atlas_progress * 16.0))
		var frame_size := burst_atlas.get_size() / 4.0
		var source := Rect2(Vector2(index % 4, index >> 2) * frame_size, frame_size)
		var aligned := Rect2(target.position - target.size * Vector2(0.348, 0.312), target.size * Vector2(1.674, 1.667))
		draw_texture_rect_region(burst_atlas, aligned, source, tint)
	elif boss:
		draw_texture_rect(boss, target, false, tint)
	else:
		_paint_crab(enemy, cue, cue_color)


func _slam_progress(elapsed: float) -> float:
	if phase != Phase.PLAYING or elapsed < 0.0:
		return -1.0
	var cycle := clampi(floori(elapsed / (4.0 * bar_ms)), 0, 3)
	var first_step := int(Orders.GUARDS[cycle][0][0])
	var impact_beat := cycle * 16.0 + 12.0 + first_step / 4.0
	# Frame eight is paced onto the score so the asset never becomes a clock.
	return (elapsed - impact_beat * beat_ms + beat_ms / 2.0) / beat_ms


func _draw_attack(ship: Vector2, enemy: Vector2, effect: Dictionary, age: float) -> void:
	var kind: String = effect.kind
	var lane: String = effect.lane
	var strength: float = effect.strength
	var flight := 175.0 if kind == "hit" else 320.0
	var progress := age / flight
	var energy: Color = LANE_COLORS[lane] if kind == "hit" else GOLD
	match kind:
		"flurry": energy = BLUE
		"break": energy = Color("#e4a3ff")
		"counter": energy = Color("#bcffe4")
	var source := ship + Vector2(82.0, -24.0)
	var target := enemy + Vector2(-80.0, 13.0)
	if progress < 1.0:
		var at := source.lerp(target, ease(progress, 1.42))
		var opacity := minf(1.0, 0.62 + strength * 0.42)
		match kind:
			"power":
				for wave in range(4):
					draw_arc(at - Vector2(wave * 25.0, 0), 34.0 + progress * 41.0, -1.14, 1.14, 24, Color(energy, opacity - wave * 0.16), 9.0 - wave * 1.35, true)
			"flurry":
				for shot in range(6):
					var dart := at + Vector2(-21.0 * shot, float(shot % 3 - 1) * 26.0)
					draw_line(dart - Vector2(37, 0), dart, Color(energy, 0.94 - shot * 0.11), 6.0, true)
					draw_circle(dart, 4.0, IVORY, true, -1, true)
			"break":
				for side in [-1, 1]:
					var aim := at + Vector2(0, side * sin(progress * PI) * 64.0)
					_diamond(aim, 21.0 + progress * 12.0, Color(energy, 0.84), 5.0)
			"counter":
				draw_line(at - Vector2(86, 0), at, Color(energy, 0.50), 19.0, true)
				_diamond(at, 24.0, IVORY, 5.0)
			_:
				draw_line(at - Vector2(37, 0), at, Color(energy, 0.72), 5.0, true)
				draw_circle(at, 6.0, energy, true, -1, true)
	elif progress < 1.7:
		var scatter := (progress - 1.0) / 0.7
		_sparks(target, scatter, energy, 6 if kind == "hit" else 13, 72.0 if kind == "hit" else 123.0)
		if kind != "hit":
			draw_circle(target, 28.0 + scatter * 82.0, Color(energy, (1.0 - scatter) * 0.84), false, 6.0, true)


func _diamond(point: Vector2, radius: float, ink: Color, width: float) -> void:
	var outline := PackedVector2Array([
		point - Vector2(0, radius), point + Vector2(radius * 1.35, 0), point + Vector2(0, radius),
		point - Vector2(radius * 1.35, 0), point - Vector2(0, radius),
	])
	draw_polyline(outline, ink, width, true)


func _sparks(point: Vector2, progress: float, ink: Color, count: int, radius: float) -> void:
	var growth := 1.0 - (1.0 - progress) ** 2
	for index in range(count):
		var ray := Vector2.from_angle(index * TAU / count)
		var tip := point + ray * (16.0 + growth * radius * (0.64 if index % 2 else 1.0))
		draw_line(tip, tip + ray * (5.0 + (1.0 - progress) * 17.0), Color(ink, 1.0 - progress), 4.0, true)


func _draw_transport() -> void:
	var changing := phase != Phase.PLAYING and phase != Phase.STARTING
	_panel(SPEED_BUTTON, Color("#223445"), Color("#526c82") if changing else Color("#2f3e4b"), 9)
	var speed_label := "%d BPM  /  B" % tempo
	_center(speed_label, SPEED_BUTTON.get_center().x, 71.0, 15, GOLD if changing else MUTED)
	var bar_status := "连接 MIDI"
	match midi:
		"connected": bar_status = "MIDI 已连接"
		"waiting": bar_status = "等待 MIDI 设备"
		"unsupported": bar_status = "MIDI 不可用"
		"denied": bar_status = "MIDI 授权失败"
	_panel(MIDI_BUTTON, Color("#1e2a36"), Color("#435560"), 9)
	_center(bar_status, MIDI_BUTTON.get_center().x, 71.0, 17, BLUE if midi == "connected" else MUTED)
	var display := "开始  /  空格"
	if phase == Phase.PLAYING or phase == Phase.STARTING:
		display = "结束  /  空格"
	elif phase == Phase.DONE:
		display = "再试  /  空格"
	_panel(ACTION_BUTTON, GOLD, GOLD, 9)
	_center(display, ACTION_BUTTON.get_center().x, 71.0, 18, INK)


func _draw_pad(lane: String) -> void:
	var box: Rect2 = LANE_PADS[lane]
	var ink: Color = LANE_COLORS[lane]
	var clicked := clampf(1.0 - (now_ms - pad_hits[lane]) / 145.0, 0.0, 1.0)
	_panel(box, Color("#253544"), ink.darkened(0.52), 13, 2)
	if clicked > 0.0:
		draw_rect(box.grow(-4.0), Color(ink, clicked * 0.58))
	draw_line(box.position + Vector2(12, 13), box.position + Vector2(12, 64), ink, 4.0, true)
	var icon := box.position + Vector2(45.0, 38.0)
	if lane == HAT:
		draw_arc(icon + Vector2(0, 4), 17.0, -PI, 0, 16, ink, 3.0, true)
		draw_line(icon + Vector2(-19, 5), icon + Vector2(19, 5), ink, 3.0, true)
		draw_line(icon + Vector2(0, 5), icon + Vector2(0, 18), ink, 3.0, true)
	else:
		draw_circle(icon, 18.0, ink, false, 3.0, true)
		draw_circle(icon, 8.0, ink, false, 2.0, true)
		if lane == SNARE:
			draw_line(icon + Vector2(-14, -14), icon + Vector2(16, -26), ink, 3.0, true)
	_line(LANE_NAMES[lane], box.position + Vector2(77.0, 48.0), 27)
	var key_rect := Rect2(box.end.x - 60, box.position.y + 17, 39, 43)
	_panel(key_rect, INK, ink.darkened(0.35), 6)
	_center(LANE_KEYS[lane], key_rect.get_center().x, key_rect.get_center().y + 7, 21, ink)


func _draw_status(elapsed: float, bar: int) -> void:
	var left := STATUS.position.x + 16.0
	var title := "迎击轰壳蟹"
	var subtitle := "用真实架子鼓律动出招。"
	var detail := "初学可切换到 72 BPM。"
	var tint := GOLD
	if phase == Phase.STARTING:
		title = "准备音频"
	elif phase == Phase.PLAYING:
		var cycle := bar >> 2
		if elapsed < 0.0:
			title = "四拍预备"
			subtitle = str(clampi(ceili(-elapsed / beat_ms), 1, 4))
			detail = "预备结束后，先听首领的动作。"
		else:
			match bar % 4:
				Orders.Bar.SCOUT:
					title = "侦察示范"
					subtitle = "弱点建议：%s" % Orders.ATTACK_NAMES[Orders.RECOMMENDED[cycle]]
					detail = "听示范，下一小节可打任意一式。"
					tint = BLUE
				Orders.Bar.ATTACK:
					title = "自由出招"
					subtitle = "本轮弱点：%s" % Orders.ATTACK_NAMES[Orders.RECOMMENDED[cycle]]
					detail = "连射修船，碎浪得盾。只打一行。"
					tint = GOLD
				Orders.Bar.LISTEN:
					title = "听首领出招"
					subtitle = Orders.GUARD_NAMES[cycle]
					detail = Orders.GUARD_GUIDES[cycle]
					tint = SALMON
				Orders.Bar.GUARD:
					title = "跟拍防守"
					subtitle = Orders.GUARD_NAMES[cycle]
					detail = Orders.GUARD_GUIDES[cycle]
					tint = BLUE
			_line("第 %d / 16 小节" % [bar + 1], Vector2(STATUS.end.x - 104.0, 148), 13, MUTED)
	elif phase == Phase.DONE:
		title = "击退轰壳蟹" if won else ("鼓船受损" if hull == 0 else "首领仍有护甲")
		tint = GOLD if won else SALMON
		subtitle = "破甲 %d / %d  ·  精准 %d" % [damage, Orders.BOSS_ARMOR, perfect]
		detail = "成招 %d  ·  反击 %d  ·  漏击 %d  ·  多击 %d" % [attacks_landed, counters, missed, extras]
	if not error_text.is_empty():
		subtitle = error_text
	_line(title, Vector2(left, 174), 28, tint)
	_line(subtitle, Vector2(left, 205), 17)
	if now_ms - latest < 1020.0 and phase == Phase.PLAYING and not feedback.is_empty():
		_line(feedback, Vector2(left, 238), 16, feedback_color)
	elif phase == Phase.DONE:
		_line(detail, Vector2(left, 228), 13, MUTED)
		_line(coaching, Vector2(left, 248), 14, GOLD)
	else:
		_line(detail, Vector2(left, 238), 14, MUTED)


func _draw_health() -> void:
	_panel(Rect2(56, 126, 305, 60), Color("#183349"), Color("#658798"), 11)
	_line("船体", Vector2(70, 151), 17)
	_line("%d / %d" % [hull, Orders.SHIP_HULL], Vector2(266, 151), 16, BLUE)
	if shield > 0:
		_line("护盾", Vector2(136, 151), 15, GOLD)
	for index in range(Orders.SHIP_HULL):
		var box := Rect2(72 + index * 34, 161, 29, 10)
		_panel(box, BLUE if index < hull else INK, BLUE.darkened(0.3), 3)
	_panel(Rect2(758, 126, 338, 60), Color("#322137"), Color("#815872"), 11)
	_line("首领护甲", Vector2(772, 151), 17)
	_line("%d / %d" % [Orders.BOSS_ARMOR - damage, Orders.BOSS_ARMOR], Vector2(1017, 151), 16, SALMON)
	for index in range(Orders.BOSS_ARMOR):
		var x := 772.0 + index * 11.0
		var filled := index < Orders.BOSS_ARMOR - damage
		draw_rect(Rect2(x, 162, 9, 9), SALMON if filled else INK)


func _draw_score(elapsed: float, bar: int) -> void:
	const CELL := 57.0
	const LEFT := 196.0
	const BOTTOM := 587.0
	var active := phase == Phase.PLAYING and elapsed >= 0.0
	var context := bar % 4 if active else Orders.Bar.ATTACK
	var cycle := bar >> 2
	var active_step := clampi(floori((elapsed - bar * bar_ms) / (beat_ms * 0.25)), 0, 15) if active else -1
	_panel(GRID, Color("#172638"), Color("#4d6177"), 11)
	_line("鼓点指令", Vector2(55, 480), 19)
	for step in range(16):
		var quarter := step % 4 == 0
		var x := LEFT + CELL * step
		if quarter:
			draw_line(Vector2(x - 4, 460), Vector2(x - 4, BOTTOM), Color("#3d536e"), 2.0, true)
		if step == active_step:
			draw_rect(Rect2(x - 2, 459, CELL - 3, BOTTOM - 458), Color(0.38, 0.68, 0.82, 0.19))
		var label: String = str((step >> 2) + 1) if quarter else ["", "e", "&", "a"][step % 4]
		_center(label, x + CELL * 0.5, 478.0, 16, IVORY if quarter or step == active_step else MUTED)
	if context in [Orders.Bar.ATTACK, Orders.Bar.SCOUT]:
		for index in range(Orders.ATTACKS.size()):
			var state: Orders.Attempt = attack_orders[cycle][index] if active and context == Orders.Bar.ATTACK else null
			var row_y := 504.0 + index * 31.0
			var suggested: bool = active and index == Orders.RECOMMENDED[cycle]
			var label: String = Orders.ATTACK_NAMES[index]
			if suggested:
				label += "★"
			var cue_row := context == Orders.Bar.SCOUT and suggested
			_draw_order_row(Orders.ATTACKS[index], label, row_y, LEFT, CELL, state, active_step, cue_row, suggested)
	else:
		var state := guard_orders[cycle] if context == Orders.Bar.GUARD else null
		_draw_order_row(Orders.GUARDS[cycle], "防守谱", 519, LEFT, CELL, state, active_step, context == Orders.Bar.LISTEN, false, Orders.GUARD_HANDS[cycle])
		var reads := "同列为合击，空格不打。"
		if state:
			reads = "%d / %d 命中  ·  多击 %d" % [state.hits, state.notes.size(), state.extras]
		_line(reads, Vector2(55, 571), 16, BLUE.lightened(0.15))
		_line("R 右手，L 左手。按鼓位和时机判定。", Vector2(LEFT + 99, 571), 16, MUTED)


func _draw_order_row(
	chart: Array, label: String, y: float, left: float, width: float,
	state: Orders.Attempt, current_step: int, is_preview: bool, suggested: bool = false, hands: String = ""
) -> void:
	_line(label, Vector2(55, y + 5.0), 17, GOLD if suggested else IVORY)
	draw_line(Vector2(left + 1.0, y + 15.0), Vector2(GRID.end.x - 12.0, y + 15.0), Color("#294156"), 1.0)
	var previous := -1
	var count := 0
	for index in range(chart.size()):
		var step := int(chart[index][0])
		if step != previous:
			previous = step
			count = 0
		var lane := String(chart[index][1])
		var lit := is_preview and current_step == step
		var hit := state.filled(index) if state else false
		var ink: Color = LANE_COLORS[lane]
		var x := left + width * step + width / 2.0
		if index + 1 < chart.size() and int(chart[index + 1][0]) == step:
			x -= 13.3
		if count > 0:
			x += 13.3
		var expired := state and current_step > step + 1 and not hit
		var dot := Vector2(x, y - 1)
		draw_circle(dot, 12.0, ink if lit or hit else ink.darkened(0.69), true, -1.0, true)
		if not lit and not hit:
			draw_circle(dot, 12.0, Color(ink, 0.35 if expired else 0.88), false, 1.6, true)
		_center(LANE_GLYPHS[lane], x, y + 5.0, 16, INK if lit or hit else IVORY)
		if index < hands.length() and hands[index] != " ":
			_center(hands[index], x, y + 34.0, 17, BLUE if hands[index] == "R" else GOLD)
		count += 1


func _guide_visible() -> bool:
	return phase == Phase.IDLE or (phase == Phase.DONE and now_ms - finished_ms >= VICTORY_MS)


func _draw() -> void:
	draw_rect(Rect2(0, 0, 1152, 720), INK)
	_line("潮汐鼓港", Vector2(36, 66), 36)
	_line("鼓浪迎击    /    %d BPM    /    4/4" % tempo, Vector2(39, 91), 14, GOLD)
	if not midi_readout.is_empty():
		_line(midi_readout, Vector2(278, 70), 17, BLUE)
	_draw_transport()
	_draw_backdrop()
	var elapsed := now_ms - anchor_ms if phase == Phase.PLAYING else 0.0
	var bar := clampi(floori(elapsed / bar_ms), 0, Orders.BAR_COUNT - 1)
	_draw_battle(elapsed)
	_panel(STATUS, Color("#12212c").darkened(0.16) * Color(1, 1, 1, 0.94), Color("#4b5960"), 13)
	_draw_status(elapsed, bar)
	_draw_health()
	var show_guide := _guide_visible()
	if browser and guide_link_visible != show_guide:
		browser.setGuideVisible(show_guide)
		guide_link_visible = show_guide
	if show_guide:
		_panel(GUIDE_BUTTON, Color("#173b47"), BLUE, 9)
		_center("查看七张练习谱", GUIDE_BUTTON.get_center().x, GUIDE_BUTTON.get_center().y + 8.0, 22, IVORY)
	_draw_score(elapsed, bar)
	for lane: String in Orders.LANES:
		_draw_pad(lane)
	_line("D / F / J / K 或点按鼓垫    ·    M 连接罗兰电子鼓", Vector2(36, 705), 15, MUTED)
