extends SceneTree

const Harbor = preload("res://scripts/harbor.gd")
const Layout = preload("res://scripts/harbor_layout.gd")
var failures := 0

func check(condition: bool, message: String) -> void:
	if not condition:
		push_error(message)
		failures += 1

func pad(scene: Node, button: JoyButton) -> void:
	var event := InputEventJoypadButton.new()
	event.button_index = button
	event.pressed = true
	scene._input(event)

func _initialize() -> void:
	var harbor := Harbor.new()
	for size: Vector2 in [Vector2(1152, 720), Vector2(560, 1212), Vector2(1480, 640)]:
		harbor.layout = Layout.build(size, Vector4(30, 16, 12, 20), 0.75)
		for key in ["action", "midi", "tempo", "course", "guide", "score", "armor", "hull"]:
			check(harbor.layout.safe.encloses(harbor.layout[key]), "Unsafe control: " + key)
		for rect: Rect2 in harbor.layout.pads.values():
			check(harbor.layout.safe.encloses(rect) and rect.size.y * 0.75 >= 43.9, "Unsafe or small pad")
		harbor.ui_focus = ""
		pad(harbor, JOY_BUTTON_DPAD_LEFT)
		check(harbor.ui_focus == "action", "First gamepad focus")
		pad(harbor, JOY_BUTTON_DPAD_LEFT)
		check(harbor.ui_focus == "midi", "Gamepad moves left to MIDI")
		pad(harbor, JOY_BUTTON_DPAD_LEFT)
		check(harbor.ui_focus == "tempo", "Gamepad moves left to tempo")
		var old := harbor.tempo
		pad(harbor, JOY_BUTTON_A)
		check(harbor.tempo != old, "Gamepad activates focused tempo")
	harbor.free()
	print("Harbor layout and gamepad navigation: %d errors" % failures)
	quit(0 if failures == 0 else 1)
