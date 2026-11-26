extends RefCounted
## Install the same score and effect assets used by the native game into Web Audio.
## This runs once during scene setup, outside the strike callback.
static func install(browser: JavaScriptObject) -> void:
	for part in ["battle", "battle_slow", "victory", "defeat"]:
		var bytes := FileAccess.get_file_as_bytes("res://music/%s.ogg" % part)
		if not bytes.is_empty():
			browser.setClip(part, Marshalls.raw_to_base64(bytes))
	for effect in ["hit", "power", "flurry", "break", "guard", "counter", "hurt"]:
		var sample := load("res://audio/impact_%s.wav" % effect) as AudioStreamWAV
		if sample and sample.format == AudioStreamWAV.FORMAT_16_BITS and not sample.stereo:
			browser.setPcm(effect, Marshalls.raw_to_base64(sample.data), sample.mix_rate)
