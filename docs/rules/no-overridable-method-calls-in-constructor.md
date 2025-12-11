# Disallow calling overridable methods in constructors to prevent unexpected behavior (`@blumintinc/blumint/no-overridable-method-calls-in-constructor`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->

This rule helps you avoid a common pitfall in object-oriented programming where an overridable method (a method in a base class that is intended to be implemented or overridden by derived classes) is called from the constructor of the base class.

## Rule Details

When a base class constructor calls an overridable method, the version of the method in the most derived class is executed. However, the constructor of this derived class will not have completed its own initialization (e.g., assigning its own instance properties) because the `super()` call (which invokes the base class constructor) must complete first. If the overridden method in the derived class relies on these uninitialized properties, it can lead to runtime errors or incorrect logic.

### Examples of **incorrect** code for this rule:

```typescript
abstract class Vehicle {
  protected vehicleType: string;

  constructor() {
    // PROBLEM: Calls overridable method 'displayType' from base constructor.
    // When 'Car' is instantiated, Car.displayType() is called before
    // Car's constructor has set 'this.numberOfDoors'.
    this.displayType();
  }

  // Abstract method, to be implemented by derived classes
  abstract getTypeSpecificDetails(): string;

  log(message: string) {
    console.log(message);
  }

  displayType() {
    // This method might be overridden, or use overridden methods like getTypeSpecificDetails
    this.log(`Vehicle Type: ${this.vehicleType}, Details: ${this.getTypeSpecificDetails()}`);
  }
}

class Car extends Vehicle {
  private numberOfDoors: number;

  constructor(doors: number) {
    super(); // Base constructor calls displayType() -> Car.displayType() or Car.getTypeSpecificDetails()
    this.numberOfDoors = doors; // Initialized AFTER super() completes
    this.vehicleType = 'Car';
  }

  getTypeSpecificDetails(): string {
    // This would be called by displayType() during super() execution.
    // If it relied on 'this.numberOfDoors', it would be undefined.
    return `${this.numberOfDoors} doors`; // 'this.numberOfDoors' is undefined here if called from base constructor
  }
}

const myCar = new Car(4); // Leads to error or incorrect log because numberOfDoors is undefined during initial displayType call
```

> **Note**: Examples focus on construction-order hazards, assuming `strictPropertyInitialization` is disabled or handled elsewhere.

### Examples of **correct** code for this rule:

#### Option 1: Use an initialization method

```typescript
abstract class Vehicle {
  protected vehicleType: string;

  constructor() {
    // Base constructor does not call overridable methods.
  }

  // Call this method after derived class is fully constructed.
  public initialize() {
    this.displayType();
  }

  abstract getTypeSpecificDetails(): string;

  log(message: string) {
    console.log(message);
  }

  displayType() {
    this.log(`Vehicle Type: ${this.vehicleType}, Details: ${this.getTypeSpecificDetails()}`);
  }
}

class Car extends Vehicle {
  private numberOfDoors: number;

  constructor(doors: number) {
    super();
    this.numberOfDoors = doors;
    this.vehicleType = 'Car';
  }

  getTypeSpecificDetails(): string {
    return `${this.numberOfDoors} doors`;
  }
}

const myCar = new Car(4);
myCar.initialize(); // Works correctly as Car is fully initialized.
```

#### Option 2: Pass necessary data to base constructor or methods

```typescript
abstract class Vehicle {
  protected vehicleType: string;

  constructor(vehicleType: string, typeSpecificDetails: string) {
    this.vehicleType = vehicleType;
    // Display logic uses passed-in, already resolved data, not overridable methods.
    this.log(`Vehicle Type: ${this.vehicleType}, Details: ${typeSpecificDetails}`);
  }

  log(message: string) {
    console.log(message);
  }
}

class Car extends Vehicle {
  private numberOfDoors: number;

  constructor(doors: number) {
    // Derived class prepares its specific details before calling super.
    const details = `${doors} doors`;
    super('Car', details); // Pass all necessary info to base
    this.numberOfDoors = doors;
  }
}

const myCar = new Car(4); // Works correctly.
```

## When Not To Use It

If your codebase doesn't use class inheritance or if you're working with a framework that requires calling methods in constructors, you might want to disable this rule.

## Further Reading

- [JavaScript: Don't call instance methods in the constructor](https://medium.com/@amandeepkochhar/javascript-dont-call-instance-methods-in-the-constructor-9a7de1a61da4)
- [TypeScript: Class Inheritance](https://www.typescriptlang.org/docs/handbook/2/classes.html#inheritance)
