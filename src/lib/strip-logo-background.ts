import sharp from 'sharp';

/**
 * Removes a near-solid dark/navy rectangular backdrop from a logo so it
 * composites cleanly on the hub chrome. Accepts data URLs or absolute http(s)
 * URLs; other values are returned unchanged.
 */
export async function stripLogoBackground(source: string): Promise<string> {
  const trimmed = source.trim();
  if (!trimmed) return trimmed;

  let input: Buffer;
  if (trimmed.startsWith('data:image/')) {
    const comma = trimmed.indexOf(',');
    if (comma < 0) return trimmed;
    input = Buffer.from(trimmed.slice(comma + 1), 'base64');
  } else if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const res = await fetch(trimmed);
      if (!res.ok) return trimmed;
      input = Buffer.from(await res.arrayBuffer());
    } catch {
      return trimmed;
    }
  } else if (trimmed.startsWith('/')) {
    // Public path — leave as-is; file may already be cleaned on disk.
    return trimmed;
  } else {
    return trimmed;
  }

  try {
    const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({
      resolveWithObject: true,
    });
    const { width, height, channels } = info;
    if (channels < 4 || width * height === 0) return trimmed;

    // Sample near-opaque corner-ish pixels to detect a solid plate color.
    const samples: number[][] = [];
    const probe = (x: number, y: number) => {
      const i = (y * width + x) * channels;
      const a = data[i + 3];
      if (a > 200) samples.push([data[i], data[i + 1], data[i + 2]]);
    };
    const insetX = Math.max(2, Math.floor(width * 0.08));
    const insetY = Math.max(2, Math.floor(height * 0.08));
    probe(insetX, insetY);
    probe(width - 1 - insetX, insetY);
    probe(insetX, height - 1 - insetY);
    probe(width - 1 - insetX, height - 1 - insetY);
    probe(Math.floor(width / 2), insetY);
    probe(insetX, Math.floor(height / 2));

    if (samples.length === 0) return trimmed;

    const bg = samples
      .reduce(
        (acc, s) => [acc[0] + s[0], acc[1] + s[1], acc[2] + s[2]],
        [0, 0, 0]
      )
      .map((v) => Math.round(v / samples.length));

    // Only strip if the plate looks like a dark solid (not a light/photo logo).
    const bgLum = 0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2];
    if (bgLum > 90) return trimmed;

    const out = Buffer.from(data);
    let changed = 0;
    for (let i = 0; i < out.length; i += channels) {
      const r = out[i];
      const g = out[i + 1];
      const b = out[i + 2];
      const a = out[i + 3];
      if (a === 0) continue;
      const dr = r - bg[0];
      const dg = g - bg[1];
      const db = b - bg[2];
      const d = Math.sqrt(dr * dr + dg * dg + db * db);
      if (d < 28) {
        out[i + 3] = 0;
        changed++;
        continue;
      }
      if (d < 55) {
        out[i + 3] = Math.round(a * ((d - 28) / 27));
        changed++;
      }
    }

    if (changed < width * height * 0.05) return trimmed;

    const png = await sharp(out, { raw: { width, height, channels: 4 } })
      .png()
      .toBuffer();
    return `data:image/png;base64,${png.toString('base64')}`;
  } catch {
    return trimmed;
  }
}
