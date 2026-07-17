extends Node3D

const TrapHelper = preload("res://scripts/traps/trap_utils.gd")

@export var telegraph_time: float = 0.5
@export var cooldown_time: float = 2.0

var _busy: bool = false
var _panel: AnimatableBody3D
var _collision: CollisionShape3D
var _warning_light: OmniLight3D
var _audio: AudioStreamPlayer3D


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
	_panel = AnimatableBody3D.new()
	_panel.position = Vector3(0.0, -0.2, 0.0)
	add_child(_panel)
	TrapHelper.add_box_mesh(_panel, Vector3(7.5, 0.4, 7.5), Vector3.ZERO, TrapHelper.make_material(Color(0.33, 0.34, 0.38), 0.0, 0.4, 0.5))
	_collision = TrapHelper.add_box_collision(_panel, Vector3(7.5, 0.4, 7.5))
	_warning_light = OmniLight3D.new()
	_warning_light.position = Vector3(0.0, 2.2, 0.0)
	_warning_light.light_color = Color(0.95, 0.85, 0.18)
	_warning_light.light_energy = 1.9
	_warning_light.omni_range = 7.5
	add_child(_warning_light)
	_audio = AudioStreamPlayer3D.new()
	_audio.stream = TrapHelper.make_tone(250.0, 0.18, 0.28)
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
	flash.tween_property(_warning_light, "light_energy", 6.0, telegraph_time * 0.5)
	flash.tween_property(_warning_light, "light_energy", 1.9, telegraph_time * 0.5)
	await get_tree().create_timer(telegraph_time).timeout
	_collision.disabled = true
	if gm: gm.call("play_effect", "trap-crush-player")
	var drop := create_tween()
	drop.tween_property(_panel, "position:y", -5.6, 0.5)
	await drop.finished
	await get_tree().create_timer(0.7).timeout
	_panel.position.y = -0.2
	_collision.disabled = false
	await get_tree().create_timer(cooldown_time).timeout
	_busy = false







func _play_trap_sound(sound_name: String) -> void:
	var player = get_tree().get_first_node_in_group("local_player")
	if player and is_instance_valid(player):
		var dist := global_position.distance_to(player.global_position)
		if dist < 24.0:
			var vol := lerpf(-3.0, -28.0, dist / 24.0)
			var gm = get_node_or_null("/root/GameManager")
			if gm: gm.call("play_effect", sound_name, vol)

