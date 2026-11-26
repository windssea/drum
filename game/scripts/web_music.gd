extends RefCounted
## Install the same score and effect assets used by the native game into Web Audio.
## This runs once during scene setup, outside the strike callback.
const Sound = preload("res://scripts/harbor_sfx.gd")

static func install(browser: JavaScriptObject) -> void:
	browser.configureImpacts(JSON.stringify(Sound.web_profile()))
	for lane: String in ["kick", "snare", "hat", "tom", "cross", "click"]:
		var name := "kit_" + lane
		var sample := load("res://audio/%s.wav" % name) as AudioStreamWAV
		if sample:
			browser.setPcm(name, Marshalls.raw_to_base64(sample.data), sample.mix_rate)
	for part in [
		"battle", "battle_slow", "battle_space", "battle_space_slow",
		"battle_shuffle", "battle_shuffle_slow", "victory", "defeat"
	]:
		var bytes := FileAccess.get_file_as_bytes("res://music/%s.ogg" % part)
		if not bytes.is_empty():
			browser.setClip(part, Marshalls.raw_to_base64(bytes))
	for effect in Sound.SAMPLES:
		var sample := load("res://audio/impact_%s.wav" % effect) as AudioStreamWAV
		if sample and sample.format == AudioStreamWAV.FORMAT_16_BITS and not sample.stereo:
			browser.setPcm(effect, Marshalls.raw_to_base64(sample.data), sample.mix_rate)
	for voice in Sound.VOICES:
		var path := "res://voice/voice_%s.wav" % voice
		if not ResourceLoader.exists(path, "AudioStream"):
			continue
		var sample := load(path) as AudioStreamWAV
		if sample and sample.format == AudioStreamWAV.FORMAT_16_BITS and not sample.stereo:
			browser.setPcm("voice_" + voice, Marshalls.raw_to_base64(sample.data), sample.mix_rate)
