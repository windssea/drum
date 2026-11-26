extends Node2D
## The harbor has its own clipped canvas. Its clock follows the soundtrack;
## recoil, pose holds and camera impulses never change input time or the score.

const INK := Color("#223044")
const FOAM := Color("#fff6ce")
const GOLD := Color("#ffc748")
const TEAL := Color("#4be8f1")
const VIOLET := Color("#ee95ff")
const MINT := Color("#9affe3")
const CORAL := Color("#ff755c")
const ACTOR_PATH := "res://art/drummer-poses.webp"
const FIELD_PATH := "res://art/harbor-stage.webp"
const IMPACT_ART := {
	"power": "res://art/vfx/anchor-impact.webp",
	"flurry": "res://art/vfx/volley-streak.webp",
	"break": "res://art/vfx/shell-shatter.webp",
	"counter": "res://art/vfx/guard-riposte.webp",
}
const LIFE_MS := {"hit": 265.0, "guard": 260.0, "hurt": 510.0, "power": 530.0,
	"flurry": 570.0, "break": 625.0, "counter": 520.0}
const LANE_INK := {"kick": GOLD, "snare": Color("#ff9961"), "hat": TEAL, "tom": VIOLET}

var harbor
var field: Texture2D
var drummer: Texture2D
var drummer_slam: Texture2D
var crab: Texture2D
var crab_slam: Texture2D
var ending: Texture2D
var illustrations := {}
var contact_sheet: Texture2D
var moves: Array[Dictionary] = []
var hand_ms := -100000.0
var hand := 0
var pad := "snare"
var next_cue := 0
var lesson_clock := -1.0
var last_cue_beat := -100.0
var cue_lane := "kick"
var last_idle_frame := -1
var scale_unit := 1.0
var world_size := Vector2.ONE
var camera_offset := Vector2.ZERO
var player := Vector2.ZERO
var boss := Vector2.ZERO
var hero_size := Vector2.ONE
var boss_size := Vector2.ONE
var muzzle := Vector2.ZERO
var shell := Vector2.ZERO
var motion := 1.0


func _ready() -> void:
	field = _texture(FIELD_PATH)
	if not field:
		field = _texture("res://art/harbor.webp")
	drummer = _texture(ACTOR_PATH)
	drummer_slam = _texture("res://art/vfx/drummer-slam.webp")
	crab = _texture("res://art/boss.webp")
	crab_slam = _texture("res://art/vfx/boss-burst.webp")
	ending = _texture("res://art/vfx/finale.webp")
	contact_sheet = _texture("res://art/vfx/contact-burst.webp")
	for kind in IMPACT_ART:
		illustrations[kind] = _texture(IMPACT_ART[kind])


func _texture(path: String) -> Texture2D:
	if ResourceLoader.exists(path, "Texture2D"):
		return load(path) as Texture2D
	return null


func clear() -> void:
	moves.clear()
	hand_ms = -100000.0
	next_cue = 0
	last_cue_beat = -100.0
	lesson_clock = -1.0
	queue_redraw()


func strike(lane: String, at: float) -> void:
	# Two limbs on a chord share a pose. A kick or hat arriving a millisecond
	# later cannot undo the stick animation from the same kit chord.
	if at - hand_ms > 36.0:
		hand = 1 - hand
		pad = lane
		hand_ms = at
	queue_redraw()


func impact(kind: String, lane: String, force: float, at: float, points: int) -> void:
	if kind in ["hit", "guard"] and not moves.is_empty():
		var last := moves.back() as Dictionary
		if last.kind == kind and at - float(last.at) < 36.0:
			last.force = minf(1.28, maxf(force, last.force) + 0.15)
			return
	if moves.size() >= 12:
		moves.pop_front()
	moves.append({"kind": kind, "lane": lane, "force": force, "at": at, "points": points})
	queue_redraw()


func _process(_delta: float) -> void:
	if not harbor or not harbor.layout.has("stage"):
		return
	var clip := get_parent() as Control
	var frame: Rect2 = harbor.layout.stage
	if clip.position != frame.position or clip.size != frame.size:
		clip.position = frame.position
		clip.size = frame.size
		queue_redraw()
	var now := float(harbor.now_ms)
	while not moves.is_empty() and now - float(moves.front().at) > 650.0:
		moves.pop_front()
	var idle_frame := floori(now / 85.0)
	if harbor.phase == harbor.Phase.PLAYING or not moves.is_empty() or now - hand_ms < 380.0:
		queue_redraw()
	elif harbor.phase == harbor.Phase.DONE and now - float(harbor.finished_ms) < harbor.VICTORY_MS + 70:
		queue_redraw()
	elif idle_frame != last_idle_frame and not harbor.reduced_motion:
		queue_redraw()
	last_idle_frame = idle_frame


func _pose(at: Vector2 = Vector2.ZERO, angle := 0.0, stretch := Vector2.ONE) -> void:
	draw_set_transform((at + camera_offset) * scale_unit, angle, stretch * scale_unit)


func _draw() -> void:
	if not harbor or not harbor.layout.has("stage"):
		return
	var view: Vector2 = (get_parent() as Control).size
	if view.x < 2.0 or view.y < 2.0:
		return
	# Use stage-local coordinates; extra space on wide screens reveals sea,
	# while a portrait view staggers the two performers in depth.
	scale_unit = minf(view.x / 1070.0, view.y / 495.0)
	world_size = view / scale_unit
	var portrait := bool(harbor.layout.portrait)
	var now := float(harbor.now_ms)
	var playing: bool = harbor.phase == harbor.Phase.PLAYING
	var beat := (now - float(harbor.anchor_ms)) / float(harbor.beat_ms) if playing else now / 1700.0
	motion = 0.0 if harbor.reduced_motion else 1.0
	var pose_ratio := drummer.get_width() / float(drummer.get_height()) if drummer else 1.35
	var hero_width := minf(world_size.x * (0.59 if portrait else 0.50), world_size.y * 0.81 * pose_ratio)
	hero_size = Vector2(hero_width, hero_width / pose_ratio)
	var boss_width := minf(world_size.x * (0.51 if portrait else 0.43), world_size.y * 0.78 * 1.5)
	boss_size = Vector2(boss_width, boss_width / 1.5)
	player = world_size * Vector2(0.255, 0.90 if portrait else 0.91)
	boss = world_size * Vector2(0.766, 0.70 if portrait else 0.85)
	muzzle = player + hero_size * Vector2(0.14, -0.35)
	shell = boss + boss_size * Vector2(-0.10, -0.63)
	if playing:
		_update_cue(beat)
	var strong := _last_special()
	var shake := _camera_impulse(strong, now)
	camera_offset = shake * motion
	_draw_field()
	var win_age := now - float(harbor.finished_ms)
	# Let the resolving strike land before cutting to the film. Frame eight
	# still lands on the recorded cymbal; hold the final tableau under results.
	if harbor.phase == harbor.Phase.DONE and harbor.won and ending and win_age >= 95.0:
		_draw_finale(win_age)
		return
	_pose()
	if strong and motion > 0.0:
		_frame_contact(strong, now - float(strong.at))
	_waterline(player, hero_size.x, beat)
	_waterline(boss, boss_size.x, beat + 0.5)
	_draw_boss(now, beat, playing, strong)
	_draw_drummer(now, beat, playing)
	for move in moves:
		var age := maxf(0.0, now - float(move.at))
		if age < float(LIFE_MS[move.kind]):
			_draw_move(move, age)
	if strong and int(strong.points) > 0:
		_show_damage(strong, maxf(0.0, now - float(strong.at)))
	draw_set_transform_matrix(Transform2D.IDENTITY)


func _update_cue(beat: float) -> void:
	if beat < lesson_clock:
		next_cue = 0
		last_cue_beat = -100.0
	lesson_clock = beat
	var cues: Array = harbor.cue_chart
	while next_cue < cues.size() and float(cues[next_cue][0]) <= beat:
		last_cue_beat = float(cues[next_cue][0])
		cue_lane = String(cues[next_cue][1])
		next_cue += 1


func _last_special() -> Dictionary:
	for i in range(moves.size() - 1, -1, -1):
		if moves[i].kind not in ["hit", "guard"]:
			return moves[i]
	return {}


func _camera_impulse(special: Dictionary, now: float) -> Vector2:
	if special.is_empty():
		return Vector2.ZERO
	var age := maxf(0.0, now - float(special.at))
	if age > 275.0:
		return Vector2.ZERO
	var power := 6.0 if special.kind in ["power", "break", "hurt"] else 3.1
	var decay := pow(1.0 - age / 275.0, 2.0)
	return Vector2(cos(age * 0.067) * power, sin(age * 0.083) * power * 0.56) * decay


func _draw_field() -> void:
	_pose()
	if not field:
		draw_rect(Rect2(Vector2(-10, -10), world_size + Vector2(20, 20)), Color("#168eac"))
		return
	var size := field.get_size()
	var cover := maxf((world_size.x + 25.0) / size.x, (world_size.y + 25.0) / size.y)
	var visible := (world_size + Vector2(25, 25)) / cover
	var crop := Rect2((size - visible) * Vector2(0.50, 0.63), visible)
	draw_texture_rect_region(field, Rect2(Vector2(-12.5, -12.5), world_size + Vector2(25, 25)), crop)


func _frame_contact(move: Dictionary, age: float) -> void:
	# Stage lighting and brush lines sit behind the combatants. Keep the
	# drummer, score and touch surfaces at full contrast through the impact.
	if age < 0.0 or age >= 295.0:
		return
	var weight := smoothstep(0.0, 32.0, age) * (1.0 - smoothstep(70.0, 295.0, age))
	var ink := Color("#102944")
	draw_rect(Rect2(Vector2(-10, -10), world_size + Vector2(20, 20)), Color(ink, 0.40 * weight))
	var target := muzzle if move.kind == "hurt" else shell
	var tone: Color = {"power": GOLD, "flurry": TEAL, "break": VIOLET, "counter": MINT, "hurt": CORAL}[move.kind]
	for i in range(12):
		var edge := Vector2(-12.0 if i % 2 == 0 else world_size.x + 12.0, world_size.y * (0.09 + 0.16 * floori(i / 2.0)))
		var toward := (target - edge).normalized()
		var reach := minf(edge.distance_to(target) * 0.36, 105.0 + float((i * 43) % 86))
		var side := toward.orthogonal() * (2.8 + float(i % 3))
		var tip := edge + toward * reach * (0.65 + 0.35 * weight)
		draw_colored_polygon(PackedVector2Array([edge - side, edge + side, tip]), Color(tone, weight * 0.70))


func _draw_finale(age: float) -> void:
	_pose()
	var frame := clampi(floori(age * 16.0 / float(harbor.VICTORY_MS)), 0, 15)
	var cell := ending.get_size() * 0.25
	var cover := maxf(world_size.x / cell.x, world_size.y / cell.y)
	var sample := world_size / cover
	var origin := Vector2(frame % 4, frame >> 2) * cell + (cell - sample) * Vector2(0.50, 0.56)
	draw_texture_rect_region(ending, Rect2(Vector2.ZERO, world_size), Rect2(origin, sample))
	draw_set_transform_matrix(Transform2D.IDENTITY)


func _waterline(at: Vector2, width: float, beat: float) -> void:
	_pose(at, 0.0, Vector2(1.0, 0.13))
	var swell := cos(beat * TAU) * motion
	draw_circle(Vector2.ZERO, width * 0.39, Color("#13546b79"), true, -1.0, true)
	draw_arc(Vector2(0, 3), width * 0.41 + swell * 2, 0.04, PI - 0.12, 28, Color("#c9fff1ba"), 4.0, true)
	draw_arc(Vector2(6, 5), width * 0.46 + swell * 3, 0.62, 2.13, 18, Color("#e6fff3a6"), 4.0, true)
	_pose()


func _draw_drummer(now: float, beat: float, playing: bool) -> void:
	if not drummer:
		return # The fallback harbor painting already includes the drummer.
	var age := maxf(0.0, now - hand_ms)
	var special := _last_special()
	var slam := 0.0
	var hurt := 0.0
	if special:
		var t := maxf(0.0, now - float(special.at))
		if special.kind == "hurt":
			hurt = exp(-t / 135.0)
		elif t < 255.0:
			slam = exp(-maxf(0.0, t - 32.0) / 95.0)
	var stick := exp(-age / 80.0)
	var bob := sin(beat * TAU) * 2.9 * motion
	var from_rest := playing and beat >= 0.0 and fmod(beat, 4.0) > 3.60 and int(beat / 4.0) % 2 == 0
	var windup := playing and _finishing_phrase(beat)
	var frame := 0
	if age < 108.0 or slam > 0.45:
		frame = 2 + hand
	elif (age < 246.0 or from_rest) and motion > 0.0:
		frame = 1
	var load := maxf(stick, slam)
	var anchor := player + Vector2(-hurt * 26.0 + load * 6.0, bob - hurt * 5.0) * motion
	var stretch := Vector2(1.0 + load * 0.028, 1.0 - load * 0.044) if motion > 0.0 else Vector2.ONE
	var rotation := (load * 0.020 - hurt * 0.066) * motion
	_pose(anchor, rotation, stretch)
	var actor := drummer
	var grid := Vector2i(2, 2)
	if drummer_slam and special and special.kind in ["power", "break", "counter"] and now - float(special.at) < 390.0:
		actor = drummer_slam
		grid = Vector2i(4, 2)
		var release := maxf(0.0, now - float(special.at))
		frame = 4 if release < 52.0 else mini(7, 5 + floori((release - 52.0) / 91.0))
	elif drummer_slam and windup:
		actor = drummer_slam
		grid = Vector2i(4, 2)
		frame = clampi(floori((fmod(beat, 4.0) - 3.40) * 6.7), 0, 3)
	var frame_size := actor.get_size() / Vector2(grid)
	var region := Rect2(Vector2(frame % grid.x, floori(float(frame) / grid.x)) * frame_size, frame_size)
	var box := Rect2(-hero_size * Vector2(0.50, 0.94), hero_size)
	draw_texture_rect_region(actor, box, region, Color.WHITE.lerp(Color(1.75, 0.76, 0.60), hurt))
	_pose()
	if age < 155.0:
		var fade := 1.0 - age / 155.0
		var color: Color = LANE_INK.get(pad, GOLD)
		var pop := muzzle + Vector2(0, -3)
		_draw_star(pop, (10.0 + 13.0 * fade) * fade, color, 5, -0.25)
		if motion > 0.0:
			draw_arc(pop - Vector2(21, 15), 32.0 + age * 0.09, -1.22, 0.49, 11, Color(FOAM, fade * 0.75), 3.0, true)


func _finishing_phrase(beat: float) -> bool:
	if beat < 0.0 or beat >= 64.0 or fmod(beat, 4.0) < 3.40:
		return false
	var bar := int(beat / 4.0) % 4
	var cycle := floori(beat / 16.0)
	if bar == 1:
		for attempt in harbor.attack_orders[cycle]:
			if attempt.complete():
				return true
	elif bar == 3:
		return harbor.guard_orders[cycle].complete()
	return false


func _draw_boss(now: float, beat: float, playing: bool, special: Dictionary) -> void:
	if not crab:
		return
	var elapsed := 100000.0
	var force := 0.0
	for i in range(moves.size() - 1, -1, -1):
		var move := moves[i]
		if move.kind in ["guard", "hurt"]:
			continue
		var t := maxf(0.0, now - float(move.at))
		if move.kind == "flurry" and t < 215.0:
			t = fmod(t, 72.0)
		var energy := float(move.force) * (0.48 if move.kind == "hit" else 1.0)
		var response := energy * exp(-maxf(0.0, t - 30.0) / 97.0)
		if response > force:
			force = response
			elapsed = t
	var slam := -1.0
	if playing and beat >= 0.0:
		slam = fmod(beat, 16.0) - 11.5
	var cue := clampf(1.0 - (beat - last_cue_beat) * float(harbor.beat_ms) / 165.0, 0.0, 1.0) if playing else 0.0
	var defeated: bool = harbor.phase == harbor.Phase.DONE and harbor.won
	var heave := sin(beat * TAU - 0.72) * (3.1 if playing else 1.5)
	# The 30 ms plateau is an actor-only hold at contact. The rest of the
	# world, including the guard atlas, continues along the real music clock.
	var at := boss + Vector2(force * 28.0, heave - force * 8.0 - cue * 3.5) * motion
	var tilt := (force * 0.095 - 0.006 * cos(beat * TAU)) * motion
	var scale_xy := Vector2(1.0 - 0.13 * force, 1.0 + 0.10 * force) if motion > 0.0 else Vector2.ONE
	if defeated:
		tilt += 0.17
		at.y += boss_size.y * 0.10
	if slam >= 0.0 and slam < 1.0:
		_draw_slam_trail(slam)
	var flash := clampf((45.0 - elapsed) / 35.0, 0.0, 1.0) * minf(force, 1.0)
	var tint := Color.WHITE.lerp(Color(2.1, 1.7, 1.15), flash * 0.88) if motion > 0.0 else Color.WHITE
	if special and special.kind == "break":
		tint = tint.lerp(Color(1.48, 0.72, 1.28), 0.31 * force)
	_pose(at, tilt, scale_xy)
	if crab_slam and slam >= 0.0 and slam < 1.0:
		var frame := clampi(floori(slam * 16.0), 0, 15)
		var frame_size := crab_slam.get_size() * 0.25
		var large := boss_size * Vector2(1.67, 1.67)
		var source := Rect2(Vector2(frame % 4, frame >> 2) * frame_size, frame_size)
		draw_texture_rect_region(crab_slam, Rect2(-large * Vector2(0.50, 0.79), large), source, tint)
	else:
		draw_texture_rect(crab, Rect2(-boss_size * Vector2(0.50, 0.98), boss_size), false, tint)
	_pose()
	if cue > 0.01:
		var claw := boss - boss_size * Vector2(0.31, 0.44)
		var ink: Color = LANE_INK.get(cue_lane, TEAL)
		_draw_star(claw, 6.0 + cue * 14.0, Color(ink, cue * 0.88), 4, 0.21)


func _draw_slam_trail(progress: float) -> void:
	_pose()
	var approach := boss - boss_size * Vector2(0.25, 0.41)
	var endpoint := muzzle + Vector2(12.0, 12.0)
	var ray := endpoint - approach
	if progress < 0.5:
		var winding := progress * 2.0
		_draw_star(approach, 7.0 + winding * 23.0, Color(CORAL, winding * 0.78), 5, 0.25)
		if motion > 0.0:
			var end := approach + ray * 0.63
			draw_dashed_line(approach, end, Color(CORAL, winding * 0.37), 2.2, 12.0, true, true)
	elif progress < 0.81:
		var advance := clampf((progress - 0.5) / 0.22, 0.0, 1.0)
		var head := approach + ray * (1.0 - pow(1.0 - advance, 3.0))
		var tail := approach + ray * advance * advance
		_draw_ribbon(tail, head, 10.0 * (1.0 - advance) + 2.0, CORAL, FOAM)
		if advance > 0.56 and motion > 0.0:
			_debris(endpoint, advance - 0.56, Color("#ffe38e"), 6, 54.0, 11)


func _draw_move(move: Dictionary, age: float) -> void:
	_pose()
	var kind: String = move.kind
	var target := shell
	if kind == "hit":
		# Each kit sound has a slightly different contact point and attack vector.
		var lane: String = move.lane
		var index := ["kick", "snare", "hat", "tom"].find(lane)
		target += Vector2(float(index - 1) * 11.0, [17.0, -4.0, -27.0, 3.0][maxi(0, index)])
		var color: Color = LANE_INK.get(lane, GOLD)
		if motion > 0.0 and age < 98.0:
			var t := age / 98.0
			var trail_start := muzzle.lerp(target, pow(t, 0.55))
			_draw_ribbon(trail_start, target, (1.0 - t) * 5.2 + 1.0, color, FOAM)
		if age < 96.0:
			var flare := 1.0 - age / 104.0
			_draw_star(target, 25.0 * flare * float(move.force), Color(INK, flare * 0.84), 7, 0.29)
		_contact(target, age, 1.07 * float(move.force), color)
	elif kind == "guard":
		_guard_hit(muzzle, age, float(move.force))
	elif kind == "power":
		_anchor_slam(target, age)
	elif kind == "flurry":
		_volley(target, age)
	elif kind == "break":
		_shatter(target, age)
	elif kind == "counter":
		_riposte(target, age)
	elif kind == "hurt":
		_contact(muzzle, age * 0.69, 1.22, CORAL)
		if motion > 0.0:
			_debris(muzzle, age / 510.0, CORAL, 11, 95.0, 23)


func _draw_star(at: Vector2, radius: float, tint: Color, spikes: int, angle: float) -> void:
	if radius < 1.0:
		return
	var outline := PackedVector2Array()
	for i in range(spikes * 2):
		var arm := radius * (1.0 if i % 2 == 0 else 0.25)
		outline.append(at + Vector2.from_angle(angle + i * PI / spikes) * arm)
	draw_colored_polygon(outline, tint)


func _draw_ribbon(start: Vector2, finish: Vector2, width: float, color: Color, core: Color) -> void:
	var ray := finish - start
	if ray.length_squared() < 6.0:
		return
	var normal := ray.normalized().orthogonal()
	var belly := start + ray * 0.69
	draw_colored_polygon(PackedVector2Array([start, belly + normal * width, finish, belly - normal * width * 0.65]), color)
	draw_colored_polygon(PackedVector2Array([start.lerp(finish, 0.22), belly + normal * width * 0.35, finish, belly - normal * width * 0.28]), core)


func _contact(at: Vector2, age: float, power: float, color: Color) -> void:
	if age >= 240.0:
		return
	_pose()
	if contact_sheet:
		var frame := 1 if age < 26.0 else (2 if age < 66.0 else (3 if age < 116.0 else (4 if age < 176.0 else 5)))
		var cell := contact_sheet.get_size() / Vector2(3, 2)
		var side := (95.0 + minf(age, 116.0) * 0.43) * power
		_pose(at, -0.14)
		draw_texture_rect_region(contact_sheet, Rect2(Vector2.ONE * -side * 0.5, Vector2.ONE * side),
			Rect2(Vector2(frame % 3, floori(float(frame) / 3.0)) * cell, cell), Color.WHITE.lerp(color, 0.25))
		_pose()
	else:
		var fade := 1.0 - age / 240.0
		_draw_star(at, 41.0 * power * fade, color, 7, 0.45)
		_draw_star(at, 24.0 * power * fade, FOAM, 5, 0.13)
	if motion > 0.0 and age > 30.0:
		_debris(at, (age - 30.0) / 210.0, color, 5, 42.0 * power, 3)


func _debris(at: Vector2, t: float, color: Color, count: int, reach: float, seed_value: int) -> void:
	if t < 0.0 or t >= 1.0:
		return
	var alpha := (1.0 - t) * 0.94
	var travel := 1.0 - (1.0 - t) * (1.0 - t)
	for i in range(count):
		var direction := Vector2.from_angle(float(i) * 2.39996 + seed_value)
		var variation := 0.62 + ((i * 17 + seed_value) % 11) * 0.042
		var center := at + direction * reach * travel * variation + Vector2(0.0, reach * 0.46 * t * t)
		var along := direction.rotated(t * (1.2 if i % 2 == 0 else -1.0))
		var r := (3.0 + (i % 4) * 1.4) * (1.0 - t * 0.63)
		var normal := along.orthogonal() * r * 0.53
		draw_colored_polygon(PackedVector2Array([center - along * r, center + normal, center + along * r * 1.39, center - normal]),
			Color(FOAM if i % 3 == 0 else color, alpha))


func _stamp(kind: String, anchor: Vector2, pivot: Vector2, size: Vector2, angle: float, alpha := 1.0) -> void:
	var texture: Texture2D = illustrations.get(kind)
	if not texture or alpha <= 0.01:
		return
	_pose(anchor, angle)
	draw_texture_rect(texture, Rect2(-size * pivot, size), false, Color(1.0, 1.0, 1.0, alpha))
	_pose()


func _guard_hit(at: Vector2, age: float, force: float) -> void:
	var fade := clampf(1.0 - age / 260.0, 0.0, 1.0)
	var recoil := exp(-age / 65.0) * motion
	var face := at + Vector2(32.0 - recoil * 11.0, -10.0)
	var side := (112.0 + recoil * 26.0) * maxf(0.74, force)
	_stamp("counter", face, Vector2(0.50, 0.50), Vector2.ONE * side, -0.15 + recoil * 0.12, minf(1.0, fade * 1.6))
	if age < 108.0:
		_contact(face + Vector2(side * 0.16, -side * 0.07), age * 1.8, 0.57, MINT)


func _anchor_slam(at: Vector2, age: float) -> void:
	var t := age / LIFE_MS.power
	var contact := exp(-maxf(0.0, age - 38.0) / 140.0)
	var fade := 1.0 - smoothstep(0.62, 1.0, t)
	var side := minf(354.0, boss_size.y * 1.16) * (0.94 + 0.12 * contact)
	if age < 150.0 and motion > 0.0:
		_draw_ribbon(muzzle.lerp(at, 0.2 + age / 235.0), at, 18.0 * contact, GOLD, FOAM)
	var recoil := (1.0 - contact) * motion
	_stamp("power", at + Vector2(-18.0 * recoil, -22.0 * recoil), Vector2(0.796, 0.750),
		Vector2.ONE * side, recoil * -0.22, fade)
	_contact(at, age, 1.64, GOLD)
	if motion > 0.0:
		_debris(at, t, GOLD, 16, 127.0, 8)


func _volley(at: Vector2, age: float) -> void:
	var direction := (at - muzzle).normalized()
	var side := direction.orthogonal()
	# Each carriage of the volley gets its own travel and impact, echoing
	# the three transients in the recorded flurry sound.
	for i in range(3):
		var t := age - i * 72.0
		if t < 0.0 or t >= 350.0:
			continue
		var target := at + side * (i - 1) * 23.0
		var progress := clampf(t / 125.0, 0.0, 1.0)
		var head := muzzle.lerp(target, 1.0 - pow(1.0 - progress, 2.1)) if motion > 0.0 else target
		var fade := 1.0 - smoothstep(95.0, 250.0, t)
		var span := minf(muzzle.distance_to(target) * 0.65, 305.0)
		_stamp("flurry", head, Vector2(0.934, 0.514), Vector2(span, 104.0 + 16.0 * progress), direction.angle(), fade)
		if t >= 68.0:
			_contact(target, t - 68.0, 0.86, TEAL)


func _shatter(at: Vector2, age: float) -> void:
	var t := age / LIFE_MS["break"]
	var open := 1.0 - exp(-age / 82.0)
	var radius := minf(375.0, boss_size.y * 1.32)
	var span := radius * (0.61 + 0.47 * open)
	var fade := 1.0 - smoothstep(0.52, 1.0, t)
	_stamp("break", at, Vector2(0.506, 0.509), Vector2.ONE * span, (open - 0.50) * 0.20 * motion, fade)
	if age < 145.0 and motion > 0.0:
		var split := Vector2(0.83, -0.55) * (54.0 + open * 89.0)
		_draw_ribbon(at - split, at + split, 9.0 * (1.0 - open) + 4.0, VIOLET, FOAM)
	if motion > 0.0:
		_debris(at, t, VIOLET, 17, 143.0, 1)


func _riposte(target: Vector2, age: float) -> void:
	var t := age / LIFE_MS.counter
	var shield := muzzle + Vector2(31.0, -9.0)
	var recoil := exp(-age / 98.0)
	var span := 185.0 + 36.0 * recoil
	_stamp("counter", shield, Vector2(0.529, 0.512), Vector2.ONE * span, recoil * 0.17 * motion,
		1.0 - smoothstep(0.43, 0.91, t))
	if age < 198.0:
		var along := (target - shield).normalized()
		var normal := along.orthogonal()
		var fade := 1.0 - age / 198.0
		_draw_ribbon(shield + normal * 8.0, target - normal * 2.0, 10.0 * fade + 2.0, MINT, FOAM)
		if motion > 0.0:
			_draw_ribbon(shield - normal * 15.0 + along * 50.0, target - normal * 12.0, 3.0 * fade, TEAL, FOAM)
	_contact(target, age, 1.6, MINT)
	if motion > 0.0:
		_debris(target, t, MINT, 12, 118.0, 17)


func _show_damage(move: Dictionary, age: float) -> void:
	if age < 18.0 or age > 560.0 or not harbor.font:
		return
	var t := clampf((age - 18.0) / 542.0, 0.0, 1.0)
	var offset := Vector2(22.0 + t * 13.0 * motion, -43.0 - 37.0 * sin(t * PI * 0.55) * motion)
	var alpha := 1.0 - smoothstep(0.64, 1.0, t)
	var at := shell + offset
	var label := "−%d" % int(move.points)
	var color := MINT if move.kind == "counter" else GOLD
	_pose(at, -0.12, Vector2.ONE * (1.0 + exp(-age / 85.0) * 0.25 * motion))
	draw_string_outline(harbor.font, Vector2.ZERO, label, HORIZONTAL_ALIGNMENT_LEFT, -1, 37,
		7, Color(INK, alpha))
	draw_string(harbor.font, Vector2.ZERO, label, HORIZONTAL_ALIGNMENT_LEFT, -1, 37, Color(color, alpha))
	_pose()
