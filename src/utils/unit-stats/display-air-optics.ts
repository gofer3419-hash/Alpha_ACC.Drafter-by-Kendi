const AIR_OPTICS: {[key: number]: string} = {
  150: 'Normalna',
  300: 'Dobra',
  450: 'Wyjątkowa',
};

export function displayAirOptics(optics: number) {
  const opticsValues = Object.keys(AIR_OPTICS).map((key) => Number(key)).sort();

  for (let i = 0; i < opticsValues.length; i++) {
    if (optics < opticsValues[i]) {
      if(i === 0) {
        return `Przeciętna (${optics})`;
      }

      return `${AIR_OPTICS[opticsValues[i - 1]]} (${optics})`;
    }
  }

  return AIR_OPTICS[optics] || optics;
}
