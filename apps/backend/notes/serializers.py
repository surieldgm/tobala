from rest_framework import serializers

from .models import Context, Note, NoteLink, NoteTag, Tag, normalize_tag_name


class ContextSerializer(serializers.ModelSerializer):
    note_count = serializers.IntegerField(read_only=True, required=False)

    class Meta:
        model = Context
        fields = ["id", "name", "color", "description", "created", "note_count"]
        read_only_fields = ["id", "created", "note_count"]

    def validate_name(self, value: str) -> str:
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("name cannot be empty")
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            qs = Context.objects.filter(owner=request.user, name__iexact=value)
            if self.instance is not None:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError(
                    "you already have a context with that name"
                )
        return value


class TagSerializer(serializers.ModelSerializer):
    note_count = serializers.IntegerField(read_only=True, required=False)

    class Meta:
        model = Tag
        fields = ["id", "name", "created", "note_count"]
        read_only_fields = ["id", "created", "note_count"]

    def validate_name(self, value: str) -> str:
        normalized = normalize_tag_name(value)
        if not normalized:
            raise serializers.ValidationError("tag name is empty after normalization")
        return normalized


class NoteTagSerializer(serializers.Serializer):
    """Flat representation used inside :class:`NoteSerializer`.

    Front-end code reads ``{id, name, source, confidence}`` per tag and
    styles system-source chips differently.
    """

    id = serializers.IntegerField(source="tag.id")
    name = serializers.CharField(source="tag.name")
    source = serializers.CharField()
    confidence = serializers.FloatField(allow_null=True)


class NoteSerializer(serializers.ModelSerializer):
    context = ContextSerializer(read_only=True)
    context_id = serializers.PrimaryKeyRelatedField(
        queryset=Context.objects.all(),
        source="context",
        write_only=True,
        allow_null=True,
        required=False,
    )
    tags = serializers.SerializerMethodField()

    class Meta:
        model = Note
        fields = [
            "id",
            "owner",
            "title",
            "body",
            "context",
            "context_id",
            "tags",
            "created",
            "edited",
            "embedding_status",
            "embedding_error",
        ]
        read_only_fields = [
            "id",
            "owner",
            "created",
            "edited",
            "embedding_status",
            "embedding_error",
            "tags",
        ]

    def get_tags(self, obj: Note) -> list[dict]:
        return NoteTagSerializer(
            obj.note_tags.select_related("tag").all(), many=True
        ).data

    def validate_context_id(self, value):
        """Ensure the requested context belongs to the current user."""
        request = self.context.get("request")
        if value is None:
            return value
        if request and request.user.is_authenticated and value.owner_id != request.user.id:
            raise serializers.ValidationError("not your context")
        return value


class NoteLinkSerializer(serializers.ModelSerializer):
    class Meta:
        model = NoteLink
        fields = [
            "id",
            "source",
            "target",
            "label",
            "context",
            "status",
            "created_by",
            "confidence",
            "created",
        ]
        # ``created_by`` + ``confidence`` are set by the LLM pipeline for
        # proposals and should never be mutated over the wire. ``status``
        # transitions go through the dedicated accept/reject actions, not
        # a PATCH, so it's read-only here too.
        read_only_fields = [
            "id",
            "created",
            "status",
            "created_by",
            "confidence",
        ]

    def validate(self, attrs):
        request = self.context.get("request")
        source = attrs.get("source")
        target = attrs.get("target")

        if source and target and source.pk == target.pk:
            raise serializers.ValidationError("source and target must differ.")

        if request and request.user.is_authenticated:
            if source and source.owner_id != request.user.id:
                raise serializers.ValidationError({"source": "not owned by you."})
            if target and target.owner_id != request.user.id:
                raise serializers.ValidationError({"target": "not owned by you."})

        return attrs


class ProposalSummarySerializer(serializers.ModelSerializer):
    """Flat shape for the ProposalsInbox feed.

    Differs from :class:`NoteLinkSerializer` by embedding source/target
    titles directly so the inbox can render a row without a second round-trip
    per edge. Excludes ``context`` (unused in the tray) to keep the payload
    small for the count-only badge query.
    """

    source_title = serializers.CharField(source="source.title", read_only=True)
    target_title = serializers.CharField(source="target.title", read_only=True)

    class Meta:
        model = NoteLink
        fields = [
            "id",
            "source",
            "target",
            "source_title",
            "target_title",
            "label",
            "status",
            "created_by",
            "confidence",
            "created",
        ]
        read_only_fields = fields


class SuggestionSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    title = serializers.CharField()
    # Mirrors the structured NoteSerializer.context nesting so the frontend
    # Suggestions panel can color each row with the owning context's palette.
    context = ContextSerializer(allow_null=True)
    score = serializers.FloatField()


class InspiredNoteSerializer(serializers.Serializer):
    """Side-channel prompt — a note the user hasn't written but probably should.

    Hand-typed by the retrieval LLM; never shown inside the grounded answer.
    ``suggested_tags`` are pre-applied as user-source tags when the frontend's
    "Write this" button creates the note, so the user rarely has to tag them
    manually.
    """

    title = serializers.CharField()
    why = serializers.CharField()
    suggested_tags = serializers.ListField(child=serializers.CharField())


class AnswerSerializer(serializers.Serializer):
    """Strictly-grounded answer envelope returned by ``/api/retrieval/ask/``."""

    answer = serializers.CharField(allow_blank=True)
    cited_note_ids = serializers.ListField(child=serializers.IntegerField())
    missing_knowledge = serializers.ListField(child=serializers.CharField())
    inspired_notes = InspiredNoteSerializer(many=True)


class AskRequestSerializer(serializers.Serializer):
    question = serializers.CharField(min_length=1, max_length=2000, trim_whitespace=True)
