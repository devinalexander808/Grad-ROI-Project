# Grad ROI

Estimate whether a graduate degree is likely to pay off by comparing program cost, opportunity cost, and expected salary lift.

## Stack

- [Next.js](https://nextjs.org) (App Router)
- React 19
- TypeScript
- Tailwind CSS v4

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project layout

```text
src/
  app/                 # App Router pages and global styles
  components/          # UI (landing hero, ROI calculator)
  lib/roi.ts           # ROI calculation helpers
```

## ROI model

The starter calculator uses a transparent, editable model:

- **Total investment** = program cost + (current salary × years in school)
- **Annual lift** = expected salary − current salary
- **Net gain** = annual lift × career horizon − total investment
- **Payback** = total investment ÷ annual lift (when lift is positive)

## Scripts

```bash
npm run dev      # local development
npm run build    # production build
npm run start    # run production server
npm run lint     # ESLint
```
