async function resizeToWebp(file: File, maxWidth = 400): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxWidth / bitmap.width);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable');

  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the logo'))),
      'image/webp',
      0.85,
    );
  });
}

export async function uploadBrandLogo(file: File): Promise<string> {
  const blob = await resizeToWebp(file);
  const form = new FormData();
  form.append('logo', new File([blob], 'logo.webp', { type: 'image/webp' }));

  const response = await fetch('/api/admin/settings/logo', {
    method: 'POST',
    body: form,
    credentials: 'same-origin',
  });
  const payload = (await response.json().catch(() => null)) as {
    ok?: boolean;
    data?: { url?: string };
  } | null;

  if (!response.ok || !payload?.ok || !payload.data?.url) {
    throw new Error('Logo upload failed');
  }
  return payload.data.url;
}
