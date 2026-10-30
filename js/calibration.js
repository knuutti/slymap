/* Fits a map's calib (see coords.js) to reference points: places where
 * both the image pixel and the in-game position are known.
 *
 *   [u, v] = the game [x, y] turned by the calib's flip and rotate
 *   pixelX = originX + scale * u
 *   pixelY = originY + scale * v          (pixels from the top-left)
 *
 * Least squares over both axes at once, tried for every way the map can
 * be turned or mirrored; the closest fit wins. Needs two points that are
 * not in the same spot, and a third to tell the orientations apart. */

import { createOrientation } from './coords.js';

// flip "x" is flip "y" turned 180 degrees, so these cover every case
const ORIENTATIONS = [undefined, 'y'].flatMap((flip) =>
  [0, 90, 180, 270].map((rotate) => ({ flip, rotate })));

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

/* The fit for one orientation, or null if the points don't spread. */
function fitOrientation(points, orientation) {
  const turned = points.map((p) => createOrientation(orientation).toImage(p.game));
  const gx = turned.map(([u]) => u);
  const gy = turned.map(([, v]) => v);
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
  const residuals = points.map((_, i) => Math.hypot(
    origin[0] + scale * gx[i] - px[i],
    origin[1] + scale * gy[i] - py[i]));
  return {
    origin, scale, ...orientation, residuals,
    scaleX: axisScale(gx, px), scaleY: axisScale(gy, py),
  };
}

/* points: [{ pixel: [x, y], game: [x, y] }]
 * Returns null with fewer than two usable points, otherwise
 * { origin, scale, flip, rotate, residuals (pixels, per point), meanError, maxError, warnings } */
export function fitCalibration(points) {
  if (points.length < 2) {
    return null;
  }
  const fits = ORIENTATIONS.map((orientation) => fitOrientation(points, orientation))
    .filter((fit) => fit?.scale > 0)
    .map((fit) => ({ ...fit, meanError: mean(fit.residuals), maxError: Math.max(...fit.residuals) }));
  if (!fits.length) {
    return null;
  }
  // ties (e.g. points on a line) keep the earlier, plainer orientation
  const { scaleX, scaleY, ...fit } = fits.reduce((best, candidate) =>
    candidate.meanError < best.meanError - 1e-6 ? candidate : best);

  const warnings = [];
  if (fit.flip || fit.rotate) {
    warnings.push(`The game axes are ${[fit.flip && 'mirrored', fit.rotate && `turned ${fit.rotate}°`]
      .filter(Boolean).join(' and ')} compared to the image; the snippet includes this.`);
  }
  // the site assumes both axes grow at the same rate
  if (scaleX !== null && scaleY !== null && points.length >= 3 && Math.abs(scaleX / scaleY - 1) > 0.05) {
    warnings.push(`X and Y fit different scales (${scaleX.toPrecision(3)} vs ${scaleY.toPrecision(3)} px per unit). ` +
      'The image may be stretched, or a point is off.');
  }
  if (points.length == 2) {
    warnings.push("Two points can't tell whether the map is turned or mirrored. Add a third, away from the line between them, to check the result.");
  }

  return { ...fit, warnings };
}

/* "2717, -3297", "2717 -3297 -104" or "X: 2717 ; Y: -3297" -> [2717, -3297] */
export function parseGamePosition(text) {
  const numbers = String(text).match(/-?\d+(?:\.\d+)?/g);
  return numbers && numbers.length >= 2 ? [Number(numbers[0]), Number(numbers[1])] : null;
}

/* Values as they go into games.json */
export function roundCalibration({ origin, scale, flip, rotate }) {
  return {
    origin: origin.map((value) => Math.round(value * 10) / 10),
    scale: Number(scale.toPrecision(5)),
    ...(flip ? { flip } : {}),
    ...(rotate ? { rotate } : {}),
  };
}
