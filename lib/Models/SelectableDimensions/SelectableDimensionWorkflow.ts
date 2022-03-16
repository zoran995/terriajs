import { PanelMenuProps } from "../../ReactViews/Compare/Panel";
import { IconProps } from "../../Styled/Icon";
import { BaseModel } from "../Definition/Model";
import { SelectableDimensionWorkflowGroup } from "./SelectableDimensions";

export default interface SelectableDimensionWorkflow {
  readonly type: string;
  name: string;
  icon: IconProps["glyph"];
  item: BaseModel;
  onClose?: () => void;
  footer?: { onClick: () => void; buttonText: string };
  menu?: PanelMenuProps;

  /** This allows up to two levels of SelectableDimensionGroup */
  selectableDimensions: SelectableDimensionWorkflowGroup[];
}
