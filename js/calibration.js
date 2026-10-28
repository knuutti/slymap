/* Fits a map's calib (see coords.js) to reference points: places where
 * both the image pixel and the in-game position are known.
 *
 *   pixelX = originX + scale * gameX
 *   pixelY = originY + scale * gameY      (pixels from the top-left)
 *
 * Least squares over both axes at once; needs two points that are not in
 * the same spot. */

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/* Scale fitted on one axis alone, or null if the points don't spread on it. */
function axisScale(game, pixel) {
  const gameMean = mean(game);
  const pixelMean = mean(pixel);
  let covariance = 0;
  let variance = 0;
  game.forEach((value, i) => {
    covariance += (value - gameMean) * (pixel[i] - pixelMean);
    variance += (value - gameMean) ** 2;
  });
  return variance > 1e-9 ? covariance / variance : null;
}

/* points: [{ pixel: [x, y], game: [x, y] }]
 * Returns null with fewer than two usable points, otherwise
 * { origin, scale, residuals (pixels, per point), meanError, maxError, warnings } */
export function fitCalibration(points) {
  if (points.length < 2) {
    return null;
  }
  const gx = points.map((p) => p.game[0]);
  const gy = points.map((p) => p.game[1]);
  const px = points.map((p) => p.pixel[0]);
  const py = points.map((p) => p.pixel[1]);
  const [gxMean, gyMean, pxMean, pyMean] = [gx, gy, px, py].map(mean);

  let covariance = 0;
  let variance = 0;
  points.forEach((_, i) => {
    covariance += (gx[i] - gxMean) * (px[i] - pxMean) + (gy[i] - gyMean) * (py[i] - pyMean);
    variance += (gx[i] - gxMean) ** 2 + (gy[i] - gyMean) ** 2;
  });
  if (variance < 1e-9) {
    return null;
  }

  const scale = covariance / variance;
  const origin = [pxMean - scale * gxMean, pyMean - scale * gyMean];
  const residuals = points.map((p) => Math.hypot(
    origin[0] + scale * p.game[0] - p.pixel[0],
    origin[1] + scale * p.game[1] - p.pixel[1]));

  const warnings = [];
  if (scale <= 0) {
    warnings.push('The scale came out negative: check that the in-game X and Y are entered the right way round.');
  }
  // the site assumes both axes grow the same way at the same rate
  const scaleX = axisScale(gx, px);
  const scaleY = axisScale(gy, py);
  if (scaleX !== null && scaleY !== null) {
    if (Math.sign(scaleX) !== Math.sign(scaleY)) {
      warnings.push(`One axis looks mirrored (X fits ${scaleX.toPrecision(3)}, Y fits ${scaleY.toPrecision(3)} px per unit). ` +
        'Check the signs of the in-game coordinates; the site cannot show mirrored maps yet.');
    } else if (points.length >= 3 && Math.abs(scaleX / scaleY - 1) > 0.05) {
      warnings.push(`X and Y fit different scales (${scaleX.toPrecision(3)} vs ${scaleY.toPrecision(3)} px per unit). ` +
        'The image may be stretched, or a point is off.');
    }
  }
  if (points.length == 2) {
    warnings.push('Two points always fit exactly. Add a third, away from the line between them, to check the result.');
  }

  return {
    origin,
    scale,
    residuals,
    meanError: mean(residuals),
    maxError: Math.max(...residuals),
    warnings,
  };
}

/* "2717, -3297", "2717 -3297 -104" or "X: 2717 ; Y: -3297" -> [2717, -3297] */
export function parseGamePosition(text) {
  const numbers = String(text).match(/-?\d+(?:\.\d+)?/g);
  return numbers && numbers.length >= 2 ? [Number(numbers[0]), Number(numbers[1])] : null;
}

/* Values as they go into games.json */
export function roundCalibration({ origin, scale }) {
  return {
    origin: origin.map((value) => Math.round(value * 10) / 10),
    scale: Number(scale.toPrecision(5)),
  };
}
