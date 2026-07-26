# 3D Horror Game for Browser

A simple 3D horror game built with Three.js that runs in the browser.

## Game Features

- **First-person perspective** with WASD movement and mouse look
- **Horror atmosphere** with dim lighting and eerie sounds
- **Ghost enemy** that appears randomly and chases you
- **Collectible items** to restore health
- **Flashlight** to help you see in the dark
- **Health and sanity system** - keep both above zero to survive!
- **Jump scares** when the ghost attacks

## How to Play

### Controls:
- **WASD**: Move around
- **Mouse**: Look around
- **F**: Toggle flashlight
- **Click**: Start game / lock mouse pointer
- **R**: Restart after game over

### Objective:
- Find and collect all 5 yellow items
- Find the blue flashlight item
- Avoid the ghost that appears randomly
- Survive until you collect all items!

## Installation

1. Navigate to the game directory:
   ```bash
   cd workspace/3d-horror-game
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

## Running the Game

### Option 1: Using Live Server (recommended)
```bash
npm start
```
This will start a local development server and open the game in your default browser.

### Option 2: Using Vite
```bash
npm run dev
```

### Option 3: Open HTML directly
You can also simply open the `index.html` file in your browser, but some features might not work due to CORS restrictions.

## Game Mechanics

- **Health**: Decreases when the ghost attacks you. Restored by collecting items.
- **Sanity**: Slowly decreases over time. Decreases faster when seeing the ghost.
- **Ghost**: Appears randomly and moves toward you. Avoid it or use your flashlight to see it coming.
- **Flashlight**: Helps you see in the dark but also makes you more visible to the ghost.

## Technical Details

- **Engine**: Three.js (r132)
- **Controls**: PointerLockControls for first-person movement
- **Audio**: Three.js Audio system with positional sound
- **Physics**: Simple collision detection
- **Graphics**: WebGL with shadows and fog effects

## Future Improvements

- Add more enemy types
- Implement a proper level system
- Add more sound effects and music
- Improve ghost AI and pathfinding
- Add more interactive objects
- Implement a proper inventory system
- Add save/load functionality

## License

MIT License - feel free to modify and distribute!

## Credits

- Three.js library and examples
- Mixkit for sound effects
- Various open-source assets

Enjoy the game and try not to get too scared! 👻🎮