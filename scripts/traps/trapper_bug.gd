extends Node3D

var damage_amount: float = 5.0
var max_health: float = 100.0
const MOVE_SPEED: float = 4.0
const TURN_SPEED: float = 6.0
const HOVER_HEIGHT: float = 0.52
const BOUNCE_HEIGHT: float = 0.24
const BOUNCE_SPEED: float = 8.2
const TOUCH_RADIUS: float = 0.92
const ATTACK_INTERVAL: float = 1.0
const CHASE_BUFFER_DISTANCE: float = 0.4
const CHASE_SLOW_RADIUS: float = 2.6
const ATTACK_PUSH_SPEED: float = 0.82
const ATTACK_PUSH_UP: float = 0.18
const GROUND_CHECK_UP: float = 0.65
const GROUND_CHECK_DOWN: float = 15.0
const BUG_FALL_RESPAWN_Y: float = -2.2
const SAFE_GROUND_MAX_DROP: float = 1.18
const WALK_CHECK_RADIUS: float = 0.2
const HEALTH_BAR_SHOW_TIME: float = 2.2
const HEALTH_BAR_WIDTH: int = 68
const HEALTH_BAR_HEIGHT: int = 8
const GROUND_FOLLOW_SPEED: float = 7.5
const MAX_PLATFORM_STEP_HEIGHT: float = 4.6
const WALL_CHECK_HEIGHT: float = 0.46
const TARGET_LINE_HEIGHT: float = 0.75
const MOVE_PROBE_BIAS: float = 0.68
const VARIANT_CRAWLER := 0
const VARIANT_BEETLE := 1
const VARIANT_STINGER := 2
const VARIANT_TITAN := 3

enum BugState { IDLE, CHASE, ATTACK, SPIT, DIE }

var current_state: BugState = BugState.CHASE
var is_editor_preview: bool = false
@export var monster_profile: Resource:
	set(val):
		monster_profile = val
		if val != null:
			max_health = val.get("max_health")
			health = max_health
			damage_amount = val.get("damage_amount")
			_move_speed = val.get("move_speed")
			_turn_speed = val.get("turn_speed")
			_scale_modifier = val.get("scale_modifier")
			_variant_kind = val.get("variant_kind")
			_is_flying_variant = val.get("is_flying")
			if val.get("is_strong"):
				make_strong()

var bug_id: int = 0
var owner_peer_id: int = -1
var health: float = max_health
var _age: float = 0.0
var _wobble_phase: float = 0.0
var _destroyed: bool = false
var _fallback_target_position: Vector3 = Vector3.ZERO
var _has_fallback_target: bool = false
var _move_speed: float = MOVE_SPEED
var _turn_speed: float = TURN_SPEED
var _jitter_offset: float = 0.0
var _scale_modifier: float = 1.0
var _visual_root: Node3D
var _attack_cooldown: float = 0.0
var _locked_target_peer_id: int = -1
var _health_bar_anchor: Node3D
var _health_bar_sprite: Sprite3D
var _health_bar_texture: ImageTexture
var _health_bar_visible_time: float = 0.0
var _spawn_position: Vector3 = Vector3.ZERO
var _last_safe_position: Vector3 = Vector3.ZERO
var _hover_height_bonus: float = 0.0
var _is_flying_variant: bool = false
var _leg_nodes: Array[MeshInstance3D] = []
var _wing_nodes: Array[MeshInstance3D] = []
var _jaw_nodes: Array[MeshInstance3D] = []
var _tail_nodes: Array[MeshInstance3D] = []
var _antenna_nodes: Array[MeshInstance3D] = []
var _variant_kind: int = VARIANT_CRAWLER
var _debug_move_report_time: float = 0.0
var _debug_touch_gate_report_time: float = 0.0
var _dive_bomb_factor: float = 0.0
var _spit_cooldown: float = 0.0
var _spit_anim_time: float = 0.0
var _sound_timer: float = 0.0
var _last_hit_normal: Vector3 = Vector3.ZERO
var _last_yaw: float = 0.0
var _last_pos: Vector3 = Vector3.ZERO
var _stuck_timer: float = 0.0        # Seconds bug hasn't made meaningful progress
var _stuck_last_pos: Vector3 = Vector3.ZERO  # Position sampled for stuck check
var _stuck_check_interval: float = 0.0  # Countdown for next stuck sample

@onready var game_manager: Node = get_node_or_null("/root/GameManager")
var hit_body: StaticBody3D
var damage_area: Area3D
var shell_mesh: MeshInstance3D
var eye_left: MeshInstance3D
var eye_right: MeshInstance3D




func setup(id_value: int, owner_id: int, spawn_pos: Vector3, fallback_target: Vector3 = Vector3.ZERO) -> void:
	bug_id = id_value
	owner_peer_id = owner_id
	global_position = spawn_pos
	_spawn_position = spawn_pos
	_last_safe_position = spawn_pos
	
	var rng := RandomNumberGenerator.new()
	rng.seed = id_value
	
	_wobble_phase = float(id_value) * 0.71 + rng.randf_range(-1.2, 1.2)
	_jitter_offset = rng.randf_range(0.0, TAU)
	
	# Detect current horde wave/level from the map scene
	var wave: int = 1
	var current_scene := get_tree().current_scene
	if current_scene and "current_wave" in current_scene:
		wave = int(current_scene.current_wave)
		
	# Adjust variant kind based on wave progression:
	# Wave 1: 100% Crawlers (0)
	# Wave 2: 70% Crawler, 30% Beetle (1)
	# Wave 3: Full random between Crawler (0), Beetle (1), Stinger (2)
	# Wave 4+: Full random between Crawler (0), Beetle (1), Stinger (2), Titan (3)
	if wave <= 1:
		_variant_kind = VARIANT_CRAWLER
	elif wave == 2:
		_variant_kind = VARIANT_BEETLE if rng.randf() < 0.3 else VARIANT_CRAWLER
	elif wave == 3:
		_variant_kind = rng.randi() % 3
	else:
		_variant_kind = rng.randi() % 4
		
	# Flyers spawn rate increases with higher wave level
	# Wave 1-2: 0% flyers
	# Wave 3+: 15% to 40% based on wave
	if wave <= 2:
		_is_flying_variant = false
	else:
		var flyer_chance := clampf(0.12 + float(wave - 3) * 0.045, 0.12, 0.42)
		_is_flying_variant = rng.randf() < flyer_chance
		if _variant_kind == VARIANT_TITAN:
			_is_flying_variant = false # Titan cannot fly
		
	# Scale stats with wave progression
	var difficulty_mult := 1.0 + float(wave - 1) * 0.15
	var hp_mult := 1.0 + float(wave - 1) * 0.22
	var speed_mult := 1.0 + float(wave - 1) * 0.04
	
	if _variant_kind == VARIANT_TITAN:
		max_health = 500.0 * hp_mult
		health = max_health
		damage_amount = 25.0 * difficulty_mult
		_move_speed = MOVE_SPEED * 0.55 * speed_mult
		_turn_speed = TURN_SPEED * 0.7 * speed_mult
		_scale_modifier = 2.2 * (1.0 + float(wave - 1) * 0.08)
	else:
		max_health = 100.0 * hp_mult
		health = max_health
		damage_amount = 5.0 * difficulty_mult
		_move_speed = MOVE_SPEED * rng.randf_range(0.8, 0.95) * speed_mult
		_turn_speed = TURN_SPEED * rng.randf_range(0.82, 1.18) * speed_mult
		_scale_modifier = rng.randf_range(0.78, 1.18) * (1.0 + float(wave - 1) * 0.08)
	
	if _is_flying_variant:
		_hover_height_bonus = rng.randf_range(1.5, 2.8) # fly much higher!
		_move_speed *= 1.25 # flyers are faster
		_turn_speed *= 1.25
		
	_fallback_target_position = fallback_target
	_has_fallback_target = fallback_target.distance_to(Vector3.ZERO) > 0.01
	name = "Bug_%d" % id_value
	_sound_timer = randf_range(6.0, 15.0)
	var gm := get_node_or_null("/root/GameManager")
	if gm:
		if _variant_kind == VARIANT_BEETLE:
			gm.call("play_effect", "Large-beast-monster-growling", -12.0)
		else:
			gm.call("play_effect", "some-monsters-cry", -12.0)

func make_strong() -> void:
	max_health = 300.0
	health = max_health
	damage_amount = 15.0
	_scale_modifier *= 1.5
	_move_speed *= 1.2
	if _visual_root:
		_visual_root.scale = Vector3.ONE * _scale_modifier
	if is_instance_valid(shell_mesh) and shell_mesh.material_override is StandardMaterial3D:
		var mat = shell_mesh.material_override as StandardMaterial3D
		mat.albedo_color = Color(0.1, 0.02, 0.15, 1.0)
		mat.emission = Color(0.4, 0.05, 0.6)


func _ready() -> void:
	add_to_group("bugs")
	_build_runtime_nodes()
	if monster_profile and monster_profile.get("csg_shapes") and not monster_profile.csg_shapes.is_empty():
		CSGBuilder.apply_csg_shapes(_visual_root, monster_profile.csg_shapes, false)
	if not damage_area.body_entered.is_connected(_on_damage_area_body_entered):
		damage_area.body_entered.connect(_on_damage_area_body_entered)
		
	var wave: int = 1
	var current_scene := get_tree().current_scene
	if current_scene and "current_wave" in current_scene:
		wave = int(current_scene.current_wave)
		
	var tint_shift: float = fmod(float(bug_id) * 0.07, 0.2)
	var shell_material := StandardMaterial3D.new()
	shell_material.roughness = 0.34
	shell_material.metallic = 0.08
	shell_material.emission_enabled = true
	
	var eye_material := StandardMaterial3D.new()
	eye_material.emission_enabled = true
	eye_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	
	# Apply wave-specific base colors & emissions
	match wave:
		1, 2: # Fire/Volcanic Red-Orange
			shell_material.albedo_color = Color(0.74 + tint_shift, 0.18 + tint_shift * 0.4, 0.12, 1.0)
			shell_material.emission = Color(1.0, 0.28 + tint_shift * 0.45, 0.12)
			shell_material.emission_energy_multiplier = 0.8
			eye_material.albedo_color = Color(1.0, 0.94, 0.84)
			eye_material.emission = Color(1.0, 0.92, 0.78)
			eye_material.emission_energy_multiplier = 1.4
			if _variant_kind == VARIANT_BEETLE:
				shell_material.albedo_color = Color(0.28, 0.2 + tint_shift * 0.3, 0.08, 1.0)
				shell_material.emission = Color(0.9, 0.56, 0.12)
				eye_material.emission = Color(1.0, 0.78, 0.42)
			elif _variant_kind == VARIANT_STINGER:
				shell_material.albedo_color = Color(0.18, 0.08 + tint_shift * 0.25, 0.1, 1.0)
				shell_material.emission = Color(0.92, 0.16, 0.34)
				eye_material.emission = Color(1.0, 0.32, 0.54)
			elif _variant_kind == VARIANT_TITAN:
				shell_material.albedo_color = Color(0.12, 0.03, 0.03, 1.0)
				shell_material.emission = Color(0.95, 0.05, 0.05)
				eye_material.emission = Color(1.0, 0.15, 0.1)
				
		3, 4: # Acid/Toxic Neon Green
			shell_material.albedo_color = Color(0.15, 0.32 + tint_shift, 0.12, 1.0)
			shell_material.emission = Color(0.24, 0.88 + tint_shift * 0.5, 0.14)
			shell_material.emission_energy_multiplier = 0.9
			eye_material.albedo_color = Color(0.9, 1.0, 0.8)
			eye_material.emission = Color(0.6, 1.0, 0.3)
			eye_material.emission_energy_multiplier = 1.5
			if _variant_kind == VARIANT_BEETLE:
				shell_material.albedo_color = Color(0.08, 0.22, 0.08, 1.0)
				shell_material.emission = Color(0.4, 0.78, 0.12)
				eye_material.emission = Color(0.8, 1.0, 0.4)
			elif _variant_kind == VARIANT_STINGER:
				shell_material.albedo_color = Color(0.12, 0.18, 0.22, 1.0)
				shell_material.emission = Color(0.16, 0.92, 0.54)
				eye_material.emission = Color(0.32, 1.0, 0.72)
			elif _variant_kind == VARIANT_TITAN:
				shell_material.albedo_color = Color(0.02, 0.12, 0.04, 1.0)
				shell_material.emission = Color(0.12, 0.95, 0.12)
				eye_material.emission = Color(0.4, 1.0, 0.4)
				
		5, 6: # Lava/Magma Neon Orange/Red
			shell_material.albedo_color = Color(0.18 + tint_shift * 0.1, 0.06, 0.04, 1.0)
			shell_material.emission = Color(1.0, 0.18 + tint_shift * 0.3, 0.02)
			shell_material.emission_energy_multiplier = 1.2
			shell_material.roughness = 0.42
			eye_material.albedo_color = Color(1.0, 0.8, 0.6)
			eye_material.emission = Color(1.0, 0.5, 0.1)
			eye_material.emission_energy_multiplier = 1.7
			if _variant_kind == VARIANT_BEETLE:
				shell_material.albedo_color = Color(0.24, 0.1, 0.04, 1.0)
				shell_material.emission = Color(0.9, 0.35, 0.05)
				eye_material.emission = Color(1.0, 0.65, 0.2)
			elif _variant_kind == VARIANT_STINGER:
				shell_material.albedo_color = Color(0.28, 0.04, 0.15, 1.0)
				shell_material.emission = Color(0.95, 0.08, 0.24)
				eye_material.emission = Color(1.0, 0.25, 0.45)
			elif _variant_kind == VARIANT_TITAN:
				shell_material.albedo_color = Color(0.08, 0.06, 0.05, 1.0)
				shell_material.emission = Color(1.0, 0.25, 0.0)
				eye_material.emission = Color(1.0, 0.4, 0.0)
				
		7, 8: # Void/Electric Neon Blue/Purple
			shell_material.albedo_color = Color(0.1 + tint_shift * 0.1, 0.05, 0.22, 1.0)
			shell_material.emission = Color(0.08, 0.46 + tint_shift * 0.4, 1.0)
			shell_material.emission_energy_multiplier = 1.1
			shell_material.metallic = 0.25
			eye_material.albedo_color = Color(0.8, 0.9, 1.0)
			eye_material.emission = Color(0.2, 0.72, 1.0)
			eye_material.emission_energy_multiplier = 1.6
			if _variant_kind == VARIANT_BEETLE:
				shell_material.albedo_color = Color(0.12, 0.08, 0.28, 1.0)
				shell_material.emission = Color(0.55, 0.18, 0.95)
				eye_material.emission = Color(0.78, 0.42, 1.0)
			elif _variant_kind == VARIANT_STINGER:
				shell_material.albedo_color = Color(0.06, 0.15, 0.26, 1.0)
				shell_material.emission = Color(0.12, 0.85, 0.76)
				eye_material.emission = Color(0.42, 1.0, 0.92)
			elif _variant_kind == VARIANT_TITAN:
				shell_material.albedo_color = Color(0.05, 0.02, 0.12, 1.0)
				shell_material.emission = Color(0.6, 0.1, 0.9)
				eye_material.emission = Color(0.8, 0.2, 1.0)
				
		_: # 9-10+: Abyssal Bosses (Large, Pitch Black, Neon Magenta/Violet)
			shell_material.albedo_color = Color(0.03, 0.02, 0.04, 1.0)
			shell_material.emission = Color(0.92, 0.08, 0.74)
			shell_material.emission_energy_multiplier = 1.5
			shell_material.roughness = 0.18
			shell_material.metallic = 0.45
			eye_material.albedo_color = Color(1.0, 0.7, 0.9)
			eye_material.emission = Color(1.0, 0.12, 0.82)
			eye_material.emission_energy_multiplier = 2.0
			if _variant_kind == VARIANT_BEETLE:
				shell_material.emission = Color(0.72, 0.02, 0.95)
				eye_material.emission = Color(0.85, 0.22, 1.0)
			elif _variant_kind == VARIANT_STINGER:
				shell_material.emission = Color(0.98, 0.12, 0.45)
				eye_material.emission = Color(1.0, 0.32, 0.64)
			elif _variant_kind == VARIANT_TITAN:
				shell_material.emission = Color(0.95, 0.0, 0.45)
				eye_material.emission = Color(1.0, 0.1, 0.6)
				
	shell_mesh.material_override = shell_material
	eye_left.material_override = eye_material
	eye_right.material_override = eye_material
	
	if _is_flying_variant:
		# Tuck legs under the body
		for leg in _leg_nodes:
			if is_instance_valid(leg):
				leg.scale = Vector3(0.45, 0.45, 0.45)
				var side := -1.0 if leg.position.x < 0.0 else 1.0
				leg.rotation_degrees = Vector3(34.0, 0.0, 15.0 * side)
				leg.position.y = -0.14
				
		# Double transparent glowing wings (Forewing + Hindwing)
		var wing_material := StandardMaterial3D.new()
		wing_material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		wing_material.roughness = 0.18
		wing_material.metallic = 0.65
		wing_material.emission_enabled = true
		
		match wave:
			1, 2:
				wing_material.albedo_color = Color(1.0, 0.38, 0.12, 0.58)
				wing_material.emission = Color(1.0, 0.28, 0.08)
			3, 4:
				wing_material.albedo_color = Color(0.38, 0.95, 0.16, 0.58)
				wing_material.emission = Color(0.24, 0.92, 0.12)
			5, 6:
				wing_material.albedo_color = Color(1.0, 0.12, 0.08, 0.58)
				wing_material.emission = Color(0.95, 0.08, 0.02)
			7, 8:
				wing_material.albedo_color = Color(0.12, 0.68, 0.98, 0.58)
				wing_material.emission = Color(0.08, 0.48, 0.95)
			_:
				wing_material.albedo_color = Color(0.88, 0.12, 0.78, 0.58)
				wing_material.emission = Color(0.78, 0.08, 0.68)
		wing_material.emission_energy_multiplier = 2.2
		
		for side in [-1.0, 1.0]:
			# Forewing (larger)
			var forewing := MeshInstance3D.new()
			var forewing_mesh := BoxMesh.new()
			forewing_mesh.size = Vector3(0.02, 0.14, 0.62)
			forewing.mesh = forewing_mesh
			forewing.position = Vector3(0.22 * side, 0.12, -0.06)
			forewing.rotation_degrees = Vector3(12.0, 12.0 * side, 42.0 * side)
			forewing.material_override = wing_material
			_visual_root.add_child(forewing)
			_wing_nodes.append(forewing)
			
			# Hindwing (smaller)
			var hindwing := MeshInstance3D.new()
			var hindwing_mesh := BoxMesh.new()
			hindwing_mesh.size = Vector3(0.015, 0.09, 0.44)
			hindwing.mesh = hindwing_mesh
			hindwing.position = Vector3(0.18 * side, 0.08, 0.14)
			hindwing.rotation_degrees = Vector3(-8.0, -8.0 * side, 52.0 * side)
			hindwing.material_override = wing_material
			_visual_root.add_child(hindwing)
			_wing_nodes.append(hindwing)
			
	_refresh_health_bar()


func _build_runtime_nodes() -> void:
	hit_body = StaticBody3D.new()
	hit_body.name = "HitBody"
	add_child(hit_body)
	var hit_shape := CollisionShape3D.new()
	hit_shape.shape = SphereShape3D.new()
	(hit_shape.shape as SphereShape3D).radius = 0.24
	hit_body.add_child(hit_shape)

	damage_area = Area3D.new()
	damage_area.name = "DamageArea"
	damage_area.monitorable = true
	damage_area.monitoring = true
	add_child(damage_area)
	var damage_shape := CollisionShape3D.new()
	damage_shape.shape = SphereShape3D.new()
	(damage_shape.shape as SphereShape3D).radius = 0.54
	damage_area.add_child(damage_shape)

	var visual_root := Node3D.new()
	visual_root.name = "VisualRoot"
	visual_root.position = Vector3(0.0, 0.04, 0.0)
	visual_root.scale = Vector3.ONE * _scale_modifier
	_visual_root = visual_root
	add_child(visual_root)

	shell_mesh = MeshInstance3D.new()
	shell_mesh.name = "Shell"
	var shell := SphereMesh.new()
	shell.radius = 0.23 * randf_range(0.88, 1.14)
	shell.height = 0.34 * randf_range(0.92, 1.18)
	shell_mesh.mesh = shell
	shell_mesh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	visual_root.add_child(shell_mesh)

	var eye_mesh := SphereMesh.new()
	eye_mesh.radius = 0.035
	eye_mesh.height = 0.07
	eye_left = MeshInstance3D.new()
	eye_left.name = "EyeLeft"
	eye_left.mesh = eye_mesh
	eye_left.position = Vector3(-0.07, 0.03, -0.18)
	visual_root.add_child(eye_left)
	eye_right = MeshInstance3D.new()
	eye_right.name = "EyeRight"
	eye_right.mesh = eye_mesh
	eye_right.position = Vector3(0.07, 0.03, -0.18)
	visual_root.add_child(eye_right)
	for jaw_side in [-1.0, 1.0]:
		var jaw := MeshInstance3D.new()
		var jaw_mesh := BoxMesh.new()
		jaw_mesh.size = Vector3(0.02, 0.03, 0.16)
		jaw.mesh = jaw_mesh
		jaw.position = Vector3(0.04 * jaw_side, -0.02, -0.22)
		jaw.rotation_degrees = Vector3(16.0, 0.0, 20.0 * jaw_side)
		visual_root.add_child(jaw)
		_jaw_nodes.append(jaw)
	for antenna_side in [-1.0, 1.0]:
		var antenna := MeshInstance3D.new()
		var antenna_mesh := CylinderMesh.new()
		antenna_mesh.top_radius = 0.006
		antenna_mesh.bottom_radius = 0.01
		antenna_mesh.height = 0.22
		antenna.mesh = antenna_mesh
		antenna.position = Vector3(0.07 * antenna_side, 0.14, -0.13)
		antenna.rotation_degrees = Vector3(-26.0, 0.0, 22.0 * antenna_side)
		visual_root.add_child(antenna)
		_antenna_nodes.append(antenna)
	for spike_index in 3:
		var spike := MeshInstance3D.new()
		var spike_mesh := CylinderMesh.new()
		spike_mesh.top_radius = 0.0
		spike_mesh.bottom_radius = 0.03
		spike_mesh.height = 0.12
		spike.mesh = spike_mesh
		spike.position = Vector3(0.0, 0.14, 0.04 + float(spike_index) * 0.08)
		spike.rotation_degrees = Vector3(-18.0, 0.0, 0.0)
		if _variant_kind == VARIANT_BEETLE:
			spike.position.y += 0.06
			spike.scale = Vector3(1.15, 1.35, 1.15)
		elif _variant_kind == VARIANT_STINGER:
			spike.position.x = -0.05 + float(spike_index) * 0.05
			spike.position.y += 0.03
		elif _variant_kind == VARIANT_TITAN:
			spike.position.y += 0.08
			spike.scale = Vector3(1.4, 1.8, 1.4)
		visual_root.add_child(spike)
	
	if _variant_kind == VARIANT_TITAN:
		var horn := MeshInstance3D.new()
		var horn_mesh := CylinderMesh.new()
		horn_mesh.top_radius = 0.0
		horn_mesh.bottom_radius = 0.06
		horn_mesh.height = 0.32
		horn.mesh = horn_mesh
		horn.position = Vector3(0.0, 0.22, -0.15)
		horn.rotation_degrees = Vector3(-58.0, 0.0, 0.0)
		visual_root.add_child(horn)

	for tail_index in range(2 if (_variant_kind == VARIANT_STINGER or _variant_kind == VARIANT_TITAN) else 1):
		var tail := MeshInstance3D.new()
		var tail_mesh := CylinderMesh.new()
		tail_mesh.top_radius = 0.0 if (_variant_kind == VARIANT_STINGER or _variant_kind == VARIANT_TITAN) else 0.01
		tail_mesh.bottom_radius = 0.026 * (1.5 if _variant_kind == VARIANT_TITAN else 1.0)
		tail_mesh.height = 0.2 * (1.4 if _variant_kind == VARIANT_TITAN else 1.0) if (_variant_kind == VARIANT_STINGER or _variant_kind == VARIANT_TITAN) else 0.14
		tail.mesh = tail_mesh
		tail.position = Vector3(0.0, 0.02 + float(tail_index) * 0.03, 0.2 + float(tail_index) * 0.07)
		tail.rotation_degrees = Vector3(18.0 + float(tail_index) * 12.0, 0.0, 0.0)
		visual_root.add_child(tail)
		_tail_nodes.append(tail)

	_health_bar_anchor = Node3D.new()
	_health_bar_anchor.name = "HealthBarAnchor"
	_health_bar_anchor.position = Vector3(0.0, 0.7, 0.0)
	add_child(_health_bar_anchor)
	_health_bar_sprite = Sprite3D.new()
	_health_bar_sprite.name = "HealthBar"
	_health_bar_sprite.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	_health_bar_sprite.no_depth_test = true
	_health_bar_sprite.pixel_size = 0.0065
	_health_bar_sprite.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
	_health_bar_sprite.modulate = Color(1.0, 1.0, 1.0, 0.96)
	_health_bar_sprite.visible = false
	_health_bar_anchor.add_child(_health_bar_sprite)

	for side in [-1.0, 1.0]:
		for leg_index in 3:
			var leg := MeshInstance3D.new()
			var leg_mesh := CylinderMesh.new()
			leg_mesh.top_radius = 0.012
			leg_mesh.bottom_radius = 0.016
			leg_mesh.height = 0.18
			leg.mesh = leg_mesh
			leg.rotation_degrees = Vector3(78.0, 0.0, 34.0 * side)
			leg.position = Vector3(0.12 * side, -0.08, -0.1 + float(leg_index) * 0.09)
			visual_root.add_child(leg)
			_leg_nodes.append(leg)


func _physics_process(delta: float) -> void:
	if _destroyed:
		if current_state == BugState.DIE:
			_age += delta
			_animate_appendages()
		return
	if is_editor_preview:
		_age += delta
		_animate_appendages()
		return
		
	# Client-side early out if we are not the server
	if not multiplayer.is_server():
		_age += delta
		_spit_anim_time = max(_spit_anim_time - delta, 0.0)
		_sound_timer -= delta
		if _sound_timer <= 0.0:
			_sound_timer = randf_range(12.0, 24.0)
			var gm := get_node_or_null("/root/GameManager")
			if gm:
				if _is_flying_variant:
					gm.call("play_effect", "Insect-little-monster-flying-wings", -18.0)
				else:
					if _variant_kind == VARIANT_BEETLE:
						gm.call("play_effect", "Large-beast-monster-footsteps", -16.0)
					else:
						gm.call("play_effect", "single-footstep", -18.0)
				if randf() < 0.25:
					if _variant_kind == VARIANT_BEETLE:
						gm.call("play_effect", "Large-beast-monster-growling", -15.0)
					else:
						gm.call("play_effect", "some-monsters-cry", -15.0)
		
		if _health_bar_visible_time > 0.0:
			_health_bar_visible_time = max(_health_bar_visible_time - delta, 0.0)
			if _health_bar_visible_time <= 0.0 and _health_bar_sprite != null:
				_health_bar_sprite.visible = false
				
		if _visual_root != null:
			var wobble_x := sin(_age * 4.0 + _jitter_offset) * 0.18
			var wobble_z := sin(_age * 7.4 + _jitter_offset * 1.4) * (0.12 if _is_flying_variant else 0.05)
			if _is_flying_variant:
				var current_yaw := rotation.y
				var yaw_change := wrapf(current_yaw - _last_yaw, -PI, PI)
				_last_yaw = current_yaw
				var current_pos := global_position
				var is_moving := current_pos.distance_to(_last_pos) > 0.01
				_last_pos = current_pos
				var bank_target := clampf(yaw_change * 5.0, -0.6, 0.6)
				_visual_root.rotation.z = lerpf(_visual_root.rotation.z, bank_target + wobble_z, delta * 6.0)
				var tilt_target := 0.28 if is_moving else 0.0
				_visual_root.rotation.x = lerpf(_visual_root.rotation.x, tilt_target + wobble_x, delta * 5.0)
			else:
				_visual_root.rotation.x = wobble_x
				_visual_root.rotation.z = wobble_z
			_animate_appendages()
		return
	_sound_timer -= delta
	_spit_anim_time = max(_spit_anim_time - delta, 0.0)
	if _sound_timer <= 0.0:
		_sound_timer = randf_range(12.0, 24.0)
		var gm := get_node_or_null("/root/GameManager")
		if gm:
			if _is_flying_variant:
				gm.call("play_effect", "Insect-little-monster-flying-wings", -18.0)
			else:
				if _variant_kind == VARIANT_BEETLE:
					gm.call("play_effect", "Large-beast-monster-footsteps", -16.0)
				else:
					gm.call("play_effect", "single-footstep", -18.0)
			if randf() < 0.25:
				if _variant_kind == VARIANT_BEETLE:
					gm.call("play_effect", "Large-beast-monster-growling", -15.0)
				else:
					gm.call("play_effect", "some-monsters-cry", -15.0)
	_age += delta
	_attack_cooldown = max(_attack_cooldown - delta, 0.0)
	_debug_move_report_time = max(_debug_move_report_time - delta, 0.0)
	_debug_touch_gate_report_time = max(_debug_touch_gate_report_time - delta, 0.0)
	if _health_bar_visible_time > 0.0:
		_health_bar_visible_time = max(_health_bar_visible_time - delta, 0.0)
		if _health_bar_visible_time <= 0.0 and _health_bar_sprite != null:
			_health_bar_sprite.visible = false
	if global_position.y <= BUG_FALL_RESPAWN_Y:
		_recover_to_safe_position()
		return
	_sync_hover_height(delta)
	_update_stuck_detection(delta)
	if _is_walkable_position(global_position):
		_last_safe_position = global_position
	var target_player: Node3D = _find_target_runner()
	var flat_target: Vector3
	if target_player != null:
		flat_target = target_player.global_position
	elif _has_fallback_target:
		flat_target = _fallback_target_position
	else:
		if _spit_anim_time <= 0.0 and _attack_cooldown <= 0.6:
			current_state = BugState.IDLE
		if _visual_root != null:
			_animate_appendages()
		return
	flat_target.y = global_position.y
	var offset: Vector3 = flat_target - global_position
	offset.y = 0.0
	var distance: float = offset.length()
	var target_yaw: float = rotation.y
	if distance > 0.01:
		var direction: Vector3 = offset / distance
		var drift := Vector3(-direction.z, 0.0, direction.x) * sin(_age * 2.4 + _jitter_offset) * 0.08
		var move_vector: Vector3 = (direction + drift).normalized()
		var move_speed_scale: float = 1.0
		if distance < CHASE_SLOW_RADIUS:
			move_speed_scale = lerpf(0.45, 1.0, clampf((distance - CHASE_BUFFER_DISTANCE) / max(CHASE_SLOW_RADIUS - CHASE_BUFFER_DISTANCE, 0.01), 0.0, 1.0))
		if distance <= CHASE_BUFFER_DISTANCE:
			move_vector = (-direction * 0.72 + drift * 0.4).normalized()
			move_speed_scale = 0.38
		if not _try_move_towards(direction, move_vector, move_speed_scale, delta, target_player):
			_locked_target_peer_id = -1
		target_yaw = atan2(direction.x, direction.z)
		rotation.y = lerp_angle(rotation.y, target_yaw, min(delta * _turn_speed, 1.0))
		
	if _spit_anim_time > 0.0:
		current_state = BugState.SPIT
	elif _attack_cooldown > 0.6:
		current_state = BugState.ATTACK
	elif distance > CHASE_BUFFER_DISTANCE:
		current_state = BugState.CHASE
	else:
		current_state = BugState.IDLE
		
	# Ranged Spit Attack for Elite/Strong Bugs
	if max_health >= 300.0:
		_spit_cooldown = max(_spit_cooldown - delta, 0.0)
		if _spit_cooldown <= 0.0 and target_player != null and distance > 4.0 and distance < 16.0:
			if _has_clear_line_to_target(target_player):
				_perform_spit_attack(target_player)
				_spit_cooldown = randf_range(3.0, 5.0)

	# If flying, manage dive-bomb factor
	if _is_flying_variant:
		if target_player != null and distance < 4.5 and _attack_cooldown < 0.4:
			_dive_bomb_factor = min(_dive_bomb_factor + delta * 3.8, 1.0)
		else:
			_dive_bomb_factor = max(_dive_bomb_factor - delta * 2.2, 0.0)
			
	if _visual_root != null:
		var wobble_x := sin(_age * 4.0 + _jitter_offset) * 0.18
		var wobble_z := sin(_age * 7.4 + _jitter_offset * 1.4) * (0.12 if _is_flying_variant else 0.05)
		
		# Apply banking (roll) when turning, and tilt forward when moving
		if _is_flying_variant:
			var current_yaw := rotation.y
			var angle_diff := wrapf(target_yaw - current_yaw, -PI, PI) if distance > 0.01 else 0.0
			var bank_target := clampf(angle_diff * 1.2, -0.6, 0.6)
			
			_visual_root.rotation.z = lerpf(_visual_root.rotation.z, bank_target + wobble_z, delta * 6.0)
			
			# Tilt forward slightly when moving forward
			var tilt_target := 0.28 if distance > CHASE_BUFFER_DISTANCE else 0.0
			_visual_root.rotation.x = lerpf(_visual_root.rotation.x, tilt_target + wobble_x, delta * 5.0)
		else:
			_visual_root.rotation.x = wobble_x
			_visual_root.rotation.z = wobble_z
			
		_animate_appendages()
	if _attack_cooldown <= 0.0:
		if target_player != null and distance <= TOUCH_RADIUS and _can_touch_target(target_player):
			_apply_touch_damage(target_player)
		else:
			var touching_runner := _find_touching_runner()
			if touching_runner != null:
				_apply_touch_damage(touching_runner)
	if multiplayer.is_server():
		rpc("_client_sync_position", global_position, rotation.y, current_state)


func server_apply_damage(amount: float, attacker_id: int = -1) -> void:
	if not multiplayer.is_server() or _destroyed:
		return
	var applied_amount: float = max(amount, 0.0)
	if applied_amount <= 0.0:
		return
	health = max(health - applied_amount, 0.0)
	rpc("_client_sync_health_bar", health, true)
	if health <= 0.0:
		if attacker_id > 0 and game_manager.has_method("award_bug_kill_xp"):
			game_manager.call("award_bug_kill_xp", attacker_id)
		if attacker_id > 0:
			var coin_drop := randi_range(4, 8)
			var ammo_drop := 0
			var heal_drop := 0.0
			if randf() < 0.45:
				ammo_drop = randi_range(8, 18)
			if randf() < 0.22:
				heal_drop = float(randi_range(8, 16))
			if max_health >= 300.0:
				coin_drop += 6
				ammo_drop += 6 if ammo_drop > 0 else 0
				heal_drop += 6.0 if heal_drop > 0.0 else 0.0
			var current_scene := get_tree().current_scene
			if current_scene != null and current_scene.has_method("spawn_horde_loot_pickups"):
				current_scene.call("spawn_horde_loot_pickups", global_position, coin_drop, heal_drop, ammo_drop)
			elif game_manager.has_method("award_horde_loot"):
				game_manager.call("award_horde_loot", attacker_id, coin_drop, heal_drop, ammo_drop)
		_destroy_bug()


func _apply_touch_damage(target_player: Node3D) -> void:
	if not multiplayer.is_server() or _destroyed:
		return
	if target_player == null or not is_instance_valid(target_player):
		return
	if not _can_touch_target(target_player):
		return
	if target_player.has_method("server_apply_damage"):
		target_player.call("server_apply_damage", damage_amount, owner_peer_id)
		if owner_peer_id > 0 and game_manager != null and game_manager.has_method("record_damage_dealt"):
			game_manager.call("record_damage_dealt", owner_peer_id, damage_amount)
	if target_player is CharacterBody3D:
		var body := target_player as CharacterBody3D
		var push_dir := body.global_position - global_position
		push_dir.y = 0.0
		if push_dir.length() > 0.01:
			push_dir = push_dir.normalized()
			body.velocity.x += push_dir.x * ATTACK_PUSH_SPEED
			body.velocity.z += push_dir.z * ATTACK_PUSH_SPEED
			body.velocity.y = max(body.velocity.y, ATTACK_PUSH_UP)
	_attack_cooldown = ATTACK_INTERVAL
	_locked_target_peer_id = target_player.name.to_int()


func _find_touching_runner() -> Node3D:
	if damage_area == null:
		return null
	var players: Dictionary = game_manager.get("players") as Dictionary
	for body_variant in damage_area.get_overlapping_bodies():
		if not body_variant is Node3D:
			continue
		var body := body_variant as Node3D
		if body == null or not is_instance_valid(body) or body.name == str(owner_peer_id):
			continue
		if not body.has_method("server_apply_damage"):
			continue
		var peer_id: int = body.name.to_int()
		if peer_id in players and int(players[peer_id].get("role", 0)) == 0 and bool(players[peer_id].get("alive", false)):
			if _can_touch_target(body):
				return body
	return null


func _find_target_runner() -> Node3D:
	var players: Dictionary = game_manager.get("players") as Dictionary
	if _locked_target_peer_id in players:
		var locked_player: Dictionary = players[_locked_target_peer_id]
		if int(locked_player.get("role", 0)) == 0 and bool(locked_player.get("alive", false)):
			var locked_node := get_tree().root.find_child(str(_locked_target_peer_id), true, false)
			if locked_node != null and locked_node is Node3D and (locked_node as Node3D).visible:
				return locked_node as Node3D
	_locked_target_peer_id = -1
	var nearest_player: Node3D = null
	var nearest_visible_player: Node3D = null
	var nearest_distance_sq: float = INF
	var nearest_visible_distance_sq: float = INF
	for peer_id in players:
		var player_data: Dictionary = players[peer_id]
		if int(player_data.get("role", 0)) != 0 or not bool(player_data.get("alive", false)):
			continue
		var node := get_tree().root.find_child(str(peer_id), true, false)
		if node == null or not node is Node3D:
			continue
		var player_node: Node3D = node as Node3D
		if not player_node.visible:
			continue
		var distance_sq: float = global_position.distance_squared_to(player_node.global_position)
		if _has_clear_line_to_target(player_node):
			if distance_sq < nearest_visible_distance_sq:
				nearest_visible_distance_sq = distance_sq
				nearest_visible_player = player_node
			continue
		if distance_sq < nearest_distance_sq:
			nearest_distance_sq = distance_sq
			nearest_player = player_node
	if nearest_visible_player != null:
		_locked_target_peer_id = nearest_visible_player.name.to_int()
		return nearest_visible_player
	if nearest_player != null:
		_locked_target_peer_id = nearest_player.name.to_int()
	return nearest_player


func _on_damage_area_body_entered(body: Node) -> void:
	if not multiplayer.is_server() or _destroyed:
		return
	if body == null or not body.has_method("server_apply_damage"):
		return
	if body.name == str(owner_peer_id):
		return
	var players: Dictionary = game_manager.get("players") as Dictionary
	var peer_id: int = body.name.to_int()
	if peer_id in players and int(players[peer_id].get("role", 0)) == 0:
		if _can_touch_target(body as Node3D):
			_apply_touch_damage(body as Node3D)


func _destroy_bug() -> void:
	if _destroyed:
		return
	_destroyed = true
	remove_from_group("bugs")
	if multiplayer.is_server():
		var current_scene := get_tree().current_scene
		if current_scene != null and current_scene.has_method("notify_horde_bug_destroyed"):
			current_scene.call("notify_horde_bug_destroyed")
	if multiplayer.is_server():
		rpc("_client_destroy_bug")
	
	current_state = BugState.DIE
	if hit_body != null and is_instance_valid(hit_body):
		hit_body.queue_free()
	if damage_area != null and is_instance_valid(damage_area):
		damage_area.queue_free()
	if _health_bar_sprite != null and is_instance_valid(_health_bar_sprite):
		_health_bar_sprite.visible = false
	
	get_tree().create_timer(1.2).timeout.connect(queue_free)


func _animate_appendages() -> void:
	if current_state == BugState.DIE:
		if _visual_root != null:
			_visual_root.rotation.z = lerpf(_visual_root.rotation.z, PI, get_physics_process_delta_time() * 5.0)
			_visual_root.rotation.x = lerpf(_visual_root.rotation.x, 0.0, get_physics_process_delta_time() * 5.0)
		for leg_index in range(_leg_nodes.size()):
			var leg := _leg_nodes[leg_index]
			if is_instance_valid(leg):
				var side := -1.0 if leg.position.x < 0.0 else 1.0
				leg.rotation_degrees.x = lerpf(leg.rotation_degrees.x, 90.0, get_physics_process_delta_time() * 5.0)
				leg.rotation_degrees.z = lerpf(leg.rotation_degrees.z, 80.0 * side, get_physics_process_delta_time() * 5.0)
		for wing_index in range(_wing_nodes.size()):
			var wing := _wing_nodes[wing_index]
			if is_instance_valid(wing):
				var wing_side := -1.0 if wing.position.x < 0.0 else 1.0
				wing.rotation_degrees.z = lerpf(wing.rotation_degrees.z, 15.0 * wing_side, get_physics_process_delta_time() * 5.0)
				wing.rotation_degrees.y = lerpf(wing.rotation_degrees.y, 5.0 * wing_side, get_physics_process_delta_time() * 5.0)
		for jaw_index in range(_jaw_nodes.size()):
			var jaw := _jaw_nodes[jaw_index]
			if is_instance_valid(jaw):
				var jaw_side := -1.0 if jaw.position.x < 0.0 else 1.0
				jaw.rotation_degrees.z = lerpf(jaw.rotation_degrees.z, 30.0 * jaw_side, get_physics_process_delta_time() * 5.0)
		for tail_index in range(_tail_nodes.size()):
			var tail := _tail_nodes[tail_index]
			if is_instance_valid(tail):
				tail.rotation_degrees.x = lerpf(tail.rotation_degrees.x, 0.0, get_physics_process_delta_time() * 5.0)
		for antenna_index in range(_antenna_nodes.size()):
			var antenna := _antenna_nodes[antenna_index]
			if is_instance_valid(antenna):
				var _antenna_side := -1.0 if antenna.position.x < 0.0 else 1.0
				antenna.rotation_degrees.z = lerpf(antenna.rotation_degrees.z, 0.0, get_physics_process_delta_time() * 5.0)
		return

	var leg_speed := 10.0
	var leg_amp := 18.0
	var wing_speed := 18.0
	var wing_amp := 32.0
	var jaw_speed := 8.0
	var jaw_amp := 10.0
	var tail_speed := 7.0
	var tail_amp := 10.0
	if _variant_kind == VARIANT_STINGER:
		tail_amp = 18.0
	var antenna_speed := 9.0
	var antenna_amp := 12.0

	match current_state:
		BugState.IDLE:
			leg_speed = 3.0
			leg_amp = 4.0
			wing_speed = 4.0
			wing_amp = 8.0
			jaw_speed = 2.0
			jaw_amp = 3.0
			tail_speed = 2.0
			tail_amp = 4.0
			antenna_speed = 3.0
			antenna_amp = 6.0
			if _visual_root != null:
				var breathe := sin(_age * 2.0) * 0.03
				_visual_root.scale = Vector3.ONE * _scale_modifier * (1.0 + breathe)
		BugState.CHASE:
			leg_speed = 14.0
			leg_amp = 20.0
			wing_speed = 44.0 if _is_flying_variant else 22.0
			wing_amp = 32.0
			jaw_speed = 10.0
			jaw_amp = 12.0
			tail_speed = 10.0
			tail_amp = 16.0
			antenna_speed = 12.0
			antenna_amp = 15.0
		BugState.ATTACK:
			leg_speed = 20.0
			leg_amp = 24.0
			wing_speed = 55.0 if _is_flying_variant else 30.0
			wing_amp = 36.0
			jaw_speed = 24.0
			jaw_amp = 22.0
			tail_speed = 16.0
			tail_amp = 25.0
			antenna_speed = 18.0
			antenna_amp = 18.0
		BugState.SPIT:
			leg_speed = 5.0
			leg_amp = 8.0
			wing_speed = 10.0
			wing_amp = 15.0
			jaw_speed = 0.0
			jaw_amp = 0.0
			tail_speed = 12.0
			tail_amp = 30.0

	for leg_index in range(_leg_nodes.size()):
		var leg := _leg_nodes[leg_index]
		if leg == null or not is_instance_valid(leg):
			continue
		var side := -1.0 if leg.position.x < 0.0 else 1.0
		var leg_wave := sin(_age * leg_speed + float(leg_index) * 0.9 + _jitter_offset) * leg_amp
		leg.rotation_degrees.x = 72.0 + leg_wave * 0.32
		leg.rotation_degrees.z = 30.0 * side + leg_wave * 0.38 * side

	for wing_index in range(_wing_nodes.size()):
		var wing := _wing_nodes[wing_index]
		if wing == null or not is_instance_valid(wing):
			continue
		var wing_side := -1.0 if wing.position.x < 0.0 else 1.0
		var freq := wing_speed
		var phase := float(wing_index) * 1.5
		if wing_index % 2 == 0:
			wing.rotation_degrees.z = (35.0 + sin(_age * freq + phase) * wing_amp) * wing_side
			wing.rotation_degrees.y = (15.0 + cos(_age * freq + phase) * 10.0) * wing_side
		else:
			wing.rotation_degrees.z = (45.0 + sin(_age * freq * 0.95 + phase) * (wing_amp * 0.88)) * wing_side
			wing.rotation_degrees.y = (-10.0 + cos(_age * freq * 0.95 + phase) * 12.0) * wing_side

	for jaw_index in range(_jaw_nodes.size()):
		var jaw := _jaw_nodes[jaw_index]
		if jaw == null or not is_instance_valid(jaw):
			continue
		var jaw_side := -1.0 if jaw.position.x < 0.0 else 1.0
		if current_state == BugState.SPIT:
			jaw.rotation_degrees.z = 38.0 * jaw_side
		else:
			jaw.rotation_degrees.z = (16.0 + sin(_age * jaw_speed + float(jaw_index) * 0.7) * jaw_amp) * jaw_side

	for tail_index in range(_tail_nodes.size()):
		var tail := _tail_nodes[tail_index]
		if tail == null or not is_instance_valid(tail):
			continue
		if current_state == BugState.SPIT:
			tail.rotation_degrees.x = -45.0 + sin(_age * tail_speed + float(tail_index) * 0.8) * 10.0
		else:
			tail.rotation_degrees.x = 16.0 + sin(_age * tail_speed + float(tail_index) * 0.8 + _jitter_offset) * tail_amp

	for antenna_index in range(_antenna_nodes.size()):
		var antenna := _antenna_nodes[antenna_index]
		if antenna == null or not is_instance_valid(antenna):
			continue
		var antenna_side := -1.0 if antenna.position.x < 0.0 else 1.0
		antenna.rotation_degrees.z = (18.0 + sin(_age * antenna_speed + float(antenna_index) * 0.9) * antenna_amp) * antenna_side


func _update_stuck_detection(delta: float) -> void:
	# Check periodically whether the bug is making progress toward the target.
	# If it stays in the same spot for too long while chasing, it is stuck - recover.
	_stuck_check_interval -= delta
	if _stuck_check_interval > 0.0:
		return
	_stuck_check_interval = 0.5  # Sample every half-second

	var moved := global_position.distance_to(_stuck_last_pos)
	_stuck_last_pos = global_position

	if current_state == BugState.CHASE or current_state == BugState.ATTACK:
		if moved < 0.08:  # Barely moved in 0.5 s window
			_stuck_timer += 0.5
			if _stuck_timer >= 2.0:  # Stuck for 2 seconds â†’ recover
				_stuck_timer = 0.0
				_recover_to_safe_position()
		else:
			_stuck_timer = 0.0
	else:
		_stuck_timer = 0.0
func _get_ground_hit(world_pos: Vector3) -> Dictionary:
	var space_state := get_world_3d().direct_space_state
	# Check if there is a ceiling directly above (bug is under a platform).
	# A surface above with a downward-facing normal means we're stuck below it.
	var up_query := PhysicsRayQueryParameters3D.create(
		world_pos,
		world_pos + Vector3.UP * GROUND_CHECK_UP
	)
	up_query.exclude = [self, hit_body, damage_area]
	var up_hit := space_state.intersect_ray(up_query)
	if not up_hit.is_empty():
		var up_normal: Vector3 = up_hit.get("normal", Vector3.UP)
		# Downward-facing normal on a surface above us = platform ceiling = skip
		if up_normal.y <= -0.3:
			return {}
	var query := PhysicsRayQueryParameters3D.create(
		world_pos + Vector3.UP * GROUND_CHECK_UP,
		world_pos + Vector3.DOWN * GROUND_CHECK_DOWN
	)
	query.exclude = [self, hit_body, damage_area]
	return space_state.intersect_ray(query)


func _has_ground_below(world_pos: Vector3) -> bool:
	var hit: Dictionary = _get_ground_hit(world_pos)
	if hit.is_empty():
		return false
	var hit_position: Vector3 = hit.get("position", Vector3.ZERO)
	var hit_normal: Vector3 = hit.get("normal", Vector3.UP)
	var drop: float = world_pos.y - hit_position.y
	return drop <= MAX_PLATFORM_STEP_HEIGHT and hit_normal.y >= 0.35


func _get_clean_ground(world_pos: Vector3) -> Dictionary:
	var hit := _get_ground_hit(world_pos)
	if hit.is_empty():
		return {}
	var hit_normal: Vector3 = hit.get("normal", Vector3.UP)
	if hit_normal.y < 0.35:
		var offsets := [
			Vector3(0.08, 0.0, 0.0), Vector3(-0.08, 0.0, 0.0),
			Vector3(0.0, 0.0, 0.08), Vector3(0.0, 0.0, -0.08)
		]
		for offset in offsets:
			var test_hit := _get_ground_hit(world_pos + offset)
			if not test_hit.is_empty():
				var test_normal: Vector3 = test_hit.get("normal", Vector3.UP)
				if test_normal.y >= 0.35:
					return test_hit
	return hit


func _sample_hover_position(world_pos: Vector3) -> Dictionary:
	var hit: Dictionary = _get_clean_ground(world_pos)
	if hit.is_empty():
		return {}
	var hit_position: Vector3 = hit.get("position", world_pos)
	var hit_normal: Vector3 = hit.get("normal", Vector3.UP)
	if hit_normal.y < 0.35:
		return {}
	var hover_wave: float = sin(_age * BOUNCE_SPEED + _wobble_phase)
	var hover_height := HOVER_HEIGHT + _hover_height_bonus + absf(hover_wave) * BOUNCE_HEIGHT
	return {
		"position": Vector3(world_pos.x, hit_position.y + hover_height, world_pos.z),
		"ground_y": hit_position.y
	}


func _sync_hover_height(delta: float) -> void:
	var sampled := _sample_hover_position(global_position)
	if sampled.is_empty():
		return
	var hover_position: Vector3 = sampled.get("position", global_position)
	# Sanity clamp: never allow hover target to be more than 6 units above current pos in one tick.
	# This prevents a bad raycast (hitting underside of platform) from launching bugs skyward.
	var max_rise := 6.0
	if hover_position.y > global_position.y + max_rise:
		hover_position.y = global_position.y + max_rise
	if _is_flying_variant and _dive_bomb_factor > 0.01:
		var target := _find_target_runner()
		if target != null:
			hover_position.y = lerpf(hover_position.y, target.global_position.y + 0.15, _dive_bomb_factor)
	global_position.y = lerpf(global_position.y, hover_position.y, min(delta * GROUND_FOLLOW_SPEED, 1.0))


func _is_move_blocked(from_pos: Vector3, to_pos: Vector3, target_node: Node3D = null) -> bool:
	var space_state := get_world_3d().direct_space_state
	var ray_start: Vector3 = from_pos + Vector3.UP * WALL_CHECK_HEIGHT
	var ray_end: Vector3 = to_pos + Vector3.UP * WALL_CHECK_HEIGHT
	var ray_direction: Vector3 = ray_end - ray_start
	var ray_length: float = ray_direction.length()
	if ray_length <= 0.001:
		return false
	ray_direction /= ray_length
	var excluded: Array[RID] = []
	if hit_body != null and is_instance_valid(hit_body):
		excluded.append(hit_body.get_rid())
	if damage_area != null and is_instance_valid(damage_area):
		excluded.append(damage_area.get_rid())
	if target_node != null and is_instance_valid(target_node) and target_node is CollisionObject3D:
		excluded.append((target_node as CollisionObject3D).get_rid())
	var remaining_start: Vector3 = ray_start
	for _attempt in 8:
		var query := PhysicsRayQueryParameters3D.create(remaining_start, ray_end)
		query.exclude = excluded
		var hit: Dictionary = space_state.intersect_ray(query)
		if hit.is_empty():
			return false
		var collider: Variant = hit.get("collider", null)
		if collider != null and collider is Node and (collider as Node).has_meta("bug_pass_through"):
			if collider is CollisionObject3D:
				excluded.append((collider as CollisionObject3D).get_rid())
			var hit_position: Vector3 = hit.get("position", remaining_start)
			remaining_start = hit_position + ray_direction * 0.08
			if remaining_start.distance_to(ray_end) <= 0.05:
				return false
			continue
		# RAMP-STUCK FIX: skip collisions with near-horizontal surfaces (floors/shallow ramps only)
		# Threshold 0.55 means only surfaces >33deg from vertical are treated as walkable, not walls
		if collider != null:
			var hit_normal: Vector3 = hit.get("normal", Vector3.UP)
			var hit_position: Vector3 = hit.get("position", remaining_start)
			# Ledge/Drop Check: If hit point is below starting ground level, it's a walkable drop/edge, not a blocking wall.
			if hit_normal.y < 0.35:
				_last_hit_normal = hit_normal
				return true
			if hit_normal.y >= 0.55 or hit_position.y < from_pos.y + 0.15:
				if collider.has_method("get_rid"):
					excluded.append(collider.get_rid())
				remaining_start = hit_position + ray_direction * 0.08
				if remaining_start.distance_to(ray_end) <= 0.05:
					return false
				continue
			_last_hit_normal = hit_normal
		return true
	return false

func _is_volume_blocked(to_pos: Vector3, target_node: Node3D = null) -> bool:
	var space_state := get_world_3d().direct_space_state
	var query := PhysicsShapeQueryParameters3D.new()
	var sphere := SphereShape3D.new()
	sphere.radius = 0.24 * _scale_modifier
	query.shape = sphere
	var query_pos := to_pos
	if global_position.y > to_pos.y + 0.2:
		query_pos.y = global_position.y
	query.transform = Transform3D(Basis(), query_pos)
	
	var excluded: Array[RID] = []
	if hit_body != null and is_instance_valid(hit_body):
		excluded.append(hit_body.get_rid())
	if damage_area != null and is_instance_valid(damage_area):
		excluded.append(damage_area.get_rid())
	if target_node != null and is_instance_valid(target_node) and target_node is CollisionObject3D:
		excluded.append((target_node as CollisionObject3D).get_rid())
	query.exclude = excluded
	
	var ground_hit := _get_clean_ground(to_pos)
	var ground_collider = ground_hit.get("collider", null); var current_ground_hit = _get_clean_ground(global_position); var current_ground_collider = current_ground_hit.get("collider", null)
	
	var results := space_state.intersect_shape(query, 8)
	for result in results:
		var collider = result.get("collider", null)
		if collider != null:
			if collider == ground_collider or collider == current_ground_collider:
				continue
			if collider is Node and collider.has_meta("bug_pass_through"):
				continue
			return true
	return false


func _has_clear_line_to_target(target_player: Node3D) -> bool:
	if target_player == null or not is_instance_valid(target_player):
		return false
	var space_state := get_world_3d().direct_space_state
	var start_pos := global_position + Vector3.UP * 0.46
	var end_pos := target_player.global_position + Vector3.UP * TARGET_LINE_HEIGHT
	var query := PhysicsRayQueryParameters3D.create(start_pos, end_pos)
	var excluded: Array[RID] = []
	if hit_body != null and is_instance_valid(hit_body):
		excluded.append(hit_body.get_rid())
	if damage_area != null and is_instance_valid(damage_area):
		excluded.append(damage_area.get_rid())
	if target_player is CollisionObject3D:
		excluded.append((target_player as CollisionObject3D).get_rid())
	query.exclude = excluded
	var hit := space_state.intersect_ray(query)
	if hit.is_empty():
		return true
	var collider: Variant = hit.get("collider", null)
	if collider != null and collider is Node and (collider as Node).has_meta("bug_pass_through"):
		return true
	var hit_normal: Vector3 = hit.get("normal", Vector3.UP)
	if hit_normal.y >= 0.15:
		return true
	return false


func _can_touch_target(target_player: Node3D) -> bool:
	if target_player == null or not is_instance_valid(target_player):
		return false
	# TOUCH-DAMAGE FIX: use 2D horizontal distance so ramp Y-offset doesn't block damage
	var flat_distance := Vector2(global_position.x, global_position.z).distance_to(Vector2(target_player.global_position.x, target_player.global_position.z))
	if flat_distance > TOUCH_RADIUS + 0.18:
		return false
	return _has_clear_line_to_target(target_player)


func _try_move_towards(direction: Vector3, move_vector: Vector3, move_speed_scale: float, delta: float, target_node: Node3D = null) -> bool:
	_last_hit_normal = Vector3.ZERO
	var step_distance := _move_speed * move_speed_scale * delta
	var right := Vector3(direction.z, 0.0, -direction.x)
	
	var primary_dir := move_vector.normalized()
	var primary_target := global_position + primary_dir * step_distance
	var primary_sampled := _sample_hover_position(primary_target)
	
	if not primary_sampled.is_empty():
		var primary_pos: Vector3 = primary_sampled.get("position", primary_target)
		if _is_walkable_position(primary_pos, primary_dir):
			if not _is_move_blocked(global_position, primary_pos, target_node) and not _is_volume_blocked(primary_pos, target_node):
				global_position = primary_pos
				_last_safe_position = global_position
				return true
		# PLATFORM DROP FIX: allow bugs to step off ledges to chase players below.
		# If sampled ground is significantly lower than current ground = valid ledge drop.
		var sampled_ground_y: float = primary_sampled.get("ground_y", global_position.y)
		var cur_ground_hit := _get_clean_ground(global_position)
		var cur_ground_y: float = (cur_ground_hit.get("position", global_position) as Vector3).y if not cur_ground_hit.is_empty() else global_position.y
		var drop_dist := cur_ground_y - sampled_ground_y
		if drop_dist >= 0.25 and drop_dist <= MAX_PLATFORM_STEP_HEIGHT:
			if not _is_move_blocked(global_position, primary_pos, target_node) and not _is_volume_blocked(primary_pos, target_node):
				global_position = primary_pos
				_last_safe_position = global_position
				return true
	
	var candidates: Array[Vector3] = []
	if _last_hit_normal != Vector3.ZERO:
		var N := _last_hit_normal
		N.y = 0.0
		if N.length_squared() > 0.001:
			N = N.normalized()
		else:
			N = Vector3.UP
		
		var slide_dir := direction - direction.project(N)
		if slide_dir.length_squared() > 0.001:
			slide_dir = slide_dir.normalized()
		else:
			slide_dir = Vector3.ZERO
		
		if slide_dir != Vector3.ZERO:
			candidates.append((slide_dir + N * 0.18).normalized())
			candidates.append((slide_dir - N * 0.05).normalized())
			candidates.append(slide_dir)
			
	candidates.append((direction + right * MOVE_PROBE_BIAS).normalized())
	candidates.append((direction - right * MOVE_PROBE_BIAS).normalized())
	candidates.append((right + direction * 0.4).normalized())
	candidates.append((-right + direction * 0.4).normalized())
	
	for candidate_direction in candidates:
		var flat_candidate: Vector3 = global_position + candidate_direction * step_distance
		var sampled := _sample_hover_position(flat_candidate)
		if sampled.is_empty():
			continue
		var candidate_position: Vector3 = sampled.get("position", flat_candidate)
		if not _is_walkable_position(candidate_position, candidate_direction):
			continue
		if _is_move_blocked(global_position, candidate_position, target_node):
			continue
		if _is_volume_blocked(candidate_position, target_node):
			continue
		global_position = candidate_position
		_last_safe_position = global_position
		return true
		
	return false


func _is_walkable_position(world_pos: Vector3, forward_direction: Vector3 = Vector3.ZERO) -> bool:
	var center_hit: Dictionary = _get_clean_ground(world_pos)
	if center_hit.is_empty():
		return false
	var center_normal: Vector3 = center_hit.get("normal", Vector3.UP)
	if center_normal.y < 0.35:
		return false
	var center_y: float = float((center_hit.get("position", world_pos) as Vector3).y)
	var forward: Vector3 = forward_direction
	forward.y = 0.0
	if forward.length_squared() <= 0.001:
		forward = Vector3.FORWARD
	else:
		forward = forward.normalized()
	var right: Vector3 = Vector3(forward.z, 0.0, -forward.x)
	var samples: Array[Vector3] = [
		world_pos + right * WALK_CHECK_RADIUS,
		world_pos - right * WALK_CHECK_RADIUS,
		world_pos + forward * WALK_CHECK_RADIUS,
		world_pos - forward * WALK_CHECK_RADIUS
	]
	var supported_samples: int = 0
	for sample_pos in samples:
		var sample_hit: Dictionary = _get_clean_ground(sample_pos)
		if sample_hit.is_empty():
			continue
		var sample_normal: Vector3 = sample_hit.get("normal", Vector3.UP)
		var sample_y: float = float((sample_hit.get("position", sample_pos) as Vector3).y)
		# Only restrict steps going UP (where center Y is higher than sample Y by more than step limit). Drops are fine.
		if sample_normal.y >= 0.35 and (sample_y - center_y) <= MAX_PLATFORM_STEP_HEIGHT:
			supported_samples += 1
	return supported_samples >= 2


func _recover_to_safe_position() -> void:
	var safe_position: Vector3 = _spawn_position
	var target_player := _find_target_runner()
	if target_player != null and is_instance_valid(target_player):
		safe_position = target_player.global_position + Vector3.UP * 3.0
	var sampled := _sample_hover_position(safe_position)
	global_position = sampled.get("position", safe_position) if not sampled.is_empty() else safe_position
	_attack_cooldown = max(_attack_cooldown, 0.5)

@rpc("authority", "call_remote", "reliable")
func _client_destroy_bug() -> void:
	_destroyed = true
	current_state = BugState.DIE
	# Hide the bug immediately on clients so it is never invisible-but-still-dealing-damage.
	if _visual_root != null and is_instance_valid(_visual_root):
		_visual_root.visible = false
	if hit_body != null and is_instance_valid(hit_body):
		hit_body.queue_free()
	if damage_area != null and is_instance_valid(damage_area):
		damage_area.queue_free()
	if _health_bar_sprite != null and is_instance_valid(_health_bar_sprite):
		_health_bar_sprite.visible = false
	
	get_tree().create_timer(1.2).timeout.connect(queue_free)


@rpc("authority", "call_local", "reliable")
func _client_sync_health_bar(current_health: float, reveal_bar: bool) -> void:
	if current_health < health and current_health > 0.0:
		var gm := get_node_or_null("/root/GameManager")
		if gm:
			if _variant_kind == VARIANT_BEETLE:
				gm.call("play_effect", "Large-beast-monster-growling", -14.0, randf_range(1.1, 1.3))
			else:
				gm.call("play_effect", "some-monsters-cry", -14.0, randf_range(1.2, 1.4))
	health = current_health
	if reveal_bar:
		_health_bar_visible_time = HEALTH_BAR_SHOW_TIME
	_refresh_health_bar()


func _refresh_health_bar() -> void:
	if _health_bar_sprite == null:
		return
	var health_ratio: float = clamp(health / max_health, 0.0, 1.0)
	var image := Image.create(HEALTH_BAR_WIDTH, HEALTH_BAR_HEIGHT, false, Image.FORMAT_RGBA8)
	image.fill(Color(0.0, 0.0, 0.0, 0.0))
	for x in range(HEALTH_BAR_WIDTH):
		for y in range(HEALTH_BAR_HEIGHT):
			var color := Color(0.04, 0.05, 0.06, 0.88)
			var is_border: bool = x == 0 or x == HEALTH_BAR_WIDTH - 1 or y == 0 or y == HEALTH_BAR_HEIGHT - 1
			if is_border:
				color = Color(0.98, 0.98, 1.0, 0.9)
			elif x <= int(floor((HEALTH_BAR_WIDTH - 2) * health_ratio)):
				color = Color(0.96, 0.18, 0.16, 0.95)
			image.set_pixel(x, y, color)
	if _health_bar_texture == null:
		_health_bar_texture = ImageTexture.create_from_image(image)
	else:
		_health_bar_texture.update(image)
	_health_bar_sprite.texture = _health_bar_texture
	_health_bar_sprite.visible = _health_bar_visible_time > 0.0 and health < max_health

@rpc("authority", "call_local", "reliable")
func _client_spawn_acid_projectile(start_pos: Vector3, target_pos: Vector3) -> void:
	var sphere := MeshInstance3D.new()
	var mesh := SphereMesh.new()
	mesh.radius = 0.18
	mesh.height = 0.18
	sphere.mesh = mesh
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.2, 0.9, 0.1)
	mat.emission_enabled = true
	mat.emission = Color(0.2, 0.9, 0.1)
	sphere.material_override = mat
	get_tree().current_scene.add_child(sphere)
	sphere.global_position = start_pos
	
	var dir := (target_pos - start_pos).normalized()
	var timer := get_tree().create_timer(4.0)
	
	var p_loop = Timer.new()
	p_loop.wait_time = 0.02
	p_loop.autostart = true
	p_loop.timeout.connect(func():
		if not is_instance_valid(sphere):
			p_loop.queue_free()
			return
		sphere.global_position += dir * 0.35
		
		var local_player = get_tree().get_first_node_in_group("local_player")
		if local_player and is_instance_valid(local_player):
			var dist = sphere.global_position.distance_to(local_player.global_position + Vector3.UP * 0.9)
			if dist < 0.8:
				if multiplayer.is_server() and local_player.has_method("server_apply_damage"):
					local_player.call("server_apply_damage", 12.0, -1)
				_create_acid_puddle(sphere.global_position)
				sphere.queue_free()
				p_loop.queue_free()
				return
		
		var space = get_world_3d().direct_space_state
		var query = PhysicsRayQueryParameters3D.create(sphere.global_position, sphere.global_position + dir * 0.4)
		query.exclude = [self, hit_body, damage_area]
		var hit = space.intersect_ray(query)
		if not hit.is_empty():
			_create_acid_puddle(hit.get("position", sphere.global_position))
			sphere.queue_free()
			p_loop.queue_free()
	)
	add_child(p_loop)
	timer.timeout.connect(func():
		if is_instance_valid(sphere):
			sphere.queue_free()
	)

func _create_acid_puddle(pos: Vector3) -> void:
	var puddle := MeshInstance3D.new()
	var mesh := CylinderMesh.new()
	mesh.top_radius = 1.4
	mesh.bottom_radius = 1.4
	mesh.height = 0.02
	puddle.mesh = mesh
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.2, 0.9, 0.1, 0.45)
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.emission_enabled = true
	mat.emission = Color(0.1, 0.6, 0.05)
	mat.emission_energy_multiplier = 0.6
	puddle.material_override = mat
	get_tree().current_scene.add_child(puddle)
	puddle.global_position = pos
	
	var p_timer = Timer.new()
	p_timer.wait_time = 0.2
	p_timer.autostart = true
	p_timer.timeout.connect(func():
		if not is_instance_valid(puddle):
			p_timer.queue_free()
			return
		var local_player = get_tree().get_first_node_in_group("local_player")
		if local_player and is_instance_valid(local_player):
			var flat_dist = Vector2(puddle.global_position.x, puddle.global_position.z).distance_to(Vector2(local_player.global_position.x, local_player.global_position.z))
			var height_diff = absf(puddle.global_position.y - local_player.global_position.y)
			if flat_dist < 1.45 and height_diff < 1.0:
				if local_player.has_method("apply_acid_slow"):
					local_player.call("apply_acid_slow")
	)
	add_child(p_timer)
	
	get_tree().create_timer(4.0).timeout.connect(func():
		if is_instance_valid(puddle):
			puddle.queue_free()
	)

func _perform_spit_attack(target: Node3D) -> void:
	if not multiplayer.is_server():
		return
	rpc("_client_spawn_acid_projectile", global_position + Vector3.UP * 0.4, target.global_position)
	rpc("_client_trigger_spit_state")

@rpc("authority", "call_local", "reliable")
func _client_trigger_spit_state() -> void:
	_spit_anim_time = 0.8


@rpc("authority", "call_remote", "unreliable")
func _client_sync_position(pos: Vector3, rot_y: float, state: int) -> void:
	global_position = pos
	rotation.y = rot_y
	current_state = state as BugState
