// Läser en uppladdad bild och skalar ner den till en rimlig data-URL. Data-URL:en
// lagras i IndexedDB (lokalt läge) eller skickas till servern (serverläge), så vi
// håller nere storleken (maxDim + JPEG).

export async function fileToDataUrl(file: File, maxDim = 1000): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Kunde inte behandla bilden");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  // Behåll ev. transparens för PNG, annars JPEG för mindre storlek.
  const isPng = file.type === "image/png";
  return canvas.toDataURL(isPng ? "image/png" : "image/jpeg", 0.82);
}
