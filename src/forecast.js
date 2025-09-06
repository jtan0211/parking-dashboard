export function holtWintersAdditive(y, seasonLen = 24, alpha = 0.3, beta = 0.1, gamma = 0.3, h = 24) {
  if (y.length < seasonLen * 2) throw new Error("Need at least 2 seasons of history");

  // Initialize level, trend, season
  const meanFirstSeason = y.slice(0, seasonLen).reduce((a,b)=>a+b,0)/seasonLen;
  const meanSecondSeason = y.slice(seasonLen, 2*seasonLen).reduce((a,b)=>a+b,0)/seasonLen;

  let L = y[seasonLen];
  let T = meanSecondSeason - meanFirstSeason;

  const S = new Array(seasonLen);
  for (let i=0;i<seasonLen;i++) S[i] = y[i] - meanFirstSeason;

  const fitted = [];
  for (let t=0; t<y.length; t++) {
    const sIdx = t % seasonLen;
    const prevL = L, prevT = T, prevS = S[sIdx];
    const yhat = prevL + prevT + prevS;
    fitted.push(yhat);
    L = alpha * (y[t] - prevS) + (1 - alpha) * (prevL + prevT);
    T = beta  * (L - prevL) + (1 - beta) * prevT;
    S[sIdx] = gamma * (y[t] - L) + (1 - gamma) * prevS;
  }

  const pred = [];
  for (let k=1;k<=h;k++) {
    const s = S[(y.length + k - 1) % seasonLen];
    pred.push(L + k*T + s);
  }
  return { fitted, pred };
}
