from django.utils.cache import add_never_cache_headers

API_PREFIX = "/api/"


class ApiNeverCacheMiddleware:
    """Marks every API response as not cacheable (`Cache-Control: no-store`, `private`, …).

    The same data is changed from the web app and from phones, so a response kept by a
    browser, the phone's HTTP stack or a proxy would show one device an outdated state of
    what another device just changed. It's financial data, too: nothing should be stored
    on disk by an HTTP cache. Clients learn cheaply whether to reload from
    GET /api/sync/status/ instead.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if request.path.startswith(API_PREFIX) and not response.has_header("Cache-Control"):
            add_never_cache_headers(response)
        return response
