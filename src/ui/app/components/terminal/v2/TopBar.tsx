import { Search, Command, SplitSquareVertical, Plus, Rocket } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AppHeader, HeaderButton } from '@/components/ui/AppHeader';
import { QuotaChip } from '../../ui/QuotaChip';
import { MCPStatusIndicator } from '../MCPStatusIndicator';

interface TopBarProps {
  onNewSession: () => void;
  onOpenPalette: () => void;
  onSearch: () => void;
  onSplit: () => void;
  isSplitActive?: boolean;
  hourlyQuota?: number;
  weeklyQuota?: number;
  hourlyResetTime?: string;
  weeklyResetTime?: string;
  onQuotaClick?: () => void;
}

export function TopBar({
  onNewSession,
  onOpenPalette,
  onSearch,
  onSplit,
  isSplitActive = false,
  hourlyQuota,
  weeklyQuota,
  hourlyResetTime,
  weeklyResetTime,
  onQuotaClick,
}: TopBarProps) {
  const navigate = useNavigate();

  return (
    <AppHeader
      subtitle="Session tabs, execution visibility, safe shipping"
      actions={
        <>
          {/* Quota chips - global indicator (hidden on mobile) */}
          <div className="hidden sm:flex items-center gap-2 mr-2">
            <QuotaChip
              label="5-hour"
              pct={hourlyQuota}
              resetTime={hourlyResetTime}
              onClick={onQuotaClick}
              isHourly={true}
            />
            <QuotaChip
              label="Weekly"
              pct={weeklyQuota}
              resetTime={weeklyResetTime}
              onClick={onQuotaClick}
              isHourly={false}
            />
          </div>
          {/* MCP Status Indicator */}
          <MCPStatusIndicator />
          {/* Search, Commands, Split - hidden on mobile */}
          <div className="hidden sm:flex items-center gap-2">
            <HeaderButton
              onClick={onSearch}
              icon={<Search className="h-4 w-4" />}
              label="Search"
              shortcut="Ctrl Shift F"
            />
            <HeaderButton
              onClick={onOpenPalette}
              icon={<Command className="h-4 w-4" />}
              label="Commands"
              shortcut="Ctrl K"
            />
            <HeaderButton
              onClick={() => navigate('/mission')}
              icon={<Rocket className="h-4 w-4" />}
              label="Mission"
              title="Mission Control - Unified workflow"
            />
            <HeaderButton
              onClick={onSplit}
              icon={<SplitSquareVertical className="h-4 w-4" />}
              label="Split"
              active={isSplitActive}
            />
          </div>
          {/* New button - always visible, icon only on mobile */}
          <HeaderButton
            onClick={onNewSession}
            icon={<Plus className="h-4 w-4" />}
            label="New"
            variant="primary"
          />
        </>
      }
    />
  );
}
