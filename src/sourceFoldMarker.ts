import type { Locale } from './host/bridge';

export function sourceFoldMarker(open: boolean, locale: Locale) {
  const marker = document.createElement('span');
  marker.className = 'jg-fold-marker';
  marker.title = locale === 'zh-CN'
    ? open ? '折叠此行' : '展开此行'
    : open ? 'Fold line' : 'Unfold line';
  const ns = 'http://www.w3.org/2000/svg';
  const icon = document.createElementNS(ns, 'svg');
  icon.setAttribute('width', '12');
  icon.setAttribute('height', '12');
  icon.setAttribute('viewBox', '0 0 12 12');
  icon.setAttribute('aria-hidden', 'true');
  const chevron = document.createElementNS(ns, 'path');
  chevron.setAttribute('d', open ? 'M3 4.5 6 7.5 9 4.5' : 'M4.5 3 7.5 6 4.5 9');
  chevron.setAttribute('fill', 'none');
  chevron.setAttribute('stroke', 'currentColor');
  chevron.setAttribute('stroke-width', '1.4');
  chevron.setAttribute('stroke-linecap', 'round');
  chevron.setAttribute('stroke-linejoin', 'round');
  icon.append(chevron);
  marker.append(icon);
  return marker;
}
