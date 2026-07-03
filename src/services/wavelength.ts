import type { MeasurementPoint, WavelengthFitResult } from "../types";

const THEORY_NM = 632.8;

function round(value: number, digits = 4) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : 0;
}

export function parseCsvTable(text: string): MeasurementPoint[] {
  return text
    .split(/\r?\n/)
    .map((line, index) => {
      const [n, d] = line.split(/,|\t|，|\s+/).map((item) => Number(item.trim()));
      return Number.isFinite(n) && Number.isFinite(d) ? { id: `P${index + 1}`, n, d } : null;
    })
    .filter(Boolean) as MeasurementPoint[];
}

const t95Table: Record<number, number> = {
  1: 12.706,
  2: 4.303,
  3: 3.182,
  4: 2.776,
  5: 2.571,
  6: 2.447,
  7: 2.365,
  8: 2.306,
  9: 2.262,
  10: 2.228,
  11: 2.201,
  12: 2.179,
  13: 2.16,
  14: 2.145,
  15: 2.131,
  16: 2.12,
  17: 2.11,
  18: 2.101,
  19: 2.093,
  20: 2.086
};

function t95(df: number) {
  if (df <= 20) return t95Table[Math.max(1, Math.round(df))] ?? 2.306;
  return 1.96;
}

function formatFinal(value: number, uncertainty: number) {
  const digits = uncertainty >= 10 ? 0 : uncertainty >= 1 ? 1 : 2;
  return `λ = (${value.toFixed(digits)} ± ${uncertainty.toFixed(digits)}) nm`;
}

export function fitWavelength(points: MeasurementPoint[], instrumentBmm = 0.0005): WavelengthFitResult | null {
  const valid = points.filter((point): point is { id: string; n: number; d: number } => Number.isFinite(point.n) && typeof point.d === "number" && Number.isFinite(point.d));
  if (valid.length < 3) return null;

  const count = valid.length;
  const meanN = valid.reduce((sum, point) => sum + point.n, 0) / count;
  const meanD = valid.reduce((sum, point) => sum + point.d, 0) / count;
  const sxx = valid.reduce((sum, point) => sum + (point.n - meanN) ** 2, 0);
  const sxy = valid.reduce((sum, point) => sum + (point.n - meanN) * (point.d - meanD), 0);
  const slope = sxy / sxx;
  const intercept = meanD - slope * meanN;

  const residuals = valid.map((point) => {
    const predicted = slope * point.n + intercept;
    return { ...point, predicted, residual: point.d - predicted, standardized: 0 };
  });
  const sse = residuals.reduce((sum, point) => sum + point.residual ** 2, 0);
  const sst = valid.reduce((sum, point) => sum + (point.d - meanD) ** 2, 0);
  const sd = Math.sqrt(sse / Math.max(1, count - 2));
  const normalized = residuals.map((point) => ({ ...point, standardized: sd ? point.residual / sd : 0 }));

  // 斜率单位为 mm/条纹，λ=2a；1 mm = 1e6 nm。
  const wavelengthNm = 2 * slope * 1_000_000;
  const sm = sd / Math.sqrt(sxx);
  const df = count - 2;
  const tValue = t95(df);
  const uma = tValue * sm;
  const maxNDeviation = Math.max(...valid.map((point) => Math.abs(point.n - meanN))) || 1;
  const umb = (Math.sqrt(3) / 2) * (instrumentBmm / maxNDeviation);
  const um = Math.sqrt(uma ** 2 + umb ** 2);
  const typeAUncertaintyNm = 2 * uma * 1_000_000;
  const typeBUncertaintyNm = 2 * umb * 1_000_000;
  const combinedUncertaintyNm = 2 * um * 1_000_000;
  const relativeErrorPercent = Math.abs((wavelengthNm - THEORY_NM) / THEORY_NM) * 100;

  const outlierIds = normalized
    .filter((point) => Math.abs(point.standardized) > 2 || Math.abs(point.residual) > Math.max(sd * 1.8, 0.0004))
    .map((point) => point.id);
  const sorted = [...valid].sort((a, b) => a.n - b.n);
  const intervals = sorted.slice(1).map((point, index) => point.d - sorted[index].d);
  const averageInterval = intervals.reduce((sum, item) => sum + item, 0) / Math.max(1, intervals.length);
  const intervalWarnings = intervals
    .map((interval, index) =>
      Math.abs(interval - averageInterval) > Math.max(Math.abs(averageInterval) * 0.35, 0.0005)
        ? `第 ${index + 1} 组与第 ${index + 2} 组的 d 增量不够一致，建议检查是否漏数条纹、读数记录错误或中途反向转动。`
        : ""
    )
    .filter(Boolean);

  return {
    slope: round(slope, 8),
    intercept: round(intercept, 6),
    r2: round(1 - sse / sst, 5),
    wavelengthNm: round(wavelengthNm, 2),
    relativeErrorPercent: round(relativeErrorPercent, 3),
    residualSumSquares: round(sse, 10),
    sd: round(sd, 8),
    sm: round(sm, 10),
    tValue: round(tValue, 3),
    uma: round(uma, 10),
    umb: round(umb, 10),
    um: round(um, 10),
    uLambdaNm: round(combinedUncertaintyNm, 2),
    residuals: normalized.map((point) => ({
      ...point,
      predicted: round(point.predicted, 6),
      residual: round(point.residual, 6),
      standardized: round(point.standardized, 3)
    })),
    typeAUncertaintyNm: round(typeAUncertaintyNm, 2),
    typeBUncertaintyNm: round(typeBUncertaintyNm, 2),
    combinedUncertaintyNm: round(combinedUncertaintyNm, 2),
    outlierIds,
    intervalWarnings,
    finalExpression: formatFinal(wavelengthNm, combinedUncertaintyNm)
  };
}
