# django-agave

A Django OGM (Object-Graph Mapper) that unifies relational, graph, and vector
paradigms under a single Pythonic API.

| Paradigm   | Engine          | PG Extension |
|------------|-----------------|--------------|
| Relational | Django ORM      | —            |
| Graph      | Apache AGE      | `age`        |
| Vector     | pgvector        | `vector`     |

**If you know how to use the Django ORM, you already know how to use agave.**

## Installation

```bash
pip install django-agave
```

## Quick Start

```python
# settings.py
DATABASES = {
    'default': {
        'ENGINE': 'agave.db.backends.postgresql',
        'NAME': 'myproject',
    }
}

INSTALLED_APPS = [
    # ...
    'agave',
]

AGAVE = {
    'DEFAULT_GRAPH_NAME': 'my_graph',
}
```

```python
# models.py
from django.db import models
from agave.models import GraphModel, Edge

class Paper(GraphModel):
    title = models.CharField(max_length=255)
    year = models.IntegerField()

    class GraphMeta:
        properties = ['title', 'year']

class Cites(Edge):
    source = models.ForeignKey(Paper, on_delete=models.CASCADE, related_name='citations_out')
    target = models.ForeignKey(Paper, on_delete=models.CASCADE, related_name='citations_in')

    class EdgeMeta:
        edge_label = 'CITES'
```

```python
# Query graph neighbors
Paper.graph.neighbors(paper, edge_label='CITES', depth=2)

# Vector similarity (requires VectorField on model)
Paper.vectors.similar_to(embedding_vector, top_k=10)
```

## Requirements

- Python 3.10+
- Django 4.2+
- PostgreSQL 15+ with Apache AGE 1.5+ and pgvector 0.5+

## License

MIT
