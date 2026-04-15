from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    ContextViewSet,
    NoteLinkViewSet,
    NoteViewSet,
    RetrievalView,
    TagViewSet,
)

router = DefaultRouter()
router.register("notes", NoteViewSet, basename="note")
router.register("links", NoteLinkViewSet, basename="notelink")
router.register("contexts", ContextViewSet, basename="context")
router.register("tags", TagViewSet, basename="tag")

urlpatterns = [
    *router.urls,
    path("retrieval/ask/", RetrievalView.as_view(), name="retrieval-ask"),
]
