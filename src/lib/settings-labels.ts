import { t, type Locale } from './i18n';

/**
 * Field labels for the settings validation errors. Keep this server-side and
 * inject the result as JSON so the client bundle does not need every
 * translation.
 */
export function buildSettingsLabels(locale: Locale): Record<string, string> {
  const label = (key: string) => t(locale, key);

  return {
    'name.en': label('admin.settings.nameEn'),
    'name.bn': label('admin.settings.nameBn'),
    'tagline.en': label('admin.settings.taglineEn'),
    'tagline.bn': label('admin.settings.taglineBn'),
    logo: label('admin.settings.logoLabel'),
    theme: label('admin.settings.theme'),
    'shipping.zone': label('admin.settings.zone'),
    'shipping.zoneId': label('admin.settings.zoneId'),
    'shipping.zoneLabelEn': label('admin.settings.zoneLabelEn'),
    'shipping.zoneLabelBn': label('admin.settings.zoneLabelBn'),
    'shipping.zoneFee': label('admin.settings.zoneFee'),
    'shipping.fallbackZone': label('admin.settings.fallbackZone'),
    'shipping.freeShippingOver': label('admin.settings.freeShippingOver'),
    'shipping.districtZone': label('admin.settings.districtZones'),
    payments: label('admin.settings.payments'),
    'payments.cod': label('admin.settings.cod'),
    'payments.bkash': label('admin.settings.bkash'),
    'payments.nagad': label('admin.settings.nagad'),
    'payments.enabled': label('admin.settings.enabledLabel'),
    'payments.number': label('admin.settings.walletNumber'),
    'payments.type': label('admin.settings.walletType'),
    'payments.qr': label('admin.settings.walletQr'),
    'images.address': label('admin.settings.imageAddress'),
    'inventory.lowStockThreshold': label('admin.settings.lowStockThreshold'),
    'contact.phone': label('admin.settings.phone'),
    'contact.email': label('admin.settings.email'),
    'contact.address.en': label('admin.settings.addressEn'),
    'contact.address.bn': label('admin.settings.addressBn'),
    'social.facebook': label('admin.settings.facebook'),
    'social.messenger': label('admin.settings.messenger'),
    'social.whatsapp': label('admin.settings.whatsapp'),
    'social.instagram': label('admin.settings.instagram'),
    home_sections: label('admin.settings.sections'),
    'fraud.enabled': label('admin.settings.fraudEnabled'),
    'fraud.orderLimitPerPhone24h': label('admin.settings.fraudPhoneLimit'),
    'fraud.orderLimitPerIp24h': label('admin.settings.fraudIpLimit'),
    'fraud.advancePaymentForFlaggedPhones': label('admin.settings.fraudAdvance'),
  };
}