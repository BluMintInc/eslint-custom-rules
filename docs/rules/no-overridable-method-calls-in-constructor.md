# Disallow calling overridable methods in constructors to prevent unexpected behavior (`@blumintinc/blumint/no-overridable-method-calls-in-constructor`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

If you call an overridable or abstract member inside a constructor, you execute subclass code before the subclass finishes initializing its fields. The subclass version can read `undefined`, mutate partially constructed state, or trigger side effects that rely on initialization that has not happened yet.

## Rule Details

- You get reports for calls or property accesses (including getters/setters) on `this` or `super` that target overridable or abstract members inside a constructor.
- Static and private members are allowed because they cannot be overridden.
- Computed property names are ignored because the rule cannot determine whether they are overridable.

When the rule fires, the message explains which member was called and why it is risky, and suggests moving the call after construction or making the member non-overridable.

### Examples of **incorrect** code for this rule:

```typescript
abstract class Vehicle {
  constructor() {
    this.displayType(); // ❌ Constructor calls overridable "displayType"
  }

  abstract getDetails(): string;

  displayType() {
    return this.getDetails();
  }
}

class Car extends Vehicle {
  private doors: number;

  constructor(doors: number) {
    super(); // Car.getDetails runs before doors is assigned
    this.doors = doors;
  }

  getDetails() {
    return `${this.doors} doors`; // doors is undefined during super()
  }
}
```

> **Note**: Examples focus on construction-order hazards, assuming `strictPropertyInitialization` is disabled or handled elsewhere.

### Examples of **correct** code for this rule:

#### Option 1: Use an initialization method

```typescript
abstract class Vehicle {
  constructor() {
    // No overridable calls here
  }

  abstract getDetails(): string;

  initialize() {
    return this.getDetails(); // Call after subclasses finish constructing
  }
}

class Car extends Vehicle {
  private doors: number;

  constructor(doors: number) {
    super();
    this.doors = doors;
  }

  getDetails() {
    return `${this.doors} doors`;
  }
}

const car = new Car(4);
car.initialize(); // ✅ Subclass state is ready
```

#### Option 2: Pass necessary data to base constructor or methods

```typescript
abstract class Vehicle {
  protected constructor(type: string, details: string) {
    this.log(type, details); // ✅ Uses constructor parameters, not overridable methods
  }

  protected log(type: string, details: string) {
    console.log(type, details);
  }
}

class Car extends Vehicle {
  constructor(doors: number) {
    const details = `${doors} doors`;
    super('car', details); // ✅ Pass data instead of invoking overridable members
  }
}
```

## When Not To Use It

- Projects that avoid inheritance entirely (e.g., prefer composition).
- Frameworks that guarantee safe constructor hooks and require these calls.
- Environments where you cannot control construction or run a post-construction initializer (e.g., DI containers or ORMs that only call the constructor).

## Further Reading

- [JavaScript: Don't call instance methods in the constructor](https://medium.com/@amandeepkochhar/javascript-dont-call-instance-methods-in-the-constructor-9a7de1a61da4)
- [TypeScript: Class Inheritance](https://www.typescriptlang.org/docs/handbook/2/classes.html#inheritance)
