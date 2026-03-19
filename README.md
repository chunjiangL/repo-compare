# repo-compare

Compare GitHub repositories side-by-side. Scores repos across 9 dimensions and generates pipeline diagrams showing how each repo actually works.

## What it does

Paste in 2+ GitHub repo URLs and get:

- **Quick metrics** — stars, forks, LOC, dependency count, test coverage, etc. (instant, no AI)
- **Deep analysis** — code quality, security, performance, robustness scored by reading actual source code
- **Pipeline diagrams** — auto-generated flowcharts showing the repo's architecture
- **Follow-up chat** — ask questions about the repos, the agent can read source files to answer

The deep analysis uses a single agent session that reads both repos, so it can make direct comparisons instead of analyzing each one in isolation.

## Setup

You need Node.js 20+ and a GitHub OAuth app.

```bash
# clone
git clone https://github.com/chunjiangL/repo-compare.git
cd repo-compare

# install both packages
cd server && npm install && cd ..
cd web && npm install && cd ..

# configure
cp web/.env.local.example web/.env.local
# fill in GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, NEXTAUTH_SECRET, NEXTAUTH_URL
```

Create a GitHub OAuth app at https://github.com/settings/developers with callback URL `http://localhost:3000/api/auth/callback/github`.

## Running

```bash
# start both (web on :3000, server on :3001)
npm run dev
```

If you're running inside a Claude Code session, start the server separately:

```bash
cd server && env -u CLAUDECODE npx tsx src/index.ts
```

## How it works

**Phase 1** — GitHub API metadata + file tree → instant heuristic scores for adoption, maintenance, leanness, documentation, architecture.

**Phase 2** — Clones repos, spawns an Agent SDK session that reads 8-15 source files per repo → scores code quality, security, performance, robustness with domain-aware metrics + generates Mermaid pipeline diagrams.

**Chat** — Resumes the same agent session from Phase 2. It remembers every file it read, so follow-up questions don't require re-reading.

## Stack

- **Web**: Next.js 15, Tailwind, Recharts, Mermaid
- **Server**: Express, TypeScript, Agent SDK
- **Auth**: NextAuth v5 + GitHub OAuth
- **Storage**: SQLite (history), git clones persisted for reuse

## License

[MIT](LICENSE)
