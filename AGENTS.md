# Project rules

These rules apply to all work in this repository.

## No paid services or external APIs

- Do not introduce, integrate, or use paid services, paid third-party tools,
  subscriptions, usage-based billing, or paid dependencies for this project.
- Do not integrate or call external service APIs, including free tiers and trials.
- Do not add services requiring billing details, payment cards, API keys, or cloud
  accounts. Do not activate trials or create billable resources.
- Prefer local, offline-capable tools and free, open-source dependencies. Game
  functionality, tests, builds, and development utilities must not depend on a
  hosted service or external API.
- Ordinary free package downloads and documentation access are permitted; they
  must not introduce a paid requirement or external API dependency.
- Local browser APIs (such as localStorage), localhost development servers, and
  internal code interfaces are permitted. The API restriction concerns external
  services, not ordinary local programming interfaces.
- If a proposed feature cannot meet these constraints, explain the limitation
  and offer a free local alternative. Never assume permission to incur costs or
  bypass these restrictions. Exceptions require an explicit user instruction.
