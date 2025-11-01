const INVALID = Symbol('invalid');

function createContext() {
  return {
    issues: [],
    addIssue(issue) {
      const normalized = {
        code: issue.code || 'custom',
        message: issue.message || 'Invalid input',
        path: Array.isArray(issue.path) ? issue.path : [],
      };
      this.issues.push(normalized);
    },
  };
}

class Schema {
  constructor(parser) {
    this._parser = parser;
  }

  _parse(value, ctx, path) {
    return this._parser(value, ctx, path);
  }

  safeParse(value) {
    const ctx = createContext();
    const result = this._parse(value, ctx, []);
    if (result === INVALID || ctx.issues.length > 0) {
      return { success: false, error: { issues: ctx.issues } };
    }
    return { success: true, data: result };
  }

  optional() {
    const base = this;
    return new Schema((value, ctx, path) => {
      if (value === undefined) {
        return undefined;
      }
      return base._parse(value, ctx, path);
    });
  }

  superRefine(check) {
    const base = this;
    return new Schema((value, ctx, path) => {
      const parsed = base._parse(value, ctx, path);
      if (parsed === INVALID) {
        return INVALID;
      }
      const before = ctx.issues.length;
      const issueCtx = {
        addIssue(issue) {
          const normalized = { ...issue };
          if (!normalized.path) {
            normalized.path = path;
          }
          ctx.addIssue(normalized);
        },
      };
      check(parsed, issueCtx);
      if (ctx.issues.length > before) {
        return INVALID;
      }
      return parsed;
    });
  }
}

function string() {
  return new Schema((value, ctx, path) => {
    if (typeof value !== 'string') {
      ctx.addIssue({
        code: 'invalid_type',
        message: 'Expected string',
        path,
      });
      return INVALID;
    }
    return value;
  });
}

function enumType(options) {
  const allowed = new Set(options);
  return new Schema((value, ctx, path) => {
    if (typeof value !== 'string') {
      ctx.addIssue({
        code: 'invalid_type',
        message: `Expected one of ${Array.from(allowed).join(', ')}`,
        path,
      });
      return INVALID;
    }
    if (!allowed.has(value)) {
      ctx.addIssue({
        code: 'invalid_enum_value',
        message: `Expected one of ${Array.from(allowed).join(', ')}`,
        path,
      });
      return INVALID;
    }
    return value;
  });
}

function array(schema) {
  const base = new Schema((value, ctx, path) => {
    if (!Array.isArray(value)) {
      ctx.addIssue({
        code: 'invalid_type',
        message: 'Expected array',
        path,
      });
      return INVALID;
    }
    const result = [];
    let hasError = false;
    value.forEach((item, index) => {
      const parsed = schema._parse(item, ctx, path.concat(index));
      if (parsed === INVALID) {
        hasError = true;
      } else {
        result.push(parsed);
      }
    });
    if (hasError) {
      return INVALID;
    }
    return result;
  });

  base.nonempty = function nonempty() {
    const arraySchema = new Schema((value, ctx, path) => {
      const parsed = base._parse(value, ctx, path);
      if (parsed === INVALID) {
        return INVALID;
      }
      if (parsed.length === 0) {
        ctx.addIssue({
          code: 'too_small',
          message: 'Array must contain at least one element',
          path,
        });
        return INVALID;
      }
      return parsed;
    });
    return arraySchema;
  };

  return base;
}

function object(shape) {
  return new Schema((value, ctx, path) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      ctx.addIssue({
        code: 'invalid_type',
        message: 'Expected object',
        path,
      });
      return INVALID;
    }
    const result = { ...value };
    let hasError = false;
    Object.entries(shape).forEach(([key, schema]) => {
      const parsed = schema._parse(value[key], ctx, path.concat(key));
      if (parsed === INVALID) {
        hasError = true;
      } else if (parsed === undefined && !(key in value)) {
        // do nothing for optional fields not provided
      } else {
        result[key] = parsed;
      }
    });
    if (hasError) {
      return INVALID;
    }
    return result;
  });
}

function unknown() {
  return new Schema((value) => value);
}

function preprocess(transform, schema) {
  return new Schema((value, ctx, path) => {
    const transformed = transform(value);
    return schema._parse(transformed, ctx, path);
  });
}

const z = {
  string,
  enum: enumType,
  array,
  object,
  unknown,
  preprocess,
  ZodIssueCode: {
    custom: 'custom',
  },
};

module.exports = { z };
