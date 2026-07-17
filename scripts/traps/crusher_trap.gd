extends Node3D

const TrapHelper = preload("res://scripts/traps/trap_utils.gd")
const DAMAGE_AMOUNT := 70.0

@export var telegraph_time: float = 0.55
@export var cooldown_time: float = 1.4

var _busy: bool = false
var _ram: AnimatableBody3D
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
	TrapHelper.add_box_mesh(self, Vector3(7.6, 0.22, 5.6), Vector3(0.0, 0.08, 0.0), TrapHelper.make_material(Color(0.24, 0.24, 0.28), 0.0, 0.35, 0.55))
	TrapHelper.add_box_mesh(self, Vector3(0.5, 3.8, 0.5), Vector3(-3.7, 1.9, 0.0), TrapHelper.make_material(Color(0.16, 0.18, 0.22), 0.0, 0.55, 0.45))
	TrapHelper.add_box_mesh(self, Vector3(0.5, 3.8, 0.5), Vector3(3.7, 1.9, 0.0), TrapHelper.make_material(Color(0.16, 0.18, 0.22), 0.0, 0.55, 0.45))
	_ram = AnimatableBody3D.new()
	_ram.position = Vector3(0.0, 3.1, 0.0)
	add_child(_ram)
	TrapHelper.add_box_mesh(_ram, Vector3(7.3, 0.9, 5.2), Vector3.ZERO, TrapHelper.make_material(Color(0.68, 0.1, 0.1), 1.2, 0.2, 0.35))
	TrapHelper.add_box_collision(_ram, Vector3(7.3, 0.9, 5.2))
	_hazard_area = Area3D.new()
	_hazard_area.position = Vector3(0.0, 1.2, 0.0)
	_hazard_area.body_entered.connect(_on_hazard_body_entered)
	add_child(_hazard_area)
	TrapHelper.add_box_collision(_hazard_area, Vector3(7.1, 2.3, 5.0))
	_warning_light = OmniLight3D.new()
	_warning_light.position = Vector3(0.0, 3.6, 0.0)
	_warning_light.light_color = Color(1.0, 0.2, 0.18)
	_warning_light.light_energy = 2.6
	_warning_light.omni_range = 8.0
	add_child(_warning_light)
	_audio = AudioStreamPlayer3D.new()
	_audio.stream = TrapHelper.make_tone(310.0, 0.16, 0.35)
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
	flash.tween_property(_warning_light, "light_energy", 7.0, telegraph_time * 0.5)
	flash.tween_property(_warning_light, "light_energy", 2.4, telegraph_time * 0.5)
	await get_tree().create_timer(telegraph_time).timeout
	_hazard_active = true
	var slam := create_tween()
	slam.tween_property(_ram, "position:y", 0.95, 0.22)
	await slam.finished
	if gm: gm.call("play_effect", "trap-crush-player")
	if multiplayer.is_server():
		_damage_bodies(_hazard_area, DAMAGE_AMOUNT)
	await get_tree().create_timer(0.25).timeout
	_hazard_active = false
	var reset := create_tween()
	reset.tween_property(_ram, "position:y", 3.1, 0.4)
	await reset.finished
	await get_tree().create_timer(cooldown_time).timeout
	_busy = false


func _on_hazard_body_entered(body: Node3D) -> void:
	if not multiplayer.is_server() or not _hazard_active:
		return
	if body.has_method("server_apply_damage"):
		body.call("server_apply_damage", DAMAGE_AMOUNT)


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

