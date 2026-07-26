// 3D Horror Game using Three.js
let scene, camera, renderer, player, controls;
let clock = new THREE.Clock();
let mixers = [];
let ghost;
let ambientSound, jumpScareSound;
let health = 100;
let sanity = 100;
let hasFlashlight = false;
let gameOver = false;
let collectedItems = 0;
let ghostSpeed = 0.01;
let ghostVisibility = 0;
let ghostVisible = false;
let ghostTimer = 0;
let ghostAppearanceInterval = 10; // seconds

// Initialize the game
function init() {
    // Create scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111111);
    scene.fog = new THREE.Fog(0x111111, 1, 20);

    // Create camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.y = 1.6; // Player height

    // Create renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);

    // Add event listeners
    window.addEventListener('resize', onWindowResize);
    document.addEventListener('keydown', onKeyDown);

    // Create lights
    createLights();

    // Create environment
    createEnvironment();

    // Create player
    createPlayer();

    // Create ghost enemy
    createGhost();

    // Create collectible items
    createCollectibles();

    // Load sounds
    loadSounds();

    // Create UI
    createUI();

    // Start game loop
    animate();
}

// Create lights
function createLights() {
    // Ambient light (dim)
    const ambientLight = new THREE.AmbientLight(0x404040, 0.2);
    scene.add(ambientLight);

    // Directional light (moonlight)
    const directionalLight = new THREE.DirectionalLight(0x336699, 0.5);
    directionalLight.position.set(1, 1, 1);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    scene.add(directionalLight);

    // Flashlight (initially off)
    const flashlight = new THREE.SpotLight(0xffffff, 0, 20, Math.PI/6, 0.5);
    flashlight.position.set(0, 1.6, 0);
    flashlight.target.position.set(0, 0, -1);
    flashlight.castShadow = true;
    camera.add(flashlight);
    camera.add(flashlight.target);
    
    // Store flashlight reference
    window.flashlight = flashlight;
}

// Create environment
function createEnvironment() {
    // Create ground
    const groundGeometry = new THREE.PlaneGeometry(50, 50);
    const groundMaterial = new THREE.MeshStandardMaterial({
        color: 0x333333,
        roughness: 0.8,
        metalness: 0.2
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Create walls
    const wallGeometry = new THREE.BoxGeometry(50, 10, 0.5);
    const wallMaterial = new THREE.MeshStandardMaterial({
        color: 0x222222,
        roughness: 0.7
    });

    // North wall
    const northWall = new THREE.Mesh(wallGeometry, wallMaterial);
    northWall.position.set(0, 5, -25);
    northWall.receiveShadow = true;
    scene.add(northWall);

    // South wall
    const southWall = new THREE.Mesh(wallGeometry, wallMaterial);
    southWall.position.set(0, 5, 25);
    southWall.receiveShadow = true;
    scene.add(southWall);

    // West wall
    const westWall = new THREE.Mesh(wallGeometry, wallMaterial);
    westWall.rotation.y = Math.PI / 2;
    westWall.position.set(-25, 5, 0);
    westWall.receiveShadow = true;
    scene.add(westWall);

    // East wall
    const eastWall = new THREE.Mesh(wallGeometry, wallMaterial);
    eastWall.rotation.y = Math.PI / 2;
    eastWall.position.set(25, 5, 0);
    eastWall.receiveShadow = true;
    scene.add(eastWall);

    // Add some obstacles
    createObstacles();
}

// Create obstacles
function createObstacles() {
    const obstacleGeometry = new THREE.BoxGeometry(2, 2, 2);
    const obstacleMaterial = new THREE.MeshStandardMaterial({
        color: 0x555555,
        roughness: 0.6
    });

    // Create random obstacles
    for (let i = 0; i < 15; i++) {
        const obstacle = new THREE.Mesh(obstacleGeometry, obstacleMaterial);
        obstacle.position.set(
            (Math.random() - 0.5) * 40,
            1,
            (Math.random() - 0.5) * 40
        );
        obstacle.castShadow = true;
        obstacle.receiveShadow = true;
        scene.add(obstacle);
    }
}

// Create player
function createPlayer() {
    // Player geometry - using a combination of cylinder and spheres to create capsule shape
    const playerGroup = new THREE.Group();
    
    // Create cylinder (main body)
    const cylinderGeometry = new THREE.CylinderGeometry(0.3, 0.3, 0.8, 16);
    const cylinderMaterial = new THREE.MeshStandardMaterial({
        color: 0x00ff00,
        transparent: true,
        opacity: 0.7
    });
    const cylinder = new THREE.Mesh(cylinderGeometry, cylinderMaterial);
    cylinder.position.y = 0.4; // Position cylinder in the middle
    playerGroup.add(cylinder);
    
    // Create top hemisphere
    const topSphereGeometry = new THREE.SphereGeometry(0.3, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const topSphere = new THREE.Mesh(topSphereGeometry, cylinderMaterial);
    topSphere.position.y = 0.8; // Position at top
    playerGroup.add(topSphere);
    
    // Create bottom hemisphere
    const bottomSphereGeometry = new THREE.SphereGeometry(0.3, 16, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI);
    const bottomSphere = new THREE.Mesh(bottomSphereGeometry, cylinderMaterial);
    bottomSphere.position.y = 0; // Position at bottom
    playerGroup.add(bottomSphere);
    
    player = playerGroup;
    player.position.set(0, 0.8, 0);
    player.castShadow = true;
    scene.add(player);

    // First-person controls
    controls = new THREE.PointerLockControls(camera, document.body);
    
    // Add event listener for pointer lock
    document.addEventListener('click', function() {
        controls.lock();
    });

    // Position camera at player height
    camera.position.copy(player.position);
    camera.position.y = 1.6;
}

// Create ghost enemy
function createGhost() {
    // Ghost geometry
    const ghostGeometry = new THREE.SphereGeometry(0.8, 32, 32);
    const ghostMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.6,
        emissive: 0x3333ff,
        emissiveIntensity: 0.3
    });
    
    ghost = new THREE.Mesh(ghostGeometry, ghostMaterial);
    ghost.position.set(10, 1, 10);
    ghost.castShadow = true;
    ghost.visible = false; // Start invisible
    scene.add(ghost);

    // Add ghost appearance animation
    ghostAppearanceInterval = 5 + Math.random() * 10;
}

// Create collectible items
function createCollectibles() {
    const itemGeometry = new THREE.CylinderGeometry(0.2, 0.5, 0.3, 16);
    const itemMaterial = new THREE.MeshStandardMaterial({
        color: 0xffff00,
        emissive: 0xffff00,
        emissiveIntensity: 0.5
    });

    // Create multiple collectibles
    for (let i = 0; i < 5; i++) {
        const item = new THREE.Mesh(itemGeometry, itemMaterial);
        item.position.set(
            (Math.random() - 0.5) * 30,
            0.5,
            (Math.random() - 0.5) * 30
        );
        item.userData = { type: 'collectible', collected: false };
        item.castShadow = true;
        scene.add(item);
    }

    // Create flashlight item
    const flashlightItem = new THREE.Mesh(itemGeometry, itemMaterial.clone());
    flashlightItem.material.color.set(0x00ffff);
    flashlightItem.material.emissive.set(0x00ffff);
    flashlightItem.position.set(15, 0.5, -15);
    flashlightItem.userData = { type: 'flashlight', collected: false };
    flashlightItem.castShadow = true;
    scene.add(flashlightItem);
}

// Load sounds
function loadSounds() {
    // Create audio listener
    const listener = new THREE.AudioListener();
    camera.add(listener);

    // Ambient sound
    ambientSound = new THREE.Audio(listener);
    const ambientAudioLoader = new THREE.AudioLoader();
    ambientAudioLoader.load('https://assets.mixkit.co/sfx/preview/mixkit-haunted-house-ambience-948.mp3', function(buffer) {
        ambientSound.setBuffer(buffer);
        ambientSound.setLoop(true);
        ambientSound.setVolume(0.3);
        ambientSound.play();
    });

    // Jump scare sound
    jumpScareSound = new THREE.Audio(listener);
    const jumpScareAudioLoader = new THREE.AudioLoader();
    jumpScareAudioLoader.load('https://assets.mixkit.co/sfx/preview/mixkit-female-scream-2580.mp3', function(buffer) {
        jumpScareSound.setBuffer(buffer);
        jumpScareSound.setVolume(0.8);
    });
}

// Create UI
function createUI() {
    // Health bar
    const healthBar = document.createElement('div');
    healthBar.style.position = 'absolute';
    healthBar.style.top = '20px';
    healthBar.style.left = '20px';
    healthBar.style.width = '200px';
    healthBar.style.height = '20px';
    healthBar.style.backgroundColor = '#333';
    healthBar.style.border = '2px solid #666';
    healthBar.style.borderRadius = '10px';
    document.body.appendChild(healthBar);
    
    const healthFill = document.createElement('div');
    healthFill.style.width = '100%';
    healthFill.style.height = '100%';
    healthFill.style.backgroundColor = '#f00';
    healthFill.style.borderRadius = '8px';
    healthFill.style.transition = 'width 0.3s';
    healthFill.id = 'health-fill';
    healthBar.appendChild(healthFill);

    // Sanity bar
    const sanityBar = document.createElement('div');
    sanityBar.style.position = 'absolute';
    sanityBar.style.top = '50px';
    sanityBar.style.left = '20px';
    sanityBar.style.width = '200px';
    sanityBar.style.height = '20px';
    sanityBar.style.backgroundColor = '#333';
    sanityBar.style.border = '2px solid #666';
    sanityBar.style.borderRadius = '10px';
    document.body.appendChild(sanityBar);
    
    const sanityFill = document.createElement('div');
    sanityFill.style.width = '100%';
    sanityFill.style.height = '100%';
    sanityFill.style.backgroundColor = '#00f';
    sanityFill.style.borderRadius = '8px';
    sanityFill.style.transition = 'width 0.3s';
    sanityFill.id = 'sanity-fill';
    sanityBar.appendChild(sanityFill);

    // Flashlight indicator
    const flashlightIndicator = document.createElement('div');
    flashlightIndicator.style.position = 'absolute';
    flashlightIndicator.style.bottom = '20px';
    flashlightIndicator.style.right = '20px';
    flashlightIndicator.style.width = '50px';
    flashlightIndicator.style.height = '50px';
    flashlightIndicator.style.backgroundColor = '#333';
    flashlightIndicator.style.borderRadius = '50%';
    flashlightIndicator.style.display = 'flex';
    flashlightIndicator.style.alignItems = 'center';
    flashlightIndicator.style.justifyContent = 'center';
    flashlightIndicator.style.fontFamily = 'Arial';
    flashlightIndicator.style.color = '#ccc';
    flashlightIndicator.style.fontSize = '12px';
    flashlightIndicator.id = 'flashlight-indicator';
    flashlightIndicator.textContent = 'OFF';
    document.body.appendChild(flashlightIndicator);

    // Instructions
    const instructions = document.createElement('div');
    instructions.style.position = 'absolute';
    instructions.style.top = '20px';
    instructions.style.right = '20px';
    instructions.style.color = 'white';
    instructions.style.fontFamily = 'Arial';
    instructions.style.backgroundColor = 'rgba(0,0,0,0.5)';
    instructions.style.padding = '10px';
    instructions.style.borderRadius = '5px';
    instructions.style.maxWidth = '300px';
    instructions.innerHTML = '<strong>3D Horror Game</strong><br>' +
        'WASD: Move<br>' +
        'Mouse: Look<br>' +
        'F: Toggle Flashlight<br>' +
        'Click to start<br>' +
        'Find items and avoid the ghost!';
    document.body.appendChild(instructions);

    // Game over screen
    const gameOverScreen = document.createElement('div');
    gameOverScreen.style.position = 'absolute';
    gameOverScreen.style.top = '0';
    gameOverScreen.style.left = '0';
    gameOverScreen.style.width = '100%';
    gameOverScreen.style.height = '100%';
    gameOverScreen.style.backgroundColor = 'rgba(0,0,0,0.8)';
    gameOverScreen.style.display = 'flex';
    gameOverScreen.style.flexDirection = 'column';
    gameOverScreen.style.alignItems = 'center';
    gameOverScreen.style.justifyContent = 'center';
    gameOverScreen.style.color = 'red';
    gameOverScreen.style.fontFamily = 'Arial';
    gameOverScreen.style.fontSize = '48px';
    gameOverScreen.style.textAlign = 'center';
    gameOverScreen.style.display = 'none';
    gameOverScreen.id = 'game-over-screen';
    gameOverScreen.innerHTML = '<h1>GAME OVER</h1>' +
        '<p style="font-size: 24px; margin-top: 20px;">The ghost got you!</p>' +
        '<button style="margin-top: 30px; padding: 15px 30px; font-size: 18px; cursor: pointer;" onclick="location.reload()">Play Again</button>';
    document.body.appendChild(gameOverScreen);

    // Win screen
    const winScreen = document.createElement('div');
    winScreen.style.position = 'absolute';
    winScreen.style.top = '0';
    winScreen.style.left = '0';
    winScreen.style.width = '100%';
    winScreen.style.height = '100%';
    winScreen.style.backgroundColor = 'rgba(0,0,0,0.8)';
    winScreen.style.display = 'flex';
    winScreen.style.flexDirection = 'column';
    winScreen.style.alignItems = 'center';
    winScreen.style.justifyContent = 'center';
    winScreen.style.color = 'gold';
    winScreen.style.fontFamily = 'Arial';
    winScreen.style.fontSize = '48px';
    winScreen.style.textAlign = 'center';
    winScreen.style.display = 'none';
    winScreen.id = 'win-screen';
    winScreen.innerHTML = '<h1>YOU ESCAPED!</h1>' +
        '<p style="font-size: 24px; margin-top: 20px;">You collected all items and survived!</p>' +
        '<button style="margin-top: 30px; padding: 15px 30px; font-size: 18px; cursor: pointer;" onclick="location.reload()">Play Again</button>';
    document.body.appendChild(winScreen);
}

// Handle window resize
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Handle key presses
function onKeyDown(event) {
    if (gameOver) return;
    
    switch (event.code) {
        case 'KeyF':
            toggleFlashlight();
            break;
        case 'KeyR':
            if (gameOver) location.reload();
            break;
    }
}

// Toggle flashlight
function toggleFlashlight() {
    if (!hasFlashlight) return;
    
    const flashlight = window.flashlight;
    const indicator = document.getElementById('flashlight-indicator');
    
    if (flashlight.intensity > 0) {
        flashlight.intensity = 0;
        indicator.textContent = 'OFF';
        indicator.style.backgroundColor = '#333';
    } else {
        flashlight.intensity = 1.5;
        indicator.textContent = 'ON';
        indicator.style.backgroundColor = '#ff0';
    }
}

// Update game state
function update() {
    if (gameOver) return;
    
    const delta = clock.getDelta();
    
    // Update player position from controls
    if (controls.isLocked) {
        const direction = new THREE.Vector3();
        controls.getDirection(direction);
        
        const speed = 5;
        const moveX = direction.x * speed * delta;
        const moveZ = direction.z * speed * delta;
        
        // Update player position
        player.position.x += moveX;
        player.position.z += moveZ;
        
        // Update camera position
        camera.position.x = player.position.x;
        camera.position.z = player.position.z;
        
        // Keep player within bounds
        player.position.x = Math.max(-24, Math.min(24, player.position.x));
        player.position.z = Math.max(-24, Math.min(24, player.position.z));
    }
    
    // Update ghost behavior
    updateGhost(delta);
    
    // Check for collisions with collectibles
    checkCollectibles();
    
    // Check for collision with ghost
    checkGhostCollision();
    
    // Check win condition
    checkWinCondition();
    
    // Decrease sanity over time
    sanity = Math.max(0, sanity - 0.1 * delta);
    updateUI();
    
    // Game over if health or sanity reaches 0
    if (health <= 0 || sanity <= 0) {
        gameOver = true;
        document.getElementById('game-over-screen').style.display = 'flex';
        if (jumpScareSound && !jumpScareSound.isPlaying) {
            jumpScareSound.play();
        }
    }
}

// Update ghost behavior
function updateGhost(delta) {
    if (!ghost) return;
    
    ghostTimer += delta;
    
    // Random ghost appearances
    if (ghostTimer > ghostAppearanceInterval) {
        ghostTimer = 0;
        ghostAppearanceInterval = 5 + Math.random() * 15;
        
        if (!ghostVisible) {
            // Make ghost visible at random position
            ghost.position.set(
                (Math.random() - 0.5) * 40,
                1,
                (Math.random() - 0.5) * 40
            );
            ghost.visible = true;
            ghostVisible = true;
            ghostVisibility = 1.0;
        }
    }
    
    if (ghostVisible) {
        // Move ghost towards player
        const direction = new THREE.Vector3();
        direction.subVectors(player.position, ghost.position).normalize();
        ghost.position.add(direction.multiplyScalar(ghostSpeed * delta));
        
        // Fade ghost in and out
        ghostVisibility = Math.max(0, ghostVisibility - 0.1 * delta);
        ghost.material.opacity = 0.3 + 0.7 * ghostVisibility;
        
        if (ghostVisibility <= 0) {
            ghost.visible = false;
            ghostVisible = false;
        }
    }
}

// Check for collisions with collectibles
function checkCollectibles() {
    const collectibles = [];
    
    // Find all collectible objects
    scene.traverse(function(child) {
        if (child.userData && child.userData.type && !child.userData.collected) {
            collectibles.push(child);
        }
    });
    
    // Check distance to each collectible
    collectibles.forEach(item => {
        const distance = player.position.distanceTo(item.position);
        
        if (distance < 1.5) {
            // Collect item
            item.userData.collected = true;
            scene.remove(item);
            
            if (item.userData.type === 'flashlight') {
                hasFlashlight = true;
                const indicator = document.getElementById('flashlight-indicator');
                indicator.textContent = 'ON';
                indicator.style.backgroundColor = '#ff0';
                window.flashlight.intensity = 1.5;
            } else {
                collectedItems++;
                // Increase health when collecting items
                health = Math.min(100, health + 10);
            }
        }
    });
}

// Check for collision with ghost
function checkGhostCollision() {
    if (!ghostVisible || !ghost) return;
    
    const distance = player.position.distanceTo(ghost.position);
    
    if (distance < 2) {
        // Ghost attack!
        health = Math.max(0, health - 20);
        sanity = Math.max(0, sanity - 30);
        
        // Make ghost disappear
        ghost.visible = false;
        ghostVisible = false;
        
        // Play jump scare sound
        if (jumpScareSound && !jumpScareSound.isPlaying) {
            jumpScareSound.play();
        }
    }
}

// Check win condition
function checkWinCondition() {
    if (collectedItems >= 5 && hasFlashlight) {
        gameOver = true;
        document.getElementById('win-screen').style.display = 'flex';
    }
}

// Update UI
function updateUI() {
    document.getElementById('health-fill').style.width = health + '%';
    document.getElementById('sanity-fill').style.width = sanity + '%';
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    
    // Update animations
    if (mixers.length > 0) {
        const delta = clock.getDelta();
        mixers.forEach(mixer => mixer.update(delta));
    }
    
    update();
    renderer.render(scene, camera);
}

// Start the game when the page loads
window.onload = init;