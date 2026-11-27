let messages: Record<string, string> | null = null;

function readMessages(): Record<string, string> {
  if (messages) return messages;

  const node = document.getElementById('admin-error-messages');
  if (!node?.textContent) {
    messages = {};
    return messages;
  }

  try {
    const parsed = JSON.parse(node.textContent) as unknown;
    messages =
      typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? (parsed as Record<string, string>)
        : {};
  } catch {
    messages = {};
  }

  return messages;
}

export function adminErrorMessage(code: string | undefined, fallback: string): string {
  if (!code) return fallback;
  return readMessages()[code] ?? fallback;
}
