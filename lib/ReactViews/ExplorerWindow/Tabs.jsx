import React from "react";
import createReactClass from "create-react-class";
import PropTypes from "prop-types";
import classNames from "classnames";

import DataCatalogTab from "./Tabs/DataCatalogTab";
import MyDataTab from "./Tabs/MyDataTab/MyDataTab";
import defined from "terriajs-cesium/Source/Core/defined";
import { withTranslation } from "react-i18next";

import Styles from "./tabs.scss";
import { observer } from "mobx-react";
import { runInAction } from "mobx";
import Mappable from "../../Models/Mappable";

const Tabs = observer(
  createReactClass({
    displayName: "Tabs",

    propTypes: {
      terria: PropTypes.object.isRequired,
      viewState: PropTypes.object.isRequired,
      tabs: PropTypes.array,
      t: PropTypes.func.isRequired
    },

    onFileAddFinished(files) {
      const file = files.find(f => Mappable.is(f));
      if (file) {
        file
          .loadMapItems()
          .then(() => this.props.terria.currentViewer.zoomTo(file, 1));
        this.props.viewState.viewCatalogMember(file);
      }
      this.props.viewState.myDataIsUploadView = false;
    },

    getTabs() {
      const { t } = this.props;
      // This can be passed in as prop
      if (this.props.tabs) {
        return this.props.tabs;
      }

      const myDataTab = {
        // eslint-disable-next-line i18next/no-literal-string
        title: "my-data",
        name: t("addData.myData"),
        // eslint-disable-next-line i18next/no-literal-string
        category: "my-data",
        panel: (
          <MyDataTab
            terria={this.props.terria}
            viewState={this.props.viewState}
            onFileAddFinished={files => this.onFileAddFinished(files)}
          />
        )
      };

      if (this.props.terria.configParameters.tabbedCatalog) {
        return [].concat(
          this.props.terria.catalog.group.memberModels
            .filter(
              member => member !== this.props.terria.catalog.userAddedDataGroup
            )
            .map((member, i) => ({
              name: member.nameInCatalog,
              // eslint-disable-next-line i18next/no-literal-string
              title: `data-catalog-${member.name}`,
              // eslint-disable-next-line i18next/no-literal-string
              category: "data-catalog",
              idInCategory: member.name,
              panel: (
                <DataCatalogTab
                  terria={this.props.terria}
                  viewState={this.props.viewState}
                  items={member.memberModels || [member]}
                  searchPlaceholder={t("addData.searchPlaceholderWhole")}
                />
              )
            })),
          [myDataTab]
        );
      } else {
        return [
          {
            name: t("addData.dataCatalogue"),
            // eslint-disable-next-line i18next/no-literal-string
            title: "data-catalog",
            // eslint-disable-next-line i18next/no-literal-string
            category: "data-catalog",
            panel: (
              <DataCatalogTab
                terria={this.props.terria}
                viewState={this.props.viewState}
                items={this.props.terria.catalog.group.memberModels}
                searchPlaceholder={t("addData.searchPlaceholder")}
              />
            )
          },
          myDataTab
        ];
      }
    },

    activateTab(category, idInCategory) {
      runInAction(() => {
        this.props.viewState.activeTabCategory = category;
        if (this.props.terria.configParameters.tabbedCatalog) {
          this.props.viewState.activeTabIdInCategory = idInCategory;
          if (category === "data-catalog") {
            const member = this.props.terria.catalog.group.memberModels.filter(
              m => m.name === idInCategory
            )[0];
            // If member was found and member can be opened, open it (causes CkanCatalogGroups to fetch etc.)
            if (defined(member)) {
              if (member.toggleOpen) {
                member.isOpen = true;
              }
              this.props.viewState.previewedItem = member;
            }
          }
        }
      });
    },

    render() {
      const tabs = this.getTabs();
      const sameCategory = tabs.filter(
        t => t.category === this.props.viewState.activeTabCategory
      );
      const currentTab =
        sameCategory.filter(
          t => t.idInCategory === this.props.viewState.activeTabIdInCategory
        )[0] ||
        sameCategory[0] ||
        tabs[0];

      return (
        <div className={Styles.tabs}>
          <ul className={Styles.tabList} role="tablist">
            <For each="item" index="i" of={tabs}>
              <li
                key={i}
                id={"tablist--" + item.title}
                className={Styles.tabListItem}
                role="tab"
                aria-controls={"panel--" + item.title}
                aria-selected={item === currentTab}
              >
                <button
                  type="button"
                  onClick={this.activateTab.bind(
                    this,
                    item.category,
                    item.idInCategory
                  )}
                  className={classNames(Styles.btnTab, {
                    [Styles.btnSelected]: item === currentTab
                  })}
                >
                  {item.name}
                </button>
              </li>
            </For>
          </ul>

          <section
            key={currentTab.title}
            id={"panel--" + currentTab.title}
            className={classNames(Styles.tabPanel, Styles.isActive)}
            aria-labelledby={"tablist--" + currentTab.title}
            role="tabpanel"
            tabIndex="0"
          >
            <div className={Styles.panelContent}>{currentTab.panel}</div>
          </section>
        </div>
      );
    }
  })
);

module.exports = withTranslation()(Tabs);
