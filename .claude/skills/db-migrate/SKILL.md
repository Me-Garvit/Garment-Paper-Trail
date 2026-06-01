---
description: Apply database schema changes for this project
---

# Database Migration

## Critical: Alembic is NOT used for this deployment

Tables were created directly in Supabase via SQL in Session 4. Running `alembic upgrade head` will conflict unless stamped. Do not use Alembic.

## How to apply schema changes

Use the Supabase MCP tool `mcp__supabase__apply_migration` directly.

```
mcp__supabase__apply_migration(sql="<your SQL here>")
```

## JSONB fields — no migration needed

Most new fields go into existing `metadata_` JSONB columns. Adding a new key to JSONB requires **no migration** — just update the Python code that reads/writes that column. Only use `apply_migration` when adding a new table, a new typed column, a new index, or a new enum value.

## Supabase project

- Project URL: `https://srvotqeocszxdtubnilq.supabase.co`
- Tables: `buyer_pos`, `suppliers`, `supplier_pos`, `grns`, `supplier_invoices`, `style_supplier_rooms`
- All tables have a `style_number` indexed column as the primary anchor (except `suppliers`)

## Pattern for new tables

```sql
CREATE TABLE new_table (
    id bigserial PRIMARY KEY,
    style_number text NOT NULL REFERENCES buyer_pos(style_number) ON DELETE CASCADE,
    -- ... other typed columns ...
    metadata_ jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_new_table_style_number ON new_table(style_number);
```

Always add the `style_number` index. Always include a `metadata_` JSONB column for flexible fields.

## After applying a migration

Run `mcp__supabase__list_tables` to confirm the change landed, then restart the backend.
