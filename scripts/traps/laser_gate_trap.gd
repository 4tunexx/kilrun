extends Node3D

const TrapHelper = preload("res://scripts/traps/trap_utils.gd")
const DAMAGE_AMOUNT := 22.0

@export var telegraph_time: float = 0.6
@export var active_time: float = 1.25
@export var cooldown_time: float = 1.2

var _busy: bool = false
var _beam_area: Area3D
var _beam_mesh: MeshInstance3D
var _left_light: OmniLight3D
var _right_light: OmniLight3D
var _audio: AudioStreamPlayer3D
var _beam_active: bool = false


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
	TrapHelper.add_box_mesh(self, Vector3(0.8, 2.6, 0.8), Vector3(-3.8, 1.1, 0.0), TrapHelper.make_material(Color(0.2, 0.22, 0.28), 0.0, 0.45, 0.35))
	TrapHelper.add_box_mesh(self, Vector3(0.8, 2.6, 0.8), Vector3(3.8, 1.1, 0.0), TrapHelper.make_material(Color(0.2, 0.22, 0.28), 0.0, 0.45, 0.35))
	_beam_area = Area3D.new()
	_beam_area.position = Vector3(0.0, 1.0, 0.0)
	_beam_area.body_entered.connect(_on_beam_body_entered)
	add_child(_beam_area)
	TrapHelper.add_box_collision(_beam_area, Vector3(7.1, 2.0, 0.7))
	_beam_mesh = TrapHelper.add_box_mesh(
		_beam_area,
		Vector3(7.1, 0.12, 0.28),
		Vector3.ZERO,
		TrapHelper.make_material(Color(1.0, 0.15, 0.18), 3.4, 0.0, 0.02)
	)
	_beam_mesh.visible = false
	_left_light = OmniLight3D.new()
	_left_light.position = Vector3(-3.8, 1.3, 0.0)
	_left_light.light_color = Color(1.0, 0.18, 0.18)
	_left_light.light_energy = 2.0
	_left_light.omni_range = 6.5
	add_child(_left_light)
	_right_light = OmniLight3D.new()
	_right_light.position = Vector3(3.8, 1.3, 0.0)
	_right_light.light_color = Color(1.0, 0.18, 0.18)
	_right_light.light_energy = 2.0
	_right_light.omni_range = 6.5
	add_child(_right_light)
	_audio = AudioStreamPlayer3D.new()
	_audio.stream = TrapHelper.make_tone(950.0, 0.18, 0.2)
	_audio.unit_size = 8.0
	add_child(_audio)


func _on_beam_body_entered(body: Node3D) -> void:
	if not multiplayer.is_server() or not _beam_active:
		return
	if body.has_method("server_apply_damage"):
		body.call("server_apply_damage", DAMAGE_AMOUNT)


@rpc("authority", "call_local", "reliable")
func _sync_activate() -> void:
	_run_sequence()


func _run_sequence() -> void:
	var gm = get_node_or_null("/root/GameManager")
	if gm: gm.call("play_effect", "some-metalgear-traps-activated-sound")
	if _audio:
		_audio.play()
	var flash := create_tween()
	flash.tween_property(_left_light, "light_energy", 6.0, telegraph_time * 0.5)
	flash.parallel().tween_property(_right_light, "light_energy", 6.0, telegraph_time * 0.5)
	flash.tween_property(_left_light, "light_energy", 2.0, telegraph_time * 0.5)
	flash.parallel().tween_property(_right_light, "light_energy", 2.0, telegraph_time * 0.5)
	await get_tree().create_timer(telegraph_time).timeout
	_beam_active = true
	_beam_mesh.visible = true
	if gm: gm.call("play_effect", "lazers-anything-kill-player-anythingelse..")
	if multiplayer.is_server():
		_damage_bodies(_beam_area, DAMAGE_AMOUNT)
	await get_tree().create_timer(active_time).timeout
	_beam_active = false
	_beam_mesh.visible = false
	await get_tree().create_timer(cooldown_time).timeout
	_busy = false


func _damage_bodies(area: Area3D, amount: float) -> void:
	for body in area.get_overlapping_bodies():
		if is_instance_valid(body) and body.has_method("server_apply_damage"):
			body.call("server_apply_damage", amount)







func _play_trap_sound(sound_name: String) -> void:
	var player = get_tree().get_first_node_in_group("local_player")
	if player and is_instance_valid(player):
		var dist := global_position.distance_to(player.global_position)
		if dist < 24.0:
			var vol := lerpf(-3.0, -28.0, dist / 24.0)
			var gm = get_node_or_null("/root/GameManager")
			if gm: gm.call("play_effect", sound_name, vol)

