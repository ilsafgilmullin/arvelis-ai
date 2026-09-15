import type { ReactNode } from 'react';
import type { TransportResultMetadata } from './transportResultMetadata';

type TransportAttribution = TransportResultMetadata['attribution'];

/**
 * Official Yandex Rasp monochrome banner endpoint from the documented /copyright/
 * response contract. We reference the provider-hosted banner directly instead of
 * copying or modifying provider artwork and never render provider-supplied HTML.
 */
export const YANDEX_RASP_COPYRIGHT_BANNER_URL = 'https://yandex.st/rasp/media/apicc/copyright_vert_mono.html';

function safeHttpsHref(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}

export function YandexRaspCopyrightBanner() {
  return <iframe
    className="travel-provider-attribution__official-banner"
    src={YANDEX_RASP_COPYRIGHT_BANNER_URL}
    title="Яндекс Расписания"
    width="240"
    height="130"
    loading="lazy"
    referrerPolicy="no-referrer"
    sandbox=""
    tabIndex={-1}
  />;
}

/**
 * Presentation-only attribution for normalized provider results.
 * `banner` must be a trusted local React asset/component; provider HTML is never
 * accepted or rendered here. A required-but-missing banner stays visibly marked in
 * the DOM so activation cannot be confused with completed attribution.
 */
export function TransportProviderAttribution({ attribution, banner }: {
  attribution: TransportAttribution;
  banner?: ReactNode;
}) {
  if (!attribution.required) return null;
  const href = safeHttpsHref(attribution.url);
  const bannerState = attribution.bannerRequired ? (banner ? 'ready' : 'pending') : 'not-required';

  return <aside
    className="travel-provider-attribution"
    aria-label={`Источник транспортных данных: ${attribution.providerName}`}
    data-placement={attribution.placement}
    data-banner-state={bannerState}
  >
    {banner ? <div className="travel-provider-attribution__banner" aria-hidden="true">{banner}</div> : null}
    {href
      ? <a href={href} target="_blank" rel="noopener noreferrer">{attribution.text}</a>
      : <span>{attribution.text}</span>}
  </aside>;
}

/**
 * Yandex-specific fail-closed wrapper. If metadata no longer matches the reviewed
 * provider identity/link contract, the official banner is withheld and the generic
 * component remains in `pending` banner state.
 */
export function YandexRaspProviderAttribution({ attribution }: { attribution: TransportAttribution }) {
  const reviewedYandexMetadata = attribution.providerName === 'Яндекс Расписания'
    && attribution.url === 'https://rasp.yandex.ru/'
    && attribution.bannerRequired;

  return <TransportProviderAttribution
    attribution={attribution}
    banner={reviewedYandexMetadata ? <YandexRaspCopyrightBanner /> : undefined}
  />;
}
