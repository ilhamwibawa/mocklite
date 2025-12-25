# MockLite

**Lightweight SQLite-based Mock Server with Faker.js Integration.**

MockLite is a zero-setup, configuration-driven mock server designed to help frontend developers prototype locally without a real backend. It uses an in-memory (or local file) SQLite database, auto-generates REST API routes based on a JSON config, and populates data using Faker.js.

## ✨ Features

- **Zero Boilerplate**: Just define a JSON config, and get a full CRUD API.
- **Auto-generated Data**: Integrated with [Faker.js](https://fakerjs.dev/) to seed realistic data.
- **Relational Support**: Supports `BelongsTo` and `HasMany` relationships via `fk:` definitions.
- **Rich Querying**: Supports filtering and relation expansion via `?include=...`.
- **Persistent/Reset Modes**: Database resets on restart to ensure a clean state (configurable).

## 🚀 Getting Started

### Installation

```bash
npm install -g mocklite
# OR run directly via npx/bun
npx mocklite init
```

### 1. Initialize Configuration

Run the init command to create a `mocklite.config.json` file in your project root:

```bash
mocklite init
```

### 2. Configure Your Schema

Edit `mocklite.config.json` to define your database tables and fields.

```json
{
  "port": 3000,
  "database": "sqlite",
  "schema": [
    {
      "table": "users",
      "seed": 10,
      "fields": {
        "id": "pk",
        "name": "faker.person.fullName",
        "email": "faker.internet.email",
        "role": {
          "type": "enum",
          "values": ["admin", "editor", "viewer"]
        },
        "isActive": {
          "type": "faker.datatype.boolean",
          "options": 0.8
        }
      }
    },
    {
      "table": "posts",
      "seed": 20,
      "fields": {
        "id": "pk",
        "title": "faker.lorem.sentence",
        "content": "faker.lorem.paragraph",
        "authorId": "fk:users.id"
      }
    }
  ]
}
```

### 3. Start the Server

```bash
mocklite dev
```

Output:

```
🚀 Server running at http://localhost:3000
   Try: http://localhost:3000/users
```

## 📚 Configuration Guide

### Field Types

| Type Def                          | Description                                      | Example                            |
| --------------------------------- | ------------------------------------------------ | ---------------------------------- |
| `"pk"`                            | Primary Key (Integer, Auto-increment)            | `"id": "pk"`                       |
| `"faker..."`                      | Any [Faker.js](https://fakerjs.dev/) path string | `"name": "faker.person.firstName"` |
| `"fk:<table>.<col>"`              | Foreign Key relation                             | `"userId": "fk:users.id"`          |
| `{ type: "enum", values: [...] }` | Randomly pick from values                        | `"role": { ... }`                  |

### Relationships

MockLite automatically detects relationships based on Foreign Keys (`fk:`).

- **Belongs To**: If `posts` has `authorId` pointing to `users.id`.
- **Has Many**: If `users` is referenced by `posts`.

You can query these relations using the `include` parameter.

## 📡 API Usage

### GET List

```http
GET /users
GET /posts
```

**Features:**

- **Pagination**: Use `?page=1&limit=10` (Defaults: page=1, limit=10).
- **Relationships**: `?include=posts` to embed related data.
- **Filtering**: Pass field names as query parameters (e.g., `?role=admin`).
- **Partial Search**: String fields support partial matching (e.g., `?name=manuel` finds "Manuel").

**Response Format:**

```json
{
  "data": [ ... ],
  "meta": {
    "total": 100,
    "page": 1,
    "limit": 10,
    "totalPages": 10
  }
}
```

### GET Detail

```http
GET /users/1
GET /users/1?include=posts
```

### POST Create

```http
POST /users
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com"
}
```

## 💻 Admin UI

MockLite comes with a built-in Admin Dashboard to visualize your data and server status.

### Accessing the Dashboard

When the server is running, visit:

```
http://localhost:3000/_admin
```

### Building the UI

If you are developing or modifying the UI source code (in the `ui/` directory), you need to rebuild it for the changes to take effect:

```bash
npm run ui:build
```
