export { TabBar } from './TabBar';
export { Tab } from './Tab';
export type { TabData, ContextMenuPosition } from './Tab';
// New design system components
export { BrandMark } from './BrandMark';
export { BrandLogo } from './BrandLogo';
export { ProviderBadge } from './ProviderBadge';
export { StatusDot } from './StatusDot';
export type { StatusDotState } from './StatusDot';
export { Button } from './Button';
export type { ButtonVariant, ButtonSize } from './Button';
export { ProgressBar } from './ProgressBar';
export { Tooltip } from './Tooltip';
export type { TooltipPlacement } from './Tooltip';
export { Toast } from './Toast';
export type { ToastData, ToastType } from './Toast';
export { ToastContainer, dispatchToast } from './ToastContainer';
export { NewSessionDialog } from './NewSessionDialog';
export { SettingsDialog } from './SettingsDialog';
export { BudgetPanel } from './BudgetPanel';
export type { BudgetPanelProps } from './BudgetPanel';
export { BudgetSettings } from './BudgetSettings';
export type { BudgetConfig } from './BudgetSettings';
export { ContextMenu } from './ContextMenu';
export { ConfirmDialog } from './ConfirmDialog';
export { CheckpointDialog } from './CheckpointDialog';
export { EmptyState } from './EmptyState';
export { FuelStatusIndicator } from './FuelStatusIndicator';
export type { FuelStatusIndicatorProps } from './FuelStatusIndicator';
export { FuelGaugeBar } from './FuelGaugeBar';
export { ToolsDropdown } from './ToolsDropdown';
export { FuelTooltip } from './FuelTooltip';
// Re-export quota types from shared
export type { ClaudeUsageQuota, BurnRateData, QuotaBucket } from '../../../shared/ipc-types';
// Wave 01 — design overhaul primitives
export { SurfaceCard } from './SurfaceCard';
export { StatusPill } from './StatusPill';
export type { StatusPillVariant } from './StatusPill';
// Wave 04 — dialogs, toasts, banners
export { InlineBanner } from './InlineBanner';
export type { InlineBannerProps, InlineBannerSeverity, InlineBannerAction } from './InlineBanner';
export { FieldError } from './FieldError';
export type { FieldErrorProps } from './FieldError';
// Wave 02 — panel primitives
export { PanelShell } from './PanelShell';
export type { PanelShellProps } from './PanelShell';
export { PanelSection } from './PanelSection';
export type { PanelSectionProps } from './PanelSection';
export { PanelEmpty } from './PanelEmpty';
export type { PanelEmptyProps } from './PanelEmpty';
export { PanelLoading } from './PanelLoading';
export type { PanelLoadingProps } from './PanelLoading';
export { PanelError } from './PanelError';
export type { PanelErrorProps } from './PanelError';
