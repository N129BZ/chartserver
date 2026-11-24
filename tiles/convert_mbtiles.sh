#!/usr/bin/env bash
set -euo pipefail

# Default paths/binaries (override via environment variables or edit directly)
PMTILES_BIN="${PMTILES_BIN:-pmtiles}"
PMTILES_FOLDER="${PMTILES_FOLDER:-./pmtiles}"
WORKAREA="${WORKAREA:-/tmp/workarea}"

log_entry() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1"
}

convert_mbtiles_to_pmtiles() {
    local source_mbtiles="$1"
    local final_pmtiles="$2"
    local tmp_dir="${3:-$WORKAREA}"

    # Equivalent to fs.mkdirSync(..., { recursive: true })
    mkdir -p "$PMTILES_FOLDER"
    mkdir -p "$tmp_dir"

    # Equivalent to path.join(tmpDir, path.basename(finalPmtiles))
    local tmp_pmtiles="${tmp_dir}/$(basename "$final_pmtiles")"

    log_entry ">> Converting MBTILES to PMTILES: ${tmp_pmtiles}"
    "$PMTILES_BIN" convert "$source_mbtiles" "$tmp_pmtiles" --tmpdir="$tmp_dir"

    log_entry ">> Moving finished PMTILES file to: ${final_pmtiles}"
    mv -f "$tmp_pmtiles" "$final_pmtiles"

    # Equivalent to fs.chmodSync(finalPmtiles, 0o666)
    chmod 0666 "$final_pmtiles"
}

# --- Example Usage ---
# Check if script is being executed directly (not sourced)
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    if [[ $# -lt 2 ]]; then
        echo "Usage: $0 <source_mbtiles> <final_pmtiles> [tmp_dir]"
        exit 1
    fi

    convert_mbtiles_to_pmtiles "$1" "$2" "${3:-}"
fi

