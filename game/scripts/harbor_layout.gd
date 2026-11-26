extends RefCounted
## Every visible control and hit target uses this same safe-area-relative geometry.

static func build(view: Vector2, insets: Vector4, pixel_scale: float) -> Dictionary:
	var safe := Rect2(insets.x, insets.y, maxf(1.0, view.x - insets.x - insets.z), maxf(1.0, view.y - insets.y - insets.w))
	var narrow := safe.size.x < 800.0
	var portrait := safe.size.y > safe.size.x
	var edge := clampf(safe.size.x * 0.014, 9.0, 21.0)
	var gap := clampf(safe.size.x * 0.006, 4.0, 8.0)
	var finger := maxf(44.0, 44.0 / maxf(0.5, pixel_scale))
	var width := safe.size.x - edge * 2.0
	var left := safe.position.x + edge
	var right := left + width
	var header_height := maxf(finger, 50.0)
	var rail := Rect2(left, safe.position.y + gap, width, header_height)
	var button_w := clampf(width * 0.105, finger + 14.0, 123.0)
	var action_w := clampf(width * 0.117, finger + 24.0, 140.0)
	if narrow:
		button_w = maxf(finger + 14.0, minf(106.0, width * 0.155))
		action_w = maxf(finger + 24.0, minf(110.0, width * 0.17))
	var action := Rect2(right - action_w, rail.position.y, action_w, header_height)
	var midi := Rect2(action.position.x - gap - button_w, rail.position.y, button_w, header_height)
	var tempo := Rect2(midi.position.x - gap - button_w, rail.position.y, button_w, header_height)

	var pad_h := maxf(finger, clampf(safe.size.y * 0.075, 50.0, 68.0))
	var pad_y := safe.end.y - gap - pad_h
	var pad_w := (width - 3 * gap) / 4
	var pads := {}
	var lanes := ["kick", "snare", "hat", "tom"]
	for i in range(lanes.size()):
		pads[lanes[i]] = Rect2(left + (pad_w + gap) * i, pad_y, pad_w, pad_h)
	var score_h := clampf(safe.size.y * 0.151, 108.0, 126.0)
	if narrow:
		score_h = clampf(safe.size.y * 0.22, 182.0, 218.0)
	var score := Rect2(left, pad_y - gap - score_h, width, score_h)
	var stage := Rect2(Vector2.ZERO, Vector2(view.x, score.position.y + 5.0))

	var health_w := clampf(width * (0.37 if narrow else 0.215), 124.0, 267.0)
	var health_y := rail.end.y + gap
	var hull := Rect2(left, health_y, health_w, 34.0)
	var armor := Rect2(right - health_w, health_y, health_w, 34.0)
	var state_y := health_y if not narrow else hull.end.y + gap
	var state_w := clampf(width - health_w * 2.0 - 3.0 * gap, 250.0, 384.0) if not narrow else minf(370.0, width - 3 * gap)
	var status := Rect2(safe.get_center().x - state_w * 0.5, state_y, state_w, 67.0)
	var course_w := clampf(width * 0.24, 178.0, 250.0)
	var guide_w := clampf(width * 0.16, 105.0, 180.0)
	var menu_y := score.position.y - gap - finger
	return {
		"viewport": Rect2(Vector2.ZERO, view), "safe": safe, "stage": stage, "portrait": portrait,
		"rail": rail, "score": score, "pads": pads, "hull": hull, "armor": armor, "status": status,
		"tempo": tempo, "midi": midi, "action": action,
		"course": Rect2(left, menu_y, course_w, finger), "guide": Rect2(right - guide_w, menu_y, guide_w, finger),
	}
