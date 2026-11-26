extends Node2D

const BEAT_MS := 60000.0 / 84.0
const HIT_MS := 110.0
const PERFECT_MS := 42.0
const KICK := "kick"
const SNARE := "snare"
const CUES := [[1, SNARE], [3, SNARE], [8, KICK], [9, SNARE], [10, KICK], [11, SNARE]]
const ANSWERS := [[5, SNARE], [7, SNARE], [12, KICK], [13, SNARE], [14, KICK], [15, SNARE]]
const KICK_PAD := Rect2(36, 544, 532, 122)
const SNARE_PAD := Rect2(584, 544, 532, 122)
const MIDI_BUTTON := Rect2(700, 40, 219, 50)
const ACTION_BUTTON := Rect2(935, 40, 181, 50)
const ART := Rect2(36, 114, 1080, 407)
const STATUS := Rect2(443, 132, 285, 169)
const GOLD := Color("#ffd98f")
const IVORY := Color("#fff4dc")
const MUTED := Color("#adbcc5")
const BLUE := Color("#92dbe0")
const SALMON := Color("#ffaea0")
const INK := Color("#121922")
const BACKDROP := "res://art/harbor.webp"
const BOSS_ART := "res://art/boss.webp"

enum Phase { IDLE, STARTING, PLAYING, DONE }
enum NoteState { OPEN, HIT, MISSED }

var phase: Phase = Phase.IDLE
var now_ms := 0.0
var anchor_ms := 0.0
var damage := 0
var hull := 3
var perfect := 0
var missed := 0
var extras := 0
var latest := -999.0
var feedback := ""
var feedback_color := GOLD
var midi := "idle"
var error_text := ""
var pad_hits: Dictionary[String, float] = {KICK: -999.0, SNARE: -999.0}
var note_state: Array[int] = []
var art: Texture2D
var boss: Texture2D
var font: Font
var browser: JavaScriptObject
var browser_events: JavaScriptObject
var native_song: AudioStreamPlayer
var native_kit: AudioStreamPlayer
var kick_sample: AudioStreamWAV
var snare_sample: AudioStreamWAV
var launch_ms := -999.0
var recoil_ms := -999.0
var launch_lane := KICK
var finished_ms := -999.0


func _ready() -> void:
	now_ms = _clock()
	font = preload("res://art/HarborHUD.ttf")
	if ResourceLoader.exists(BACKDROP, "Texture2D"):
		art = load(BACKDROP) as Texture2D
	if ResourceLoader.exists(BOSS_ART, "Texture2D"):
		boss = load(BOSS_ART) as Texture2D
	if OS.has_feature("web"):
		JavaScriptBridge.eval(FileAccess.get_file_as_string("res://web/harbor_bridge.js"), true)
		browser = JavaScriptBridge.get_interface("harborBridge")
		if browser:
			browser_events = JavaScriptBridge.create_callback(_browser_event)
			browser.bind(browser_events)
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
		_expire_notes(now_ms)
		if phase == Phase.PLAYING and now_ms - anchor_ms >= 16.0 * BEAT_MS + HIT_MS:
			_finish()
		queue_redraw()
	elif phase == Phase.STARTING or now_ms - maxf(latest, finished_ms) < 960.0:
		queue_redraw()


func _input(event: InputEvent) -> void:
	if OS.has_feature("web"):
		return
	var position: Vector2
	if event is InputEventKey:
		if not event.pressed or event.echo:
			return
		match event.physical_keycode:
			KEY_D: _native_strike(KICK)
			KEY_F: _native_strike(SNARE)
			KEY_M: _connect_native_midi()
			KEY_SPACE: _action()
		return
	if event is InputEventMIDI:
		if event.message == MIDI_MESSAGE_NOTE_ON and event.velocity > 0:
			if event.pitch in [35, 36]:
				_strike(KICK, _clock())
			elif event.pitch in [37, 38, 40]:
				_strike(SNARE, _clock())
		return
	if event is InputEventScreenTouch and event.pressed:
		position = event.position
	elif event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		position = event.position
	else:
		return
	if KICK_PAD.has_point(position):
		_native_strike(KICK)
	elif SNARE_PAD.has_point(position):
		_native_strike(SNARE)
	elif MIDI_BUTTON.has_point(position):
		_connect_native_midi()
	elif ACTION_BUTTON.has_point(position):
		_action()


func _browser_event(args: Array) -> void:
	match String(args[0]):
		"hit": _strike(String(args[1]), float(args[2]))
		"action": _action()
		"round": _begin(float(args[1]))
		"midi":
			midi = String(args[1])
			queue_redraw()
		"interrupted": _reset()
		"audio_unavailable":
			phase = Phase.IDLE
			error_text = "音频未就绪，请再次开始。"
			queue_redraw()


func _reset() -> void:
	if browser:
		browser.stop()
	elif native_song:
		native_song.stop()
	phase = Phase.IDLE
	error_text = ""
	damage = 0
	hull = 3
	perfect = 0
	missed = 0
	extras = 0
	latest = -999.0
	launch_ms = -999.0
	recoil_ms = -999.0
	finished_ms = -999.0
	feedback = ""
	queue_redraw()


func _action() -> void:
	if phase == Phase.PLAYING or phase == Phase.STARTING:
		_reset()
		return
	_reset()
	phase = Phase.STARTING
	if browser:
		browser.start(BEAT_MS, JSON.stringify(CUES))
	elif not OS.has_feature("web"):
		if native_song:
			native_song.play()
		var latency_ms := (AudioServer.get_time_to_next_mix() + AudioServer.get_output_latency()) * 1000.0
		_begin(_clock() + latency_ms + 4.0 * BEAT_MS)
	else:
		phase = Phase.IDLE
		error_text = "浏览器音频无法启动。"
	queue_redraw()


func _begin(start_ms: float) -> void:
	anchor_ms = start_ms
	note_state.assign([NoteState.OPEN, NoteState.OPEN, NoteState.OPEN, NoteState.OPEN, NoteState.OPEN, NoteState.OPEN])
	phase = Phase.PLAYING
	queue_redraw()


func _expire_notes(at_ms: float) -> void:
	for index in range(ANSWERS.size()):
		var target_ms := anchor_ms + float(ANSWERS[index][0]) * BEAT_MS
		# Keep a short grace interval for queued browser callbacks. A callback
		# still must carry a timestamp inside the actual hit window.
		if note_state[index] == NoteState.OPEN and at_ms > target_ms + HIT_MS + 24.0:
			note_state[index] = NoteState.MISSED
			missed += 1
			_retaliate("漏击")
			if phase != Phase.PLAYING:
				return


func _strike(lane: String, input_ms: float) -> void:
	if not pad_hits.has(lane):
		return
	pad_hits[lane] = _clock()
	if phase != Phase.PLAYING or damage == ANSWERS.size():
		latest = pad_hits[lane]
		queue_redraw()
		return
	var elapsed := (input_ms - anchor_ms) / BEAT_MS
	var best := -1
	var offset := INF
	for index in range(ANSWERS.size()):
		if ANSWERS[index][1] != lane or note_state[index] != NoteState.OPEN:
			continue
		var apart := input_ms - anchor_ms - float(ANSWERS[index][0]) * BEAT_MS
		if absf(apart) <= HIT_MS and absf(apart) < absf(offset):
			best = index
			offset = apart
	if best >= 0:
		note_state[best] = NoteState.HIT
		damage += 1
		launch_ms = _clock()
		launch_lane = lane
		if absf(offset) <= PERFECT_MS:
			perfect += 1
		var grade := "精准破甲" if absf(offset) <= PERFECT_MS else "破甲"
		var shift := "  /  %d ms %s" % [absi(roundi(offset)), "偏早" if offset < 0.0 else "偏晚"]
		_react(grade + (shift if absf(offset) >= 1.0 else ""), GOLD)
	elif (elapsed >= 4.0 and elapsed < 8.0) or (elapsed >= 12.0 and elapsed < 16.0):
		extras += 1
		_retaliate("空拍多击")


func _retaliate(message: String) -> void:
	hull = maxi(0, hull - 1)
	recoil_ms = _clock()
	_react(message + " · 船体受损", SALMON)
	if hull == 0:
		_finish()


func _finish() -> void:
	phase = Phase.DONE
	finished_ms = _clock()
	if browser:
		browser.stop()
	elif native_song:
		native_song.stop()
	queue_redraw()


func _react(message: String, color: Color) -> void:
	feedback = message
	feedback_color = color
	latest = _clock()
	queue_redraw()


func _setup_native_audio() -> void:
	kick_sample = _make_drum(true)
	snare_sample = _make_drum(false)
	native_kit = AudioStreamPlayer.new()
	var poly := AudioStreamPolyphonic.new()
	poly.polyphony = 8
	native_kit.stream = poly
	add_child(native_kit)
	native_kit.play()
	native_song = AudioStreamPlayer.new()
	native_song.stream = _make_track()
	add_child(native_song)


func _native_strike(lane: String) -> void:
	var at := _clock()
	if native_kit:
		var kit_playback := native_kit.get_stream_playback() as AudioStreamPlaybackPolyphonic
		if kit_playback:
			kit_playback.play_stream(kick_sample if lane == KICK else snare_sample)
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


func _drum_signal(is_kick: bool, t: float) -> float:
	var attack := minf(1.0, t / 0.002)
	if is_kick:
		return attack * 0.6 * sin(TAU * (44.0 * t + 3.1 * (1.0 - exp(-37.0 * t)))) * exp(-18.0 * t)
	return attack * (0.42 * randf_range(-1.0, 1.0) + 0.17 * sin(TAU * 178.0 * t)) * exp(-29.0 * t)


func _make_drum(is_kick: bool) -> AudioStreamWAV:
	const RATE := 24000
	var samples := PackedFloat32Array()
	samples.resize(int(RATE * 0.27))
	for index in range(samples.size()):
		samples[index] = _drum_signal(is_kick, float(index) / RATE)
	return _wav(samples, RATE)


func _make_track() -> AudioStreamWAV:
	const RATE := 24000
	var samples := PackedFloat32Array()
	var step := BEAT_MS / 1000.0 * RATE
	samples.resize(ceili(step * 20.0))
	for beat in range(20):
		var position := roundi(beat * step)
		var frequency := 1050.0 if beat % 4 == 0 else 810.0
		for sample in range(1200):
			var t := float(sample) / RATE
			samples[position + sample] += sin(TAU * frequency * t) * exp(-105.0 * t) * 0.19
		if beat >= 4 and beat % 2 == 0:
			var root := [98.0, 130.81, 82.41, 110.0][(beat - 4) >> 2] as float
			for sample in range(8000):
				var t := float(sample) / RATE
				samples[position + sample] += sin(TAU * root * t) * exp(-15.0 * t) * 0.15
	for each in CUES:
		var position := roundi((4.0 + float(each[0])) * step)
		for sample in range(6200):
			samples[position + sample] += _drum_signal(each[1] == KICK, float(sample) / RATE)
	return _wav(samples, RATE)


func _line(text: String, at: Vector2, point_size: int, color: Color = IVORY) -> void:
	draw_string(font, at, text, HORIZONTAL_ALIGNMENT_LEFT, -1, point_size, color)


func _center(text: String, x: float, y: float, point_size: int, color: Color = IVORY) -> void:
	var width := font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, point_size).x
	_line(text, Vector2(x - width / 2.0, y), point_size, color)


func _panel(box: Rect2, fill: Color, edge: Color, radius: int, border := 1) -> void:
	var style := StyleBoxFlat.new()
	style.bg_color = fill
	style.border_color = edge
	style.set_corner_radius_all(radius)
	style.set_border_width_all(border)
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
	var cue_strength := 0.0
	var cue_color := GOLD
	if phase == Phase.PLAYING:
		for cue in CUES:
			var age := elapsed - float(cue[0]) * BEAT_MS
			if age >= 0 and age < 410.0:
				cue_strength = (1.0 - age / 410.0) ** 2
				cue_color = GOLD if cue[1] == KICK else BLUE
	var attack := (now_ms - launch_ms) / 290.0
	var retaliation := (now_ms - recoil_ms) / 430.0
	var recoil := 0.0 if retaliation < 0.0 or retaliation >= 1.0 else sin(retaliation * PI)
	var clip := 0.0 if attack < 0.50 or attack >= 1.65 else (1.65 - attack) / 1.15
	var shatter := 0.0
	if phase == Phase.DONE and damage == ANSWERS.size():
		shatter = clampf((now_ms - finished_ms) / 720.0, 0.0, 1.0)
	var ship := Vector2(303.0, 456.0) if art else Vector2(242.0, 447.0)
	var enemy := Vector2(828.0 + clip * 17.0 + shatter * 116.0, 372.0 - cue_strength * 15.0 + shatter * 40.0)
	draw_circle(enemy, 117.0, Color(cue_color, cue_strength * 0.15), true, -1, true)
	draw_circle(enemy, 116.0 + cue_strength * 15.0, Color(cue_color, cue_strength * 0.80), false, 4.0, true)
	if not art:
		_paint_ship(ship, elapsed, recoil)
	if boss:
		var height := 308.0 + cue_strength * 18.0 - shatter * 70.0
		var width := height * boss.get_width() / boss.get_height()
		var tint := Color.WHITE.lerp(Color("#f7dca2"), clip * 0.78)
		tint.a = 1.0 - shatter * 0.62
		draw_texture_rect(boss, Rect2(enemy.x - width / 2.0, enemy.y - height * 0.62, width, height), false, tint)
	else:
		_paint_crab(enemy, cue_strength, cue_color)
	if attack > 0.0 and attack < 1.0:
		var location := (ship + Vector2(83, -29)).lerp(enemy + Vector2(-83, 13), attack)
		var heavy := launch_lane == KICK
		var energy := GOLD if heavy else BLUE
		if heavy:
			for wave in range(3):
				draw_arc(location - Vector2(wave * 30, 0), 18.0 + attack * 19.0, -1.2, 1.2, 16, Color(energy, 0.95 - wave * 0.19), 7.0 - wave * 1.7, true)
		else:
			draw_line(location - Vector2(56, -3), location + Vector2(9, 0), Color(energy, 0.72), 8.0, true)
			draw_circle(location, 8.0, IVORY, true, -1, true)
		if attack < 0.42:
			draw_circle(ship + Vector2(83, -29), 18.0 + attack * 85.0, Color(energy, 1.0 - attack / 0.42), false, 5.0, true)
	if clip > 0.0:
		for index in range(7):
			var angle := index * TAU / 7
			var ray := Vector2.from_angle(angle)
			var center := enemy + Vector2(-37.0, 19.0) + ray * (22.0 + (1.0 - clip) * 74.0)
			draw_line(center, center + ray * 16.0 * clip, Color(GOLD if launch_lane == KICK else BLUE, clip), 4.0, true)
	if retaliation >= 0.0 and retaliation < 1.0:
		var return_shot := (enemy + Vector2(-95.0, 22.0)).lerp(ship + Vector2(75, -13), retaliation)
		draw_circle(return_shot, 13.0 + (1.0 - retaliation) * 11.0, Color("#fc655d"), false, 5.0, true)
		draw_line(return_shot, return_shot + Vector2(43, -4), Color(SALMON, 0.88), 6.0, true)
		if retaliation > 0.62:
			draw_circle(ship + Vector2(70, -13), 22.0 + retaliation * 48.0, Color(SALMON, (1.0 - retaliation) * 2.6), false, 7.0, true)


func _draw_transport() -> void:
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


func _draw_pad(box: Rect2, lane: String, key: String, description: String, ink: Color) -> void:
	var clicked := clampf(1.0 - (now_ms - pad_hits[lane]) / 200.0, 0.0, 1.0)
	var fill := Color("#253544").lerp(ink.darkened(0.22), clicked * 0.75)
	_panel(box, fill, ink.darkened(0.52), 14, 2)
	draw_line(box.position + Vector2(14.0, 20.0), box.position + Vector2(14.0, 101.0), ink, 4.0, true)
	var icon := box.position + Vector2(60, 61)
	draw_circle(icon, 23.0, Color(ink, 0.18), true, -1, true)
	draw_circle(icon, 21.0, ink, false, 3.0, true)
	draw_circle(icon + Vector2(0, -1), 10.0, ink, false, 2.0, true)
	if lane == SNARE:
		draw_line(icon + Vector2(-17, -16), icon + Vector2(18, -31), ink, 3.0, true)
	_line(("军鼓" if lane == SNARE else "底鼓"), box.position + Vector2(101, 57), 33)
	_line(description, box.position + Vector2(103, 87), 17, MUTED)
	var key_rect := Rect2(box.end.x - 80.0, box.position.y + 36.0, 52, 52)
	_panel(key_rect, INK, ink.darkened(0.38), 8)
	_center(key, key_rect.get_center().x, key_rect.get_center().y + 8, 25, ink)


func _draw_status(elapsed: float) -> void:
	var left := STATUS.position.x + 16.0
	var title := "迎击轰壳蟹"
	var subtitle := "先听示威，跟拍还击。"
	var tint := GOLD
	if phase == Phase.IDLE:
		_line("第一轮打军鼓，第二轮加底鼓。", Vector2(left, 245), 16, MUTED)
		_line("打准破甲，失误会损伤船体。", Vector2(left, 276), 16, MUTED)
	elif phase == Phase.STARTING:
		title = "准备音频"
	elif phase == Phase.PLAYING:
		var beat := elapsed / BEAT_MS
		if beat < 0.0:
			title = "四拍预备"
			subtitle = str(clampi(ceili(-beat), 1, 4))
		elif beat >= 16.0:
			title = "战斗结束"
			subtitle = "已打完四小节。"
		else:
			var bar := floori(beat / 4.0)
			var answer := bar % 2 == 1
			title = "跟拍迎击" if answer else "听首领示威"
			tint = GOLD if answer else BLUE
			subtitle = "跟打上一小节的鼓点。" if answer else "听清首领这一小节的鼓点。"
			var step := floori(beat) % 4
			for dot in range(4):
				draw_circle(Vector2(left + 5.0 + dot * 26.0, 239), 5.0, tint if dot == step else Color(0.62, 0.69, 0.72, 0.35), true, -1, true)
			_line("第 %d / 4 小节" % [bar + 1], Vector2(left + 116.0, 244), 15, Color(tint, 0.83))
	elif phase == Phase.DONE:
		title = "击退轰壳蟹" if damage == ANSWERS.size() else ("鼓船受损" if hull == 0 else "突围未成")
		tint = GOLD if damage == ANSWERS.size() else SALMON
		subtitle = "破甲 %d / 6  ·  精准 %d" % [damage, perfect]
		_line("漏击 %d  ·  多击 %d" % [missed, extras], Vector2(left, 255), 16, MUTED)
	if not error_text.is_empty():
		subtitle = error_text
	_line(title, Vector2(left, 179), 31, tint)
	_line(subtitle, Vector2(left, 212), 17)
	if phase == Phase.PLAYING and now_ms - latest < 850.0 and not feedback.is_empty():
		_line(feedback, Vector2(left, 282), 16, feedback_color)


func _draw_health() -> void:
	_panel(Rect2(68, 132, 237, 49), Color("#183349"), Color("#658798"), 11)
	_line("船体", Vector2(87, 164), 20, IVORY)
	for index in range(3):
		var box := Rect2(148 + index * 40, 147, 29, 17)
		_panel(box, BLUE if index < hull else INK, BLUE.darkened(0.3), 4)
	_panel(Rect2(744, 132, 346, 60), Color("#322137"), Color("#815872"), 11)
	_line("首领护甲", Vector2(763, 169), 21, IVORY)
	for index in range(6):
		var box := Rect2(865 + index * 35, 152, 26, 18)
		_panel(box, SALMON if index < ANSWERS.size() - damage else INK, SALMON.darkened(0.3), 4)


func _draw() -> void:
	draw_rect(Rect2(0, 0, 1152, 720), INK)
	_line("潮汐鼓港", Vector2(36, 67), 37)
	_line("鼓浪迎击    /    84 BPM    /    4/4", Vector2(39, 93), 14, GOLD)
	_draw_transport()
	_draw_backdrop()
	var elapsed := now_ms - anchor_ms if phase == Phase.PLAYING else 0.0
	_draw_battle(elapsed)
	_panel(STATUS, Color("#12212c").darkened(0.16) * Color(1, 1, 1, 0.94), Color("#4b5960"), 13)
	_draw_status(elapsed)
	_draw_health()
	_draw_pad(KICK_PAD, KICK, "D", "KICK  /  脚踩", BLUE)
	_draw_pad(SNARE_PAD, SNARE, "F", "SNARE  /  手敲", SALMON)
	_line("D / F 或点按鼓垫    ·    M 连接罗兰电子鼓", Vector2(36, 700), 16, MUTED)
