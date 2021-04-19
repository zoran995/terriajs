"use strict";

import { observer } from "mobx-react";
import React from "react";
import createReactClass from "create-react-class";
import { withTheme } from "styled-components";
import parseCustomMarkdownToReact from "../Custom/parseCustomMarkdownToReact";
import PropTypes from "prop-types";
import sendFeedback from "../../Models/sendFeedback";
import Styles from "./feedback-form.scss";
import Icon, { StyledIcon } from "../../Styled/Icon";
import classNames from "classnames";
import { withTranslation, Trans } from "react-i18next";
import { runInAction } from "mobx";

const FeedbackForm = observer(
  createReactClass({
    displayName: "FeedbackForm",

    propTypes: {
      theme: PropTypes.object.isRequired,
      viewState: PropTypes.object.isRequired,
      t: PropTypes.func.isRequired
    },

    getInitialState() {
      return {
        isSending: false,
        sendShareURL: true,
        name: "",
        email: "",
        comment: ""
      };
    },

    componentDidMount() {
      this.escKeyListener = e => {
        if (e.keyCode === 27) {
          this.onDismiss();
        }
      };
      window.addEventListener("keydown", this.escKeyListener, true);
    },

    componentWillUnmount() {
      // Feedback form stays mounted, but leave this in to ensure it gets cleaned up if that ever changes
      window.removeEventListener("keydown", this.escKeyListener, true);
    },

    onDismiss() {
      runInAction(() => {
        this.props.viewState.feedbackFormIsVisible = false;
      });
      this.setState(this.getInitialState());
    },

    onSubmit(evt) {
      evt.preventDefault();

      if (this.state.comment.length > 0) {
        this.setState({
          isSending: true
        });

        // submit form
        sendFeedback({
          terria: this.props.viewState.terria,
          name: this.state.name,
          email: this.state.email,
          sendShareURL: this.state.sendShareURL,
          comment: this.state.comment
        }).then(succeeded => {
          if (succeeded) {
            this.setState({
              isSending: false,
              comment: ""
            });
            runInAction(() => {
              this.props.viewState.feedbackFormIsVisible = false;
            });
          } else {
            this.setState({
              isSending: false
            });
          }
        });
      }

      return false;
    },

    handleChange(e) {
      this.setState({
        [e.target.getAttribute("name")]: e.target.value
      });
    },

    changeSendShareUrl(e) {
      this.setState({
        sendShareURL: !this.state.sendShareURL
      });
    },

    render() {
      const { t } = this.props;
      const preamble = parseCustomMarkdownToReact(
        this.props.viewState.terria.configParameters.feedbackPreamble ||
          t("feedback.feedbackPreamble")
      );
      const feedbackFormClassNames = classNames(Styles.form, {
        [Styles.isOpen]: this.props.viewState.feedbackFormIsVisible
      });
      return (
        <div className="feedback__inner">
          <div className={feedbackFormClassNames}>
            <div className={Styles.header}>
              <h4 className={Styles.title}>{t("feedback.title")}</h4>
              <button
                className={Styles.btnClose}
                onClick={this.onDismiss}
                title={t("feedback.close")}
                css={`
                  ${p => p.theme.addTerriaLightBtnStyles(p)}
                `}
              >
                <Icon glyph={Icon.GLYPHS.close} />
              </button>
            </div>
            <form onSubmit={this.onSubmit}>
              <div className={Styles.description}>{preamble}</div>
              <label className={Styles.label}>{t("feedback.yourName")}</label>
              <input
                type="text"
                name="name"
                className={Styles.field}
                value={this.state.name}
                onChange={this.handleChange}
              />
              <label className={Styles.label}>
                <Trans i18nKey="feedback.email">
                  Email address (optional)
                  <br />
                  <em>We can&#39;t follow up without it!</em>
                </Trans>
              </label>
              <input
                type="text"
                name="email"
                className={Styles.field}
                value={this.state.email}
                onChange={this.handleChange}
              />
              <label className={Styles.label}>
                {t("feedback.commentQuestion")}
              </label>
              <textarea
                className={Styles.field}
                name="comment"
                value={this.state.comment}
                onChange={this.handleChange}
              />
              <div className={Styles.shareUrl}>
                <button onClick={this.changeSendShareUrl} type="button">
                  <StyledIcon
                    fillColor={this.props.theme.colorPrimary}
                    glyph={
                      this.state.sendShareURL
                        ? Icon.GLYPHS.checkboxOn
                        : Icon.GLYPHS.checkboxOff
                    }
                  />
                  {t("feedback.shareWithDevelopers", {
                    appName: this.props.viewState.terria.appName
                  })}
                  <br />
                  <small>{t("feedback.captionText")}</small>
                </button>
              </div>
              <div className={Styles.action}>
                <button
                  type="button"
                  className={Styles.btnCancel}
                  onClick={this.onDismiss}
                  css={`
                    &:hover,
                    &:focus {
                      border: 1px solid ${p => p.theme.colorPrimary};
                      color: ${p => p.theme.colorPrimary};
                    }
                  `}
                >
                  {t("feedback.cancel")}
                </button>
                <button
                  type="submit"
                  className={Styles.btnSubmit}
                  disabled={this.state.isSending}
                  css={`
                    ${p => p.theme.addTerriaPrimaryBtnStyles(p)}
                  `}
                >
                  {this.state.isSending
                    ? t("feedback.sending")
                    : t("feedback.send")}
                </button>
              </div>
            </form>
          </div>
        </div>
      );
    }
  })
);

module.exports = withTranslation()(withTheme(FeedbackForm));
