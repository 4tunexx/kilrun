extends Control

@export_enum("bug", "back_jump", "wall_slide") var icon_kind: String = "bug":
	set(value):
		icon_kind = value
		queue_redraw()

@export var line_color: Color = Color(0.95, 0.98, 1.0, 0.95):
	set(value):
		line_color = value
		queue_redraw()

@export var fill_color: Color = Color(0.95, 0.98, 1.0, 0.28):
	set(value):
		fill_color = value
		queue_redraw()

@export var line_width: float = 2.0:
	set(value):
		line_width = value
		queue_redraw()


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE


func _draw() -> void:
	var icon_size: float = min(size.x, size.y)
	if icon_size <= 2.0:
		return
	var center: Vector2 = size * 0.5
	if icon_kind == "back_jump":
		_draw_back_jump_icon(center, icon_size)
		return
	elif icon_kind == "wall_slide":
		_draw_wall_slide_icon(center, icon_size)
		return
	_draw_bug_icon(center, icon_size)


func _draw_bug_icon(center: Vector2, icon_size: float) -> void:
	var body_radius: float = icon_size * 0.18
	var head_radius: float = icon_size * 0.1
	var body_center: Vector2 = center + Vector2(0.0, icon_size * 0.05)
	var head_center: Vector2 = center + Vector2(0.0, -icon_size * 0.16)
	draw_circle(body_center, body_radius, fill_color)
	draw_circle(head_center, head_radius, fill_color)
	draw_arc(body_center, body_radius, 0.0, TAU, 28, line_color, line_width, true)
	draw_arc(head_center, head_radius, 0.0, TAU, 20, line_color, line_width, true)
	for side in [-1.0, 1.0]:
		for leg_index in 3:
			var leg_y: float = -icon_size * 0.04 + float(leg_index) * icon_size * 0.12
			var start: Vector2 = body_center + Vector2(body_radius * 0.5 * side, leg_y)
			var mid: Vector2 = start + Vector2(icon_size * 0.09 * side, icon_size * 0.02)
			var leg_end: Vector2 = mid + Vector2(icon_size * 0.08 * side, icon_size * 0.07)
			draw_polyline(PackedVector2Array([start, mid, leg_end]), line_color, line_width, true)
	var eye_offset_x: float = icon_size * 0.04
	var eye_offset_y: float = icon_size * 0.02
	draw_circle(head_center + Vector2(-eye_offset_x, eye_offset_y), line_width * 0.45, line_color)
	draw_circle(head_center + Vector2(eye_offset_x, eye_offset_y), line_width * 0.45, line_color)
	draw_polyline(PackedVector2Array([
		head_center + Vector2(-icon_size * 0.04, -head_radius * 0.7),
		head_center + Vector2(-icon_size * 0.11, -icon_size * 0.2)
	]), line_color, line_width, true)
	draw_polyline(PackedVector2Array([
		head_center + Vector2(icon_size * 0.04, -head_radius * 0.7),
		head_center + Vector2(icon_size * 0.11, -icon_size * 0.2)
	]), line_color, line_width, true)


func _draw_back_jump_icon(center: Vector2, icon_size: float) -> void:
	var arc_radius: float = icon_size * 0.24
	var arc_center: Vector2 = center + Vector2(icon_size * 0.02, icon_size * 0.04)
	draw_arc(arc_center, arc_radius, deg_to_rad(160.0), deg_to_rad(354.0), 24, line_color, line_width, true)
	var arrow_tip: Vector2 = center + Vector2(-icon_size * 0.2, -icon_size * 0.1)
	var arrow_mid: Vector2 = center + Vector2(icon_size * 0.05, -icon_size * 0.14)
	draw_polyline(PackedVector2Array([
		arrow_mid,
		arrow_tip,
		arrow_tip + Vector2(icon_size * 0.08, -icon_size * 0.08)
	]), line_color, line_width, true)
	draw_polyline(PackedVector2Array([
		arrow_tip,
		arrow_tip + Vector2(icon_size * 0.09, icon_size * 0.06)
	]), line_color, line_width, true)
	var trail_points := PackedVector2Array([
		center + Vector2(icon_size * 0.18, icon_size * 0.1),
		center + Vector2(icon_size * 0.31, 0.0),
		center + Vector2(icon_size * 0.18, -icon_size * 0.1)
	])
	draw_polyline(trail_points, Color(line_color.r, line_color.g, line_color.b, line_color.a * 0.75), line_width * 0.9, true)
# test

func _draw_wall_slide_icon(center: Vector2, icon_size: float) -> void:
	var wall_x: float = center.x - icon_size * 0.15
	draw_line(Vector2(wall_x, center.y - icon_size * 0.3), Vector2(wall_x, center.y + icon_size * 0.3), line_color, line_width * 1.5, true)
	var slide_start := Vector2(wall_x + icon_size * 0.05, center.y - icon_size * 0.2)
	var slide_end := Vector2(wall_x + icon_size * 0.25, center.y + icon_size * 0.1)
	draw_line(slide_start, slide_end, line_color, line_width, true)
	var tip_dir := (slide_end - slide_start).normalized()
	var perp := Vector2(-tip_dir.y, tip_dir.x)
	var arrow_size := icon_size * 0.08
	draw_polyline(PackedVector2Array([
		slide_end - tip_dir * arrow_size + perp * arrow_size * 0.6,
		slide_end,
		slide_end - tip_dir * arrow_size - perp * arrow_size * 0.6
	]), line_color, line_width, true)