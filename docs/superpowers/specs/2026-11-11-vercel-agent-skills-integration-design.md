# Vercel Agent Skills Integration Design

## Intent & The Why
Integrate the official [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) repository into the Duel Masters workspace and global agent discovery environments. This provides coding agents with engineering runbooks from Vercel covering React performance optimization, web interface guidelines, view transitions, component composition, and deployment standards.

## Scope of Skills
The complete suite of 9 skills from `vercel-labs/agent-skills`:
1. `react-best-practices` (`vercel-react-best-practices`): 70 rules for eliminating waterfalls, optimizing bundle sizes, and reducing re-renders.
2. `web-design-guidelines`: 100+ interface rules covering accessibility, keyboard focus, animations, typography, dark mode, and UX.
3. `composition-patterns`: Advanced React component composition patterns.
4. `react-view-transitions`: View Transitions API integration for React.
5. `writing-guidelines`: Documentation voice, style, and structure rules.
6. `deploy-to-vercel`: Automated Vercel deployment workflows.
7. `vercel-optimize`: Auditing cost, performance, function execution, and caching.
8. `vercel-cli-with-tokens`: CLI token management.
9. `react-native-skills`: React Native architecture and performance rules.

## Installation Targets
- **Workspace**:
  - `d:\Duel_Masters\.agents\skills\<skill-name>\`
- **Global**:
  - `~/.gemini/config/skills/<skill-name>\`
  - `~/.agents/skills/<skill-name>\`
  - `~/.claude/skills/<skill-name>\`

## Disk Space Footprint
- Workspace (D: drive): ~1.2 MB
- Global Cache (C: drive): ~2.5 MB to 3.5 MB
- Temporary clone scratch purged after copy.
