# CI/CD

- **Org:** github.com/nathanblatter
- **Runner:** Native macOS GitHub Actions runner on Mac Mini (launchd service at ~/actions-runner)
- **Deploy trigger:** Push to `main` branch
- **Deploy workflow:** `.github/workflows/deploy.yml` — pulls latest code in `/Users/nathanblatter/Desktop/codenames`, rebuilds Docker containers, and restarts
- **Secrets:** `.env` file on host (gitignored) — contains OPENAI_API_KEY, CLOUDFLARE_TUNNEL_TOKEN
- **Infrastructure:** Docker Compose (app + Cloudflare tunnel), shared Postgres from docker-services
