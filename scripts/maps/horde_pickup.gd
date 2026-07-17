extends Area3D

signal collected(pickup_id: int, collector_peer_id: int, pickup_type: String, amount: float)

const PICKUP_COIN := "COIN"
const PICKUP_AMMO := "AMMO"
const PICKUP_HEALTH := "HEALTH"

var pickup_id: int = -1
var pickup_type: String = PICKUP_COIN
var amount: float = 0.0

var _age: float = 0.0
var _base_position: Vector3 = Vector3.ZERO
var _visual_root: Node3D
var _shadow: MeshInstance3D
var _shadow_material: StandardMaterial3D
var _body_mesh: MeshInstance3D
var _accent_mesh: MeshInstance3D
var _ring_mesh: MeshInstance3D
var _pickup_label: Label3D
var _spark_particles: GPUParticles3D
var _collected: bool = false

@onready var game_manager: Node = get_node("/root/GameManager")


func setup(id_value: int, type_value: String, amount_value: float, spawn_position: Vector3) -> void:
	pickup_id = id_value
	pickup_type = type_value
	amount = amount_value
	position = spawn_position
	_base_position = spawn_position
	if _pickup_label != null:
		_pickup_label.text = _pickup_label_text()
		_pickup_label.modulate = _pickup_tint()


func _ready() -> void:
	monitoring = true
	monitorable = true
	body_entered.connect(_on_body_entered)
	_build_visuals()


func _process(delta: float) -> void:
	if _collected:
		return
	_age += delta
	var bob := sin(_age * 2.8 + float(pickup_id) * 0.3) * 0.12
	global_position.y = _base_position.y + 0.28 + bob
	if _visual_root != null:
		_visual_root.rotation.y += delta * (2.8 if pickup_type == PICKUP_COIN else 1.9)
		if pickup_type == PICKUP_AMMO:
			_visual_root.rotation.x = sin(_age * 3.4) * 0.08
		elif pickup_type == PICKUP_HEALTH:
			_visual_root.rotation.z = sin(_age * 2.6) * 0.12
		if _ring_mesh != null:
			_ring_mesh.rotation.y -= delta * 1.4
			_ring_mesh.scale = Vector3.ONE * (1.0 + sin(_age * 3.2 + float(pickup_id)) * 0.08)
	if _shadow != null:
		var shadow_scale := 1.0 - bob * 0.35
		_shadow.scale = Vector3.ONE * shadow_scale
		if _shadow_material != null:
			var shadow_color: Color = _shadow_material.albedo_color
			shadow_color.a = 0.18 + (0.12 - bob * 0.12)
			_shadow_material.albedo_color = shadow_color
	if _pickup_label != null:
		_pickup_label.modulate.a = 1.0


func _build_visuals() -> void:
	var collision := CollisionShape3D.new()
	var shape := SphereShape3D.new()
	shape.radius = 0.46 if pickup_type == PICKUP_COIN else 0.58
	collision.shape = shape
	add_child(collision)

	_visual_root = Node3D.new()
	_visual_root.name = "VisualRoot"
	add_child(_visual_root)

	_shadow = MeshInstance3D.new()
	var shadow_mesh := CylinderMesh.new()
	shadow_mesh.top_radius = 0.22
	shadow_mesh.bottom_radius = 0.28
	shadow_mesh.height = 0.02
	_shadow.mesh = shadow_mesh
	_shadow.position = Vector3(0.0, -0.22, 0.0)
	_shadow_material = StandardMaterial3D.new()
	_shadow_material.albedo_color = Color(0.0, 0.0, 0.0, 0.22)
	_shadow_material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_shadow_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_shadow.material_override = _shadow_material
	_visual_root.add_child(_shadow)

	_body_mesh = MeshInstance3D.new()
	_accent_mesh = MeshInstance3D.new()
	_ring_mesh = MeshInstance3D.new()
	_visual_root.add_child(_body_mesh)
	_visual_root.add_child(_accent_mesh)
	_visual_root.add_child(_ring_mesh)

	match pickup_type:
		PICKUP_COIN:
			var coin_mesh := CylinderMesh.new()
			coin_mesh.top_radius = 0.18
			coin_mesh.bottom_radius = 0.18
			coin_mesh.height = 0.06
			_body_mesh.mesh = coin_mesh
			_body_mesh.rotation_degrees.x = 90.0
			var coin_material := StandardMaterial3D.new()
			coin_material.albedo_color = Color(1.0, 0.82, 0.22)
			coin_material.emission_enabled = true
			coin_material.emission = Color(1.0, 0.74, 0.18)
			coin_material.emission_energy_multiplier = 1.2
			coin_material.metallic = 0.5
			coin_material.roughness = 0.24
			_body_mesh.material_override = coin_material
			var center_mesh := BoxMesh.new()
			center_mesh.size = Vector3(0.05, 0.05, 0.03)
			_accent_mesh.mesh = center_mesh
			_accent_mesh.position = Vector3.ZERO
			_accent_mesh.material_override = coin_material
			var ring_mesh := TorusMesh.new()
			ring_mesh.inner_radius = 0.16
			ring_mesh.outer_radius = 0.21
			_ring_mesh.mesh = ring_mesh
			_ring_mesh.rotation_degrees.x = 90.0
			_ring_mesh.material_override = _glow_material(Color(1.0, 0.85, 0.3))
		PICKUP_AMMO:
			var ammo_mesh := BoxMesh.new()
			ammo_mesh.size = Vector3(0.34, 0.2, 0.22)
			_body_mesh.mesh = ammo_mesh
			var ammo_material := StandardMaterial3D.new()
			ammo_material.albedo_color = Color(0.18, 0.24, 0.32)
			ammo_material.roughness = 0.34
			ammo_material.metallic = 0.22
			_body_mesh.material_override = ammo_material
			var strap_mesh := BoxMesh.new()
			strap_mesh.size = Vector3(0.08, 0.22, 0.24)
			_accent_mesh.mesh = strap_mesh
			_accent_mesh.material_override = _glow_material(Color(0.38, 0.86, 1.0))
			var ammo_ring := CylinderMesh.new()
			ammo_ring.top_radius = 0.24
			ammo_ring.bottom_radius = 0.24
			ammo_ring.height = 0.02
			_ring_mesh.mesh = ammo_ring
			_ring_mesh.position = Vector3(0.0, -0.02, 0.0)
			_ring_mesh.material_override = _glow_material(Color(0.4, 0.88, 1.0))
		PICKUP_HEALTH:
			var potion_mesh := CapsuleMesh.new()
			potion_mesh.radius = 0.13
			potion_mesh.height = 0.44
			_body_mesh.mesh = potion_mesh
			_body_mesh.material_override = _glow_material(Color(0.92, 0.18, 0.22))
			var cork_mesh := CylinderMesh.new()
			cork_mesh.top_radius = 0.05
			cork_mesh.bottom_radius = 0.05
			cork_mesh.height = 0.09
			_accent_mesh.mesh = cork_mesh
			_accent_mesh.position = Vector3(0.0, 0.18, 0.0)
			var cork_material := StandardMaterial3D.new()
			cork_material.albedo_color = Color(0.32, 0.16, 0.08)
			cork_material.roughness = 0.7
			_accent_mesh.material_override = cork_material
			var potion_ring := TorusMesh.new()
			potion_ring.inner_radius = 0.15
			potion_ring.outer_radius = 0.2
			_ring_mesh.mesh = potion_ring
			_ring_mesh.position = Vector3(0.0, -0.01, 0.0)
			_ring_mesh.material_override = _glow_material(Color(0.96, 0.26, 0.32))

	_pickup_label = Label3D.new()
	_pickup_label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	_pickup_label.no_depth_test = true
	_pickup_label.font_size = 42
	_pickup_label.outline_size = 4
	_pickup_label.position = Vector3(0.0, 0.42, 0.0)
	_pickup_label.modulate = _pickup_tint()
	_pickup_label.text = _pickup_label_text()
	add_child(_pickup_label)

	_spark_particles = GPUParticles3D.new()
	_spark_particles.amount = 10
	_spark_particles.lifetime = 1.1
	_spark_particles.preprocess = 1.1
	_spark_particles.position = Vector3(0.0, 0.02, 0.0)
	var spark_mesh := SphereMesh.new()
	spark_mesh.radius = 0.015
	spark_mesh.height = 0.03
	_spark_particles.draw_pass_1 = spark_mesh
	var spark_process := ParticleProcessMaterial.new()
	spark_process.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_SPHERE
	spark_process.emission_sphere_radius = 0.08
	spark_process.direction = Vector3(0.0, 1.0, 0.0)
	spark_process.spread = 25.0
	spark_process.initial_velocity_min = 0.02
	spark_process.initial_velocity_max = 0.08
	spark_process.scale_min = 0.02
	spark_process.scale_max = 0.04
	spark_process.gravity = Vector3(0.0, 0.06, 0.0)
	spark_process.color = Color(_pickup_tint().r, _pickup_tint().g, _pickup_tint().b, 0.35)
	_spark_particles.process_material = spark_process
	_spark_particles.emitting = true
	_visual_root.add_child(_spark_particles)


func _glow_material(tint: Color) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = tint
	material.emission_enabled = true
	material.emission = tint
	material.emission_energy_multiplier = 1.35
	material.roughness = 0.26
	return material


func _pickup_tint() -> Color:
	match pickup_type:
		PICKUP_COIN:
			return Color(1.0, 0.84, 0.3)
		PICKUP_AMMO:
			return Color(0.42, 0.9, 1.0)
		PICKUP_HEALTH:
			return Color(0.98, 0.32, 0.36)
	return Color.WHITE


func _pickup_label_text() -> String:
	match pickup_type:
		PICKUP_COIN:
			return "+%d $" % int(round(amount))
		PICKUP_AMMO:
			return "+%d AMMO" % int(round(amount))
		PICKUP_HEALTH:
			return "+%d HP" % int(round(amount))
	return ""


func _on_body_entered(body: Node) -> void:
	if _collected or not multiplayer.is_server():
		return
	if body == null or not body is Node3D:
		return
	if not body.has_method("server_apply_damage"):
		return
	var peer_id := int(body.name.to_int())
	if peer_id <= 0:
		return
	var players: Dictionary = game_manager.get("players") as Dictionary
	if peer_id not in players:
		return
	if int(players[peer_id].get("role", 0)) != 0 or not bool(players[peer_id].get("alive", false)):
		return
	_collected = true
	set_deferred("monitoring", false)
	collected.emit(pickup_id, peer_id, pickup_type, amount)
