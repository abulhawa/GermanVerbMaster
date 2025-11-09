import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import type { Word } from '@shared';

import {
  ADMIN_PAGE_IDS,
  APPROVAL_FILTER_OPTIONS,
  COMPLETE_FILTER_OPTIONS,
  LEVEL_OPTIONS,
  PER_PAGE_OPTIONS,
  POS_OPTIONS,
  type ApprovalFilter,
  type CompleteFilter,
} from '../constants';

interface AdminWordFiltersProps {
  adminToken: string;
  search: string;
  pos: Word['pos'] | 'ALL';
  level: string;
  approvalFilter: ApprovalFilter;
  completeFilter: CompleteFilter;
  perPage: number;
  onAdminTokenChange: (value: string) => void;
  onSearchChange: (value: string) => void;
  onPosChange: (value: Word['pos'] | 'ALL') => void;
  onLevelChange: (value: string) => void;
  onApprovalFilterChange: (value: ApprovalFilter) => void;
  onCompleteFilterChange: (value: CompleteFilter) => void;
  onPerPageChange: (value: number) => void;
}

export function AdminWordFilters({
  adminToken,
  search,
  pos,
  level,
  approvalFilter,
  completeFilter,
  perPage,
  onAdminTokenChange,
  onSearchChange,
  onPosChange,
  onLevelChange,
  onApprovalFilterChange,
  onCompleteFilterChange,
  onPerPageChange,
}: AdminWordFiltersProps) {
  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2" id={ADMIN_PAGE_IDS.tokenInput}>
          <Label htmlFor="admin-token">Admin token (if configured)</Label>
          <Input
            id="admin-token"
            type="password"
            value={adminToken}
            onChange={(event) => onAdminTokenChange(event.target.value)}
            placeholder="Enter x-admin-token"
          />
        </div>
        <div className="space-y-2" id={ADMIN_PAGE_IDS.searchInput}>
          <Label htmlFor="search">Search</Label>
          <Input
            id="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search by lemma or English"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-5" id={ADMIN_PAGE_IDS.filterControls}>
        <div className="space-y-2">
          <Label>Part of speech</Label>
          <Select value={pos} onValueChange={(value) => onPosChange(value as Word['pos'] | 'ALL')}>
            <SelectTrigger>
              <SelectValue placeholder="POS" />
            </SelectTrigger>
            <SelectContent>
              {POS_OPTIONS.map((option) => (
                <SelectItem key={option.value || 'all'} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Level</Label>
          <Select value={level} onValueChange={onLevelChange}>
            <SelectTrigger>
              <SelectValue placeholder="Level" />
            </SelectTrigger>
            <SelectContent>
              {LEVEL_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Approval status</Label>
          <Select value={approvalFilter} onValueChange={(value) => onApprovalFilterChange(value as ApprovalFilter)}>
            <SelectTrigger>
              <SelectValue placeholder="Approval" />
            </SelectTrigger>
            <SelectContent>
              {APPROVAL_FILTER_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Completeness</Label>
          <Select value={completeFilter} onValueChange={(value) => onCompleteFilterChange(value as CompleteFilter)}>
            <SelectTrigger>
              <SelectValue placeholder="Completeness" />
            </SelectTrigger>
            <SelectContent>
              {COMPLETE_FILTER_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Rows per page</Label>
          <Select value={String(perPage)} onValueChange={(value) => onPerPageChange(Number(value))}>
            <SelectTrigger>
              <SelectValue placeholder="Per page" />
            </SelectTrigger>
            <SelectContent>
              {PER_PAGE_OPTIONS.map((option) => (
                <SelectItem key={option} value={String(option)}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </>
  );
}
