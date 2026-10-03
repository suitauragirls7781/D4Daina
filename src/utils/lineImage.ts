// The photo for a bag or order line: the photo of the colour the shopper chose, else the product's first photo.
type Line = {
  product?: { images?: string[]; image?: string; colors?: Array<{ name?: string; imageUrl?: string }> };
  selectedColor?: { name?: string; imageUrl?: string } | null;
};

export const lineImage = (item: Line): string => {
  const chosen = String(item.selectedColor?.name || '').trim().toLowerCase();
  const match = chosen ? (item.product?.colors || []).find((c) => String(c?.name || '').trim().toLowerCase() === chosen) : undefined;
  return item.selectedColor?.imageUrl || match?.imageUrl || item.product?.images?.[0] || item.product?.image || '';
};
