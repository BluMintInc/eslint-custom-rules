#!/bin/sh
input=$(cat)

model=$(echo "$input" | jq -r '.model.display_name // "Unknown"')
ctx_size=$(echo "$input" | jq -r '.context_window.context_window_size // empty')
ctx_used=$(echo "$input" | jq -r '.context_window.used_percentage // empty')
five_pct=$(echo "$input" | jq -r '.rate_limits.five_hour.used_percentage // empty')
five_reset=$(echo "$input" | jq -r '.rate_limits.five_hour.resets_at // empty')
week_pct=$(echo "$input" | jq -r '.rate_limits.seven_day.used_percentage // empty')
week_reset=$(echo "$input" | jq -r '.rate_limits.seven_day.resets_at // empty')

# Format context window size as "200K" or "1M"
fmt_size() {
  if [ "$1" -ge 1000000 ] 2>/dev/null; then
    printf '%sM' "$(( $1 / 1000000 ))"
  elif [ "$1" -ge 1000 ] 2>/dev/null; then
    printf '%sK' "$(( $1 / 1000 ))"
  else
    printf '%s' "$1"
  fi
}

# Format seconds remaining as compact countdown (e.g. "2h13m", "3d5h", "47m")
countdown() {
  now=$(date +%s)
  diff=$(( $1 - now ))
  if [ "$diff" -le 0 ]; then
    printf 'now'
    return
  fi
  d=$(( diff / 86400 ))
  h=$(( (diff % 86400) / 3600 ))
  m=$(( (diff % 3600) / 60 ))
  if [ "$d" -gt 0 ]; then
    printf '%dd%dh' "$d" "$h"
  elif [ "$h" -gt 0 ]; then
    printf '%dh%dm' "$h" "$m"
  else
    printf '%dm' "$m"
  fi
}

# Build a mini bar from a percentage (10 chars wide)
bar() {
  pct=$(printf '%.0f' "$1")
  filled=$(( pct / 10 ))
  empty=$(( 10 - filled ))
  b=""
  i=0; while [ $i -lt $filled ]; do b="${b}━"; i=$((i+1)); done
  i=0; while [ $i -lt $empty  ]; do b="${b}╌"; i=$((i+1)); done
  printf '%s' "$b"
}

# Usage-warning thresholds (% of a rate-limit window). Override via env.
WARN_THRESHOLD=${CLAUDE_USAGE_WARN:-75}
CRIT_THRESHOLD=${CLAUDE_USAGE_CRIT:-90}

# Reject non-numeric env overrides so -ge tests never emit "Illegal number"
is_uint() {
  case "$1" in
    ''|*[!0-9]*) return 1 ;;
    *) return 0 ;;
  esac
}
is_uint "$WARN_THRESHOLD" || WARN_THRESHOLD=75
is_uint "$CRIT_THRESHOLD" || CRIT_THRESHOLD=90
# Critical must not sit below warn, else crit banner never triggers
[ "$CRIT_THRESHOLD" -lt "$WARN_THRESHOLD" ] && CRIT_THRESHOLD=$WARN_THRESHOLD

esc=$(printf '\033')
RED="${esc}[1;31m"
YEL="${esc}[33m"
RST="${esc}[0m"

# Color for a percentage: red past critical, yellow past warn, none below
pct_color() {
  p=$(printf '%.0f' "$1")
  if [ "$p" -ge "$CRIT_THRESHOLD" ]; then printf '%s' "$RED"
  elif [ "$p" -ge "$WARN_THRESHOLD" ]; then printf '%s' "$YEL"
  fi
}

# Worst usage across rate-limit windows drives the alarm banner
worst=0
for v in "$five_pct" "$week_pct"; do
  [ -z "$v" ] && continue
  p=$(printf '%.0f' "$v")
  [ "$p" -gt "$worst" ] && worst=$p
done

banner=""
if [ "$worst" -ge "$CRIT_THRESHOLD" ]; then
  banner="${RED}⚠ USAGE ${worst}% — WRAP UP & SWITCH ACCOUNT${RST}  "
elif [ "$worst" -ge "$WARN_THRESHOLD" ]; then
  banner="${YEL}⚠ usage ${worst}%${RST}  "
fi

parts="${banner}⟡ $model"

if [ -n "$ctx_size" ]; then
  parts="$parts [$(fmt_size "$ctx_size")]"
fi

if [ -n "$ctx_used" ]; then
  pct=$(printf '%.0f' "$ctx_used")
  parts="$parts  ◈ ctx $(bar "$ctx_used") ${pct}%"
fi

if [ -n "$five_pct" ]; then
  pct=$(printf '%.0f' "$five_pct")
  reset_str=""
  if [ -n "$five_reset" ]; then
    reset_str=" $(countdown "$five_reset")"
  fi
  c=$(pct_color "$five_pct")
  parts="$parts  ${c}◈ 5h $(bar "$five_pct") ${pct}%${reset_str}${RST}"
fi

if [ -n "$week_pct" ]; then
  pct=$(printf '%.0f' "$week_pct")
  reset_str=""
  if [ -n "$week_reset" ]; then
    reset_str=" $(countdown "$week_reset")"
  fi
  c=$(pct_color "$week_pct")
  parts="$parts  ${c}◈ 7d $(bar "$week_pct") ${pct}%${reset_str}${RST}"
fi

email=$(claude auth status 2>/dev/null | jq -r '.email // empty' 2>/dev/null)
if [ -n "$email" ]; then
  parts="$parts  ◈ $email"
fi

printf '%s' "$parts"
