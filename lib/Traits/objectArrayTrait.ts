import { computed } from "mobx";
import { computedFn } from "mobx-utils";
import Result from "../Core/Result";
import TerriaError from "../Core/TerriaError";
import createStratumInstance from "../Models/createStratumInstance";
import Model, { BaseModel, ModelConstructor } from "../Models/Model";
import saveStratumToJson from "../Models/saveStratumToJson";
import StratumFromTraits from "../Models/StratumFromTraits";
import StratumOrder from "../Models/StratumOrder";
import ArrayNestedStrataMap, {
  getObjectId,
  TraitsConstructorWithRemoval
} from "./ArrayNestedStrataMap";
import ModelTraits from "./ModelTraits";
import Trait, { TraitOptions } from "./Trait";
import traitsClassToModelClass from "./traitsClassToModelClass";

export interface ObjectArrayTraitOptions<T extends ModelTraits>
  extends TraitOptions {
  type: TraitsConstructorWithRemoval<T>;
  idProperty: keyof T | "index";
  modelClass?: ModelConstructor<Model<T>>;
  /**
   * Merge array elements across strata (if merge is false, each element will only be the top-most strata's object). Default is `true`
   */
  merge?: boolean;
}

export default function objectArrayTrait<T extends ModelTraits>(
  options: ObjectArrayTraitOptions<T>
) {
  return function(target: any, propertyKey: string) {
    const constructor = target.constructor;
    if (!constructor.traits) {
      constructor.traits = {};
    }
    constructor.traits[propertyKey] = new ObjectArrayTrait(
      propertyKey,
      options
    );
  };
}

export class ObjectArrayTrait<T extends ModelTraits> extends Trait {
  readonly type: TraitsConstructorWithRemoval<T>;
  readonly idProperty: keyof T | "index";
  readonly decoratorForFlattened = computed.struct;
  readonly modelClass: ModelConstructor<Model<T>>;
  readonly merge: boolean;

  constructor(id: string, options: ObjectArrayTraitOptions<T>) {
    super(id, options);
    this.type = options.type;
    this.idProperty = options.idProperty;
    this.modelClass = options.modelClass || traitsClassToModelClass(this.type);
    this.merge = options.merge ?? true;
  }

  private readonly createObject: (
    model: BaseModel,
    objectId: string
  ) => Model<T> = computedFn((model: BaseModel, objectId: string) => {
    return new this.modelClass(
      undefined,
      model.terria,
      undefined,
      new ArrayNestedStrataMap(
        model,
        this.id,
        this.type,
        this.idProperty,
        objectId,
        this.merge
      )
    );
  });

  getValue(model: BaseModel): readonly Model<T>[] | undefined {
    const strataTopToBottom: Map<string, any> = StratumOrder.sortTopToBottom(
      model.strata
    );

    const ids = new Set<string>();
    const removedIds = new Set<string>();

    // Find the unique objects and the strata that go into each.
    for (let stratumId of strataTopToBottom.keys()) {
      const stratum = strataTopToBottom.get(stratumId);
      const objectArray = stratum[this.id];

      if (!objectArray) {
        continue;
      }

      objectArray.forEach(
        (o: StratumFromTraits<T> & { index?: number }, i: number) => {
          const id = getObjectId(this.idProperty, o, i);

          if (this.type.isRemoval !== undefined && this.type.isRemoval(o)) {
            // This ID is removed in this stratum.
            removedIds.add(id);
          } else if (removedIds.has(id)) {
            // This ID was removed by a stratum above this one, so ignore it.
            return;
          } else {
            ids.add(id);
          }
        }
      );
    }

    // Create a model instance for each unique ID. Note that `createObject` is
    // memoized so we'll get the same model for the same ID each time,
    // at least when we're in a reactive context.

    const result: Model<T>[] = [];

    ids.forEach(value => {
      result.push(this.createObject(model, value));
    });

    return result;
  }

  fromJson(
    model: BaseModel,
    stratumName: string,
    jsonValue: any
  ): Result<ReadonlyArray<StratumFromTraits<T>> | undefined> {
    // TODO: support removals

    if (!Array.isArray(jsonValue)) {
      return Result.error({
        title: "Invalid property",
        message: `Property ${
          this.id
        } is expected to be an array but instead it is of type ${typeof jsonValue}.`
      });
    }

    const errors: TerriaError[] = [];

    const resultArray = jsonValue.map(jsonElement => {
      const ResultType = this.type;
      const result: any = createStratumInstance(ResultType);

      Object.keys(jsonElement).forEach(propertyName => {
        const trait = ResultType.traits[propertyName];
        if (trait === undefined) {
          errors.push(
            new TerriaError({
              title: "Unknown property",
              message: `${propertyName} is not a valid sub-property of elements of ${this.id}.`
            })
          );
          return;
        }

        const subJsonValue = jsonElement[propertyName];
        if (subJsonValue === undefined) {
          result[propertyName] = subJsonValue;
        } else {
          result[propertyName] = trait
            .fromJson(model, stratumName, subJsonValue)
            .catchError(error => errors.push(error));
        }
      });

      return result;
    });

    return Result.return(
      resultArray,
      TerriaError.combine(
        errors,
        `Error${
          errors.length !== 1 ? "s" : ""
        } occurred while updating objectArrayTrait model "${
          model.uniqueId
        }" from JSON`
      )
    );
  }

  toJson(value: readonly StratumFromTraits<T>[] | undefined): any {
    if (value === undefined) {
      return undefined;
    }

    return value.map(element => saveStratumToJson(this.type.traits, element));
  }

  isSameType(trait: Trait): boolean {
    return (
      trait instanceof ObjectArrayTrait &&
      trait.type === this.type &&
      trait.idProperty === this.idProperty
    );
  }
}
