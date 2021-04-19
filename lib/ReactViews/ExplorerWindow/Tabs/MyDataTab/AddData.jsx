import React from "react";
import createReactClass from "create-react-class";
import PropTypes from "prop-types";
import { withTranslation, Trans } from "react-i18next";
import Icon from "../../../../Styled/Icon";
import createCatalogItemFromFileOrUrl from "../../../../Models/createCatalogItemFromFileOrUrl";
import upsertModelFromJson from "../../../../Models/upsertModelFromJson";
import addUserCatalogMember from "../../../../Models/addUserCatalogMember";
import CatalogMemberFactory from "../../../../Models/CatalogMemberFactory";
import CommonStrata from "../../../../Models/CommonStrata";
import Dropdown from "../../../Generic/Dropdown";
import FileInput from "./FileInput";
import getDataType from "../../../../Core/getDataType";
import Styles from "./add-data.scss";
import Loader from "../../../Loader";
import TerriaError from "../../../../Core/TerriaError";
import addUserFiles from "../../../../Models/addUserFiles";

// Local and remote data have different dataType options
const defaultRemoteDataTypes = getDataType().remoteDataType;
const defaultLocalDataTypes = getDataType().localDataType;

/**
 * Add data panel in modal window -> My data tab
 */
const AddData = createReactClass({
  displayName: "AddData",

  propTypes: {
    terria: PropTypes.object,
    viewState: PropTypes.object,
    resetTab: PropTypes.func,
    activeTab: PropTypes.string,
    localDataTypes: PropTypes.arrayOf(PropTypes.object),
    remoteDataTypes: PropTypes.arrayOf(PropTypes.object),
    onFileAddFinished: PropTypes.func.isRequired,
    t: PropTypes.func.isRequired
  },

  getDefaultProps() {
    return {
      remoteDataTypes: defaultRemoteDataTypes,
      localDataTypes: defaultLocalDataTypes
    };
  },

  getInitialState() {
    return {
      localDataType: this.props.localDataTypes[0], // By default select the first item (auto)
      remoteDataType: this.props.remoteDataTypes[0],
      remoteUrl: "", // By default there's no remote url
      isLoading: false
    };
  },

  selectLocalOption(option) {
    this.setState({
      localDataType: option
    });
  },

  selectRemoteOption(option) {
    this.setState({
      remoteDataType: option
    });
  },

  handleUploadFile(e) {
    this.setState({
      isLoading: true
    });
    addUserFiles(
      e.target.files,
      this.props.terria,
      this.props.viewState,
      this.state.localDataType
    ).then(addedCatalogItems => {
      if (addedCatalogItems && addedCatalogItems.length > 0) {
        this.props.onFileAddFinished(addedCatalogItems);
      }
      this.setState({
        isLoading: false
      });
      // reset active tab when file handling is done
      this.props.resetTab();
    });
  },

  handleUrl(e) {
    const url = this.state.remoteUrl;
    e.preventDefault();
    this.props.terria.analytics.logEvent("addDataUrl", url);
    this.setState({
      isLoading: true
    });
    let promise;
    if (this.state.remoteDataType.value === "auto") {
      promise = loadFile(this);
    } else {
      try {
        const newItem = upsertModelFromJson(
          CatalogMemberFactory,
          this.props.terria,
          "",
          CommonStrata.defaults,
          { type: this.state.remoteDataType.value, name: url },
          {}
        );
        newItem.setTrait(CommonStrata.user, "url", url);
        promise = newItem.loadMetadata().then(() => newItem);
      } catch (e) {
        promise = Promise.reject(e);
      }
    }
    addUserCatalogMember(this.props.terria, promise).then(addedItem => {
      if (addedItem && !(addedItem instanceof TerriaError)) {
        this.props.onFileAddFinished([addedItem]);
      }
      // FIXME: Setting state here might result in a react warning if the
      // component unmounts before the promise finishes
      this.setState({
        isLoading: false
      });
      this.props.resetTab();
    });
  },

  onRemoteUrlChange(event) {
    this.setState({
      remoteUrl: event.target.value
    });
  },

  renderPanels() {
    const { t } = this.props;
    const dropdownTheme = {
      dropdown: Styles.dropdown,
      list: Styles.dropdownList,
      isOpen: Styles.dropdownListIsOpen,
      icon: <Icon glyph={Icon.GLYPHS.opened} />
    };

    const dataTypes = this.props.localDataTypes.reduce(function(
      result,
      currentDataType
    ) {
      if (currentDataType.extensions) {
        return result.concat(
          currentDataType.extensions.map(extension => "." + extension)
        );
      } else {
        return result;
      }
    },
    []);

    return (
      <div className={Styles.tabPanels}>
        <If condition={this.props.activeTab === "local"}>
          <div className={Styles.tabHeading}>{t("addData.localAdd")}</div>
          <section className={Styles.tabPanel}>
            <label className={Styles.label}>
              <Trans i18nKey="addData.localFileType">
                <strong>Step 1:</strong> Select file type (optional)
              </Trans>
            </label>
            <Dropdown
              options={this.props.localDataTypes}
              selected={this.state.localDataType}
              selectOption={this.selectLocalOption}
              matchWidth={true}
              theme={dropdownTheme}
            />
            <label className={Styles.label}>
              <Trans i18nKey="addData.localFile">
                <strong>Step 2:</strong> Select file
              </Trans>
            </label>
            <FileInput
              accept={dataTypes.join(",")}
              onChange={this.handleUploadFile}
            />
            {this.state.isLoading && <Loader />}
          </section>
        </If>
        <If condition={this.props.activeTab === "web"}>
          <div className={Styles.tabHeading}>{t("addData.webAdd")}</div>
          <section className={Styles.tabPanel}>
            <label className={Styles.label}>
              <Trans i18nKey="addData.webFileType">
                <strong>Step 1:</strong> Select file type (optional)
              </Trans>
            </label>
            <Dropdown
              options={this.props.remoteDataTypes}
              selected={this.state.remoteDataType}
              selectOption={this.selectRemoteOption}
              matchWidth={true}
              theme={dropdownTheme}
            />
            <label className={Styles.label}>
              <Trans i18nKey="addData.webFile">
                <strong>Step 2:</strong> Enter the URL of the data file or web
                service
              </Trans>
            </label>
            <form className={Styles.urlInput}>
              <input
                value={this.state.remoteUrl}
                onChange={this.onRemoteUrlChange}
                className={Styles.urlInputTextBox}
                type="text"
                placeholder="e.g. http://data.gov.au/geoserver/wms"
              />
              <button
                type="submit"
                onClick={this.handleUrl}
                className={Styles.urlInputBtn}
              >
                {t("addData.urlInputBtn")}
              </button>
              {this.state.isLoading && <Loader />}
            </form>
          </section>
        </If>
      </div>
    );
  },

  render() {
    return <div className={Styles.inner}>{this.renderPanels()}</div>;
  }
});

/**
 * Loads a catalog item from a file.
 */
function loadFile(viewModel) {
  return createCatalogItemFromFileOrUrl(
    viewModel.props.terria,
    viewModel.props.viewState,
    viewModel.state.remoteUrl,
    viewModel.state.remoteDataType.value,
    true
  );
}

module.exports = withTranslation()(AddData);
