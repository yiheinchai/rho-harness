export type JsonSchema = {
  type?: "object" | "string" | "number" | "integer" | "boolean" | "array";
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: Array<string | number | boolean>;
  additionalProperties?: boolean;
  default?: unknown;
};

export class SchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SchemaError";
  }
}

export function validateArgs(schema: JsonSchema, raw: unknown): Record<string, unknown> {
  const value = raw === undefined || raw === null ? {} : raw;
  const checked = check(schema, value, "arguments");
  if (!checked || typeof checked !== "object" || Array.isArray(checked)) {
    throw new SchemaError("Tool arguments must be an object");
  }
  return checked as Record<string, unknown>;
}

function check(schema: JsonSchema, value: unknown, path: string): unknown {
  if (value === undefined) {
    if (schema.default !== undefined) return schema.default;
    return value;
  }
  if (schema.enum && !schema.enum.includes(value as never)) {
    throw new SchemaError(`${path} must be one of ${schema.enum.join(", ")}`);
  }
  switch (schema.type) {
    case "string":
      if (typeof value !== "string") throw new SchemaError(`${path} must be a string`);
      return value;
    case "number":
      if (typeof value !== "number" || Number.isNaN(value)) throw new SchemaError(`${path} must be a number`);
      return value;
    case "integer":
      if (typeof value !== "number" || !Number.isInteger(value)) throw new SchemaError(`${path} must be an integer`);
      return value;
    case "boolean":
      if (typeof value !== "boolean") throw new SchemaError(`${path} must be a boolean`);
      return value;
    case "array": {
      if (!Array.isArray(value)) throw new SchemaError(`${path} must be an array`);
      return value.map((item, i) => (schema.items ? check(schema.items, item, `${path}[${i}]`) : item));
    }
    case "object":
    default: {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new SchemaError(`${path} must be an object`);
      }
      const input = value as Record<string, unknown>;
      const output: Record<string, unknown> = {};
      const properties = schema.properties ?? {};
      for (const key of schema.required ?? []) {
        if (input[key] === undefined) throw new SchemaError(`${path}.${key} is required`);
      }
      for (const [key, prop] of Object.entries(properties)) {
        if (input[key] === undefined && prop.default !== undefined) {
          output[key] = prop.default;
        } else if (input[key] !== undefined) {
          output[key] = check(prop, input[key], `${path}.${key}`);
        }
      }
      if (schema.additionalProperties !== false) {
        for (const [key, val] of Object.entries(input)) {
          if (!(key in properties)) output[key] = val;
        }
      }
      return output;
    }
  }
}
