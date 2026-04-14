# 🌵 django-agave — Architecture Document

## Vision

**django-agave** es un OGM (Object-Graph Mapper) para Django que unifica tres
paradigmas de datos bajo una sola API Pythonic:

| Paradigma | Motor | Extensión PG |
|-----------|-------|--------------|
| Relacional | Django ORM nativo | — |
| Grafos | Apache AGE | `age` |
| Vectorial | pgvector | `vector` |

La filosofía de diseño es: **si sabes usar el ORM de Django, ya sabes usar agave.**

---

## 1. Package Structure

```
django-agave/
├── pyproject.toml
├── README.md
├── LICENSE
├── docs/
│   ├── quickstart.md
│   ├── graph-models.md
│   ├── vector-search.md
│   ├── hybrid-queries.md
│   └── migrations.md
├── tests/
│   ├── conftest.py
│   ├── test_models/
│   ├── test_fields/
│   ├── test_managers/
│   ├── test_queries/
│   ├── test_migrations/
│   └── test_backends/
└── agave/
    ├── __init__.py              # Public API exports
    ├── apps.py                  # Django AppConfig
    ├── conf.py                  # agave settings + defaults
    │
    ├── models/
    │   ├── __init__.py          # Re-exports GraphModel, Edge
    │   ├── base.py              # GraphModel (extends django.db.models.Model)
    │   ├── edges.py             # Edge base class + EdgeEndpoint descriptor
    │   ├── fields.py            # VectorField, GraphProperty, EmbeddingField
    │   ├── options.py           # GraphMeta (graph_name, edge_labels, etc.)
    │   └── constraints.py       # GraphUniqueConstraint, VectorIndexConstraint
    │
    ├── db/
    │   ├── __init__.py
    │   ├── backends/
    │   │   └── postgresql/
    │   │       ├── __init__.py
    │   │       ├── base.py      # DatabaseWrapper (extends PG backend)
    │   │       ├── creation.py  # Ensures AGE + pgvector on createdb
    │   │       ├── schema.py    # SchemaEditor for graph DDL
    │   │       ├── operations.py # AGE SQL helpers
    │   │       └── introspection.py
    │   │
    │   ├── queries/
    │   │   ├── __init__.py
    │   │   ├── router.py        # QueryRouter: decides compiler path
    │   │   ├── cypher.py        # CypherCompiler: Django lookups → Cypher
    │   │   ├── vector.py        # VectorCompiler: similarity → pgvector SQL
    │   │   ├── hybrid.py        # HybridCompiler: combines both
    │   │   ├── expressions.py   # CypherExpression, VectorDistance, etc.
    │   │   └── result.py        # GraphResult, PathResult mappers
    │   │
    │   └── functions/
    │       ├── __init__.py
    │       ├── graph.py         # ShortestPath, AllPaths, Degree, etc.
    │       └── vector.py        # CosineSimilarity, L2Distance, InnerProduct
    │
    ├── managers/
    │   ├── __init__.py
    │   ├── graph.py             # GraphManager + GraphQuerySet
    │   └── vector.py            # VectorManager + VectorQuerySet
    │
    ├── migrations/
    │   ├── __init__.py
    │   ├── operations.py        # CreateGraph, CreateVectorIndex, etc.
    │   ├── autodetector.py      # Extiende MigrationAutodetector de Django
    │   └── state.py             # GraphState para tracking
    │
    ├── contrib/
    │   ├── __init__.py
    │   ├── admin/
    │   │   ├── __init__.py
    │   │   ├── options.py       # GraphModelAdmin
    │   │   └── views.py         # Graph visualization endpoint
    │   ├── rest/
    │   │   ├── __init__.py
    │   │   ├── serializers.py   # GraphSerializer, EdgeSerializer
    │   │   └── viewsets.py      # GraphViewSet
    │   └── celery/
    │       ├── __init__.py
    │       └── tasks.py         # Batch embedding generation
    │
    └── utils/
        ├── __init__.py
        ├── connection.py        # AGE connection helpers
        ├── cypher_ast.py        # Cypher AST builder
        └── embedding.py         # Pluggable embedding providers
```

---

## 2. Core Components

### 2.1 Database Backend — `agave.db.backends.postgresql`

Extends Django's PostgreSQL backend to bootstrap AGE and pgvector on connection.

```python
# agave/db/backends/postgresql/base.py

from django.db.backends.postgresql import base as pg_base


class DatabaseWrapper(pg_base.DatabaseWrapper):
    """
    Custom PG backend that ensures Apache AGE and pgvector
    extensions are loaded at connection time.
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Register AGE + pgvector types on first connection
        self._agave_initialized = False

    def ensure_connection(self):
        super().ensure_connection()
        if not self._agave_initialized:
            self._init_age()
            self._init_pgvector()
            self._agave_initialized = True

    def _init_age(self):
        with self.connection.cursor() as cursor:
            cursor.execute("LOAD 'age';")
            cursor.execute(
                "SET search_path = ag_catalog, '$user', public;"
            )

    def _init_pgvector(self):
        with self.connection.cursor() as cursor:
            cursor.execute("CREATE EXTENSION IF NOT EXISTS vector;")
```

**Settings** (`settings.py` del proyecto Django):

```python
DATABASES = {
    'default': {
        'ENGINE': 'agave.db.backends.postgresql',
        'NAME': 'myproject',
        'HOST': 'localhost',
        'PORT': '5432',
    }
}

AGAVE = {
    'DEFAULT_GRAPH_NAME': 'default_graph',
    'VECTOR_DIMENSIONS': 1536,         # default embedding size
    'VECTOR_INDEX_TYPE': 'hnsw',       # hnsw | ivfflat
    'EMBEDDING_PROVIDER': 'agave.utils.embedding.OpenAIProvider',
    'EMBEDDING_MODEL': 'text-embedding-3-small',
    'AUTO_CREATE_GRAPH': True,
}
```

---

### 2.2 Models — `agave.models`

#### 2.2.1 GraphModel

```python
# agave/models/base.py

from django.db import models


class GraphMeta:
    """
    Metaclass options for graph models.
    Attributes populated from inner class Meta.
    """
    graph_name = None       # AGE graph name, defaults to app_label
    vertex_label = None     # Label in the graph, defaults to class name
    properties = []         # Fields that map to AGE vertex properties


class GraphModelBase(models.base.ModelBase):
    """
    Metaclass that:
    1. Extracts graph-specific Meta options
    2. Auto-attaches GraphManager and VectorManager
    3. Registers vertex label in global registry
    """
    def __new__(mcs, name, bases, namespace, **kwargs):
        cls = super().__new__(mcs, name, bases, namespace, **kwargs)
        if not cls._meta.abstract:
            cls._graph_meta = GraphMeta()
            # ... extract Meta options
            cls.graph = GraphManager()
            cls.graph.auto_created = True
            # Auto-attach VectorManager if model has VectorFields
            if any(isinstance(f, VectorField) for f in cls._meta.get_fields()):
                cls.vectors = VectorManager()
                cls.vectors.auto_created = True
        return cls


class GraphModel(models.Model, metaclass=GraphModelBase):
    """
    Base model for graph-enabled Django models.

    Stores data in BOTH:
    - PostgreSQL table (Django relational, as usual)
    - Apache AGE vertex (graph layer)

    Synchronization is transparent via signals.
    """

    class Meta:
        abstract = True

    class GraphMeta:
        """Override in subclasses to configure graph behavior."""
        graph_name = None
        vertex_label = None

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        # Sync to AGE graph layer
        self._sync_to_graph()

    def delete(self, *args, **kwargs):
        self._remove_from_graph()
        super().delete(*args, **kwargs)

    def _sync_to_graph(self):
        """Create/update the corresponding AGE vertex."""
        from agave.db.backends.postgresql.operations import upsert_vertex
        upsert_vertex(
            graph_name=self._graph_meta.graph_name,
            label=self._graph_meta.vertex_label,
            pk=self.pk,
            properties=self._get_graph_properties(),
        )

    def _get_graph_properties(self):
        """Extract property dict from model fields."""
        props = {'_django_pk': self.pk}
        for field in self._graph_meta.properties:
            props[field.name] = getattr(self, field.name)
        return props
```

#### 2.2.2 Edge

```python
# agave/models/edges.py

from django.db import models


class EdgeEndpoint:
    """Descriptor that defines an edge endpoint (source or target)."""

    def __init__(self, model, related_name=None):
        self.model = model
        self.related_name = related_name


class Edge(models.Model):
    """
    Base class for graph edges.
    Maps to BOTH a Django M2M-like table AND an AGE edge.
    """

    class Meta:
        abstract = True

    class EdgeMeta:
        edge_label = None   # AGE edge label, defaults to class name
        graph_name = None
        directed = True

    # Subclasses define source and target via EdgeEndpoint
    # Example:
    #   source = EdgeEndpoint(Document)
    #   target = EdgeEndpoint(Document)

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        self._sync_edge_to_graph()

    def _sync_edge_to_graph(self):
        from agave.db.backends.postgresql.operations import upsert_edge
        upsert_edge(
            graph_name=self._edge_meta.graph_name,
            label=self._edge_meta.edge_label,
            source_label=self.source._graph_meta.vertex_label,
            source_pk=self.source_id,
            target_label=self.target._graph_meta.vertex_label,
            target_pk=self.target_id,
            properties=self._get_edge_properties(),
        )
```

#### 2.2.3 Fields

```python
# agave/models/fields.py

from django.db import models


class VectorField(models.Field):
    """
    Stores a vector embedding using pgvector.
    Backed by the 'vector' column type in PostgreSQL.
    """

    def __init__(self, dimensions=1536, *args, **kwargs):
        self.dimensions = dimensions
        kwargs.setdefault('editable', False)
        super().__init__(*args, **kwargs)

    def db_type(self, connection):
        return f'vector({self.dimensions})'

    def from_db_value(self, value, expression, connection):
        if value is None:
            return value
        # pgvector returns '[0.1,0.2,...]' string
        return [float(x) for x in value.strip('[]').split(',')]

    def get_prep_value(self, value):
        if value is None:
            return value
        return f'[{",".join(str(v) for v in value)}]'

    def deconstruct(self):
        name, path, args, kwargs = super().deconstruct()
        kwargs['dimensions'] = self.dimensions
        return name, path, args, kwargs


class EmbeddingField(VectorField):
    """
    Auto-generates embeddings from a source text field.
    Uses the configured EMBEDDING_PROVIDER in AGAVE settings.
    """

    def __init__(self, source_field=None, *args, **kwargs):
        self.source_field = source_field
        super().__init__(*args, **kwargs)

    def pre_save(self, model_instance, add):
        if self.source_field:
            text = getattr(model_instance, self.source_field)
            if text:
                from agave.utils.embedding import get_provider
                provider = get_provider()
                embedding = provider.embed(text)
                setattr(model_instance, self.attname, embedding)
        return super().pre_save(model_instance, add)


class GraphProperty(models.Field):
    """
    Marker mixin to indicate a field should be synced
    to the AGE vertex properties.
    """
    graph_property = True
```

---

### 2.3 Managers — `agave.managers`

#### 2.3.1 GraphManager

```python
# agave/managers/graph.py

from django.db import models


class GraphQuerySet(models.QuerySet):
    """
    Extended QuerySet for graph operations.
    Chains seamlessly with standard Django filters.
    """

    def traverse(self, edge_label, depth=1, direction='outgoing'):
        """
        Traverse edges from the current result set.

        Usage:
            Document.graph.filter(title="ML Paper")
                .traverse("Cites", depth=3)
        """
        return self._clone(_traverse={
            'edge_label': edge_label,
            'depth': depth,
            'direction': direction,
        })

    def match(self, pattern):
        """
        Raw Cypher pattern match with Django model hydration.

        Usage:
            Document.graph.match("(a)-[:CITES*1..3]->(b)")
                .filter(b__year__gte=2020)
        """
        return self._clone(_cypher_pattern=pattern)

    def shortest_path(self, source, target, edge_label=None):
        """Find shortest path between two model instances."""
        from agave.db.queries.cypher import build_shortest_path
        return build_shortest_path(
            self.model, source, target, edge_label
        )

    def neighbors(self, instance, edge_label=None, depth=1):
        """Get all neighbors of a given node."""
        return self.traverse(edge_label, depth).filter(
            _source_pk=instance.pk
        )

    def subgraph(self, root, depth=2):
        """Extract a subgraph rooted at `root`."""
        return self._clone(_subgraph={
            'root_pk': root.pk,
            'depth': depth,
        })

    def path(self, source, target, **kwargs):
        """Return all paths between source and target."""
        from agave.db.queries.result import PathResult
        return PathResult(self.model, source, target, **kwargs)


class GraphManager(models.Manager):
    """
    Default manager for GraphModel. Provides graph operations
    alongside standard Django ORM methods.

    Usage:
        # Standard Django
        Document.objects.filter(title__contains="AI")

        # Graph traversal
        Document.graph.traverse("Cites", depth=3)

        # Combined
        Document.graph.filter(year__gte=2020).traverse("Cites")
    """

    def get_queryset(self):
        return GraphQuerySet(self.model, using=self._db)

    def traverse(self, *args, **kwargs):
        return self.get_queryset().traverse(*args, **kwargs)

    def match(self, *args, **kwargs):
        return self.get_queryset().match(*args, **kwargs)

    def shortest_path(self, *args, **kwargs):
        return self.get_queryset().shortest_path(*args, **kwargs)

    def neighbors(self, *args, **kwargs):
        return self.get_queryset().neighbors(*args, **kwargs)

    def subgraph(self, *args, **kwargs):
        return self.get_queryset().subgraph(*args, **kwargs)

    def create_edge(self, source, target, edge_model, **properties):
        """Convenience to create an edge between two vertices."""
        return edge_model.objects.create(
            source=source,
            target=target,
            **properties,
        )

    def bulk_create_edges(self, edges_data, edge_model):
        """Batch edge creation for performance."""
        from agave.db.backends.postgresql.operations import bulk_insert_edges
        return bulk_insert_edges(
            self.model._graph_meta.graph_name,
            edge_model,
            edges_data,
        )
```

#### 2.3.2 VectorManager

```python
# agave/managers/vector.py

from django.db import models


class VectorQuerySet(models.QuerySet):
    """QuerySet with vector similarity operations."""

    def similar_to(self, vector, top_k=10, distance='cosine'):
        """
        Find most similar items to the given vector.

        Usage:
            Document.vectors.similar_to(embedding, top_k=5)

        Distance metrics: 'cosine', 'l2', 'inner_product'
        """
        from agave.db.queries.vector import build_similarity_query
        return build_similarity_query(
            queryset=self,
            vector=vector,
            top_k=top_k,
            distance=distance,
        )

    def similar_to_text(self, text, top_k=10, distance='cosine'):
        """
        Embed text on-the-fly and find similar items.

        Usage:
            Document.vectors.similar_to_text(
                "machine learning optimization",
                top_k=5
            )
        """
        from agave.utils.embedding import get_provider
        provider = get_provider()
        vector = provider.embed(text)
        return self.similar_to(vector, top_k, distance)

    def with_distance(self):
        """Annotate results with their distance score."""
        from agave.db.functions.vector import CosineDistance
        return self.annotate(
            _vector_distance=CosineDistance(
                self.model._get_vector_field().name,
                self._similarity_vector,
            )
        )

    def rerank(self, query, top_k=None):
        """
        Apply a cross-encoder reranking step to the results.
        Requires a reranking model in AGAVE settings.
        """
        from agave.utils.embedding import get_reranker
        reranker = get_reranker()
        results = list(self)
        return reranker.rerank(query, results, top_k)


class VectorManager(models.Manager):
    """
    Manager for vector similarity search.
    Auto-attached to models with VectorField.
    """

    def get_queryset(self):
        return VectorQuerySet(self.model, using=self._db)

    def similar_to(self, *args, **kwargs):
        return self.get_queryset().similar_to(*args, **kwargs)

    def similar_to_text(self, *args, **kwargs):
        return self.get_queryset().similar_to_text(*args, **kwargs)
```

---

### 2.4 Query Engine — `agave.db.queries`

#### 2.4.1 CypherCompiler

```python
# agave/db/queries/cypher.py

"""
Translates Django-like lookups into openCypher queries
that run inside Apache AGE's `cypher()` SQL wrapper.

Django lookup          →  Cypher clause
──────────────────────────────────────────
.filter(year=2020)     →  WHERE n.year = 2020
.traverse("Cites", 3)  →  MATCH (n)-[:Cites*1..3]->(m)
.exclude(draft=True)   →  WHERE NOT n.draft = true
.order_by('-year')     →  ORDER BY n.year DESC
[:10]                  →  LIMIT 10
"""


class CypherNode:
    """AST node for building Cypher queries."""

    def __init__(self, alias, label=None, properties=None):
        self.alias = alias
        self.label = label
        self.properties = properties or {}


class CypherEdge:
    """AST node for edges."""

    def __init__(self, alias=None, label=None, min_depth=1, max_depth=1,
                 direction='outgoing'):
        self.alias = alias
        self.label = label
        self.min_depth = min_depth
        self.max_depth = max_depth
        self.direction = direction


class CypherCompiler:
    """
    Compiles a GraphQuerySet into a parameterized Cypher query
    wrapped in AGE's SQL function.
    """

    def __init__(self, queryset):
        self.queryset = queryset
        self.params = []
        self._match_clauses = []
        self._where_clauses = []
        self._return_clause = None
        self._order_by = []
        self._limit = None

    def compile(self):
        """
        Returns (sql, params) tuple.

        The SQL wraps Cypher inside AGE's cypher() function:
            SELECT * FROM cypher('graph_name', $$
                MATCH (n:Document)-[:Cites*1..3]->(m:Document)
                WHERE n._django_pk = $1
                RETURN m._django_pk
            $$) AS (pk agtype);
        """
        cypher = self._build_cypher()
        graph_name = self.queryset.model._graph_meta.graph_name

        sql = (
            f"SELECT * FROM cypher('{graph_name}', $$ "
            f"{cypher} "
            f"$$) AS ({self._build_return_columns()})"
        )
        return sql, self.params

    def _build_cypher(self):
        parts = []
        parts.append(f"MATCH {self._build_match_pattern()}")
        if self._where_clauses:
            parts.append(f"WHERE {' AND '.join(self._where_clauses)}")
        parts.append(f"RETURN {self._return_clause or 'n'}")
        if self._order_by:
            parts.append(f"ORDER BY {', '.join(self._order_by)}")
        if self._limit:
            parts.append(f"LIMIT {self._limit}")
        return ' '.join(parts)

    def _build_match_pattern(self):
        """Build MATCH pattern from queryset's traversal config."""
        # ... builds pattern like (n:Doc)-[:Cites*1..3]->(m:Doc)
        pass

    def _build_return_columns(self):
        """AGE requires typed column aliases."""
        return "pk agtype"
```

#### 2.4.2 VectorCompiler

```python
# agave/db/queries/vector.py

"""
Generates pgvector SQL for similarity queries.

Django call                                   →  SQL
──────────────────────────────────────────────────────────
.similar_to(vec, top_k=5)                     →  ORDER BY embedding <=> $1 LIMIT 5
.similar_to(vec, distance='l2')               →  ORDER BY embedding <-> $1 LIMIT 10
.similar_to(vec).filter(year__gte=2020)        →  WHERE year >= 2020 ORDER BY ... LIMIT ...
"""


DISTANCE_OPERATORS = {
    'cosine':        '<=>',   # cosine distance
    'l2':            '<->',   # euclidean distance
    'inner_product': '<#>',   # negative inner product
}


def build_similarity_query(queryset, vector, top_k=10, distance='cosine'):
    """
    Injects pgvector ordering into the queryset.
    Uses Django's .extra() or RawSQL annotation.
    """
    from django.db.models.expressions import RawSQL

    op = DISTANCE_OPERATORS[distance]
    vector_field = queryset.model._get_vector_field()
    field_col = vector_field.column

    # Annotate with distance
    qs = queryset.annotate(
        _vector_distance=RawSQL(
            f'"{field_col}" {op} %s::vector',
            [_format_vector(vector)],
            output_field=models.FloatField(),
        )
    )

    # Order by distance and limit
    qs = qs.order_by('_vector_distance')[:top_k]

    # Store reference for later chaining
    qs._similarity_vector = vector
    qs._similarity_distance = distance

    return qs


def _format_vector(vector):
    """Format Python list as pgvector literal."""
    return f'[{",".join(str(v) for v in vector)}]'
```

#### 2.4.3 HybridCompiler

```python
# agave/db/queries/hybrid.py

"""
Combines graph traversal results with vector similarity.

Use case: "Find documents similar to X that are within 3 citations
of document Y"

Strategy:
  1. Run Cypher query to get candidate PKs (graph filter)
  2. Run pgvector similarity on the candidate set
  3. Return merged result with both distance and path info
"""


class HybridCompiler:
    """
    Two-phase query:
    Phase 1: Graph traversal → set of candidate PKs
    Phase 2: Vector similarity on candidate set → ranked results
    """

    def __init__(self, graph_queryset, vector_config):
        self.graph_qs = graph_queryset
        self.vector_config = vector_config

    def compile(self):
        # Phase 1: Cypher
        cypher_compiler = CypherCompiler(self.graph_qs)
        cypher_sql, cypher_params = cypher_compiler.compile()

        # Phase 2: Vector similarity scoped to graph results
        vector_sql = self._build_vector_phase(cypher_sql)

        # Combine into a single SQL using CTE
        combined_sql = f"""
            WITH graph_candidates AS (
                {cypher_sql}
            )
            SELECT t.*, (t.{self.vector_config['field']}
                {DISTANCE_OPERATORS[self.vector_config['distance']]}
                %s::vector) AS _distance
            FROM {self.graph_qs.model._meta.db_table} t
            WHERE t.id IN (SELECT pk FROM graph_candidates)
            ORDER BY _distance
            LIMIT %s
        """
        params = cypher_params + [
            self.vector_config['vector'],
            self.vector_config['top_k'],
        ]
        return combined_sql, params
```

---

### 2.5 Migrations — `agave.migrations`

```python
# agave/migrations/operations.py

from django.db.migrations.operations.base import Operation


class CreateGraph(Operation):
    """Migration operation to create an AGE graph."""

    reversible = True

    def __init__(self, graph_name):
        self.graph_name = graph_name

    def state_forwards(self, app_label, state):
        pass

    def database_forwards(self, app_label, schema_editor, from_state, to_state):
        schema_editor.execute(
            f"SELECT create_graph('{self.graph_name}');"
        )

    def database_backwards(self, app_label, schema_editor, from_state, to_state):
        schema_editor.execute(
            f"SELECT drop_graph('{self.graph_name}', true);"
        )

    def describe(self):
        return f"Create AGE graph '{self.graph_name}'"


class CreateVertexLabel(Operation):
    """Create a vertex label in an AGE graph."""

    reversible = True

    def __init__(self, graph_name, label):
        self.graph_name = graph_name
        self.label = label

    def database_forwards(self, app_label, schema_editor, from_state, to_state):
        schema_editor.execute(
            f"SELECT create_vlabel('{self.graph_name}', '{self.label}');"
        )

    def database_backwards(self, app_label, schema_editor, from_state, to_state):
        schema_editor.execute(
            f"SELECT drop_vlabel('{self.graph_name}', '{self.label}');"
        )


class CreateEdgeLabel(Operation):
    """Create an edge label in an AGE graph."""
    reversible = True

    def __init__(self, graph_name, label):
        self.graph_name = graph_name
        self.label = label

    def database_forwards(self, app_label, schema_editor, from_state, to_state):
        schema_editor.execute(
            f"SELECT create_elabel('{self.graph_name}', '{self.label}');"
        )

    def database_backwards(self, app_label, schema_editor, from_state, to_state):
        schema_editor.execute(
            f"SELECT drop_elabel('{self.graph_name}', '{self.label}');"
        )


class CreateVectorIndex(Operation):
    """Create a pgvector HNSW or IVFFlat index."""

    reversible = True

    def __init__(self, model_name, field_name, index_type='hnsw',
                 lists=100, m=16, ef_construction=64):
        self.model_name = model_name
        self.field_name = field_name
        self.index_type = index_type
        self.lists = lists
        self.m = m
        self.ef_construction = ef_construction

    def database_forwards(self, app_label, schema_editor, from_state, to_state):
        model = to_state.apps.get_model(app_label, self.model_name)
        table = model._meta.db_table
        idx_name = f"{table}_{self.field_name}_vec_idx"

        if self.index_type == 'hnsw':
            sql = (
                f"CREATE INDEX {idx_name} ON {table} "
                f"USING hnsw ({self.field_name} vector_cosine_ops) "
                f"WITH (m = {self.m}, ef_construction = {self.ef_construction});"
            )
        else:  # ivfflat
            sql = (
                f"CREATE INDEX {idx_name} ON {table} "
                f"USING ivfflat ({self.field_name} vector_cosine_ops) "
                f"WITH (lists = {self.lists});"
            )
        schema_editor.execute(sql)

    def database_backwards(self, app_label, schema_editor, from_state, to_state):
        model = from_state.apps.get_model(app_label, self.model_name)
        table = model._meta.db_table
        idx_name = f"{table}_{self.field_name}_vec_idx"
        schema_editor.execute(f"DROP INDEX IF EXISTS {idx_name};")
```

---

### 2.6 Contrib — Admin & REST

#### Admin

```python
# agave/contrib/admin/options.py

from django.contrib import admin


class GraphModelAdmin(admin.ModelAdmin):
    """
    Admin class with graph visualization support.
    Adds:
    - Graph neighbor viewer in change_form
    - Edge management inline
    - Visual graph explorer (JS widget)
    """

    change_form_template = 'agave/admin/change_form.html'
    graph_depth = 2          # Default traversal depth in explorer
    graph_edge_labels = []   # Edge labels to show

    def get_graph_data(self, obj):
        """Return JSON subgraph for the admin widget."""
        subgraph = obj.__class__.graph.subgraph(obj, depth=self.graph_depth)
        return subgraph.to_json()
```

#### DRF Integration

```python
# agave/contrib/rest/serializers.py

from rest_framework import serializers


class GraphSerializer(serializers.ModelSerializer):
    """
    Serializer that includes graph relationships.
    Adds `_edges` and `_neighbors` fields.
    """
    _edges = serializers.SerializerMethodField()

    def get__edges(self, obj):
        depth = self.context.get('graph_depth', 1)
        edges = obj.__class__.graph.neighbors(obj, depth=depth)
        return EdgeSerializer(edges, many=True).data


class EdgeSerializer(serializers.Serializer):
    """Serializes edge data including properties."""
    source_id = serializers.IntegerField()
    target_id = serializers.IntegerField()
    label = serializers.CharField()
    properties = serializers.DictField()
    weight = serializers.FloatField(required=False)
```

---

## 3. Usage Examples

### 3.1 Model Definition

```python
# myapp/models.py

from django.db import models
from agave.models import GraphModel, Edge, EdgeEndpoint
from agave.models.fields import VectorField, EmbeddingField


class Author(GraphModel):
    name = models.CharField(max_length=200)
    affiliation = models.CharField(max_length=300)

    class GraphMeta:
        vertex_label = 'Author'


class Paper(GraphModel):
    title = models.CharField(max_length=500)
    abstract = models.TextField()
    year = models.IntegerField()

    # Vector search on abstract
    embedding = EmbeddingField(
        source_field='abstract',
        dimensions=1536,
    )

    class GraphMeta:
        vertex_label = 'Paper'
        properties = ['title', 'year']  # Synced to AGE vertex


class Cites(Edge):
    """A citation edge between two papers."""
    source = EdgeEndpoint(Paper, related_name='outgoing_citations')
    target = EdgeEndpoint(Paper, related_name='incoming_citations')
    context = models.TextField(blank=True)  # Citation context

    class EdgeMeta:
        edge_label = 'CITES'


class AuthoredBy(Edge):
    """Connects a paper to its authors."""
    source = EdgeEndpoint(Paper)
    target = EdgeEndpoint(Author)
    position = models.IntegerField(default=1)  # Author order

    class EdgeMeta:
        edge_label = 'AUTHORED_BY'
```

### 3.2 Migrations

```python
# myapp/migrations/0001_initial.py

from django.db import migrations, models
from agave.migrations.operations import (
    CreateGraph,
    CreateVertexLabel,
    CreateEdgeLabel,
    CreateVectorIndex,
)


class Migration(migrations.Migration):

    dependencies = []

    operations = [
        # Standard Django table creation
        migrations.CreateModel(
            name='Paper',
            fields=[
                ('id', models.AutoField(primary_key=True)),
                ('title', models.CharField(max_length=500)),
                ('abstract', models.TextField()),
                ('year', models.IntegerField()),
                ('embedding', VectorField(dimensions=1536)),
            ],
        ),

        # AGE graph setup
        CreateGraph('research'),
        CreateVertexLabel('research', 'Paper'),
        CreateVertexLabel('research', 'Author'),
        CreateEdgeLabel('research', 'CITES'),
        CreateEdgeLabel('research', 'AUTHORED_BY'),

        # Vector index
        CreateVectorIndex(
            model_name='Paper',
            field_name='embedding',
            index_type='hnsw',
            m=16,
            ef_construction=200,
        ),
    ]
```

### 3.3 Queries

```python
# Graph traversal — Find all papers cited by a paper, up to 3 hops
paper = Paper.objects.get(title="Attention Is All You Need")
cited = Paper.graph.neighbors(paper, edge_label="CITES", depth=3)

# Vector similarity — Find papers similar to a query
results = Paper.vectors.similar_to_text(
    "transformer architecture for NLP",
    top_k=10,
)

# Hybrid — Similar papers within citation graph
candidates = Paper.graph.traverse("CITES", depth=2).filter(
    _source_pk=paper.pk
)
similar_in_network = candidates.vectors.similar_to(
    paper.embedding,
    top_k=5,
)

# Path finding
path = Paper.graph.shortest_path(
    source=paper_a,
    target=paper_b,
    edge_label="CITES",
)

# Combined Django ORM + graph
recent_cited = (
    Paper.graph
    .neighbors(paper, edge_label="CITES")
    .filter(year__gte=2022)
    .order_by('-year')
)

# Subgraph extraction (for visualization)
subgraph = Paper.graph.subgraph(paper, depth=2)
graph_json = subgraph.to_json()  # d3-compatible format
```

### 3.4 Views (Django + DRF)

```python
# myapp/views.py

from rest_framework import viewsets
from agave.contrib.rest.serializers import GraphSerializer


class PaperViewSet(viewsets.ModelViewSet):
    queryset = Paper.objects.all()
    serializer_class = PaperSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        # Auto-filter by similarity if ?q= is present
        query = self.request.query_params.get('q')
        if query:
            qs = Paper.vectors.similar_to_text(query, top_k=20)
        return qs
```

---

## 4. Design Decisions

### 4.1 Dual Storage Strategy

Agave stores data in **both** the relational table and the AGE graph:

| Layer | Contains | Purpose |
|-------|----------|---------|
| PostgreSQL table | All fields | Full Django ORM compatibility |
| AGE vertex/edge | PK + graph properties | Fast traversal |
| pgvector column | Embeddings | Similarity search |

This means:
- `Paper.objects.filter(...)` → hits the relational table (Django native)
- `Paper.graph.traverse(...)` → hits AGE graph
- `Paper.vectors.similar_to(...)` → hits pgvector index
- Hybrid queries combine via CTEs

### 4.2 Why Extend Django's Backend?

Instead of wrapping raw `psycopg2`:
- Connection pooling and transaction management are inherited
- `manage.py migrate` works out of the box
- `TestCase` with `--keepdb` works
- AGE extension loading is transparent

### 4.3 Sync Strategy

Vertex/edge sync happens on `save()` and `delete()` via model method
overrides. This is safer than signals because:
- Order of execution is deterministic
- Errors propagate naturally
- Transaction boundaries are respected

For bulk operations, agave provides `bulk_create_edges()` and
`bulk_sync_vertices()` that use AGE's batch insert syntax.

### 4.4 Embedding Provider Architecture

```python
# agave/utils/embedding.py

from abc import ABC, abstractmethod


class EmbeddingProvider(ABC):
    """Pluggable embedding backend."""

    @abstractmethod
    def embed(self, text: str) -> list[float]:
        ...

    @abstractmethod
    def embed_batch(self, texts: list[str]) -> list[list[float]]:
        ...


class OpenAIProvider(EmbeddingProvider):
    """Uses OpenAI's embedding API."""
    ...

class SentenceTransformerProvider(EmbeddingProvider):
    """Uses local sentence-transformers model."""
    ...

class OllamaProvider(EmbeddingProvider):
    """Uses Ollama's local embedding endpoint."""
    ...
```

---

## 5. Roadmap

### Phase 1 — Foundation (MVP)
- [ ] Custom PostgreSQL backend with AGE + pgvector bootstrap
- [ ] `GraphModel` base class with vertex sync
- [ ] `Edge` base class with edge sync
- [ ] `VectorField` with pgvector column type
- [ ] Basic `GraphManager` (traverse, neighbors)
- [ ] Basic `VectorManager` (similar_to)
- [ ] Migration operations (CreateGraph, CreateVectorIndex)
- [ ] Test suite with pytest-django

### Phase 2 — Query Engine
- [ ] `CypherCompiler` with Django lookup translation
- [ ] `VectorCompiler` with distance annotations
- [ ] `HybridCompiler` (CTE-based combination)
- [ ] Path queries (shortest_path, all_paths)
- [ ] Subgraph extraction
- [ ] Raw Cypher escape hatch

### Phase 3 — DX & Ecosystem
- [ ] `EmbeddingField` with auto-generation
- [ ] Pluggable embedding providers (OpenAI, Ollama, ST)
- [ ] Django Admin integration with graph visualizer
- [ ] DRF serializers and viewsets
- [ ] `makemigrations` autodetection for graph changes
- [ ] Management commands (`agave_sync`, `agave_reindex`)

### Phase 4 — Performance & Scale
- [ ] Batch vertex/edge sync operations
- [ ] Async embedding generation (Celery tasks)
- [ ] Connection pooling optimizations for AGE
- [ ] Index tuning helpers (HNSW parameters)
- [ ] Query result caching layer
- [ ] Benchmarking suite
