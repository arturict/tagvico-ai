#!/usr/bin/env bash
# capture-screenshots.sh
#
# Documents the five screenshots needed for the Archivista AI launch
# materials and defines the anonymization rules that apply before any
# image is committed.
#
# STATUS: placeholder for future automation.
# The actual screenshots will be captured manually from a real
# Archivista AI install running against a Fudligagg Lab Paperless-ngx
# instance and then added to docs/screenshots/. This script exists so
# the capture spec is version-controlled and reproducible.
#
# USAGE:
#   scripts/capture-screenshots.sh          # print the capture checklist
#   scripts/capture-screenshots.sh --check  # verify placeholders still exist

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCREENSHOT_DIR="$REPO_ROOT/docs/screenshots"

# ---------------------------------------------------------------------------
# Required screenshots
# ---------------------------------------------------------------------------

declare -a SHOT_NAMES=(
  "setup"
  "dashboard"
  "provider-picker"
  "document-history"
  "paperless-before-after"
)

declare -A SHOT_DESCRIPTIONS=(
  ["setup"]="First-run /setup screen showing the Scan-for-Paperless panel and model provider picker. Trigger by launching with a fresh data/ volume."
  ["dashboard"]="Main dashboard after setup is complete. Shows scan status, processed-document count, and recent-activity list. Use the production colour palette."
  ["provider-picker"]="Provider selection panel in the settings page with all five providers visible (OpenAI, OpenRouter, Ollama, LM Studio, Azure OpenAI) and a privacy tooltip."
  ["document-history"]="Per-document history view. Shows a processed document with AI-generated title, tags, correspondent, document type, and a link to the original Paperless record."
  ["paperless-before-after"]="Side-by-side of a Paperless document detail page before and after Archivista processing. Highlight the added title, tags, correspondent, and custom fields."
)

# ---------------------------------------------------------------------------
# Anonymization checklist — every screenshot must satisfy all of these
# before it is committed.
# ---------------------------------------------------------------------------

declare -a ANON_CHECKLIST=(
  "No API tokens, API keys, or secrets visible in any field or tooltip."
  "No real names, email addresses, or usernames — use placeholder values like 'Alex M.' or 'user@example.org'."
  "No private document content — use fabricated invoices, contracts, and letters with fictional companies."
  "No personally identifiable information (addresses, phone numbers, tax IDs, account numbers)."
  "No real Paperless-ngx instance URLs — use http://paperless-ngx:8000 or http://localhost:8000."
  "Browser bookmarks bar, extensions, and ad-blocker UI hidden or disabled."
  "System tray, clock, and OS-level personalisation (wallpaper, account name) cropped or blurred."
  "Verify EXIF / metadata stripped — export PNGs with 'Save for Web' or equivalent."
)

# ---------------------------------------------------------------------------
# Capture settings
# ---------------------------------------------------------------------------

SUGGESTED_WIDTH=1200
SUGGESTED_HEIGHT=800
DPI_SCALE=2          # export at 2x for retina; final file is 2400x1600 source, displayed at 1200x800
FORMAT="png"         # lossless; do not transcode to JPG

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

print_header() {
  echo ""
  echo "============================================================"
  echo " $1"
  echo "============================================================"
  echo ""
}

print_checklist() {
  print_header "Archivista AI — Screenshot Capture Checklist"

  echo "Target directory : $SCREENSHOT_DIR"
  echo "Suggested size   : ${SUGGESTED_WIDTH}x${SUGGESTED_HEIGHT} px (display) / @${DPI_SCALE}x source"
  echo "Output format    : $FORMAT (lossless)"
  echo ""

  print_header "Required Screenshots (${#SHOT_NAMES[@]})"

  local i=1
  for name in "${SHOT_NAMES[@]}"; do
    echo "  $i. $name"
    echo "     Placeholder : docs/screenshots/${name}-placeholder.svg"
    echo "     Description : ${SHOT_DESCRIPTIONS[$name]}"
    echo ""
    ((i++))
  done

  print_header "Anonymization Checklist"

  local n=1
  for item in "${ANON_CHECKLIST[@]}"; do
    printf "  [ ] %2d. %s\n" "$n" "$item"
    ((n++))
  done

  print_header "Capture Workflow"
  cat <<'EOF'
  1. Start a clean Archivista AI instance with a fresh data/ volume.
  2. Seed one example document per Paperless workflow (invoice, contract,
     letter, receipt) so the screens show realistic data.
  3. Walk through each flow listed above and capture at @2x DPI.
  4. Run every item in the anonymization checklist — crop, redact, or
     re-shoot anything that fails.
  5. Strip metadata (exiftool -all= <file> or "Save for Web").
  6. Save as docs/screenshots/<name>.png, replacing the matching
     <name>-placeholder.svg reference in README.md and docs/screenshots/README.md.
  7. Open a PR with the new images; reviewers must re-run the checklist.

  NOTE: This script is intentionally not an automated browser driver.
  The screenshots come from a real Fudligagg Lab install and require a
  human eye for the anonymization pass. The script's job is to keep the
  spec version-controlled so the capture is reproducible.
EOF
}

check_placeholders() {
  print_header "Placeholder Verification"
  local missing=0
  for name in "${SHOT_NAMES[@]}"; do
    local file="$SCREENSHOT_DIR/${name}-placeholder.svg"
    if [[ -f "$file" ]]; then
      echo "  OK    $file"
    else
      echo "  MISS  $file"
      ((missing++))
    fi
  done

  echo ""
  if (( missing == 0 )); then
    echo "All ${#SHOT_NAMES[@]} placeholders present."
    exit 0
  else
    echo "ERROR: $missing placeholder(s) missing."
    exit 1
  fi
}

# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

case "${1:-}" in
  --check)
    check_placeholders
    ;;
  --help|-h)
    echo "Usage: $0 [--check|--help]"
    echo "  (no args)  Print the full capture checklist."
    echo "  --check    Verify that every placeholder SVG exists."
    ;;
  "")
    print_checklist
    ;;
  *)
    echo "Unknown option: $1" >&2
    echo "Run '$0 --help' for usage." >&2
    exit 2
    ;;
esac
