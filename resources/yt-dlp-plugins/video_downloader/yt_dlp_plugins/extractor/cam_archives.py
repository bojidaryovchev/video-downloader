"""Webcam show archive sites whose videos sit on third-party file hosts.

yt-dlp has no extractor for these sites, nor for the file hosts they embed:

* archivebate.live
* livecamrips.to. Cloudflare rejects yt-dlp's default HTTP client here, so
  its pages are requested with browser impersonation.

Each page embeds its video from a file host in an iframe. The hosts hop
between domains (livecamrips reaches MixDrop through throwaway domains such
as mdzsmutpcvykb.net), so a host is recognised by its player page, not by
its URL:

* MixDrop: a packed (p,a,c,k,e,d) script sets MDCore.wurl to a direct MP4.
  Its file server answers 403 when the Referer is the embedding site, but
  accepts MixDrop's own player page.
* Uqload, and other XFileSharing-style hosts: a packed script sets up JW
  Player with `sources: [{file: "...m3u8"}]`.
* Streamcash: `window.__PCr` holds base64 JSON whose `src` is an HLS playlist.

Titles read "<model> <platform> show <date> <time>", with dashes in the time
because Windows forbids ':' in file names.
"""

import base64
import re

from yt_dlp.extractor.common import InfoExtractor
from yt_dlp.utils import (
    PACKED_CODES_RE,
    ExtractorError,
    decode_packed_codes,
    float_or_none,
    unified_timestamp,
    urljoin,
)

# Every host seen so far serves its player from /e/<id>, /embed/<id> or /embed-<id>.html.
_PLAYER_IFRAME_RE = (
    r'''<iframe[^>]+?\bsrc=["'](?P<url>(?:https?:)?//[^"']+/(?:e/|embed[/-])[^"']+)["']''')


def _show_title(show):
    return show and f'{show["model"]} {show["platform"]} show {show["when"].replace(":", "-")}'


class _HostedVideoIE(InfoExtractor):
    """Base for sites that embed their video from a file host; not an extractor itself."""

    def _extract_hosted_video(self, webpage, video_id, page_url):
        embed_url = self._search_regex(
            _PLAYER_IFRAME_RE, webpage, 'player iframe', default=None, group='url')
        if not embed_url:
            raise ExtractorError(
                'This page has no video player; the video may have been removed', expected=True)

        player_page, urlh = self._download_webpage_handle(
            self._proto_relative_url(embed_url), video_id, 'Downloading player page',
            headers={'Referer': page_url})
        player_url = urlh.url  # after any domain hop
        referer = {'Referer': player_url}
        packed = decode_packed_codes(player_page) if re.search(PACKED_CODES_RE, player_page) else ''

        # MixDrop
        video_url = self._search_regex(r'MDCore\.wurl\s*=\s*"([^"]+)"', packed, 'video URL', default=None)
        if video_url:
            return {
                'url': self._proto_relative_url(video_url),
                'ext': 'mp4',
                # A 4x4 grid of frames: only used when the site has no still of its own.
                'thumbnail': self._proto_relative_url(self._search_regex(
                    r'MDCore\.poster\s*=\s*"([^"]+)"', packed, 'thumbnail', default=None)),
                'http_headers': referer,
            }

        # XFileSharing-style JW Player setups: packed on Uqload, plain script on abstream
        for script in (packed, player_page):
            video_url = self._search_regex(
                r'sources\s*:\s*\[\s*\{\s*file\s*:\s*"([^"]+)"', script, 'video URL', default=None)
            if video_url:
                return {
                    'formats': self._hosted_formats(video_url, video_id, referer),
                    'thumbnail': self._search_regex(
                        r'\bimage\s*:\s*"([^"]+)"', script, 'thumbnail', default=None),
                    'duration': float_or_none(self._search_regex(
                        r'\bduration\s*:\s*"?([\d.]+)', script, 'duration', default=None)),
                    'http_headers': referer,
                }

        # Streamcash
        config = self._search_regex(
            r'''__PCr\s*=\s*['"]([A-Za-z0-9+/=]+)['"]''', player_page, 'player config', default=None)
        config = self._parse_json(base64.b64decode(config).decode(), video_id) if config else {}
        if config.get('src'):
            return {
                'formats': self._hosted_formats(config['src'], video_id, referer),
                'thumbnail': urljoin(player_url, config.get('pst')),
                'http_headers': referer,
            }

        # e.g. vinovo: the stream URL is only handed out in exchange for a reCAPTCHA token.
        if re.search(r'google\.com/recaptcha/|grecaptcha', player_page):
            raise ExtractorError(
                f'This video host requires a CAPTCHA, which the downloader cannot pass: {player_url}',
                expected=True)
        raise ExtractorError(f'Unsupported video host: {player_url}', expected=True)

    def _hosted_formats(self, video_url, video_id, headers):
        if '.m3u8' in video_url:
            return self._extract_m3u8_formats(video_url, video_id, 'mp4', m3u8_id='hls', headers=headers)
        return [{'url': video_url}]


class ArchivebateIE(_HostedVideoIE):
    _VALID_URL = r'https?://(?:www\.)?archivebate\.[a-z]+/watch/(?P<id>\d+)'

    def _real_extract(self, url):
        video_id = self._match_id(url)
        webpage = self._download_webpage(url, video_id)
        hosted = self._extract_hosted_video(webpage, video_id, url)

        # og:description reads "<model> <platform> show on 2025-08-04 23:20:19 - ..."
        show = re.match(
            r'(?P<model>\S+)\s+(?P<platform>\S+)\s+show on\s+(?P<when>\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?)',
            self._og_search_description(webpage, default=None) or '')
        return {
            **hosted,
            'id': video_id,
            'title': _show_title(show) or self._og_search_title(webpage, default=None) or video_id,
            'uploader': self._search_regex(
                r'href="[^"]*/profile/([^"/?#]+)"', webpage, 'uploader', default=show and show['model']),
            'timestamp': unified_timestamp(show['when']) if show else None,
            'thumbnail': self._og_search_thumbnail(webpage, default=None) or hosted.get('thumbnail'),
            'age_limit': 18,
        }


class LiveCamRipsIE(_HostedVideoIE):
    _VALID_URL = r'https?://(?:www\.)?livecamrips\.[a-z]+/video/(?P<id>\d+)'

    def _real_extract(self, url):
        video_id = self._match_id(url)
        webpage = self._download_webpage(url, video_id, impersonate=True)
        hosted = self._extract_hosted_video(webpage, video_id, url)

        # <h1><a href=".../model/168809/Love-Banaxy/1"> Love-Banaxy </a> - Stripchat - 2026-11-23 11:49</h1>
        show = re.search(
            r'<h1[^>]*>\s*<a[^>]+/model/[^>]+>\s*(?P<model>[^<]+?)\s*</a>\s*-\s*(?P<platform>[^<]+?)'
            r'\s*-\s*(?P<when>\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?)', webpage)
        return {
            **hosted,
            'id': video_id,
            'title': _show_title(show) or self._html_extract_title(webpage) or video_id,
            'uploader': show and show['model'],
            'timestamp': unified_timestamp(show['when']) if show else None,
            'age_limit': 18,
        }
