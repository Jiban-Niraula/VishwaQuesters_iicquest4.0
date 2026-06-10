export function money(value, currency = 'NRS') {
  const number = Number(value || 0);
  return `${currency} ${number.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export function dateTime(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

export function compactDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString();
}

export function mediaUrl(url, uploadBase) {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${uploadBase}${url.startsWith('/') ? url : `/${url}`}`;
}
