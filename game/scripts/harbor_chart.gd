extends Control
## The drum book only redraws on a new subdivision, a score event or a resize.

const Orders = preload("res://scripts/combat_orders.gd")
const FACE := preload("res://art/HarborHUD.ttf")
const PAPER := Color("#fff0cb")
const BINDING := Color("#173642")
const RULE := Color("#cbb88e")
const PRINT := Color("#293d40")
const FAINT := Color("#6d6c5c")
const OCHRE := Color("#a05a20")
const INKS := {"kick": Color("#f5b14e"), "snare": Color("#70ced8"), "hat": Color("#91c879"), "tom": Color("#cb9bd8")}
const GLYPHS := {"kick": "底", "snare": "军", "hat": "镲", "tom": "通"}

var course := -1
var measure := -1
var phase := -1
var step := -1
var live := false
var changed_at := -INF
var attacks: Array = []
var guard: Orders.Attempt


func present(bounds: Rect2, bank: int, bar: int, mode: int, cursor: int, playing: bool,
		revision: float, new_attacks: Array, new_guard: Orders.Attempt) -> void:
	var moved := position != bounds.position or size != bounds.size
	if not moved and bank == course and bar == measure and mode == phase and cursor == step and live == playing and changed_at == revision:
		return
	position = bounds.position
	size = bounds.size
	course = bank
	measure = bar
	phase = mode
	step = cursor
	live = playing
	changed_at = revision
	attacks = new_attacks
	guard = new_guard
	queue_redraw()


func _text(value: String, box: Rect2, points: int, ink: Color, align: HorizontalAlignment = HORIZONTAL_ALIGNMENT_LEFT) -> void:
	var extent := FACE.get_string_size(value, HORIZONTAL_ALIGNMENT_LEFT, -1, points).x
	if extent > box.size.x and extent > 0.0:
		points = maxi(10, floori(points * box.size.x / extent))
	var baseline := box.get_center().y + (FACE.get_ascent(points) - FACE.get_descent(points)) * 0.5
	draw_string(FACE, Vector2(box.position.x, baseline), value, align, box.size.x, points, ink)


func _draw() -> void:
	if course < 0 or size.x < 1.0:
		return
	draw_rect(Rect2(Vector2.ZERO, size), BINDING)
	draw_rect(Rect2(2, 3, size.x - 4, size.y - 6), PAPER)
	draw_rect(Rect2(2, 3, size.x - 4, 2), Color("#e5ad5c"))
	var division := int(Orders.COURSES[course].divisions)
	var wrapped := size.x < 760.0 and size.y >= 154.0
	var bands := 2 if wrapped else 1
	var steps := 4 * division / bands
	var body_height := (size.y - 9.0) / bands
	var label_width := clampf(size.x * (0.20 if wrapped else 0.143), 90.0, 165.0)
	for band in range(bands):
		_draw_band(5.0 + band * body_height, body_height, label_width, band * steps, steps, division)


func _draw_band(y: float, height: float, label_width: float, first: int, steps: int, division: int) -> void:
	var lesson: Dictionary = Orders.COURSES[course]
	var cycle := maxi(0, measure) >> 2
	var header := clampf(height * 0.22, 18.0, 25.0)
	var rows := (height - header) / 3.0
	var grid_x := label_width + 4.0
	var cell := (size.x - grid_x - 8.0) / steps
	var band_end := y + height
	var attacking := phase in [Orders.Bar.SCOUT, Orders.Bar.ATTACK]
	if first > 0:
		draw_line(Vector2(2, y), Vector2(size.x - 2.0, y), OCHRE, 1.6)
	draw_rect(Rect2(2, y, label_width - 2, height), Color("#ecd6a7"))
	draw_rect(Rect2(2, y, label_width - 2, header), Color("#ecc484"))
	draw_line(Vector2(label_width, y), Vector2(label_width, band_end), RULE, 1.0)
	_text("三连音鼓谱" if division == 3 else "鼓点指令", Rect2(13, y, label_width - 20, header), 16, BINDING)
	var labels := ["", "e", "&", "a"] if division == 4 else ["", "tri", "let"]
	for local_step in range(steps):
		var s := first + local_step
		var sub := s % division
		var x := grid_x + local_step * cell
		if sub == 0:
			if floori(float(s) / division) % 2 == 1:
				draw_rect(Rect2(x, y, division * cell, height), Color("#a17b4820"))
			draw_line(Vector2(x, y), Vector2(x, band_end), RULE, 1.2)
		if step == s:
			draw_rect(Rect2(x, y, cell, height), Color("#f9aa4b55"))
			draw_rect(Rect2(x + 1, y, cell - 2.0, 2.0), OCHRE)
		var label := str(s / division + 1) if sub == 0 else String(labels[sub])
		var header_ink := FAINT
		if sub == 0:
			var cx := x + cell * 0.5
			var tag := minf(12.0, cell * 0.43)
			draw_colored_polygon(PackedVector2Array([
				Vector2(cx - tag, y), Vector2(cx + tag, y), Vector2(cx + tag, y + header - 4),
				Vector2(cx, y + header), Vector2(cx - tag, y + header - 4),
			]), OCHRE if s == step else BINDING)
			header_ink = PAPER
		_text(label, Rect2(x, y - 0.5, cell, header), 16 if sub == 0 else 13, header_ink, HORIZONTAL_ALIGNMENT_CENTER)
	draw_line(Vector2(2, y + header), Vector2(size.x - 2.0, y + header), RULE, 1.0)
	if attacking:
		for row in range(3):
			var selected: bool = live and row == Orders.RECOMMENDED[cycle]
			var top := y + header + row * rows
			if selected:
				draw_rect(Rect2(4, top + 1, 4, rows - 2), OCHRE)
				draw_colored_polygon(PackedVector2Array([Vector2(8, top + rows * 0.34), Vector2(13, top + rows * 0.5), Vector2(8, top + rows * 0.66)]), OCHRE)
			if row:
				draw_line(Vector2(5, top), Vector2(size.x - 6.0, top), Color("#d7c7a6"), 1.0)
			var state: Orders.Attempt = attacks[row] if not attacks.is_empty() else null
			var row_name := String(lesson.attack_names[row])
			if size.x < 650.0:
				row_name = row_name.get_slice("·", 0)
			_text(row_name, Rect2(13, top, label_width - 17, rows), 17, OCHRE if selected else PRINT)
			_notes(lesson.attacks[row], state, first, steps, grid_x, cell, top + rows * 0.5, rows, selected and phase == Orders.Bar.SCOUT)
	else:
		var top := y + header
		var half := (height - header) * 0.50
		_text(String(lesson.guard_names[cycle]), Rect2(13, top, label_width - 17, half), 17, OCHRE)
		_text("R 右手  L 左手", Rect2(13, top + half, label_width - 17, half), 14, PRINT)
		draw_line(Vector2(5, top + half), Vector2(size.x - 6.0, top + half), Color("#d7c7a6"), 1.0)
		_notes(lesson.guards[cycle], guard, first, steps, grid_x, cell, top + half * 0.5, half,
			phase == Orders.Bar.LISTEN, String(lesson.hands[cycle]), half)


func _notes(chart: Array, state: Orders.Attempt, first: int, steps: int, left: float,
		cell: float, y: float, row_height: float, preview: bool, hands := "", hand_gap := 0.0) -> void:
	var index := 0
	while index < chart.size():
		var s := int(chart[index][0])
		var end := index + 1
		while end < chart.size() and chart[end][0] == s:
			end += 1
		if s >= first and s < first + steps:
			var count := end - index
			var diameter := minf(minf(row_height - 3.0, 24.0), (cell - 2.0) / count - 0.6)
			var cx := left + (s - first + 0.5) * cell
			for i in range(index, end):
				var lane := String(chart[i][1])
				var x := cx + (i - index - (count - 1) * 0.5) * (diameter + 0.6)
				var lit := (state != null and state.filled(i)) or (preview and s == step)
				var expired := state != null and s < step - 1 and not state.filled(i)
				var ink: Color = INKS[lane]
				var center := Vector2(x, y)
				var radius := diameter * 0.5
				draw_circle(center, radius, PRINT if not expired else RULE, true, -1, true)
				var face := ink.lerp(PAPER, 0.30)
				if lit:
					face = BINDING
				elif expired:
					face = PAPER
				draw_circle(center, maxf(1, radius - (2.0 if lit else 1.1)), face, true, -1, true)
				var letter_size := clampi(floori(diameter * (0.92 if count == 3 else 0.75)), 10, 17)
				_text(GLYPHS[lane], Rect2(x - radius, y - radius, diameter, diameter), letter_size, PAPER if lit else (FAINT if expired else PRINT), HORIZONTAL_ALIGNMENT_CENTER)
				if i < hands.length() and hands[i] != " ":
					_text(hands[i], Rect2(x - cell * 0.5, y + hand_gap - 10.0, cell, 20), 17, BINDING if hands[i] == "R" else OCHRE, HORIZONTAL_ALIGNMENT_CENTER)
		index = end
