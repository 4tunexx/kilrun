extends Area3D

const TrapHelper = preload("res://scripts/traps/trap_utils.gd")
const ROLE_RUNNER := 0
const GAME_FONT_PATH := "res://font/Viper/ViperCommandExpandedItalic-Jp6YB.otf"

@export var target_trap: NodePath
@export var trigger_size: Vector3 = Vector3(7.0, 2.5, 4.0)
@export var retrigger_delay: float = 4.5
@export var trigger_label: String = "AUTO"

@onready var game_manager: Node = get_node("/root/GameManager")

var _indicator: OmniLight3D
var _audio: AudioStreamPlayer3D
var _locked: bool = false
var _game_font: FontFile


func _ready() -> void:
	_game_font = _load_font_from_file(GAME_FONT_PATH)
	collision_layer = 1
	collision_mask = 1
	monitoring = true
	body_entered.connect(_on_body_entered)
	if not has_node("CollisionShape3D"):
		_build_trigger()


func _on_body_entered(body: Node3D) -> void:
	if not multiplayer.is_server() or _locked:
		return
	if not body.has_method("eliminate"):
		return
	var body_id: int = body.name.to_int()
	var players := game_manager.get("players") as Dictionary
	if body_id in players and int(players[body_id]["role"]) != ROLE_RUNNER:
		return
	var trap: Node = get_node_or_null(target_trap)
	if trap == null or not trap.has_method("server_activate"):
		return
	if bool(trap.call("server_activate", body_id)):
		_locked = true
		rpc("_sync_trigger_feedback")
		_unlock_later()


func _unlock_later() -> void:
	await get_tree().create_timer(retrigger_delay).timeout
	_locked = false
	if _indicator:
		_indicator.light_color = Color(0.65, 0.8, 1.0)


func _build_trigger() -> void:
	TrapHelper.add_box_collision(self, trigger_size, Vector3(0.0, trigger_size.y * 0.5, 0.0))
	TrapHelper.add_box_mesh(
		self,
		Vector3(trigger_size.x, 0.06, trigger_size.z),
		Vector3(0.0, 0.03, 0.0),
		TrapHelper.make_material(Color(0.22, 0.7, 1.0, 0.9), 2.2, 0.0, 0.05)
	)
	_indicator = OmniLight3D.new()
	_indicator.position = Vector3(0.0, 1.2, 0.0)
	_indicator.light_color = Color(0.65, 0.8, 1.0)
	_indicator.light_energy = 2.4
	_indicator.omni_range = 6.0
	add_child(_indicator)
	_audio = AudioStreamPlayer3D.new()
	_audio.stream = TrapHelper.make_tone(620.0, 0.18, 0.22)
	_audio.unit_size = 5.0
	add_child(_audio)
	var label_node := Label3D.new()
	label_node.text = trigger_label
	label_node.font = _game_font
	label_node.position = Vector3(0.0, 1.75, 0.0)
	label_node.font_size = 40
	label_node.modulate = Color(0.75, 0.9, 1.0)
	label_node.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	add_child(label_node)


func _load_font_from_file(font_path: String) -> FontFile:
	var font := FontFile.new()
	font.data = FileAccess.get_file_as_bytes(font_path)
	return font if not font.data.is_empty() else null


@rpc("authority", "call_local", "reliable")
func _sync_trigger_feedback() -> void:
	if _audio:
		_audio.play()
	if _indicator:
		_indicator.light_color = Color(1.0, 0.45, 0.18)
