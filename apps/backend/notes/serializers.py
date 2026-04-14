from rest_framework import serializers

from .models import Note, NoteLink


class NoteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Note
        fields = ["id", "owner", "title", "body", "category", "created", "edited"]
        read_only_fields = ["id", "owner", "created", "edited"]


class NoteLinkSerializer(serializers.ModelSerializer):
    class Meta:
        model = NoteLink
        fields = ["id", "source", "target", "label", "context", "created"]
        read_only_fields = ["id", "created"]

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


class SuggestionSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    title = serializers.CharField()
    category = serializers.CharField()
    score = serializers.FloatField()
