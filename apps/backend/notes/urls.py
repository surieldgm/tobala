from rest_framework.routers import DefaultRouter

from .views import NoteLinkViewSet, NoteViewSet

router = DefaultRouter()
router.register("notes", NoteViewSet, basename="note")
router.register("links", NoteLinkViewSet, basename="notelink")

urlpatterns = router.urls
