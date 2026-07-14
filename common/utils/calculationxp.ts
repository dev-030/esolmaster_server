export function xpRequiredForLevel(level: number) {
  const baseXp = 200;
  const growthRate = 1.15;

  return Math.floor(baseXp * Math.pow(growthRate, level - 1));
}

export function calculateLevel(totalXp: number) {
  let level = 1;
  let xpRemaining = totalXp;

  while (xpRemaining >= xpRequiredForLevel(level)) {
    xpRemaining -= xpRequiredForLevel(level);
    level++;
  }

  const xpNeeded = xpRequiredForLevel(level);

  return {
    level,
    xpIntoLevel: xpRemaining,
    xpNeededForNextLevel: xpNeeded - xpRemaining,
    progressPercentage: Number(((xpRemaining / xpNeeded) * 100).toFixed(2)),
  };
}