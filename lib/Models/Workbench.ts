import i18next from "i18next";
import { action, computed, observable } from "mobx";
import filterOutUndefined from "../Core/filterOutUndefined";
import TerriaError from "../Core/TerriaError";
import CatalogMemberMixin from "../ModelMixins/CatalogMemberMixin";
import ChartableMixin from "../ModelMixins/ChartableMixin";
import GroupMixin from "../ModelMixins/GroupMixin";
import MappableMixin from "../ModelMixins/MappableMixin";
import ReferenceMixin from "../ModelMixins/ReferenceMixin";
import TimeFilterMixin from "../ModelMixins/TimeFilterMixin";
import CommonStrata from "../Models/CommonStrata";
import LayerOrderingTraits from "../Traits/LayerOrderingTraits";
import hasTraits from "./hasTraits";
import { BaseModel } from "./Model";

const keepOnTop = (model: BaseModel) =>
  hasTraits(model, LayerOrderingTraits, "keepOnTop") && model.keepOnTop;
const supportsReordering = (model: BaseModel) =>
  hasTraits(model, LayerOrderingTraits, "supportsReordering") &&
  model.supportsReordering;

export default class Workbench {
  private readonly _items = observable.array<BaseModel>();

  /**
   * Gets or sets the list of items on the workbench.
   */
  @computed
  get items(): readonly BaseModel[] {
    return this._items.map(dereferenceModel);
  }
  set items(items: readonly BaseModel[]) {
    this._items.spliceWithArray(0, this._items.length, items.slice());
  }

  /**
   * Gets the unique IDs of the items in the workbench.
   */
  @computed
  get itemIds(): readonly string[] {
    return filterOutUndefined(this._items.map(item => item.uniqueId));
  }

  /**
   * Gets the unique IDs of the items in the workbench.
   */
  @computed
  get shouldExpandAll(): boolean {
    return this._items.every(item => !(<any>item).isOpenInWorkbench);
  }

  /**
   * Checks if the workbench contains time-based WMS
   */
  @computed
  get hasTimeWMS(): boolean {
    return this._items.some(
      item =>
        item.type === "wms" &&
        TimeFilterMixin.isMixedInto(item) &&
        item.discreteTimesAsSortedJulianDates?.length
    );
  }

  /**
   * Removes a model or its dereferenced equivalent from the workbench.
   * @param item The model.
   */
  @action
  remove(item: BaseModel) {
    const index = this.indexOf(item);
    if (index >= 0) {
      this._items.splice(index, 1);
    }
  }

  /**
   * Removes all models from the workbench.
   */
  @action
  removeAll() {
    this._items.clear();
  }

  /**
   * Collapses all models from the workbench.
   */
  @action
  collapseAll() {
    this._items.map(item => {
      item.setTrait(CommonStrata.user, "isOpenInWorkbench", false);
    });
  }

  /**
   * Expands all models from the workbench.
   */
  @action
  expandAll() {
    this._items.map(item => {
      item.setTrait(CommonStrata.user, "isOpenInWorkbench", true);
    });
  }

  /**
   * Adds an item to the workbench. If the item is already present, this method does nothing.
   * Note that the model's dereferenced equivalent may appear in the {@link Workbench#items} list
   * rather than the model itself.
   * @param item The model to add.
   */
  @action
  private insertItem(item: BaseModel, index: number = 0) {
    if (this.contains(item)) {
      return;
    }

    const targetItem: BaseModel = dereferenceModel(item);

    // Keep reorderable data sources (e.g.: imagery layers) below non-orderable ones (e.g.: GeoJSON).
    if (supportsReordering(targetItem)) {
      while (
        index < this.items.length &&
        !supportsReordering(this.items[index])
      ) {
        ++index;
      }
    } else {
      while (
        index > 0 &&
        this.items.length > 0 &&
        supportsReordering(this.items[index - 1])
      ) {
        --index;
      }
    }

    if (!keepOnTop(targetItem)) {
      while (
        index < this.items.length &&
        keepOnTop(this.items[index]) &&
        supportsReordering(this.items[index]) === supportsReordering(targetItem)
      ) {
        ++index;
      }
    } else {
      while (
        index > 0 &&
        this.items.length > 0 &&
        !keepOnTop(this.items[index - 1]) &&
        supportsReordering(this.items[index - 1]) ===
          supportsReordering(targetItem)
      ) {
        --index;
      }
    }

    // Make sure the reference, rather than the target, is added to the items list.
    const referenceItem = item.sourceReference ? item.sourceReference : item;
    this._items.splice(index, 0, referenceItem);
  }

  /**
   * Adds or removes a model to/from the workbench. If the model is a reference,
   * it will also be dereferenced. If, after dereferencing, the item turns out not to
   * be {@link AsyncMappableMixin} or {@link ChartableMixin} but it is a {@link GroupMixin}, it will
   * be removed from the workbench. If it is mappable, `loadMapItems` will be called.
   *
   * @param item The item to add to or remove from the workbench.
   */
  public async add(item: BaseModel | BaseModel[]): Promise<void> {
    if (Array.isArray(item)) {
      await Promise.all(item.reverse().map(i => this.add(i)));
      return;
    }

    this.insertItem(item);

    try {
      if (ReferenceMixin.is(item)) {
        await item.loadReference();

        const target = item.target;
        if (
          target &&
          GroupMixin.isMixedInto(target) &&
          !MappableMixin.isMixedInto(target) &&
          !ChartableMixin.isMixedInto(target)
        ) {
          this.remove(item);
        } else if (target) {
          return this.add(target);
        }
      }

      if (CatalogMemberMixin.isMixedInto(item)) await item.loadMetadata();

      if (MappableMixin.isMixedInto(item)) {
        await item.loadMapItems();
      }
    } catch (e) {
      this.remove(item);
      throw e instanceof TerriaError
        ? e
        : new TerriaError({
            title: i18next.t("workbench.addItemErrorTitle"),
            message: i18next.t("workbench.addItemErrorMessage")
          });
    }
  }

  /**
   * Determines if a given model or its dereferenced equivalent exists in the workbench list.
   * @param item The model.
   * @returns True if the model or its dereferenced equivalent exists on the workbench; otherwise, false.
   */
  contains(item: BaseModel) {
    return this.indexOf(item) >= 0;
  }

  /**
   * Returns the index of a given model or its dereferenced equivalent in the workbench list.
   * @param item The model.
   * @returns The index of the model or its dereferenced equivalent, or -1 if neither exist on the workbench.
   */
  indexOf(item: BaseModel) {
    return this.items.findIndex(
      model =>
        model === item || dereferenceModel(model) === dereferenceModel(item)
    );
  }

  /**
   * Used to re-order the workbench list.
   * @param item The model to be moved.
   * @param newIndex The new index to shift the model to.
   */
  @action
  moveItemToIndex(item: BaseModel, newIndex: number) {
    if (!this.contains(item)) {
      return;
    }
    this.remove(item);
    this.insertItem(item, newIndex);
  }
}

function dereferenceModel(model: BaseModel): BaseModel {
  if (ReferenceMixin.is(model) && model.target !== undefined) {
    return model.target;
  }
  return model;
}
