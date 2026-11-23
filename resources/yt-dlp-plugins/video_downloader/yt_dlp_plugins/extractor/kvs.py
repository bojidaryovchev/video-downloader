"""Fixes for yt-dlp's generic handling of KVS (Kernel Video Sharing) sites.

yt-dlp recognises KVS player pages by their kt_player.js script and reads the
player config from a `var flashvars = {...}` block. Two variations break that:

1. Renamed config. Newer KVS player builds (seen with 2.7.x, e.g. x-fetish.tube)
   give the config a random name on every page load, such as
   `var tb8695283b1 = {...}`, and pass it to `kt_player(...)`. The data inside
   is unchanged, but yt-dlp fails with "Unable to extract flashvars". We read
   the real name from the kt_player() call and rename that declaration to
   `flashvars` before deferring to yt-dlp's own implementation.

2. Embedded video. A KVS site can show a video hosted on another site through
   an iframe in its player slot, `<div class="embed-wrap"><iframe src=...>`
   (seen on old camwhores.tv videos embedded from camvideos.org). The embed
   page only renders its player when the parent page is the Referer, so yt-dlp
   finds no video on either page and reports "Unsupported URL". When nothing
   else was found on a page, we follow that iframe with the page as Referer.

3. Ad clips. yt-dlp scans a page for embedded videos before it looks for a
   KVS player, and stops at the first it finds. On x-x-x.tube that is an
   autoplaying ad in a <video> tag, which yt-dlp then downloads in place of
   the real video, with no error. When a page loads kt_player.js we try the
   KVS player first, and fall back to yt-dlp's usual order if that fails.

Pages that match none of these patterns pass through untouched.
"""

import re

from yt_dlp.extractor.generic import GenericIE
from yt_dlp.utils import ExtractorError, smuggle_url, unsmuggle_url

# This class replaces GenericIE in place. It must never be registered as an
# extractor of its own: it matches every URL and would shadow site extractors.
__all__ = []

_JS_STRING = r'''(?:'[^']*'|"[^"]*")'''

# kt_player('kt_player', 'https://.../kt_player.swf?v=2.7.11', '100%', '100%', tb8695283b1)
_KT_PLAYER_CALL_RE = re.compile(
    rf'\bkt_player\s*\(\s*(?:{_JS_STRING}\s*,\s*){{4}}(?P<name>[A-Za-z_$][\w$]*)\s*\)')

# What yt-dlp's own _extract_kvs looks for.
_FLASHVARS_RE = re.compile(r'\bvar\s+flashvars\s*=')

# <script src="https://x-x-x.tube/player/kt_player.js?v=11.9.13.2"> (absolute or relative)
_KT_PLAYER_SCRIPT_RE = re.compile(r'''<script\b[^>]+?\bsrc=["'][^"']*/kt_player\.js\?v=\d''')

# Sites whose <title>, which yt-dlp uses as the video title, wraps it in SEO text,
# while og:title holds it alone. x-x-x.tube:
#   <title>Watch Ivy Nox They Say Three S A Party XXX Porn Video in HD | X-X-X.tube
#   og:title: Ivy Nox They Say Three S A Party
_OG_TITLE_SITES_RE = re.compile(r'https?://(?:www\.)?x-x-x\.tube/')

# <div class="embed-wrap" style="..."><iframe width="800" src="https://www.camvideos.org/embed/58927"
_EMBED_WRAP_RE = re.compile(
    r'''<div[^>]+class=["'][^"']*\bembed-wrap\b[^"']*["'][^>]*>\s*'''
    r'''<iframe\b[^>]*?\bsrc=["'](?P<url>https?://[^"']+)["']''')


class _KVSGenericIE(GenericIE, plugin_name='kvs'):
    def _extract_kvs(self, url, webpage, *args, **kwargs):
        if not _FLASHVARS_RE.search(webpage):
            call = _KT_PLAYER_CALL_RE.search(webpage)
            if call:
                name = call.group('name')
                self.write_debug(f'KVS player config is named {name!r}; reading it as flashvars')
                webpage = re.sub(
                    rf'\b(?:var|let|const)\s+{re.escape(name)}\s*=',
                    'var flashvars =', webpage, count=1)
        info = super()._extract_kvs(url, webpage, *args, **kwargs)
        if _OG_TITLE_SITES_RE.match(url):
            info['title'] = self._og_search_title(webpage, default=None) or info['title']
        return info

    def _extract_embeds(self, url, webpage, *args, **kwargs):
        page_url, smuggled = unsmuggle_url(url, {})
        if _KT_PLAYER_SCRIPT_RE.search(webpage):
            try:
                return [self._extract_kvs(page_url, webpage, self._generic_id(page_url))]
            except ExtractorError as e:
                self.write_debug(f'KVS player found but unusable ({e.orig_msg}); scanning for embeds')

        embeds = list(super()._extract_embeds(url, webpage, *args, **kwargs))
        # Only as a last resort, and only one level deep: a page we reached by
        # following an embed carries a smuggled Referer.
        if embeds or smuggled.get('referer'):
            return embeds
        embed = _EMBED_WRAP_RE.search(webpage)
        if not embed:
            return embeds
        embed_url = embed.group('url')
        self.write_debug(f'Video is embedded from {embed_url}; following it with this page as Referer')
        # Transparent: formats and id come from the embed, while title and
        # webpage_url stay this page's (the embed's own title reads "... / Embed Player").
        return [self.url_result(
            smuggle_url(embed_url, {'referer': page_url, 'to_generic': True}), 'Generic',
            url_transparent=True)]
