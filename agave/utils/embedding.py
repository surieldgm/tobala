"""
Pluggable embedding providers — stub for Phase 3.

Will provide an ABC for embedding providers (OpenAI,
SentenceTransformers, Ollama) and a factory function.
"""

from abc import ABC, abstractmethod


class EmbeddingProvider(ABC):
    """Abstract base class for embedding providers."""

    @abstractmethod
    def embed(self, text):
        """Generate an embedding vector for a single text."""

    @abstractmethod
    def embed_batch(self, texts):
        """Generate embedding vectors for a batch of texts."""


def get_provider():
    """
    Get the configured embedding provider.
    Phase 3: reads from AGAVE['EMBEDDING_PROVIDER'] setting.
    """
    from agave.conf import agave_settings

    provider_path = agave_settings.EMBEDDING_PROVIDER
    if provider_path is None:
        raise RuntimeError(
            "No embedding provider configured. "
            "Set AGAVE['EMBEDDING_PROVIDER'] in your Django settings."
        )
    # Phase 3: import and instantiate the provider class
    raise NotImplementedError("Embedding providers are not yet implemented.")
