@tool
extends Node3D

## ddd_map.gd
## Clean standalone controller for the imported VMF map (ddd.vmf).
## Does NOT inherit test_map.gd (which is a procedural corridor builder).
## The VMFNode handles all geometry/collision generation from the VMF.
## This script only handles: environment setup, player spawning from
## info_player_start entities, and post-import collision optimisation.

const PlayerScene := preload("res://scenes/player/fps_player.tscn")

@onready var vmf_node: VMFNode = $VMFNode
@onready var player_spawner: Node3D = $PlayerSpawner
@onready var world_environment: WorldEnvironment = $WorldEnvironment
@onready var directional_light: DirectionalLight3D = $DirectionalLight3D
@onready var game_manager: Node = get_node_or_null("/root/GameManager")


func _ready() -> void:
	if Engine.is_editor_hint():
		return
	
	_setup_environment()
	
	# Wait one frame so VMFNode children are fully ready
	await get_tree().process_frame
	
	_fix_collision_margins()
	_register_vmf_spawns()
	_connect_game_signals()


func _setup_environment() -> void:
	var environment := Environment.new()
	var sky_material := ProceduralSkyMaterial.new()
	sky_material.sky_top_color = Color(0.01, 0.02, 0.06)
	sky_material.sky_horizon_color = Color(0.08, 0.11, 0.17)
	sky_material.ground_bottom_color = Color(0.02, 0.02, 0.03)
	sky_material.ground_horizon_color = Color(0.07, 0.06, 0.08)
	sky_material.sky_energy_multiplier = 0.75
	var sky := Sky.new()
	sky.sky_material = sky_material
	environment.background_mode = Environment.BG_SKY
	environment.sky = sky
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color(0.22, 0.26, 0.34)
	environment.ambient_light_energy = 1.1
	environment.fog_enabled = false
	world_environment.environment = environment
	if directional_light:
		directional_light.light_color = Color(0.98, 0.92, 0.78)
		directional_light.light_energy = 1.1
		directional_light.rotation_degrees = Vector3(-38.0, 28.0, 0.0)
		directional_light.shadow_enabled = true


func _fix_collision_margins() -> void:
	## Walk every StaticBody3D that GodotVMF generated and:
	##   - Lock it to collision layer 1 (environment)
	##   - Set mask 0 (static geometry doesn't need to scan anything)
	##   - Reduce shape margin to 0.001 to prevent seam snagging
	if not is_instance_valid(vmf_node):
		return
	_walk_collisions(vmf_node)


func _walk_collisions(node: Node) -> void:
	if node is StaticBody3D:
		var body := node as StaticBody3D
		body.collision_layer = 1
		body.collision_mask = 0
	if node is CollisionShape3D:
		(node as CollisionShape3D).margin = 0.001
	for child in node.get_children():
		_walk_collisions(child)


func _register_vmf_spawns() -> void:
	## Find every info_player_start node placed by GodotVMF and expose them
	## to PlayerSpawner as child marker nodes named RunnerSpawn1..N.
	if not is_instance_valid(player_spawner):
		push_warning("ddd_map: PlayerSpawner node not found")
		return
	
	# Clear any pre-baked spawn markers
	for child in player_spawner.get_children():
		if child.name.begins_with("RunnerSpawn") or child.name == "TrapperSpawn":
			child.free()
	
	var spawn_nodes := get_tree().get_nodes_in_group("info_player_start")
	if spawn_nodes.is_empty():
		push_warning("ddd_map: No info_player_start found in scene — using fallback spawn")
		_add_fallback_spawn()
		return
	
	# Spawn origin from VMF: "-640 512 128" in Hammer space
	# With scale 0.03125 and Z-up → Y-up conversion:
	#   Godot X =  hammer_x * scale   = -640 * 0.03125 = -20.0
	#   Godot Y =  hammer_z * scale   =  128 * 0.03125 =   4.0
	#   Godot Z = -hammer_y * scale   = -512 * 0.03125 = -16.0
	# This is also what VMFEntityNode.get_entity_transform() computes at runtime.
	
	var count := 1
	for pt in spawn_nodes:
		if not pt is Node3D:
			continue
		var marker := Node3D.new()
		marker.name = "RunnerSpawn%d" % count
		marker.global_transform = (pt as Node3D).global_transform
		marker.global_position.y += 0.15  # Tiny lift so capsule doesn't clip floor
		player_spawner.add_child(marker)
		count += 1
	
	# Mirror first spawn as TrapperSpawn fallback
	if spawn_nodes.size() > 0:
		var t_marker := Node3D.new()
		t_marker.name = "TrapperSpawn"
		t_marker.global_transform = (spawn_nodes[0] as Node3D).global_transform
		t_marker.global_position.y += 0.15
		player_spawner.add_child(t_marker)


func _add_fallback_spawn() -> void:
	## Hardcoded Godot-space position calculated from info_player_start
	## origin "-640 512 128" with scale 0.03125 and Z→Y axis flip.
	var marker := Node3D.new()
	marker.name = "RunnerSpawn1"
	marker.position = Vector3(-20.0, 4.15, -16.0)
	player_spawner.add_child(marker)
	var t_marker := Node3D.new()
	t_marker.name = "TrapperSpawn"
	t_marker.position = Vector3(-20.0, 4.15, -16.0)
	player_spawner.add_child(t_marker)


func _connect_game_signals() -> void:
	if game_manager == null:
		return
	if game_manager.has_signal("round_started") and not game_manager.round_started.is_connected(_on_round_started):
		game_manager.round_started.connect(_on_round_started)


func _on_round_started() -> void:
	pass  # Hook for future round logic


## Called by PlayerSpawner to get the correct spawn position for a peer.
## Mirrors the API used by test_map / horde_map scenes.
func get_spawn_for_peer(peer_id: int) -> Node3D:
	if player_spawner == null:
		return null
	for child in player_spawner.get_children():
		if child.name.begins_with("RunnerSpawn"):
			return child
	return null
