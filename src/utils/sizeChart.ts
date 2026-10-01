/**
 * The store's one size chart (garment measurements in inches), used by the Size Guide page, the size-guide
 * popup and "Find my size", so the numbers can never disagree. Each size is 2" bigger than the one before;
 * 4XL and 5XL follow the same grading.
 */
export interface SizeRow {
  size: string;
  bust: number;
  waist: number;
  hips: number;
  kurtaLength: number;
  bottomLength: number;
  shoulder: number;
}

export const SIZE_CHART: SizeRow[] = [
  { size: 'XS', bust: 34, waist: 28, hips: 38, kurtaLength: 44, bottomLength: 38, shoulder: 13.5 },
  { size: 'S', bust: 36, waist: 30, hips: 40, kurtaLength: 45, bottomLength: 38, shoulder: 14 },
  { size: 'M', bust: 38, waist: 32, hips: 42, kurtaLength: 45, bottomLength: 38.5, shoulder: 14.5 },
  { size: 'L', bust: 40, waist: 34, hips: 44, kurtaLength: 46, bottomLength: 39, shoulder: 15 },
  { size: 'XL', bust: 42, waist: 36, hips: 46, kurtaLength: 46, bottomLength: 39, shoulder: 15.5 },
  { size: 'XXL', bust: 44, waist: 38, hips: 48, kurtaLength: 47, bottomLength: 39.5, shoulder: 16 },
  { size: '3XL', bust: 46, waist: 40, hips: 50, kurtaLength: 47, bottomLength: 39.5, shoulder: 16.5 },
  { size: '4XL', bust: 48, waist: 42, hips: 52, kurtaLength: 48, bottomLength: 40, shoulder: 17 },
  { size: '5XL', bust: 50, waist: 44, hips: 54, kurtaLength: 48, bottomLength: 40, shoulder: 17.5 },
];

export const inchesToCm = (inches: number) => Math.round(inches * 2.54);

/** Size whose garment bust fits a body bust (inches) with ~2" of ease; the largest size when bigger than the chart. */
export const sizeForBust = (bodyBustInches: number, ease = 2) => {
  const needed = bodyBustInches + ease;
  return (SIZE_CHART.find((row) => row.bust >= needed - 0.5) || SIZE_CHART[SIZE_CHART.length - 1]).size;
};
