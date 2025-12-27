/**
 * The default configuration for Mocklite.
 * Used when no configuration file is found or to initialize a new one.
 */
export const DEFAULT_CONFIG = {
  port: 3000,
  database: "sqlite",
  schema: [
    {
      table: "users",
      seed: 5,
      fields: {
        id: "pk",
        name: "faker.person.fullName",
        email: "faker.internet.email",
        role: {
          type: "enum",
          values: ["admin", "editor", "viewer"],
        },
        isActive: {
          type: "faker.datatype.boolean",
          options: 0.8, // 80% probability of being true
        },
      },
    },
    {
      table: "posts",
      seed: 10,
      fields: {
        id: "pk",
        title: "faker.lorem.sentence",
        content: "faker.lorem.paragraph",
        authorId: "fk:users.id",
      },
    },
  ],
};
