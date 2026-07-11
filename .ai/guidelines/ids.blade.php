Use auto-incrementing IDs for all migrations and tables in this project.

- Prefer Laravel's `$table->id()` convention for primary and related keys.
- Never use UUIDs or ULIDs for primary keys or foreign keys unless the user explicitly requests an exception.
- When adding new tables or relationships, keep IDs integer-based and auto-incrementing.
