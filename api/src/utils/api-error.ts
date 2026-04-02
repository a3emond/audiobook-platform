export class ApiError extends Error {
  status: number;
  expose: boolean;

  constructor(status: number, message: string, expose = true) {
    super(message);
    this.status = status;
    this.expose = expose;
  }
}

/*
## Business / expected errors

```ts
throw new ApiError(404, "Book not found");
throw new ApiError(401, "Unauthorized");
```

------

## Internal errors (unexpected)

```ts
throw new Error("DB connection failed");
```

------
*/