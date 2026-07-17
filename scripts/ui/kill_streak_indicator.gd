extends Control

var progress: float = 0.0:
	set(value):
		progress = clamp(value, 0.0, 1.0)
		queue_redraw()

var track_color: Color = Color(0.08, 0.15, 0.22, 0.18)
var ring_color: Color = Color(1.0, 0.35, 0.2, 0.95)
var glow_color: Color = Color(1.0, 0.7, 0.5, 0.98)
var line_width: float = 6.0

@onready var count_label: Label = Label.new()


var _target_progress: float = 0.0
var _display_count: int = 0
var _label_scale: float = 1.0
var _shake_offset: Vector2 = Vector2.ZERO

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	
	count_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	count_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	count_label.add_theme_font_size_override("font_size", 24)
	count_label.add_theme_color_override("font_color", Color(1, 0.8, 0.6, 0.98))
	count_label.text = "0"
	count_label.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	count_label.pivot_offset = Vector2(41.0, 41.0)
	add_child(count_label)
	
	

func set_streak(kills: int) -> void:
	_display_count = kills
	count_label.text = str(kills)
	
	var progress_val: float = 0.0
	if kills <= 3:
		progress_val = float(kills) / 3.0
	elif kills <= 5:
		progress_val = float(kills - 3) / 2.0
	elif kills <= 6:
		progress_val = float(kills - 5) / 1.0
	elif kills <= 10:
		progress_val = float(kills - 6) / 4.0
	elif kills <= 12:
		progress_val = float(kills - 10) / 2.0
	elif kills <= 14:
		progress_val = float(kills - 12) / 2.0
	elif kills <= 16:
		progress_val = float(kills - 14) / 2.0
	elif kills <= 18:
		progress_val = float(kills - 16) / 2.0
	elif kills <= 19:
		progress_val = float(kills - 18) / 1.0
	elif kills <= 20:
		progress_val = float(kills - 19) / 1.0
	elif kills <= 25:
		progress_val = float(kills - 20) / 5.0
	else:
		progress_val = 1.0
		
	_target_progress = progress_val
	_label_scale = 1.8
	_shake_offset = Vector2(randf_range(-6.0, 6.0), randf_range(-6.0, 6.0))

func _process(delta: float) -> void:
	progress = lerpf(progress, _target_progress, delta * 8.0)
	_label_scale = lerpf(_label_scale, 1.0, delta * 10.0)
	_shake_offset = _shake_offset.lerp(Vector2.ZERO, delta * 12.0)
	
	count_label.scale = Vector2.ONE * _label_scale
	count_label.position = _shake_offset

func _draw() -> void:
	var radius: float = min(size.x, size.y) * 0.5 - line_width - 2.0
	if radius <= 0.0:
		return
	var center: Vector2 = size * 0.5
	var start_angle: float = deg_to_rad(-90.0)
	draw_arc(center, radius, start_angle, start_angle + TAU, 72, track_color, line_width, true)
	if progress <= 0.001:
		return
	var end_angle: float = start_angle + TAU * progress
	draw_arc(center, radius, start_angle, end_angle, 72, ring_color, line_width, true)
	var dot_position: Vector2 = center + Vector2(cos(end_angle), sin(end_angle)) * radius
	draw_circle(dot_position, line_width * 0.56, glow_color)