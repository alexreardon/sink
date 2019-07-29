# Learning typescript

## Resources

### Docs 📖

- [Official docs](https://www.typescriptlang.org/docs/handbook/basic-types.html)
- [React typescript cheetsheat](https://github.com/typescript-cheatsheets/react-typescript-cheatsheet)
- [Another (great) typescript cheatsheet](https://github.com/piotrwitek/react-redux-typescript-guide#react---type-definitions-cheatsheet)
- [Another (small) React typescript cheetsheat](https://github.com/basarat/typescript-book/blob/master/docs/jsx/react.md)
- [some opinions about usage by @sidresorhus](https://github.com/sindresorhus/typescript-definition-style-guide)

### Courses 📺

- TODO

## wut moments

- [Ambient enums](https://www.typescriptlang.org/docs/handbook/enums.html#ambient-enums)
- [Compile time enums](https://www.typescriptlang.org/docs/handbook/enums.html#enums-at-compile-time): `type LogLevelStrings = keyof typeof LogLevel;`
- "By default null and undefined are subtypes of all other types. That means you can assign null and undefined to something like number."
  However, when using the --strictNullChecks flag, null and undefined are only assignable to any and their respective types

## Assorted grammar

- Intersection: `T = A & B` (And) `T = {...A, ...B}`

Watch out for naming conflicts between `A` and `B` [See example](https://www.typescriptlang.org/play/#code/C4TwDgpgBAYglgJwM7CgXigbwFBSgOwEMBbCALihQTnwHMAabAX221EigGUIBjAe3wATdFlwES5AgFdiAIwgJGLNuGgBJfMAVJewOAJHxkqAGRdeAwQG5W-fCigA3QgBspkjVuS79+ETjwiUgoAVmZsIA)

> See custom helper `Combine<A,B>` below

- Union: `T = A | B` (Or). Can only access shared properties that are common to all types. `T` can only be one option in the set
- post**fix**: `!` removes `null` and `undefined` from the type identifier (It is a clue to the compiler that it cannot be null). It is not ideal, but useful
- `const` assertion: `as const` makes `T` `readonly`. (`Readonly<T>` helper)
- First argument to a function can be `this` which controls the `this` context of a function. Eg `function foo(this: any, arg1: number)`
- Use `unknown` rather than `any` where possible as it is stricter
- `as` cast type (unprotected)
- `in` operator: `[K in O]` `[Key in Object]`. Used for mapped types (see below)
- `+` or `-`: or `readonly` or `?`: addition and subtraction and readonly and optional modifiers (see below)
- `is`: type guard for function return types. Used in type guard functions (see below)

## Utilities

- Partial: `Partial<T>` all properties of `T` are optional
- Required: `Required<T>` all properties in `T` become required
- Readonly: `Readonly<T>` all properties readonly (can also use `as const`)
- ReadonlyArray: `ReadonlyArray<T>` array of type `T` but cannot use any arrange mutation techniques such as .push(), .splice() and so on
- Record: `Record<Keys,T>` object where key `Keys` maps to type `T` (useful to build up an `object` from known `keys`)

```js
type PageInfo = {
  title: string,
};
type PageTitles = 'about' | 'contact' | 'home';

const pages: Record<PageTitles, PageInfo> = {
  about: { title: 'about' },
  contact: { title: 'contact' },
  home: { title: 'home' },
};
```

- NonNullable: `NonNullable<T>` type `T` but cannot include `null` or `undefined` if they were a part of `T`
- ReturnType: `ReturnType<T>` whatever the return type of `T` is. Most relevant when `T` is a function
- InstanceType: `InstanceType<T>`type of a class (not totally true, but classes suck)
- ThisType: `ThisType<T>` used to type the `this` context of object methods
- Pick: `type X = Pick<T,K>`: create type `X` which takes `K` properties from `T` (allowlist)
- Omit: `type X = Omit<T,K>`: create type `X` from `T` without properties `K` (denylist)
- Exclude: `type X = Exclude<T,U>`: create type `X` by removing properties from `T` that are compatible with `U` (denylist)

```js
type X = Exclude<'a' | 'b', 'a'>; // "b"
```

- Extract: `type X = Extract<T,U>`: create type `X` with all properties from `T` that are compatible with `U` (allowlist)

### Useful custom helpers

- `type Nullable<T> = T | null;`
- `type Writable<T>`: make all `readonly` properties in `T` writable 🤘

```js
// What sort of strange syntax is this!? Oh well;
type Writable<T> = {
    -readonly [K in keyof T]: T[K]
}

// { a: string, b: number }
type A = Writable<{
    readonly a: string;
    readonly b: number
}>;
```

- `type Combine<A, B>`

A smarter intersection type `(A & B)` which is closer to `{...A, ...B}`. Properties from `B` overwrite properties in `A`

```ts
type A = {
  fromA: number;
  shared: number;
};

type B = {
  fromB: string;
  shared: string;
};

// Similiar to T = {...A, ...B}
type Combine<First, Second> =
  // 1. Remove all overlapping types from First
  // 2. Add properties from Second
  Omit<First, keyof Second> & Second;

const value: Combine<A, B> = {
  fromA: 5,
  fromB: 'hey',
  // type from A has been overwritten by B
  shared: 'hi',
};
```

## Type predicates

Using strategies to narrow down a type (eg narrowing down a _union_ type `(A | B) => A`)

Using `is`. Narrows down type of `pet` to `Fish`

```js
function isFish(pet: Fish | Bird): pet is Fish {
    // need to do a cast to avoid a type error
    return (pet as Fish).swim !== undefined;
}

if (isFish(pet)) {
    pet.swim();
} else {
  // typescript knows pet is a Bird
}
```

Using `in`

```js
function move(pet: Fish | Bird) {
  if ('swim' in pet) {
    return pet.swim();
  }
  return pet.fly();
}
```

Using `typeof`

```js
function isNumber(x: any): x is number {
    return typeof x === "number";
}

if(isNumber(value)) {

}

// inline
if(typeof value === "number") {
  // know value is a number
}
```

Can also use `instanceof` for classes

## Nullable

`type Nullable<T> = T | null;`

postfix: `!` removes `null` and `undefined` from the type identifier
It is a clue to the compiler that it cannot be null

```js
type Nullable<T> = T | null;

const value: Nullable<string> = null;

const assigned: string = value!;
```

## Generics<T>

Think of `T` (type) as a variable. Sometimes `T` can be inferred, sometimes it needs to be provided

```ts
function identity<T>(x: T): T {
  return x;
}

// T is set to `5`
const value = identity(5);

// T is set to `number`
const value = identity<number>(5);
```

### Keywords for generics

- extends: `<T extends U>`. It is a constraint on a generic `T` (This is `<T: U>` in flow) (I think `compliesWith` would have been a nicer name)
- keyof: `keyof T`: type includes all key values of `T` (union of all keys)
- Combined: `K extends keyof T`: `K` (generic) must be a key of `T` (generic)

## Mapped types

Take an existing type and map over it to created a new one

Operator: `[K in O]` `[Key in Object]`

```js
type Keys = 'option1' | 'option2';
type Flags = { [K in Keys]: boolean };
```

```js
// Implementing our own Readonly<T>
type Readonly<T> = {
    readonly [P in keyof T]: T[P];
}

// Implementing our own Partial<T>
type Partial<T> = {
    [P in keyof T]?: T[P];
}

// partial with a new property
type WithLength<T> = {
  [P in keyof T]?: T[P];
} & { length: number }
```

```js
// Specific to one type
type NullablePerson = { [P in keyof Person]: Person[P] | null }
type PartialPerson = { [P in keyof Person]?: Person[P] }
// More useful with generics
type Nullable<T> = { [P in keyof T]: T[P] | null }
type Partial<T> = { [P in keyof T]?: T[P] }
```

### Conditional types

`type X = T extends U ? X : Y`
type X is X if T extends U, otherwise it is Y

```js
type Diff<T, U> = T extends U ? never : T;  // Remove types from T that are assignable to U
type Filter<T, U> = T extends U ? T : never;  // Remove types from T that are not assignable to U

type T30 = Diff<"a" | "b" | "c" | "d", "a" | "c" | "f">;  // "b" | "d"
type T31 = Filter<"a" | "b" | "c" | "d", "a" | "c" | "f">;  // "a" | "c"
```
