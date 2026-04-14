-- Preload Apache AGE and pgvector extensions
CREATE EXTENSION IF NOT EXISTS age;
LOAD 'age';
SET search_path = ag_catalog, "$user", public;

CREATE EXTENSION IF NOT EXISTS vector;

-- Create default graph for tests
SELECT ag_catalog.create_graph('default_graph');
