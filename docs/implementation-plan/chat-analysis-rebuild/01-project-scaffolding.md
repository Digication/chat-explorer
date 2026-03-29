# Phase 01 — Project Scaffolding & Configuration

You are setting up the project foundation for the **Chat Analysis** app — a general-purpose academic reflection analysis platform built with TypeScript, React, Vite, TypeGraphQL, and PostgreSQL.

**Context:** This is the first phase. No prior code exists. You are creating the project from scratch in the current working directory. This app supports multiple institutions, multi-course data, student consent management, multiple LLM providers, and a Digication-inspired UI.

## Overview

- Initialize pnpm project with TypeScript strict mode
- Configure Vite for fullstack development (React frontend + API proxy)
- Set up TypeScript configs for both client and server
- Create directory structure for all modules
- Add all dependencies
- Create `.gitignore` and `.env.example`
- Add package.json scripts

## Steps

### 1. Initialize project

**Files to create:** `package.json`

```json
{
  "name": "chat-analysis",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@10.12.1",
  "scripts": {
    "dev": "tsx watch src/server/index.ts",
    "dev:client": "vite",
    "build": "vite build && tsc -p tsconfig.node.json --noEmit",
    "start": "node dist/server/index.js",
    "typecheck": "tsc --noEmit && tsc -p tsconfig.node.json --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "codegen": "graphql-codegen",
    "migration:generate": "typeorm migration:generate -d src/server/data-source.ts",
    "migration:run": "typeorm migration:run -d src/server/data-source.ts"
  }
}
```

### 2. Install dependencies

Run these commands to add all needed packages:

```bash
# Core
pnpm add react react-dom @apollo/client graphql

# UI
pnpm add @mui/material @mui/icons-material @emotion/react @emotion/styled

# Server
pnpm add graphql-yoga type-graphql typeorm reflect-metadata pg class-validator
pnpm add better-auth
pnpm add csv-parse          # CSV parsing (replaces xlsx)
pnpm add openai             # OpenAI LLM provider
pnpm add @anthropic-ai/sdk  # Anthropic LLM provider
pnpm add @google/generative-ai  # Google LLM provider
pnpm add json2csv           # CSV export
pnpm add express cors cookie-parser multer
pnpm add dotenv

# Dev dependencies
pnpm add -D typescript @types/react @types/react-dom @types/node
pnpm add -D vite @vitejs/plugin-react
pnpm add -D tsx
pnpm add -D vitest
pnpm add -D @graphql-codegen/cli @graphql-codegen/client-preset
pnpm add -D @types/express @types/cors @types/cookie-parser @types/multer
```

### 3. TypeScript configuration (client)

**Files to create:** `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"],
  "exclude": ["src/server/**/*"]
}
```

### 4. TypeScript configuration (server)

**Files to create:** `tsconfig.node.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "outDir": "dist",
    "rootDir": "src",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src/server/**/*.ts"],
  "exclude": ["node_modules"]
}
```

### 5. Vite configuration

**Files to create:** `vite.config.ts`

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      "/auth": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist/client",
  },
});
```

### 6. Create directory structure

```bash
mkdir -p src/server/entities
mkdir -p src/server/resolvers
mkdir -p src/server/services/analytics
mkdir -p src/server/services/llm
mkdir -p src/server/middleware
mkdir -p src/server/types
mkdir -p src/server/seeds
mkdir -p src/pages
mkdir -p src/components/layout
mkdir -p src/components/insights
mkdir -p src/components/explorer
mkdir -p src/components/ai
mkdir -p src/components/export
mkdir -p src/components/shared
mkdir -p src/lib
mkdir -p uploads
mkdir -p e2e
```

### 7. Create entry files

**Files to create:** `src/main.tsx`

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

**Files to create:** `src/App.tsx`

```tsx
import { Typography } from "@mui/material";

export default function App() {
  return <Typography variant="h4">Chat Analysis — Loading...</Typography>;
}
```

**Files to create:** `index.html`

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Chat Analysis</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**Files to create:** `src/server/index.ts`

```typescript
import "reflect-metadata";
import "dotenv/config";

console.log("Server placeholder — will be implemented in Phase 05");
```

### 8. Create gitignore

**Files to create:** `.gitignore`

```
node_modules
dist
build
.env
*.log
uploads/*
!uploads/.gitkeep
coverage
playwright-report
test-results
.DS_Store
```

**Files to create:** `uploads/.gitkeep`

```
```

### 9. Create environment template

**Files to create:** `.env.example`

```bash
# Database
DATABASE_URL=postgresql://dev:dev@db:5432/chat-analysis

# Authentication (Better Auth)
BETTER_AUTH_SECRET=change-me-to-a-random-string
BETTER_AUTH_URL=https://chat-analysis.localhost
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# AI — LLM Providers (provide at least one)
OPENAI_API_KEY=your-openai-api-key
ANTHROPIC_API_KEY=your-anthropic-api-key
GOOGLE_AI_API_KEY=your-google-ai-api-key

# Server
PORT=4000
NODE_ENV=development
```

## Verification

```bash
pnpm typecheck
# Should pass with no errors (only placeholder files exist)

pnpm build
# Vite should build the minimal React app successfully
```

Expected: TypeScript compiles without errors. Vite produces a client build.

## When done

Report: files created (with summary per file), verification results, and any issues encountered.
