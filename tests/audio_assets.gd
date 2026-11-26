extends SceneTree
const Sound = preload("res://scripts/harbor_sfx.gd")
const Harbor = preload("res://scripts/harbor.gd")

# Check both playback paths using the same imported Godot resources as the battle.
func _initialize() -> void:
	call_deferred("_check_audio")

func _check_audio() -> void:
	var errors: Array[String] = []
	for lane in ["kick", "snare", "hat", "tom", "cross", "click"]:
		var kit := load("res://audio/kit_%s.wav" % lane) as AudioStreamWAV
		if not kit or kit.format != AudioStreamWAV.FORMAT_16_BITS or kit.stereo or kit.get_length() < 0.025:
			errors.append("Missing real mono drum sample: " + lane)
	for item in [["boss-burst", Vector2i(1536, 1024)], ["finale", Vector2i(1536, 864)]]:
		var atlas := load("res://art/vfx/%s.webp" % item[0]) as Texture2D
		if not atlas or Vector2i(atlas.get_size()) != item[1]:
			errors.append("Missing or mismatched 4×4 animation grid: " + String(item[0]))
	for name: String in ["victory", "defeat"]:
		var music := AudioStreamOggVorbis.load_from_file("res://music/%s.ogg" % name)
		var length := 1.85 if name == "victory" else 1.72
		if not music or absf(music.get_length() - length) > 0.02:
			errors.append("Unexpected score length: " + name)
	for name: String in Sound.SAMPLES:
		var fx := load("res://audio/impact_%s.wav" % name) as AudioStreamWAV
		if not fx or fx.format != AudioStreamWAV.FORMAT_16_BITS or fx.stereo or fx.data.is_empty() or fx.mix_rate != 44100:
			errors.append("Web PCM must be nonempty 44.1 kHz 16-bit mono: " + name)
			continue
		var data := fx.data
		var peak := 0
		for offset in range(0, data.size(), 2):
			peak = maxi(peak, absi(data.decode_s16(offset)))
		if peak < 10000 or peak > 24000 or data.decode_s16(0) != 0 or data.decode_s16(data.size() - 2) != 0:
			errors.append("Impact peak/headroom or edge-declick is invalid: " + name)
		if fx.get_length() > 0.44 or (name.begins_with("hit") and fx.get_length() > 0.11):
			errors.append("Impact tail is too long to preserve drum transients: " + name)
	for name: String in Sound.VOICES:
		var voice := load("res://voice/voice_%s.wav" % name) as AudioStreamWAV
		if not voice or voice.format != AudioStreamWAV.FORMAT_16_BITS or voice.stereo or voice.data.is_empty():
			errors.append("Crew line must be playable mono PCM on both engines: " + name)
		elif voice.get_length() > (1.35 if name == "win" else Sound.VOICE_GAP_MS * 0.001):
			errors.append("Crew line must fit its mix window: " + name)
	var schedule := Sound.scheduled_effects()
	if schedule.size() != 9 or schedule[0] != ["start", -4.0, 0.056]:
		errors.append("Battle needs one start cue and four windup/slam pairs")
	else:
		for cycle in range(4):
			var beat := cycle * 16.0 + 12.0
			if schedule[cycle * 2 + 1] != ["windup", beat - 0.145, 0.0] or schedule[cycle * 2 + 2] != ["slam", beat, 0.036]:
				errors.append("Fight cue is outside the intended guard window")
	var harbor := Harbor.new()
	harbor.native_effects["slam"] = load("res://audio/impact_slam.wav") as AudioStreamWAV
	var mixed := PackedFloat32Array()
	mixed.resize(12000)
	harbor._mix_native_effect(mixed, 24000, 864, "slam")
	if mixed[863] != 0.0 or mixed[960] == 0.0:
		errors.append("Native impact staging must resample and preserve the 36 ms training-drum lead")
	_check_crew(harbor, errors)
	harbor.free()
	for arrangement: String in ["battle", "battle_space", "battle_shuffle"]:
		for bpm: int in [72, 96]:
			var file := arrangement + ("_slow" if bpm == 72 else "")
			var web := AudioStreamOggVorbis.load_from_file("res://music/%s.ogg" % file)
			var native_music := load("res://music/%s_native.ogg" % file) as AudioStreamOggVorbis
			if not web or absf(web.get_length() - 64.0 * 60.0 / bpm) > 0.02:
				errors.append("Wrong Web score duration: " + file)
			if not native_music or absf(native_music.get_length() - 68.0 * 60.0 / bpm) > 0.02:
				errors.append("Missing four-beat native preroll: " + file)
	for issue in errors:
		push_error(issue)
	print("Music and impacts: %d errors" % errors.size())
	quit(0 if errors.is_empty() else 1)


func _check_crew(harbor: Node2D, errors: Array[String]) -> void:
	var anchor := 3000.0
	harbor._begin(anchor)
	harbor._update_crew(anchor - harbor.beat_ms * 2.0)
	if harbor.crew_call != -1:
		errors.append("Crew castoff can only begin between count-in clicks three and four")
	harbor._update_crew(anchor - harbor.beat_ms * 1.6)
	var stamp: float = harbor.crew_call_ms
	harbor._update_crew(anchor - harbor.beat_ms * 1.3)
	if harbor.crew_call != 0 or harbor.crew_call_ms != stamp:
		errors.append("Crew castoff must play exactly once before the final count-in click")
	harbor._queue_crew(1)
	harbor.cue_chart = [[8.0, "snare", 114]]
	harbor._update_crew(anchor + harbor.beat_ms * 8.0)
	if harbor.crew_call != 0:
		errors.append("A character call must leave the demonstrated drum hits exposed")
	harbor._update_crew(anchor + harbor.beat_ms * 8.3)
	if harbor.crew_call != 1:
		errors.append("The queued character call must play in the next clear window")
	harbor._update_crew(anchor + harbor.beat_ms * 38.8)
	if harbor.crew_call != 2:
		errors.append("The third cycle needs a warning prior to the dense listen phrase")
	harbor.damage = 16
	harbor._armor_sound(13)
	harbor._update_crew(anchor + harbor.beat_ms * 49.0)
	if harbor.crew_call != 3:
		errors.append("Half armor must queue the push call once")
	harbor._finish(true)
	harbor._update_crew(harbor.finished_ms + 781.0)
	if harbor.crew_call != 4 or harbor.crew_played != 31:
		errors.append("Victory call must start after the stinger entrance")
	harbor._reset()
	if harbor.crew_call != -1 or harbor.crew_played != 0 or not harbor.crew_pending.is_empty():
		errors.append("Retry must release all crew audio and clear calls")
