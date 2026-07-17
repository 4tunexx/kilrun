extends Node3D

const TrapHelper = preload("res://scripts/traps/trap_utils.gd")

@export var telegraph_time: float = 0.5
@export var cooldown_time: float = 1.2

var _busy: bool = false
var _carriage: AnimatableBody3D
var _hazard_area: Area3D
var _warning_light: OmniLight3D
var _audio: AudioStreamPlayer3D
var _hazard_active: bool = false


func _ready() -> void:
	if get_child_count() == 0:
		_build_trap()


func server_activate(_requester_id: int = -1) -> bool:
	if not multiplayer.is_server() or _busy:
		return false
	_busy = true
	rpc("_sync_activate")
	return true


func _build_trap() -> void:
	_carriage = AnimatableBody3D.new()
	_carriage.position = Vector3(5.9, 1.2, 0.0)
	add_child(_carriage)
	TrapHelper.add_box_mesh(_carriage, Vector3(1.2, 2.4, 5.0), Vector3.ZERO, TrapHelper.make_material(Color(0.42, 0.1, 0.1), 0.8, 0.4, 0.35))
	for spike_index in 5:
		TrapHelper.add_box_mesh(
			_carriage,
			Vector3(1.4, 0.24, 0.24),
			Vector3(-1.0, -0.95 + float(spike_index) * 0.48, 0.0),
			TrapHelper.make_material(Color(0.82, 0.82, 0.86), 0.2, 0.8, 0.18)
		)
	TrapHelper.add_box_collision(_carriage, Vector3(1.2, 2.4, 5.0))
	_hazard_area = Area3D.new()
	_hazard_area.position = Vector3(-1.0, 0.0, 0.0)
	_hazard_area.body_entered.connect(_on_hazard_body_entered)
	_carriage.add_child(_hazard_area)
	TrapHelper.add_box_collision(_hazard_area, Vector3(3.0, 2.4, 5.0))
	_warning_light = OmniLight3D.new()
	_warning_light.position = Vector3(0.0, 2.5, 0.0)
	_warning_light.light_color = Color(1.0, 0.18, 0.2)
	_warning_light.light_energy = 2.4
	_warning_light.omni_range = 8.0
	add_child(_warning_light)
	_audio = AudioStreamPlayer3D.new()
	_audio.stream = TrapHelper.make_tone(360.0, 0.14, 0.3)
	_audio.unit_size = 8.0
	add_child(_audio)


@rpc("authority", "call_local", "reliable")
func _sync_activate() -> void:
	_run_sequence()


func _run_sequence() -> void:
	var gm = get_node_or_null("/root/GameManager")
	if gm: gm.call("play_effect", "some-metalgear-traps-activated-sound")
	if _audio:
		_audio.play()
	var flash := create_tween()
	flash.tween_property(_warning_light, "light_energy", 6.5, telegraph_time * 0.5)
	flash.tween_property(_warning_light, "light_energy", 2.4, telegraph_time * 0.5)
	await get_tree().create_timer(telegraph_time).timeout
	_hazard_active = true
	var thrust := create_tween()
	thrust.tween_property(_carriage, "position:x", 2.2, 0.25)
	await thrust.finished
	if gm: gm.call("play_effect", "trap-hit-cut-player")
	if multiplayer.is_server():
		TrapHelper.eliminate_bodies(_hazard_area)
	await get_tree().create_timer(0.25).timeout
	_hazard_active = false
	var reset := create_tween()
	reset.tween_property(_carriage, "position:x", 5.9, 0.4)
	await reset.finished
	await get_tree().create_timer(cooldown_time).timeout
	_busy = false


func _on_hazard_body_entered(body: Node3D) -> void:
	if not multiplayer.is_server() or not _hazard_active:
		return
	if body.has_method("eliminate"):
		body.call("eliminate")







func _play_trap_sound(sound_name: String) -> void:
	var player = get_tree().get_first_node_in_group("local_player")
	if player and is_instance_valid(player):
		var dist := global_position.distance_to(player.global_position)
		if dist < 24.0:
			var vol := lerpf(-3.0, -28.0, dist / 24.0)
			var gm = get_node_or_null("/root/GameManager")
			if gm: gm.call("play_effect", sound_name, vol)

