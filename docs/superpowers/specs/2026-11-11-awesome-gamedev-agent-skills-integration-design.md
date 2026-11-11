# Awesome GameDev Agent Skills Integration Design

## Intent & The Why
Integrate [gamedev-skills/awesome-gamedev-agent-skills](https://github.com/gamedev-skills/awesome-gamedev-agent-skills) into the Duel Masters project workspace and global agent discovery caches. This provides the agent with 78 standardized game development skills, including a master router, game disciplines (UI/UX, game feel, audio, shaders, input, save systems), genres (particularly the `card-game` architecture skill), web engines (Three.js, PixiJS, Phaser), and multi-engine game engineering standards.

## Scope of Skills
The full collection of 78 skills:
1. **Master Router**:
   - `router` (`gamedev-router`): Detects engine and task, dynamically dispatching to the minimal set of specialized game dev skills.
2. **Disciplines (15 skills)**:
   - `ai-behavior-trees-utility-ai`, `audio-design`, `camera-systems`, `create-game-assets`, `dialogue-systems`, `game-ai`, `game-feel`, `game-ui-ux`, `input-systems`, `level-design`, `performance-optimization`, `physics-tuning`, `procedural-gen`, `save-systems`, `shader-programming`.
3. **Genres (10 skills)**:
   - `card-game` (core TCG/CCG zone models, turn structure, draw/shuffle, effect resolution), `fps-shooter`, `platformer`, `puzzle`, `roguelike`, `rpg`, `survival-crafting`, `tower-defense`, `visual-novel`.
4. **Web Engines (6 skills)**:
   - `phaser-arcade-physics`, `phaser-core`, `pixijs-rendering`, `threejs-gltf-loading`, `threejs-materials-lighting`, `threejs-scene-setup`.
5. **Workflows (4 skills)**:
   - `game-jam`, `itch-publish`, `prototype-fast`, `steam-publish`.
6. **Engine Suites (42 skills)**:
   - Godot (15), Unity (9), Unreal (7), Other engines (Ebitengine, Bevy, Defold, LÖVE, Pygame, Roblox - 12).

## Installation Targets
- **Workspace**:
  - `d:\Duel_Masters\.agents\skills\<skill-name>\`
- **Global**:
  - `~/.gemini/config/skills/<skill-name>\`
  - `~/.agents/skills/<skill-name>\`
  - `~/.claude/skills/<skill-name>\`

## Footprint
- Pure markdown text (`SKILL.md` + reference files).
- Workspace: ~1.6 MB
- Global: ~3.2 MB
- Scratch directory purged upon installation.
