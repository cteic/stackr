#!/bin/bash
# PR Size Checker
# Helps keep PRs small and reviewable.
#
# ADVISORY, never blocking. Call sites invoke it with `|| true`: a blocking
# size check gets bypassed, and the value here is the conversation, not the
# exit code. Called from .github/workflows/code-checks.yml on pull_request.

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

# Thresholds
IDEAL_FILES=5
MAX_FILES=10
IDEAL_LINES=300
MAX_LINES=500
IDEAL_REVIEW_TIME=20

print_header() {
  echo -e "\n${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BOLD}${CYAN}  $1${NC}"
  echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
}

# Get changes vs dev (or fallback to main/master)
get_base_branch() {
  git rev-parse --verify origin/dev >/dev/null 2>&1 && echo "origin/dev" && return
  git rev-parse --verify origin/main >/dev/null 2>&1 && echo "origin/main" && return
  echo "origin/master"
}

base_branch=$(get_base_branch)

print_header "📊 PR Size Check"

echo -e "${BLUE}Comparing against: ${BOLD}$base_branch${NC}\n"

# Files/directories to exclude (build artifacts, dependencies, generated files)
# Using grep -E patterns for better matching
EXCLUDE_PATTERN='(^|/)(node_modules|dist|build|coverage|styled-system|\.turbo|\.next|\.pnpm-store|\.pnpm-local|pnpm-lock\.yaml|yarn\.lock|bun\.lock|bun\.lockb|package-lock\.json|.*\.tsbuildinfo|\.DS_Store|.*\.log)(/|$)'

# Function to filter out excluded files
filter_files() {
  local files="$1"
  
  # Filter using extended regex
  echo "$files" | grep -vE "$EXCLUDE_PATTERN"
}

# Get all changed files
all_changed_files=$(git diff --name-only $base_branch...HEAD 2>/dev/null || git diff --name-only HEAD~1)

# Filter out excluded files
changed_files=$(filter_files "$all_changed_files")
files_changed=$(echo "$changed_files" | grep -v '^$' | wc -l | tr -d ' ')

if [ "$files_changed" -eq 0 ]; then
  echo -e "${YELLOW}⚠️  No source code changes detected vs $base_branch${NC}"
  echo -e "${YELLOW}Only generated/build files changed.${NC}\n"
  exit 0
fi

# Get detailed stats (only for non-excluded files)
stats=""
while IFS= read -r file; do
  if [ -n "$file" ]; then
    file_stats=$(git diff --numstat $base_branch...HEAD 2>/dev/null -- "$file" || git diff --numstat HEAD~1 -- "$file")
    if [ -n "$file_stats" ]; then
      stats="$stats"$'\n'"$file_stats"
    fi
  fi
done <<< "$changed_files"

lines_added=$(echo "$stats" | awk '{sum+=$1} END {print sum+0}')
lines_deleted=$(echo "$stats" | awk '{sum+=$2} END {print sum+0}')
lines_total=$((lines_added + lines_deleted))
# Get changed files by category (from filtered list)
# `grep -c` already prints 0 and exits 1 when nothing matches; `|| echo 0`
# printed a second 0 on its own line. `|| true` keeps the count only.
test_files=$(echo "$changed_files" | grep -cE '\.(test|spec)\.(ts|tsx)$' || true)
source_files=$(echo "$changed_files" | grep -cE '(src|app)/.*\.(ts|tsx)$' || true)
config_files=$(echo "$changed_files" | grep -cE '\.(json|ya?ml|config\.[jt]s)$' || true)

# Show excluded file count
excluded_count=$(($(echo "$all_changed_files" | wc -l | tr -d ' ') - files_changed))
if [ "$excluded_count" -gt 0 ]; then
  echo -e "${CYAN}ℹ️  Excluded $excluded_count generated/build files from count${NC}"
  echo ""
fi

# Estimate review time (rough heuristic: 10 lines/minute + 2 min per file)
review_time=$((lines_total / 10 + files_changed * 2))

# Determine status
status="✅"
warnings=0

echo -e "${BOLD}PR Statistics:${NC}"
echo -e "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Files check
if [ "$files_changed" -le "$IDEAL_FILES" ]; then
  echo -e "  ${GREEN}✓${NC} Files changed: ${GREEN}${BOLD}$files_changed${NC} (ideal: ≤$IDEAL_FILES)"
elif [ "$files_changed" -le "$MAX_FILES" ]; then
  echo -e "  ${YELLOW}⚠${NC} Files changed: ${YELLOW}${BOLD}$files_changed${NC} (ideal: ≤$IDEAL_FILES, max: $MAX_FILES)"
  warnings=$((warnings + 1))
else
  echo -e "  ${RED}✗${NC} Files changed: ${RED}${BOLD}$files_changed${NC} (exceeds max: $MAX_FILES)"
  warnings=$((warnings + 1))
  status="⚠️"
fi

# Lines check
if [ "$lines_total" -le "$IDEAL_LINES" ]; then
  echo -e "  ${GREEN}✓${NC} Lines changed: ${GREEN}${BOLD}$lines_total${NC} (+$lines_added -$lines_deleted) (ideal: ≤$IDEAL_LINES)"
elif [ "$lines_total" -le "$MAX_LINES" ]; then
  echo -e "  ${YELLOW}⚠${NC} Lines changed: ${YELLOW}${BOLD}$lines_total${NC} (+$lines_added -$lines_deleted) (ideal: ≤$IDEAL_LINES)"
  warnings=$((warnings + 1))
else
  echo -e "  ${RED}✗${NC} Lines changed: ${RED}${BOLD}$lines_total${NC} (+$lines_added -$lines_deleted) (exceeds max: $MAX_LINES)"
  warnings=$((warnings + 1))
  status="⚠️"
fi

# Review time check
if [ "$review_time" -le "$IDEAL_REVIEW_TIME" ]; then
  echo -e "  ${GREEN}✓${NC} Est. review time: ${GREEN}${BOLD}~${review_time} min${NC} (ideal: ≤$IDEAL_REVIEW_TIME min)"
else
  echo -e "  ${YELLOW}⚠${NC} Est. review time: ${YELLOW}${BOLD}~${review_time} min${NC} (ideal: ≤$IDEAL_REVIEW_TIME min)"
  warnings=$((warnings + 1))
fi

echo ""
echo -e "${BOLD}File Breakdown:${NC}"
echo -e "  Source files: $source_files"
echo -e "  Test files: $test_files"
echo -e "  Config files: $config_files"

# Check for scattered changes
dirs_touched=$(echo "$changed_files" | xargs -I {} dirname {} | sort -u | wc -l | tr -d ' ')
echo -e "  Directories touched: $dirs_touched"

if [ "$dirs_touched" -gt 5 ]; then
  echo -e "  ${YELLOW}⚠${NC}  Changes span many directories - consider splitting"
  warnings=$((warnings + 1))
fi

# Summary
echo ""
echo -e "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ "$warnings" -eq 0 ]; then
  echo -e "${GREEN}${BOLD}✨ PR size looks great! Easy to review.${NC}"
  echo ""
  echo -e "✅ Touches < $IDEAL_FILES files"
  echo -e "✅ < $IDEAL_LINES lines of code"
  echo -e "✅ Can be reviewed in < $IDEAL_REVIEW_TIME minutes"
  exit 0
elif [ "$warnings" -le 2 ]; then
  echo -e "${YELLOW}${BOLD}⚠️  PR is getting large but still manageable${NC}"
  echo ""
  echo -e "${YELLOW}Consider:${NC}"
  echo -e "  • Can any changes be split into a separate PR?"
  echo -e "  • Are there independent pieces that could go first?"
  echo -e "  • Is the PR focused on a single purpose?"
  exit 0
else
  echo -e "${RED}${BOLD}❌ PR is too large - strongly consider splitting${NC}"
  echo ""
  echo -e "${RED}Recommendations:${NC}"
  echo -e "  1. Split into smaller, focused PRs"
  echo -e "  2. Create a stacked PR workflow"
  echo -e "  3. Extract refactoring into separate PR"
  echo -e "  4. Move test changes to follow-up PR"
  echo ""
  echo -e "${CYAN}Use: git diff --stat $base_branch...HEAD${NC}"
  echo -e "${CYAN}To see detailed breakdown${NC}"
  exit 1
fi
