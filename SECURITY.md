# Security Policy

## Never commit secrets

Do not commit API keys, passwords, tokens, or any other secret into this repository —
not in code, not in docs, not in commit messages. This includes the Resend API key,
the super-admin password, and `MINIYO_JWT_SECRET`.

All secrets belong in **Railway environment variables** (Service → Variables), never in
the repo. Local development uses a git-ignored `.env` file (see `.env.example` for the
list of variable names, with placeholder values only).

## Required production environment variables

| Variable | Purpose |
|---|---|
| `RESEND_API_KEY` | Resend transactional email key. Set the real value only in Railway. |
| `MINIYO_JWT_SECRET` | Signing secret for auth tokens. The code falls back to a dev-only placeholder if unset — **must** be a long random value in production. |
| `MINIYO_ADMIN_PASSWORD` | Initial super-admin password used at first-boot seeding. Change it immediately after first login. |

## Rotating a leaked secret

1. **Revoke** the exposed credential at its source (e.g. delete the key in the Resend
   dashboard, reset the password).
2. **Generate** a fresh value.
3. **Update** the corresponding Railway environment variable with the new value and
   redeploy. Never paste the new value into the repo.
4. If the secret was ever committed, **purge it from git history** (e.g.
   `git filter-repo --replace-text`) and force-push, then have all collaborators
   re-clone.

## Automated scanning

- A GitHub Actions workflow (`.github/workflows/secret-scan.yml`) runs
  [gitleaks](https://github.com/gitleaks/gitleaks) on every push and pull request and
  fails the build if a secret is detected.
- An optional local pre-commit hook is provided in `.pre-commit-config.yaml`
  (`pip install pre-commit && pre-commit install`).
- Keep GitHub secret scanning and push protection enabled for this repository.

## Reporting a vulnerability

Report suspected vulnerabilities or leaked credentials privately to the repository owner.
