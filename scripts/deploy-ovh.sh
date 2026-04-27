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
  "changethis.php"
  "config/contact-config.php"
  "config/changethis-config.php"
  "fonts"
  "images"
  "scripts"
)

FILES=()
for item in "${DEPLOY_ITEMS[@]}"; do
  abs="$PROJECT_ROOT/$item"
  if [[ ! -e "$abs" ]]; then
    if [[ "$item" == "config/contact-config.php" || "$item" == "config/changethis-config.php" ]]; then
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

  echo "UPLOAD   [${index}/${#FILES[@]}] ${relative_path}"
  curl "${CURL_ARGS[@]}" --ftp-create-dirs --upload-file "$local_file" "$remote_url"
  echo "DONE     [${index}/${#FILES[@]}] ${relative_path}"
done

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "Dry run complete. Nothing was uploaded."
else
  echo "OVH deploy complete."
fi
