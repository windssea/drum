extends SceneTree

# Check both playback paths using the same imported Godot resources as the battle.
func _initialize() -> void:
	call_deferred("_check_audio")

func _check_audio() -> void:
	var errors: Array[String] = []
	for item in [["boss-burst", Vector2i(1536, 1024)], ["finale", Vector2i(1536, 864)]]:
		var atlas := load("res://art/vfx/%s.webp" % item[0]) as Texture2D
		if not atlas or Vector2i(atlas.get_size()) != item[1]:
			errors.append("Missing or mismatched 4×4 animation grid: " + String(item[0]))
	for name: String in ["battle", "battle_slow", "victory", "defeat"]:
		var music := AudioStreamOggVorbis.load_from_file("res://music/%s.ogg" % name)
		var length := float({"battle": 40.0, "battle_slow": 160.0 / 3.0, "victory": 1.85, "defeat": 1.72}[name])
		if not music or absf(music.get_length() - length) > 0.02:
			errors.append("Unexpected score length: " + name)
	for name: String in ["hit", "power", "flurry", "break", "guard", "counter", "hurt"]:
		var fx := load("res://audio/impact_%s.wav" % name) as AudioStreamWAV
		if not fx or fx.format != AudioStreamWAV.FORMAT_16_BITS or fx.stereo or fx.data.is_empty():
			errors.append("Web PCM must be nonempty 16-bit mono: " + name)
	for bpm: int in [72, 96]:
		var file := "battle_slow_native" if bpm == 72 else "battle_native"
		var native_music := load("res://music/%s.ogg" % file) as AudioStreamOggVorbis
		if not native_music or absf(native_music.get_length() - 68.0 * 60.0 / bpm) > 0.02:
			errors.append("Missing native score with four-beat preroll at %d BPM" % bpm)
	for issue in errors:
		push_error(issue)
	print("Music and impacts: %d errors" % errors.size())
	quit(0 if errors.is_empty() else 1)
