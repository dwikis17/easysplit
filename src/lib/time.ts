export function durationToSeconds(value: string) {
  const match = value.match(/^(\d+)([smhd])$/);
  if (!match) {
    return 900;
  }

  const amount = Number(match[1]);
  const unit = match[2];
  const multiplier = unit === 's' ? 1 : unit === 'm' ? 60 : unit === 'h' ? 3600 : 86400;
  return amount * multiplier;
}

export function durationToDate(value: string) {
  return new Date(Date.now() + durationToSeconds(value) * 1000);
}
