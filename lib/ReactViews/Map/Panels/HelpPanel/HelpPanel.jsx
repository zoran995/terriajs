import { observer } from "mobx-react";
import PropTypes from "prop-types";
import React from "react";
import { runInAction } from "mobx";
import { withTranslation } from "react-i18next";
import { withTheme } from "styled-components";
import Icon, { StyledIcon } from "../../../../Styled/Icon";
import Spacing from "../../../../Styled/Spacing";
import Text from "../../../../Styled/Text";
import Box from "../../../../Styled/Box";
import parseCustomMarkdownToReact from "../../../Custom/parseCustomMarkdownToReact";
import HelpPanelItem from "./HelpPanelItem";
import Button, { RawButton } from "../../../../Styled/Button";

@observer
class HelpPanel extends React.Component {
  static displayName = "HelpPanel";

  static propTypes = {
    terria: PropTypes.object.isRequired,
    viewState: PropTypes.object.isRequired,
    theme: PropTypes.object,
    t: PropTypes.func.isRequired
  };

  constructor(props) {
    super(props);
  }

  render() {
    const { t } = this.props;
    const helpItems = this.props.terria.configParameters.helpContent;
    const isVisible =
      this.props.viewState.showHelpMenu &&
      this.props.viewState.topElement === "HelpPanel";
    const isExpanded = this.props.viewState.helpPanelExpanded;
    return (
      <Box
        displayInlineBlock
        backgroundColor={this.props.theme.textLight}
        styledWidth={"320px"}
        fullHeight
        onClick={() => this.props.viewState.setTopElement("HelpPanel")}
        css={`
          position: fixed;
          z-index: ${this.props.viewState.topElement === "HelpPanel"
            ? 99999
            : 110};
          transition: right 0.25s;
          transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
          right: ${isVisible ? (isExpanded ? 490 : 0) : -320}px;
        `}
      >
        <Box position="absolute" paddedRatio={3} topRight>
          <RawButton onClick={() => this.props.viewState.hideHelpPanel()}>
            <StyledIcon
              styledWidth={"16px"}
              fillColor={this.props.theme.textDark}
              opacity={"0.5"}
              glyph={Icon.GLYPHS.closeLight}
            />
          </RawButton>
        </Box>
        <Box
          centered
          paddedHorizontally={5}
          paddedVertically={17}
          displayInlineBlock
          css={`
            direction: ltr;
            min-width: 295px;
            padding-bottom: 0px;
          `}
        >
          <Text extraBold heading textDark>
            {t("helpPanel.menuPaneTitle")}
          </Text>
          <Spacing bottom={4} />
          <Text medium textDark highlightLinks>
            {parseCustomMarkdownToReact(t("helpPanel.menuPaneBody"))}
          </Text>
          <Spacing bottom={5} />
          <Box centered>
            <Button
              primary
              rounded
              styledMinWidth={"240px"}
              onClick={() => {
                runInAction(() => {
                  this.props.viewState.hideHelpPanel();
                  this.props.viewState.setTourIndex(0);
                });
              }}
              renderIcon={() => (
                <StyledIcon
                  light
                  styledWidth={"18px"}
                  glyph={Icon.GLYPHS.tour}
                />
              )}
              textProps={{
                large: true
              }}
              css={`
                ${p => p.theme.addTerriaPrimaryBtnStyles(p)}
              `}
            >
              {t("helpPanel.takeTour")}
            </Button>
          </Box>
        </Box>
        <Spacing bottom={10} />
        <Box centered displayInlineBlock fullWidth>
          <Box displayInlineBlock fullWidth>
            {helpItems && (
              <For each="item" index="i" of={helpItems}>
                <HelpPanelItem
                  key={i}
                  terria={this.props.terria}
                  viewState={this.props.viewState}
                  content={item}
                />
              </For>
            )}
          </Box>
        </Box>
      </Box>
    );
  }
}

export default withTranslation()(withTheme(HelpPanel));
