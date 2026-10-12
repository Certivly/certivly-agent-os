# Multi-File Refactor: Add Role Field

Update the user management module across multiple files:
1. In `src/types.ts`, add an optional `role?: 'admin' | 'user'` property to `UserRecord`.
2. In `src/service.ts`, add a method `getUsersByRole(role: 'admin' | 'user'): UserRecord[]` that returns all matching users.
3. In `src/index.ts`, ensure all types and services remain properly exported.
