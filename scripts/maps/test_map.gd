@tool
extends Node3D

const TrapHelper = preload("res://scripts/traps/trap_utils.gd")
const TrapButtonScript = preload("res://scripts/traps/trap_button.gd")
const CrusherTrapScript = preload("res://scripts/traps/crusher_trap.gd")
const AxeTrapScript = preload("res://scripts/traps/axe_trap.gd")
const FallingFloorTrapScript = preload("res://scripts/traps/falling_floor_trap.gd")
const SpikeWallTrapScript = preload("res://scripts/traps/spike_wall_trap.gd")
const LaserGateTrapScript = preload("res://scripts/traps/laser_gate_trap.gd")
const TrapperBugScript = preload("res://scripts/traps/trapper_bug.gd")
const GAME_FONT_PATH := "res://font/Viper/ViperCommandExpandedItalic-Jp6YB.otf"

const ROLE_RUNNER := 0
const ROLE_TRAPPER := 1
const BUGS_PER_RUNNER := 4
const BUG_SWARM_FALLBACK_ORIGIN := Vector3(0.0, 0.45, -12.0)
const BUG_SWARM_FALLBACK_TARGET := Vector3(0.0, 0.45, -164.0)
const BUG_SPAWN_INTERVAL: float = 0.5
const CORRIDOR_WIDTH := 8.0
const CORRIDOR_HEIGHT := 4.0
const FLOOR_THICKNESS := 0.4
const MAP_LENGTH := 440.0
const PIPE_CENTER_X := 6.8
const PIPE_WIDTH := 3.0
const PIPE_START_Z := -8.0
const PIPE_END_Z := -242.0
const FALL_GAP_CENTER_Z := -132.0
const FALL_GAP_LENGTH := 12.0
const FINISH_Z := -430.0
const CROUCH_SECTION_Z := -68.0
const CROUCH_SECTION_LENGTH := 14.0
const CLIMB_SECTION_Z := -244.0
const BHOP_SECTION_START_Z := -402.0
const BHOP_SECTION_END_Z := -425.0
const RED_LIGHT_ZONE_CENTER_Z := -427.0
const RED_LIGHT_ZONE_LENGTH := 9.0
const RED_LIGHT_ARM_ZONE_CENTER_Z := -420.0
const RED_LIGHT_ARM_ZONE_LENGTH := 18.0
const RED_LIGHT_DAMAGE: float = 45.0
const RED_LIGHT_MIN_INTERVAL: float = 1.4
const RED_LIGHT_MAX_INTERVAL: float = 4.2
const RED_LIGHT_MOVE_SPEED: float = 0.05
const RED_LIGHT_MOVE_DISTANCE: float = 0.015
const RED_LIGHT_DAMAGE_COOLDOWN: float = 0.85

signal red_light_state_changed(active: bool)
signal bug_swarm_released(owner_peer_id: int, total_bugs: int)

var _built: bool = false
var _game_font: FontFile
var _fan_pivots: Array[Node3D] = []
var _pulse_lights: Array[Dictionary] = []
var _auto_trap_timers: Array[Timer] = []
var _music_player: AudioStreamPlayer
var _bug_swarm_root: Node3D
var _next_bug_id: int = 1
var _red_light_zone: Area3D
var _red_light_arm_zone: Area3D
var _red_light_label: Label3D
var _red_light_beacons: Array[MeshInstance3D] = []
var _red_light_damage_cooldowns: Dictionary = {}
var _red_light_tracked_bodies: Dictionary = {}
var _red_light_is_red: bool = false
var _red_light_switch_timer: float = 0.0
var _red_light_armed: bool = false
var corridor_width: float = CORRIDOR_WIDTH
var controller_pipe_width: float = PIPE_WIDTH
var auto_trap_interval_scale: float = 1.0

@onready var player_spawner: Node3D = $PlayerSpawner
@onready var finish_zone: Area3D = $FinishZone
@onready var death_plane: Area3D = $DeathPlane
@onready var world_environment: WorldEnvironment = $WorldEnvironment
@onready var directional_light: DirectionalLight3D = $DirectionalLight3D
@onready var geometry_root: Node3D = $GeometryRoot
@onready var trap_root: Node3D = $TrapRoot
@onready var fx_root: Node3D = $FxRoot
@onready var game_manager: Node = get_node_or_null("/root/GameManager")


func _players() -> Dictionary:
	if game_manager == null:
		return {}
	return game_manager.get("players") as Dictionary


func _is_authority_active() -> bool:
	if Engine.is_editor_hint():
		return false
	return multiplayer.multiplayer_peer == null or multiplayer.is_server()


func _ready() -> void:
	_game_font = _load_font_from_file(GAME_FONT_PATH)
	_setup_environment()
	if Engine.is_editor_hint():
		if not _built:
			_clear_runtime_content()
			_build_map()
			_set_owners_recursive(geometry_root, self)
			_set_owners_recursive(trap_root, self)
			_set_owners_recursive(fx_root, self)
			_built = true
		_position_runtime_nodes()
		return

	if not _built:
		_clear_runtime_content()
		_build_map()
		_built = true
	_start_ambient_music()
	_position_runtime_nodes()
	_initialize_custom_map_objects()

func _set_owners_recursive(node: Node, new_owner: Node) -> void:
	if node == null:
		return
	for child in node.get_children():
		child.owner = new_owner
		_set_owners_recursive(child, new_owner)
	if not finish_zone.body_entered.is_connected(_on_finish_zone_entered):
		finish_zone.body_entered.connect(_on_finish_zone_entered)
	if not death_plane.body_entered.is_connected(_on_death_plane_body_entered):
		death_plane.body_entered.connect(_on_death_plane_body_entered)
	if game_manager != null:
		if not game_manager.round_started.is_connected(_on_round_started):
			game_manager.round_started.connect(_on_round_started)
		if not game_manager.round_ended.is_connected(_on_round_ended):
			game_manager.round_ended.connect(_on_round_ended)


func _process(delta: float) -> void:
	var time_now: float = Time.get_ticks_msec() * 0.001
	for pivot in _fan_pivots:
		if is_instance_valid(pivot):
			pivot.rotate_z(4.2 * get_process_delta_time())
	for pulse in _pulse_lights:
		var light: OmniLight3D = pulse["light"]
		if is_instance_valid(light):
			var base_energy: float = pulse["base"]
			var amplitude: float = pulse["amplitude"]
			var speed: float = pulse["speed"]
			var phase: float = pulse["phase"]
			light.light_energy = base_energy + sin(time_now * speed + phase) * amplitude
	_update_red_light(delta)


func _setup_environment() -> void:
	var environment := Environment.new()
	var sky_material := ProceduralSkyMaterial.new()
	sky_material.sky_top_color = Color(0.01, 0.02, 0.06)
	sky_material.sky_horizon_color = Color(0.08, 0.11, 0.17)
	sky_material.ground_bottom_color = Color(0.02, 0.02, 0.03)
	sky_material.ground_horizon_color = Color(0.07, 0.06, 0.08)
	sky_material.sky_energy_multiplier = 0.75
	sky_material.ground_energy_multiplier = 0.45
	sky_material.sun_angle_max = 3.8
	var sky := Sky.new()
	sky.sky_material = sky_material
	environment.background_mode = Environment.BG_SKY
	environment.sky = sky
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color(0.2, 0.24, 0.32)
	environment.ambient_light_energy = 1.05
	environment.fog_enabled = true
	environment.fog_density = 0.012
	environment.fog_light_color = Color(0.22, 0.27, 0.33)
	environment.glow_enabled = true
	environment.glow_bloom = 0.05
	world_environment.environment = environment
	directional_light.light_color = Color(0.56, 0.63, 0.86)
	directional_light.light_energy = 0.95
	directional_light.rotation_degrees = Vector3(-34.0, 36.0, 0.0)
	
	if has_meta("env_fog_density"):
		environment.fog_density = float(get_meta("env_fog_density"))
	if has_meta("env_sky_color"):
		sky_material.sky_top_color = get_meta("env_sky_color")
		sky_material.sky_horizon_color = get_meta("env_sky_color").lerp(Color(0,0,0), 0.5)
	if has_meta("env_sun_angle"):
		directional_light.rotation_degrees = Vector3(float(get_meta("env_sun_angle")), 36.0, 0.0)


func _position_runtime_nodes() -> void:
	finish_zone.position = Vector3(0.0, 0.8, FINISH_Z)
	death_plane.position = Vector3(0.0, -8.5, -MAP_LENGTH * 0.5)
	player_spawner.position = Vector3.ZERO
	if player_spawner.has_node("RunnerSpawn1"):
		player_spawner.get_node("RunnerSpawn1").position = Vector3(-1.5, 0.9, -8.0)
		player_spawner.get_node("RunnerSpawn2").position = Vector3(0.0, 0.9, -8.0)
		player_spawner.get_node("RunnerSpawn3").position = Vector3(1.5, 0.9, -8.0)
		player_spawner.get_node("TrapperSpawn").position = Vector3(PIPE_CENTER_X, 0.9, -18.0)


func dev_adjust_corridor_width(delta: float) -> void:
	corridor_width = clamp(corridor_width + delta, 7.0, 10.5)
	_rebuild_runtime_map()


func dev_adjust_pipe_width(delta: float) -> void:
	controller_pipe_width = clamp(controller_pipe_width + delta, 2.2, 4.4)
	_rebuild_runtime_map()


func dev_adjust_auto_trap_speed(delta: float) -> void:
	auto_trap_interval_scale = clamp(auto_trap_interval_scale + delta, 0.45, 1.8)
	_rebuild_runtime_map()


func dev_rebuild_map() -> void:
	_rebuild_runtime_map()


func dev_trigger_trap_wave() -> void:
	if multiplayer.multiplayer_peer == null or multiplayer.is_server():
		_trigger_trap_wave()
		return
	rpc_id(1, "_server_dev_trigger_trap_wave")


func dev_release_bug_pack(bug_count: int = 5) -> void:
	if multiplayer.multiplayer_peer == null or multiplayer.is_server():
		_release_debug_bug_pack(bug_count)
		return
	rpc_id(1, "_server_dev_release_bug_pack", bug_count)


func _trigger_trap_wave() -> void:
	for child in trap_root.get_children():
		if is_instance_valid(child) and child.has_method("server_activate"):
			child.call("server_activate", -1)


func _release_debug_bug_pack(bug_count: int) -> void:
	if not _is_authority_active():
		return
	var total_bugs: int = max(bug_count, 1)
	var start_id: int = _next_bug_id
	_next_bug_id += total_bugs
	var runner_ids: Array = _get_alive_runner_ids()
	var fallback_target: Vector3 = BUG_SWARM_FALLBACK_TARGET
	if not runner_ids.is_empty():
		var runner_node := get_tree().root.find_child(str(runner_ids[0]), true, false)
		if runner_node != null and runner_node is Node3D:
			fallback_target = (runner_node as Node3D).global_position
	var spawn_origin: Vector3 = _get_bug_swarm_origin(-1, true)
	rpc("_client_spawn_bug_swarm", start_id, -1, total_bugs, spawn_origin, fallback_target)


@rpc("any_peer", "call_remote", "reliable")
func _server_dev_trigger_trap_wave() -> void:
	if not multiplayer.is_server():
		return
	_trigger_trap_wave()


@rpc("any_peer", "call_remote", "reliable")
func _server_dev_release_bug_pack(bug_count: int = 5) -> void:
	if not multiplayer.is_server():
		return
	_release_debug_bug_pack(bug_count)


func _rebuild_runtime_map() -> void:
	_clear_runtime_content()
	_build_map()
	_position_runtime_nodes()


func _clear_runtime_content() -> void:
	for timer in _auto_trap_timers:
		if is_instance_valid(timer):
			timer.stop()
			timer.queue_free()
	_auto_trap_timers.clear()
	_fan_pivots.clear()
	_pulse_lights.clear()
	_bug_swarm_root = null
	_red_light_zone = null
	_red_light_arm_zone = null
	_red_light_label = null
	_red_light_beacons.clear()
	_red_light_damage_cooldowns.clear()
	_red_light_tracked_bodies.clear()
	_red_light_is_red = false
	_red_light_switch_timer = 0.0
	_red_light_armed = false
	for root in [geometry_root, trap_root, fx_root]:
		for child in root.get_children():
			child.free()


func _build_map() -> void:
	var floor_mat: StandardMaterial3D = TrapHelper.make_material(Color(0.27, 0.29, 0.33), 0.0, 0.45, 0.58)
	var wall_mat: StandardMaterial3D = TrapHelper.make_material(Color(0.16, 0.18, 0.22), 0.0, 0.55, 0.42)
	var accent_mat: StandardMaterial3D = TrapHelper.make_material(Color(0.72, 0.14, 0.14), 1.0, 0.15, 0.22)
	var trim_mat: StandardMaterial3D = TrapHelper.make_material(Color(0.8, 0.8, 0.84), 0.2, 0.7, 0.18)
	var glass_mat := StandardMaterial3D.new()
	glass_mat.albedo_color = Color(0.45, 0.88, 1.0, 0.18)
	glass_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	glass_mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	glass_mat.roughness = 0.04
	glass_mat.emission_enabled = true
	glass_mat.emission = Color(0.24, 0.55, 0.8)
	glass_mat.emission_energy_multiplier = 0.55

	_build_runner_lane(floor_mat, wall_mat, glass_mat, trim_mat, accent_mat)
	_build_controller_pipe(floor_mat, wall_mat, glass_mat, accent_mat)
	_build_ambient_fx(floor_mat, trim_mat, accent_mat)
	_build_traps()
	_build_finish_stretch(floor_mat, accent_mat)


func _build_runner_lane(
	floor_mat: StandardMaterial3D,
	wall_mat: StandardMaterial3D,
	glass_mat: StandardMaterial3D,
	trim_mat: StandardMaterial3D,
	accent_mat: StandardMaterial3D
) -> void:
	var lane_start_z := 2.0
	var lane_center_z := (lane_start_z - MAP_LENGTH) * 0.5
	var lane_length: float = absf(-MAP_LENGTH - lane_start_z)
	var lane_half_width := corridor_width * 0.5
	var fall_gap_near_z: float = FALL_GAP_CENTER_Z + (FALL_GAP_LENGTH * 0.5)
	var fall_gap_far_z: float = FALL_GAP_CENTER_Z - (FALL_GAP_LENGTH * 0.5)
	var final_platform_start_z: float = FINISH_Z + 1.4
	var left_wall_x: float = -lane_half_width - 0.55
	var right_shell_x: float = lane_half_width + 0.28
	_add_floor_segment(geometry_root, 0.0, lane_start_z, fall_gap_near_z, corridor_width, floor_mat)
	_add_floor_segment(geometry_root, 0.0, fall_gap_far_z, BHOP_SECTION_START_Z, corridor_width, floor_mat)
	_add_floor_segment(geometry_root, 0.0, final_platform_start_z, -MAP_LENGTH, corridor_width, floor_mat)
	var under_floor_mat := TrapHelper.make_material(Color(0.08, 0.09, 0.11), 0.0, 0.15, 0.92)
	_add_static_box(geometry_root, Vector3(0.0, -0.42, (lane_start_z + fall_gap_near_z) * 0.5), Vector3(corridor_width + 0.9, 0.16, absf(fall_gap_near_z - lane_start_z)), under_floor_mat)
	_add_static_box(geometry_root, Vector3(0.0, -0.42, (fall_gap_far_z + BHOP_SECTION_START_Z) * 0.5), Vector3(corridor_width + 0.9, 0.16, absf(BHOP_SECTION_START_Z - fall_gap_far_z)), under_floor_mat)
	_add_static_box(geometry_root, Vector3(0.0, -0.42, (final_platform_start_z + -MAP_LENGTH) * 0.5), Vector3(corridor_width + 0.9, 0.16, absf(-MAP_LENGTH - final_platform_start_z)), under_floor_mat)
	_add_static_box(geometry_root, Vector3(left_wall_x, 1.86, lane_center_z), Vector3(0.45, 4.16, lane_length), wall_mat)
	_add_static_box(geometry_root, Vector3(right_shell_x, 0.64, lane_center_z), Vector3(0.34, 1.28, lane_length), wall_mat)
	_add_static_box(geometry_root, Vector3(right_shell_x, 1.72, lane_center_z), Vector3(0.12, 3.22, lane_length), glass_mat)
	_add_static_box(geometry_root, Vector3(0.0, CORRIDOR_HEIGHT + 0.18, lane_center_z), Vector3(corridor_width + 0.92, 0.18, lane_length), wall_mat)
	_add_static_box(geometry_root, Vector3(right_shell_x + 0.14, 0.14, lane_center_z), Vector3(0.18, 0.1, lane_length), trim_mat)
	_add_static_box(geometry_root, Vector3(right_shell_x + 0.14, 3.28, lane_center_z), Vector3(0.18, 0.1, lane_length), trim_mat)
	_add_static_box(geometry_root, Vector3(left_wall_x + 0.15, 3.28, lane_center_z), Vector3(0.18, 0.1, lane_length), trim_mat)
	for support_index in 15:
		var support_z: float = -6.0 - float(support_index) * 29.0
		_add_static_box(geometry_root, Vector3(left_wall_x + 0.16, 1.68, support_z), Vector3(0.14, 3.26, 0.22), trim_mat)
		_add_static_box(geometry_root, Vector3(right_shell_x + 0.08, 1.68, support_z), Vector3(0.14, 3.26, 0.22), trim_mat)
	for frame_index in 12:
		var frame_z: float = -18.0 - float(frame_index) * 34.0
		_add_static_box(geometry_root, Vector3(0.0, 1.94, frame_z), Vector3(corridor_width + 0.92, 0.12, 0.22), accent_mat)
		_add_static_box(geometry_root, Vector3(0.0, 3.62, frame_z), Vector3(corridor_width + 0.58, 0.08, 0.14), trim_mat)
	_add_crouch_tunnel(lane_half_width, wall_mat, trim_mat, accent_mat)
	_add_climb_section(floor_mat, trim_mat, accent_mat)
	_add_bhop_section(floor_mat, accent_mat)
	_add_lava_pit(FALL_GAP_CENTER_Z, FALL_GAP_LENGTH + 6.0, corridor_width + 0.9)
	_add_lava_pit((BHOP_SECTION_START_Z + FINISH_Z) * 0.5, absf(FINISH_Z - BHOP_SECTION_START_Z) + 14.0, corridor_width + 1.2)
	_add_logo_sign(Vector3(left_wall_x + 0.28, 2.15, -104.0), 90.0, Vector2(2.8, 1.2))
	_add_logo_sign(Vector3(left_wall_x + 0.28, 2.15, -298.0), 90.0, Vector2(2.8, 1.2))


func _add_crouch_tunnel(lane_half_width: float, wall_mat: Material, _trim_mat: Material, accent_mat: Material) -> void:
	_add_static_box(geometry_root, Vector3(0.0, 1.08, CROUCH_SECTION_Z), Vector3(corridor_width - 1.4, 0.16, CROUCH_SECTION_LENGTH), wall_mat)
	_add_static_box(geometry_root, Vector3(-lane_half_width + 0.95, 0.58, CROUCH_SECTION_Z), Vector3(1.6, 1.16, CROUCH_SECTION_LENGTH), wall_mat)
	_add_static_box(geometry_root, Vector3(lane_half_width - 0.82, 0.58, CROUCH_SECTION_Z), Vector3(1.34, 1.16, CROUCH_SECTION_LENGTH), wall_mat)
	_add_box_prop(fx_root, Vector3(0.0, 1.16, CROUCH_SECTION_Z - (CROUCH_SECTION_LENGTH * 0.5) + 0.35), Vector3(corridor_width - 1.2, 0.04, 0.18), accent_mat)
	var crouch_label := Label3D.new()
	crouch_label.text = "CROUCH"
	crouch_label.font = _game_font
	crouch_label.position = Vector3(0.0, 1.18, CROUCH_SECTION_Z - (CROUCH_SECTION_LENGTH * 0.5) + 0.65)
	crouch_label.font_size = 46
	crouch_label.modulate = Color(1.0, 0.88, 0.82)
	crouch_label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	fx_root.add_child(crouch_label)


func _add_climb_section(floor_mat: Material, trim_mat: Material, accent_mat: Material) -> void:
	var step_width: float = corridor_width * 0.58
	var step_length: float = 2.5
	var climb_x: float = -0.9
	for step_index in 4:
		var step_height: float = 0.18 * float(step_index + 1)
		var step_z: float = CLIMB_SECTION_Z + 7.4 - float(step_index) * 2.8
		_add_static_box(geometry_root, Vector3(climb_x, step_height * 0.5, step_z), Vector3(step_width, step_height, step_length), floor_mat)
		_add_box_prop(fx_root, Vector3(climb_x, step_height + 0.02, step_z), Vector3(step_width * 0.98, 0.04, 0.1), accent_mat)
	_add_static_box(geometry_root, Vector3(climb_x, 0.63, CLIMB_SECTION_Z - 1.4), Vector3(step_width, 1.26, 3.2), floor_mat)
	for step_index in 4:
		var down_height: float = 0.18 * float(4 - step_index)
		var down_z: float = CLIMB_SECTION_Z - 4.8 - float(step_index) * 2.8
		_add_static_box(geometry_root, Vector3(climb_x + 0.72, down_height * 0.5, down_z), Vector3(step_width, down_height, step_length), floor_mat)
		_add_box_prop(fx_root, Vector3(climb_x + 0.72, down_height + 0.02, down_z), Vector3(step_width * 0.98, 0.04, 0.1), trim_mat)


func _add_bhop_section(floor_mat: Material, accent_mat: Material) -> void:
	var pads: Array[Dictionary] = [
		{"x": -2.2, "z": -406.0, "length": 3.6},
		{"x": 2.1, "z": -412.5, "length": 3.6},
		{"x": -0.2, "z": -419.0, "length": 3.4},
		{"x": 2.0, "z": -425.8, "length": 3.4},
		{"x": 0.0, "z": -432.0, "length": 3.8}
	]
	for pad in pads:
		var pad_x: float = pad["x"]
		var pad_z: float = pad["z"]
		var pad_length: float = pad["length"]
		var visual_width: float = 3.4
		var visual_height: float = 0.14
		var collision_width: float = 4.15
		var collision_length: float = pad_length + 0.82
		_add_static_box(geometry_root, Vector3(pad_x, 0.07, pad_z), Vector3(visual_width, visual_height, pad_length), floor_mat)
		_add_collision_box(geometry_root, Vector3(pad_x, 0.02, pad_z), Vector3(collision_width, 0.24, collision_length))
		_add_box_prop(fx_root, Vector3(pad_x, 0.23, pad_z), Vector3(2.18, 0.03, 0.12), accent_mat)
	for light_index in 4:
		var light_z: float = BHOP_SECTION_START_Z - 4.0 - float(light_index) * 4.8
		_add_pulse_light(Vector3(0.0, -0.45, light_z), Color(0.52, 0.12, 0.86), 1.8, 1.2 + float(light_index) * 0.08)


func _add_logo_sign(sign_position: Vector3, yaw_degrees: float, size: Vector2) -> void:
	var sign_root := Node3D.new()
	sign_root.position = sign_position
	sign_root.rotation_degrees.y = yaw_degrees
	fx_root.add_child(sign_root)
	_add_box_prop(sign_root, Vector3.ZERO, Vector3(size.x, size.y, 0.08), TrapHelper.make_material(Color(0.05, 0.06, 0.08), 0.0, 0.28, 0.16))
	_add_box_prop(sign_root, Vector3(0.0, 0.0, 0.05), Vector3(size.x - 0.14, size.y - 0.14, 0.02), TrapHelper.make_material(Color(0.08, 0.09, 0.12), 0.0, 0.18, 0.08))
	var logo := Label3D.new()
	logo.text = "KILL RUN"
	logo.font = _game_font
	logo.position = Vector3(0.0, 0.0, 0.08)
	logo.font_size = 76
	logo.modulate = Color(0.98, 0.96, 0.96)
	sign_root.add_child(logo)
	var strip := _add_box_prop(sign_root, Vector3(0.0, -size.y * 0.26, 0.055), Vector3(size.x - 0.14, 0.08, 0.02), TrapHelper.make_material(Color(0.9, 0.15, 0.14), 2.2, 0.0, 0.1))
	strip.material_override = TrapHelper.make_material(Color(0.9, 0.15, 0.14), 2.2, 0.0, 0.1)


func _build_controller_pipe(
	floor_mat: StandardMaterial3D,
	wall_mat: StandardMaterial3D,
	glass_mat: StandardMaterial3D,
	accent_mat: StandardMaterial3D
) -> void:
	var pipe_length: float = abs(PIPE_END_Z - PIPE_START_Z)
	var pipe_center_z: float = (PIPE_START_Z + PIPE_END_Z) * 0.5
	var pipe_half_width := controller_pipe_width * 0.5
	_add_floor_segment(geometry_root, PIPE_CENTER_X, PIPE_START_Z, PIPE_END_Z, controller_pipe_width, floor_mat)
	_add_static_box(geometry_root, Vector3(PIPE_CENTER_X, -0.42, pipe_center_z), Vector3(controller_pipe_width + 0.4, 0.14, pipe_length + 0.3), TrapHelper.make_material(Color(0.06, 0.07, 0.09), 0.0, 0.14, 0.95))
	_add_static_box(
		geometry_root,
		Vector3(PIPE_CENTER_X, 3.35, pipe_center_z),
		Vector3(controller_pipe_width, 0.24, pipe_length + 0.3),
		wall_mat
	)
	_add_static_box(
		geometry_root,
		Vector3(PIPE_CENTER_X + pipe_half_width + 0.2, 1.55, pipe_center_z),
		Vector3(0.4, 3.4, pipe_length + 0.3),
		wall_mat
	)
	_add_static_box(
		geometry_root,
		Vector3(PIPE_CENTER_X - pipe_half_width - 0.1, 1.55, pipe_center_z),
		Vector3(0.16, 3.1, pipe_length + 0.3),
		glass_mat
	)
	_add_static_box(
		geometry_root,
		Vector3(PIPE_CENTER_X, 1.55, PIPE_START_Z),
		Vector3(controller_pipe_width, 3.1, 0.16),
		glass_mat
	)
	_add_static_box(
		geometry_root,
		Vector3(PIPE_CENTER_X, 1.55, PIPE_END_Z),
		Vector3(controller_pipe_width, 3.1, 0.16),
		glass_mat
	)
	for support_index in 7:
		var support_z: float = -18.0 - float(support_index) * 32.0
		_add_static_box(geometry_root, Vector3(PIPE_CENTER_X, 3.42, support_z), Vector3(controller_pipe_width + 0.3, 0.1, 0.24), accent_mat)
		_add_static_box(geometry_root, Vector3(PIPE_CENTER_X - pipe_half_width + 0.08, 1.68, support_z), Vector3(0.1, 3.0, 0.16), accent_mat)
		_add_static_box(geometry_root, Vector3(PIPE_CENTER_X + pipe_half_width - 0.08, 1.68, support_z), Vector3(0.1, 3.0, 0.16), accent_mat)


func _build_ambient_fx(
	floor_mat: StandardMaterial3D,
	trim_mat: StandardMaterial3D,
	accent_mat: StandardMaterial3D
) -> void:
	for fan_z in [-58.0, -154.0, -248.0, -342.0]:
		_add_rotating_fan(Vector3(0.0, 3.25, fan_z), trim_mat)
	for steam_z in [-74.0, -184.0, -314.0]:
		_add_steam_vent(Vector3(-3.2, 0.0, steam_z), accent_mat)
		_add_steam_vent(Vector3(3.1, 0.0, steam_z - 12.0), accent_mat)
	for machine_z in [-52.0, -146.0, -238.0, -332.0]:
		_add_static_box(fx_root, Vector3(-6.8, 1.1, machine_z), Vector3(2.4, 2.2, 3.8), floor_mat)
		_add_static_box(fx_root, Vector3(10.8, 1.0, machine_z - 8.0), Vector3(1.8, 2.0, 3.0), floor_mat)
	for light_index in 9:
		var light_z: float = -18.0 - float(light_index) * 46.0
		_add_pulse_light(Vector3(0.0, 3.55, light_z), Color(1.0, 0.2, 0.16), 2.6, 1.3 + float(light_index) * 0.05)
	for dust_z in [-44.0, -138.0, -232.0, -326.0]:
		_add_dust_volume(Vector3(0.0, 1.5, dust_z), Vector3(3.5, 1.2, 18.0))
	for pipe_dust_z in [-88.0, -196.0]:
		_add_dust_volume(Vector3(PIPE_CENTER_X, 1.45, pipe_dust_z), Vector3(1.1, 0.9, 20.0))
	var stray_red_lights := [
		{"position": Vector3(-6.4, 1.3, -36.0), "energy": 1.6, "speed": 0.8},
		{"position": Vector3(9.6, 1.8, -82.0), "energy": 1.9, "speed": 1.1},
		{"position": Vector3(-6.8, 2.2, -146.0), "energy": 1.8, "speed": 0.9},
		{"position": Vector3(9.2, 1.2, -212.0), "energy": 1.7, "speed": 1.05},
		{"position": Vector3(-6.1, 2.0, -288.0), "energy": 2.0, "speed": 0.95},
		{"position": Vector3(9.9, 1.5, -356.0), "energy": 1.85, "speed": 1.2}
	]
	for light_def in stray_red_lights:
		_add_stray_red_light(light_def["position"], light_def["energy"], light_def["speed"])
	_add_moon(Vector3(-96.0, 76.0, -312.0))


func _build_traps() -> void:
	var manual_traps: Array[Dictionary] = [
		{"name": "ControlCrusher", "script": CrusherTrapScript, "position": Vector3(0.0, 0.0, -42.0), "label": "CRUSH"},
		{"name": "ControlAxe", "script": AxeTrapScript, "position": Vector3(0.0, 0.0, -90.0), "label": "AXE"},
		{"name": "ControlFloor", "script": FallingFloorTrapScript, "position": Vector3(0.0, 0.0, FALL_GAP_CENTER_Z), "label": "DROP"},
		{"name": "ControlSpike", "script": SpikeWallTrapScript, "position": Vector3(0.0, 0.0, -176.0), "label": "SPIKES"},
		{"name": "ControlLaser", "script": LaserGateTrapScript, "position": Vector3(0.0, 0.0, -220.0), "label": "LASER"}
	]
	for trap_def in manual_traps:
		var trap := Node3D.new()
		trap.name = trap_def["name"]
		trap.set_script(trap_def["script"])
		trap.position = trap_def["position"]
		trap_root.add_child(trap)
		var button := Area3D.new()
		button.name = "%sButton" % trap_def["name"]
		button.set_script(TrapButtonScript)
		button.set("button_label", trap_def["label"])
		button.position = Vector3(PIPE_CENTER_X, 0.0, trap.position.z)
		trap_root.add_child(button)
		button.set("target_trap", button.get_path_to(trap))
		_add_static_box(fx_root, Vector3(PIPE_CENTER_X - 0.9, 0.55, trap.position.z), Vector3(1.7, 0.14, 1.2), TrapHelper.make_material(Color(0.25, 0.28, 0.32), 0.0, 0.35, 0.4))
		_add_box_prop(fx_root, Vector3(PIPE_CENTER_X - 1.95, 0.9, trap.position.z), Vector3(1.2, 0.18, 0.18), TrapHelper.make_material(Color(0.95, 0.2, 0.18), 1.2, 0.0, 0.25))

	var auto_traps: Array[Dictionary] = [
		{"name": "AutoCrusher", "script": CrusherTrapScript, "position": Vector3(0.0, 0.0, -264.0), "label": "AUTO-01", "interval": 5.2, "delay": 1.0},
		{"name": "AutoAxe", "script": AxeTrapScript, "position": Vector3(0.0, 0.0, -306.0), "label": "AUTO-02", "interval": 4.6, "delay": 2.2},
		{"name": "AutoSpike", "script": SpikeWallTrapScript, "position": Vector3(0.0, 0.0, -348.0), "label": "AUTO-03", "interval": 5.6, "delay": 3.0},
		{"name": "AutoLaser", "script": LaserGateTrapScript, "position": Vector3(0.0, 0.0, -388.0), "label": "AUTO-04", "interval": 4.2, "delay": 4.1}
	]
	for trap_def in auto_traps:
		var trap := Node3D.new()
		trap.name = trap_def["name"]
		trap.set_script(trap_def["script"])
		trap.position = trap_def["position"]
		trap_root.add_child(trap)
		_add_auto_trap_beacon(Vector3(corridor_width * 0.5 - 0.75, 2.4, trap.position.z), trap_def["label"])
		_setup_auto_trap_cycle(trap, float(trap_def["interval"]), float(trap_def["delay"]))


func _build_finish_stretch(floor_mat: StandardMaterial3D, accent_mat: StandardMaterial3D) -> void:
	_add_static_box(geometry_root, Vector3(0.0, -0.2, FINISH_Z - 5.0), Vector3(7.8, FLOOR_THICKNESS, 10.0), floor_mat)
	_add_box_prop(fx_root, Vector3(0.0, 0.12, FINISH_Z), Vector3(7.8, 0.1, 8.0), TrapHelper.make_material(Color(0.14, 0.75, 0.3), 2.5, 0.0, 0.1))
	_add_box_prop(fx_root, Vector3(0.0, 3.0, FINISH_Z + 4.0), Vector3(8.4, 0.2, 0.2), accent_mat)
	_add_box_prop(fx_root, Vector3(-4.0, 1.5, FINISH_Z + 4.0), Vector3(0.2, 3.0, 0.2), accent_mat)
	_add_box_prop(fx_root, Vector3(4.0, 1.5, FINISH_Z + 4.0), Vector3(0.2, 3.0, 0.2), accent_mat)
	_build_red_light_trap(accent_mat)


func _add_floor_segment(
	parent: Node3D,
	center_x: float,
	start_z: float,
	end_z: float,
	width: float,
	material: Material
) -> void:
	var length: float = abs(end_z - start_z)
	var center_z: float = (start_z + end_z) * 0.5
	_add_static_box(parent, Vector3(center_x, -0.2, center_z), Vector3(width, FLOOR_THICKNESS, length), material)


func _add_lava_pit(center_z: float, length: float, width: float) -> void:
	var pit_shell := TrapHelper.make_material(Color(0.04, 0.03, 0.03), 0.0, 0.12, 0.92)
	var lava_mat := TrapHelper.make_material(Color(1.0, 0.24, 0.06), 3.2, 0.04, 0.08)
	var ember_mat := TrapHelper.make_material(Color(1.0, 0.46, 0.18), 3.8, 0.0, 0.06)
	var pit_depth: float = 11.4
	var pit_bottom_y: float = -5.9
	var side_wall_thickness: float = 0.42
	var end_wall_thickness: float = 0.58
	_add_box_prop(fx_root, Vector3(-(width * 0.5) - 0.44, pit_bottom_y, center_z), Vector3(side_wall_thickness, pit_depth, length + 1.8), pit_shell)
	_add_box_prop(fx_root, Vector3((width * 0.5) + 0.44, pit_bottom_y, center_z), Vector3(side_wall_thickness, pit_depth, length + 1.8), pit_shell)
	_add_box_prop(fx_root, Vector3(0.0, pit_bottom_y, center_z - (length * 0.5) - 0.58), Vector3(width + 1.3, pit_depth, end_wall_thickness), pit_shell)
	_add_box_prop(fx_root, Vector3(0.0, pit_bottom_y, center_z + (length * 0.5) + 0.58), Vector3(width + 1.3, pit_depth, end_wall_thickness), pit_shell)
	_add_box_prop(fx_root, Vector3(0.0, -11.45, center_z), Vector3(width + 1.3, 0.34, length + 1.8), pit_shell)
	_add_box_prop(fx_root, Vector3(0.0, -5.1, center_z), Vector3(width * 0.98, 0.12, length * 0.98), lava_mat)
	_add_box_prop(fx_root, Vector3(0.0, -4.88, center_z), Vector3(width * 0.78, 0.04, length * 0.78), ember_mat)
	_add_pulse_light(Vector3(0.0, -4.0, center_z - length * 0.18), Color(1.0, 0.24, 0.08), 3.0, 1.2)
	_add_pulse_light(Vector3(0.0, -4.0, center_z + length * 0.18), Color(1.0, 0.16, 0.06), 2.6, 1.0)


func _add_static_box(parent: Node3D, node_position: Vector3, size: Vector3, material: Material) -> StaticBody3D:
	var body := StaticBody3D.new()
	body.position = node_position
	parent.add_child(body)
	TrapHelper.add_box_mesh(body, size, Vector3.ZERO, material)
	TrapHelper.add_box_collision(body, size)
	return body


func _add_collision_box(parent: Node3D, node_position: Vector3, size: Vector3) -> StaticBody3D:
	var body := StaticBody3D.new()
	body.position = node_position
	parent.add_child(body)
	TrapHelper.add_box_collision(body, size)
	return body


func _add_box_prop(parent: Node3D, node_position: Vector3, size: Vector3, material: Material) -> MeshInstance3D:
	return TrapHelper.add_box_mesh(parent, size, node_position, material)


func _add_rotating_fan(fan_position: Vector3, blade_mat: Material) -> void:
	var pivot := Node3D.new()
	pivot.position = fan_position
	fx_root.add_child(pivot)
	_add_box_prop(pivot, Vector3.ZERO, Vector3(0.35, 0.35, 0.35), blade_mat)
	for blade_index in 4:
		var blade := _add_box_prop(pivot, Vector3(0.0, 0.0, 0.0), Vector3(0.16, 2.4, 0.08), blade_mat)
		blade.rotation.z = deg_to_rad(float(blade_index) * 90.0)
	_fan_pivots.append(pivot)


func _add_steam_vent(vent_position: Vector3, accent_mat: Material) -> void:
	_add_box_prop(fx_root, vent_position + Vector3(0.0, 0.16, 0.0), Vector3(0.45, 0.32, 0.45), accent_mat)
	var particles := GPUParticles3D.new()
	particles.position = vent_position + Vector3(0.0, 0.3, 0.0)
	particles.amount = 30
	particles.lifetime = 1.6
	particles.draw_pass_1 = SphereMesh.new()
	var process := ParticleProcessMaterial.new()
	process.direction = Vector3(0.0, 1.0, 0.0)
	process.initial_velocity_min = 0.8
	process.initial_velocity_max = 1.7
	process.gravity = Vector3(0.0, 0.5, 0.0)
	process.scale_min = 0.15
	process.scale_max = 0.35
	process.color = Color(0.85, 0.88, 0.92, 0.55)
	particles.process_material = process
	particles.emitting = true
	fx_root.add_child(particles)


func _add_dust_volume(volume_position: Vector3, extents: Vector3) -> void:
	var particles := GPUParticles3D.new()
	particles.position = volume_position
	particles.amount = 45
	particles.lifetime = 6.0
	particles.preprocess = 6.0
	particles.visibility_aabb = AABB(-extents, extents * 2.0)
	var dust_mesh := SphereMesh.new()
	dust_mesh.radius = 0.03
	dust_mesh.height = 0.06
	particles.draw_pass_1 = dust_mesh
	var process := ParticleProcessMaterial.new()
	process.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	process.emission_box_extents = extents
	process.direction = Vector3(0.15, 1.0, 0.05)
	process.spread = 20.0
	process.initial_velocity_min = 0.03
	process.initial_velocity_max = 0.12
	process.gravity = Vector3(0.0, 0.04, 0.0)
	process.scale_min = 0.02
	process.scale_max = 0.05
	process.color = Color(0.82, 0.84, 0.88, 0.14)
	particles.process_material = process
	particles.emitting = true
	fx_root.add_child(particles)


func _add_stray_red_light(light_position: Vector3, base_energy: float, speed: float) -> void:
	_add_box_prop(fx_root, light_position, Vector3(0.12, 0.12, 0.12), TrapHelper.make_material(Color(1.0, 0.1, 0.1), 2.8, 0.0, 0.08))
	_add_pulse_light(light_position, Color(1.0, 0.12, 0.1), base_energy, speed)


func _add_auto_trap_beacon(beacon_position: Vector3, label: String) -> void:
	_add_box_prop(fx_root, beacon_position, Vector3(0.12, 0.95, 0.12), TrapHelper.make_material(Color(0.2, 0.22, 0.28), 0.0, 0.42, 0.35))
	_add_box_prop(fx_root, beacon_position + Vector3(0.0, 0.58, 0.0), Vector3(0.22, 0.22, 0.22), TrapHelper.make_material(Color(0.95, 0.16, 0.14), 2.6, 0.0, 0.1))
	_add_pulse_light(beacon_position + Vector3(0.0, 0.58, 0.0), Color(1.0, 0.18, 0.14), 2.2, 1.0)
	var label_node := Label3D.new()
	label_node.text = label
	label_node.font = _game_font
	label_node.position = beacon_position + Vector3(0.0, 1.0, 0.0)
	label_node.font_size = 44
	label_node.modulate = Color(1.0, 0.82, 0.8)
	label_node.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	fx_root.add_child(label_node)


func _setup_auto_trap_cycle(trap: Node, interval: float, startup_delay: float) -> void:
	if Engine.is_editor_hint():
		return
	var starter := Timer.new()
	starter.one_shot = true
	starter.wait_time = max(startup_delay * auto_trap_interval_scale, 0.15)
	trap_root.add_child(starter)
	_auto_trap_timers.append(starter)
	starter.timeout.connect(func() -> void:
		if not is_instance_valid(trap):
			return
		_activate_auto_trap(trap)
		if is_instance_valid(starter):
			starter.queue_free()
			_auto_trap_timers.erase(starter)
		var loop_timer := Timer.new()
		loop_timer.wait_time = max(interval * auto_trap_interval_scale, 0.35)
		loop_timer.one_shot = false
		trap_root.add_child(loop_timer)
		_auto_trap_timers.append(loop_timer)
		loop_timer.timeout.connect(func() -> void:
			_activate_auto_trap(trap)
		)
		if multiplayer.multiplayer_peer != null and multiplayer.is_server():
			loop_timer.start()
	)
	if multiplayer.multiplayer_peer != null and multiplayer.is_server():
		starter.start()


func _activate_auto_trap(trap: Node) -> void:
	if multiplayer.multiplayer_peer == null or not multiplayer.is_server():
		return
	if is_instance_valid(trap) and trap.has_method("server_activate"):
		trap.call("server_activate", -1)


func _add_moon(moon_position: Vector3) -> void:
	var moon := MeshInstance3D.new()
	var moon_mesh := SphereMesh.new()
	moon_mesh.radius = 5.0
	moon_mesh.height = 10.0
	moon.mesh = moon_mesh
	moon.position = moon_position
	moon.material_override = TrapHelper.make_material(Color(0.85, 0.88, 0.98), 1.4, 0.0, 0.18)
	fx_root.add_child(moon)


func _start_ambient_music() -> void:
	# Use centralized GameManager music routing when available.
	if game_manager != null:
		if is_instance_valid(_music_player):
			_music_player.stop()
			_music_player.queue_free()
			_music_player = null
		return
	if is_instance_valid(_music_player):
		if not _music_player.playing:
			_music_player.play()
		return
	_music_player = AudioStreamPlayer.new()
	_music_player.name = "AmbientMusic"
	_music_player.bus = "Master"
	_music_player.volume_db = -17.0
	_music_player.stream = _make_ambient_music_loop()
	add_child(_music_player)
	_music_player.play()


func _make_ambient_music_loop() -> AudioStreamWAV:
	var loop_seconds := 12.0
	var sample_hz := 22050
	var sample_count := int(loop_seconds * float(sample_hz))
	var edge_window := 0.08
	var bass_pattern := [55.0, 55.0, 65.41, 55.0, 82.41, 73.42, 65.41, 49.0]
	var lead_pattern := [220.0, 246.94, 261.63, 246.94]
	var data := PackedByteArray()
	data.resize(sample_count * 2)
	for sample_index in sample_count:
		var t: float = float(sample_index) / float(sample_hz)
		var beat_index: int = int(floor(t * 2.0))
		var bass_freq: float = bass_pattern[beat_index % bass_pattern.size()]
		var lead_freq: float = lead_pattern[int(floor(t * 0.5)) % lead_pattern.size()]
		var beat_phase: float = fmod(t, 0.5) / 0.5
		var pulse: float = pow(max(0.0, 1.0 - beat_phase), 2.2)
		var bass: float = sin(TAU * bass_freq * t) * (0.3 + pulse * 0.2)
		var drone: float = sin(TAU * 41.2 * t) * 0.18 + sin(TAU * 82.4 * t + sin(TAU * 0.125 * t) * 0.4) * 0.08
		var lead_gate: float = 0.35 + max(0.0, sin(TAU * 0.25 * t)) * 0.25
		var lead: float = sin(TAU * lead_freq * t + sin(TAU * 2.0 * t) * 0.15) * lead_gate * 0.09
		var hiss: float = (sin(TAU * 880.0 * t) + sin(TAU * 1320.0 * t)) * 0.01 * (0.5 + 0.5 * sin(TAU * 0.125 * t))
		var edge_fade: float = min(1.0, min(t / edge_window, (loop_seconds - t) / edge_window))
		var sample_value: float = clamp((bass * 0.5 + drone + lead + hiss) * 0.65 * edge_fade, -1.0, 1.0)
		data.encode_s16(sample_index * 2, int(sample_value * 32767.0))
	var stream := AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_16_BITS
	stream.mix_rate = sample_hz
	stream.stereo = false
	stream.data = data
	stream.loop_mode = AudioStreamWAV.LOOP_FORWARD
	stream.loop_begin = 0
	stream.loop_end = sample_count
	return stream


func _add_pulse_light(light_position: Vector3, color: Color, base_energy: float, speed: float) -> void:
	var light := OmniLight3D.new()
	light.position = light_position
	light.light_color = color
	light.light_energy = base_energy
	light.omni_range = 10.0
	fx_root.add_child(light)
	_pulse_lights.append({
		"light": light,
		"base": base_energy,
		"amplitude": base_energy * 0.35,
		"speed": speed,
		"phase": light_position.z * 0.02
	})


func _build_red_light_trap(accent_mat: StandardMaterial3D) -> void:
	var pillar_size := Vector3(0.2, 3.1, 0.2)
	_add_box_prop(fx_root, Vector3(-3.8, 1.55, RED_LIGHT_ZONE_CENTER_Z), pillar_size, accent_mat)
	_add_box_prop(fx_root, Vector3(3.8, 1.55, RED_LIGHT_ZONE_CENTER_Z), pillar_size, accent_mat)
	_add_box_prop(fx_root, Vector3(0.0, 3.06, RED_LIGHT_ZONE_CENTER_Z), Vector3(7.6, 0.16, 0.22), accent_mat)
	_add_box_prop(fx_root, Vector3(0.0, 0.18, RED_LIGHT_ZONE_CENTER_Z - RED_LIGHT_ZONE_LENGTH * 0.35), Vector3(corridor_width * 0.8, 0.04, 0.18), TrapHelper.make_material(Color(0.16, 0.75, 0.28), 2.0, 0.0, 0.1))
	_add_box_prop(fx_root, Vector3(0.0, 0.18, RED_LIGHT_ZONE_CENTER_Z + RED_LIGHT_ZONE_LENGTH * 0.35), Vector3(corridor_width * 0.8, 0.04, 0.18), TrapHelper.make_material(Color(0.88, 0.16, 0.14), 2.2, 0.0, 0.1))
	var left_beacon: MeshInstance3D = _add_box_prop(fx_root, Vector3(-2.15, 2.52, RED_LIGHT_ZONE_CENTER_Z), Vector3(1.2, 0.22, 0.22), TrapHelper.make_material(Color(0.16, 0.75, 0.28), 3.0, 0.0, 0.08))
	var right_beacon: MeshInstance3D = _add_box_prop(fx_root, Vector3(2.15, 2.52, RED_LIGHT_ZONE_CENTER_Z), Vector3(1.2, 0.22, 0.22), TrapHelper.make_material(Color(0.88, 0.16, 0.14), 3.0, 0.0, 0.08))
	_red_light_beacons = [left_beacon, right_beacon]
	_red_light_label = Label3D.new()
	_red_light_label.font = _game_font
	_red_light_label.position = Vector3(0.0, 3.46, RED_LIGHT_ZONE_CENTER_Z)
	_red_light_label.font_size = 54
	_red_light_label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	_red_light_label.modulate = Color(0.86, 1.0, 0.88)
	fx_root.add_child(_red_light_label)
	_red_light_zone = Area3D.new()
	_red_light_zone.name = "RedLightZone"
	_red_light_zone.position = Vector3(0.0, 1.1, RED_LIGHT_ZONE_CENTER_Z)
	_red_light_zone.monitorable = true
	_red_light_zone.monitoring = true
	var zone_shape := CollisionShape3D.new()
	zone_shape.shape = BoxShape3D.new()
	(zone_shape.shape as BoxShape3D).size = Vector3(corridor_width - 0.4, 2.4, RED_LIGHT_ZONE_LENGTH)
	_red_light_zone.add_child(zone_shape)
	trap_root.add_child(_red_light_zone)
	if not _red_light_zone.body_entered.is_connected(_on_red_light_body_entered):
		_red_light_zone.body_entered.connect(_on_red_light_body_entered)
	if not _red_light_zone.body_exited.is_connected(_on_red_light_body_exited):
		_red_light_zone.body_exited.connect(_on_red_light_body_exited)
	_red_light_arm_zone = Area3D.new()
	_red_light_arm_zone.name = "RedLightArmZone"
	_red_light_arm_zone.position = Vector3(0.0, 1.1, RED_LIGHT_ARM_ZONE_CENTER_Z)
	_red_light_arm_zone.monitorable = true
	_red_light_arm_zone.monitoring = true
	var arm_shape := CollisionShape3D.new()
	arm_shape.shape = BoxShape3D.new()
	(arm_shape.shape as BoxShape3D).size = Vector3(corridor_width - 0.4, 2.6, RED_LIGHT_ARM_ZONE_LENGTH)
	_red_light_arm_zone.add_child(arm_shape)
	trap_root.add_child(_red_light_arm_zone)
	if not _red_light_arm_zone.body_entered.is_connected(_on_red_light_arm_body_entered):
		_red_light_arm_zone.body_entered.connect(_on_red_light_arm_body_entered)
	_apply_red_light_visuals(false)


func _load_font_from_file(font_path: String) -> FontFile:
	var font := FontFile.new()
	font.data = FileAccess.get_file_as_bytes(font_path)
	return font if not font.data.is_empty() else null


func server_release_bug_swarm(trapper_peer_id: int) -> bool:
	if game_manager == null or not multiplayer.is_server() or int(game_manager.get("state")) != 2:
		return false
	var players := _players()
	if trapper_peer_id not in players:
		return false
	if int(players[trapper_peer_id].get("role", ROLE_RUNNER)) != ROLE_TRAPPER or not bool(players[trapper_peer_id].get("alive", false)):
		return false
	var runner_ids: Array = _get_alive_runner_ids()
	var solo_fallback: bool = runner_ids.is_empty()
	var runner_count: int = max(runner_ids.size(), 1)
	var spawn_origin: Vector3 = _get_bug_swarm_origin(trapper_peer_id, solo_fallback)
	var start_id: int = _next_bug_id
	var total_bugs: int = runner_count * BUGS_PER_RUNNER
	_next_bug_id += total_bugs
	rpc("_client_spawn_bug_swarm", start_id, trapper_peer_id, total_bugs, spawn_origin, BUG_SWARM_FALLBACK_TARGET if solo_fallback else Vector3.ZERO)
	return true


func _ensure_bug_swarm_root() -> void:
	if _bug_swarm_root != null and is_instance_valid(_bug_swarm_root):
		return
	_bug_swarm_root = Node3D.new()
	_bug_swarm_root.name = "BugSwarmRoot"
	fx_root.add_child(_bug_swarm_root)


func _clear_bug_swarm_local() -> void:
	if _bug_swarm_root == null or not is_instance_valid(_bug_swarm_root):
		return
	for child in _bug_swarm_root.get_children():
		child.queue_free()


func _get_alive_runner_ids() -> Array:
	var runner_ids: Array = []
	var players := _players()
	for peer_id in players:
		if int(players[peer_id].get("role", ROLE_RUNNER)) == ROLE_RUNNER and bool(players[peer_id].get("alive", false)):
			runner_ids.append(peer_id)
	return runner_ids


func _get_bug_swarm_origin(trapper_peer_id: int, force_runner_lane: bool = false) -> Vector3:
	var origin: Vector3 = BUG_SWARM_FALLBACK_ORIGIN if force_runner_lane else Vector3(PIPE_CENTER_X, 0.4, -20.0)
	if force_runner_lane:
		return origin
	var node := get_tree().root.find_child(str(trapper_peer_id), true, false)
	if node != null and node is Node3D:
		var trapper_node: Node3D = node as Node3D
		var forward: Vector3 = Vector3(-trapper_node.transform.basis.z.x, 0.0, -trapper_node.transform.basis.z.z).normalized()
		if forward.length() < 0.1:
			forward = Vector3(0.0, 0.0, -1.0)
		origin = trapper_node.global_position + forward * 2.8 + Vector3.UP * 0.15
	return origin


func _get_bug_spawn_position(origin: Vector3, index: int) -> Vector3:
	var row: int = floori(float(index) / 4.0)
	var column: int = index % 4
	var lateral: float = (float(column) - 1.5) * 0.72 + sin(float(index) * 1.31) * 0.14
	var depth: float = float(row) * 0.68 + cos(float(index) * 0.73) * 0.12
	var pos := origin + Vector3(lateral, 0.0, depth)
	if origin.x >= 4.0 and origin.x <= 8.5:
		pos.x = clamp(pos.x, -3.5, 3.2)
	return pos


func _on_round_started() -> void:
	_clear_bug_swarm_local()
	_red_light_damage_cooldowns.clear()
	_red_light_tracked_bodies.clear()
	_red_light_armed = false
	if _is_authority_active():
		_set_red_light_state(false)
		_red_light_switch_timer = 0.0


func _on_round_ended(_winner: String) -> void:
	_clear_bug_swarm_local()
	_red_light_damage_cooldowns.clear()
	_red_light_tracked_bodies.clear()
	_red_light_armed = false
	if _is_authority_active():
		_set_red_light_state(false)


func _update_red_light(delta: float) -> void:
	if Engine.is_editor_hint() or game_manager == null:
		return
	if _red_light_label == null:
		return
	if not _is_authority_active() or int(game_manager.get("state")) != 2 or not _red_light_armed:
		return
	_red_light_switch_timer = max(_red_light_switch_timer - delta, 0.0)
	if _red_light_switch_timer <= 0.0:
		_set_red_light_state(not _red_light_is_red)
		_red_light_switch_timer = randf_range(RED_LIGHT_MIN_INTERVAL, RED_LIGHT_MAX_INTERVAL)
	var tracked_ids: Array = _red_light_damage_cooldowns.keys()
	for peer_id_variant in tracked_ids:
		var tracked_peer_id: int = int(peer_id_variant)
		_red_light_damage_cooldowns[tracked_peer_id] = max(float(_red_light_damage_cooldowns[tracked_peer_id]) - delta, 0.0)
	if _red_light_is_red:
		_apply_red_light_penalties()


func _apply_red_light_penalties() -> void:
	var players := _players()
	var half_zone_width: float = (corridor_width - 0.4) * 0.5
	var half_zone_length: float = RED_LIGHT_ZONE_LENGTH * 0.5
	for peer_id_variant in players.keys():
		var peer_id: int = int(peer_id_variant)
		if peer_id not in players:
			continue
		var player_data: Dictionary = players[peer_id]
		if int(player_data.get("role", ROLE_RUNNER)) != ROLE_RUNNER or not bool(player_data.get("alive", false)):
			continue
		var player_node_variant: Variant = get_tree().root.find_child(str(peer_id), true, false)
		if not player_node_variant is CharacterBody3D:
			continue
		var player_node: CharacterBody3D = player_node_variant as CharacterBody3D
		if player_node == null or not is_instance_valid(player_node):
			continue
		var tracked_entry: Dictionary = _red_light_tracked_bodies.get(peer_id, {}) as Dictionary
		var previous_position: Vector3 = tracked_entry.get("position", player_node.global_position)
		var local_pos: Vector3 = player_node.global_position - _red_light_zone.global_position
		if absf(local_pos.x) > half_zone_width or absf(local_pos.z) > half_zone_length or absf(local_pos.y) > 1.6:
			continue
		var movement_delta: float = player_node.global_position.distance_to(previous_position)
		var horizontal_speed: float = Vector2(player_node.velocity.x, player_node.velocity.z).length()
		var moving: bool = movement_delta > RED_LIGHT_MOVE_DISTANCE or horizontal_speed > RED_LIGHT_MOVE_SPEED or not player_node.is_on_floor()
		var cooldown: float = float(_red_light_damage_cooldowns.get(peer_id, 0.0))
		if moving and cooldown <= 0.0 and player_node.has_method("server_apply_damage"):
			player_node.call("server_apply_damage", RED_LIGHT_DAMAGE, -1)
			_red_light_damage_cooldowns[peer_id] = RED_LIGHT_DAMAGE_COOLDOWN
		_red_light_tracked_bodies[peer_id] = {
			"node": player_node,
			"position": player_node.global_position,
		}


func _set_red_light_state(active: bool) -> void:
	_red_light_is_red = active
	if not _red_light_armed:
		_apply_red_light_visuals(false)
		return
	if multiplayer.multiplayer_peer == null:
		_sync_red_light_state(_red_light_is_red)
		return
	rpc("_sync_red_light_state", _red_light_is_red)


func _apply_red_light_visuals(active: bool) -> void:
	if _red_light_label != null:
		_red_light_label.visible = _red_light_armed
		_red_light_label.text = "RED LIGHT" if active else "GREEN LIGHT"
		_red_light_label.modulate = Color(1.0, 0.46, 0.42) if active else Color(0.58, 1.0, 0.66)
	for index in range(_red_light_beacons.size()):
		var beacon: MeshInstance3D = _red_light_beacons[index]
		if beacon == null or not is_instance_valid(beacon):
			continue
		beacon.visible = _red_light_armed
		var use_red: bool = active and index == 1
		var use_green: bool = not active and index == 0
		var material := TrapHelper.make_material(
			Color(0.92, 0.18, 0.14) if use_red else Color(0.16, 0.82, 0.3) if use_green else Color(0.22, 0.24, 0.28),
			3.0 if (use_red or use_green) else 0.25,
			0.04 if (use_red or use_green) else 0.4,
			0.08
		)
		beacon.material_override = material


func _on_red_light_body_entered(body: Node) -> void:
	if game_manager == null or not _is_authority_active():
		return
	if body == null or not body is CharacterBody3D:
		return
	var peer_id: int = body.name.to_int()
	if peer_id not in _players():
		return
	if int(_players()[peer_id].get("role", ROLE_RUNNER)) != ROLE_RUNNER:
		return
	_arm_red_light_trap()
	_red_light_tracked_bodies[peer_id] = {
		"node": body,
		"position": body.global_position,
	}
	_red_light_damage_cooldowns[peer_id] = float(_red_light_damage_cooldowns.get(peer_id, 0.0))


func _on_red_light_body_exited(body: Node) -> void:
	if game_manager == null or not _is_authority_active():
		return
	if body == null:
		return
	var peer_id: int = body.name.to_int()
	_red_light_tracked_bodies.erase(peer_id)
	_red_light_damage_cooldowns.erase(peer_id)


func _on_red_light_arm_body_entered(body: Node) -> void:
	if game_manager == null or not _is_authority_active():
		return
	if body == null or not body is CharacterBody3D:
		return
	var peer_id: int = body.name.to_int()
	if peer_id not in _players():
		return
	if int(_players()[peer_id].get("role", ROLE_RUNNER)) != ROLE_RUNNER:
		return
	_arm_red_light_trap()


func _arm_red_light_trap() -> void:
	if _red_light_armed:
		return
	_red_light_armed = true
	_red_light_switch_timer = randf_range(RED_LIGHT_MIN_INTERVAL, RED_LIGHT_MAX_INTERVAL)
	_set_red_light_state(false)


@rpc("authority", "call_local", "reliable")
func _client_spawn_bug_swarm(start_id: int, owner_peer_id: int, total_bugs: int, spawn_origin: Vector3, fallback_target: Vector3 = Vector3.ZERO) -> void:
	bug_swarm_released.emit(owner_peer_id, total_bugs)
	_ensure_bug_swarm_root()
	for index in total_bugs:
		var spawn_index: int = index
		get_tree().create_timer(float(spawn_index) * BUG_SPAWN_INTERVAL).timeout.connect(func() -> void:
			var bug := Node3D.new()
			bug.set_script(TrapperBugScript)
			_bug_swarm_root.add_child(bug)
			bug.call("setup", start_id + spawn_index, owner_peer_id, _get_bug_spawn_position(spawn_origin, spawn_index), fallback_target)
			_spawn_bug_drop_effect(bug.global_position)
		)


func _spawn_bug_drop_effect(effect_position: Vector3) -> void:
	var spark := MeshInstance3D.new()
	var mesh := SphereMesh.new()
	mesh.radius = 0.08
	mesh.height = 0.08
	spark.mesh = mesh
	spark.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var material := StandardMaterial3D.new()
	material.albedo_color = Color(1.0, 0.66, 0.26, 0.44)
	material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	material.emission_enabled = true
	material.emission = Color(1.0, 0.78, 0.32)
	material.emission_energy_multiplier = 2.8
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	spark.material_override = material
	fx_root.add_child(spark)
	spark.global_position = effect_position + Vector3(0.0, 0.22, 0.0)
	get_tree().create_timer(0.24).timeout.connect(func() -> void:
		if is_instance_valid(spark):
			spark.queue_free()
	)


@rpc("authority", "call_local", "reliable")
func _sync_red_light_state(active: bool) -> void:
	_red_light_is_red = active
	_apply_red_light_visuals(active)
	red_light_state_changed.emit(active)

func _on_finish_zone_entered(body: Node3D) -> void:
	if Engine.is_editor_hint() or game_manager == null:
		return
	if not multiplayer.is_server():
		return
	if body.has_method("die"):
		var peer_id: int = body.name.to_int()
		var players := _players()
		if peer_id in players and players[peer_id]["role"] == ROLE_RUNNER:
			game_manager.call("notify_player_finished", peer_id)


func _on_death_plane_body_entered(body: Node3D) -> void:
	if Engine.is_editor_hint() or game_manager == null:
		return
	if not multiplayer.is_server():
		return
	if body.has_method("eliminate"):
		body.call("eliminate")


func _initialize_custom_map_objects() -> void:
	_parse_nodes_recursive(self)

func _parse_nodes_recursive(node: Node) -> void:
	if node == null:
		return
	
	if node.has_meta("jump_pad_boost"):
		_setup_jump_pad_trigger(node)
	if node.has_meta("speed_boost"):
		_setup_speed_pad_trigger(node)
	if node.has_meta("teleporter_dest"):
		_setup_teleporter_trigger(node)
	if node.has_meta("damage_on_touch"):
		_setup_damage_trigger(node)
	if node.has_meta("movement_offset"):
		_setup_moving_platform(node)
	if node.has_meta("acid_slow"):
		_setup_acid_slow_trigger(node)
	if node.has_meta("map_item_type"):
		var type = node.get_meta("map_item_type")
		if type == "finish_zone":
			_setup_finish_zone_trigger(node)
		elif type == "runner_spawn":
			_setup_runner_spawn_point(node)
		elif type == "trapper_spawn":
			_setup_trapper_spawn_point(node)
		elif type == "kz_start":
			_setup_kz_start_trigger(node)
		
	for child in node.get_children():
		_parse_nodes_recursive(child)

func _setup_moving_platform(node: Node3D) -> void:
	var script = load("res://scripts/traps/moving_platform.gd")
	node.set_script(script)

func _setup_damage_trigger(node: Node3D) -> void:
	var area := Area3D.new()
	area.name = "DamageTrigger"
	area.monitoring = true
	area.monitorable = false
	var shape := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = Vector3(1.0, 1.0, 1.0)
	shape.shape = box
	area.add_child(shape)
	node.add_child(area)
	
	var damage = float(node.get_meta("damage_on_touch"))
	var active_bodies := []
	area.body_entered.connect(func(body: Node3D) -> void:
		if body.has_method("server_apply_damage"):
			active_bodies.append(body)
			body.call("server_apply_damage", damage, -1)
			_play_trigger_sound(node)
	)
	area.body_exited.connect(func(body: Node3D) -> void:
		active_bodies.erase(body)
	)
	
	var timer := Timer.new()
	timer.wait_time = 1.0
	timer.one_shot = false
	timer.autostart = true
	area.add_child(timer)
	timer.timeout.connect(func() -> void:
		for body in active_bodies:
			if is_instance_valid(body) and body.has_method("server_apply_damage"):
				body.call("server_apply_damage", damage, -1)
	)

func _setup_acid_slow_trigger(node: Node3D) -> void:
	var area := Area3D.new()
	area.name = "AcidSlowTrigger"
	area.monitoring = true
	area.monitorable = false
	var shape := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = Vector3(1.0, 1.0, 1.0)
	shape.shape = box
	area.add_child(shape)
	node.add_child(area)
	
	var active_bodies := []
	area.body_entered.connect(func(body: Node3D) -> void:
		if body.has_method("apply_acid_slow"):
			active_bodies.append(body)
			body.call("apply_acid_slow")
			_play_trigger_sound(node)
	)
	area.body_exited.connect(func(body: Node3D) -> void:
		active_bodies.erase(body)
	)
	
	var timer := Timer.new()
	timer.wait_time = 0.1
	timer.one_shot = false
	timer.autostart = true
	area.add_child(timer)
	timer.timeout.connect(func() -> void:
		for body in active_bodies:
			if is_instance_valid(body) and body.has_method("apply_acid_slow"):
				body.call("apply_acid_slow")
	)

func _setup_finish_zone_trigger(node: Node3D) -> void:
	var area: Area3D = node if node is Area3D else null
	if not area:
		area = Area3D.new()
		area.name = "FinishZoneTrigger"
		area.monitoring = true
		area.monitorable = false
		var shape := CollisionShape3D.new()
		var box := BoxShape3D.new()
		box.size = Vector3(1.0, 1.0, 1.0)
		shape.shape = box
		area.add_child(shape)
		node.add_child(area)
	area.body_entered.connect(func(body: Node3D) -> void:
		_on_finish_zone_entered(body)
		_play_trigger_sound(node)
	)

func _setup_runner_spawn_point(node: Node3D) -> void:
	if player_spawner:
		var sp1 = player_spawner.get_node_or_null("RunnerSpawn1")
		var sp2 = player_spawner.get_node_or_null("RunnerSpawn2")
		var sp3 = player_spawner.get_node_or_null("RunnerSpawn3")
		if sp1: sp1.global_position = node.global_position + Vector3(-1.0, 0.0, 0.0)
		if sp2: sp2.global_position = node.global_position
		if sp3: sp3.global_position = node.global_position + Vector3(1.0, 0.0, 0.0)

func _setup_trapper_spawn_point(node: Node3D) -> void:
	if player_spawner:
		var sp = player_spawner.get_node_or_null("TrapperSpawn")
		if sp: sp.global_position = node.global_position

func _setup_kz_start_trigger(node: Node3D) -> void:
	var area: Area3D = node if node is Area3D else null
	if not area:
		area = Area3D.new()
		area.name = "KZStartTrigger"
		area.monitoring = true
		area.monitorable = false
		var shape := CollisionShape3D.new()
		var box := BoxShape3D.new()
		box.size = Vector3(1.0, 1.0, 1.0)
		shape.shape = box
		area.add_child(shape)
		node.add_child(area)
	area.body_entered.connect(func(body):
		if body.has_method("die") and game_manager:
			pass
	)

func _setup_jump_pad_trigger(pad: Node3D) -> void:
	var area := Area3D.new()
	area.name = "JumpPadTrigger"
	area.monitoring = true
	area.monitorable = false
	var shape := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = Vector3(2.6, 0.5, 2.6)
	shape.shape = box
	area.add_child(shape)
	pad.add_child(area)
	area.position = Vector3(0, 0.25, 0)
	area.body_entered.connect(func(body: Node3D) -> void:
		if body.has_method("apply_jump_pad_boost"):
			body.call("apply_jump_pad_boost", float(pad.get_meta("jump_pad_boost")))
			_play_trigger_sound(pad)
	)

func _setup_speed_pad_trigger(pad: Node3D) -> void:
	var area := Area3D.new()
	area.name = "SpeedPadTrigger"
	area.monitoring = true
	area.monitorable = false
	var shape := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = Vector3(2.6, 0.5, 4.1)
	shape.shape = box
	area.add_child(shape)
	pad.add_child(area)
	area.position = Vector3(0, 0.25, 0)
	area.body_entered.connect(func(body: Node3D) -> void:
		if body.has_method("apply_speed_pad_boost"):
			var forward := -pad.global_transform.basis.z.normalized()
			body.call("apply_speed_pad_boost", forward, float(pad.get_meta("speed_boost")))
			_play_trigger_sound(pad)
	)

func _setup_teleporter_trigger(portal: Node3D) -> void:
	var area := Area3D.new()
	area.name = "TeleporterTrigger"
	area.monitoring = true
	area.monitorable = false
	var shape := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = Vector3(2.1, 3.1, 0.5)
	shape.shape = box
	area.add_child(shape)
	portal.add_child(area)
	area.position = Vector3(0, 1.5, 0)
	area.body_entered.connect(func(body: Node3D) -> void:
		var dest_path = portal.get_meta("teleporter_dest")
		if dest_path != "":
			var dest_node = portal.get_node_or_null(dest_path)
			if dest_node and body.has_method("teleport_to"):
				body.call("teleport_to", dest_node.global_position)
				_play_trigger_sound(portal)
	)


func _play_trigger_sound(node: Node) -> void:
	if node.has_meta("trigger_sound"):
		var snd = str(node.get_meta("trigger_sound")).strip_edges()
		if snd != "" and game_manager != null and game_manager.has_method("play_effect"):
			game_manager.call("play_effect", snd)
