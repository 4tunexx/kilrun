@tool
extends "res://scripts/maps/test_map.gd"

const DEMO_ROOM_WIDTH: float = 48.0
const DEMO_ROOM_DEPTH: float = 104.0
const DEMO_ROOM_HEIGHT: float = 18.0
const MIRROR_SIZE: Vector2 = Vector2(10.0, 6.0)
const DEMO_FINISH_Z: float = -94.0
const DEMO_DEATH_Z: float = -46.0
const DEMO_BUG_TARGET := Vector3(0.0, 0.45, -62.0)

var _moving_parts: Array[Dictionary] = []
var _mirror_plane: MeshInstance3D


class DemoShootTarget:
	extends StaticBody3D

	const MAX_HEALTH: float = 100.0

	var health: float = MAX_HEALTH
	var _mesh: MeshInstance3D
	var _base_material: StandardMaterial3D
	var _hit_material: StandardMaterial3D
	var _flash_timer: SceneTreeTimer

	func setup(target_size: Vector3, base_material: StandardMaterial3D, hit_material: StandardMaterial3D) -> void:
		health = MAX_HEALTH
		_base_material = base_material
		_hit_material = hit_material
		_mesh = MeshInstance3D.new()
		var mesh := BoxMesh.new()
		mesh.size = target_size
		_mesh.mesh = mesh
		_mesh.material_override = _base_material
		add_child(_mesh)
		var shape := CollisionShape3D.new()
		var box := BoxShape3D.new()
		box.size = target_size
		shape.shape = box
		add_child(shape)

	func server_apply_damage(amount: float, _attacker_id: int = -1) -> void:
		if not multiplayer.is_server():
			return
		health = max(health - max(amount, 0.0), 0.0)
		_flash_hit()
		if health <= 0.0:
			health = MAX_HEALTH

	func _flash_hit() -> void:
		if _mesh == null:
			return
		_mesh.material_override = _hit_material
		if _flash_timer != null:
			return
		_flash_timer = get_tree().create_timer(0.12)
		_flash_timer.timeout.connect(func() -> void:
			_flash_timer = null
			if is_instance_valid(_mesh):
				_mesh.material_override = _base_material
		)

func _ready() -> void:
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
	if not finish_zone.body_entered.is_connected(_on_finish_zone_entered):
		finish_zone.body_entered.connect(_on_finish_zone_entered)
	if not death_plane.body_entered.is_connected(_on_death_plane_body_entered):
		death_plane.body_entered.connect(_on_death_plane_body_entered)
	if game_manager != null:
		if not game_manager.round_started.is_connected(_on_round_started):
			game_manager.round_started.connect(_on_round_started)
		if not game_manager.round_ended.is_connected(_on_round_ended):
			game_manager.round_ended.connect(_on_round_ended)

func _build_map() -> void:
	_moving_parts.clear()
	var floor_mat: StandardMaterial3D = TrapHelper.make_material(Color(0.18, 0.20, 0.24), 0.0, 0.32, 0.48)
	var wall_mat: StandardMaterial3D = TrapHelper.make_material(Color(0.12, 0.14, 0.18), 0.0, 0.1, 0.46)
	var accent_mat: StandardMaterial3D = TrapHelper.make_material(Color(0.92, 0.68, 0.32), 0.7, 0.08, 0.18)
	var glass_mat: StandardMaterial3D = StandardMaterial3D.new()
	glass_mat.albedo_color = Color(0.42, 0.78, 1.0, 0.18)
	glass_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	glass_mat.roughness = 0.06
	glass_mat.metallic = 0.1
	glass_mat.emission_enabled = true
	glass_mat.emission = Color(0.18, 0.34, 0.68)
	glass_mat.emission_energy_multiplier = 0.48

	_add_static_box(geometry_root, Vector3(0.0, -0.18, -DEMO_ROOM_DEPTH * 0.5 + 2.0), Vector3(DEMO_ROOM_WIDTH, 0.24, DEMO_ROOM_DEPTH), floor_mat)
	_add_static_box(geometry_root, Vector3(-DEMO_ROOM_WIDTH * 0.5 - 0.5, DEMO_ROOM_HEIGHT * 0.5, -DEMO_ROOM_DEPTH * 0.5 + 2.0), Vector3(1.0, DEMO_ROOM_HEIGHT, DEMO_ROOM_DEPTH), wall_mat)
	_add_static_box(geometry_root, Vector3(DEMO_ROOM_WIDTH * 0.5 + 0.5, DEMO_ROOM_HEIGHT * 0.5, -DEMO_ROOM_DEPTH * 0.5 + 2.0), Vector3(1.0, DEMO_ROOM_HEIGHT, DEMO_ROOM_DEPTH), wall_mat)
	_add_static_box(geometry_root, Vector3(0.0, DEMO_ROOM_HEIGHT + 0.2, -DEMO_ROOM_DEPTH * 0.5 + 2.0), Vector3(DEMO_ROOM_WIDTH + 1.2, 0.4, DEMO_ROOM_DEPTH + 1.2), wall_mat)
	_add_static_box(geometry_root, Vector3(0.0, 6.5, -DEMO_ROOM_DEPTH + 2.0), Vector3(DEMO_ROOM_WIDTH + 1.2, 12.0, 1.0), wall_mat)
	_add_static_box(geometry_root, Vector3(0.0, 6.5, 4.0), Vector3(DEMO_ROOM_WIDTH + 1.2, 12.0, 1.0), wall_mat)

	_add_box_prop(fx_root, Vector3(0.0, 1.8, -20.0), Vector3(14.0, 0.16, 16.0), accent_mat)
	_add_box_prop(fx_root, Vector3(-14.0, 3.2, -26.0), Vector3(2.0, 0.24, 12.0), accent_mat)
	_add_box_prop(fx_root, Vector3(14.0, 3.2, -40.0), Vector3(2.0, 0.24, 12.0), accent_mat)
	_add_box_prop(fx_root, Vector3(0.0, 9.0, -30.0), Vector3(18.0, 0.24, 10.0), accent_mat)

	_add_demo_route_guides(accent_mat)
	_add_demo_platforms(floor_mat, accent_mat)
	_add_demo_bhop_lane(floor_mat, accent_mat)
	_add_demo_ramps(floor_mat)
	_add_demo_mirror(wall_mat)
	_add_demo_bug_arena(floor_mat, accent_mat)
	_add_demo_shoot_targets()
	_add_demo_moving_parts(floor_mat, accent_mat)
	_build_ambient_fx(floor_mat, wall_mat, accent_mat)
	_build_finish_stretch(floor_mat, accent_mat)
	_add_demo_grapple_anchors()


func _clear_runtime_content() -> void:
	super._clear_runtime_content()
	_moving_parts.clear()
	_mirror_plane = null

func _position_runtime_nodes() -> void:
	if player_spawner.has_node("RunnerSpawn1"):
		player_spawner.get_node("RunnerSpawn1").position = Vector3(-8.0, 0.9, 0.0)
	if player_spawner.has_node("RunnerSpawn2"):
		player_spawner.get_node("RunnerSpawn2").position = Vector3(0.0, 0.9, 0.0)
	if player_spawner.has_node("RunnerSpawn3"):
		player_spawner.get_node("RunnerSpawn3").position = Vector3(8.0, 0.9, 0.0)
	if player_spawner.has_node("TrapperSpawn"):
		player_spawner.get_node("TrapperSpawn").position = Vector3(0.0, 0.9, -4.0)
	finish_zone.position = Vector3(0.0, 0.8, DEMO_FINISH_Z)
	death_plane.position = Vector3(0.0, -8.5, DEMO_DEATH_Z)


func _add_demo_bhop_lane(floor_mat: Material, accent_mat: Material) -> void:
	var pads: Array[Dictionary] = [
		{"x": -3.0, "z": -14.0, "length": 3.2},
		{"x": 2.8, "z": -18.5, "length": 3.2},
		{"x": 0.0, "z": -23.0, "length": 3.0},
		{"x": -2.5, "z": -27.5, "length": 3.0},
		{"x": 2.2, "z": -32.0, "length": 3.4}
	]
	for pad in pads:
		var pad_x: float = pad["x"]
		var pad_z: float = pad["z"]
		var pad_length: float = pad["length"]
		_add_static_box(geometry_root, Vector3(pad_x, 0.08, pad_z), Vector3(3.2, 0.12, pad_length), floor_mat)
		_add_box_prop(fx_root, Vector3(pad_x, 0.16, pad_z), Vector3(3.0, 0.03, 0.14), accent_mat)
	_add_demo_label("BHOP PRACTICE", Vector3(0.0, 2.2, -10.0), 0.0)
func _add_demo_platforms(floor_mat: Material, accent_mat: Material) -> void:
	var platforms: Array[Dictionary] = [
		{"pos": Vector3(-12.0, 1.3, -18.0), "size": Vector3(9.0, 0.3, 7.5)},
		{"pos": Vector3(0.0, 2.8, -30.0), "size": Vector3(10.0, 0.3, 7.0)},
		{"pos": Vector3(12.0, 4.4, -42.0), "size": Vector3(9.0, 0.3, 7.5)},
		{"pos": Vector3(2.0, 6.0, -56.0), "size": Vector3(14.0, 0.3, 7.0)},
	]
	for platform_def in platforms:
		var platform := _add_static_box(geometry_root, platform_def["pos"], platform_def["size"], floor_mat)
		_add_box_prop(fx_root, platform.position + Vector3(0.0, 0.38, 0.0), Vector3(platform_def["size"].x, 0.08, platform_def["size"].z), accent_mat)
	_add_static_box(geometry_root, Vector3(-15.5, 2.0, -36.0), Vector3(1.0, 4.0, 30.0), floor_mat)
	_add_static_box(geometry_root, Vector3(15.5, 2.0, -36.0), Vector3(1.0, 4.0, 30.0), floor_mat)

func _add_demo_ramps(floor_mat: Material) -> void:
	_add_rotated_static_box(geometry_root, Vector3(0.0, 0.8, -11.0), Vector3(12.0, 0.32, 10.0), Vector3(-13.0, 0.0, 0.0), floor_mat, "LaunchRamp")
	_add_rotated_static_box(geometry_root, Vector3(-8.5, 2.6, -28.0), Vector3(8.0, 0.32, 14.0), Vector3(-10.0, 0.0, 13.0), floor_mat, "LeftSurfRamp")
	_add_rotated_static_box(geometry_root, Vector3(8.5, 3.8, -42.0), Vector3(8.0, 0.32, 14.0), Vector3(-10.0, 0.0, -13.0), floor_mat, "RightSurfRamp")
	_add_rotated_static_box(geometry_root, Vector3(0.0, 5.2, -64.0), Vector3(14.0, 0.32, 11.0), Vector3(10.0, 0.0, 0.0), floor_mat, "DropRamp")

func _add_demo_mirror(wall_mat: Material) -> void:
	_mirror_plane = MeshInstance3D.new()
	var plane_mesh := QuadMesh.new()
	plane_mesh.size = MIRROR_SIZE
	_mirror_plane.mesh = plane_mesh
	var mirror_material := StandardMaterial3D.new()
	mirror_material.albedo_color = Color(0.82, 0.92, 1.0, 0.24)
	mirror_material.metallic = 0.92
	mirror_material.roughness = 0.16
	mirror_material.emission_enabled = true
	mirror_material.emission = Color(0.36, 0.52, 0.78)
	mirror_material.emission_energy_multiplier = 0.22
	mirror_material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mirror_material.alpha_scissor_threshold = 0.02
	_mirror_plane.material_override = mirror_material
	_mirror_plane.position = Vector3(DEMO_ROOM_WIDTH * 0.5 - 0.01, 3.0, -16.0)
	_mirror_plane.rotation_degrees = Vector3(0.0, -90.0, 0.0)
	fx_root.add_child(_mirror_plane)
	_add_box_prop(fx_root, _mirror_plane.position + Vector3(-0.06, 0.0, 0.0), Vector3(0.24, 6.4, 10.4), wall_mat)
	_add_demo_label("MIRROR TEST", _mirror_plane.position + Vector3(-0.24, 3.8, 0.0), 90.0)


func _add_demo_shoot_targets() -> void:
	var target_material := TrapHelper.make_material(Color(0.74, 0.12, 0.1), 0.9, 0.18, 0.2)
	var hit_material := TrapHelper.make_material(Color(0.2, 0.9, 1.0), 2.5, 0.02, 0.08)
	var stand_material := TrapHelper.make_material(Color(0.07, 0.08, 0.1), 0.0, 0.28, 0.36)
	for target_index in range(6):
		var target := DemoShootTarget.new()
		target.name = "ShootTarget_%d" % target_index
		target.position = Vector3(-15.0 + float(target_index) * 6.0, 1.35, -18.0 - float(target_index % 2) * 7.0)
		geometry_root.add_child(target)
		target.setup(Vector3(1.4, 2.2, 0.28), target_material, hit_material)
		_add_box_prop(fx_root, target.position + Vector3(0.0, -1.14, 0.08), Vector3(0.18, 0.7, 0.18), stand_material)
		_add_box_prop(fx_root, target.position + Vector3(0.0, -1.55, 0.08), Vector3(1.9, 0.12, 0.8), stand_material)
	_add_demo_label("SHOOT TARGETS", Vector3(0.0, 3.4, -16.0), 0.0)


func _add_demo_bug_arena(floor_mat: Material, accent_mat: Material) -> void:
	_add_static_box(geometry_root, Vector3(0.0, 0.03, -64.0), Vector3(18.0, 0.18, 18.0), floor_mat)
	_add_box_prop(fx_root, Vector3(0.0, 0.18, -64.0), Vector3(17.6, 0.04, 17.6), TrapHelper.make_material(Color(0.12, 0.2, 0.22), 0.4, 0.0, 0.18))
	for x in [-9.2, 9.2]:
		_add_static_box(geometry_root, Vector3(x, 1.1, -64.0), Vector3(0.4, 2.2, 18.0), accent_mat)
	for z in [-73.2, -54.8]:
		_add_static_box(geometry_root, Vector3(0.0, 1.1, z), Vector3(18.0, 2.2, 0.4), accent_mat)
	_add_box_prop(fx_root, DEMO_BUG_TARGET + Vector3(0.0, 0.2, 0.0), Vector3(1.1, 0.12, 1.1), TrapHelper.make_material(Color(1.0, 0.2, 0.12), 2.8, 0.0, 0.08))
	_add_demo_label("TRAPPER B BUGS", Vector3(0.0, 3.2, -54.5), 0.0)


func _add_demo_route_guides(accent_mat: Material) -> void:
	for guide_index in range(9):
		_add_box_prop(fx_root, Vector3(0.0, 0.08, -8.0 - float(guide_index) * 9.0), Vector3(2.2, 0.04, 0.35), accent_mat)


func _add_demo_label(text: String, label_position: Vector3, yaw_degrees: float) -> void:
	var label := Label3D.new()
	label.text = text
	label.font = _game_font
	label.position = label_position
	label.rotation_degrees.y = yaw_degrees
	label.font_size = 54
	label.modulate = Color(0.96, 0.9, 0.72)
	label.billboard = BaseMaterial3D.BILLBOARD_DISABLED
	fx_root.add_child(label)


func _add_rotated_static_box(parent: Node3D, node_position: Vector3, size: Vector3, rotation_degrees_value: Vector3, material: Material, node_name: String) -> StaticBody3D:
	var body := StaticBody3D.new()
	body.name = node_name
	body.position = node_position
	body.rotation_degrees = rotation_degrees_value
	parent.add_child(body)
	TrapHelper.add_box_mesh(body, size, Vector3.ZERO, material)
	TrapHelper.add_box_collision(body, size)
	return body


func _build_finish_stretch(_floor_mat: StandardMaterial3D, accent_mat: StandardMaterial3D) -> void:
	_add_box_prop(fx_root, Vector3(0.0, 0.12, DEMO_FINISH_Z), Vector3(13.0, 0.1, 8.0), TrapHelper.make_material(Color(0.14, 0.75, 0.3), 2.5, 0.0, 0.1))
	_add_box_prop(fx_root, Vector3(0.0, 3.0, DEMO_FINISH_Z + 4.0), Vector3(13.4, 0.2, 0.2), accent_mat)
	_add_box_prop(fx_root, Vector3(-6.4, 1.5, DEMO_FINISH_Z + 4.0), Vector3(0.2, 3.0, 0.2), accent_mat)
	_add_box_prop(fx_root, Vector3(6.4, 1.5, DEMO_FINISH_Z + 4.0), Vector3(0.2, 3.0, 0.2), accent_mat)

func _physics_process(delta: float) -> void:
	_update_moving_platforms(delta)

func _add_demo_moving_parts(floor_mat: Material, accent_mat: Material) -> void:
	_add_demo_moving_platform(Vector3(-12.0, 4.6, -72.0), Vector3(8.0, 0.4, 6.0), Vector3(1.0, 0.0, 0.0), 24.0, 2.2, floor_mat)
	_add_demo_moving_platform(Vector3(10.0, 7.5, -83.0), Vector3(10.0, 0.4, 5.5), Vector3(0.0, 0.0, 1.0), 10.0, 2.0, floor_mat)
	_add_box_prop(fx_root, Vector3(0.0, 10.0, -92.0), Vector3(24.0, 0.3, 20.0), accent_mat)

func _add_demo_moving_platform(start_position: Vector3, size: Vector3, axis: Vector3, travel_distance: float, speed: float, material: Material) -> void:
	var platform := StaticBody3D.new()
	platform.name = "MovingPlatform"
	platform.position = start_position
	geometry_root.add_child(platform)
	TrapHelper.add_box_mesh(platform, size, Vector3.ZERO, material)
	var collision := CollisionShape3D.new()
	var shape := BoxShape3D.new()
	shape.size = size
	collision.shape = shape
	platform.add_child(collision)
	_moving_parts.append({
		"body": platform,
		"axis": axis,
		"distance": travel_distance,
		"speed": speed,
		"start": start_position,
		"direction": 1.0
	})

func _update_moving_platforms(delta: float) -> void:
	for part in _moving_parts:
		var body: StaticBody3D = part["body"]
		if not is_instance_valid(body):
			continue
		var axis: Vector3 = part["axis"]
		var distance: float = part["distance"]
		var speed: float = part["speed"]
		var start: Vector3 = part["start"]
		var direction: float = part["direction"]
		body.position += axis * speed * delta * direction
		var traveled: float = (body.position - start).dot(axis)
		if traveled < 0.0:
			body.position = start
			part["direction"] = 1.0
		elif traveled > distance:
			body.position = start + axis * distance
			part["direction"] = -1.0


func server_release_bug_swarm(trapper_peer_id: int) -> bool:
	if game_manager == null or not multiplayer.is_server() or int(game_manager.get("state")) != 2:
		return false
	var players := _players()
	if trapper_peer_id not in players:
		return false
	if int(players[trapper_peer_id].get("role", ROLE_RUNNER)) != ROLE_TRAPPER or not bool(players[trapper_peer_id].get("alive", false)):
		return false
	var runner_ids: Array = _get_alive_runner_ids()
	var total_bugs: int = max(runner_ids.size(), 1) * BUGS_PER_RUNNER
	var start_id: int = _next_bug_id
	_next_bug_id += total_bugs
	var spawn_origin := _get_demo_bug_spawn_origin(trapper_peer_id)
	rpc("_client_spawn_bug_swarm", start_id, trapper_peer_id, total_bugs, spawn_origin, DEMO_BUG_TARGET)
	return true


func dev_release_bug_pack(bug_count: int = 5) -> void:
	if multiplayer.multiplayer_peer == null or multiplayer.is_server():
		_release_debug_bug_pack(bug_count)
		return
	rpc_id(1, "_server_dev_release_bug_pack", bug_count)


func _release_debug_bug_pack(bug_count: int) -> void:
	if not _is_authority_active():
		return
	var total_bugs: int = max(bug_count, 1)
	var start_id: int = _next_bug_id
	_next_bug_id += total_bugs
	var spawn_origin := _get_demo_bug_spawn_origin(-1)
	rpc("_client_spawn_bug_swarm", start_id, -1, total_bugs, spawn_origin, DEMO_BUG_TARGET)


@rpc("any_peer", "call_remote", "reliable")
func _server_dev_release_bug_pack(bug_count: int = 5) -> void:
	if not multiplayer.is_server():
		return
	_release_debug_bug_pack(bug_count)


func _get_demo_bug_spawn_origin(trapper_peer_id: int) -> Vector3:
	var player_node := get_tree().root.find_child(str(trapper_peer_id), true, false)
	if player_node != null and player_node is Node3D:
		var trapper_node: Node3D = player_node as Node3D
		var forward: Vector3 = Vector3(-trapper_node.transform.basis.z.x, 0.0, -trapper_node.transform.basis.z.z).normalized()
		if forward.length() < 0.1:
			forward = Vector3(0.0, 0.0, -1.0)
		return trapper_node.global_position + forward * 2.0 + Vector3.UP * 0.15
	return Vector3(0.0, 0.45, -56.0)


func _add_demo_grapple_anchors() -> void:
	var anchor_positions = [
		Vector3(-12.0, 9.0, -68.0),
		Vector3(0.0, 9.0, -45.0),
		Vector3(10.0, 10.0, -80.0)
	]
	var mat = TrapHelper.make_material(Color(0.1, 0.8, 1.0), 3.0, 0.0, 0.1)
	for i in range(anchor_positions.size()):
		var anchor := StaticBody3D.new()
		anchor.name = "DemoGrappleAnchor_%d" % i
		anchor.position = anchor_positions[i]
		geometry_root.add_child(anchor)
		
		var visual := MeshInstance3D.new()
		var mesh := SphereMesh.new()
		mesh.radius = 0.6
		mesh.height = 1.2
		visual.mesh = mesh
		visual.material_override = mat
		anchor.add_child(visual)
		
		var collision := CollisionShape3D.new()
		var shape := SphereShape3D.new()
		shape.radius = 0.6
		collision.shape = shape
		anchor.add_child(collision)
