extends StaticBody3D

var movement_offset: Vector3 = Vector3.ZERO
var movement_speed: float = 2.0
var wait_duration: float = 1.0

var _start_pos: Vector3
var _target_pos: Vector3
var _wait_timer: float = 0.0
var _moving_to_target: bool = true

func _ready() -> void:
	_start_pos = global_position
	if has_meta("movement_offset"):
		movement_offset = get_meta("movement_offset")
	if has_meta("movement_speed"):
		movement_speed = get_meta("movement_speed")
	if has_meta("wait_duration"):
		wait_duration = get_meta("wait_duration")
	
	_target_pos = _start_pos + movement_offset

func _physics_process(delta: float) -> void:
	if Engine.is_editor_hint():
		return
		
	if _wait_timer > 0.0:
		_wait_timer -= delta
		return
		
	var dest = _target_pos if _moving_to_target else _start_pos
	var to_dest = dest - global_position
	var dist = to_dest.length()
	var step = movement_speed * delta
	
	if dist <= step:
		global_position = dest
		_moving_to_target = not _moving_to_target
		_wait_timer = wait_duration
	else:
		global_position += to_dest.normalized() * step
