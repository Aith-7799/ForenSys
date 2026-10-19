#!/usr/bin/env bash
set -euo pipefail

if [ -f .env ]; then
  # shellcheck disable=SC1091
  . ".env"
fi

if [ -z "${GITHUB_TOKEN:-}" ]; then
  echo "Missing GITHUB_TOKEN in .env." >&2
  exit 1
fi

OWNER="Aith-7799"
REPO="ForenSys"
DESCRIPTION="ForenSys - Digital Crime Scene Evidence and Investigation Management System"

curl -sS -L \
  -X PATCH \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer ${GITHUB_TOKEN}" \
  -H "X-GitHub-Api-Version: 2026-03-10" \
  "https://api.github.com/repos/${OWNER}/${REPO}" \
  -d "{\"description\":\"${DESCRIPTION}\"}"
