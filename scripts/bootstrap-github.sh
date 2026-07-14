#!/usr/bin/env bash
set -euo pipefail

REPO="${REPO:-marutyan/autogrouping}"
IMPLEMENTATION_BRANCH="${IMPLEMENTATION_BRANCH:-agent/initial-implementation}"
DESCRIPTION="A modern, agent-safe automatic tab grouping extension for Chrome."

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI (gh) is required." >&2
  exit 1
fi

gh auth status >/dev/null

if ! gh repo view "$REPO" >/dev/null 2>&1; then
  gh repo create "$REPO" --public --description "$DESCRIPTION"
fi

REMOTE_URL="https://github.com/${REPO}.git"
if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "$REMOTE_URL"
else
  git remote add origin "$REMOTE_URL"
fi

git push -u origin main "$IMPLEMENTATION_BRANCH"

for branch in feat/core-architecture feat/chrome-compatibility feat/ui-migration chore/qa-release; do
  if git show-ref --verify --quiet "refs/heads/$branch"; then
    git push origin "$branch"
  fi
done

gh api --method PATCH "repos/$REPO" \
  -F has_issues=true \
  -F has_projects=false \
  -F has_wiki=false \
  -F allow_squash_merge=true \
  -F allow_merge_commit=false \
  -F allow_rebase_merge=false \
  -F delete_branch_on_merge=true >/dev/null

create_label() {
  local name="$1" color="$2" description="$3"
  gh label create "$name" --repo "$REPO" --color "$color" --description "$description" --force
}

create_label "area:core" "1D76DB" "Rule engine, state, and storage"
create_label "area:chrome" "5319E7" "Chrome APIs and browser compatibility"
create_label "area:ui" "A371F7" "Popup, options, and user interaction"
create_label "area:release" "0E8A16" "CI, packaging, and store readiness"
create_label "type:bug" "D73A4A" "Incorrect behavior"
create_label "type:feature" "0075CA" "New capability"
create_label "type:performance" "FBCA04" "Performance and event-loop work"
create_label "priority:high" "B60205" "Required for the next release"

create_issue() {
  local title="$1" labels="$2" body="$3"
  if gh issue list --repo "$REPO" --state all --search "in:title $title" --json title --jq '.[].title' | grep -Fxq "$title"; then
    return
  fi
  gh issue create --repo "$REPO" --title "$title" --label "$labels" --body "$body"
}

create_issue "Core: deterministic rule matching" "area:core,type:feature,priority:high" \
  $'Implement and validate wildcard matching, deterministic priority, specificity tie-breaking, and invalid-rule handling.\n\nAcceptance:\n- Unit coverage for wildcard and escaping\n- Stable result independent of input order\n- Disabled rules ignored'

create_issue "Core: tab state and protection model" "area:core,type:feature,priority:high" \
  $'Track pending, managed, external-protected, Split View, pinned, and unmatched states. External protection remains until tab close or explicit reset.'

create_issue "Chrome: preserve externally managed groups" "area:chrome,type:bug,priority:high" \
  $'Any unplanned group membership change must be treated as user/agent/extension intent. AutoGrouping must not reclaim the tab until explicit reset.'

create_issue "Chrome: Split View safety" "area:chrome,type:bug,priority:high" \
  $'Detect Split View through feature detection, block group mutations while active, and wait for a settle delay before re-evaluation.'

create_issue "Chrome: event coalescing and mutation tracking" "area:chrome,type:performance,priority:high" \
  $'Coalesce repeated tab events, serialize window mutations, and distinguish AutoGrouping actions from external actions.'

create_issue "Chrome: conservative ownership recovery" "area:chrome,type:feature" \
  $'Recover only groups with persistent ownership evidence and a unique title/color/rule/tab match. Ambiguous groups remain external.'

create_issue "UI: rule editor and priority controls" "area:ui,type:feature" \
  $'Provide rule CRUD, pattern editing, enable/disable, colors, priority controls, and validation.'

create_issue "UI: protected-tab controls" "area:ui,type:feature" \
  $'Show current tab state and allow explicit protect, return to automation, and window re-evaluation actions.'

create_issue "Migration: JSON import and export" "area:ui,type:feature" \
  $'Support AutoGrouping backup format and conversion of legacy groupRules records with preview, validation, merge, and replacement choices.'

create_issue "QA: browser-agent regression" "area:release,type:bug,priority:high" \
  $'Verify a browser agent can open and manage tabs in its own group without AutoGrouping reclaiming them or causing repeated events.'

create_issue "QA: Chrome Stable/Beta and load regression" "area:release,type:performance" \
  $'Test Chrome 120 fallback, current Stable, current Beta, session restore, 100 tabs, 20 groups, and Split View responsiveness.'

create_issue "Release: Chrome Web Store readiness" "area:release,type:feature" \
  $'Finalize independent branding, minimal permissions, privacy disclosure, release ZIP, checksums, screenshots, and listing copy.'


if ! gh pr view "$IMPLEMENTATION_BRANCH" --repo "$REPO" >/dev/null 2>&1; then
  PR_BODY_FILE="$(mktemp)"
  trap 'rm -f "$PR_BODY_FILE"' EXIT
  cat > "$PR_BODY_FILE" <<'BODY'
## What changed

- Adds the modern WXT, TypeScript, React, Biome, Oxlint, Vitest, and Playwright foundation.
- Implements deterministic URL rules and tab state management.
- Preserves externally managed tab groups until explicit user release or tab closure.
- Prevents grouping mutations during Chrome Split View and its settle transition.
- Adds JSON import/export, legacy rule conversion, popup controls, options UI, CI, security, and release workflows.

## Why

The previous behavior could compete with Chrome Split View and browser agents that create their own groups. AutoGrouping establishes an explicit ownership boundary: it only controls groups it created and treats unplanned membership changes as external intent.

## Validation

- Core TypeScript strict check
- Background TypeScript check with Chrome API compatibility stubs
- UI TypeScript check with React compatibility stubs
- Core and migration smoke tests
- JSON and shell syntax validation
- Static scan for external communication and legacy branding

## Remaining before merge

- Install dependencies and commit the generated pnpm lockfile.
- Run the full WXT build, Vitest suite, and Chrome manual regressions on a connected development machine.
BODY
  gh pr create     --repo "$REPO"     --base main     --head "$IMPLEMENTATION_BRANCH"     --title "feat: build initial AutoGrouping extension"     --body-file "$PR_BODY_FILE"     --draft
fi

echo "GitHub bootstrap complete: https://github.com/$REPO"
