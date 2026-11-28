export interface SettingsIssue {
  path: string;
  message: string;
}

/**
 * Turns a validation path into a human field name. The labels are supplied by
 * the page (bn/en); unknown paths fall back to the raw path plus the message.
 */
export function labelForPath(path: string, labels: Record<string, string>): string {
  if (labels[path]) return labels[path];

  const zone = path.match(/^shipping\.zones\.(\d+)\.(fee|label\.en|label\.bn|id)$/);
  if (zone) {
    const fieldKey =
      zone[2] === 'fee'
        ? 'shipping.zoneFee'
        : zone[2] === 'id'
          ? 'shipping.zoneId'
          : zone[2] === 'label.en'
            ? 'shipping.zoneLabelEn'
            : 'shipping.zoneLabelBn';
    const zoneLabel = labels['shipping.zone'] ?? 'Zone';
    return `${zoneLabel} #${Number(zone[1]) + 1}: ${labels[fieldKey] ?? fieldKey}`;
  }

  const district = path.match(/^shipping\.districtZones\.(.+)$/);
  if (district) {
    return `${labels['shipping.districtZone'] ?? 'District zone'} (${district[1]})`;
  }

  const payment = path.match(/^payments\.(bkash|nagad|cod)\.(number|type|qr|enabled)$/);
  if (payment) {
    const wallet = labels[`payments.${payment[1]}`] ?? payment[1];
    const field = labels[`payments.${payment[2]}`];
    return field ? `${wallet} ${field}` : wallet;
  }

  if (path === 'home_sections' || path.startsWith('home_sections.')) {
    return labels.home_sections ?? 'home_sections';
  }

  return path;
}

/** One “Field name: problem” line per issue, in the order the server sent them. */
export function formatIssues(
  issues: readonly SettingsIssue[],
  labels: Record<string, string>,
): string[] {
  return issues.map((issue) => `${labelForPath(issue.path, labels)}: ${issue.message}`);
}
