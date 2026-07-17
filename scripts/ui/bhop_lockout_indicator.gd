extends Control

@export_range(0.0, 1.0, 0.01) var progress: float = 0.0:
	set(value):
		progress = clamp(value, 0.0, 1.0)
		queue_redraw()

@export var rotation_offset_degrees: float = 0.0:
	set(value):
		rotation_offset_degrees = value
		queue_redraw()

@export var track_color: Color = Color(0.08, 0.15, 0.22, 0.18)
@export var ring_color: Color = Color(0.36, 0.88, 1.0, 0.92)
@export var glow_color: Color = Color(0.95, 0.98, 1.0, 0.98)
@export var line_width: float = 6.0


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE


func _draw() -> void:
	var radius: float = min(size.x, size.y) * 0.5 - line_width - 2.0
	if radius <= 0.0:
		return
	var center: Vector2 = size * 0.5
	var start_angle: float = deg_to_rad(-90.0 + rotation_offset_degrees)
	draw_arc(center, radius, start_angle, start_angle + TAU, 72, track_color, line_width, true)
	if progress <= 0.001:
		return
	var end_angle: float = start_angle + TAU * progress
	draw_arc(center, radius, start_angle, end_angle, 72, ring_color, line_width, true)
	var dot_position: Vector2 = center + Vector2(cos(end_angle), sin(end_angle)) * radius
	draw_circle(dot_position, line_width * 0.56, glow_color)