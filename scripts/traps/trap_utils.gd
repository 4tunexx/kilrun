class_name TrapUtils
extends RefCounted


static func make_material(
	color: Color,
	emission_energy: float = 0.0,
	metallic: float = 0.1,
	roughness: float = 0.35
) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.metallic = metallic
	material.roughness = roughness
	if emission_energy > 0.0:
		material.emission_enabled = true
		material.emission = color
		material.emission_energy_multiplier = emission_energy
	return material


static func add_box_mesh(
	parent: Node,
	size: Vector3,
	position: Vector3,
	material: Material
) -> MeshInstance3D:
	var mesh_instance := MeshInstance3D.new()
	var mesh := BoxMesh.new()
	mesh.size = size
	mesh_instance.mesh = mesh
	mesh_instance.position = position
	mesh_instance.material_override = material
	parent.add_child(mesh_instance)
	return mesh_instance


static func add_box_collision(
	parent: Node,
	size: Vector3,
	position: Vector3 = Vector3.ZERO
) -> CollisionShape3D:
	var collision := CollisionShape3D.new()
	var shape := BoxShape3D.new()
	shape.size = size
	collision.shape = shape
	collision.position = position
	parent.add_child(collision)
	return collision


static func make_tone(
	frequency: float,
	duration: float,
	volume: float = 0.35,
	sample_hz: int = 22050
) -> AudioStreamWAV:
	var sample_count: int = int(duration * float(sample_hz))
	var data := PackedByteArray()
	data.resize(sample_count * 2)
	for i in sample_count:
		var t: float = float(i) / float(sample_hz)
		var envelope: float = sin(PI * float(i) / float(max(sample_count, 1)))
		var sample: int = int(sin(TAU * frequency * t) * 32767.0 * volume * envelope)
		data.encode_s16(i * 2, sample)
	var stream := AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_16_BITS
	stream.mix_rate = sample_hz
	stream.stereo = false
	stream.data = data
	return stream


static func eliminate_bodies(area: Area3D) -> void:
	for body in area.get_overlapping_bodies():
		if is_instance_valid(body) and body.has_method("eliminate"):
			body.call("eliminate")


static func damage_bodies(area: Area3D, amount: float) -> void:
	for body in area.get_overlapping_bodies():
		if is_instance_valid(body) and body.has_method("server_apply_damage"):
			body.call("server_apply_damage", amount)
