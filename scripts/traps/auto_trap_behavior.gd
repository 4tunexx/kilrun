extends Node3D

const TrapHelper = preload("res://scripts/traps/trap_utils.gd")

@onready var game_manager: Node = get_node_or_null("/root/GameManager")

var trap_type: String = ""
var _timer: float = 0.0
var _active: bool = false
var _target_node: Node3D = null
var _original_pos: Vector3
var _moving_forward: bool = true

# Sentry / Rocket properties
var _shoot_cooldown: float = 0.0

# Jaws / Spikes
var _part_left: Node3D = null
var _part_right: Node3D = null

func _ready() -> void:
	_original_pos = global_position
	if has_meta("trap_type"):
		trap_type = get_meta("trap_type")
	
	# Initial setup of children/visuals for automated traps if not built
	_setup_trap_visuals()

func _setup_trap_visuals() -> void:
	# Clean existing temporary visuals if editor placed
	for c in get_children():
		if c.name.begins_with("AutoVisual"):
			c.queue_free()

	match trap_type:
		"sentry_turret":
			var base = TrapHelper.add_box_mesh(self, Vector3(0.8, 0.4, 0.8), Vector3(0, 0.2, 0), TrapHelper.make_material(Color(0.2, 0.22, 0.25), 0.0, 0.5, 0.4))
			base.name = "AutoVisualBase"
			var turret = Node3D.new()
			turret.name = "TurretHead"
			turret.position = Vector3(0, 0.5, 0)
			add_child(turret)
			var head = TrapHelper.add_box_mesh(turret, Vector3(0.5, 0.5, 0.5), Vector3.ZERO, TrapHelper.make_material(Color(0.8, 0.1, 0.1), 1.0, 0.2, 0.2))
			head.name = "AutoVisualHead"
			var barrel = TrapHelper.add_box_mesh(turret, Vector3(0.15, 0.15, 0.5), Vector3(0, 0, -0.4), TrapHelper.make_material(Color(0.1, 0.1, 0.1), 0.0, 0.7, 0.1))
			barrel.name = "AutoVisualBarrel"
		
		"homing_mine":
			var body = StaticBody3D.new()
			body.name = "MineBody"
			body.set_meta("map_item_type", "hazard")
			add_child(body)
			var mesh = TrapHelper.add_box_mesh(body, Vector3(0.6, 0.6, 0.6), Vector3.ZERO, TrapHelper.make_material(Color(0.9, 0.45, 0.1), 2.5, 0.0, 0.1))
			mesh.name = "AutoVisualSphere"
			TrapHelper.add_box_collision(body, Vector3(0.6, 0.6, 0.6))
			
		"fire_spewer":
			var base = TrapHelper.add_box_mesh(self, Vector3(0.7, 0.7, 0.7), Vector3(0, 0.35, 0), TrapHelper.make_material(Color(0.2,0.2,0.22), 0.0, 0.6, 0.4))
			base.name = "AutoVisualBase"
			var nozzle = TrapHelper.add_box_mesh(self, Vector3(0.3, 0.25, 0.3), Vector3(0, 0.75, 0), TrapHelper.make_material(Color(1.0, 0.3, 0.0), 3.0, 0.0, 0.1))
			nozzle.name = "AutoVisualNozzle"
			
		"moving_laser":
			var pole1 = TrapHelper.add_box_mesh(self, Vector3(0.3, 3.5, 0.3), Vector3(-2.0, 1.75, 0), TrapHelper.make_material(Color(0.2,0.2,0.2), 0.0, 0.5, 0.4))
			pole1.name = "AutoVisualPole1"
			var pole2 = TrapHelper.add_box_mesh(self, Vector3(0.3, 3.5, 0.3), Vector3(2.0, 1.75, 0), TrapHelper.make_material(Color(0.2,0.2,0.2), 0.0, 0.5, 0.4))
			pole2.name = "AutoVisualPole2"
			var laser = MeshInstance3D.new()
			laser.name = "LaserBeam"
			var mesh := BoxMesh.new()
			mesh.size = Vector3(3.8, 0.08, 0.08)
			laser.mesh = mesh
			laser.material_override = TrapHelper.make_material(Color(1.0, 0.1, 0.1), 3.5, 0.0, 0.02)
			laser.position = Vector3(0, 1.75, 0)
			add_child(laser)
			
			var body = StaticBody3D.new()
			body.name = "LaserHitbox"
			body.set_meta("map_item_type", "hazard")
			body.set_meta("damage_on_touch", 35.0)
			add_child(body)
			TrapHelper.add_box_collision(body, Vector3(3.8, 0.15, 0.15), Vector3(0, 1.75, 0))
			
		"periodic_spikes":
			var base = TrapHelper.add_box_mesh(self, Vector3(2.0, 0.15, 2.0), Vector3(0, 0.075, 0), TrapHelper.make_material(Color(0.3,0.32,0.36), 0.0, 0.6, 0.4))
			base.name = "AutoVisualBase"
			_part_left = Node3D.new()
			_part_left.name = "SpikesNode"
			add_child(_part_left)
			for i in range(4):
				var offset_x = -0.6 + (i * 0.4)
				for j in range(4):
					var offset_z = -0.6 + (j * 0.4)
					TrapHelper.add_box_mesh(_part_left, Vector3(0.06, 0.5, 0.06), Vector3(offset_x, 0.25, offset_z), TrapHelper.make_material(Color(0.8,0.8,0.8), 0.6, 0.8, 0.1))
			
		"boulder_spawner":
			var frame = TrapHelper.add_box_mesh(self, Vector3(1.5, 0.25, 1.5), Vector3(0, 0.125, 0), TrapHelper.make_material(Color(0.15,0.18,0.22), 0.0, 0.6, 0.4))
			frame.name = "AutoVisualBase"
			
		"tesla_coil":
			var base = TrapHelper.add_box_mesh(self, Vector3(0.9, 1.5, 0.9), Vector3(0, 0.75, 0), TrapHelper.make_material(Color(0.24,0.26,0.3), 0.0, 0.5, 0.4))
			base.name = "AutoVisualBase"
			var dome = MeshInstance3D.new()
			dome.name = "TeslaDome"
			var smesh := SphereMesh.new()
			smesh.radius = 0.5
			smesh.height = 1.0
			dome.mesh = smesh
			dome.material_override = TrapHelper.make_material(Color(0.1, 0.6, 1.0), 3.0, 0.0, 0.1)
			dome.position = Vector3(0, 1.7, 0)
			add_child(dome)
			
		"seeker_rocket":
			var base = TrapHelper.add_box_mesh(self, Vector3(1.0, 0.4, 1.0), Vector3(0, 0.2, 0), TrapHelper.make_material(Color(0.25, 0.28, 0.32), 0.0, 0.5, 0.4))
			base.name = "AutoVisualBase"
			var launcher = TrapHelper.add_box_mesh(self, Vector3(0.6, 0.6, 0.8), Vector3(0, 0.7, 0), TrapHelper.make_material(Color(0.18, 0.2, 0.24), 0.0, 0.5, 0.4))
			launcher.name = "RocketLauncher"
			
		"falling_spiked_ball":
			var mount = TrapHelper.add_box_mesh(self, Vector3(1.2, 0.2, 1.2), Vector3(0, -0.1, 0), TrapHelper.make_material(Color(0.2, 0.22, 0.26), 0.0, 0.5, 0.4))
			mount.name = "AutoVisualBase"
			_part_left = Node3D.new()
			_part_left.name = "SpikedBall"
			_part_left.position = Vector3(0, -0.5, 0)
			add_child(_part_left)
			var chain = TrapHelper.add_box_mesh(_part_left, Vector3(0.08, 1.0, 0.08), Vector3(0, 0.5, 0), TrapHelper.make_material(Color(0.4,0.4,0.4), 0.2, 0.8, 0.2))
			chain.name = "VisualChain"
			var ball = MeshInstance3D.new()
			ball.name = "VisualBall"
			var smesh := SphereMesh.new()
			smesh.radius = 0.5
			smesh.height = 1.0
			ball.mesh = smesh
			ball.material_override = TrapHelper.make_material(Color(0.75, 0.1, 0.1), 1.0, 0.4, 0.3)
			_part_left.add_child(ball)
			
		"chomping_maw":
			var base = TrapHelper.add_box_mesh(self, Vector3(3.0, 0.2, 2.0), Vector3.ZERO, TrapHelper.make_material(Color(0.28, 0.3, 0.34), 0.0, 0.5, 0.4))
			base.name = "AutoVisualBase"
			_part_left = Node3D.new()
			_part_left.name = "JawLeft"
			_part_left.position = Vector3(-1.0, 0.2, 0)
			add_child(_part_left)
			TrapHelper.add_box_mesh(_part_left, Vector3(0.8, 0.6, 1.8), Vector3.ZERO, TrapHelper.make_material(Color(0.8, 0.1, 0.1), 1.0, 0.3, 0.3))
			
			_part_right = Node3D.new()
			_part_right.name = "JawRight"
			_part_right.position = Vector3(1.0, 0.2, 0)
			add_child(_part_right)
			TrapHelper.add_box_mesh(_part_right, Vector3(0.8, 0.6, 1.8), Vector3.ZERO, TrapHelper.make_material(Color(0.8, 0.1, 0.1), 1.0, 0.3, 0.3))

func _physics_process(delta: float) -> void:
	if Engine.is_editor_hint():
		return
		
	# Find closest player
	_target_node = _get_closest_player()
	
	_timer += delta
	match trap_type:
		"sentry_turret":
			var turret = get_node_or_null("TurretHead")
			if turret and _target_node:
				var target_pos = _target_node.global_position + Vector3(0, 0.9, 0)
				turret.look_at(target_pos, Vector3.UP)
				turret.rotate_y(PI) # correct face direction
				
				_shoot_cooldown -= delta
				if _shoot_cooldown <= 0.0:
					_shoot_cooldown = 1.5
					_fire_turret_laser(turret.global_position, target_pos)
					
		"homing_mine":
			var body = get_node_or_null("MineBody")
			if body and _target_node:
				var dist = global_position.distance_to(_target_node.global_position)
				if dist < 12.0:
					# Seek player
					var dir = ( _target_node.global_position + Vector3(0, 0.8, 0) - global_position ).normalized()
					global_position += dir * delta * 4.5
					if dist < 1.1:
						_explode_mine()
			
		"fire_spewer":
			var cycle = fmod(_timer, 4.0)
			var active = cycle < 2.0
			if active != _active:
				_active = active
				_toggle_fire_spewer(_active)
			if _active:
				_damage_overlapping_in_radius(1.5, 45.0 * delta)
				
		"moving_laser":
			var cycle = sin(_timer * 2.0)
			global_position = _original_pos + transform.basis.x * cycle * 4.0
			_damage_overlapping_in_radius(1.8, 35.0 * delta)
			
		"periodic_spikes":
			var cycle = fmod(_timer, 3.0)
			if cycle < 1.0: # Spikes rising
				_part_left.position.y = lerpf(0.0, 0.5, cycle / 1.0)
				_damage_overlapping_in_radius(1.5, 50.0 * delta)
			elif cycle < 2.0: # Spikes extended
				_part_left.position.y = 0.5
				_damage_overlapping_in_radius(1.5, 50.0 * delta)
			else: # Retracting
				_part_left.position.y = lerpf(0.5, 0.0, (cycle - 2.0) / 1.0)
				
		"boulder_spawner":
			_shoot_cooldown -= delta
			if _shoot_cooldown <= 0.0:
				_shoot_cooldown = 4.0
				_spawn_boulder()
				
		"tesla_coil":
			var cycle = fmod(_timer, 5.0)
			var dome = get_node_or_null("TeslaDome")
			if dome:
				if cycle > 3.8: # Charging up
					var energy = (cycle - 3.8) * 8.0
					(dome.material_override as StandardMaterial3D).emission_energy_multiplier = energy
					if cycle >= 4.9: # Trigger Shock
						_trigger_tesla_shock()
				else:
					(dome.material_override as StandardMaterial3D).emission_energy_multiplier = 1.0
					
		"seeker_rocket":
			_shoot_cooldown -= delta
			if _shoot_cooldown <= 0.0:
				_shoot_cooldown = 3.5
				_fire_homing_rocket()
				
		"falling_spiked_ball":
			if _target_node:
				var flat_dist = Vector2(global_position.x - _target_node.global_position.x, global_position.z - _target_node.global_position.z).length()
				if flat_dist < 1.5 and global_position.y > _target_node.global_position.y:
					_active = true
			if _active:
				_part_left.position.y = move_toward(_part_left.position.y, -4.5, delta * 15.0)
				_damage_overlapping_in_radius(1.8, 60.0 * delta)
				if _part_left.position.y == -4.5 or _timer > 2.0:
					_active = false
					_timer = 0.0
			else:
				_part_left.position.y = move_toward(_part_left.position.y, -0.5, delta * 2.5)
				
		"chomping_maw":
			var cycle = fmod(_timer, 3.0)
			if cycle < 0.6: # Closing fast
				_part_left.position.x = lerpf(-1.0, -0.2, cycle / 0.6)
				_part_right.position.x = lerpf(1.0, 0.2, cycle / 0.6)
				_damage_overlapping_in_radius(1.8, 100.0 * delta)
			elif cycle < 1.6: # Keeping closed
				_part_left.position.x = -0.2
				_part_right.position.x = 0.2
				_damage_overlapping_in_radius(1.8, 100.0 * delta)
			else: # Opening slowly
				_part_left.position.x = lerpf(-0.2, -1.0, (cycle - 1.6) / 1.4)
				_part_right.position.x = lerpf(0.2, 1.0, (cycle - 1.6) / 1.4)

func _get_closest_player() -> Node3D:
	var players = get_tree().get_nodes_in_group("fps_players")
	var closest: Node3D = null
	var min_dist: float = 999999.0
	for p in players:
		if p is Node3D and not p.get("is_eliminated"):
			var dist = global_position.distance_to(p.global_position)
			if dist < min_dist:
				min_dist = dist
				closest = p
	return closest

func _damage_overlapping_in_radius(radius: float, damage: float) -> void:
	if not multiplayer.is_server():
		return
	var players = get_tree().get_nodes_in_group("fps_players")
	for p in players:
		if p is Node3D and not p.get("is_eliminated"):
			if global_position.distance_to(p.global_position) < radius:
				if p.has_method("server_apply_damage"):
					p.call("server_apply_damage", damage, -1)

func _fire_turret_laser(from_pos: Vector3, to_pos: Vector3) -> void:
	_play_trap_sound("lazers-anything-kill-player-anythingelse..")
	# Spawn a temporary laser visual cylinder
	var beam := MeshInstance3D.new()
	var mesh := CylinderMesh.new()
	mesh.top_radius = 0.05
	mesh.bottom_radius = 0.05
	mesh.height = from_pos.distance_to(to_pos)
	beam.mesh = mesh
	beam.material_override = TrapHelper.make_material(Color(1, 0, 0), 4.0, 0, 0)
	get_parent().add_child(beam)
	beam.global_position = (from_pos + to_pos) * 0.5
	beam.look_at(to_pos, Vector3.UP)
	beam.rotate_x(PI * 0.5)
	
	# Apply damage if it hits
	if multiplayer.is_server() and _target_node:
		var space_state = get_world_3d().direct_space_state
		var query = PhysicsRayQueryParameters3D.create(from_pos, to_pos)
		var result = space_state.intersect_ray(query)
		if result and result.collider == _target_node:
			if _target_node.has_method("server_apply_damage"):
				_target_node.call("server_apply_damage", 25.0, -1)
				
	await get_tree().create_timer(0.15).timeout
	beam.queue_free()

func _explode_mine() -> void:
	_play_trap_sound("trap-crush-player")
	_damage_overlapping_in_radius(4.0, 80.0)
	# Spawn explosion indicator visual
	var exp_mesh := MeshInstance3D.new()
	var smesh := SphereMesh.new()
	smesh.radius = 3.0
	smesh.height = 6.0
	exp_mesh.mesh = smesh
	exp_mesh.material_override = TrapHelper.make_material(Color(1.0, 0.45, 0.1, 0.4), 3.0, 0, 0.1)
	get_parent().add_child(exp_mesh)
	exp_mesh.global_position = global_position
	
	await get_tree().create_timer(0.2).timeout
	exp_mesh.queue_free()
	queue_free()

func _toggle_fire_spewer(on: bool) -> void:
	if on: _play_trap_sound("some-metalgear-traps-activated-sound")
	var nozzle = get_node_or_null("AutoVisualNozzle")
	if nozzle:
		(nozzle.material_override as StandardMaterial3D).emission_energy_multiplier = 4.0 if on else 0.2
		(nozzle.material_override as StandardMaterial3D).albedo_color = Color(1, 0.5, 0) if on else Color(0.2, 0.2, 0.22)

func _spawn_boulder() -> void:
	if not multiplayer.is_server():
		return
	var boulder := RigidBody3D.new()
	boulder.mass = 120.0
	boulder.global_position = global_position + Vector3(0, 1.2, 0)
	var mesh = TrapHelper.add_box_mesh(boulder, Vector3(1.2, 1.2, 1.2), Vector3.ZERO, TrapHelper.make_material(Color(0.4, 0.4, 0.4), 0.0, 0.8, 0.1))
	TrapHelper.add_box_collision(boulder, Vector3(1.2, 1.2, 1.2))
	get_parent().add_child(boulder)
	
	# Connect contact damage area to boulder
	var area := Area3D.new()
	var shape := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = Vector3(1.4, 1.4, 1.4)
	shape.shape = box
	area.add_child(shape)
	boulder.add_child(area)
	area.body_entered.connect(func(body):
		if body != boulder and body.has_method("server_apply_damage"):
			body.call("server_apply_damage", 60.0, -1)
	)
	
	await get_tree().create_timer(5.0).timeout
	boulder.queue_free()

func _trigger_tesla_shock() -> void:
	_play_trap_sound("lazers-anything-kill-player-anythingelse..")
	_damage_overlapping_in_radius(5.0, 50.0)
	var shock := MeshInstance3D.new()
	var mesh := CylinderMesh.new()
	mesh.top_radius = 5.0
	mesh.bottom_radius = 5.0
	mesh.height = 0.2
	shock.mesh = mesh
	shock.material_override = TrapHelper.make_material(Color(0, 0.7, 1.0, 0.3), 3.0, 0, 0.1)
	get_parent().add_child(shock)
	shock.global_position = global_position + Vector3(0, 1.7, 0)
	
	await get_tree().create_timer(0.25).timeout
	shock.queue_free()

func _fire_homing_rocket() -> void:
	_play_trap_sound("some-metalgear-traps-activated-sound")
	if not multiplayer.is_server() or not _target_node:
		return
	var rocket := Area3D.new()
	rocket.global_position = global_position + Vector3(0, 0.8, 0)
	var mesh = TrapHelper.add_box_mesh(rocket, Vector3(0.25, 0.25, 0.6), Vector3.ZERO, TrapHelper.make_material(Color(1, 0.6, 0.1), 3.0, 0, 0.1))
	var col = CollisionShape3D.new()
	var box = BoxShape3D.new()
	box.size = Vector3(0.3, 0.3, 0.6)
	col.shape = box
	rocket.add_child(col)
	get_parent().add_child(rocket)
	
	var r_target = _target_node
	var life = 4.0
	var rocket_speed = 8.0
	var timer = Timer.new()
	timer.wait_time = 0.05
	timer.autostart = true
	rocket.add_child(timer)
	
	timer.timeout.connect(func():
		life -= 0.05
		if life <= 0.0 or not is_instance_valid(rocket):
			rocket.queue_free()
			return
		if is_instance_valid(r_target):
			var dir = (r_target.global_position + Vector3(0, 0.9, 0) - rocket.global_position).normalized()
			rocket.global_position += dir * rocket_speed * 0.05
			rocket.look_at(r_target.global_position, Vector3.UP)
	)
	
	rocket.body_entered.connect(func(body):
		if body.has_method("server_apply_damage"):
			body.call("server_apply_damage", 45.0, -1)
			# Explode
			rocket.queue_free()
	)



func _play_trap_sound(sound_name: String) -> void:
	var player = get_tree().get_first_node_in_group("local_player")
	if player and is_instance_valid(player):
		var dist := global_position.distance_to(player.global_position)
		if dist < 24.0:
			var vol := lerpf(-3.0, -28.0, dist / 24.0)
			if game_manager: game_manager.call("play_effect", sound_name, vol)


