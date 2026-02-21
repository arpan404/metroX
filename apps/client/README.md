# AutoRedTeam Client

Vite React frontend for AutoRedTeam V1.11.

## UI Architecture
- First-run onboarding page (animated checklist).
- Post-onboarding config workbench (single-page progressive form).
- Sticky run launcher panel.
- Providers console for credentials + security key lifecycle + validation probes.

## Design System
- shadcn CLI generated primitives only under `src/components/ui/*`.
- Neutral system theme via `next-themes`.
- React Flow used for orchestration canvas.

## Run
```bash
npm install
npm run dev
```

## Test + Build
```bash
npm test -- --run
npm run build
```
