// Payment screenshots: picked from the photo library, shrunk on the phone, then
// uploaded. A phone screenshot is 1-4 MB as PNG; at 1000 px on the long side
// and JPEG quality 0.5 it is 60-150 KB and the reference and amount are still
// easy to read. Re-encoding also drops location and camera data.
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

/** The receipts bucket refuses anything bigger. */
export const RECEIPT_MAX_BYTES = 300 * 1024;

// Tried in order until the file fits.
const PASSES = [
  { side: 1000, quality: 0.5 },
  { side: 800, quality: 0.35 },
  { side: 640, quality: 0.3 },
];

/** Resize target that keeps the aspect ratio, or null when the image is already small enough. */
export function fitWithin(width: number, height: number, maxSide: number): { width: number } | { height: number } | null {
  if (Math.max(width, height) <= maxSide) return null;
  return width >= height ? { width: maxSide } : { height: maxSide };
}

async function byteSize(uri: string) {
  const res = await fetch(uri);
  return (await res.blob()).size;
}

/** Returns a local JPEG URI under RECEIPT_MAX_BYTES. */
export async function compressReceipt(uri: string, width: number, height: number): Promise<{ uri: string; bytes: number }> {
  let last = { uri, bytes: Infinity };
  for (const pass of PASSES) {
    const ctx = ImageManipulator.manipulate(uri);
    const resize = fitWithin(width, height, pass.side);
    if (resize) ctx.resize(resize);
    const image = await ctx.renderAsync();
    const saved = await image.saveAsync({ compress: pass.quality, format: SaveFormat.JPEG });
    last = { uri: saved.uri, bytes: await byteSize(saved.uri) };
    if (last.bytes <= RECEIPT_MAX_BYTES) return last;
  }
  throw new Error('This image is too large. Try a screenshot instead of a photo.');
}

/** Lets the user pick a screenshot and returns it compressed, or null if they cancel. */
export async function pickReceipt(): Promise<{ uri: string; bytes: number } | null> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;
  return compressReceipt(asset.uri, asset.width, asset.height);
}
