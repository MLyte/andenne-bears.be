#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: scripts/deploy-ovh.sh [options]

Deploy public website files to OVH over FTP/FTPS using curl.

Options:
  --host <host>         FTP host (default: $OVH_FTP_HOST or ftp.cluster115.hosting.ovh.net)
  --user <user>         FTP username (default: $OVH_FTP_USER)
  --password <pass>     FTP password (default: $OVH_FTP_PASSWORD)
  --path <remote-path>  Remote root path (default: $OVH_FTP_PATH or /www)
  --port <port>         FTP/FTPS explicit port (default: $OVH_FTP_PORT or 21)
  --netrc-file <path>   Use a netrc file for credentials (default: $OVH_FTP_NETRC or ./.ovh-ftp.netrc)
  --ftp                 Use plain FTP (default is FTPS explicit)
  --ftps                Force FTPS explicit mode
  --active              Use active mode (default passive)
  --debug               Show verbose curl logs (useful if a transfer appears stuck)
  --changed-only        Upload only files that differ (size/mtime) when remote metadata is available
  --force-all           Force upload of all files (default behavior)
  --dry-run             Print operations without uploading
  -h, --help            Show this help

Safe no-typing mode:
  Put credentials in a local netrc file (chmod 600) and run this script without args.
USAGE
}

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

HOST="${OVH_FTP_HOST:-ftp.cluster115.hosting.ovh.net}"
USER_NAME="${OVH_FTP_USER:-}"
PASSWORD="${OVH_FTP_PASSWORD:-}"
REMOTE_PATH="${OVH_FTP_PATH:-/www}"
PORT="${OVH_FTP_PORT:-21}"
NETRC_FILE="${OVH_FTP_NETRC:-$PROJECT_ROOT/.ovh-ftp.netrc}"
USE_FTPS=1
USE_ACTIVE=0
DRY_RUN=0
DEBUG=0
CHANGED_ONLY=0
MANIFEST_NAME=".deploy-manifest-sha256.txt"
REMOTE_MANIFEST_LOADED=0
declare -A REMOTE_MANIFEST_HASHES=()
declare -A LOCAL_MANIFEST_HASHES=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host)
      HOST="${2:-}"
      shift 2
      ;;
    --user)
      USER_NAME="${2:-}"
      shift 2
      ;;
    --password)
      PASSWORD="${2:-}"
      shift 2
      ;;
    --path)
      REMOTE_PATH="${2:-}"
      shift 2
      ;;
    --port)
      PORT="${2:-}"
      shift 2
      ;;
    --netrc-file)
      NETRC_FILE="${2:-}"
      shift 2
      ;;
    --ftp)
      USE_FTPS=0
      shift
      ;;
    --ftps)
      USE_FTPS=1
      shift
      ;;
    --active)
      USE_ACTIVE=1
      shift
      ;;
    --debug)
      DEBUG=1
      shift
      ;;
    --changed-only)
      CHANGED_ONLY=1
      shift
      ;;
    --force-all)
      CHANGED_ONLY=0
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

normalize_path() {
  local p="$1"
  p="${p#/}"
  p="${p%/}"
  printf '%s' "$p"
}

urlencode_path() {
  local input="$1"
  local output=""
  local i
  local c

  for ((i = 0; i < ${#input}; i++)); do
    c="${input:i:1}"
    case "$c" in
      [a-zA-Z0-9.~_/-])
        output+="$c"
        ;;
      *)
        printf -v output '%s%%%02X' "$output" "'$c"
        ;;
    esac
  done

  printf '%s' "$output"
}

local_mtime_epoch() {
  local file="$1"
  if stat -c '%Y' "$file" >/dev/null 2>&1; then
    stat -c '%Y' "$file"
    return
  fi

  if stat -f '%m' "$file" >/dev/null 2>&1; then
    stat -f '%m' "$file"
    return
  fi

  echo ""
}

parse_http_date_epoch() {
  local http_date="$1"

  if date -d "$http_date" '+%s' >/dev/null 2>&1; then
    date -d "$http_date" '+%s'
    return
  fi

  if date -j -f '%a, %d %b %Y %T %Z' "$http_date" '+%s' >/dev/null 2>&1; then
    date -j -f '%a, %d %b %Y %T %Z' "$http_date" '+%s'
    return
  fi

  echo ""
}

file_sha256() {
  local file="$1"

  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$file" | awk '{print $1}'
    return
  fi

  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$file" | awk '{print $1}'
    return
  fi

  echo "Missing sha256 utility (sha256sum or shasum)." >&2
  exit 1
}

load_remote_manifest() {
  local manifest_remote_url="$1"
  local manifest_tmp="$2"
  local line
  local hash
  local path

  if ! curl "${CURL_ARGS[@]}" "$manifest_remote_url" -o "$manifest_tmp" >/dev/null 2>&1; then
    return
  fi

  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    hash="${line%%  *}"
    path="${line#*  }"
    if [[ -n "$hash" && -n "$path" ]]; then
      REMOTE_MANIFEST_HASHES["$path"]="$hash"
    fi
  done < "$manifest_tmp"

  REMOTE_MANIFEST_LOADED=1
}

write_local_manifest() {
  local output_file="$1"
  local key

  : > "$output_file"
  for key in "${!LOCAL_MANIFEST_HASHES[@]}"; do
    printf '%s  %s\n' "${LOCAL_MANIFEST_HASHES[$key]}" "$key" >> "$output_file"
  done
  sort -o "$output_file" "$output_file"
}

should_upload_file() {
  local local_file="$1"
  local relative_path="$2"
  local remote_url="$3"

  if [[ "$CHANGED_ONLY" -eq 0 ]]; then
    return 0
  fi

  local local_size
  local local_hash
  local remote_size
  local local_epoch
  local remote_epoch
  local remote_last_modified
  local headers

  local_hash="$(file_sha256 "$local_file")"
  LOCAL_MANIFEST_HASHES["$relative_path"]="$local_hash"

  if [[ "$REMOTE_MANIFEST_LOADED" -eq 1 ]]; then
    if [[ "${REMOTE_MANIFEST_HASHES[$relative_path]:-}" == "$local_hash" ]]; then
      return 1
    fi
    return 0
  fi

  local_size="$(wc -c < "$local_file" | tr -d '[:space:]')"
  if ! headers="$(curl "${CURL_ARGS[@]}" --head "$remote_url" 2>/dev/null)"; then
    return 0
  fi

  remote_size="$(printf '%s\n' "$headers" | awk -F': ' 'tolower($1)=="content-length"{print $2}' | tr -d '\r' | tail -n1)"
  if [[ -z "$remote_size" ]]; then
    return 0
  fi

  if [[ "$local_size" != "$remote_size" ]]; then
    return 0
  fi

  remote_last_modified="$(printf '%s\n' "$headers" | awk -F': ' 'tolower($1)=="last-modified"{print $2}' | tr -d '\r' | tail -n1)"
  if [[ -z "$remote_last_modified" ]]; then
    return 1
  fi

  local_epoch="$(local_mtime_epoch "$local_file")"
  remote_epoch="$(parse_http_date_epoch "$remote_last_modified")"
  if [[ -z "$local_epoch" || -z "$remote_epoch" ]]; then
    return 1
  fi

  if (( local_epoch > remote_epoch )); then
    return 0
  fi

  return 1
}

get_permission_octal() {
  local target="$1"
  if stat -c '%a' "$target" >/dev/null 2>&1; then
    stat -c '%a' "$target"
    return
  fi

  if stat -f '%Lp' "$target" >/dev/null 2>&1; then
    stat -f '%Lp' "$target"
    return
  fi

  echo ""
}

ensure_safe_netrc_permissions() {
  local file="$1"
  local perm
  perm="$(get_permission_octal "$file")"

  if [[ -z "$perm" ]]; then
    echo "Warning: cannot verify permissions on $file. Continuing." >&2
    return
  fi

  perm="${perm: -3}"
  local group="${perm:1:1}"
  local other="${perm:2:1}"

  if [[ "$group" != "0" || "$other" != "0" ]]; then
    echo "Unsafe netrc permissions on $file ($perm). Run: chmod 600 $file" >&2
    exit 1
  fi
}

NETRC_ACTIVE=0
if [[ -f "$NETRC_FILE" ]]; then
  ensure_safe_netrc_permissions "$NETRC_FILE"
  NETRC_ACTIVE=1
fi

if [[ "$NETRC_ACTIVE" -eq 0 && -z "$USER_NAME" ]]; then
  echo "Missing FTP username. Set OVH_FTP_USER, pass --user, or create $NETRC_FILE." >&2
  exit 1
fi

if [[ "$DRY_RUN" -eq 0 && "$NETRC_ACTIVE" -eq 0 ]]; then
  if [[ -z "$PASSWORD" ]]; then
    read -r -s -p "FTP password for ${USER_NAME}@${HOST}: " PASSWORD
    echo
  fi

  if [[ -z "$PASSWORD" ]]; then
    echo "Missing FTP password. Set OVH_FTP_PASSWORD, pass --password, or use --netrc-file." >&2
    exit 1
  fi
fi

REMOTE_PATH="$(normalize_path "$REMOTE_PATH")"

if [[ -n "$PORT" && ! "$PORT" =~ ^[0-9]+$ ]]; then
  echo "Invalid port: $PORT (expected numeric value)." >&2
  exit 1
fi

DEPLOY_ITEMS=(
  ".ovhconfig"
  "index.html"
  "bears.css"
  "contact.php"
  "config/contact-config.php"
  "fonts"
  "images"
  "scripts"
)

FILES=()
for item in "${DEPLOY_ITEMS[@]}"; do
  abs="$PROJECT_ROOT/$item"
  if [[ ! -e "$abs" ]]; then
    if [[ "$item" == "config/contact-config.php" ]]; then
      continue
    fi
    echo "Deploy item not found: $item" >&2
    exit 1
  fi

  if [[ -d "$abs" ]]; then
    while IFS= read -r file; do
      FILES+=("$file")
    done < <(find "$abs" -type f | sort)
  else
    FILES+=("$abs")
  fi
done

PROTO="ftp"

CURL_ARGS=(
  --show-error
  --fail
  --disable-epsv
  --connect-timeout 15
  --max-time 600
)

if [[ "$DEBUG" -eq 0 ]]; then
  CURL_ARGS+=(--silent)
else
  CURL_ARGS+=(--verbose)
fi

if [[ "$NETRC_ACTIVE" -eq 1 ]]; then
  CURL_ARGS+=(--netrc-file "$NETRC_FILE")
else
  CURL_ARGS+=(--user "${USER_NAME}:${PASSWORD}")
fi

if [[ "$USE_ACTIVE" -eq 1 ]]; then
  CURL_ARGS+=(--ftp-port -)
fi

if [[ "$USE_FTPS" -eq 1 ]]; then
  CURL_ARGS+=(--ssl-reqd)
fi

echo "Deploy target: ${PROTO}://${HOST}:${PORT}/${REMOTE_PATH}"
echo "Files: ${#FILES[@]}"
echo "TLS: $( [[ "$USE_FTPS" -eq 1 ]] && echo enabled || echo disabled )"
echo "FTP mode: $( [[ "$USE_ACTIVE" -eq 1 ]] && echo active || echo passive )"
echo "Auth: $( [[ "$NETRC_ACTIVE" -eq 1 ]] && echo "netrc ($NETRC_FILE)" || echo "env/flags" )"
echo "Debug: $( [[ "$DEBUG" -eq 1 ]] && echo enabled || echo disabled )"
echo "Changed-only: $( [[ "$CHANGED_ONLY" -eq 1 ]] && echo enabled || echo disabled )"

manifest_remote_path="$REMOTE_PATH/$MANIFEST_NAME"
manifest_remote_url="${PROTO}://${HOST}:${PORT}/$(urlencode_path "$manifest_remote_path")"
manifest_local_tmp="$(mktemp)"
trap 'rm -f "$manifest_local_tmp"' EXIT

if [[ "$CHANGED_ONLY" -eq 1 && "$DRY_RUN" -eq 0 ]]; then
  load_remote_manifest "$manifest_remote_url" "$manifest_local_tmp"
  if [[ "$REMOTE_MANIFEST_LOADED" -eq 1 ]]; then
    echo "Manifest: loaded remote hash list (${#REMOTE_MANIFEST_HASHES[@]} entries)"
  else
    echo "Manifest: not found remotely, first changed-only run will upload all files"
  fi
fi

index=0
for local_file in "${FILES[@]}"; do
  index=$((index + 1))
  relative_path="${local_file#"$PROJECT_ROOT/"}"
  remote_file="$REMOTE_PATH/$relative_path"
  remote_url="${PROTO}://${HOST}:${PORT}/$(urlencode_path "$remote_file")"

  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "DRY RUN  [${index}/${#FILES[@]}] ${relative_path} -> ${remote_file}"
    continue
  fi

  if ! should_upload_file "$local_file" "$relative_path" "$remote_url"; then
    echo "SKIP     [${index}/${#FILES[@]}] ${relative_path} (unchanged)"
    continue
  fi

  echo "UPLOAD   [${index}/${#FILES[@]}] ${relative_path}"
  curl "${CURL_ARGS[@]}" --ftp-create-dirs --upload-file "$local_file" "$remote_url"
  echo "DONE     [${index}/${#FILES[@]}] ${relative_path}"
done

if [[ "$DRY_RUN" -eq 0 && "$CHANGED_ONLY" -eq 1 ]]; then
  write_local_manifest "$manifest_local_tmp"
  curl "${CURL_ARGS[@]}" --ftp-create-dirs --upload-file "$manifest_local_tmp" "$manifest_remote_url"
  echo "DONE     manifest ${MANIFEST_NAME}"
fi

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "Dry run complete. Nothing was uploaded."
else
  echo "OVH deploy complete."
fi
