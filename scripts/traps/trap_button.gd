extends Area3D

const TrapHelper = preload("res://scripts/traps/trap_utils.gd")
const ROLE_TRAPPER := 1
const GAME_FONT_PATH := "res://font/Viper/ViperCommandExpandedItalic-Jp6YB.otf"

@export var target_trap: NodePath
@export var button_label: String = "TRAP"
@export var max_use_distance: float = 4.0
@export var cooldown: float = 1.25

@onready var game_manager: Node = get_node("/root/GameManager")

var _button_cap: MeshInstance3D
var _indicator: OmniLight3D
var _audio: AudioStreamPlayer3D
var _cooling_down: bool = false
var _game_font: FontFile


func _ready() -> void:
	_game_font = _load_font_from_file(GAME_FONT_PATH)
	collision_layer = 1
	collision_mask = 1
	monitoring = true
	if not has_node("CollisionShape3D"):
		_build_button()


func server_press(requester_id: int) -> void:
	if not multiplayer.is_server() or _cooling_down:
		return
	var players := game_manager.get("players") as Dictionary
	if players.size() > 1:
		if requester_id not in players:
			return
		if int(players[requester_id]["role"]) != ROLE_TRAPPER:
			return
	var player := get_tree().root.find_child(str(requester_id), true, false)
	if player == null or player.global_position.distance_to(global_position) > max_use_distance:
		return
	var trap: Node = get_node_or_null(target_trap)
	if trap == null or not trap.has_method("server_activate"):
		return
	if bool(trap.call("server_activate", requester_id)):
		_cooling_down = true
		rpc("_sync_press_feedback")
		_release_after_cooldown()


func _release_after_cooldown() -> void:
	await get_tree().create_timer(cooldown).timeout
	_cooling_down = false
	if _indicator:
		_indicator.light_color = Color(0.4, 1.0, 0.5)


func _build_button() -> void:
	TrapHelper.add_box_collision(self, Vector3(1.4, 1.6, 1.4), Vector3(0.0, 0.8, 0.0))
	TrapHelper.add_box_mesh(
		self,
		Vector3(1.5, 0.45, 1.5),
		Vector3(0.0, 0.225, 0.0),
		TrapHelper.make_material(Color(0.18, 0.2, 0.24), 0.0, 0.55, 0.35)
	)
	_button_cap = TrapHelper.add_box_mesh(
		self,
		Vector3(0.9, 0.2, 0.9),
		Vector3(0.0, 0.62, 0.0),
		TrapHelper.make_material(Color(0.9, 0.18, 0.16), 1.6, 0.15, 0.2)
	)
	_indicator = OmniLight3D.new()
	_indicator.position = Vector3(0.0, 1.15, 0.0)
	_indicator.light_color = Color(0.4, 1.0, 0.5)
	_indicator.light_energy = 2.4
	_indicator.omni_range = 5.0
	add_child(_indicator)
	_audio = AudioStreamPlayer3D.new()
	_audio.stream = TrapHelper.make_tone(880.0, 0.12, 0.3)
	_audio.unit_size = 4.0
	add_child(_audio)
	var label_node := Label3D.new()
	label_node.text = button_label
	label_node.font = _game_font
	label_node.position = Vector3(0.0, 1.45, 0.0)
	label_node.font_size = 48
	label_node.modulate = Color(0.85, 0.95, 1.0)
	label_node.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	add_child(label_node)


func _load_font_from_file(font_path: String) -> FontFile:
	var font := FontFile.new()
	font.data = FileAccess.get_file_as_bytes(font_path)
	return font if not font.data.is_empty() else null


@rpc("authority", "call_local", "reliable")
func _sync_press_feedback() -> void:
	if _button_cap == null:
		return
	if _audio:
		_audio.play()
	if _indicator:
		_indicator.light_color = Color(1.0, 0.3, 0.22)
	var tween := create_tween()
	tween.tween_property(_button_cap, "position:y", 0.48, 0.08)
	tween.tween_property(_button_cap, "position:y", 0.62, 0.16)
