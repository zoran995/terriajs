import createReactClass from "create-react-class";
import { runInAction } from "mobx";
import { observer } from "mobx-react";
import PropTypes from "prop-types";
import React from "react";
import { withTranslation } from "react-i18next";
import defined from "terriajs-cesium/Source/Core/defined";
import addedByUser from "../../Core/addedByUser";
import getPath from "../../Core/getPath";
import addToWorkbench from "../../Models/addToWorkbench";
import raiseErrorOnRejectedPromise from "../../Models/raiseErrorOnRejectedPromise";
import removeUserAddedData from "../../Models/removeUserAddedData";
import CatalogItem from "./CatalogItem";

// Individual dataset
export const DataCatalogItem = observer(
  createReactClass({
    displayName: "DataCatalogItem",

    propTypes: {
      item: PropTypes.object.isRequired,
      viewState: PropTypes.object.isRequired,
      overrideState: PropTypes.string,
      onActionButtonClicked: PropTypes.func,
      removable: PropTypes.bool,
      terria: PropTypes.object,
      t: PropTypes.func.isRequired
    },

    onBtnClicked(event) {
      runInAction(() => {
        if (this.props.onActionButtonClicked) {
          this.props.onActionButtonClicked(this.props.item);
          return;
        }

        if (defined(this.props.viewState.storyShown)) {
          this.props.viewState.storyShown = false;
        }

        if (
          defined(this.props.item.invoke) ||
          this.props.viewState.useSmallScreenInterface
        ) {
          this.setPreviewedItem();
        } else {
          this.toggleEnable(event);
        }
      });
    },

    onTrashClicked() {
      removeUserAddedData(this.props.terria, this.props.item);
    },

    toggleEnable(event) {
      runInAction(() => {
        const keepCatalogOpen = event.shiftKey || event.ctrlKey;
        const toAdd = !this.props.terria.workbench.contains(this.props.item);

        if (toAdd) {
          this.props.terria.timelineStack.addToTop(this.props.item);
        } else {
          this.props.terria.timelineStack.remove(this.props.item);
        }

        const addPromise = addToWorkbench(
          this.props.terria.workbench,
          this.props.item,
          toAdd
        ).then(() => {
          if (
            this.props.terria.workbench.contains(this.props.item) &&
            !keepCatalogOpen
          ) {
            this.props.viewState.closeCatalog();
            this.props.terria.analytics?.logEvent(
              // eslint-disable-next-line i18next/no-literal-string
              "dataSource",
              // eslint-disable-next-line i18next/no-literal-string
              toAdd ? "addFromCatalogue" : "removeFromCatalogue",
              getPath(this.props.item)
            );
          }
        });

        raiseErrorOnRejectedPromise(this.props.terria, addPromise);
      });
    },

    setPreviewedItem() {
      // raiseErrorOnRejectedPromise(this.props.item.terria, this.props.item.load());
      if (this.props.item.loadMetadata) {
        runInAction(() => {
          this.props.item.loadMetadata();
        });
      }
      if (this.props.item.loadReference) {
        this.props.item.loadReference();
      }
      this.props.viewState.viewCatalogMember(this.props.item);
      // mobile switch to nowvewing
      this.props.viewState.switchMobileView(
        this.props.viewState.mobileViewOptions.preview
      );
    },

    isSelected() {
      return addedByUser(this.props.item)
        ? this.props.viewState.userDataPreviewedItem === this.props.item
        : this.props.viewState.previewedItem === this.props.item;
    },

    render() {
      const item = this.props.item;
      const { t } = this.props;
      const STATE_TO_TITLE = {
        loading: t("catalogItem.loading"),
        remove: t("catalogItem.removeFromMap"),
        add: t("catalogItem.add"),
        trash: t("catalogItem.trash")
      };
      return (
        <CatalogItem
          onTextClick={this.setPreviewedItem}
          selected={this.isSelected()}
          text={item.nameInCatalog}
          isPrivate={item.isPrivate}
          title={getPath(item, " -> ")}
          btnState={this.getState()}
          onBtnClick={this.onBtnClicked}
          // All things are "removable" - meaning add and remove from workbench,
          //    but only user data is "trashable"
          trashable={this.props.removable}
          onTrashClick={
            this.props.removable
              ? () => {
                  this.onTrashClicked();
                }
              : undefined
          }
          titleOverrides={STATE_TO_TITLE}
        />
      );
    },

    getState() {
      if (this.props.overrideState) {
        return this.props.overrideState;
      } else if (this.props.item.isLoading) {
        // eslint-disable-next-line i18next/no-literal-string
        return "loading";
      } else if (this.props.viewState.useSmallScreenInterface) {
        // eslint-disable-next-line i18next/no-literal-string
        return "preview";
      } else if (this.props.item.terria.workbench.contains(this.props.item)) {
        // eslint-disable-next-line i18next/no-literal-string
        return "remove";
      } else if (!defined(this.props.item.invoke)) {
        // eslint-disable-next-line i18next/no-literal-string
        return "add";
      } else {
        // eslint-disable-next-line i18next/no-literal-string
        return "stats";
      }
    }
  })
);

export default withTranslation()(DataCatalogItem);
