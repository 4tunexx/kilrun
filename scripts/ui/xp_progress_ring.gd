class_name XpProgressRing
extends Control

@export_range(0.0, 1.0, 0.01) var progress: float = 0.0:
	set(value):
		progress = clampf(value, 0.0, 1.0)
		queue_redraw()

@export var track_color: Color = Color(0.08, 0.14, 0.22, 0.55)
@export var fill_color: Color = Color(0.42, 0.82, 1.0, 0.95)
@export var glow_color: Color = Color(1.0, 0.92, 0.72, 0.9)
@export var line_width: float = 5.0


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE


func _draw() -> void:
	var radius: float = minf(size.x, size.y) * 0.5 - line_width - 1.0
	if radius <= 0.0:
		return
	var center: Vector2 = size * 0.5
	var start_angle: float = deg_to_rad(-90.0)
	draw_arc(center, radius, start_angle, start_angle + TAU, 80, track_color, line_width, true)
	if progress <= 0.001:
		return
	var end_angle: float = start_angle + TAU * progress
	draw_arc(center, radius, start_angle, end_angle, 80, fill_color, line_width, true)
	var dot := center + Vector2(cos(end_angle), sin(end_angle)) * radius
	draw_circle(dot, line_width * 0.5, glow_color)