"""Load noodlemagazine.com pages with browser impersonation.

The site answers yt-dlp's default HTTP client with 403 Forbidden but serves the
same page to a client with a browser's TLS fingerprint. yt-dlp can impersonate
one (through curl_cffi, which the Windows build bundles), but its
NoodleMagazine extractor never asks to, so every link fails before extraction
starts. This override asks for it on the extractor's own requests.
"""

from yt_dlp.extractor.noodlemagazine import NoodleMagazineIE

# This class replaces NoodleMagazineIE in place; don't register it separately.
__all__ = []


class _ImpersonateNoodleMagazineIE(NoodleMagazineIE, plugin_name='impersonate'):
    def _request_webpage(self, *args, **kwargs):
        if kwargs.get('impersonate') is None:
            kwargs['impersonate'] = 'chrome'
        return super()._request_webpage(*args, **kwargs)
