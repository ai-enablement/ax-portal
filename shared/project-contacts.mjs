export function normalizeContactEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function isContactEmail(value) {
  const email = normalizeContactEmail(value);
  return email.length <= 254 && /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(email);
}

export function emailFromPartyLabel(label) {
  return normalizeContactEmail(String(label || '').split('·').find(part => part.includes('@')));
}
