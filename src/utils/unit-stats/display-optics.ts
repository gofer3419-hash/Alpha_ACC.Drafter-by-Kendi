const OPTICS: {[key: number]: string} = {
  42.45: 'Słaba',
  63.675: 'Przeciętna',
  84.9: 'Normalna',
  127.35: 'Dobra',
  191.025: 'Bardzo dobra',
  233.475: 'Wyjątkowa',
};

export function displayOptics(optics: number) {
  const opticsValues = Object.keys(OPTICS).map((key) => Number(key));
  for (let i = 0; i < opticsValues.length; i++) {
    if (optics < opticsValues[i]) {
      if(i === 0) {
        return `Słaba (${optics})`;
      }

      return `${OPTICS[opticsValues[i - 1]]} (${optics})`;
    }
  }

  return OPTICS[optics] || optics;
}
