# Backend frameworks and ORMs

- [Drizzle ORM](drizzle.md) - v1 (RC) introduces Relational Queries v2 (a rewritten `db.query` and relations format), an opt-in JIT-compiled row mapper, validator integrations collapsed into `drizzle-orm` subpaths, and a...
- [Express](express.md) - Express 5 finally shipped after a long gestation, focused on stability and security rather than features.
- [Fastify](fastify.md) - Fastify 5 is a maintenance-and-modernization major: it requires Node 20+, removes years of deprecated APIs, and tightens defaults rather than adding features.
- [Hono](hono.md) - Hono is built directly on Web Standard primitives (the fetch-API `Request`/`Response`, `Headers`, `URL`), so the same code runs unchanged on Cloudflare Workers, Bun, Deno, AWS Lambda, Vercel, and Node.
- [Nitro](nitro.md) - Nitro is the deploy-anywhere server toolkit (the engine under Nuxt) that builds one app and ships it to Node, Bun, Deno, Cloudflare, Vercel, and Netlify.
- [Prisma ORM](prisma.md) - v7 removes the Rust query engine.
- [tRPC](trpc.md) - v11's new TanStack Query integration stops wrapping `useQuery`/`useMutation` and instead exposes native `queryOptions`/`mutationOptions`, so you call TanStack's own hooks.
