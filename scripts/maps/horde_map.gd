@tool
extends "res://scripts/maps/test_map.gd"

const HordePickupScript = preload("res://scripts/maps/horde_pickup.gd")
const ARENA_WIDTH: float = 120.0
const ARENA_DEPTH: float = 120.0
const ARENA_HEIGHT: float = 32.0
const WAVE_START_DELAY: float = 5.0
const WAVE_BREAK_DELAY: float = 8.0
const SUB_WAVE_DELAY: float = 14.0
const WAVE_SPAWN_GRACE: float = 1.25
const PICKUP_COIN := "COIN"
const PICKUP_AMMO := "AMMO"
const PICKUP_HEALTH := "HEALTH"

var current_wave: int = 0
var max_waves: int = 10
var enemies_alive: int = 0
var wave_active: bool = false
var wave_timer: Timer
var _spawn_grace_timer: float = 0.0
var _wave_total_enemies: int = 0
var _wave_spawned_enemies: int = 0
var _scheduled_bug_spawns: int = 0
var _wave_serial: int = 0

var _sub_waves: Array = []
var _sub_wave_timer: Timer
var _loot_root: Node3D
var _pickup_nodes: Dictionary = {}
var _next_pickup_id: int = 1

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
	
	if not death_plane.body_entered.is_connected(_on_death_plane_body_entered):
		death_plane.body_entered.connect(_on_death_plane_body_entered)
	if game_manager != null:
		if not game_manager.round_started.is_connected(_on_round_started):
			game_manager.round_started.connect(_on_round_started)
		if not game_manager.round_ended.is_connected(_on_round_ended):
			game_manager.round_ended.connect(_on_round_ended)
		
	if game_manager != null and multiplayer.is_server():
		wave_timer = Timer.new()
		wave_timer.one_shot = true
		wave_timer.timeout.connect(_start_next_wave)
		add_child(wave_timer)
		
		_sub_wave_timer = Timer.new()
		_sub_wave_timer.one_shot = true
		_sub_wave_timer.timeout.connect(_spawn_next_sub_wave)
		add_child(_sub_wave_timer)

func _on_round_started() -> void:
	super._on_round_started()
	if multiplayer.is_server():
		_reset_horde_runtime(true)
		wave_timer.start(WAVE_START_DELAY)


func _on_round_ended(winner: String) -> void:
	super._on_round_ended(winner)
	if multiplayer.is_server():
		_reset_horde_runtime(false)


func _reset_horde_runtime(starting_round: bool) -> void:
	wave_active = false
	enemies_alive = 0
	_spawn_grace_timer = 0.0
	_wave_total_enemies = 0
	_wave_spawned_enemies = 0
	_scheduled_bug_spawns = 0
	_sub_waves.clear()
	_wave_serial += 1
	_clear_horde_pickups_local()
	if wave_timer != null and is_instance_valid(wave_timer):
		wave_timer.stop()
	if _sub_wave_timer != null and is_instance_valid(_sub_wave_timer):
		_sub_wave_timer.stop()
	if starting_round:
		current_wave = 0


func _build_wave_plan(wave: int) -> Array:
	match wave:
		1:
			return [
				{"count": 4, "delay": 0.0, "strong": false},
				{"count": 4, "delay": SUB_WAVE_DELAY, "strong": false}
			]
		2:
			return [
				{"count": 6, "delay": 0.0, "strong": false},
				{"count": 6, "delay": SUB_WAVE_DELAY, "strong": false}
			]
		3:
			return [
				{"count": 6, "delay": 0.0, "strong": false},
				{"count": 6, "delay": SUB_WAVE_DELAY, "strong": true}
			]
		_:
			var total: int = 10 + maxi(wave - 3, 0) * 4
			var half := int(floor(float(total) * 0.5))
			var second_half: int = total - half
			return [
				{"count": half, "delay": 0.0, "strong": wave >= 5},
				{"count": second_half, "delay": SUB_WAVE_DELAY, "strong": true}
			]

func _start_next_wave() -> void:
	if game_manager == null or not multiplayer.is_server() or not _is_authority_active() or int(game_manager.get("state")) != 2:
		return
	current_wave += 1
	if current_wave > max_waves:
		if game_manager != null:
			game_manager.call("end_round", "runners")
		return
	wave_active = true
	enemies_alive = 0
	_wave_spawned_enemies = 0
	_scheduled_bug_spawns = 0
	_spawn_grace_timer = 0.0
	_sub_waves = _build_wave_plan(current_wave)
	_wave_total_enemies = 0
	for sub_wave_variant in _sub_waves:
		_wave_total_enemies += int((sub_wave_variant as Dictionary).get("count", 0))
	_wave_serial += 1
	rpc("_client_announce_wave", current_wave, true, _wave_total_enemies)
	_spawn_next_sub_wave()

func _spawn_next_sub_wave() -> void:
	if game_manager == null or not multiplayer.is_server() or not wave_active or int(game_manager.get("state")) != 2:
		return
	if _sub_waves.is_empty():
		return
	var wave_serial := _wave_serial
	var sub_wave: Dictionary = _sub_waves.pop_front()
	var bug_count := int(sub_wave.get("count", 0))
	var is_strong := bool(sub_wave.get("strong", false))
	if bug_count <= 0:
		return

	_spawn_grace_timer = float(bug_count) * BUG_SPAWN_INTERVAL + WAVE_SPAWN_GRACE
	_scheduled_bug_spawns += bug_count
	var runner_ids: Array = _get_alive_runner_ids()
	var solo_fallback: bool = runner_ids.is_empty()
	var spawn_origins := [
		Vector3(0, 1, -110),
		Vector3(0, 1, -10),
		Vector3(55, 1, -60),
		Vector3(-55, 1, -60)
	]
	var spawn_origin: Vector3 = spawn_origins[randi() % spawn_origins.size()]

	rpc("_client_spawn_horde_swarm", _next_bug_id, -1, bug_count, spawn_origin, BUG_SWARM_FALLBACK_TARGET if solo_fallback else Vector3.ZERO, is_strong)
	_next_bug_id += bug_count

	if not _sub_waves.is_empty():
		var next_delay := float(_sub_waves[0].get("delay", SUB_WAVE_DELAY))
		if wave_serial == _wave_serial:
			_sub_wave_timer.start(next_delay)


func notify_horde_bug_spawned() -> void:
	if not multiplayer.is_server() or not wave_active:
		return
	_scheduled_bug_spawns = maxi(_scheduled_bug_spawns - 1, 0)
	_wave_spawned_enemies += 1
	enemies_alive += 1


func notify_horde_bug_destroyed() -> void:
	if not multiplayer.is_server():
		return
	enemies_alive = maxi(enemies_alive - 1, 0)


func get_wave_status() -> Dictionary:
	var next_wave: int = mini(current_wave + 1, max_waves)
	var next_total: int = 0
	if wave_active:
		next_total = _wave_total_enemies
	elif current_wave < max_waves:
		for sub_wave_variant in _build_wave_plan(next_wave):
			next_total += int((sub_wave_variant as Dictionary).get("count", 0))
	return {
		"wave": current_wave,
		"max_waves": max_waves,
		"active": wave_active,
		"alive": enemies_alive,
		"scheduled": _scheduled_bug_spawns,
		"spawned": _wave_spawned_enemies,
		"total": _wave_total_enemies if wave_active else next_total,
		"break_time": wave_timer.time_left if wave_timer != null and is_instance_valid(wave_timer) else 0.0
	}


func _apply_horde_atmosphere() -> void:
	if world_environment != null and world_environment.environment != null:
		var environment := world_environment.environment
		environment.fog_density = 0.018
		environment.fog_light_color = Color(0.18, 0.23, 0.3)
		environment.ambient_light_color = Color(0.13, 0.18, 0.28)
		environment.ambient_light_energy = 1.15
		environment.glow_bloom = 0.08
	directional_light.light_color = Color(0.46, 0.56, 0.82)
	directional_light.light_energy = 0.82
	_add_moon(Vector3(-78.0, 62.0, -176.0))
	_add_dust_volume(Vector3(0.0, 16.0, -60.0), Vector3(88.0, 18.0, 88.0))
	_add_dust_volume(Vector3(0.0, 8.0, -130.0), Vector3(20.0, 10.0, 14.0))
	_add_dust_volume(Vector3(0.0, 8.0, 10.0), Vector3(20.0, 10.0, 14.0))
	for light_pos in [
		Vector3(0.0, 6.0, -60.0),
		Vector3(-48.0, 5.5, -108.0),
		Vector3(48.0, 5.5, -108.0),
		Vector3(-48.0, 5.5, -12.0),
		Vector3(48.0, 5.5, -12.0)
	]:
		_add_pulse_light(light_pos, Color(0.28, 0.5, 0.88), 1.4, 0.9)
	for ember_pos in [
		Vector3(-50.0, -2.5, -110.0),
		Vector3(50.0, -2.5, -110.0),
		Vector3(-50.0, -2.5, -10.0),
		Vector3(50.0, -2.5, -10.0)
	]:
		_add_stray_red_light(ember_pos, 1.6, 1.4)

func _ensure_loot_root() -> void:
	if _loot_root != null and is_instance_valid(_loot_root):
		return
	_loot_root = Node3D.new()
	_loot_root.name = "LootRoot"
	fx_root.add_child(_loot_root)


func _clear_horde_pickups_local() -> void:
	if _loot_root != null and is_instance_valid(_loot_root):
		for child in _loot_root.get_children():
			child.queue_free()
	_pickup_nodes.clear()


func spawn_horde_loot_pickups(drop_position: Vector3, coin_amount: int, health_bonus: float = 0.0, ammo_bonus: int = 0) -> void:
	if not multiplayer.is_server():
		return
	if coin_amount > 0:
		_spawn_pickup_cluster(PICKUP_COIN, float(coin_amount), drop_position, clampi(int(ceil(float(coin_amount) / 7.0)), 1, 3))
	if ammo_bonus > 0:
		_spawn_pickup_cluster(PICKUP_AMMO, float(ammo_bonus), drop_position + Vector3(0.18, 0.0, -0.12), 1)
	if health_bonus > 0.0:
		_spawn_pickup_cluster(PICKUP_HEALTH, health_bonus, drop_position + Vector3(-0.16, 0.0, 0.14), 1)


func _spawn_pickup_cluster(pickup_type: String, total_amount: float, center_position: Vector3, count: int) -> void:
	var spawn_count := maxi(count, 1)
	var remaining_int := int(round(total_amount))
	for pickup_index in spawn_count:
		var amount_value := total_amount / float(spawn_count)
		if pickup_type == PICKUP_COIN:
			var share := maxi(int(round(float(remaining_int) / float(spawn_count - pickup_index))), 1)
			amount_value = float(share)
			remaining_int -= share
		var scatter := Vector3(randf_range(-0.65, 0.65), 0.0, randf_range(-0.65, 0.65))
		var pickup_id := _next_pickup_id
		_next_pickup_id += 1
		rpc("_client_spawn_horde_pickup", pickup_id, pickup_type, amount_value, center_position + scatter)


func _spawn_pickup_collect_effect(effect_position: Vector3, tint: Color) -> void:
	var flash := MeshInstance3D.new()
	var mesh := SphereMesh.new()
	mesh.radius = 0.12
	mesh.height = 0.16
	flash.mesh = mesh
	flash.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var material := StandardMaterial3D.new()
	material.albedo_color = Color(tint.r, tint.g, tint.b, 0.45)
	material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	material.emission_enabled = true
	material.emission = tint
	material.emission_energy_multiplier = 2.0
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	flash.material_override = material
	fx_root.add_child(flash)
	flash.global_position = effect_position + Vector3(0.0, 0.3, 0.0)
	get_tree().create_timer(0.3).timeout.connect(func() -> void:
		if is_instance_valid(flash):
			flash.queue_free()
	)


func _award_pickup_to_peer(collector_peer_id: int, pickup_type: String, amount_value: float) -> void:
	if game_manager == null:
		return
	match pickup_type:
		PICKUP_COIN:
			game_manager.call("award_horde_loot", collector_peer_id, int(round(amount_value)), 0.0, 0)
		PICKUP_AMMO:
			game_manager.call("award_horde_loot", collector_peer_id, 0, 0.0, int(round(amount_value)))
		PICKUP_HEALTH:
			game_manager.call("award_horde_loot", collector_peer_id, 0, amount_value, 0)


func _pickup_color(pickup_type: String) -> Color:
	match pickup_type:
		PICKUP_COIN:
			return Color(1.0, 0.82, 0.24)
		PICKUP_AMMO:
			return Color(0.4, 0.88, 1.0)
		PICKUP_HEALTH:
			return Color(0.95, 0.24, 0.28)
	return Color.WHITE


func _on_horde_pickup_collected(pickup_id: int, collector_peer_id: int, pickup_type: String, amount_value: float) -> void:
	if not multiplayer.is_server():
		return
	_award_pickup_to_peer(collector_peer_id, pickup_type, amount_value)
	rpc("_client_collect_horde_pickup", pickup_id, _pickup_color(pickup_type))


func _position_runtime_nodes() -> void:
	finish_zone.position = Vector3(0, -100, 0)
	death_plane.position = Vector3(0, -5, -60.0)
	
	# Scale the death plane so we don't infinitely fall if we jump off the edge
	var death_shape := death_plane.get_node_or_null("CollisionShape3D")
	if death_shape != null and death_shape.shape is BoxShape3D:
		death_shape.shape.size = Vector3(200.0, 2.0, 200.0)
		
	player_spawner.position = Vector3.ZERO
	if player_spawner.has_node("RunnerSpawn1"):
		player_spawner.get_node("RunnerSpawn1").position = Vector3(-4.0, 4.0, -60.0)
		player_spawner.get_node("RunnerSpawn2").position = Vector3(0.0, 4.0, -60.0)
		player_spawner.get_node("RunnerSpawn3").position = Vector3(4.0, 4.0, -60.0)
		player_spawner.get_node("TrapperSpawn").position = Vector3(0.0, 8.0, -60.0)

func _build_map() -> void:
	var floor_mat: StandardMaterial3D = TrapHelper.make_material(Color(0.15, 0.16, 0.18), 0.0, 0.4, 0.5)
	var wall_mat: StandardMaterial3D = TrapHelper.make_material(Color(0.1, 0.12, 0.14), 0.0, 0.2, 0.5)
	var safe_mat: StandardMaterial3D = TrapHelper.make_material(Color(0.2, 0.4, 0.2), 0.0, 0.2, 0.5)
	var lava_mat: StandardMaterial3D = StandardMaterial3D.new()
	lava_mat.albedo_color = Color(0.9, 0.2, 0.0)
	lava_mat.emission_enabled = true
	lava_mat.emission = Color(1.0, 0.3, 0.0)
	lava_mat.emission_energy_multiplier = 2.0
	
	var forcefield_mat := StandardMaterial3D.new()
	forcefield_mat.albedo_color = Color(1.0, 0.2, 0.0, 0.3)
	forcefield_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	forcefield_mat.emission_enabled = true
	forcefield_mat.emission = Color(1.0, 0.1, 0.0)
	forcefield_mat.emission_energy_multiplier = 2.0
	
	# Main Floor (Grid of 9 blocks with 4 empty corners for lava)
	_add_static_box(geometry_root, Vector3(0.0, -2.0, -60.0), Vector3(80.0, 4.0, 80.0), floor_mat)
	_add_static_box(geometry_root, Vector3(0.0, -2.0, -110.0), Vector3(80.0, 4.0, 20.0), floor_mat)
	_add_static_box(geometry_root, Vector3(0.0, -2.0, -10.0), Vector3(80.0, 4.0, 20.0), floor_mat)
	_add_static_box(geometry_root, Vector3(-50.0, -2.0, -60.0), Vector3(20.0, 4.0, 80.0), floor_mat)
	_add_static_box(geometry_root, Vector3(50.0, -2.0, -60.0), Vector3(20.0, 4.0, 80.0), floor_mat)
	
	# Lava Pits in the 4 corners
	var pits = [
		Vector3(-50.0, -3.5, -110.0),
		Vector3(50.0, -3.5, -110.0),
		Vector3(-50.0, -3.5, -10.0),
		Vector3(50.0, -3.5, -10.0)
	]
	for pit in pits:
		_add_static_box(geometry_root, pit, Vector3(20.0, 1.0, 20.0), lava_mat)
		_add_lava_trigger(pit + Vector3(0, 1.5, 0), Vector3(20.0, 4.0, 20.0))
		
	# Central Elevated Platform
	_add_static_box(geometry_root, Vector3(0.0, 1.5, -60.0), Vector3(30.0, 3.0, 30.0), floor_mat)
	
	# Ramps
	var n_ramp = _add_static_box(geometry_root, Vector3(0.0, 1.5, -81.0), Vector3(10.0, 0.5, 13.0), floor_mat)
	n_ramp.rotation_degrees.x = -15.0
	var s_ramp = _add_static_box(geometry_root, Vector3(0.0, 1.5, -39.0), Vector3(10.0, 0.5, 13.0), floor_mat)
	s_ramp.rotation_degrees.x = 15.0
	var e_ramp = _add_static_box(geometry_root, Vector3(21.0, 1.5, -60.0), Vector3(13.0, 0.5, 10.0), floor_mat)
	e_ramp.rotation_degrees.z = -15.0
	var w_ramp = _add_static_box(geometry_root, Vector3(-21.0, 1.5, -60.0), Vector3(13.0, 0.5, 10.0), floor_mat)
	w_ramp.rotation_degrees.z = 15.0
	
	# Safe House / Covers on platform
	_add_static_box(geometry_root, Vector3(10.0, 4.5, -50.0), Vector3(8.0, 3.0, 8.0), safe_mat)
	
	# Main Arena Walls with gaps for tunnels
	_add_static_box(geometry_root, Vector3(-33.0, 16.0, -120.5), Vector3(54.0, 32.0, 1.0), wall_mat)
	_add_static_box(geometry_root, Vector3(33.0, 16.0, -120.5), Vector3(54.0, 32.0, 1.0), wall_mat)
	_add_static_box(geometry_root, Vector3(0.0, 20.0, -120.5), Vector3(12.0, 24.0, 1.0), wall_mat)
	
	_add_static_box(geometry_root, Vector3(-33.0, 16.0, 0.5), Vector3(54.0, 32.0, 1.0), wall_mat)
	_add_static_box(geometry_root, Vector3(33.0, 16.0, 0.5), Vector3(54.0, 32.0, 1.0), wall_mat)
	_add_static_box(geometry_root, Vector3(0.0, 20.0, 0.5), Vector3(12.0, 24.0, 1.0), wall_mat)
	
	_add_static_box(geometry_root, Vector3(-60.5, 16.0, -93.0), Vector3(1.0, 32.0, 54.0), wall_mat)
	_add_static_box(geometry_root, Vector3(-60.5, 16.0, -27.0), Vector3(1.0, 32.0, 54.0), wall_mat)
	_add_static_box(geometry_root, Vector3(-60.5, 20.0, -60.0), Vector3(1.0, 24.0, 12.0), wall_mat)
	
	_add_static_box(geometry_root, Vector3(60.5, 16.0, -93.0), Vector3(1.0, 32.0, 54.0), wall_mat)
	_add_static_box(geometry_root, Vector3(60.5, 16.0, -27.0), Vector3(1.0, 32.0, 54.0), wall_mat)
	_add_static_box(geometry_root, Vector3(60.5, 20.0, -60.0), Vector3(1.0, 24.0, 12.0), wall_mat)
	
	# Tunnels
	_add_static_box(geometry_root, Vector3(0.0, -2.0, -130.0), Vector3(12.0, 4.0, 20.0), floor_mat)
	_add_static_box(geometry_root, Vector3(-6.5, 4.0, -130.0), Vector3(1.0, 12.0, 20.0), wall_mat)
	_add_static_box(geometry_root, Vector3(6.5, 4.0, -130.0), Vector3(1.0, 12.0, 20.0), wall_mat)
	_add_static_box(geometry_root, Vector3(0.0, 4.0, -140.5), Vector3(12.0, 12.0, 1.0), wall_mat)
	_add_static_box(geometry_root, Vector3(0.0, 8.5, -130.0), Vector3(14.0, 1.0, 20.0), wall_mat)
	_add_forcefield(Vector3(0.0, 4.0, -120.0), Vector3(12.0, 8.0, 0.5), forcefield_mat, Vector3(0, 0, 0))
	
	_add_static_box(geometry_root, Vector3(0.0, -2.0, 10.0), Vector3(12.0, 4.0, 20.0), floor_mat)
	_add_static_box(geometry_root, Vector3(-6.5, 4.0, 10.0), Vector3(1.0, 12.0, 20.0), wall_mat)
	_add_static_box(geometry_root, Vector3(6.5, 4.0, 10.0), Vector3(1.0, 12.0, 20.0), wall_mat)
	_add_static_box(geometry_root, Vector3(0.0, 4.0, 20.5), Vector3(12.0, 12.0, 1.0), wall_mat)
	_add_static_box(geometry_root, Vector3(0.0, 8.5, 10.0), Vector3(14.0, 1.0, 20.0), wall_mat)
	_add_forcefield(Vector3(0.0, 4.0, 0.0), Vector3(12.0, 8.0, 0.5), forcefield_mat, Vector3(0, 180, 0))
	
	_add_static_box(geometry_root, Vector3(-70.0, -2.0, -60.0), Vector3(20.0, 4.0, 12.0), floor_mat)
	_add_static_box(geometry_root, Vector3(-70.0, 4.0, -66.5), Vector3(20.0, 12.0, 1.0), wall_mat)
	_add_static_box(geometry_root, Vector3(-70.0, 4.0, -53.5), Vector3(20.0, 12.0, 1.0), wall_mat)
	_add_static_box(geometry_root, Vector3(-80.5, 4.0, -60.0), Vector3(1.0, 12.0, 12.0), wall_mat)
	_add_static_box(geometry_root, Vector3(-70.0, 8.5, -60.0), Vector3(20.0, 1.0, 14.0), wall_mat)
	_add_forcefield(Vector3(-60.0, 4.0, -60.0), Vector3(0.5, 8.0, 12.0), forcefield_mat, Vector3(0, -90, 0))
	
	_add_static_box(geometry_root, Vector3(70.0, -2.0, -60.0), Vector3(20.0, 4.0, 12.0), floor_mat)
	_add_static_box(geometry_root, Vector3(70.0, 4.0, -66.5), Vector3(20.0, 12.0, 1.0), wall_mat)
	_add_static_box(geometry_root, Vector3(70.0, 4.0, -53.5), Vector3(20.0, 12.0, 1.0), wall_mat)
	_add_static_box(geometry_root, Vector3(80.5, 4.0, -60.0), Vector3(1.0, 12.0, 12.0), wall_mat)
	_add_static_box(geometry_root, Vector3(70.0, 8.5, -60.0), Vector3(20.0, 1.0, 14.0), wall_mat)
	_add_forcefield(Vector3(60.0, 4.0, -60.0), Vector3(0.5, 8.0, 12.0), forcefield_mat, Vector3(0, 90, 0))
	_apply_horde_atmosphere()

func _add_forcefield(pos: Vector3, size: Vector3, mat: Material, label_rot: Vector3) -> void:
	var body := _add_static_box(geometry_root, pos, size, mat)
	# Tag so bugs ignore this wall (it's a player-only barrier, not an AI barrier)
	body.set_meta("bug_pass_through", true)
	var label = Label3D.new()
	label.text = "NO ENTRY"
	if _game_font:
		label.font = _game_font
	label.font_size = 120
	label.modulate = Color(1.0, 0.2, 0.0)
	label.position = pos
	label.rotation_degrees = label_rot
	geometry_root.add_child(label)

func _process(delta: float) -> void:
	super._process(delta)
	
	if Engine.is_editor_hint():
		return
		
	if _spawn_grace_timer > 0.0:
		_spawn_grace_timer -= delta

	if not multiplayer.is_server() or not wave_active:
		return
	if game_manager == null or int(game_manager.get("state")) != 2:
		return

	if enemies_alive <= 0 and _scheduled_bug_spawns <= 0 and _spawn_grace_timer <= 0.0 and _sub_waves.is_empty():
		wave_active = false
		enemies_alive = 0
		_wave_total_enemies = 0
		_wave_spawned_enemies = 0
		wave_timer.start(WAVE_BREAK_DELAY)
		var next_wave_total := 0
		if current_wave < max_waves:
			for sub_wave_variant in _build_wave_plan(current_wave + 1):
				next_wave_total += int((sub_wave_variant as Dictionary).get("count", 0))
		rpc("_client_announce_wave", current_wave + 1, false, next_wave_total)

@rpc("authority", "call_local", "reliable")
func _client_spawn_horde_swarm(start_id: int, owner_peer_id: int, total_bugs: int, spawn_origin: Vector3, fallback_target: Vector3, is_strong: bool) -> void:
	bug_swarm_released.emit(owner_peer_id, total_bugs)
	_ensure_bug_swarm_root()
	var wave_serial := _wave_serial
	for index in total_bugs:
		var spawn_index: int = index
		get_tree().create_timer(float(spawn_index) * BUG_SPAWN_INTERVAL).timeout.connect(func() -> void:
			if game_manager == null or int(game_manager.get("state")) != 2:
				return
			if multiplayer.is_server() and wave_serial != _wave_serial:
				return
			var bug := Node3D.new()
			bug.set_script(TrapperBugScript)
			_bug_swarm_root.add_child(bug)
			bug.call("setup", start_id + spawn_index, owner_peer_id, _get_bug_spawn_position(spawn_origin, spawn_index), fallback_target)
			if is_strong and bug.has_method("make_strong"):
				bug.call("make_strong")
			if multiplayer.is_server():
				notify_horde_bug_spawned()
			_spawn_bug_drop_effect(bug.global_position)
		)

@rpc("authority", "call_local", "reliable")
func _client_spawn_horde_pickup(pickup_id: int, pickup_type: String, amount_value: float, spawn_position: Vector3) -> void:
	_ensure_loot_root()
	var pickup := Area3D.new()
	pickup.set_script(HordePickupScript)
	pickup.call("setup", pickup_id, pickup_type, amount_value, spawn_position)
	_loot_root.add_child(pickup)
	if pickup.has_signal("collected") and not pickup.is_connected("collected", Callable(self, "_on_horde_pickup_collected")):
		pickup.connect("collected", Callable(self, "_on_horde_pickup_collected"))
	_pickup_nodes[pickup_id] = pickup
	_spawn_bug_drop_effect(spawn_position)


@rpc("authority", "call_local", "reliable")
func _client_collect_horde_pickup(pickup_id: int, tint: Color) -> void:
	if pickup_id not in _pickup_nodes:
		return
	var pickup: Area3D = _pickup_nodes[pickup_id] as Area3D
	_pickup_nodes.erase(pickup_id)
	if pickup == null or not is_instance_valid(pickup):
		return
	var type: String = pickup.pickup_type
	if type == "HEALTH":
		GameManager.call("play_effect", "picking-health-from-killing-monsters")
	elif type == "COIN":
		GameManager.call("play_effect", "pick-coins")
	else:
		GameManager.call("play_effect", "picking-health-from-killing-monsters")
	_spawn_pickup_collect_effect(pickup.global_position, tint)
	pickup.queue_free()


@rpc("authority", "call_local", "reliable")
func _client_announce_wave(wave: int, is_active: bool, total_enemies: int = 0) -> void:
	var msg: String
	var color: Color
	if is_active:
		msg = "WAVE %d STARTED // %d BUGS" % [wave, total_enemies]
		color = Color(1.0, 0.2, 0.2)
	else:
		if wave > max_waves:
			msg = "ALL WAVES CLEARED! RUNNERS WIN!"
			color = Color(0.2, 1.0, 0.2)
		else:
			msg = "WAVE CLEAR! WAVE %d IN %d SECONDS // %d BUGS" % [wave, int(WAVE_BREAK_DELAY), total_enemies]
			color = Color(1.0, 0.8, 0.2)
	var hud: Node = get_node_or_null("HUD")
	if hud == null:
		var current_scene := get_tree().current_scene
		if current_scene != null:
			hud = current_scene.get_node_or_null("HUD")
	if hud != null and hud.has_method("queue_popup_text"):
		hud.call("queue_popup_text", msg, color, 3.5)

func _add_lava_trigger(pos: Vector3, size: Vector3) -> void:
	var area := Area3D.new()
	area.position = pos
	var collision := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = size
	collision.shape = box
	area.add_child(collision)
	area.body_entered.connect(_on_lava_entered)
	add_child(area)

func _on_lava_entered(body: Node3D) -> void:
	if not multiplayer.is_server():
		return
	if body.has_method("server_apply_damage"):
		body.server_apply_damage(9999.0, -1)


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
			
	var spawn_origins := [
		Vector3(0, 1, -110),
		Vector3(0, 1, -10),
		Vector3(55, 1, -60),
		Vector3(-55, 1, -60)
	]
	var spawn_origin: Vector3 = spawn_origins[randi() % spawn_origins.size()]
	
	if multiplayer.is_server():
		if not wave_active:
			wave_active = true
			enemies_alive = 0
			_wave_spawned_enemies = 0
			_wave_total_enemies = 0
			_scheduled_bug_spawns = 0
		_scheduled_bug_spawns += total_bugs
		_wave_total_enemies += total_bugs
		rpc("_client_announce_wave", current_wave, true, _wave_total_enemies)

	rpc("_client_spawn_horde_swarm", start_id, -1, total_bugs, spawn_origin, fallback_target, false)


@rpc("any_peer", "call_remote", "reliable")
func _server_dev_release_bug_pack(bug_count: int = 5) -> void:
	if not multiplayer.is_server():
		return
	_release_debug_bug_pack(bug_count)
